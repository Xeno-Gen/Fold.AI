module.exports = function(context) {
    const express = require('express');
    const fs = require('fs');
    const path = require('path');
    const router = express.Router();

    const USERS_DIR = path.join(__dirname, '../../data/users');

    function getDataFile(userToken) {
        const dir = path.join(USERS_DIR, userToken);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return path.join(dir, 'memories.json');
    }

    function readMemories(userToken) {
        try {
            const file = getDataFile(userToken);
            if (fs.existsSync(file)) {
                return JSON.parse(fs.readFileSync(file, 'utf-8'));
            }
        } catch (e) {
            context.logger.error('Memory: failed to read memories: ' + e.message);
        }
        return {};
    }

    function writeMemories(userToken, data) {
        const file = getDataFile(userToken);
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    }

    // List all memory keys with metadata
    router.get('/memories', (req, res) => {
        const userToken = req.userToken;
        if (!userToken) return res.status(401).json({ error: '未识别用户' });
        const memories = readMemories(userToken);
        const list = Object.keys(memories).map(key => ({
            key,
            content: memories[key].content || '',
            size: (memories[key].content || '').length,
            updated: memories[key].updated
        }));
        res.json({ memories: list });
    });

    // Get a specific memory
    router.get('/memory/:key', (req, res) => {
        const userToken = req.userToken;
        if (!userToken) return res.status(401).json({ error: '未识别用户' });
        const memories = readMemories(userToken);
        const key = decodeURIComponent(req.params.key);
        if (!memories[key]) {
            return res.status(404).json({ error: '记忆不存在' });
        }
        res.json({ key, content: memories[key].content, updated: memories[key].updated });
    });

    // Save or update a memory
    router.post('/memory/:key', (req, res) => {
        const userToken = req.userToken;
        if (!userToken) return res.status(401).json({ error: '未识别用户' });
        const key = decodeURIComponent(req.params.key);
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: '缺少内容' });
        }
        const memories = readMemories(userToken);
        const existed = !!memories[key];
        memories[key] = {
            content,
            updated: new Date().toISOString()
        };
        writeMemories(userToken, memories);
        context.logger.info('Memory: ' + (existed ? 'updated' : 'created') + ' [' + key + '] for user ' + userToken);
        res.json({ success: true, key, action: existed ? 'updated' : 'created' });
    });

    // Delete a memory
    router.delete('/memory/:key', (req, res) => {
        const userToken = req.userToken;
        if (!userToken) return res.status(401).json({ error: '未识别用户' });
        const memories = readMemories(userToken);
        const key = decodeURIComponent(req.params.key);
        if (!memories[key]) {
            return res.status(404).json({ error: '记忆不存在' });
        }
        delete memories[key];
        writeMemories(userToken, memories);
        context.logger.info('Memory: deleted [' + key + '] for user ' + userToken);
        res.json({ success: true, key });
    });

    context.logger.info('Memory plugin routes registered (per-user)');
    return { router };
};
