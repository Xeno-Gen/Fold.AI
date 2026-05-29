module.exports = function(context) {
    const express = require('express');
    const { spawn, exec } = require('child_process');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const router = express.Router();

    // ===== 持久 Shell 会话管理 =====
    const sessions = new Map();
    const runningProcs = new Map(); // requestId -> child
    const SESSION_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 分钟无活动关闭

    class ShellSession {
        constructor(workDir) {
            this.workDir = workDir;
            this.child = null;
            this.busy = false;
            this.lastUsed = Date.now();
            this._resolve = null;
            this._buffer = '';
            this._timer = null;
            this._queue = [];
            this._inited = false;
        }

        start() {
            if (this.child && !this.child.killed) return;
            const sysRoot = process.env.SystemRoot || 'C:\\Windows';
            const psPath = sysRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

            this.child = spawn(psPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
                cwd: this.workDir,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this._buffer = '';

            this.child.stdout.on('data', (data) => {
                const text = data.toString('utf-8');
                this._buffer += text;
                this._checkMarker();
            });

            this.child.stderr.on('data', (data) => {
                this._buffer += data.toString('utf-8');
                this._checkMarker();
            });

            this.child.on('exit', () => {
                this.child = null;
                this.busy = false;
                if (this._resolve) {
                    this._resolve({ stdout: this._buffer, stderr: '', exitCode: -1 });
                    this._resolve = null;
                }
            });

            // 初始化：UTF-8 环境
            this.stdin('chcp 65001 > $null');
            this.stdin('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
            this.stdin('$OutputEncoding = [System.Text.Encoding]::UTF8');
            this.stdin("$PSDefaultParameterValues['*:Encoding'] = 'utf8'");
            this._inited = true;
            this._resetTimer();
        }

        stdin(line) {
            if (this.child && this.child.stdin.writable) {
                this.child.stdin.write(line + '\r\n');
            }
        }

        _checkMarker() {
            // 统一 \r\n → \n（Windows 兼容）
            const norm = this._buffer.replace(/\r\n/g, '\n');
            const idx = norm.lastIndexOf('\n__CMD_OK__\n');
            if (idx !== -1) {
                const output = norm.substring(0, idx);
                this._buffer = this._buffer.substring(idx + 12);
                this._buffer = this._buffer.replace(/\r\n/g, '\n'); // unify remaining too
                this.busy = false;
                this.lastUsed = Date.now();
                this._resetTimer();
                if (this._resolve) {
                    this._resolve({ stdout: output, stderr: '', exitCode: 0 });
                    this._resolve = null;
                }
                this._processQueue();
            }
        }

        execute(shellType, command, timeout) {
            return new Promise((resolve, reject) => {
                if (this.busy) {
                    // 不要直接拒绝，入队列等待
                    this._queue.push({ shellType, command, timeout, resolve, reject });
                    return;
                }
                this._run(shellType, command, timeout, resolve, reject);
            });
        }

        _run(shellType, command, timeout, resolve, reject) {
            this.busy = true;
            this._resolve = resolve;
            this._buffer = '';
            this.lastUsed = Date.now();

            let execCmd;
            if (shellType === 'powershell') {
                execCmd = command;
            } else if (shellType === 'cmd') {
                const safe = command.replace(/'/g, "''");
                execCmd = "cmd /c '" + safe + "'";
            } else {
                execCmd = command;
            }

            this.stdin(execCmd);
            this.stdin('Write-Host "`n__CMD_OK__"');

            if (timeout && timeout > 0) {
                setTimeout(() => {
                    if (this.busy) {
                        this.stdin('Write-Host "`n__CMD_OK__"');
                        // 超时保护：标记仍没匹配到？2 秒后强制释放
                        setTimeout(() => {
                            if (this.busy) {
                                context.logger.warn('[session] force-unbusy session (marker timeout)');
                                this.busy = false;
                                if (this._resolve) {
                                    this._resolve({ stdout: this._buffer, stderr: '', exitCode: -1 });
                                    this._resolve = null;
                                }
                                this._processQueue();
                            }
                        }, 2000);
                    }
                }, timeout);
            }
        }

        _processQueue() {
            if (this._queue.length > 0) {
                const next = this._queue.shift();
                this._run(next.shellType, next.command, next.timeout, next.resolve, next.reject);
            }
        }

        kill() {
            if (this._timer) clearTimeout(this._timer);
            if (this.child) {
                try { this.child.kill(); } catch (e) {}
                this.child = null;
            }
            this.busy = false;
        }

        _resetTimer() {
            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(() => this.kill(), SESSION_IDLE_TIMEOUT);
        }
    }

    function getSession(userToken, workDir) {
        let s = sessions.get(userToken);
        if (s && s.child && !s.child.killed) {
            s.lastUsed = Date.now();
            s._resetTimer();
            return s;
        }
        s = new ShellSession(workDir);
        s.start();
        sessions.set(userToken, s);
        return s;
    }

    // 定时清理过期会话
    setInterval(() => {
        const now = Date.now();
        for (const [token, s] of sessions) {
            if (!s.busy && now - s.lastUsed > SESSION_IDLE_TIMEOUT) {
                s.kill();
                sessions.delete(token);
            }
        }
    }, 60000);

    // ===== 辅助函数 =====
    function snapshotFiles(workDir) {
        const snap = {};
        try {
            if (!fs.existsSync(workDir)) return snap;
            for (const name of fs.readdirSync(workDir)) {
                const fp = path.join(workDir, name);
                try {
                    const stat = fs.statSync(fp);
                    if (stat.isFile() && !name.endsWith('.bak') && !name.startsWith('_ps_tmp_') && !name.startsWith('_sh_tmp_')) {
                        snap[name] = { mtime: stat.mtimeMs, size: stat.size };
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return snap;
    }

    function createBaksForChanged(workDir, beforeSnap) {
        const after = snapshotFiles(workDir);
        for (const name in after) {
            const a = beforeSnap[name];
            const b = after[name];
            if (a && b && (a.mtime !== b.mtime || a.size !== b.size)) {
                const fp = path.join(workDir, name);
                try {
                    const bakPath = fp + '.bak';
                    if (!fs.existsSync(bakPath)) {
                        fs.copyFileSync(fp, bakPath);
                        context.logger.info('[bak] created: ' + bakPath);
                    }
                } catch (e) {
                    context.logger.warn('[bak] failed for ' + name + ': ' + e.message);
                }
            }
        }
    }

    // ===== 停止执行 =====
    router.post('/stop', (req, res) => {
        const { requestId } = req.body;
        const userToken = req.userToken;

        // 1. 按 requestId 查 runningProcs
        if (requestId) {
            const child = runningProcs.get(requestId);
            if (child) {
                try { child.kill('SIGTERM'); } catch (e) { try { child.kill(); } catch (e2) {} }
                runningProcs.delete(requestId);
                context.logger.info('[exec] killed process for requestId=' + requestId);
            }
        }

        // 2. 杀掉该用户的持久会话（中断正在执行的命令）
        if (userToken) {
            const session = sessions.get(userToken);
            if (session && session.child && !session.child.killed) {
                try { session.child.kill('SIGTERM'); } catch (e) { try { session.child.kill(); } catch (e2) {} }
                sessions.delete(userToken);
                context.logger.info('[exec] killed persistent session for user ' + userToken);
            }
            // 同时清理该用户的 runningProcs 条目
            for (const [rid, child] of runningProcs) {
                try { child.kill(); } catch (e) {}
                runningProcs.delete(rid);
            }
        }

        res.json({ success: true });
    });

    // ===== 执行命令 =====
    async function execute(req, res) {
        const startTime = Date.now();
        const { shell, command, timeout, workingDirectory, sandbox, requestId } = req.body;

        if (!command) return res.status(400).json({ error: '缺少命令内容' });
        if (shell !== 'powershell' && shell !== 'cmd' && shell !== 'shell') {
            return res.status(400).json({ error: '不支持的Shell类型' });
        }

        const execTimeout = timeout || 30000;
        let workDir = workingDirectory || process.cwd();
        if (workDir === 'cwd') workDir = path.join(__dirname, '../../../cwd');
        if (!path.isAbsolute(workDir)) workDir = path.resolve(workDir);
        if (!fs.existsSync(workDir)) {
            try { fs.mkdirSync(workDir, { recursive: true }); } catch (e) { workDir = process.cwd(); }
        }

        // ---- 安全检测 ----
        const dangerousPatterns = [
            /rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i,
            /rd\s+\/s/i, /shutdown/i, /restart-computer/i, /stop-computer/i,
            /sudo\s+rm\s+-rf/i, />\s*\/dev\/sda/i, /dd\s+if=/i,
        ];
        for (const p of dangerousPatterns) {
            if (p.test(command)) return res.status(403).json({ error: '危险命令被拦截' });
        }

        if (sandbox !== false) {
            const workDirLower = path.resolve(workDir).toLowerCase();
            function isPathOutside(absPath) {
                try {
                    const r = path.resolve(absPath).toLowerCase();
                    return r !== workDirLower && !r.startsWith(workDirLower + path.sep) && !r.startsWith(workDirLower + '/');
                } catch (e) { return true; }
            }
            const pathEscapePatterns = [
                /\b(?:cd|chdir)\s+\.\.[\\/]/i, /\b(?:cd|chdir)\s+[\\/](?:\s|$|[&|;])/i,
                /\b(?:set-location|sl|pushd|push-location)\s+\.\.[\\/]/i,
                /[\s(]\.\.[\\/]/, /\\\\[^\\]+\\/i,
                /\breg\s+(?:add|delete|copy|save|restore)\s+/i,
                /\breg\.exe\s+(?:add|delete|copy|save|restore)\s+/i,
            ];
            for (const p of pathEscapePatterns) {
                if (p.test(command)) {
                    context.logger.warn('[sandbox] blocked path escape');
                    return res.status(403).json({ error: '安全策略拦截：命令试图访问工作目录外的路径' });
                }
            }
            const driveRegex = /[A-Za-z]:\\/g;
            let m;
            while ((m = driveRegex.exec(command)) !== null) {
                const rest = command.substring(m.index);
                const end = rest.search(/[\s"'&|;<>()]/);
                const candidate = (end === -1 ? rest : rest.substring(0, end)).trim();
                if (candidate && isPathOutside(candidate)) {
                    return res.status(403).json({ error: '安全策略拦截：命令包含工作目录外的绝对路径' });
                }
            }
        }

        context.logger.info('[exec] ' + shell + '> ' + command);

        // ---- shell 命令：单独进程（不持久） ----
        if (shell === 'shell') {
            const isWin = os.platform() === 'win32';
            if (isWin) {
                const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
                if (!fs.existsSync(gitBash)) {
                    return res.status(400).json({ error: 'Shell (bash) 在 Windows 上需要安装 Git Bash' });
                }
                const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
                fs.writeFileSync(tmpSh, command, 'utf-8');
                const child = exec('"' + gitBash + '" "' + tmpSh + '"', {
                    timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024,
                    windowsHide: true, encoding: 'buffer',
                }, (error, stdout, stderr) => {
                    try { fs.unlinkSync(tmpSh); } catch (e) {}
                    handleResult(error, stdout, stderr);
                });
                if (requestId) runningProcs.set(requestId, child);
                return;
            }
            // Linux
            const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
            fs.writeFileSync(tmpSh, command, 'utf-8');
            const child = exec('/bin/bash "' + tmpSh + '"', {
                timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024, encoding: 'buffer',
            }, (error, stdout, stderr) => {
                try { fs.unlinkSync(tmpSh); } catch (e) {}
                handleResult(error, stdout, stderr);
            });
            if (requestId) runningProcs.set(requestId, child);
            return;
        }

        // ---- PowerShell / CMD：持久会话 ----
        const fileSnapBefore = snapshotFiles(workDir);
        try {
            const session = getSession(req.userToken, workDir);
            // 注册到 runningProcs，stop 时可以杀掉
            if (requestId && session.child) runningProcs.set(requestId, session.child);
            const sessionResult = await session.execute(shell, command, execTimeout);

            // 如果会话还在繁忙（超时注入 marker 后仍未完成），记录日志
            const duration = Date.now() - startTime;
            const stdout = sessionResult.stdout || '';
            const stderr = sessionResult.stderr || '';

            createBaksForChanged(workDir, fileSnapBefore);

            const result = {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: sessionResult.exitCode || 0,
                duration,
                shell,
                command,
            };

            context.logger.info('[exec] ' + shell + ' exit=' + result.exitCode + ' dur=' + duration + 'ms');
            if (requestId) runningProcs.delete(requestId);
            res.json(result);
        } catch (e) {
            context.logger.error('[exec] error: ' + e.message);
            if (!res.headersSent) res.status(500).json({ error: e.message });
        }

        function handleResult(error, stdout, stderr) {
            try {
                const duration = Date.now() - startTime;
                const decode = (buf) => {
                    if (!buf || buf.length === 0) return '';
                    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
                };
                const result = {
                    stdout: decode(stdout), stderr: decode(stderr),
                    exitCode: error ? (error.code || 1) : 0,
                    duration, shell, command,
                };
                if (error && !result.stderr) result.stderr = error.message;
                context.logger.info('[exec] ' + shell + ' exit=' + result.exitCode + ' dur=' + duration + 'ms');
                if (requestId) runningProcs.delete(requestId);
                res.json(result);
            } catch (e) {
                context.logger.error('[exec] handleResult error: ' + e.message);
                if (!res.headersSent) res.status(500).json({ error: e.message });
            }
        }
    }
    router.post('/execute', execute);

    // ---- detect / generate（保持原有逻辑） ----
    async function detect(req, res) {
        try {
            const { messages, provider, model } = req.body;
            if (!messages || !provider || !model) return res.status(400).json({ error: '缺少必要参数' });
            const apiKey = context.getUserProviderKey(req.userToken, provider);
            const baseUrl = context.getUserProviderUrl(provider);
            if (!apiKey || !baseUrl) return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            const response = await fetch(baseUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model, messages: [
                        { role: "system", content: "判断用户是否需要执行系统命令，只需回答是或否。\n如果需要则输出: YES\n如果不需要则输出: 无" },
                        ...messages.slice(-2)
                    ], temperature: 0.01, max_tokens: 100, stream: false,
                })
            });
            if (!response.ok) return res.status(response.status).json({ error: await response.text() });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            res.json({ tool_calls: content.trim().toUpperCase().includes('YES') ? ['CommandExecution'] : [] });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }
    router.post('/detect', detect);

    async function generate(req, res) {
        try {
            const { messages, provider, model } = req.body;
            if (!messages || !provider || !model) return res.status(400).json({ error: '缺少必要参数' });
            const apiKey = context.getUserProviderKey(req.userToken, provider);
            const baseUrl = context.getUserProviderUrl(provider);
            if (!apiKey || !baseUrl) return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            const response = await fetch(baseUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model, messages: [
                        { role: "system", content: "用户需要执行系统命令。请根据对话内容，输出具体的命令。\n使用标签格式: <power:PowerShell命令> 或 <cmd:CMD命令> 或 <shell:Shell命令>\n只输出标签，不要添加其他内容。" },
                        ...messages.slice(-3)
                    ], temperature: 0.1, max_tokens: 300, stream: false,
                })
            });
            if (!response.ok) return res.status(response.status).json({ error: await response.text() });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const powerMatch = content.match(/<power:(.+?)>/i);
            const cmdMatch = content.match(/<cmd:(.+?)>/i);
            const shellMatch = content.match(/<shell:(.+?)>/i);
            if (powerMatch) res.json({ shell: 'powershell', command: powerMatch[1].trim() });
            else if (cmdMatch) res.json({ shell: 'cmd', command: cmdMatch[1].trim() });
            else if (shellMatch) res.json({ shell: 'shell', command: shellMatch[1].trim() });
            else res.status(400).json({ error: '无法生成命令' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }
    router.post('/generate', generate);

    context.logger.info('CommandExecution plugin routes registered (persistent sessions)');

    return { router, detect, generate, execute };
};
