// chat.js — Chat flow, Agent loop, Tool processing, API calls
// Depends on intro.js (loaded first) for all globals and utility functions
    function wrapStreamingBlock(text) {
        // 如果文本包含开标签但无对应闭标签，将开标签之后的内容折叠
        return renderPluginBlocks(text);
    }

    function stripTags(text) {
        return text
            .replace(/<mem:[^>]+>[\s\S]*?<\/mem>/gi, '')
            .replace(/<power>[\s\S]*?<\/power>/gi, '')
            .replace(/<powershell>[\s\S]*?<\/powershell>/gi, '')
            .replace(/<cmd>[\s\S]*?<\/cmd>/gi, '')
            .replace(/<shell>[\s\S]*?<\/shell>/gi, '')
            .replace(/<mem-del:[^>]+>/gi, '')
            .trim();
    }

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
        // Parse <power>...</power>, <powershell>...</powershell>, <cmd>...</cmd> and <shell>...</shell> tags
        var commands = [];
        var powerRegex = /<power>([\s\S]*?)<\/power>/gi;
        var psRegex = /<powershell>([\s\S]*?)<\/powershell>/gi;
        var cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/gi;
        var shellRegex = /<shell>([\s\S]*?)<\/shell>/gi;
        var match;
        while ((match = powerRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = psRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = cmdRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'cmd', command: match[1].trim() });
        }
        while ((match = shellRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'shell', command: match[1].trim() });
        }
        if (commands.length === 0) return false;
        // Stop all streaming command timers since we're about to execute for real
        for (var bid in pluginBlockTimers) {
            if (pluginBlockTimers[bid] && pluginBlockTimers[bid].type === 'cmd') pluginBlockTimers[bid].done = true;
        }

        var dangerous = [/rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i, /rd\s+\/s/i, /shutdown/i, /sudo\s+rm\s+-rf/i, />\s*\/dev\/sda/i, /dd\s+if=/i, /:\(\)\s*\{/i];
        for (var ci = 0; ci < commands.length; ci++) {
            var cmd = commands[ci];
            // 如果已中断，跳过剩余命令
            if (currentAbortController && currentAbortController.signal.aborted) break;
            if (dangerous.some(function(p) { return p.test(cmd.command); })) {
                var msg = { role: 'tool', content: _('dangerousBlocked') + cmd.command, images: [], _isExec: true };
                chats[currentChat].push(msg);
                addMessage(msg.content, 'tool', [], null, msg);
                continue;
            }
            if (commandConfirmEnabled && window.CommandExecutionPlugin) {
                try {
                    if (!(await window.CommandExecutionPlugin.confirmCommand(cmd.shell, cmd.command))) {
                        var msg = { role: 'tool', content: _('cmdCancelled') + cmd.shell + ' ' + cmd.command, images: [], _isExec: true };
                        chats[currentChat].push(msg);
                        addMessage(msg.content, 'tool', [], null, msg);
                        continue;
                    }
                } catch (e) {
                    console.error('[命令确认] 确认弹窗失败，直接执行:', e);
                }
            }
            // 找到 AI 消息内对应该命令的 cmd plugin-block 并更新它
            var matchedBid = null;
            var cmdNorm = cmd.command.replace(/\s+/g, ' ').trim().toLowerCase();
            for (var bid in pluginBlockTimers) {
                var t = pluginBlockTimers[bid];
                if (t && t.type === 'cmd') {
                    var storedCmd = (t.content || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    if (storedCmd === cmdNorm) { matchedBid = bid; break; }
                }
            }
            var execMsg = { role: 'tool', content: '', images: [], _bid: matchedBid, _isExec: true };
            chats[currentChat].push(execMsg);
            try {
                var workDir = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir;
                var abortSignal = currentAbortController ? currentAbortController.signal : undefined;
                var res = await fetch('/api/plugin/CommandExecution/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shell: cmd.shell, command: cmd.command, timeout: 30000, workingDirectory: workDir, sandbox: typeof sandboxEnabled !== 'undefined' ? sandboxEnabled : true, requestId: currentRequestId }), signal: abortSignal });
                var sysMsg;
                var resultTitle, resultBody;
                if (res.ok) {
                    var d = await res.json();
                    var rawOut = d.stdout || d.stderr || '';
                    var out = rawOut.trim();
                    resultBody = (rawOut ? (out || rawOut) : _('noOutput')) + '\n' + _('exitCode') + d.exitCode;
                    resultTitle = cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command;
                    sysMsg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle, _time: new Date().toISOString() };
                } else {
                    var errText = await res.text();
                    resultTitle = cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command;
                    resultBody = errText;
                    sysMsg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle, _time: new Date().toISOString() };
                }
                var idx = chats[currentChat].indexOf(execMsg);
                if (idx !== -1) chats[currentChat][idx] = sysMsg;
                var target = matchedBid ? document.getElementById(matchedBid) : null;
                if (target) {
                    updateCmdBlock(target, resultTitle, resultBody);
                } else {
                    var fallback = createCmdBlock(resultTitle, resultBody);
                    chatAreaInner.appendChild(fallback);
                    if (emptyHint) emptyHint.style.display = 'none';
                }
                chatArea.scrollTop = chatArea.scrollHeight;
            } catch (e) {
                var resultBody = e.message;
                var resultTitle = cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command;
                var sysMsg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle };
                var idx = chats[currentChat].indexOf(execMsg);
                if (idx !== -1) chats[currentChat][idx] = sysMsg;
                var target = matchedBid ? document.getElementById(matchedBid) : null;
                if (target) {
                    updateCmdBlock(target, resultTitle, resultBody);
                } else {
                    var fallback = createCmdBlock(resultTitle, resultBody);
                    chatAreaInner.appendChild(fallback);
                    if (emptyHint) emptyHint.style.display = 'none';
                }
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }
        saveChatToBackend();
        return commands.length > 0;
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
        if (askEnabled && pluginPrompts.Ask) {
            parts.push(pluginPrompts.Ask);
        }
        if (commandExecEnabled) {
            var wd = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || '';
            parts.push('默认工作目录为 ' + wd + '，所有命令默认在此目录执行，记住在查看文件时不能虚构文件夹，最佳做法是使用查阅目录的命令');
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
                if (userCount >= 3) {
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

    async function callAPI(messages) {
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

            // 文件 & 图片卡片网格，显示在输出上方
            var hasCards = allFiles.length > 0;
            var grid = null;
            if (hasCards) {
                grid = document.createElement('div');
                grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:6px;';
                textFiles.forEach(function(f) {
                    var card = document.createElement('div');
                    card.style.cssText = 'display:inline-flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #e0e0e0;border-radius:12px;min-width:180px;cursor:pointer;flex-shrink:0;';
                    card.onclick = function() { openFileViewer(f.fileName, f.content); };
                    card.innerHTML =
                        '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#666\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">' +
                            '<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/>' +
                            '<polyline points=\"14 2 14 8 20 8\"/>' +
                            '<line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/>' +
                            '<line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/>' +
                        '</svg>' +
                        '<span style=\"font-size:13px;color:#333;line-height:1.3;word-break:break-all;\">' + escapeHtml(f.fileName) + '</span>';
                    grid.appendChild(card);
                });
                imageFiles.forEach(function(f) {
                    var thumb = document.createElement('div');
                    thumb.style.cssText = 'position:relative;display:inline-block;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;cursor:pointer;flex-shrink:0;max-width:200px;';
                    thumb.onclick = function() { openFileViewer(f.fileName, f.content); };
                    thumb.innerHTML = '<img src="' + f.content + '" alt="' + escapeHtml(f.fileName) + '" style="max-width:200px;max-height:150px;display:block;">';
                    grid.appendChild(thumb);
                });
                videoFiles.forEach(function(f) {
                    var vwrap = document.createElement('div');
                    vwrap.style.cssText = 'border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;flex-shrink:0;max-width:280px;';
                    vwrap.innerHTML = '<video controls preload="metadata" style="width:100%;display:block;max-height:200px;background:#000;" src="' + f.content + '"></video>';
                    grid.appendChild(vwrap);
                });
            }

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
            var agentBubbles = [];

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
                statusLines.push('- ' + (_('modelAsk') || 'Model Ask') + ': ' + (typeof askEnabled !== 'undefined' && askEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- Agent: ' + (typeof agentEnabled !== 'undefined' && agentEnabled ? _('enabled') : _('disabled')));
                var statusText = '[' + (_('pluginStatus') || '当前插件状态') + ']\n' + statusLines.join('\n');
                var ctxStr = maxContextTokens >= 1000000 ? (maxContextTokens / 1000000).toFixed(0) + 'M' : (maxContextTokens / 1000).toFixed(0) + 'K';
                if (!pureMode) {
                    var baseParts = [statusText];
                    if (systemVersion) baseParts.push('[用户使用的系统版本: ' + systemVersion + ']');
                    baseParts.push('目前最大上下文 ' + ctxStr + ' token');
                    if (baseSystemPrompt) baseParts.push(baseSystemPrompt);
                    if (currentParams.systemPrompt) baseParts.push(currentParams.systemPrompt);
                    iterMsgs.unshift({ role: 'system', content: baseParts.join('\n\n'), images: [] });
                } else if (currentParams.systemPrompt) {
                    iterMsgs.unshift({ role: 'system', content: currentParams.systemPrompt, images: [] });
                }
                var agentCall = await callAgentAPI(iterMsgs);
                bubble.innerHTML = '';
                var agentReasoningDiv = document.createElement('div');
                var agentContentDiv = document.createElement('div');
                agentContentDiv.className = 'markdown-body';
                bubble.appendChild(agentReasoningDiv);
                bubble.appendChild(agentContentDiv);
                var decoder = new TextDecoder();
                var reader = agentCall.body.getReader();
                var buf = '';
                var totalContent = '';
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
                                totalContent = evt.text;
                                agentContentDiv.innerHTML = _renderAIContent(totalContent) || '...';
                                updatePluginTimers(); restoreExpandedBlocks(); autoScroll();
                            } else if (evt.type === 'reasoning') {
                                var rt = (agentReasoningDiv._fullReasoning || '') + evt.text;
                                agentReasoningDiv._fullReasoning = rt;
                                agentReasoningDiv.innerHTML = createThinkBlock(rt, { isThinking: true });
                                autoScroll();
                            } else if (evt.type === 'tool_start') {
                                var tb = createCmdBlock(evt.cmd.length > 50 ? evt.cmd.substring(0, 47) + '...' : evt.cmd, '执行中...');
                                chatAreaInner.appendChild(tb);
                                if (emptyHint) emptyHint.style.display = 'none';
                                chatArea.scrollTop = chatArea.scrollHeight;
                            } else if (evt.type === 'tool_result') {
                                var rb = (evt.stdout || '') + (evt.stderr ? '\n' + evt.stderr : '') + '\n' + _('exitCode') + evt.exitCode;
                                var lastBlock = chatAreaInner.querySelector('.plugin-block.cmd-block:last-child');
                                if (lastBlock) updateCmdBlock(lastBlock, evt.cmd.length > 50 ? evt.cmd.substring(0, 47) + '...' : evt.cmd, rb);
                            } else if (evt.type === 'error') {
                                console.error('[Agent] 后端错误:', evt.message);
                            }
                        } catch (e) {}
                    }
                    autoScroll();
                }
                fullContent = totalContent;
                var agentAssistantMsg = { role: 'assistant', content: fullContent, reasoning: null };
                chats[currentChat].push(agentAssistantMsg);
                saveChatToBackend();
                var newBubble = createMessageBubble(fullContent, 'ai', [], null, agentAssistantMsg, '');
                bubble.replaceWith(newBubble);
                if (typeof showAskPopup === 'function' && _pendingAsk && typeof askAutoShow !== 'undefined' && askAutoShow) showAskPopup();
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
                statusLines.push('- ' + (_('modelAsk') || 'Model Ask') + ': ' + (typeof askEnabled !== 'undefined' && askEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- Agent: ' + (typeof agentEnabled !== 'undefined' && agentEnabled ? _('enabled') : _('disabled')));
                statusLines.push('- ' + (_('cothink') || 'Chain of Thought') + ': ' + (typeof cothinkEnabled !== 'undefined' && cothinkEnabled ? _('enabled') : _('disabled')));
                var statusText = '[' + (_('pluginStatus') || '当前插件状态') + ']\n' + statusLines.join('\n');
                var ctxStr = maxContextTokens >= 1000000 ? (maxContextTokens / 1000000).toFixed(0) + 'M' : (maxContextTokens / 1000).toFixed(0) + 'K';
                if (!pureMode) {
                    var baseParts = [statusText];
                    if (systemVersion) baseParts.push('[用户使用的系统版本: ' + systemVersion + ']');
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

                bubble.innerHTML = '';
                var reasoningDiv = document.createElement('div');
                var contentDiv = document.createElement('div');
                contentDiv.className = 'markdown-body';
                bubble.appendChild(reasoningDiv);
                bubble.appendChild(contentDiv);

                if (callResult.json) {
                    // Non-streaming response
                    var nr = callResult.json;
                    fullContent = nr.choices?.[0]?.message?.content || '';
                    fullReasoning = nr.choices?.[0]?.message?.reasoning_content || '';
                    streamUsage = nr.usage || null;
                    streamRequestBody = nr.apiRequest || nr.requestBody || null;
                    if (fullReasoning) reasoningDiv.innerHTML = createThinkBlock(fullReasoning, { isThinking: false });
                    if (fullContent) contentDiv.innerHTML = _renderAIContent(fullContent) || '...';
                    updatePluginTimers();
                    restoreExpandedBlocks();
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
                                if (json.type === 'request_body' && json.requestBody) { streamRequestBody = json.requestBody; continue; }
                                if (json.usage && !json.choices) { streamUsage = json.usage; continue; }
                                if (json.usage) streamUsage = json.usage;
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
                        var fbRes = await callAPI(fbMsgs, { model: currentModel, messages: fbMsgs, stream: false, max_tokens: currentParams.max_tokens || 4096, temperature: currentParams.temperature || 0.6 });
                        if (fbRes.json) {
                            var fbC = fbRes.json.choices?.[0]?.message?.content || '';
                            var fbR = fbRes.json.choices?.[0]?.message?.reasoning_content || '';
                            if (fbC?.trim()) { fullContent = fbC; if (fbR) fullReasoning = fbR; }
                        }
                    } catch (e) { console.error('[保底] 重调用失败:', e); }
                }

                // Save this iteration to chat (before agent check so non-agent mode also saves)
                var iterAssistantMsg = { role: 'assistant', content: fullContent, reasoning: fullReasoning || null, usage: streamUsage || null, apiRequest: streamRequestBody || apiRequest || null };
                chats[currentChat].push(iterAssistantMsg);
                saveChatToBackend();

                // Process tool calls from this iteration
                var hadCommand = false;
                if (commandExecEnabled) {
                    try { hadCommand = await processToolCalls(fullContent); } catch (e) { console.error('[工具调用错误]', e); }
                }
                var hadMemoryOp = false;
                if (memoryEnabled) {
                    try { hadMemoryOp = await processMemoryCalls(fullContent); } catch (e) { console.error('[记忆调用错误]', e); }
                }

                if (!agentEnabled) break;

                // Auto-continue if any command or memory operation was executed
                var shouldContinue = hadCommand || hadMemoryOp;
                if (agentIter >= maxAgentIter - 1) shouldContinue = false;
                console.log('[Agent] 迭代 ' + (agentIter + 1) + ' 完成, 长度: ' + fullContent.length + ', 有命令=' + hadCommand + ', 有记忆=' + hadMemoryOp + ', 继续=' + shouldContinue);

                if (!shouldContinue) break;

                // Finalize current iteration bubble (restore message actions)
                var finMsg = iterAssistantMsg;
                var finBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, finMsg, '');
                bubble.replaceWith(finBubble);

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
            updateHistoryTitle();
            saveChatToBackend();
            if (typeof showAskPopup === 'function' && _pendingAsk && typeof askAutoShow !== 'undefined' && askAutoShow) showAskPopup();
        } catch (e) {
            if (e && (e.name === 'AbortError' || e.code === 'ERR_CANCELED')) {
                var md = bubble.querySelector('.markdown-body') || bubble;
                md.innerHTML = renderMarkdown(renderPluginBlocks(fullContent));
                updatePluginTimers();
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
