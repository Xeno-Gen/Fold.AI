// chat.js — Chat flow, Agent loop, Tool processing, API calls
// Depends on intro.js (loaded first) for all globals and utility functions
    function wrapStreamingBlock(text) {
        // 如果文本包含开标签但无对应闭标签，将开标签之后的内容折叠
        return renderPluginBlocks(text);
    }

    function stripTags(text) {
        return text
            .replace(/<mem:[^>]+>[\s\S]*?<\/mem:[^>]+>/gi, '')
            .replace(/<power>[\s\S]*?<\/power>/gi, '')
            .replace(/<cmd>[\s\S]*?<\/cmd>/gi, '')
            .replace(/<shell>[\s\S]*?<\/shell>/gi, '')
            .replace(/<mem-del:[^>]+>/gi, '')
            .replace(/<conti:994>/gi, '')
            .trim();
    }

    async function processToolCalls(responseText) {
        // Parse <power>...</power>, <cmd>...</cmd> and <shell>...</shell> tags
        var commands = [];
        var powerRegex = /<power>([\s\S]*?)<\/power>/gi;
        var cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/gi;
        var shellRegex = /<shell>([\s\S]*?)<\/shell>/gi;
        var match;
        while ((match = powerRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = cmdRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'cmd', command: match[1].trim() });
        }
        while ((match = shellRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'shell', command: match[1].trim() });
        }
        if (commands.length === 0) return;
        // Stop all streaming command timers since we're about to execute for real
        for (var bid in pluginBlockTimers) {
            if (pluginBlockTimers[bid] && pluginBlockTimers[bid].type === 'cmd') pluginBlockTimers[bid].done = true;
        }

        var dangerous = [/rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i, /rd\s+\/s/i, /shutdown/i, /sudo\s+rm\s+-rf/i, />\s*\/dev\/sda/i, /dd\s+if=/i, /:\(\)\s*\{/i];
        for (var ci = 0; ci < commands.length; ci++) {
            var cmd = commands[ci];
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
                var res = await fetch('/api/plugin/CommandExecution/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shell: cmd.shell, command: cmd.command, timeout: 30000, workingDirectory: workDir }) });
                var sysMsg;
                var resultTitle, resultBody;
                if (res.ok) {
                    var d = await res.json();
                    var rawOut = d.stdout || d.stderr || '';
                    var out = rawOut.trim();
                    resultBody = (rawOut ? (out || rawOut) : _('noOutput')) + '\n' + _('exitCode') + d.exitCode;
                    resultTitle = '命令结果: ' + cmd.shell + '> ' + (cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command);
                    sysMsg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle };
                } else {
                    var errText = await res.text();
                    resultTitle = '命令失败: ' + cmd.shell + '> ' + (cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command);
                    resultBody = errText;
                    sysMsg = { role: 'tool', content: resultBody, images: [], _isExec: true, _execTitle: resultTitle };
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
                var resultTitle = '命令异常: ' + cmd.shell + '> ' + (cmd.command.length > 50 ? cmd.command.substring(0, 47) + '...' : cmd.command);
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
    }

    async function processMemoryCalls(responseText) {
        // Parse <mem:key>content</mem:key> tags
        var memRegex = /<mem:([^>]+)>([\s\S]*?)<\/mem:\1>/gi;
        var memDelRegex = /<mem-del:([^>]+)>/gi;
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
                    var msg = { role: 'tool', content: _('memSaved') + key + ']', images: [], _isExec: true };
                    chats[currentChat].push(msg);
                    addMessage(msg.content, 'tool', [], null, msg);
                }
            } catch (e) {}
        }
        while ((match = memDelRegex.exec(responseText)) !== null) {
            var key = match[1].trim();
            if (!key) continue;
            try {
                var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), { method: 'DELETE' });
                if (res.ok) {
                    var msg = { role: 'tool', content: _('memDeleted') + key + ']', images: [], _isExec: true };
                    chats[currentChat].push(msg);
                    addMessage(msg.content, 'tool', [], null, msg);
                }
            } catch (e) {}
        }
        if (memRegex.lastIndex > 0 || memDelRegex.lastIndex > 0) saveChatToBackend();
        // reset lastIndex for future calls
        memRegex.lastIndex = 0;
        memDelRegex.lastIndex = 0;
        await refreshMemories();
    }

    // 从 pluginPrompts 模板构建工具提示词
    function buildToolPrompt() {
        var parts = [];
        if (agentEnabled && pluginPrompts.agent) {
            parts.push(pluginPrompts.agent);
        }
        if ((commandExecEnabled || memoryEnabled)) {
            var toolContent = '';
            // Use tools.md if available, otherwise inline fallback
            if (pluginPrompts.tools) {
                toolContent = pluginPrompts.tools;
            } else {
                toolContent = '你可以在回复中直接使用单行标签调用以下功能:\n';
                if (commandExecEnabled) {
                    toolContent += '\n- 执行PowerShell: <power>命令内容</power>\n- 执行CMD: <cmd>命令内容</cmd>\n- 执行Shell(bash): <shell>命令内容</shell>';
                }
                if (memoryEnabled) {
                    toolContent += '\n- 保存记忆: <mem:键名>内容</mem:键名>\n- 删除记忆: <mem-del:键名>';
                }
                toolContent += '\n标签不换行，直接嵌在句子中。';
            }
            parts.push(toolContent.trim());

            // Append dynamic content (memories, work dir) after the static md
            var dynamicParts = [];
            if (memoryEnabled && cachedMemories.length > 0) {
                var memList = '\n[已有记忆]';
                cachedMemories.forEach(function(m, i) { memList += '\n' + (i + 1) + '. ' + m.key + ': ' + (m.content || ''); });
                dynamicParts.push(memList);
            }
            if (commandExecEnabled) {
                var wd = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || 'cwd';
                dynamicParts.push('\n默认工作目录为 ' + wd + '，所有命令默认在此目录执行，记住在查看文件时不能虚构文件夹，最佳做法是使用查阅目录的命令');
            }
            if (dynamicParts.length) {
                parts.push(dynamicParts.join('\n').trim());
            }
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

    async function callAPI(messages) {
        if (!currentModel) throw new Error(_('noModel'));
        console.log('[API] 发起请求, 消息数:', messages.length, '模型:', currentModel, '提供商:', currentProvider);
        var requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        currentRequestId = requestId;
        var payload = { messages: messages, provider: currentProvider, model: currentModel, chatFormat: currentChatFormat };
        Object.keys(currentParams).forEach(function(k) { if (currentParams[k] != null) payload[k] = currentParams[k]; });
        payload.stream = streamEnabled;
        payload.requestId = requestId;
        if (currentThinkMode !== 'fast') payload.deep_think = true;
        payload.thinkMode = currentThinkMode;
        currentAbortController = new AbortController();
        var controller = currentAbortController;
        var res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!res.ok) { var err = await res.text(); throw new Error(err); }
        if (streamEnabled) return { body: res.body, apiRequest: payload };
        var json = await res.json();
        return { json: json, apiRequest: payload };
    }

    async function sendMessage(isRegenerate) {
        if (streaming && !isRegenerate) return;
        if (!currentModel) { showToast(_('selectModel')); return; }
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
            await newChat(true);
            if (!isChatActive) activateChat(true);
            if (pendingNewChatIndex !== null && currentChat === pendingNewChatIndex) {
                try {
                    var res = await fetch('/api/chats', { method: 'POST' });
                    if (res.ok) {
                        var data = await res.json();
                        var realId = data.id;
                        var savedToken = chatTokens[pendingNewChatIndex] || generateToken();
                        chats.splice(pendingNewChatIndex, 1);
                        chatTitles.splice(pendingNewChatIndex, 1);
                        chatTokens.splice(pendingNewChatIndex, 1);
                        while (chats.length <= realId) { chats.push([]); chatTitles.push(''); chatTokens.push(''); }
                        chats[realId] = []; chatTitles[realId] = _('newChat'); chatTokens[realId] = data.token || savedToken;
                        currentChat = realId;
                        pendingNewChatIndex = null;
                        updateUrlWithToken();
                    } else { pendingNewChatIndex = null; }
                } catch (e) { pendingNewChatIndex = null; }
            }
        }
        if (!isRegenerate) {
            var userMsg = { role: 'user', content: userText || '', images: imgs };
            chats[currentChat].push(userMsg);
            saveChatToBackend();

            // 文件 & 图片卡片网格，显示在输出上方
            var hasCards = textFiles.length > 0 || imageFiles.length > 0 || videoFiles.length > 0;
            if (hasCards) {
                var grid = document.createElement('div');
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
            }
            if (videoFiles.length > 0) {
                videoFiles.forEach(function(f) {
                    chats[currentChat].push({ role: 'tool', content: f.content, _fileCard: true, _fileName: f.fileName, _imageCard: false });
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
                chatAreaInner.appendChild(grid);
            }

            // 有文字才显示用户气泡，纯图片不显示
            if (userText) {
                addMessage(userText, 'user', [], null, userMsg);
            }
            if (textFiles.length > 0) {
                textFiles.forEach(function(f) {
                    chats[currentChat].push({ role: 'tool', content: _('filePrefix') + f.fileName + ']\n' + f.content, _fileCard: true, _fileName: f.fileName });
                });
            }
            ta.value = '';
            activeFiles[target] = [];
            renderPreviews(isChatActive ? chatPreview : initPreview, []);
            updateSendBtn();
        }

        streaming = true;
        isUserScrolledAway = false;
        updateSendBtn();

        if (isRegenerate) {
            var lastUserIdx = -1;
            for (var rmi = chats[currentChat].length - 1; rmi >= 0; rmi--) {
                if (chats[currentChat][rmi].role === 'user') { lastUserIdx = rmi; break; }
            }
            if (lastUserIdx !== -1) chats[currentChat].splice(lastUserIdx + 1);
            // Only remove AI/system bubbles after the last user bubble
            var allBubbles = chatAreaInner.querySelectorAll('.message-bubble');
            var foundUser = false;
            for (var abi = allBubbles.length - 1; abi >= 0; abi--) {
                if (allBubbles[abi].classList.contains('message-user') && !foundUser) {
                    foundUser = true;
                    continue;
                }
                if (foundUser && (allBubbles[abi].classList.contains('message-ai') || allBubbles[abi].classList.contains('message-system'))) {
                    allBubbles[abi].remove();
                }
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

            for (var agentIter = 0; agentIter < maxAgentIter; agentIter++) {
                // Rebuild messages from current chat state (includes command results from previous iterations)
                var iterMsgs = reorderMessages(
                    compressOldExecMessages(
                        chats[currentChat].filter(function(m) { return m.role; }).map(function(m) { return { role: m.role, content: m.content, images: m.images || [], _isExec: m._isExec }; })
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
                        var cfgFile = currentThinkMode === 'deep' ? 'DeepThink.json' : 'Medit.json';
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
                                        if (!isUserScrolledAway) chatArea.scrollTop = chatArea.scrollHeight;
                                    }
                                    if (delta.content != null) {
                                        fullContent += String(delta.content);
                                        if (fullContent) {
                                            contentDiv.innerHTML = _renderAIContent(fullContent) || '...';
                                            updatePluginTimers();
                                            restoreExpandedBlocks();
                                            if (!isUserScrolledAway) chatArea.scrollTop = chatArea.scrollHeight;
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                    if (!isUserScrolledAway) chatArea.scrollTop = chatArea.scrollHeight;
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

                // Save this iteration to chat (before agent check so non-agent mode also saves)
                var iterAssistantMsg = { role: 'assistant', content: fullContent, reasoning: fullReasoning || null, usage: streamUsage || null, apiRequest: streamRequestBody || apiRequest || null };
                chats[currentChat].push(iterAssistantMsg);
                saveChatToBackend();

                // Process tool calls from this iteration (before agent break so non-agent mode also processes)
                if (commandExecEnabled) {
                    try { await processToolCalls(fullContent); } catch (e) { console.error('[工具调用错误]', e); }
                }
                if (memoryEnabled) {
                    try { await processMemoryCalls(fullContent); } catch (e) { console.error('[记忆调用错误]', e); }
                }

                if (!agentEnabled) break;

                // Check conti:994 on any line
                var shouldContinue = false;
                if (agentIter < maxAgentIter - 1) {
                    var contentLines = fullContent.split('\n');
                    for (var cl = 0; cl < contentLines.length; cl++) {
                        if (contentLines[cl].indexOf('<conti:994>') !== -1) {
                            shouldContinue = true;
                            break;
                        }
                    }
                }
                console.log('[Agent] 迭代 ' + (agentIter + 1) + ' 完成, 长度: ' + fullContent.length + ', <conti:994>=' + shouldContinue);

                if (!shouldContinue) break;

                // Finalize current iteration bubble (restore message actions)
                var finMsg = iterAssistantMsg;
                var finBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, finMsg, '');
                bubble.replaceWith(finBubble);

                // Start fresh bubble for next iteration
                bubble = addMessage('...', 'ai', [], null, null);
            }

            var thinkElapsed = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : 0;
            if (thinkStartTime) { console.log('[Agent] 思考结束, 耗时:', thinkElapsed, '秒'); }
            console.log('[API] 响应完成, 内容长度:', fullContent.length, '字符');
            iterAssistantMsg.thinkElapsed = thinkElapsed || null;
            var newBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, iterAssistantMsg, '');
            bubble.replaceWith(newBubble);
            updateHistoryTitle();
            saveChatToBackend();
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
