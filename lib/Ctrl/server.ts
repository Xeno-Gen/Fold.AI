import express from 'express';
import path from 'path';
import fs from 'fs';
import { ctrlState } from './state';
import { logger } from '../logger';

const USERS_DIR = path.join(__dirname, '../../data/users');
const LOG_DIR = path.join(__dirname, '../../data/ctrl_logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logAccess(ip: string, action: string) {
  ensureLogDir();
  const date = new Date();
  const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') + ':' + String(date.getSeconds()).padStart(2, '0');
  const logFile = path.join(LOG_DIR, dateStr + '.log');
  const line = `[${timeStr}] ${ip} ${action}\n`;
  fs.appendFileSync(logFile, line, 'utf-8');
  logger.info(`[Ctrl][ACCESS] ${ip} ${action}`);
}

function getRealIp(req: express.Request): string {
  // Check x-forwarded-for first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
}

function isLanIP(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') || ip.startsWith('172.21.') || ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') || ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') || ip.startsWith('172.31.')) return true;
  return false;
}

const REJECT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fold.AI - 拒绝访问</title>
<style>
:root{--bg:#ffffff;--text:#1a1a1a;--text2:#666;--border:#eee;}
[data-theme="dark"]{--bg:#1a1a1a;--text:#e0e0e0;--text2:#999;--border:#333;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;align-items:center;justify-content:center;transition:background .3s,color .3s;}
.container{text-align:center;padding:40px;}
.icon{font-size:64px;margin-bottom:20px;opacity:.3;}
h1{font-size:28px;font-weight:600;margin-bottom:8px;letter-spacing:-.5px;}
p{font-size:15px;color:var(--text2);margin-bottom:4px;}
.lang-switcher{position:fixed;top:16px;right:20px;display:flex;align-items:center;gap:8px;z-index:10;}
.lang-btn{cursor:pointer;font-size:14px;color:var(--text2);background:none;border:none;font-family:inherit;padding:4px 8px;border-radius:4px;}
.lang-btn:hover{background:var(--border);}
.theme-btn{width:32px;height:32px;border-radius:6px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);}
.theme-btn:hover{background:var(--border);}
</style>
</head>
<body>
<div class="lang-switcher">
  <button class="lang-btn" id="langBtn">English</button>
  <button class="theme-btn" id="themeBtn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
</div>
<div class="container">
  <div class="icon">🔒</div>
  <h1 id="titleText">你被拒绝了</h1>
  <p id="subText">你的IP地址没有访问权限</p>
</div>
<script>
(function(){var lang=document.cookie.match(/(?:^|; )fold_ctrl_lang=([^;]*)/);lang=lang?lang[1]:'zh';var theme=document.cookie.match(/(?:^|; )fold_ctrl_theme=([^;]*)/);theme=theme?theme[1]:'light';var en=lang==='en';
document.getElementById('titleText').textContent=en?'Access Denied':'你被拒绝了';document.getElementById('subText').textContent=en?'Your IP address does not have permission to access':'你的IP地址没有访问权限';document.getElementById('langBtn').textContent=en?'中文':'English';if(theme==='dark')document.documentElement.setAttribute('data-theme','dark');
document.getElementById('langBtn').onclick=function(){var l=document.cookie.match(/(?:^|; )fold_ctrl_lang=([^;]*)/);l=l?l[1]:'zh';var n=l==='zh'?'en':'zh';document.cookie='fold_ctrl_lang='+n+';path=/;max-age=31536000';location.reload();};
document.getElementById('themeBtn').onclick=function(){var t=document.cookie.match(/(?:^|; )fold_ctrl_theme=([^;]*)/);t=t?t[1]:'light';var n=t==='dark'?'light':'dark';document.cookie='fold_ctrl_theme='+n+';path=/;max-age=31536000';location.reload();};})();
</script>
</body>
</html>`;

export function startCtrlServer(port?: number) {
  const CTRL_PORT = port || 17922;
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());

  // Access logging + IP filtering middleware
  app.use((req, res, next) => {
    const ip = getRealIp(req);
    logAccess(ip, req.method + ' ' + req.path);

    const mode = ctrlState.ipAccessMode;
    if (mode === 'local') {
      if (ip !== '127.0.0.1' && ip !== 'localhost') {
        logger.warn(`[Ctrl] Rejected ${ip} (local only mode)`);
        return res.send(REJECT_HTML);
      }
    } else if (mode === 'lan') {
      if (!isLanIP(ip)) {
        logger.warn(`[Ctrl] Rejected ${ip} (LAN only mode)`);
        return res.send(REJECT_HTML);
      }
    }
    // 'open' mode: allow all
    next();
  });

  // Serve static frontend (only accessible for allowed IPs)
  app.use(express.static(path.join(__dirname, '../../static/ctrl')));

  // API: get current control state
  
  // DEBUG endpoint
  app.get('/api/debug', (_req, res) => {
    res.json({ state: ctrlState, hasWorkdir: 'disableWorkDir' in ctrlState, keys: Object.keys(ctrlState) });
  });
  app.get('/api/state', (_req, res) => {
    res.json({ ...ctrlState });
  });

  // API: update control state
  app.post('/api/state', (req, res) => {
    const { disableFileUpload, disableSaveConversation, disableAllPlugins, disableWorkDir, ipAccessMode } = req.body;
    if (typeof disableFileUpload === 'boolean') ctrlState.disableFileUpload = disableFileUpload;
    if (typeof disableSaveConversation === 'boolean') ctrlState.disableSaveConversation = disableSaveConversation;
    if (typeof disableAllPlugins === 'boolean') ctrlState.disableAllPlugins = disableAllPlugins;
    if (typeof disableWorkDir === 'boolean') ctrlState.disableWorkDir = disableWorkDir;
    if (ipAccessMode === 'local' || ipAccessMode === 'lan' || ipAccessMode === 'open') ctrlState.ipAccessMode = ipAccessMode;
    logger.info(`[Ctrl] state updated: ${JSON.stringify(ctrlState)}`);
    res.json({ success: true, state: { ...ctrlState } });
  });

  // API: get access log for today
  app.get('/api/logs', (_req, res) => {
    ensureLogDir();
    const date = new Date();
    const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const logFile = path.join(LOG_DIR, dateStr + '.log');
    try {
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        res.json({ logs: lines.slice(-200) });
      } else {
        res.json({ logs: [] });
      }
    } catch (e: any) {
      res.json({ logs: [], error: e.message });
    }
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

  // Listen on 0.0.0.0 so LAN/external access works
  app.listen(CTRL_PORT, '0.0.0.0', () => {
    logger.info(`[Ctrl] control panel running on http://0.0.0.0:${CTRL_PORT} (mode: ${ctrlState.ipAccessMode})`);
  });
}
