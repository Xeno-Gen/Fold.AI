import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(__dirname, '../../data/uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const videoExts = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.flv', '.wmv'];

export const uploadRouter = Router();

uploadRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: '没有文件' });

        // multer 把中文文件名按 latin1 解码，转回 UTF-8
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
        const ext = path.extname(fileName).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
        const isVideo = videoExts.includes(ext);

        if (isImage) {
            const base64 = fs.readFileSync(file.path, 'base64');
            const mimeMap: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
            };
            return res.json({
                type: 'image',
                fileName: fileName,
                content: `data:${mimeMap[ext] || 'image/png'};base64,${base64}`,
                path: file.path
            });
        } else if (isVideo) {
            const base64 = fs.readFileSync(file.path, 'base64');
            const mimeMap: Record<string, string> = {
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.webm': 'video/webm',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska',
                '.flv': 'video/x-flv',
                '.wmv': 'video/x-ms-wmv',
            };
            return res.json({
                type: 'video',
                fileName: fileName,
                content: `data:${mimeMap[ext] || 'video/mp4'};base64,${base64}`,
                path: file.path
            });
        } else {
            const buf = fs.readFileSync(file.path);
            let content = new TextDecoder('utf-8', { fatal: false }).decode(buf);
            if (content.includes('�')) {
                try {
                    const gb = new TextDecoder('gb18030').decode(buf);
                    if (!gb.includes('�')) content = gb;
                } catch(e) {}
            }
            return res.json({
                type: 'text',
                fileName: fileName,
                content: content,
                path: file.path
            });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
