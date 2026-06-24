// chat.js — Chat flow, Agent loop, Tool processing, API calls
// Depends on intro.js (loaded first) for all globals and utility functions
    function autoScroll() {
        if (isUserScrolledAway) return;
        requestAnimationFrame(function() {
            if (!isUserScrolledAway && chatArea) {
                var orig = chatArea.style.scrollBehavior;
                chatArea.style.scrollBehavior = 'auto';
                chatArea.scrollTop = chatArea.scrollHeight;
                chatArea.style.scrollBehavior = orig;
            }
        });
    }

    async function processToolCalls(responseText) {
        // First try to parse commands from <Plugin-cmd> blocks (wrapped = safe)
        var pluginCmdRegex = /<Plugin-cmd>([\s\S]*?)<\/Plugin-cmd>/gi;
        var pExecText = '';
        var blockMatch;
        while ((blockMatch = pluginCmdRegex.exec(responseText)) !== null) {
            pExecText += blockMatch[1] + '\n';
        }
        var useSummary = !!pExecText.trim();
        var effectiveText = useSummary ? pExecText : responseText;

        // Parse <cwd> to change working directory
        var cwdRegex = /<cwd>([\s\S]*?)<\/cwd>/gi;
        var cwdMatch;
        while ((cwdMatch = cwdRegex.exec(effectiveText)) !== null) {
            var newDir = cwdMatch[1].trim();
            if (newDir && window.CommandExecutionPlugin) {
                window.CommandExecutionPlugin.workingDirectory = newDir;
            }
        }

        // Parse command tags
        var commands = [];
        var powerRegex = /<power>([\s\S]*?)<\/power>/gi;
        var psRegex = /<powershell>([\s\S]*?)<\/powershell>/gi;
        var cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/gi;
        var shellRegex = /<shell>([\s\S]*?)<\/shell>/gi;
        var match;
        while ((match = powerRegex.exec(effectiveText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = psRegex.exec(effectiveText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = cmdRegex.exec(effectiveText)) !== null) {
            commands.push({ idx: commands.length, shell: 'cmd', command: match[1].trim() });
        }
        while ((match = shellRegex.exec(effectiveText)) !== null) {
            commands.push({ idx: commands.length, shell: 'shell', command: match[1].trim() });
        }
        if (commands.length === 0) return false;
        // Stop all streaming command timers since we're about to execute for real
        for (var bid in pluginBlockTimers) {
            if (pluginBlockTimers[bid] && pluginBlockTimers[bid].type === 'cmd') pluginBlockTimers[bid].done = true;
        }

        var dangerous = [/rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i, /rd\s+\/s/i, /shutdown/i, /sudo\s+rm\s+-rf/i, />\s*\/dev\/sda/i, /dd\s+if=/i, /:\(\)\s*\{/i];
        var summaryResults = [];
        var preSummaryMsgs = [];
        for (var ci = 0; ci < commands.length; ci++) {
            var cmd = commands[ci];
            if (currentAbortController && currentAbortController.signal.aborted) break;
            if (dangerous.some(function(p) { return p.test(cmd.command); })) {
                var msg = { role: 'tool', content: _('dangerousBlocked') + cmd.command, images: [], _isExec: true, _execTitle: '危险命令' };
                preSummaryMsgs.push(msg);
                addMessage(msg.content, 'tool', [], null, msg);
                continue;
            }
            if (commandConfirmEnabled && window.CommandExecutionPlugin) {
                try {
                    if (!(await window.CommandExecutionPlugin.confirmCommand(cmd.shell, cmd.command))) {
                        var msg = { role: 'tool', content: _('cmdCancelled') + cmd.shell + ' ' + cmd.command, images: [], _isExec: true, _execTitle: '已取消' };
                        preSummaryMsgs.push(msg);
                        if (useSummary) addMessage(msg.content, 'tool', [], null, msg);
                        continue;
                    }
                } catch (e) {
                    console.error('[命令确认] 确认弹窗失败，直接执行:', e);
                }
            }
            try {
                var workDir = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir;
                var abortSignal = currentAbortController ? currentAbortController.signal : undefined;
                var res = await fetch('/api/plugin/CommandExecution/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shell: cmd.shell, command: cmd.command, timeout: 30000, workingDirectory: workDir, sandbox: typeof sandboxEnabled !== 'undefined' ? sandboxEnabled : true, requestId: currentRequestId }), signal: abortSignal });
                if (res.ok) {
                    var d = await res.json();
                    // 从后端同步工作目录
                    if (d.workDir && window.CommandExecutionPlugin) {
                        window.CommandExecutionPlugin.workingDirectory = d.workDir;
                    }
                    summaryResults.push({ cmd: cmd, exitCode: d.exitCode, stdout: d.stdout || "", stderr: d.stderr || "" });
                } else {
                    var errText = await res.text();
                    summaryResults.push({ cmd: cmd, exitCode: -1, stdout: '', stderr: errText });
                }
            } catch (e) {
                summaryResults.push({ cmd: cmd, exitCode: -1, stdout: '', stderr: e.message });
            }
        }

        console.log('[processToolCalls] useSummary:', useSummary, 'preSummaryMsgs:', preSummaryMsgs.length, 'summaryResults:', summaryResults.length, 'commands found:', commands.length);

        // Save pre-summary messages to chat history
        if (preSummaryMsgs.length > 0) {
            preSummaryMsgs.forEach(function(m) { chats[currentChat].push(m); });
        }

        if (summaryResults.length > 0) {
            // 保存执行结果到全局队列，等气泡渲染完成后由 __injectCmdResults 注入（避免 bubble.replaceWith 丢失结果）
            summaryResults.forEach(function(r) {
                window.__pendingExecResults.push(r);
                // 保存单条执行记录到历史
                var rawOut = r.stdout || r.stderr || '';
                var out = rawOut.trim();
                var bodyContent = (rawOut ? (out || rawOut) : _('noOutput')) + '\n' + _('exitCode') + r.exitCode;
                var title = r.cmd.shell + ' ' + (r.cmd.command.length > 50 ? r.cmd.command.substring(0, 47) + '...' : r.cmd.command);
                var sysMsg = { role: 'tool', content: bodyContent, images: [], _isExec: true, _execTitle: title, _execCommand: r.cmd.command.trim(), _execStdout: r.stdout || '', _execStderr: r.stderr || '', _execExitCode: r.exitCode, _execShell: r.cmd.shell, _time: new Date().toISOString() };
                chats[currentChat].push(sysMsg);
            });
            if (emptyHint) emptyHint.style.display = 'none';
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        await saveChatToBackend();
        return summaryResults.length > 0 || preSummaryMsgs.length > 0;

    }

    async function processMemoryCalls(responseText) {
        // Parse <mem:key>content</mem> tags
        var memRegex = /<mem:([^>]+)>([\s\S]*?)<\/mem>/gi;
        var memDelRegex = /<mem-del:([^>]+)>/gi;
        var anyMemOp = false;
        var match;
        while ((match = memRegex.exec(responseText)) !== null) {
            var key = match[1].trim();
            var content = match[2].trim();
            if (!key || !content) continue;
            try {
                var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: content })
                });
                if (res.ok) {
                    var matchedBid = null;
                    for (var bid in pluginBlockTimers) {
                        var t = pluginBlockTimers[bid];
                        if (t && t.type === 'mem' && t.key === key.trim()) { matchedBid = bid; break; }
                    }
                    var resultTitle = '记忆已保存: ' + key.trim();
                    var resultBody = content;
                    var msg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle };
                    chats[currentChat].push(msg);
                    if (matchedBid) {
                        var target = document.getElementById(matchedBid);
                        if (target) {
                            updateCmdBlock(target, resultTitle, resultBody);
                        }
                    } else {
                        chatAreaInner.appendChild(createCmdBlock(resultTitle, resultBody));
                        if (emptyHint) emptyHint.style.display = 'none';
                    }
                    anyMemOp = true;
                }
            } catch (e) {}
        }
        while ((match = memDelRegex.exec(responseText)) !== null) {
            var key = match[1].trim();
            if (!key) continue;
            try {
                var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), { method: 'DELETE' });
                if (res.ok) {
                    var matchedBid = null;
                    for (var bid in pluginBlockTimers) {
                        var t = pluginBlockTimers[bid];
                        if (t && t.type === 'mem' && t.key === key.trim()) { matchedBid = bid; break; }
                    }
                    var resultTitle = '记忆已删除: ' + key.trim();
                    var resultBody = '';
                    var msg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle };
                    chats[currentChat].push(msg);
                    if (matchedBid) {
                        var target = document.getElementById(matchedBid);
                        if (target) {
                            updateCmdBlock(target, resultTitle, resultBody);
                        }
                    } else {
                        chatAreaInner.appendChild(createCmdBlock(resultTitle, resultBody));
                        if (emptyHint) emptyHint.style.display = 'none';
                    }
                    anyMemOp = true;
                }
            } catch (e) {}
        }
        if (memRegex.lastIndex > 0 || memDelRegex.lastIndex > 0) saveChatToBackend();
        // reset lastIndex for future calls
        memRegex.lastIndex = 0;
        memDelRegex.lastIndex = 0;
        await refreshMemories();
        return anyMemOp;
    }

    // 从 pluginPrompts 模板构建工具提示词
    function buildToolPrompt() {
        var parts = [];
        if (agentEnabled && pluginPrompts.Agent) {
            parts.push(pluginPrompts.Agent);
        }
        if (commandExecEnabled && pluginPrompts.Command) {
            parts.push(pluginPrompts.Command);
        }
        if (memoryEnabled && pluginPrompts.Memory) {
            parts.push(pluginPrompts.Memory);
        }
        if (commandExecEnabled) {
            var wd = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || '';
            parts.push('默认工作目录为' + wd + '，所有命令默认在此目录执行');
        }
        return parts.join('\n').trim();
    }

    function compressOldExecMessages(msgs) {
        if (!compressOldExecutions) return msgs;
        var userCount = 0;
        var boundaryIndex = -1;
        for (var i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') {
                userCount++;
                if (userCount >= 5) {
                    boundaryIndex = i;
                    break;
                }
            }
        }
        if (boundaryIndex === -1) return msgs;
        for (var i = 0; i < boundaryIndex; i++) {
            if (msgs[i]._isExec && (msgs[i].role === 'system' || msgs[i].role === 'tool' || msgs[i].role === 'user')) {
                msgs[i] = { role: 'tool', content: '<End_Tool>', images: [], _isExec: true };
            }
        }
        return msgs;
    }

    function reorderMessages(msgs) {
        // 旧的分离式工具提示词合并到第一条 system 消息，其余保持原有顺序
        var toolTexts = [];
        var rest = [];
        msgs.forEach(function(m) {
            if (m.role === 'system' && (
                m.content.indexOf('[工具调用能力]') !== -1 ||
                m.content.indexOf('[Agent能力]') !== -1 ||
                m.content.indexOf('[追加调用]') !== -1
            )) {
                toolTexts.push(m.content);
            } else {
                rest.push(m);
            }
        });
        if (toolTexts.length > 0) {
            // 工具提示词必须放在最前面，独立成一条 system 消息
            rest.unshift({ role: 'system', content: toolTexts.join('\n'), images: [] });
        }
        return rest;
    }

    async function callAgentAPI(messages) {
        if (!currentModel) throw new Error(_('noModel'));
        var requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        currentRequestId = requestId;
        var payload = {
            messages: messages, provider: currentProvider, model: currentModel,
            chatFormat: currentChatFormat, requestId: requestId,
            maxIterations: agentMaxIterations || 10,
            temperature: currentParams.temperature,
            top_p: currentParams.top_p,
            max_tokens: currentParams.max_tokens,
            sandbox: typeof sandboxEnabled !== 'undefined' ? sandboxEnabled : true,
            workingDirectory: (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || '',
        };
        if (currentProvider && currentProvider.startsWith('custom_')) {
            try { var cpl = JSON.parse(localStorage.getItem('fold_custom_providers') || '[]'); var cp = cpl.find(function(p) { return p.id === currentProvider; }); if (cp && cp.url) payload.customProviderUrl = cp.url; } catch (e) {}
        }
        currentAbortController = new AbortController();
        var controller = currentAbortController;
        var res = await fetch('/api/chat/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!res.ok) { var err = await res.text(); throw new Error(err); }
        return { body: res.body, apiRequest: payload, requestId: requestId };
    }

    async function callAPI(messages, extraOpts) {
        if (!currentModel) throw new Error(_('noModel'));
        console.log('[API] 发起请求, 消息数:', messages.length, '模型:', currentModel, '提供商:', currentProvider);
        var requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        currentRequestId = requestId;
        var payload = { messages: messages, provider: currentProvider, model: currentModel, chatFormat: currentChatFormat };
        // 自定义提供商：传入 URL 供服务端代理请求
        if (currentProvider && currentProvider.startsWith('custom_')) {
            try {
                var cpList = JSON.parse(localStorage.getItem('fold_custom_providers') || '[]');
                var cp = cpList.find(function(p) { return p.id === currentProvider; });
                if (cp && cp.url) payload.customProviderUrl = cp.url;
            } catch (e) {}
        }
        Object.keys(currentParams).forEach(function(k) { if (currentParams[k] != null) payload[k] = currentParams[k]; });
        // extraOpts 覆盖当前参数（用于保底机制等场景）
        if (extraOpts) {
            Object.keys(extraOpts).forEach(function(k) { if (extraOpts[k] != null) payload[k] = extraOpts[k]; });
        }
        payload.stream = streamEnabled;
        payload.requestId = requestId;
        if (currentThinkMode !== 'fast') payload.deep_think = true;
        payload.thinkMode = currentThinkMode;
        if (typeof maxContextTokens !== 'undefined') payload.maxContextTokens = maxContextTokens;
        currentAbortController = new AbortController();
        var controller = currentAbortController;
        var res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!res.ok) { var err = await res.text(); throw new Error(err); }
        if (streamEnabled) return { body: res.body, apiRequest: payload };
        var json = await res.json();
        return { json: json, apiRequest: payload };
    }

    async function sendMessage(isRegenerate, targetMsgRef, targetBubble) {
        if (streaming && !isRegenerate) return;
        if (!currentModel) { showToast(_('selectModel')); return; }
        if (typeof _initReady !== 'undefined' && _initReady) await _initReady;
        console.log('[发送] 开始发送消息, 模型:', currentModel, '提供商:', currentProvider, '思考模式:', currentThinkMode, '格式:', currentChatFormat, '参数:', JSON.stringify({ temperature: currentParams.temperature, max_tokens: currentParams.max_tokens, top_p: currentParams.top_p }));

        // 先读取输入内容（必须在 newChat 之前，因为之后 isChatActive 会变化）
        var fromCenter = !isChatActive;
        var ta = fromCenter ? initText : chatText;
        var target = fromCenter ? 'initial' : 'chat';
        var userText = ta.value.trim();
        var textFiles = activeFiles[target].filter(function(f) { return f.type === 'text'; });
        var imageFiles = activeFiles[target].filter(function(f) { return f.type === "image"; });
        var videoFiles = activeFiles[target].filter(function(f) { return f.type === 'video'; });
        var imgs = imageFiles.map(function(f) { return f.content; });
        if (!isRegenerate && !userText && !imgs.length && !textFiles.length) return;

        // 如果是开幕输入框首次发送，创建对话并确认到后端
        if (fromCenter) {
            var newToken = generateToken();
            var newId = chats.length;
            chats.push([]);
            chatTitles.push('');
            chatTokens.push(newToken);
            currentChat = newId;
            if (!isChatActive) activateChat(true);
            updateUrlWithToken();
            try {
                var res = await fetch('/api/chats', { method: 'POST' });
                if (res.ok) {
                    var data = await res.json();
                    var realId = data.id;
                    var savedToken = data.token || newToken;
                    chats.splice(newId, 1);
                    chatTitles.splice(newId, 1);
                    chatTokens.splice(newId, 1);
                    while (chats.length <= realId) { chats.push([]); chatTitles.push(''); chatTokens.push(''); }
                    chats[realId] = []; chatTitles[realId] = ''; chatTokens[realId] = savedToken;
                    currentChat = realId;
                    updateUrlWithToken();
                }
            } catch (e) {}
        }
        if (!isRegenerate) {
            // 构建文件卡片数据，附加到 userMsg 用于持久化展示
            var allFiles = textFiles.concat(imageFiles).concat(videoFiles);
            var userMsg = { role: 'user', content: userText || '', images: imgs };
            if (allFiles.length > 0) {
                userMsg._files = allFiles.map(function(f) { return { type: f.type, fileName: f.fileName, content: f.content }; });
                // 将文本文件内容拼入 user 消息，替代独立的 tool 消息
                var textContents = textFiles.map(function(f) { return _('filePrefix') + f.fileName + ']\n' + f.content; });
                if (textContents.length > 0) {
                    userMsg.content = (userText ? userText + '\n\n' : '') + textContents.join('\n\n');
                }
            }
            chats[currentChat].push(userMsg);
            saveChatToBackend();

            // 显示用户气泡（文字 / 图片 / 视频 / 文件的文件卡片通过 userMsg._files 渲染）
            if (userText) {
                addMessage(userText, 'user', imgs, null, userMsg);
            } else if (imgs.length > 0 || allFiles.length > 0) {
                addMessage('', 'user', imgs, null, userMsg);
            }
            // grid 已通过 userMsg._files 在 createMessageBubble 中渲染，无需重复追加
            ta.value = '';
            ta.style.height = 'auto';
            activeFiles[target] = [];
            renderPreviews(isChatActive ? chatPreview : initPreview, []);
            updateSendBtn();
        }

        streaming = true;
        isUserScrolledAway = false;
        updateSendBtn();

        var pendingVersionData = null;

        if (isRegenerate) {
            // 找到要重新生成的消息及其前面的用户消息
            var targetMsg = null;
            var targetMsgIdx = -1;
            var precedingUserIdx = -1;
            if (targetMsgRef) {
                targetMsgIdx = chats[currentChat].indexOf(targetMsgRef);
                if (targetMsgIdx !== -1) {
                    targetMsg = targetMsgRef;
                    for (var pi = targetMsgIdx - 1; pi >= 0; pi--) {
                        if (chats[currentChat][pi].role === 'user') { precedingUserIdx = pi; break; }
                    }
                }
            } else {
                // 向后兼容：从末尾找最后一条 AI 和其前面的用户
                for (var rmi = chats[currentChat].length - 1; rmi >= 0; rmi--) {
                    if (chats[currentChat][rmi].role === 'assistant') { targetMsgIdx = rmi; targetMsg = chats[currentChat][rmi]; break; }
                }
                for (var rmi = targetMsgIdx - 1; rmi >= 0; rmi--) {
                    if (chats[currentChat][rmi].role === 'user') { precedingUserIdx = rmi; break; }
                }
            }

            if (targetMsg && precedingUserIdx !== -1) {
                // 保存旧版本数据
                pendingVersionData = {
                    content: targetMsg.content,
                    reasoning: targetMsg.reasoning || null,
                    versions: (targetMsg._versions || []).slice()
                };
                console.log('[版本] 重新生成 idx=' + targetMsgIdx + ' 前用户=' + precedingUserIdx);

                // 将后续消息保存为分支数据，然后截断
                var branchMsgs = chats[currentChat].splice(precedingUserIdx + 1);
                // branchMsgs 包含目标 AI 及其后的所有消息
                // 初始化分支存储
                if (!chatBranches[currentChat]) chatBranches[currentChat] = [];
                chatBranches[currentChat].push({
                    fromMsgIdx: precedingUserIdx + 1,
                    messages: branchMsgs,
                    label: '分支 ' + (chatBranches[currentChat].length + 1),
                    createdAt: Date.now()
                });
                if (typeof saveBranches === 'function') saveBranches();

                // 移除 DOM 气泡：从目标 AI 开始到末尾
                var allBubbles = chatAreaInner.querySelectorAll('.message-bubble');
                var targetDomIdx = -1;
                for (var abi = 0; abi < allBubbles.length; abi++) {
                    if (targetBubble && allBubbles[abi] === targetBubble) { targetDomIdx = abi; break; }
                }
                if (targetDomIdx === -1) {
                    // 回退：移除最后一条用户消息后的气泡
                    var lastUserDomIdx = -1;
                    for (var abi = 0; abi < allBubbles.length; abi++) {
                        if (allBubbles[abi].classList.contains('message-user')) lastUserDomIdx = abi;
                    }
                    targetDomIdx = lastUserDomIdx;
                }
                for (var abi = allBubbles.length - 1; abi > targetDomIdx; abi--) {
                    var el = allBubbles[abi];
                    if (el.classList.contains('message-ai') || el.classList.contains('message-system') || el.classList.contains('message-user')) {
                        el.remove();
                    }
                }
                // 目标气泡本身也要移除
                if (targetBubble && targetBubble.parentNode) targetBubble.remove();
            }
        }

        var fullContent = '';
        var fullReasoning = '';
        var thinkStartTime = null;
        userExpandedBodies = {};
        var bubble = addMessage(_('thinking'), 'ai', [], null, null);

        try {
            var streamUsage = null;
            var streamRequestBody = null;
            var apiRequest = null;
            var maxAgentIter = agentEnabled ? agentMaxIterations : 1;

            // 后端 Agent 模式（持久化、可刷新恢复）
            if (agentEnabled && maxAgentIter > 1) {
                var iterMsgs = reorderMessages(
                    compressOldExecMessages(
                        chats[currentChat].filter(function(m) { return m.role; }).map(function(m) {
                            var msg = { role: m.role, content: m.content, images: m.images || [], _isExec: m._isExec };
                            if (m.role === 'assistant' && typeof includeReasoning !== 'undefined' && includeReasoning && m.reasoning) {
                                msg.reasoning = m.reasoning.length > 2000 ? m.reasoning.substring(0, 2000) + '...' : m.reasoning;
                            }
                            return msg;
                        })
                    )
                );
                var toolPromptText = buildToolPrompt();
                if (toolPromptText) {
                    var hasToolPrompt = false;
                    for (var si = 0; si < iterMsgs.length; si++) {
                        if (iterMsgs[si].role === 'system' && (iterMsgs[si].content.indexOf('[Agent能力]') !== -1 || iterMsgs[si].content.indexOf('[工具调用能力]') !== -1)) {
                            hasToolPrompt = true; break;
                        }
                    }
                    if (!hasToolPrompt) iterMsgs.unshift({ role: 'system', content: toolPromptText, images: [] });
                }
                // Think mode prompts
                if (currentThinkMode === 'deep' || currentThinkMode === 'meditate') {
                    try {
                        var cfgFile2 = currentThinkMode === 'deep' ? 'DeepThink.md' : 'Medit.md';
                        var cfgRes2 = await fetch('/api/config/' + cfgFile2);
                        if (cfgRes2.ok) {
                            var cfg2 = await cfgRes2.json();
                            if (cfg2.think && cfg2.think.trim()) {
                                var th3 = iterMsgs.find(function(m) { return m.role === 'system' && m.content.indexOf(cfg2.think.substring(0, 20)) !== -1; });
                                if (!th3) iterMsgs.unshift({ role: 'system', content: cfg2.think, images: [] });
                            }
                        }
                    } catch (e) {}
                }
                if (typeof cothinkEnabled !== 'undefined' && cothinkEnabled && pluginPrompts && pluginPrompts.cothink) {
                    var cot2 = pluginPrompts.cothink;
                    var cotExists2 = iterMsgs.some(function(m) { return m.role === 'system' && m.content.indexOf('[思维链') !== -1; });
                    if (!cotExists2) iterMsgs.unshift({ role: 'system', content: cot2, images: [] });
                }
                // Memory
                if (memoryEnabled && cachedMemories.length > 0) {
                    var memContent2 = '[已有记忆]\n';
                    cachedMemories.forEach(function(m, i) { memContent2 += '\n' + (i + 1) + '. ' + m.key + ': ' + (m.content || ''); });
                    var sysCount2 = 0;
                    while (sysCount2 < iterMsgs.length && iterMsgs[sysCount2].role === 'system') sysCount2++;
                    iterMsgs.splice(sysCount2, 0, { role: 'system', content: memContent2.trim(), images: [] });
                }
                var statusLines = [];
                statusLines.push('- ' + _('commandExec') + ': ' + (typeof commandExecEnabled !== 'undefined' && commandExecEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- ' + (_('sandbox') || 'Sandbox') + ': ' + (typeof sandboxEnabled !== 'undefined' && sandboxEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- Agent: ' + (typeof agentEnabled !== 'undefined' && agentEnabled ? _('enabled') : _('disabled')));
                var statusText = '[' + (_('pluginStatus') || '当前插件状态') + ']\n' + statusLines.join('\n');
                var ctxStr = maxContextTokens >= 1000000 ? (maxContextTokens / 1000000).toFixed(0) + 'M' : (maxContextTokens / 1000).toFixed(0) + 'K';
                if (!pureMode) {
                    var baseParts = [statusText];
                    if (systemVersion && commandExecEnabled) baseParts.push('[用户使用的系统版本: ' + systemVersion + ']');
                    baseParts.push('目前最大上下文 ' + ctxStr + ' token');
                    if (baseSystemPrompt) baseParts.push(baseSystemPrompt);
                    if (currentParams.systemPrompt) baseParts.push(currentParams.systemPrompt);
                    iterMsgs.unshift({ role: 'system', content: baseParts.join('\n\n'), images: [] });
                } else if (currentParams.systemPrompt) {
                    iterMsgs.unshift({ role: 'system', content: currentParams.systemPrompt, images: [] });
                }
                var agentCall = await callAgentAPI(iterMsgs);
                var decoder = new TextDecoder();
                var reader = agentCall.body.getReader();
                var buf = '';
                var totalContent = '';
                var agentUsage = null;
                // 收集工具结果，wait assistant保存后再插入，确保顺序正确
                var pendingToolMsgs = [];
                var pendingToolResults = [];
                // 当前迭代的独立内容跟踪
                var iterContent = '';
                var iterReasoning = '';
                var currentBubble = bubble;
                var currentReasoningDiv = null;
                var currentContentDiv = null;

                function setupIterBubble(bubbleEl) {
                    bubbleEl.innerHTML = '';
                    currentReasoningDiv = document.createElement('div');
                    currentContentDiv = document.createElement('div');
                    currentContentDiv.className = 'markdown-body';
                    bubbleEl.appendChild(currentReasoningDiv);
                    bubbleEl.appendChild(currentContentDiv);
                }
                setupIterBubble(currentBubble);

                function saveCurrentIteration() {
                    if (!iterContent && !iterReasoning) return;
                    if (currentReasoningDiv && currentReasoningDiv._fullReasoning) {
                        currentReasoningDiv.innerHTML = createThinkBlock(currentReasoningDiv._fullReasoning, { isThinking: false });
                    }
                    var iterMsg = {
                        role: 'assistant',
                        content: iterContent,
                        reasoning: iterReasoning || null
                    };
                    chats[currentChat].push(iterMsg);
                    totalContent += iterContent;
                }

                while (true) {
                    var r = await reader.read();
                    if (r.done) break;
                    buf += decoder.decode(r.value, { stream: true });
                    var lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (var li2 = 0; li2 < lines.length; li2++) {
                        var ln = lines[li2];
                        if (!ln.startsWith('data: ')) continue;
                        var d2 = ln.substring(6);
                        try {
                            var evt = JSON.parse(d2);
                            if (evt.type === 'content') {
                                iterContent += evt.text;
                                if (currentContentDiv) {
                                    currentContentDiv.innerHTML = _renderAIContent(iterContent) || '...';
                                    updatePluginTimers(); restoreExpandedBlocks();
                                }
                                autoScroll();
                            } else if (evt.type === 'reasoning') {
                                iterReasoning += evt.text;
                                if (currentReasoningDiv) {
                                    currentReasoningDiv._fullReasoning = iterReasoning;
                                    currentReasoningDiv.innerHTML = createThinkBlock(iterReasoning, { isThinking: true });
                                }
                                autoScroll();
                            } else if (evt.type === 'usage') {
                                agentUsage = evt.usage;
                            } else if (evt.type === 'iter_start' && evt.iteration > 0) {
                                // 新迭代开始 → 保存上一轮内容，创建新气泡
                                saveCurrentIteration();
                                // 插入上一轮的暂存工具结果，保持 user→assistant→tool 顺序
                                pendingToolMsgs.forEach(function(m) { chats[currentChat].push(m); });
                                // 将上一轮的单个命令块替换为时间线块（注入到已有 think-block 中）
                                if (pendingToolResults.length > 0) {
                                    chatAreaInner.querySelectorAll('.plugin-block.cmd-block').forEach(function(el) { el.remove(); });
                                    pendingToolResults.forEach(function(r) {
                                        var cmdKey = r.cmd.command.trim();
                                        var sel = '.cmd-timeline-block:not(.has-result)[data-cmd="' + escapeHtml(cmdKey) + '"]';
                                        var block = null;
                                        try { block = chatAreaInner.querySelector(sel); } catch(e) { console.warn('[iter_start] querySelector err:', e); }
                                        if (!block) {
                                            var allBlocks = chatAreaInner.querySelectorAll('.cmd-timeline-block:not(.has-result)');
                                            console.log('[iter_start] data-cmd匹配失败, cmdKey="' + cmdKey + '", 找到', allBlocks.length, '个未注入块');
                                            allBlocks.forEach(function(b,i) { console.log('  #'+i+' data-cmd="'+b.getAttribute('data-cmd')+'" cls="'+b.className+'"'); });
                                            if (allBlocks.length > 0) block = allBlocks[0];
                                        } else {
                                            console.log('[iter_start] 找到精确匹配 data-cmd="' + escapeHtml(cmdKey) + '"');
                                        }
                                        if (block) {
                                            block.classList.add('has-result');
                                            var contentEl = block.querySelector('.think-content');
                                            var statusEl = block.querySelector('.think-status');
                                            if (contentEl) {
                                                var rawOut = r.stdout || r.stderr || '';
                                                var bodyStr = rawOut.trim() || _('noOutput');
                                                var exitClass = r.exitCode === 0 ? 'cs-exit-ok' : 'cs-exit-fail';
                                                var exitIcon = r.exitCode === 0 ? '✓' : '✗';
                                                contentEl.innerHTML += '<div class="cs-result-sep"></div><div class="cs-result-block">' + escapeHtml(bodyStr) + '</div><span class="' + exitClass + '">' + exitIcon + ' ' + _('exitCode') + r.exitCode + '</span>';
                                            }
                                            if (statusEl) {
                                                var exitIcon2 = r.exitCode === 0 ? '✓' : '✗';
                                                statusEl.textContent = exitIcon2;
                                                statusEl.style.display = '';
                                                statusEl.style.color = r.exitCode === 0 ? '#4ade80' : '#e74c3c';
                                            }
                                        } else {
                                            console.warn('[iter_start] 找不到任何未注入 think-block, 创建独立结果块');
                                            chatAreaInner.appendChild(createCmdResultTimeline(r));
                                        }
                                    });
                                    chatArea.scrollTop = chatArea.scrollHeight;
                                }
                                pendingToolMsgs = [];
                                pendingToolResults = [];
                                iterContent = '';
                                iterReasoning = '';
                                currentBubble = addMessage('...', 'ai', [], null, null);
                                setupIterBubble(currentBubble);
                                saveChatToBackend();
                            } else if (evt.type === 'tool_start') {
                                // tool_start: 不再创建旧样式命令块，流式渲染已有 think-block
                            } else if (evt.type === 'tool_result') {
                                var rb = (evt.stdout || '') + (evt.stderr ? '\n' + evt.stderr : '') + '\n' + _('exitCode') + evt.exitCode;
                                // 暂存工具结果，等 assistant 消息后再一起写入历史，保证 user→assistant→tool 顺序
                                var toolTitle = evt.cmd.length > 50 ? evt.cmd.substring(0, 47) + '...' : evt.cmd;
                                var toolMsg = { role: 'tool', content: rb, images: [], _isExec: true, _execTitle: toolTitle, _execCommand: evt.cmd.trim(), _execStdout: evt.stdout || '', _execStderr: evt.stderr || '', _execExitCode: evt.exitCode, _execShell: evt.shell || 'shell' };
                                pendingToolMsgs.push(toolMsg);
                                pendingToolResults.push({ cmd: { shell: evt.shell || 'shell', command: evt.cmd }, exitCode: evt.exitCode, stdout: evt.stdout || '', stderr: evt.stderr || '' });
                            } else if (evt.type === 'error') {
                                console.error('[Agent] 后端错误:', evt.message);
                            }
                        } catch (e) {}
                    }
                    autoScroll();
                }

                // 结束：终结最后一个迭代的推理展示（不重复保存，由下方 agentAssistantMsg 统一保存）
                if (currentReasoningDiv && currentReasoningDiv._fullReasoning) {
                    currentReasoningDiv.innerHTML = createThinkBlock(currentReasoningDiv._fullReasoning, { isThinking: false });
                }
                fullContent = totalContent + iterContent;
                var agentAssistantMsg = {
                    role: 'assistant',
                    content: iterContent,
                    reasoning: iterReasoning || null,
                    apiRequest: agentCall.apiRequest || null,
                    usage: agentUsage || null
                };
                chats[currentChat].push(agentAssistantMsg);
                // 将暂存的工具结果插入到 assistant 之后，保证 user→assistant→tool 顺序
                pendingToolMsgs.forEach(function(m) { chats[currentChat].push(m); });
                // 将最后的单个命令块替换为独立时间线块
                // 移除旧样式的 plugin-block（执行中的命令块）
                chatAreaInner.querySelectorAll('.plugin-block.cmd-block').forEach(function(el) { el.remove(); });
                saveChatToBackend();

                // 将最后一个气泡替换为完整格式的气泡
                var finalBubble = createMessageBubble(iterContent, 'ai', [], iterReasoning || null, agentAssistantMsg, '');
                if (currentBubble && currentBubble.parentNode) {
                    currentBubble.replaceWith(finalBubble);
                }

                // 处理最后一轮可能残留的结果（单轮场景下 iter_start 不会触发）
                if (pendingToolResults.length > 0) {
                    pendingToolResults.forEach(function(r) {
                        var cmdKey = r.cmd.command.trim();
                        var block = chatAreaInner.querySelector('.cmd-timeline-block:not(.has-result)[data-cmd="' + escapeHtml(cmdKey) + '"]')
                            || chatAreaInner.querySelector('.cmd-timeline-block:not(.has-result)');
                        if (block) {
                            block.classList.add('has-result');
                            var contentEl = block.querySelector('.think-content');
                            var statusEl = block.querySelector('.think-status');
                            if (contentEl) {
                                var rawOut = r.stdout || r.stderr || '';
                                var bodyStr = rawOut.trim() || _('noOutput');
                                var exitClass = r.exitCode === 0 ? 'cs-exit-ok' : 'cs-exit-fail';
                                var exitIcon = r.exitCode === 0 ? '✓' : '✗';
                                contentEl.innerHTML += '<div class="cs-result-sep"></div><div class="cs-result-block">' + escapeHtml(bodyStr) + '</div><span class="' + exitClass + '">' + exitIcon + ' ' + _('exitCode') + r.exitCode + '</span>';
                            }
                            if (statusEl) {
                                statusEl.textContent = r.exitCode === 0 ? '✓' : '✗';
                                statusEl.style.display = '';
                                statusEl.style.color = r.exitCode === 0 ? '#4ade80' : '#e74c3c';
                            }
                        }
                    });
                    chatArea.scrollTop = chatArea.scrollHeight;
                }

                if (typeof askAutoShow !== 'undefined' && askAutoShow) {
                    if (_pendingAsk) { showAskPopup(); }
                    else {
                        var askIn = fullContent.indexOf('<ask>');
                        console.log('[Agent] ask in content:', askIn >= 0, 'len:', (fullContent||'').length, 'pendingAsk:', !!_pendingAsk);
                        if (askIn >= 0) {
                            var am = fullContent.match(/<ask>([\s\S]*?)<\/ask>/i);
                            if (am) {
                                var inner = am[1], qm = inner.match(/<q=([^>]*)>/);
                                if (qm) {
                                    var opts = [];
                                    inner.replace(/<o\d=([^>]*)>/gi, function(m, v) { opts.push(v.trim()); });
                                    if (opts.length) { _pendingAsk = { question: qm[1].trim(), options: opts }; showAskPopup(); }
                                }
                            }
                        }
                    }
                }
                streaming = false; currentAbortController = null; updateSendBtn();
                updateHistoryTitle(); saveChatToBackend();
                return;
            }
            for (var agentIter = 0; agentIter < maxAgentIter; agentIter++) {
                // Rebuild messages from current chat state (includes command results from previous iterations)
                var iterMsgs = reorderMessages(
                    compressOldExecMessages(
                        chats[currentChat].filter(function(m) { return m.role; }).map(function(m) {
                            var msg = { role: m.role, content: m.content, images: m.images || [], _isExec: m._isExec };
                            if (m.role === 'assistant' && typeof includeReasoning !== 'undefined' && includeReasoning && m.reasoning) {
                                msg.reasoning = m.reasoning.length > 2000 ? m.reasoning.substring(0, 2000) + '...' : m.reasoning;
                            }
                            return msg;
                        })
                    )
                );
                // 构建工具/Agent 提示词（从外部 Config/Plugin/*.md 模板加载）
                var toolPromptText = buildToolPrompt();
                // 融合到第一条 system 消息中（不新建单独消息）
                if (toolPromptText) {
                    // 工具提示词必须放在最前面，独立成一条 system 消息
                    // 检查是否已有工具提示词，避免重复添加
                    var hasToolPrompt = false;
                    for (var si = 0; si < iterMsgs.length; si++) {
                        if (iterMsgs[si].role === 'system' && (iterMsgs[si].content.indexOf('[Agent能力]') !== -1 || iterMsgs[si].content.indexOf('[工具调用能力]') !== -1)) {
                            hasToolPrompt = true;
                            break;
                        }
                    }
                    if (!hasToolPrompt) {
                        iterMsgs.unshift({ role: 'system', content: toolPromptText, images: [] });
                    }
                }
                // Think mode prompts
                if (currentThinkMode === 'deep' || currentThinkMode === 'meditate') {
                    try {
                        var cfgFile = currentThinkMode === 'deep' ? 'DeepThink.md' : 'Medit.md';
                        var cfgRes = await fetch('/api/config/' + cfgFile);
                        if (cfgRes.ok) {
                            var cfg = await cfgRes.json();
                            if (cfg.think && cfg.think.trim()) {
                                var th2 = iterMsgs.find(function(m) { return m.role === 'system' && m.content.indexOf(cfg.think.substring(0, 20)) !== -1; });
                                if (!th2) iterMsgs.unshift({ role: 'system', content: cfg.think, images: [] });
                            }
                        }
                    } catch (e) {}
                }

                // 思维链注入（CoThink）
                if (typeof cothinkEnabled !== 'undefined' && cothinkEnabled && pluginPrompts && pluginPrompts.cothink) {
                    var cotContent = pluginPrompts.cothink;
                    var cotExists = iterMsgs.some(function(m) { return m.role === 'system' && m.content.indexOf('[思维链') !== -1; });
                    if (!cotExists) {
                        iterMsgs.unshift({ role: 'system', content: cotContent, images: [] });
                    }
                }

                // 视频抽帧：在发请求前，从视频中提取帧作为图片加入消息
                var vidFrames = [];
                if (videoFiles.length > 0) {
                    for (var vi = 0; vi < videoFiles.length; vi++) {
                        try {
                            var frames = await extractVideoFrames(videoFiles[vi].content, 1);
                            var baseName = videoFiles[vi].fileName.replace(/.[^.]+$/, '');
                            frames.forEach(function(frame, fi) {
                                vidFrames.push({ type: 'image', fileName: baseName + '_' + fi + '.jpg', content: frame });
                            });
                        } catch(ve) {}
                    }
                }
                if (vidFrames.length > 0) {
                    vidFrames.forEach(function(vf) {
                        iterMsgs.push({ role: 'user', content: '[视频帧: ' + vf.fileName + ']', images: [vf.content] });
                    });
                }
                // 构建完整基础提示词（取代服务器端拼接）
                var statusLines = [];
                statusLines.push('- ' + _('commandExec') + ': ' + (typeof commandExecEnabled !== 'undefined' && commandExecEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- ' + _('memory') + ': ' + (typeof memoryEnabled !== 'undefined' && memoryEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- ' + (_('sandbox') || 'Sandbox') + ': ' + (typeof sandboxEnabled !== 'undefined' && sandboxEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- Agent: ' + (typeof agentEnabled !== 'undefined' && agentEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- ' + (_('cothink') || 'Chain of Thought') + ': ' + (typeof cothinkEnabled !== 'undefined' && cothinkEnabled ? _('enabled') : _('disabled')));
                var statusText = '[' + (_('pluginStatus') || '当前插件状态') + ']\n' + statusLines.join('\n');
                var ctxStr = maxContextTokens >= 1000000 ? (maxContextTokens / 1000000).toFixed(0) + 'M' : (maxContextTokens / 1000).toFixed(0) + 'K';
                if (!pureMode) {
                    var baseParts = [statusText];
                    if (systemVersion && commandExecEnabled) baseParts.push('[用户使用的系统版本: ' + systemVersion + ']');
                    baseParts.push('目前最大上下文 ' + ctxStr + ' token');
                    if (baseSystemPrompt) baseParts.push(baseSystemPrompt);
                    if (currentParams.systemPrompt) baseParts.push(currentParams.systemPrompt);
                    iterMsgs.unshift({ role: 'system', content: baseParts.join('\n\n'), images: [] });
                } else if (currentParams.systemPrompt) {
                    iterMsgs.unshift({ role: 'system', content: currentParams.systemPrompt, images: [] });
                }

                // 记忆作为独立 system 消息，排在所有 system 消息之后、用户消息之前
                if (memoryEnabled && cachedMemories.length > 0) {
                    var memContent = '[已有记忆]\n';
                    cachedMemories.forEach(function(m, i) { memContent += '\n' + (i + 1) + '. ' + m.key + ': ' + (m.content || ''); });
                    var sysCount = 0;
                    while (sysCount < iterMsgs.length && iterMsgs[sysCount].role === 'system') sysCount++;
                    iterMsgs.splice(sysCount, 0, { role: 'system', content: memContent.trim(), images: [] });
                }
                var callResult = await callAPI(iterMsgs);
                apiRequest = callResult.apiRequest || apiRequest;
                fullContent = '';
                fullReasoning = '';
                var streamError = null;
                var lastStopReason = '';
                // 每个迭代独立的请求数据，避免共享变量被后续迭代覆盖
                var iterRequestData = null;

                bubble.innerHTML = '';
                var reasoningDiv = document.createElement('div');
                var contentDiv = document.createElement('div');
                contentDiv.className = 'markdown-body';
                bubble.appendChild(reasoningDiv);
                bubble.appendChild(contentDiv);

                if (callResult.json) {
                    // Non-streaming response
                    var nr = callResult.json;
                    if (nr.type === 'error') {
                        streamError = nr.content;
                    } else {
                    fullContent = nr.choices?.[0]?.message?.content || '';
                    fullReasoning = nr.choices?.[0]?.message?.reasoning_content || '';
                    streamUsage = nr.usage || null;
                    streamRequestBody = nr.apiRequest || nr.requestBody || null;
                    iterRequestData = streamRequestBody || apiRequest;
                    if (fullReasoning) reasoningDiv.innerHTML = createThinkBlock(fullReasoning, { isThinking: false });
                    if (fullContent) contentDiv.innerHTML = _renderAIContent(fullContent) || '...';
                    updatePluginTimers();
                    restoreExpandedBlocks();
                    }
                } else {
                var decoder = new TextDecoder();
                var reader = callResult.body.getReader();
                var buffer = '';

                while (true) {
                    var result = await reader.read();
                    if (result.done) break;
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (var li = 0; li < lines.length; li++) {
                        var line = lines[li];
                        if (line.startsWith('data: ')) {
                            var data = line.substring(6);
                            if (data === '[DONE]') continue;
                            try {
                                var json = JSON.parse(data);
                                if (json.type === 'request_body' && json.requestBody) { streamRequestBody = json.requestBody; iterRequestData = streamRequestBody; continue; }
                                if (json.usage && !json.choices) { streamUsage = json.usage; continue; }
                                if (json.usage) streamUsage = json.usage;
                                if (json.type === 'stop_reason') { lastStopReason = json.stop_reason; continue; }
                                if (json.type === 'error') { streamError = json.content; continue; }
                                var delta = json.choices?.[0]?.delta;
                                if (delta) {
                                    if (delta.reasoning_content) {
                                        if (!thinkStartTime) { thinkStartTime = Date.now(); }
                                        fullReasoning += String(delta.reasoning_content);
                                        reasoningDiv.innerHTML = createThinkBlock(fullReasoning, { isThinking: true });
                                        autoScroll();
                                    }
                                    if (delta.content != null) {
                                        fullContent += String(delta.content);
                                        if (fullContent) {
                                            contentDiv.innerHTML = _renderAIContent(fullContent) || '...';
                                            if (typeof streamAnimation !== 'undefined' && streamAnimation === 'fadein' && !contentDiv.classList.contains('stream-fadein')) contentDiv.classList.add('stream-fadein');
                                            updatePluginTimers();
                                            restoreExpandedBlocks();
                                            autoScroll();
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                    autoScroll();
                }
                if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
                    try {
                        var remJson = JSON.parse(buffer.trim().substring(6));
                        var remDelta = remJson.choices?.[0]?.delta;
                        if (remDelta) {
                            if (remDelta.reasoning_content) fullReasoning += String(remDelta.reasoning_content);
                            if (remDelta.content != null) fullContent += String(remDelta.content);
                        }
                    } catch (e) {}
                }
                }

                // 提供商 JSON 错误：以红字可删除的模型消息返回
                if (streamError) {
                    fullContent = streamError;
                    fullReasoning = '';
                }

                // 提示 max_tokens 截断
                if (lastStopReason === 'max_tokens') {
                    var warnDiv = document.createElement('div');
                    warnDiv.style.cssText = 'font-size:12px;color:#b8860b;margin-top:4px;padding:6px 12px;background:#fffbe6;border-radius:4px;border:0.5px solid #f0d98c;';
                    warnDiv.textContent = '⚠ ' + (_('maxTokensWarning') || '模型输出已达到最大长度限制(max_tokens)，可能需要调整参数或开启新对话继续。');
                    contentDiv.after(warnDiv);
                }

                // 保底机制: 如果模型仅在深度思考输出内容，正式输出为空，则重新调用一次
                if (!fullContent?.trim() && fullReasoning?.trim()) {
                    console.log('[保底] 模型仅输出深度思考，重新调用...');
                    var fbMsgs = reorderMessages(
                        compressOldExecMessages(
                            chats[currentChat].filter(function(m) { return m.role; }).map(function(m) {
                                return { role: m.role, content: m.content, images: m.images || [], _isExec: m._isExec };
                            })
                        )
                    );
                    var fbPrompt = buildToolPrompt();
                    if (fbPrompt) fbMsgs.unshift({ role: 'system', content: fbPrompt, images: [] });
                    try {
                        var fbRes = await callAPI(fbMsgs, { model: currentModel, messages: fbMsgs, stream: false, max_tokens: currentParams.max_tokens, temperature: currentParams.temperature || 0.6 });
                        if (fbRes.json) {
                            var fbC = fbRes.json.choices?.[0]?.message?.content || '';
                            var fbR = fbRes.json.choices?.[0]?.message?.reasoning_content || '';
                            if (fbC?.trim()) { fullContent = fbC; if (fbR) fullReasoning = fbR; }
                        }
                    } catch (e) { console.error('[保底] 重调用失败:', e); }
                }

                // Save this iteration to chat (before agent check so non-agent mode also saves)
                var iterAssistantMsg = { role: 'assistant', content: fullContent, reasoning: fullReasoning || null, usage: streamUsage || null, apiRequest: iterRequestData, _isError: !!streamError };
                chats[currentChat].push(iterAssistantMsg);
                await saveChatToBackend();

                // 提供商错误时跳过工具处理
                if (streamError) break;

                // Process tool calls from this iteration
                var hadCommand = false;
                if (commandExecEnabled) {
                    try { hadCommand = await processToolCalls(fullContent); } catch (e) { console.error('[工具调用错误]', e); }
                }
                var hadMemoryOp = false;
                if (memoryEnabled) {
                    try { hadMemoryOp = await processMemoryCalls(fullContent); } catch (e) { console.error('[记忆调用错误]', e); }
                }

                if (!agentEnabled && !hadCommand && !hadMemoryOp) break;

                // Auto-continue if any command or memory operation was executed
                var shouldContinue = hadCommand || hadMemoryOp;
                if (agentIter >= maxAgentIter - 1 && !hadCommand && !hadMemoryOp) shouldContinue = false;
                console.log('[Agent] 迭代 ' + (agentIter + 1) + ' 完成, 长度: ' + fullContent.length + ', 有命令=' + hadCommand + ', 有记忆=' + hadMemoryOp + ', 继续=' + shouldContinue);

                if (!shouldContinue) break;

                // Finalize current iteration bubble (restore message actions)
                var finMsg = iterAssistantMsg;
                var finBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, finMsg, '');
                bubble.replaceWith(finBubble);
                // 将命令执行结果注入到新的气泡中（在 bubble.replaceWith 之后执行，防止丢失）
                if (typeof window.__injectCmdResults === 'function') window.__injectCmdResults();

                // Start fresh bubble for next iteration
                bubble = addMessage('...', 'ai', [], null, null);
            }

            // 重新生成时，在最终气泡上附加版本数据
            if (pendingVersionData) {
                console.log('[版本] 附加版本数据, 旧内容:', pendingVersionData.content, '新内容:', fullContent);
                var verData = pendingVersionData;
                var allVersions = verData.versions ? verData.versions.slice() : [];
                if (allVersions.length === 0 && verData.content !== undefined) {
                    allVersions.push({ content: verData.content, reasoning: verData.reasoning });
                }
                allVersions.push({ content: fullContent, reasoning: fullReasoning || null });
                iterAssistantMsg._versions = allVersions;
                iterAssistantMsg._activeVersion = allVersions.length - 1;
                pendingVersionData = null;
            }
            var thinkElapsed = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : 0;
            if (thinkStartTime) { console.log('[Agent] 思考结束, 耗时:', thinkElapsed, '秒'); }
            console.log('[API] 响应完成, 内容长度:', fullContent.length, '字符');
            iterAssistantMsg.thinkElapsed = thinkElapsed || null;
            var newBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, iterAssistantMsg, '');
            bubble.replaceWith(newBubble);
            if (typeof window.__injectCmdResults === 'function') window.__injectCmdResults();
            updateHistoryTitle();
            saveChatToBackend();
            if (typeof showAskPopup === 'function' && _pendingAsk && typeof askAutoShow !== 'undefined' && askAutoShow) showAskPopup();
        } catch (e) {
            // 只要有部分内容（思考或输出），无论错误类型都保存，防止 TypeError 导致内容丢失
            if (fullContent || fullReasoning) {
                var md = bubble.querySelector('.markdown-body') || bubble;
                md.innerHTML = renderMarkdown(renderPluginBlocks(fullContent));
                updatePluginTimers();
                // 异常路径：气泡内容已更新，注入等待中的执行结果
                if (typeof window.__injectCmdResults === 'function') window.__injectCmdResults();
                var thinkElapsed2 = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : 0;
                if (thinkStartTime) {
                    console.log('[深度思考] 深度思考被中断, 耗时:', thinkElapsed2, '秒');
                }
                var assistantMsg = { role: 'assistant', content: fullContent, reasoning: fullReasoning || null, usage: streamUsage || null, apiRequest: apiRequest || null, thinkElapsed: thinkElapsed2 || null };
                if (pendingVersionData) {
                    var verData = pendingVersionData;
                    var allVersions = verData.versions ? verData.versions.slice() : [];
                    if (allVersions.length === 0 && verData.content !== undefined) {
                        allVersions.push({ content: verData.content, reasoning: verData.reasoning });
                    }
                    allVersions.push({ content: fullContent, reasoning: fullReasoning || null });
                    assistantMsg._versions = allVersions;
                    assistantMsg._activeVersion = allVersions.length - 1;
                    pendingVersionData = null;
                }
                chats[currentChat].push(assistantMsg);
                updateHistoryTitle();
                saveChatToBackend();
            } else if (e && (e.name === 'AbortError' || e.code === 'ERR_CANCELED')) {
                // 用户主动停止，但还没有任何输出，什么都不用做
            } else {
                bubble.innerHTML = '';
                var errDiv = document.createElement('div');
                errDiv.style.cssText = 'padding:8px 0;color:#e74c3c;font-size:14px;';
                errDiv.textContent = _('requestFailed') + e.message;
                bubble.appendChild(errDiv);
                console.error(e);
            }
        } finally {
            streaming = false;
            currentAbortController = null;
            updateSendBtn();
        }
    }

    async function extractVideoFrames(dataUrl, fps) {
        fps = fps || 1;
        return new Promise(function(resolve, reject) {
            var video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            video.onerror = function() { reject(new Error('视频加载失败')); };
            video.onloadedmetadata = function() {
                var duration = video.duration;
                var maxFrames = 300;
                var totalFrames = Math.min(Math.ceil(duration), maxFrames);
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var frames = [];
                var idx = 0;

                function seekNext() {
                    if (idx >= totalFrames) {
                        video.remove();
                        resolve(frames);
                        return;
                    }
                    video.currentTime = idx;
                }

                video.onseeked = function() {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0);
                    frames.push(canvas.toDataURL('image/jpeg', 0.6));
                    idx++;
                    setTimeout(seekNext, 1);
                };

                seekNext();
            };
            video.src = dataUrl;
        });
    }
