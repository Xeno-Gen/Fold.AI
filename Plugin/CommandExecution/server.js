module.exports = function(context) {
    const express = require('express');
    const { exec } = require('child_process');
    const os = require('os');
    const router = express.Router();

    // ---- detect: 检测用户输入是否需要执行命令 ----
    async function detect(req, res) {
        try {
            const { messages, provider, model } = req.body;

            if (!messages || !provider || !model) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            const apiKey = context.getUserProviderKey(req.userToken, provider);
            const baseUrl = context.getUserProviderUrl(provider);

            if (!apiKey || !baseUrl) {
                return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            }

            const detectSystemPrompt = `判断用户是否需要执行系统命令，只需回答是或否。
如果需要则输出: YES
如果不需要则输出: 无`;

            const detectMessages = [
                { role: "system", content: detectSystemPrompt },
                ...messages.slice(-2)
            ];

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: detectMessages,
                    temperature: 0.01,
                    max_tokens: 100,
                    stream: false,
                })
            });

            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: err });
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            if (content.trim().toUpperCase().includes('YES')) {
                return res.json({ tool_calls: ['CommandExecution'] });
            }
            res.json({ tool_calls: [] });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
    router.post('/detect', detect);

    // ---- generate: 由聊天模型生成具体的命令内容 ----
    async function generate(req, res) {
        try {
            const { messages, provider, model } = req.body;

            if (!messages || !provider || !model) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            const apiKey = context.getUserProviderKey(req.userToken, provider);
            const baseUrl = context.getUserProviderUrl(provider);

            if (!apiKey || !baseUrl) {
                return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            }

            const cmdPrompt = `用户需要执行系统命令。请根据对话内容，输出具体的命令。
使用标签格式: <power:PowerShell命令> 或 <cmd:CMD命令> 或 <shell:Shell命令>
只输出标签，不要添加其他内容。`;

            const genMessages = [
                { role: "system", content: cmdPrompt },
                ...messages.slice(-3)
            ];

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: genMessages,
                    temperature: 0.1,
                    max_tokens: 300,
                    stream: false,
                })
            });

            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: err });
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const powerMatch = content.match(/<power:(.+?)>/i);
            const cmdMatch = content.match(/<cmd:(.+?)>/i);
            const shellMatch = content.match(/<shell:(.+?)>/i);

            if (powerMatch) {
                res.json({ shell: 'powershell', command: powerMatch[1].trim() });
            } else if (cmdMatch) {
                res.json({ shell: 'cmd', command: cmdMatch[1].trim() });
            } else if (shellMatch) {
                res.json({ shell: 'shell', command: shellMatch[1].trim() });
            } else {
                res.status(400).json({ error: '无法生成命令' });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
    router.post('/generate', generate);

    // ---- execute: 执行命令（统一通过 PowerShell 保证 UTF-8 输出） ----
    // 快照工作目录文件状态（用于检测命令执行后的文件变动）
    function snapshotFiles(workDir) {
        const fs = require('fs');
        const path = require('path');
        const snap = {};
        try {
            if (!fs.existsSync(workDir)) return snap;
            const items = fs.readdirSync(workDir);
            for (const name of items) {
                const fp = path.join(workDir, name);
                try {
                    const stat = fs.statSync(fp);
                    if (stat.isFile() && !name.endsWith('.bak') && !name.startsWith('_ps_tmp_') && !name.startsWith('_sh_tmp_')) {
                        snap[name] = { mtime: stat.mtimeMs, size: stat.size };
                    }
                } catch(e) {}
            }
        } catch(e) {}
        return snap;
    }

    // 对比快照，为变动的文件创建 .bak 备份
    function createBaksForChanged(workDir, beforeSnap) {
        const after = snapshotFiles(workDir);
        for (const name in after) {
            const a = beforeSnap[name];
            const b = after[name];
            if (a && b && (a.mtime !== b.mtime || a.size !== b.size)) {
                const fp = require('path').join(workDir, name);
                try {
                    const fs = require('fs');
                    const bakPath = fp + '.bak';
                    if (!fs.existsSync(bakPath)) {
                        fs.copyFileSync(fp, bakPath);
                        context.logger.info('[bak] created: ' + bakPath);
                    }
                } catch(e) {
                    context.logger.warn('[bak] failed for ' + name + ': ' + e.message);
                }
            }
        }
    }

    function execute(req, res) {
        const startTime = Date.now();
        const { shell, command, timeout, workingDirectory, sandbox } = req.body;

        if (!command) {
            return res.status(400).json({ error: '缺少命令内容' });
        }

        if (shell !== 'powershell' && shell !== 'cmd' && shell !== 'shell') {
            return res.status(400).json({ error: '不支持的Shell类型' });
        }

        const execTimeout = timeout || 30000;
        const fs = require('fs');
        const path = require('path');
        let workDir = workingDirectory || process.cwd();
        if (workDir === 'cwd') {
            workDir = path.join(__dirname, '../../../cwd');
        }
        if (!path.isAbsolute(workDir)) {
            workDir = path.resolve(workDir);
        }
        if (!fs.existsSync(workDir)) {
            try { fs.mkdirSync(workDir, { recursive: true }); } catch (e) { workDir = process.cwd(); }
        }

        const dangerousPatterns = [
            /rm\s+-rf/i,
            /(?:^|[&|;])\s*format\s+[a-z]:/i,
            /del\s+\/f/i,
            /rd\s+\/s/i,
            /shutdown/i,
            /restart-computer/i,
            /stop-computer/i,
            /sudo\s+rm\s+-rf/i,
            />\s*\/dev\/sda/i,
            /dd\s+if=/i,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return res.status(403).json({ error: '危险命令被拦截' });
            }
        }

        if (sandbox !== false) {
            // === 工作目录沙箱：阻止路径穿越 ===
            const workDirResolved = path.resolve(workDir);
            const workDirLower = workDirResolved.toLowerCase();
            const cmdLower = command.toLowerCase();

            function isPathOutsideWorkDir(absPath) {
                try {
                    const resolved = path.resolve(absPath).toLowerCase();
                    return resolved !== workDirLower && !resolved.startsWith(workDirLower + path.sep) && !resolved.startsWith(workDirLower + '/');
                } catch (e) { return true; }
            }

            const pathEscapePatterns = [
                /\b(?:cd|chdir)\s+\.\.[\\/]/i,
                /\b(?:cd|chdir)\s+[\\/](?:\s|$|[&|;])/i,
                /\b(?:set-location|sl|pushd|push-location)\s+\.\.[\\/]/i,
                /[\s(]\.\.[\\/]/,
                /\\\\[^\\]+\\/i,
                /\breg\s+(?:add|delete|copy|save|restore)\s+/i,
                /\breg\.exe\s+(?:add|delete|copy|save|restore)\s+/i,
            ];

            for (const pattern of pathEscapePatterns) {
                if (pattern.test(command)) {
                    context.logger.warn('[sandbox] blocked path escape: ' + command.substring(0, 120));
                    return res.status(403).json({ error: '安全策略拦截：命令试图访问工作目录外的路径' });
                }
            }

            const driveLetterRegex = /[A-Za-z]:\\/g;
            let pathMatch;
            while ((pathMatch = driveLetterRegex.exec(command)) !== null) {
                const idx = pathMatch.index;
                const rest = command.substring(idx);
                const endIdx = rest.search(/[\s"'&|;<>()]/);
                const pathCandidate = (endIdx === -1 ? rest : rest.substring(0, endIdx)).trim();
                if (pathCandidate && isPathOutsideWorkDir(pathCandidate)) {
                    context.logger.warn('[sandbox] blocked absolute path outside workDir: ' + pathCandidate);
                    return res.status(403).json({ error: '安全策略拦截：命令包含工作目录外的绝对路径' });
                }
            }
        }

        const sysRoot = process.env.SystemRoot || 'C:\\Windows';
        const psPath = sysRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

        // 统一写临时 .ps1 脚本执行，保证 UTF-8
        const tmpFile = path.join(workDir, '_ps_tmp_' + Date.now() + '.ps1');

        let psScript;
        if (shell === 'powershell') {
            psScript = 'chcp 65001 > $null\n' +
                '[Console]::InputEncoding = [System.Text.Encoding]::UTF8\n' +
                '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n' +
                '$OutputEncoding = [System.Text.Encoding]::UTF8\n' +
                "$PSDefaultParameterValues['*:Encoding'] = 'utf8'\n" +
                command;
        } else if (shell === 'shell') {
            // Linux shell (bash), on Windows try Git Bash or WSL
            const isWin = os.platform() === 'win32';
            if (isWin) {
                const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
                if (fs.existsSync(gitBash)) {
                    const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
                    fs.writeFileSync(tmpSh, command, 'utf-8');
                    const shSnap1 = snapshotFiles(workDir);
                    context.logger.info('[exec] shell> ' + command + ' (via Git Bash)');
                    context.logger.info('[exec] shell via Git Bash: ' + command.substring(0, 100));
                    exec('"' + gitBash + '" "' + tmpSh + '"', { timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'buffer' }, (error, stdout, stderr) => {
                        try { fs.unlinkSync(tmpSh); } catch(e) {}
                        try { createBaksForChanged(workDir, shSnap1); } catch(e) { context.logger.error('[bak] error: ' + e.message); }
                        handleResult(error, stdout, stderr, startTime);
                    });
                    return;
                }
                // No Git Bash, fall through to error
                return res.status(400).json({ error: 'Shell (bash) 在 Windows 上需要安装 Git Bash' });
            }
            // Linux: use /bin/bash directly
            const tmpSh = path.join(workDir, '_sh_tmp_' + Date.now() + '.sh');
            fs.writeFileSync(tmpSh, command, 'utf-8');
            const shSnap2 = snapshotFiles(workDir);
            context.logger.info('[exec] shell> ' + command);
            exec('/bin/bash "' + tmpSh + '"', { timeout: execTimeout, cwd: workDir, maxBuffer: 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
                try { fs.unlinkSync(tmpSh); } catch(e) {}
                try { createBaksForChanged(workDir, shSnap2); } catch(e) { context.logger.error('[bak] error: ' + e.message); }
                handleResult(error, stdout, stderr, startTime);
            });
            return;
        } else {
            // CMD 也走 PowerShell，输出统一 UTF-8
            const safeCmd = command.replace(/'/g, "''");
            psScript = 'chcp 65001 > $null\n' +
                '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n' +
                '$OutputEncoding = [System.Text.Encoding]::UTF8\n' +
                "& cmd /c '" + safeCmd + "'";
        }

        fs.writeFileSync(tmpFile, '﻿' + psScript, 'utf-8');
        const shellCommand = '"' + psPath + '" -NoProfile -ExecutionPolicy Bypass -File "' + tmpFile + '"';

        context.logger.info('[exec] ' + shell + '> ' + command);

        const fileSnapBefore = snapshotFiles(workDir);
        exec(shellCommand, {
            timeout: execTimeout,
            cwd: workDir,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            encoding: 'buffer',
        }, (error, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch(e) {}
            createBaksForChanged(workDir, fileSnapBefore);
            handleResult(error, stdout, stderr, startTime);
        });

        function handleResult(error, stdout, stderr, startTime) {
            try {
                const duration = Date.now() - startTime;

                const decode = (buf) => {
                    if (!buf || buf.length === 0) return '';
                    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
                };

                const result = {
                    stdout: decode(stdout),
                    stderr: decode(stderr),
                    exitCode: error ? (error.code || 1) : 0,
                    duration,
                    shell,
                    command,
                };

                if (error && !result.stderr) {
                    result.stderr = error.message;
                }

                context.logger.info('[exec] shell=' + shell + ' exit=' + result.exitCode + ' dur=' + duration + 'ms');
                res.json(result);
            } catch (e) {
                context.logger.error('[exec] handleResult error: ' + e.message + ' ' + e.stack);
                if (!res.headersSent) res.status(500).json({ error: e.message });
            }
        }
    }
    router.post('/execute', execute);

    context.logger.info('CommandExecution plugin routes registered');

    // Return router AND named handlers for backward compat delegation
    return { router, detect, generate, execute };
};
