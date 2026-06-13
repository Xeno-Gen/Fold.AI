import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getUsage } from '../user/manager';
import { ctrlState } from '../Ctrl/state';

export const chatsRouter = Router();
const DATA_DIR = path.join(__dirname, '../../data/users');

function getChatsDir(userToken: string): string {
    return path.join(DATA_DIR, userToken, 'chats');
}

function getIndexPath(userToken: string): string {
    return path.join(getChatsDir(userToken), '_index.json');
}

function getChatFilePath(userToken: string, id: number): string {
    return path.join(getChatsDir(userToken), id + '.json');
}

function generateToken(): string {
    return crypto.randomBytes(12).toString('base64url').substring(0, 16);
}

// 读取索引（仅元数据），自动迁移旧格式
function readIndex(userToken: string): any[] {
    const chatsDir = getChatsDir(userToken);
    const indexPath = getIndexPath(userToken);

    // 迁移：旧版 chats.json → 单文件格式
    const oldPath = path.join(DATA_DIR, userToken, 'chats.json');
    if (fs.existsSync(oldPath)) {
        try {
            const raw = fs.readFileSync(oldPath, 'utf-8');
            const old = JSON.parse(raw);
            if (Array.isArray(old) && old.length > 0) {
                if (!fs.existsSync(chatsDir)) fs.mkdirSync(chatsDir, { recursive: true });
                const idx: any[] = [];
                old.forEach((chat: any, i: number) => {
                    if (!chat.token) chat.token = generateToken();
                    fs.writeFileSync(getChatFilePath(userToken, i), JSON.stringify(chat));
                    idx.push({ id: i, title: chat.title || '', token: chat.token });
                });
                fs.writeFileSync(indexPath, JSON.stringify(idx));
                fs.unlinkSync(oldPath);
                return idx;
            }
        } catch (e) {
            // 旧文件损坏，删除
            try { fs.unlinkSync(oldPath); } catch (_) {}
        }
    }

    if (!fs.existsSync(indexPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (e) {
        return [];
    }
}

function writeIndex(userToken: string, index: any[]) {
    if (ctrlState.disableSaveConversation) return;
    const dir = getChatsDir(userToken);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getIndexPath(userToken), JSON.stringify(index));
}

// 读取单个对话完整数据
function readChatById(userToken: string, id: number): any | null {
    const filePath = getChatFilePath(userToken, id);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

function writeChatById(userToken: string, id: number, data: any) {
    if (ctrlState.disableSaveConversation) return;
    const dir = getChatsDir(userToken);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getChatFilePath(userToken, id), JSON.stringify(data));
}

function deleteChatById(userToken: string, id: number) {
    const filePath = getChatFilePath(userToken, id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// 获取对话列表（仅元数据）
chatsRouter.get('/chats', (req: Request, res: Response) => {
    const index = readIndex(req.userToken!);
    res.json(index);
});

// 通过 token 获取对话
chatsRouter.get('/chat/by-token/:token', (req: Request, res: Response) => {
    const index = readIndex(req.userToken!);
    const entry = index.find((c: any) => c.token === req.params.token);
    if (!entry) return res.status(404).json({ error: '对话不存在' });
    const chat = readChatById(req.userToken!, entry.id);
    if (!chat) return res.status(404).json({ error: '对话不存在' });
    res.json(chat);
});

// 通过 id 获取对话
chatsRouter.get('/chat/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: '对话不存在' });
    const chat = readChatById(req.userToken!, id);
    if (!chat) return res.status(404).json({ error: '对话不存在' });
    res.json(chat);
});

// 创建新对话
chatsRouter.post('/chats', (req: Request, res: Response) => {
    const index = readIndex(req.userToken!);
    const id = index.length;
    const newChat = { title: '新对话', messages: [], token: generateToken() };
    writeChatById(req.userToken!, id, newChat);
    index.push({ id, title: newChat.title, token: newChat.token });
    writeIndex(req.userToken!, index);
    res.json({ id, title: newChat.title, token: newChat.token });
});

// 更新对话
chatsRouter.put('/chat/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: '聊天不存在' });
    const chat = req.body;
    writeChatById(req.userToken!, id, chat);
    // 更新索引中的标题和 token
    const index = readIndex(req.userToken!);
    const entry = index.find((c: any) => c.id === id);
    if (entry) {
        entry.title = chat.title || entry.title;
        entry.token = chat.token || entry.token;
    } else {
        index.push({ id, title: chat.title || '', token: chat.token || '' });
    }
    writeIndex(req.userToken!, index);
    res.json({ success: true });
});

// 删除对话
chatsRouter.delete('/chat/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: '聊天不存在' });
    deleteChatById(req.userToken!, id);
    const index = readIndex(req.userToken!);
    // 重新编号后续对话，保证 ID 连续（前端使用数组下标作为 ID）
    const renumbered = index
        .filter((c: any) => c.id !== id)
        .map((c: any, newId: number) => {
            if (c.id !== newId) {
                const oldFile = getChatFilePath(req.userToken!, c.id);
                const newFile = getChatFilePath(req.userToken!, newId);
                try {
                    if (fs.existsSync(oldFile)) fs.renameSync(oldFile, newFile);
                } catch (_) {}
                c.id = newId;
            }
            return c;
        });
    writeIndex(req.userToken!, renumbered);
    res.json({ success: true });
});

// 获取模型使用统计
chatsRouter.get('/usage', (req: Request, res: Response) => {
    try {
        const usage = getUsage(req.userToken!);
        res.json(usage);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 保存命令执行记录
chatsRouter.post('/chat/:id/cmdlog', (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: '聊天不存在' });
    const cmdlog = req.body;
    const filePath = getChatFilePath(req.userToken!, id).replace(/\.json$/, '_cmdlog.json');
    const dir = getChatsDir(req.userToken!);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cmdlog));
    res.json({ success: true });
});

// 读取命令执行记录
chatsRouter.get('/chat/:id/cmdlog', (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: '聊天不存在' });
    const filePath = getChatFilePath(req.userToken!, id).replace(/\.json$/, '_cmdlog.json');
    if (!fs.existsSync(filePath)) return res.json([]);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (e) {
        res.json([]);
    }
});
