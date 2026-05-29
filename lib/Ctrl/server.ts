import express from 'express';
import path from 'path';
import fs from 'fs';
import { ctrlState } from './state';
import { logger } from '../logger';

const CTRL_PORT = 17922;
const USERS_DIR = path.join(__dirname, '../../data/users');

export function startCtrlServer() {
  const app = express();
  app.use(express.json());

  // IP restriction: only allow 127.0.0.1 and localhost
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const cleanIp = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    if (cleanIp !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      logger.warn(`[Ctrl] Rejected connection from ${ip}`);
      return res.status(403).json({ error: 'Forbidden: only localhost and 127.0.0.1 allowed' });
    }
    next();
  });

  // Serve static frontend
  app.use(express.static(path.join(__dirname, '../../static/ctrl')));

  // API: get current control state
  app.get('/api/state', (_req, res) => {
    res.json({ ...ctrlState });
  });

  // API: update control state
  app.post('/api/state', (req, res) => {
    const { disableFileUpload, disableSaveConversation, disableAllPlugins } = req.body;
    if (typeof disableFileUpload === 'boolean') ctrlState.disableFileUpload = disableFileUpload;
    if (typeof disableSaveConversation === 'boolean') ctrlState.disableSaveConversation = disableSaveConversation;
    if (typeof disableAllPlugins === 'boolean') ctrlState.disableAllPlugins = disableAllPlugins;
    logger.info(`[Ctrl] state updated: ${JSON.stringify(ctrlState)}`);
    res.json({ success: true, state: { ...ctrlState } });
  });

  // API: list users
  app.get('/api/users', (_req, res) => {
    try {
      if (!fs.existsSync(USERS_DIR)) return res.json({ users: [] });
      const users = fs.readdirSync(USERS_DIR).filter(name => {
        const dir = path.join(USERS_DIR, name);
        try { return fs.statSync(dir).isDirectory() && name !== 'uploads' && name !== 'plugin_data'; }
        catch { return false; }
      });
      const usersWithInfo = users.map(token => {
        const configPath = path.join(USERS_DIR, token, 'config.json');
        let label = token.substring(0, 8) + '...';
        try {
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.currentProvider) label += ` (${config.currentProvider})`;
          }
        } catch {}
        return { token, label };
      });
      res.json({ users: usersWithInfo });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: delete user data directory
  app.delete('/api/user/:token', (req, res) => {
    const { token } = req.params;
    const userDir = path.join(USERS_DIR, token);
    if (!fs.existsSync(userDir)) {
      return res.status(404).json({ error: 'User not found' });
    }
    try {
      fs.rmSync(userDir, { recursive: true });
      logger.info(`[Ctrl] deleted user data: ${token}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(CTRL_PORT, '127.0.0.1', () => {
    logger.info(`[Ctrl] control panel running on http://127.0.0.1:${CTRL_PORT}`);
  });
}
