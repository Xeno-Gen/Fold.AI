import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger';
import { ctrlState } from '../Ctrl/state';

export const pluginsRouter = Router();

// Middleware: block plugin execution when disabled by control panel
pluginsRouter.use((req, res, next) => {
  if (ctrlState.disableAllPlugins && req.method !== 'GET') {
    return res.status(503).json({ error: '插件已由管理员禁用' });
  }
  next();
});

const PLUGIN_DIR = path.join(__dirname, '../../Plugin');
const CONFIG_DIR = path.join(__dirname, '../../config');

/**
 * 获取插件列表
 */
pluginsRouter.get('/plugins', (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(PLUGIN_DIR)) {
            return res.json({ plugins: [] });
        }

        const pluginFolders = fs.readdirSync(PLUGIN_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const plugins: any[] = [];

        for (const folder of pluginFolders) {
            const manifestPath = path.join(PLUGIN_DIR, folder, 'plugin.json');
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    plugins.push(manifest);
                } catch (e) {
                    logger.warn(`failed to read plugin manifest: ${folder}/plugin.json`);
                }
            }
        }

        res.json({ plugins });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 获取插件详情
 */
pluginsRouter.get('/plugin/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const manifestPath = path.join(PLUGIN_DIR, id, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ error: '插件未找到' });
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        res.json(manifest);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 获取插件配置
 */
pluginsRouter.get('/plugin/:id/settings', (req: Request, res: Response) => {
    const { id } = req.params;
    const manifestPath = path.join(PLUGIN_DIR, id, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
        return res.status(404).json({ error: '插件未找到' });
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        res.json(manifest.settings || {});
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * 获取 Config 文件夹下的配置文件
 */
pluginsRouter.get('/config/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    // 防止路径穿越
    const safeName = path.basename(name);
    const filePath = path.join(CONFIG_DIR, safeName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '配置文件未找到' });
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // 尝试解析JSON
        try {
            res.json(JSON.parse(content));
        } catch {
            res.send(content);
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
