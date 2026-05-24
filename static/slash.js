// slash.js — Slash command system (/, /help, /context, /clear, /del context, /setctx)
// Depends on intro.js (loaded first) for globals, chat.js for callAPI
    function initSlashPopup() {
        if (slashPopup) return;
        slashPopup = document.createElement('div');
        slashPopup.className = 'slash-command-popup';
        document.body.appendChild(slashPopup);
    }

    function initSlashGhost(ta) {
        var id = ta.id;
        if (slashGhostEls[id]) return;
        var ghost = document.createElement('div');
        ghost.className = 'slash-ghost';
        ghost.innerHTML = '<span class="ghost-typed"></span><span class="ghost-completion"></span>';
        ta.parentElement.style.position = 'relative';
        ta.parentElement.appendChild(ghost);
        slashGhostEls[id] = ghost;
    }

    function updateSlashGhost(ta, completion) {
        initSlashGhost(ta);
        var ghost = slashGhostEls[ta.id];
        var typed = ghost.querySelector('.ghost-typed');
        var comp = ghost.querySelector('.ghost-completion');
        typed.textContent = ta.value;
        comp.textContent = completion || '';
    }

    function clearSlashGhost(ta) {
        if (!slashGhostEls[ta.id]) return;
        var ghost = slashGhostEls[ta.id];
        ghost.querySelector('.ghost-typed').textContent = '';
        ghost.querySelector('.ghost-completion').textContent = '';
    }

    var slashSuggestions = {
        setctx: ['1m', '256k', '128k', '64k', '32k']
    };

    function showSlashPopup(ta) {
        initSlashPopup();
        var val = ta.value;
        if (!val.startsWith('/') || val.length < 2) {
            hideSlashPopup(ta);
            return;
        }
        var query = val.substring(1);
        var queryLower = query.toLowerCase();
        // Match: command name starts with query's first word, or first word starts with command name
        var firstWord = queryLower.split(' ')[0];
        var matches = slashCommands.filter(function(c) {
            var cmdLower = c.name.toLowerCase();
            return cmdLower.indexOf(firstWord) === 0;
        });
        matches.sort(function(a, b) {
            var aPre = a.name.indexOf(firstWord) === 0 ? 0 : 1;
            var bPre = b.name.indexOf(firstWord) === 0 ? 0 : 1;
            return aPre - bPre || a.name.length - b.name.length;
        });
        if (matches.length === 0) {
            hideSlashPopup(ta);
            return;
        }
        // Calculate ghost completion
        var completion = '';
        var best = matches[0].name;
        var bestLower = best.toLowerCase();
        if (queryLower.length < bestLower.length && bestLower.indexOf(queryLower) === 0) {
            // Query is a prefix of command name (e.g. /del → "del context")
            completion = best.substring(query.length);
        } else if (queryLower.length >= bestLower.length && queryLower.indexOf(bestLower) === 0) {
            // Query starts with full command name (e.g. /del  or /del c)
            var rest = query.substring(best.length); // includes leading space
            if (slashSuggestions[best]) {
                var argVal = rest.replace(/^\s+/, '');
                if (argVal) {
                    for (var si = 0; si < slashSuggestions[best].length; si++) {
                        if (slashSuggestions[best][si].indexOf(argVal) === 0) {
                            completion = slashSuggestions[best][si].substring(argVal.length);
                            break;
                        }
                    }
                } else {
                    // No arg yet, default to first suggestion
                    completion = ' ' + slashSuggestions[best][0];
                }
            } else if (rest) {
                // For space-containing names like "del context", complete the rest
                completion = best.substring(query.length);
            }
        }
        updateSlashGhost(ta, completion || '');
        var rect = ta.getBoundingClientRect();
        slashPopup.style.left = rect.left + 'px';
        slashPopup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        slashPopup.style.top = 'auto';
        slashPopup.style.transform = 'none';
        slashPopup.style.width = Math.min(rect.width, 380) + 'px';
        slashActiveIndex = 0;
        slashTarget = ta;
        slashPopup.innerHTML = matches.map(function(c, i) {
            var name = c.name;
            var prefix = query ? name.substring(0, query.length) : '';
            var rest = name.substring(query.length);
            return '<div class="slash-cmd-item' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" data-cmd="' + name + '"><span class="cmd-slash">/' + prefix + (rest ? '<b>' + rest + '</b>' : '') + '</span><span class="cmd-desc">' + c.desc + '</span></div>';
        }).join('');
        slashPopup.classList.add('show');
        slashPopup.querySelectorAll('.slash-cmd-item').forEach(function(item) {
            item.onmousedown = function(e) { e.preventDefault(); executeSlashCommand(this.dataset.cmd, ta); };
        });
    }

    function hideSlashPopup(ta) {
        if (slashPopup) slashPopup.classList.remove('show');
        slashActiveIndex = -1;
        if (ta) clearSlashGhost(ta);
        slashTarget = null;
    }

    function navigateSlashPopup(dir) {
        if (!slashPopup || !slashTarget) return;
        var items = slashPopup.querySelectorAll('.slash-cmd-item');
        if (items.length === 0) return;
        slashActiveIndex = (slashActiveIndex + dir + items.length) % items.length;
        items.forEach(function(item, i) {
            item.classList.toggle('active', i === slashActiveIndex);
        });
    }

    function selectSlashCommand() {
        if (!slashPopup || !slashTarget) return false;
        var active = slashPopup.querySelector('.slash-cmd-item.active');
        if (active) {
            executeSlashCommand(active.dataset.cmd, slashTarget);
            return true;
        }
        return false;
    }

    function executeSlashCommand(cmd, ta) {
        var fullText = ta.value;
        hideSlashPopup(ta);
        ta.value = '';
        updateSendBtn();
        switch (cmd) {
            case 'help': renderSlashHelp(); break;
            case 'context': renderSlashContext(); break;
            case 'clear': renderSlashClear(); break;
            case 'del context': renderSlashDelContext(); break;
            case 'setctx': renderSlashSetCtx(fullText); break;
        }
    }

    function estimateTokens(text) {
        if (!text) return 0;
        // Chinese/CJK characters only (not punctuation)
        var chineseChars = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
        // Everything else: English + Chinese punctuation + other symbols = 0.25
        var other = text.length - chineseChars;
        return Math.ceil(chineseChars * 0.6 + other * 0.25);
    }

    function renderSlashContext() {
        // 1. Count all message content (including reasoning from assistant messages)
        var msgTokens = 0;
        var hiddenTokens = 0;
        var reasoningTokens = 0;
        if (chats[currentChat]) {
            chats[currentChat].forEach(function(m) {
                var t = estimateTokens(m.content || '');
                if (m.hidden) hiddenTokens += t;
                else msgTokens += t;
                // Include reasoning content from assistant messages (now sent as context)
                if (m.reasoning) reasoningTokens += estimateTokens(m.reasoning);
            });
        }

        // 2. System prompts (base + user custom)
        var sysPromptText = baseSystemPrompt || '';
        if (currentParams.systemPrompt) sysPromptText += '\n' + currentParams.systemPrompt;
        var sysTokens = estimateTokens(sysPromptText);

        // 3. Tool/plugin prompts (use actual loaded content, not hardcoded 80)
        var toolPromptText = '';
        if (typeof pluginPrompts !== 'undefined' && pluginPrompts) {
            var parts = [];
            if (commandExecEnabled && pluginPrompts.tools) parts.push(pluginPrompts.tools);
            if (agentEnabled && pluginPrompts.agent) parts.push(pluginPrompts.agent);
            if (cothinkEnabled && pluginPrompts.cothink) parts.push(pluginPrompts.cothink);
            toolPromptText = parts.join('\n');
        }
        var toolTokens = toolPromptText ? estimateTokens(toolPromptText) : 0;

        // 4. Total estimated tokens
        var totalEstimated = msgTokens + hiddenTokens + reasoningTokens + sysTokens + toolTokens;

        // 5. Get last API usage as ground truth (most accurate)
        var lastUsage = null;
        var msgs = chats[currentChat] || [];
        for (var i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant' && msgs[i].usage) {
                lastUsage = msgs[i].usage;
                break;
            }
        }

        // 6. Capacity: use configured maxContextTokens (default 1M) or actual usage reference
        var capacity = (typeof maxContextTokens !== 'undefined' && maxContextTokens) ? maxContextTokens : 1000000;
        if (lastUsage && lastUsage.total_tokens && lastUsage.total_tokens > capacity) {
            capacity = lastUsage.total_tokens * 2;
        }

        // Use provider's actual prompt_tokens if available, otherwise fall back to estimate
        var displayTotal = totalEstimated;
        if (lastUsage && lastUsage.prompt_tokens) {
            displayTotal = lastUsage.prompt_tokens;
        }

        var pct = Math.min(displayTotal / capacity * 100, 100);
        var remaining = capacity - displayTotal;
        var barClass = 'context-bar-fill';
        if (pct > 80) barClass += ' danger';
        else if (pct > 60) barClass += ' warn';

        var sourceLabel = (lastUsage && lastUsage.prompt_tokens) ? ('(API ' + lastUsage.prompt_tokens + ')') : ('(' + (_('estimated') || '估算') + ')');

        var html = '<div class="context-bar-wrap"><div class="' + barClass + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
            '<div class="context-stats"><span>' + (_('used') || '已用') + ': <b>' + displayTotal.toLocaleString() + '</b> tokens ' + sourceLabel + ' (' + pct.toFixed(1) + '%)</span><span>' + (_('remaining') || '剩余') + ': <b>' + remaining.toLocaleString() + '</b> tokens</span></div>' +
            '<div class="context-stats" style="margin-top:4px;flex-direction:column;gap:2px;">' +
            '<span>' + (_('sysPrompt') || '系统提示词') + ': ' + sysTokens.toLocaleString() + ' tokens</span>' +
            (toolTokens ? '<span>' + (_('toolChain') || '工具链') + ': ' + toolTokens.toLocaleString() + ' tokens</span>' : '') +
            '<span>' + (_('chatMessages') || '对话消息') + ': ' + msgTokens.toLocaleString() + ' tokens</span>' +
            (reasoningTokens ? '<span style="color:#8b8178;">' + (_('reasoning') || '深度思考') + ': ' + reasoningTokens.toLocaleString() + ' tokens</span>' : '') +
            (hiddenTokens ? '<span style="color:#8b8178;">' + (_('hiddenText') || '已隐藏') + ': ' + hiddenTokens.toLocaleString() + ' tokens</span>' : '') +
            (lastUsage ? '<span style="color:#6b8a5e;">' + (_('lastOutput') || '上次输出') + ': ' + (lastUsage.total_tokens || 0).toLocaleString() + ' tokens</span>' : '') +
            '</div>' +
            '<div class="context-stats" style="margin-top:4px;"><span>' + (_('totalCapacity') || '总容量') + ': ' + capacity.toLocaleString() + ' tokens</span></div>';

        addSlashResult(_('contextUsage') || '上下文占用', html);
    }

    function renderSlashHelp() {
        var html = '<table class="slash-help-table">';
        slashCommands.forEach(function(c) {
            html += '<tr><td>/' + c.name + '</td><td>' + c.desc + '</td></tr>';
        });
        html += '</table>';
        addSlashResult(_('slashCommands') || '可用命令', html);
    }

    function renderSlashClear() {
        if (!chats[currentChat] || chats[currentChat].length === 0) {
            addSlashResult((_('slashClear') || ''), '<p style="color:#9b968b;">' + (_('emptyChat') || '') + '</p>');
            return;
        }
        chats[currentChat] = [];
        saveChatToBackend();
        refreshChatDisplay();
        addSlashResult((_('slashClear') || ''), '<p style="color:#6b8a5e;font-weight:500;">' + (_('slashClear') || '') + '</p>');
    }

    function renderSlashDelContext() {
        var chatCount = chats.length - 1;
        if (chatCount <= 0) {
            addSlashResult((_('slashDelContext') || ''), '<p style="color:#9b968b;">' + (_('emptyChat') || '') + '</p>');
            return;
        }
        var keepChat = chats[currentChat] || [];
        var keepTitle = chatTitles[currentChat] || '';
        var keepToken = chatTokens[currentChat] || '';
        chats = [keepChat];
        chatTitles = [keepTitle];
        chatTokens = [keepToken];
        currentChat = 0;
        saveChatToBackend();
        refreshChatDisplay();
        updateHistoryList();
        addSlashResult((_('slashDelContext') || ''), '<p style="color:#6b8a5e;font-weight:500;">' + (_('deleted') || '') + ' ' + chatCount + ' ' + (_('chat') || '') + '</p>');
    }

    function parseCtxValue(val) {
        if (!val) return null;
        var s = val.toLowerCase().replace(/[^0-9.kKmM]/g, '').trim();
        var num = parseFloat(s);
        if (isNaN(num) || num <= 0) return null;
        if (s.indexOf('m') !== -1) return Math.round(num * 1000000);
        if (s.indexOf('k') !== -1) return Math.round(num * 1000);
        return Math.round(num);
    }

    function renderSlashSetCtx(fullText) {
        var parts = fullText.replace('/', '').trim().split(/\s+/);
        var arg = parts.length > 1 ? parts.slice(1).join('') : '';
        if (!arg) {
            addSlashResult((_('slashSetCtx') || '设置容量'), '<p style="color:#9b968b;">' + (_('current') || '当前') + ': ' + maxContextTokens.toLocaleString() + ' tokens</p><p style="font-size:13px;color:#8b8178;margin-top:8px;">' + (_('setctxUsage') || '用法: /setctx 32k, /setctx 256k, /setctx 1m') + '</p>');
            return;
        }
        var parsed = parseCtxValue(arg);
        if (!parsed || parsed < 1000) {
            addSlashResult((_('slashSetCtx') || '设置容量'), '<p style="color:#b8554a;">' + (_('invalidCtxValue') || '无效的容量值') + '</p>');
            return;
        }
        maxContextTokens = parsed;
        saveSettingsToLocal();
        addSlashResult((_('slashSetCtx') || '设置容量'), '<p style="color:#6b8a5e;font-weight:500;">' + (_('ctxSetDone') || '已设置上下文容量') + ': ' + maxContextTokens.toLocaleString() + ' tokens</p>');
    }

    function addSlashResult(title, html) {
        var overlay = document.createElement('div');
        overlay.className = 'slash-result-overlay';
        var card = document.createElement('div');
        card.className = 'slash-result-card';
        card.innerHTML = '<div class="slash-result-header"><h2>' + title + '</h2><button class="slash-result-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="slash-result-body">' + html + '</div>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function close() {
            overlay.classList.remove('active');
            setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 250);
        }
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
        card.querySelector('.slash-result-close').onclick = close;
        document.addEventListener('keydown', function escClose(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
        });
        // Trigger animation
        requestAnimationFrame(function() { overlay.classList.add('active'); });
        return card.querySelector('.slash-result-body');
    }

    function handleSlashInput(ta) {
        var val = ta.value;
        if (val.startsWith('/') && val.length >= 2) {
            showSlashPopup(ta);
        } else {
            hideSlashPopup(ta);
        }
        updateSendBtn();
    }

    function handleSlashKeydown(ta, e) {
        if (slashPopup && slashPopup.classList.contains('show')) {
            if (e.key === 'ArrowDown') { e.preventDefault(); navigateSlashPopup(1); return true; }
            if (e.key === 'ArrowUp') { e.preventDefault(); navigateSlashPopup(-1); return true; }
            if (e.key === 'Tab') { e.preventDefault(); selectSlashCommand(); return true; }
            if (e.key === 'Escape') { e.preventDefault(); hideSlashPopup(ta); return true; }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!selectSlashCommand()) {
                    hideSlashPopup(ta);
                }
                return true;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!selectSlashCommand()) {
                var val = ta.value.trim();
                if (val === '/setctx' || val.indexOf('/setctx ') === 0) {
                    renderSlashSetCtx(val);
                    ta.value = '';
                    updateSendBtn();
                    return true;
                }
                if (val === '/del context' || val.indexOf('/del context ') === 0) {
                    renderSlashDelContext();
                    ta.value = '';
                    updateSendBtn();
                    return true;
                }
                if (!streaming) sendMessage(false);
            }
            return true;
        }
        return false;
    }

    initText.oninput = function() { handleSlashInput(this); };
    chatText.oninput = function() { handleSlashInput(this); };
    initText.onkeydown = function(e) { handleSlashKeydown(this, e); };
    chatText.onkeydown = function(e) { handleSlashKeydown(this, e); };
