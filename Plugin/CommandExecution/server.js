module.exports = function(context) {
    const express = require('express');
    const { exec, spawn } = require('child_process');
    // spawn 用于流式执行命令，超时重置
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const router = express.Router();

    // ===== 持久会话管理 =====
    // 维护一个常驻 PowerShell 进程，用临时脚本文件 + 回显标记来执行命令
    const sessions = new Map();    // userToken → { child, stateFile, workDir, busy, resolve, buffer, timer }
    const runningProcs = new Map(); // requestId → child
    const SESSION_IDLE_TIMEOUT = 5 * 60 * 1000;

    function getSessionStateDir(userToken) {
        const d = path.join(__dirname, '../../data/plugin_data/CommandExecution/sessions', userToken);
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        return d;
    }

    function writeSessionState(userToken, cwd) {
        const stateDir = getSessionStateDir(userToken);
        fs.writeFileSync(path.join(stateDir, 'cwd.txt'), cwd, 'utf-8');
    }

    function readSessionCwd(userToken) {
        try {
            const f = path.join(getSessionStateDir(userToken), 'cwd.txt');
            return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8').trim() : null;
        } catch (e) { return null; }
    }

    // ---- 使用 spawn 执行命令，每有新行输出重置超时 ----
    // markerCmd: 用于输出标记的命令模板，默认为 PowerShell 的 Write-Host
    // 返回 { promise, child }，child 用于外部中断
    function spawnWithOutput(exe, args, scriptContent, workDir, timeout, tmpFile, marker, markerCmd, noBom) {
        const markerLine = (markerCmd || 'Write-Host') + ' "' + marker + '"';
        const fullScript = scriptContent + '\r\n' + markerLine + '\r\n';
        const prefix = noBom ? '' : '﻿';
        fs.writeFileSync(tmpFile, prefix + fullScript, 'utf-8');

        const child = spawn(exe, args, {
            cwd: workDir,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let completed = false;
        let timer;

        function resetTimer() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (!completed) {
                    try { child.kill('SIGTERM'); } catch (e) { try { child.kill(); } catch (e2) {} }
                }
            }, timeout);
        }

        resetTimer();

        child.stdout.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            if (str.includes('\n')) resetTimer();
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            if (str.includes('\n')) resetTimer();
        });

        child.on('close', (code) => {
            completed = true;
            clearTimeout(timer);
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            // 去掉 marker 及其痕迹（CMD 的 ECHO 会输出引号，Write-Host 不会）
            const markerQuoted = '"' + marker + '"';
            let mi = stdout.lastIndexOf(markerQuoted);
            if (mi !== -1) {
                stdout = stdout.substring(0, mi).replace(/\r?\n$/, '');
            } else {
                mi = stdout.lastIndexOf(marker);
                if (mi !== -1) {
                    stdout = stdout.substring(0, mi).replace(/\r?\n$/, '');
                }
            }
            if (_resolve) _resolve({ stdout, stderr, exitCode: code === null ? 1 : code });
        });

        child.on('error', () => {
            completed = true;
            clearTimeout(timer);
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            if (_resolve) _resolve({ stdout, stderr, exitCode: 1 });
        });

        let _resolve;
        const promise = new Promise((resolve) => { _resolve = resolve; });
        return { promise, child };
    }

    function killUserSession(userToken) {
        const s = sessions.get(userToken);
        if (s && s.child && !s.child.killed) {
            try { s.child.kill('SIGTERM'); } catch (e) {}
            sessions.delete(userToken);
        }
    }

    // ===== 停止执行 =====
    router.post('/stop', (req, res) => {
        const { requestId } = req.body;
        const userToken = req.userToken;

        if (requestId) {
            const entry = runningProcs.get(requestId);
            if (entry && entry.child) {
                try { entry.child.kill('SIGTERM'); } catch (e) { try { entry.child.kill(); } catch (e2) {} }
                runningProcs.delete(requestId);
            }
        }
        if (userToken) {
            killUserSession(userToken);
            for (const [rid, entry] of runningProcs) {
                if (entry && entry.child) {
                    try { entry.child.kill(); } catch (e) {}
                }
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

        const execTimeout = timeout || 8000;
        let workDir = workingDirectory || process.cwd();
        if (workDir === 'cwd') workDir = process.cwd();
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
            for (const p of [
                /\b(?:cd|chdir)\s+\.\.[\\/]/i, /\b(?:cd|chdir)\s+[\\/](?:\s|$|[&|;])/i,
                /\b(?:set-location|sl|pushd|push-location)\s+\.\.[\\/]/i,
                /[\s(]\.\.[\\/]/, /\\\\[^\\]+\\/i,
                /\breg\s+(?:add|delete|copy|save|restore)\s+/i, /\breg\.exe\s+(?:add|delete|copy|save|restore)\s+/i,
            ]) { if (p.test(command)) return res.status(403).json({ error: '安全策略拦截：路径穿越' }); }
            const driveRegex = /[A-Za-z]:\\/g;
            let m;
            while ((m = driveRegex.exec(command)) !== null) {
                const rest = command.substring(m.index);
                const end = rest.search(/[\s"'&|;<>()]/);
                const candidate = (end === -1 ? rest : rest.substring(0, end)).trim();
                if (candidate && isPathOutside(candidate)) return res.status(403).json({ error: '安全策略拦截：外部路径' });
            }
        }

        context.logger.info('[exec] ' + shell + '> ' + command);

        const sysRoot = process.env.SystemRoot || 'C:\\Windows';
        const psPath = sysRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

        // ---- shell 命令 ----
        if (shell === 'shell') {
            const isWin = os.platform() === 'win32';
            if (isWin) {
                const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
                if (!fs.existsSync(gitBash)) return res.status(400).json({ error: 'Shell 需要 Git Bash' });
                const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
                fs.writeFileSync(tmpSh, command, 'utf-8');
                const child = exec('"' + gitBash + '" "' + tmpSh + '"', {
                    timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024,
                    windowsHide: true, encoding: 'buffer',
                }, (error, stdout, stderr) => {
                    try { fs.unlinkSync(tmpSh); } catch (e) {}
                    finishExec(error, stdout, stderr);
                });
                if (requestId) runningProcs.set(requestId, child);
            } else {
                const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
                fs.writeFileSync(tmpSh, command, 'utf-8');
                const child = exec('/bin/bash "' + tmpSh + '"', {
                    timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024, encoding: 'buffer',
                }, (error, stdout, stderr) => {
                    try { fs.unlinkSync(tmpSh); } catch (e) {}
                    finishExec(error, stdout, stderr);
                });
                if (requestId) runningProcs.set(requestId, child);
            }
            return;
        }

        // ---- PowerShell / CMD：构建脚本 ----
        // 恢复持久工作目录
        const prevCwd = readSessionCwd(req.userToken);
        let effectiveWorkDir = prevCwd || workDir;
        if (!fs.existsSync(effectiveWorkDir)) effectiveWorkDir = workDir;

        const marker = '__EX_DONE_' + Date.now().toString(36) + '__';
        let result;

        if (shell === 'powershell') {
            const psScript = 'chcp 65001 > $null\r\n' +
                '[Console]::InputEncoding = [System.Text.Encoding]::UTF8\r\n' +
                '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n' +
                '$OutputEncoding = [System.Text.Encoding]::UTF8\r\n' +
                "$PSDefaultParameterValues['*:Encoding'] = 'utf8'\r\n" +
                'Set-Location "' + effectiveWorkDir.replace(/"/g, '""') + '"\r\n' +
                command;
            const tmpFile = path.join(workDir, '_ps_tmp_' + Date.now() + '.ps1');
            const { promise, child } = spawnWithOutput(
                psPath,
                ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
                psScript, effectiveWorkDir, execTimeout, tmpFile, marker
            );
            const procEntry = { child, tmpFile };
            if (requestId) runningProcs.set(requestId, procEntry);
            result = await promise;
            if (requestId) runningProcs.delete(requestId);
        } else {
            // CMD：直接用 cmd.exe + .bat 文件执行，显示命令本身但不显示标记
            const cmdPath = sysRoot + '\\System32\\cmd.exe';
            const tmpFile = path.join(workDir, '_cmd_tmp_' + Date.now() + '.bat');
            const fullScript = '@chcp 65001 > nul\r\n' + command + '\r\n';
            fs.writeFileSync(tmpFile, fullScript, 'utf-8');

            const child = spawn(cmdPath, ['/c', tmpFile], {
                cwd: effectiveWorkDir,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let cmdStdout = '';
            let cmdStderr = '';
            let cmdCompleted = false;
            let cmdTimer;

            function resetCmdTimer() {
                if (cmdTimer) clearTimeout(cmdTimer);
                cmdTimer = setTimeout(() => {
                    if (!cmdCompleted) { try { child.kill('SIGTERM'); } catch (e) { try { child.kill(); } catch (e2) {} } }
                }, execTimeout);
            }
            resetCmdTimer();

            child.stdout.on('data', (data) => { cmdStdout += data.toString(); if (data.toString().includes('\n')) resetCmdTimer(); });
            child.stderr.on('data', (data) => { cmdStderr += data.toString(); if (data.toString().includes('\n')) resetCmdTimer(); });

            const cmdProcessPromise = new Promise((resolve) => {
                child.on('close', (code) => {
                    cmdCompleted = true;
                    clearTimeout(cmdTimer);
                    try { fs.unlinkSync(tmpFile); } catch (e) {}
                    resolve({ stdout: cmdStdout, stderr: cmdStderr, exitCode: code === null ? 1 : code });
                });
                child.on('error', () => {
                    cmdCompleted = true;
                    clearTimeout(cmdTimer);
                    try { fs.unlinkSync(tmpFile); } catch (e) {}
                    resolve({ stdout: cmdStdout, stderr: cmdStderr, exitCode: 1 });
                });
            });

            const procEntry = { child, tmpFile };
            if (requestId) runningProcs.set(requestId, procEntry);
            result = await cmdProcessPromise;
            if (requestId) runningProcs.delete(requestId);
        }

        // 保存工作目录（持久化 cd 效果）
        writeSessionState(req.userToken, effectiveWorkDir);

        const duration = Date.now() - startTime;
        context.logger.info('[exec] ' + shell + ' exit=' + result.exitCode + ' dur=' + duration + 'ms');
        res.json(result);

        function finishExec(error, stdout, stderr) {
            const duration = Date.now() - startTime;
            const decode = (buf) => !buf || buf.length === 0 ? '' : new TextDecoder('utf-8', { fatal: false }).decode(buf);
            const result = {
                stdout: decode(stdout), stderr: decode(stderr),
                exitCode: error ? (error.code || 1) : 0,
                duration, shell, command,
            };
            if (error && !result.stderr) result.stderr = error.message;
            context.logger.info('[exec] ' + shell + ' exit=' + result.exitCode + ' dur=' + duration + 'ms');
            if (requestId) runningProcs.delete(requestId);
            res.json(result);
        }
    }
    router.post('/execute', execute);

    // ---- detect / generate ----
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

    context.logger.info('CommandExecution plugin routes registered');
    return { router, detect, generate, execute };
};
