module.exports = function(context) {
    const express = require('express');
    const fs = require('fs');
    const path = require('path');
    const router = express.Router();

    const WORK_DIR = path.join(__dirname, '../../../cwd');
    const HISTORY_DIR = path.join(__dirname, '../../data/plugin_data/FileOperations/history');

    function ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    ensureDir(WORK_DIR);
    ensureDir(HISTORY_DIR);

    // Resolve file path with path traversal protection
    function resolvePath(filename) {
        // 如果传入的是绝对路径，尝试去掉 WORK_DIR 前缀，否则只取文件名
        var normalized = path.normalize(filename);
        var workDirNormalized = path.normalize(WORK_DIR);
        if (normalized.startsWith(workDirNormalized)) {
            normalized = normalized.substring(workDirNormalized.length).replace(/^[\/\\]+/, '');
        } else if (path.isAbsolute(normalized)) {
            // 其他绝对路径，只取文件名
            normalized = path.basename(filename);
        }
        const safe = normalized.replace(/^(\.\.(\/|\\|$))+/, '');
        return path.join(WORK_DIR, safe);
    }

    // Get user history file
    function getHistoryFile(userToken) {
        return path.join(HISTORY_DIR, userToken + '.json');
    }

    function readHistory(userToken) {
        try {
            const f = getHistoryFile(userToken);
            if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
        } catch (e) {}
        return [];
    }

    function addHistory(userToken, entry) {
        const h = readHistory(userToken);
        h.push({ ...entry, time: new Date().toISOString(), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
        fs.writeFileSync(getHistoryFile(userToken), JSON.stringify(h, null, 2), 'utf-8');
        return h;
    }

    // ── list files ──
    router.get('/files', (req, res) => {
        try {
            const files = fs.readdirSync(WORK_DIR).filter(f => {
                const stat = fs.statSync(path.join(WORK_DIR, f));
                return stat.isFile();
            }).map(f => {
                const stat = fs.statSync(path.join(WORK_DIR, f));
                return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
            });
            res.json({ files });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── get file content ──
    router.get('/file', (req, res) => {
        try {
            const name = req.query.name;
            if (!name) return res.status(400).json({ error: '缺少文件名' });
            const filePath = resolvePath(name);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            res.json({ name, content, lines: lines.length, size: Buffer.byteLength(content, 'utf-8'), mtime: fs.statSync(filePath).mtime.toISOString() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── get history ──
    router.get('/history', (req, res) => {
        res.json({ history: readHistory(req.userToken) });
    });

    // ── rollback ──
    router.post('/rollback/:id', (req, res) => {
        try {
            const h = readHistory(req.userToken);
            const entry = h.find(e => e.id === req.params.id);
            if (!entry) return res.status(404).json({ error: '历史记录不存在' });

            const filePath = resolvePath(entry.file);
            if (entry.type === 'add' || entry.type === 'mod') {
                // Restore previous content
                if (entry.previousContent === null) {
                    // File didn't exist before — delete it
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } else {
                    fs.writeFileSync(filePath, entry.previousContent, 'utf-8');
                }
            } else if (entry.type === 'del') {
                if (entry.previousContent === null) {
                    // Was a line deletion, can't restore full file — restore from backup
                    return res.status(400).json({ error: '行删除无法回滚，请手动恢复' });
                }
                fs.writeFileSync(filePath, entry.previousContent, 'utf-8');
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── execute: parse tag format and execute ──
    router.post('/execute', (req, res) => {
        try {
            const { command } = req.body;
            if (!command) return res.status(400).json({ error: '缺少命令' });

            const results = [];
            // Split by tag boundaries: find each top-level tag and process it
            const tagRegex = /<(add|mod)>([\s\S]*?)<\/\1>/gi;
            let match;
            let lastIndex = 0;

            while ((match = tagRegex.exec(command)) !== null) {
                const tagType = match[1].toLowerCase();
                const body = match[2];

                switch (tagType) {
                    case 'add': {
                        const nlIdx = body.indexOf('\n');
                        if (nlIdx === -1) { results.push({ type: 'add', error: '格式错误: 需要换行分隔文件名和内容' }); break; }
                        const fname = body.substring(0, nlIdx).trim();
                        const content = body.substring(nlIdx + 1);
                        const filePath = resolvePath(fname);
                        let previousContent = null;
                        if (fs.existsSync(filePath)) {
                            previousContent = fs.readFileSync(filePath, 'utf-8');
                        }
                        fs.writeFileSync(filePath, content, 'utf-8');
                        addHistory(req.userToken, { type: 'add', file: fname, previousContent });
                        results.push({ type: 'add', file: fname, written: Buffer.byteLength(content, 'utf-8'), action: previousContent !== null ? 'updated' : 'created' });
                        break;
                    }
                    case 'mod': {
                        const nlIdx = body.indexOf('\n');
                        if (nlIdx === -1) { results.push({ type: 'mod', error: '格式错误: 需要换行分隔文件名和内容' }); break; }
                        const fname = body.substring(0, nlIdx).trim();
                        const rest = body.substring(nlIdx + 1).trim();
                        // Parse: <line_number> OR <start~end> followed by newline and replacement content
                        const tagMatch = rest.match(/^<(\d+(?:\s*~\s*\d+)?)>\s*\n?([\s\S]*)$/);
                        if (!tagMatch) { results.push({ type: 'mod', error: '格式错误: 需要 <行号> 标记' }); break; }
                        const rangeStr = tagMatch[1];
                        const newContent = tagMatch[2] || '';
                        const rangeParts = rangeStr.split('~').map(s => parseInt(s.trim()));
                        const startLine = rangeParts[0];
                        const endLine = rangeParts[1] || startLine;

                        const filePath = resolvePath(fname);
                        if (!fs.existsSync(filePath)) { results.push({ type: 'mod', file: fname, error: '文件不存在' }); break; }
                        const prevContent = fs.readFileSync(filePath, 'utf-8');
                        const allLines = prevContent.split('\n');
                        const s = Math.max(1, startLine) - 1;
                        const e = Math.min(allLines.length, endLine);
                        const newLines = newContent.split('\n');
                        allLines.splice(s, e - s, ...newLines);
                        fs.writeFileSync(filePath, allLines.join('\n'), 'utf-8');
                        addHistory(req.userToken, { type: 'mod', file: fname, range: `${startLine}~${endLine}`, previousContent: prevContent });
                        results.push({ type: 'mod', file: fname, range: `${startLine}~${endLine}`, replaced: e - s, with: newLines.length });
                        break;
                    }
                }
            }

            res.json({ results: results.length > 0 ? results : [{ error: '未识别到有效文件操作命令' }] });
        } catch (e) {
            context.logger.error('FileOperations execute: ' + e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // ── convenience: write file directly with UTF-8 ──
    router.post('/write/:name', (req, res) => {
        try {
            const name = decodeURIComponent(req.params.name);
            const { content } = req.body;
            if (content === undefined) return res.status(400).json({ error: '缺少内容' });
            const filePath = resolvePath(name);
            let previousContent = null;
            if (fs.existsSync(filePath)) previousContent = fs.readFileSync(filePath, 'utf-8');
            fs.writeFileSync(filePath, content, 'utf-8');
            addHistory(req.userToken, { type: 'add', file: name, previousContent });
            res.json({ success: true, file: name, action: previousContent !== null ? 'updated' : 'created' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    context.logger.info('FileOperations plugin routes registered');
    return { router };
};
