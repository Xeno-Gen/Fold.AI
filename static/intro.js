// 如果有服务端嵌入的对话数据，立即隐藏开幕输入框防止闪烁
(function(){
    if (window.__CHAT_DATA__) {
        document.body.classList.add('chat-active');
        var ci = document.getElementById('centerInitial');
        if (ci) ci.style.display = 'none';
    }
})();

// 将 showToast 暴露为全局函数
window.showToast = function(msg) {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl.style.opacity = '0'; }, 4000);
};

(function() {
    const _ = window.t || function(k) { return k; };

    const $ = id => {
        const el = document.getElementById(id);
        if (!el) console.warn('未找到元素:', id);
        return el;
    };

    const chatArea = $('chatArea'), bottomInput = $('bottomInputContainer');
    const chatAreaInner = $('chatAreaInner');
    const initText = $('initialTextarea'), chatText = $('chatTextarea');
    const initSend = $('initialSendBtn'), chatSend = $('chatSendBtn');
    const initPreview = $('initialImagePreview'), chatPreview = $('chatImagePreview');
    const chatHeader = $('chatHeader'), centerInit = $('centerInitial');
    const chatTitleText = $('chatTitleText'), chatTitleInput = $('chatTitleInput');
    const emptyHint = $('emptyHint'), historyList = $('chatHistoryList');
    const settingsBtn = $('settingsBtn'), initialSettingsBtn = $('initialSettingsBtn');
    const drawerOverlay = $('drawerOverlay'), drawerBody = $('drawerBody'), drawerClose = $('drawerClose');
    const fileInput = $('hiddenFileInput'), toast = $('toast');
    const initModelBtn = $('initialModelBtn'), chatModelBtn = $('chatModelBtn');
    const initModelLabel = $('initialModelLabel'), chatModelLabel = $('chatModelLabel');
    const sidebarLeft = $('sidebarLeft'), sidebarToggle = $('sidebarToggle');
    const newChatSidebarBtn = $('newChatSidebarBtn'), sidebarLogo = $('sidebarLogo');
    const initialAttachBtn = $('initialAttachBtn'), chatAttachBtn = $('chatAttachBtn');

    const fileViewerOverlay = $('fileViewerOverlay');
    const fileViewerBody = $('fileViewerBody'), fileViewerTitle = $('fileViewerTitle'), fileViewerClose = $('fileViewerClose');
    const chatFileBtn = $('chatFileBtn'), initialFileBtn = $('initialFileBtn');
    // 文件浏览面板
    const filesPanel = $('filesPanel'), filesPanelBody = $('filesPanelBody'), filesPanelClose = $('filesPanelClose'), filesPanelTitle = $('filesPanelTitle');
    const filesBreadcrumb = $('filesBreadcrumb'), filesRefreshBtn = $('filesRefreshBtn');
    let filesCurrentDir = '/';

    let isChatActive = false, deepThinkEnabled = false, currentThinkMode = 'fast';
    let cachedThinkPrompt = '';
    let commandExecEnabled = false, commandConfirmEnabled = true, compressOldExecutions = true, collapsePluginOutput = true, memoryEnabled = true, fileOpsEnabled = true, agentEnabled = false, agentMaxIterations = 10, currentTheme = 'system';
    let cachedMemories = [];
    let chats = [[]], chatTitles = [_('currentChatTitle')], chatTokens = [''], currentChat = 0;
    let activeFiles = { initial: [], chat: [] };
    let streaming = false, isUserScrolledAway = false, currentAbortController = null, currentRequestId = null;
    let currentProvider = null, currentChatFormat = 'OpenAI', currentModel = 'deepseek-v4-flash';
    let currentParams = { temperature: 0.7, top_p: 1.0, max_tokens: 2048, seed: null, frequency_penalty: 0, presence_penalty: 0, top_k: null, systemPrompt: '' };
    let customPort = 8080, providers = [], availableModels = [], allModels = [];
    let pureMode = false;
    let autoCollapseThink = true;
    let chatFontSize = 15;
    let baseSystemPrompt = '';
    let baseSystemTokenCount = 0;
    let defaultWorkDir = '';
    const pinnedChats = new Set();
    let pendingNewChatIndex = null;

    function generateToken() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        for (let i = 0; i < 16; i++) result += chars.charAt(arr[i] % 62);
        return result;
    }
    function getCurrentToken() { return chatTokens[currentChat] || ''; }
    function updateUrlWithToken() {
        const token = getCurrentToken();
        if (token) history.pushState(null, '', '/chat/' + token);
    }

    function applyTheme(theme) {
        if (theme === 'system') {
            document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('fold_ai_settings'));
            if (s) {
                currentTheme = s.theme || 'system';
                commandConfirmEnabled = s.commandConfirm !== undefined ? s.commandConfirm : true;
                commandExecEnabled = s.commandExecEnabled || false;
                fileOpsEnabled = s.fileOpsEnabled !== false;
                memoryEnabled = s.memoryEnabled !== false;
                agentEnabled = s.agentEnabled || false;
                agentMaxIterations = s.agentMaxIterations || 10;
                compressOldExecutions = s.compressOldExecutions !== undefined ? s.compressOldExecutions : true;
                collapsePluginOutput = s.collapsePluginOutput !== undefined ? s.collapsePluginOutput : true;
                currentThinkMode = s.thinkMode === 'direct' ? 'fast' : (s.thinkMode || 'fast');
                deepThinkEnabled = s.deepThink || false;
                if (s.autoCollapseThink !== undefined) autoCollapseThink = s.autoCollapseThink;
            }
        } catch (e) {}
        applyTheme(currentTheme);
        try { var sf = localStorage.getItem('fold_chat_font'); if (sf) document.documentElement.style.setProperty('--chat-font', sf); } catch (e) {}
        try { var fs = localStorage.getItem('fold_chat_fontsize'); if (fs) { chatFontSize = parseInt(fs) || 15; document.documentElement.style.setProperty('--chat-font-size', chatFontSize + 'px'); } } catch (e) {}
    }

    function saveSettingsToLocal() {
        try {
            localStorage.setItem('fold_ai_settings', JSON.stringify({ theme: currentTheme, commandConfirm: commandConfirmEnabled, commandExecEnabled: commandExecEnabled, fileOpsEnabled: fileOpsEnabled, memoryEnabled: memoryEnabled, agentEnabled: agentEnabled, agentMaxIterations: agentMaxIterations, thinkMode: currentThinkMode, deepThink: deepThinkEnabled, autoCollapseThink: autoCollapseThink, compressOldExecutions: compressOldExecutions, collapsePluginOutput: collapsePluginOutput }));
        } catch (e) {}
    }

    let configPrompts = { think_modes: {} };
    async function loadConfigPrompts() {
        try { const r = await fetch('/api/config/prompts.json'); if (r.ok) configPrompts = await r.json(); } catch (e) {}
    }
    function getReasonSteps() { return configPrompts.think_modes?.[currentThinkMode]?.steps || []; }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    function updateSendBtn() {
        const btns = [{ btn: initSend, target: 'initial' }, { btn: chatSend, target: 'chat' }];
        btns.forEach(({ btn, target }) => {
            if (!btn) return;
            if (streaming) {
                btn.classList.add('stop-btn');
                btn.disabled = false;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
                btn.title = _('stopGen');
            } else {
                btn.classList.remove('stop-btn');
                const ta = isChatActive ? chatText : initText;
                btn.disabled = !(ta.value.trim() || activeFiles[target].length > 0);
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
                btn.title = _('send');
            }
        });
    }

    function openFileViewer(name, content) {
        if (fileViewerTitle) fileViewerTitle.textContent = name;
        if (fileViewerBody) fileViewerBody.innerHTML = '<pre class="file-viewer-pre">' + escapeHtml(content) + '</pre>';
        if (fileViewerOverlay) fileViewerOverlay.classList.add('active');
    }
    function closeFileViewer() { if (fileViewerOverlay) fileViewerOverlay.classList.remove('active'); }
    if (fileViewerClose) fileViewerClose.onclick = closeFileViewer;
    if (fileViewerOverlay) fileViewerOverlay.addEventListener('click', e => { if (e.target === fileViewerOverlay) closeFileViewer(); });

    if (sidebarToggle) sidebarToggle.onclick = () => { sidebarLeft.classList.toggle('visible'); sidebarLeft.classList.toggle('expanded'); };

    // 文件浏览面板
    var bottomSpacerEl = document.querySelector('.bottom-spacer');
    function openFileBrowser() {
        closeSettings();
        if (filesPanel) filesPanel.classList.add('active');
        if (chatArea) { chatArea.style.display = 'none'; }
        if (centerInit) centerInit.style.display = 'none';
        if (bottomInput) bottomInput.style.display = 'none';
        if (chatHeader) chatHeader.style.display = 'none';
        if (bottomSpacerEl) bottomSpacerEl.style.display = 'none';
        loadDirectory(filesCurrentDir);
    }
    function closeFileBrowser() {
        if (filesPanel) filesPanel.classList.remove('active');
        if (chatArea) { chatArea.style.display = ''; }
        if (centerInit) centerInit.style.display = '';
        if (bottomInput) bottomInput.style.display = '';
        if (chatHeader) chatHeader.style.display = '';
        if (bottomSpacerEl) bottomSpacerEl.style.display = '';
    }
    async function loadDirectory(dir) {
        filesCurrentDir = dir;
        if (!filesPanelBody) return;
        filesPanelBody.innerHTML = '<div class="files-panel-empty">加载中...</div>';
        try {
            var url = '/api/files/browse?dir=' + encodeURIComponent(dir);
            var res = await fetch(url);
            if (!res.ok) { filesPanelBody.innerHTML = '<div class="files-panel-empty">加载失败</div>'; return; }
            var data = await res.json();
            renderFileList(data);
        } catch (e) {
            filesPanelBody.innerHTML = '<div class="files-panel-empty">加载失败: ' + e.message + '</div>';
        }
    }
    function renderFileList(data) {
        if (!filesPanelBody) return;
        // 面包屑
        if (filesBreadcrumb) {
            var parts = data.path.split('/').filter(Boolean);
            var html = '<span data-path="/">工作目录</span>';
            var accum = '';
            parts.forEach(function(p, i) {
                accum += '/' + p;
                html += '<span class="sep">/</span>';
                if (i === parts.length - 1) {
                    html += '<span class="current">' + escapeHtml(p) + '</span>';
                } else {
                    html += '<span data-path="' + accum + '">' + escapeHtml(p) + '</span>';
                }
            });
            filesBreadcrumb.innerHTML = html;
            filesBreadcrumb.querySelectorAll('span[data-path]').forEach(function(s) {
                s.onclick = function() { loadDirectory(this.dataset.path); };
            });
        }
        if (!data.items || data.items.length === 0) {
            filesPanelBody.innerHTML = '<div class="files-panel-empty">目录为空</div>';
            return;
        }
        var listHtml = '';
        data.items.forEach(function(item) {
            var isDir = item.isDir;
            var iconHtml = isDir
                ? '<svg class="file-icon folder" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2l-2-3H5a2 2 0 0 0-2 2z"/></svg>'
                : '<svg class="file-icon file" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
            var filePath = data.path === '/' ? '/' + item.name : data.path + '/' + item.name;
            var sizeStr = isDir ? '' : formatFileSize(item.size);
            listHtml += '<div class="file-list-item" data-path="' + escapeHtml(filePath) + '" data-is-dir="' + isDir + '">' +
                iconHtml +
                '<span class="file-name">' + escapeHtml(item.name) + '</span>' +
                (sizeStr ? '<span class="file-meta">' + sizeStr + '</span>' : '') +
                '</div>';
        });
        filesPanelBody.innerHTML = listHtml;
        filesPanelBody.querySelectorAll('.file-list-item').forEach(function(el) {
            el.onclick = function() {
                var p = this.dataset.path;
                if (this.dataset.isDir === 'true') {
                    loadDirectory(p);
                } else {
                    openFileInBrowser(p);
                }
            };
        });
    }
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    async function openFileInBrowser(filePath) {
        try {
            var res = await fetch('/api/files/read?file=' + encodeURIComponent(filePath));
            if (!res.ok) { showToast('无法读取文件'); return; }
            var data = await res.json();
            if (!data.text) {
                // 非文本文件，直接打开原始链接
                window.open('/cwd' + filePath, '_blank');
                return;
            }
            // 文本文件在查看器中显示
            openFileViewer(data.name, data.content);
        } catch (e) {
            showToast('读取失败: ' + e.message);
        }
    }
    if (filesPanelClose) filesPanelClose.onclick = closeFileBrowser;
    if (filesRefreshBtn) filesRefreshBtn.onclick = function() { loadDirectory(filesCurrentDir); };
    if (chatFileBtn) chatFileBtn.onclick = function() { openFileBrowser(); };
    if (initialFileBtn) initialFileBtn.onclick = function() { openFileBrowser(); };

    const settingsPanel = document.getElementById('settingsPanel');
    const settingsPanelNav = document.getElementById('settingsPanelNav');
    const settingsPanelContent = document.getElementById('settingsPanelContent');
    const settingsPanelClose = document.getElementById('settingsPanelClose');
    var settingsLastTab = localStorage.getItem('fold_settings_tab') || 'preferences';
    var settingsTabMeta = [
        { id: 'preferences', label: _('preferences'), icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
        { id: 'plugins', label: _('plugins'), icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
        { id: 'memories', label: _('memories'), icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>' },
        { id: 'usage', label: _('usage'), icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
        { id: 'identity', label: '用户标识', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>' },
        { id: 'version', label: _('version'), icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' }
    ];

    function openSettings() {
        closeFileBrowser();
        if (settingsPanel) settingsPanel.classList.add('active');
        if (chatArea) chatArea.style.display = 'none';
        if (centerInit) centerInit.style.display = 'none';
        if (bottomInput) bottomInput.style.display = 'none';
        if (chatHeader) chatHeader.style.display = 'none';
        switchSettingsTab(settingsLastTab);
    }

    function closeSettings() {
        if (settingsPanel) settingsPanel.classList.remove('active');
        if (chatArea) chatArea.style.display = '';
        if (bottomInput) bottomInput.style.display = '';
        if (chatHeader) chatHeader.style.display = '';
        if (centerInit) centerInit.style.display = '';
    }

    var usageStats = null;
    async function loadUsageStats() {
        try {
            var res = await fetch('/api/usage');
            if (res.ok) usageStats = await res.json();
        } catch (e) { usageStats = null; }
    }
    function switchSettingsTab(tab) {
        settingsLastTab = tab;
        try { localStorage.setItem('fold_settings_tab', tab); } catch (e) {}
        if (settingsPanelNav) {
            settingsPanelNav.innerHTML = settingsTabMeta.map(function(meta) {
                return '<button class="settings-panel-nav-item' + (meta.id === tab ? ' active' : '') + '" data-tab="' + meta.id + '">' + meta.icon + '<span>' + _(meta.id) + '</span></button>';
            }).join('');
            settingsPanelNav.querySelectorAll('.settings-panel-nav-item').forEach(function(btn) {
                btn.onclick = function() { switchSettingsTab(btn.dataset.tab); };
            });
        }
        if (tab === 'preferences') renderPreferencesTab();
        else if (tab === 'plugins') renderPluginsTab();
        else if (tab === 'memories') renderMemoriesTab();
        else if (tab === 'usage') { loadUsageStats().then(function() { renderUsageTab(); }); }
        else if (tab === 'identity') { renderIdentitySettingsTab(); }
        else if (tab === 'version') renderVersionTab();
    }

    function renderPreferencesTab() {
        if (!settingsPanelContent) return;
        settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">' + _('appearance') + '</div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' + _('themeMode') + '</span><div class="think-mode-selector" id="settingsThemeSelector" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (currentTheme === 'light' ? ' active' : '') + '" data-theme="light"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>' + _('light') + '</span></button>' +
            '<button class="think-mode-option' + (currentTheme === 'dark' ? ' active' : '') + '" data-theme="dark"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>' + _('dark') + '</span></button>' +
            '<button class="think-mode-option' + (currentTheme === 'system' ? ' active' : '') + '" data-theme="system"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>' + _('system') + '</span></button></div></div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' + _('chatFont') + '</span><select id="settingsFontSelect" style="padding:5px 10px;border-radius:6px;border:0.5px solid #ddd;font-size:13px;background:#fff;font-family:inherit;"><option value="">' + _('defaultFont') + '</option><option value="PingFang SC, Microsoft YaHei, sans-serif">PingFang</option><option value="Noto Serif SC, serif">Noto Serif</option><option value="Songti SC, serif">宋体</option><option value="Inter, sans-serif">Inter</option><option value="quote-cjk-patch, PingFang SC, Microsoft YaHei, sans-serif">quote-cjk-patch</option><option value="Cascadia Code, JetBrains Mono, Fira Code, SF Mono, Monaco, Consolas, monospace">Monospace</option></select></div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V5h16v2M4 11h16M4 15h16M4 19h16"/></svg>' + (_('fontSize') || '字号') + '</span><div class="think-mode-selector" id="settingsFontSizeSelector" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (chatFontSize === 13 ? ' active' : '') + '" data-size="13">13</button>' +
            '<button class="think-mode-option' + (!chatFontSize || chatFontSize === 15 ? ' active' : '') + '" data-size="15">15</button>' +
            '<button class="think-mode-option' + (chatFontSize === 17 ? ' active' : '') + '" data-size="17">17</button>' +
            '<button class="think-mode-option' + (chatFontSize === 19 ? ' active' : '') + '" data-size="19">19</button></div></div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg>' + _('thinkAfterAutoCollapse') + '</span><div class="think-mode-selector" id="settingsAutoCollapseToggle" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (autoCollapseThink ? ' active' : '') + '" data-value="true">' + _('on') + '</button>' +
            '<button class="think-mode-option' + (!autoCollapseThink ? ' active' : '') + '" data-value="false">' + _('off') + '</button></div></div></div>';
        // 字体
        var fontSelect = document.getElementById('settingsFontSelect');
        if (fontSelect) {
            var currentFont = document.documentElement.style.getPropertyValue('--chat-font') || '';
            fontSelect.value = currentFont;
            fontSelect.onchange = function() {
                document.documentElement.style.setProperty('--chat-font', this.value);
                try { localStorage.setItem('fold_chat_font', this.value); } catch (e) {}
            };
        }
        // 主题
        settingsPanelContent.querySelectorAll('#settingsThemeSelector .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                currentTheme = o.dataset.theme;
                applyTheme(currentTheme);
                saveSettingsToLocal();
                settingsPanelContent.querySelectorAll('#settingsThemeSelector .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
            };
        });
        // 字号
        settingsPanelContent.querySelectorAll('#settingsFontSizeSelector .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                chatFontSize = parseInt(this.dataset.size);
                document.documentElement.style.setProperty('--chat-font-size', chatFontSize + 'px');
                try { localStorage.setItem('fold_chat_fontsize', chatFontSize); } catch (e) {}
                settingsPanelContent.querySelectorAll('#settingsFontSizeSelector .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
            };
        });
        // 思考后自动折叠
        settingsPanelContent.querySelectorAll('#settingsAutoCollapseToggle .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                autoCollapseThink = o.dataset.value === 'true';
                saveSettingsToLocal();
                settingsPanelContent.querySelectorAll('#settingsAutoCollapseToggle .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
            };
        });
    }

    function renderPluginsTab() {
        if (!settingsPanelContent) return;
        settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">' + _('plugins') + '</div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' + _('confirmBeforeExec') + '</span><div class="think-mode-selector" id="settingsConfirmToggle" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (commandConfirmEnabled ? ' active' : '') + '" data-value="true">' + _('on') + '</button>' +
            '<button class="think-mode-option' + (!commandConfirmEnabled ? ' active' : '') + '" data-value="false">' + _('off') + '</button></div></div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 12 3 12 12 3 21 12 19 12"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/></svg>' + _('compressOldExec') + '</span><div class="think-mode-selector" id="settingsCompressExecToggle" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (compressOldExecutions ? ' active' : '') + '" data-value="true">' + _('on') + '</button>' +
            '<button class="think-mode-option' + (!compressOldExecutions ? ' active' : '') + '" data-value="false">' + _('off') + '</button></div></div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 10 12 4 18"/><line x1="14" y1="6" x2="20" y2="6"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="18" x2="20" y2="18"/></svg>折叠插件输出</span><div class="think-mode-selector" id="settingsCollapsePluginToggle" style="display:inline-flex;">' +
            '<button class="think-mode-option' + (collapsePluginOutput ? ' active' : '') + '" data-value="true">' + _('on') + '</button>' +
            '<button class="think-mode-option' + (!collapsePluginOutput ? ' active' : '') + '" data-value="false">' + _('off') + '</button></div></div></div>';
        settingsPanelContent.querySelectorAll('#settingsConfirmToggle .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                commandConfirmEnabled = o.dataset.value === 'true';
                settingsPanelContent.querySelectorAll('#settingsConfirmToggle .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
                saveSettingsToLocal();
                if (window.CommandExecutionPlugin) window.CommandExecutionPlugin.setConfirmBeforeExecution(commandConfirmEnabled);
            };
        });
        settingsPanelContent.querySelectorAll('#settingsCompressExecToggle .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                compressOldExecutions = o.dataset.value === 'true';
                settingsPanelContent.querySelectorAll('#settingsCompressExecToggle .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
                saveSettingsToLocal();
                if (window.CommandExecutionPlugin) window.CommandExecutionPlugin.setCompressOldExecutions(compressOldExecutions);
            };
        });
        settingsPanelContent.querySelectorAll('#settingsCollapsePluginToggle .think-mode-option').forEach(function(o) {
            o.onclick = function() {
                collapsePluginOutput = o.dataset.value === 'true';
                settingsPanelContent.querySelectorAll('#settingsCollapsePluginToggle .think-mode-option').forEach(function(x) { x.classList.toggle('active', x === o); });
                saveSettingsToLocal();
            };
        });
    }

    function renderMemoriesTab() {
        if (!settingsPanelContent) return;
        settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">' + _('memories') + '</div><button id="addMemoryBtn" class="tool-chain-option" style="margin-bottom:12px;padding:8px 16px;width:100%;">+ ' + _('addMemory') + '</button><div id="addMemoryForm" style="display:none;margin-bottom:12px;"><input id="addMemoryKey" placeholder="' + _('memoryKeyPlaceholder') + '" style="width:100%;padding:8px;border:1px solid #e8e5df;border-radius:6px;margin-bottom:8px;font-size:13px;background:#fafaf7;color:#3c3630;"><textarea id="addMemoryContent" rows="4" placeholder="' + _('memoryContentPlaceholder') + '" style="width:100%;padding:8px;border:1px solid #e8e5df;border-radius:6px;font-size:13px;background:#fafaf7;color:#3c3630;resize:vertical;"></textarea><div style="display:flex;gap:8px;margin-top:8px;"><button id="saveMemoryBtn" class="tool-chain-option" style="padding:6px 16px;">' + _('ok') + '</button><button id="cancelMemoryBtn" class="tool-chain-option" style="padding:6px 16px;">' + _('cancel') + '</button></div></div><div id="memoriesList" style="max-height:420px;overflow-y:auto;"></div></div>';
        loadMemoriesList();
        // Add memory button handlers
        var addBtn = document.getElementById('addMemoryBtn');
        var form = document.getElementById('addMemoryForm');
        var keyInput = document.getElementById('addMemoryKey');
        var contentInput = document.getElementById('addMemoryContent');
        var saveBtn = document.getElementById('saveMemoryBtn');
        var cancelBtn = document.getElementById('cancelMemoryBtn');
        if (addBtn && form) {
            addBtn.addEventListener('click', function() {
                form.style.display = 'block';
                addBtn.style.display = 'none';
                if (keyInput) keyInput.focus();
            });
            if (cancelBtn) cancelBtn.addEventListener('click', function() {
                form.style.display = 'none';
                addBtn.style.display = 'block';
                if (keyInput) keyInput.value = '';
                if (contentInput) contentInput.value = '';
            });
            if (saveBtn) saveBtn.addEventListener('click', function() {
                var key = (keyInput && keyInput.value.trim()) || '';
                var content = (contentInput && contentInput.value.trim()) || '';
                if (!key || !content) return;
                fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: content })
                }).then(function(r) {
                    if (r.ok) {
                        form.style.display = 'none';
                        addBtn.style.display = 'block';
                        if (keyInput) keyInput.value = '';
                        if (contentInput) contentInput.value = '';
                        refreshMemories(); loadMemoriesList();
                    }
                });
            });
        }
    }

    async function loadMemoriesList() {
        var container = document.getElementById('memoriesList');
        if (!container) return;
        try {
            var res = await fetch('/api/plugin/Memory/memories');
            var data = await res.json();
            var memories = data.memories || [];
            if (memories.length === 0) {
                container.innerHTML = '<div class="settings-item" style="color:var(--text-secondary);text-align:center;padding:24px;">' + _('noMemories') + '</div>';
                return;
            }
            container.innerHTML = memories.map(function(m) {
                var dateStr = m.updated ? new Date(m.updated).toLocaleString() : '-';
                return '<div class="memory-item" data-key="' + escapeHtml(m.key) + '">' +
                    '<div class="memory-item-header memory-expand-trigger" data-key="' + escapeHtml(m.key) + '">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-top:2px;flex-shrink:0;color:#888;"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>' +
                    '<div class="memory-item-info">' +
                    '<div class="memory-item-key">' + escapeHtml(m.key) + '</div>' +
                    '<div class="memory-item-meta">' + (m.size || 0) + ' ' + _('chars') + ' · ' + dateStr + '</div>' +
                    '</div>' +
                    '<div class="memory-item-actions">' +
                    '<button class="tool-chain-option memory-expand-btn" data-key="' + escapeHtml(m.key) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>' +
                    '<button class="tool-chain-option memory-delete-btn" data-key="' + escapeHtml(m.key) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
                    '</div>' +
                    '</div>' +
                    '<div class="memory-content" data-key="' + escapeHtml(m.key) + '"></div>' +
                    '</div>';
            }).join('');

            // Expand/collapse handler
            container.querySelectorAll('.memory-expand-btn, .memory-expand-trigger').forEach(function(el) {
                el.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var key = el.dataset.key;
                    var item = el.closest('.memory-item');
                    if (!item) return;
                    var contentDiv = item.querySelector('.memory-content');
                    var btn = item.querySelector('.memory-expand-btn svg');
                    if (!contentDiv) return;
                    if (!contentDiv.classList.contains('expanded')) {
                        contentDiv.classList.add('expanded');
                        contentDiv.textContent = _('loading');
                        if (btn) btn.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
                        fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key)).then(function(r) {
                            return r.json();
                        }).then(function(d) {
                            contentDiv.textContent = d.content || _('empty');
                        }).catch(function() {
                            contentDiv.textContent = _('loadFailed');
                        });
                    } else {
                        contentDiv.classList.remove('expanded');
                        if (btn) btn.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
                    }
                });
            });

            // Delete handler
            container.querySelectorAll('.memory-delete-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var key = btn.dataset.key;
                    fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), { method: 'DELETE' }).then(function(r) {
                        if (r.ok) { refreshMemories(); loadMemoriesList(); }
                    });
                });
            });
        } catch (e) {
            container.innerHTML = '<div class="settings-item" style="color:var(--text-secondary);text-align:center;padding:24px;">' + _('loadFailed') + '</div>';
        }
    }

    function renderUsageTab() {
        if (!settingsPanelContent) return;
        var html = '<div class="settings-section"><div class="settings-section-title">模型使用统计</div>';
        if (!usageStats || !usageStats.models || !Object.keys(usageStats.models).length) {
            html += '<div style="color:#999;font-size:13px;padding:8px 0;">暂无使用记录</div>';
        } else {
            var entries = Object.entries(usageStats.models).sort(function(a, b) { return b[1] - a[1]; });
            html += '<div style="font-size:13px;color:#999;margin-bottom:12px;">总计: <strong style="color:var(--text,#1a1a1a);">' + usageStats.total + '</strong> 次</div>';
            html += '<div style="display:flex;flex-direction:column;gap:4px;">';
            entries.forEach(function(e, i) {
                var pct = usageStats.total > 0 ? Math.round(e[1] / usageStats.total * 100) : 0;
                html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border,#eee);">';
                html += '<span style="font-family:SF Mono,Monaco,Consolas,monospace;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(e[0]) + '">' + escapeHtml(e[0]) + '</span>';
                html += '<div style="flex:1;height:6px;background:var(--border,#eee);border-radius:3px;overflow:hidden;"><div style="height:100%;background:#6b8cff;border-radius:3px;width:' + pct + '%;"></div></div>';
                html += '<span style="font-weight:600;font-size:14px;min-width:40px;text-align:right;">' + e[1] + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
        settingsPanelContent.innerHTML = html;
    }

    function renderVersionTab() {
        if (!settingsPanelContent) return;
        var verText = 'Fold.AI';
        // 尝试直接从 ver.json 加载版本
        (async function() {
            try { var r = await fetch('/com/ver.json'); if (r.ok) { var d = await r.json(); verText = _('version') + ' ' + (d.stage || '') + ' ' + (d.ver || '') + ' · Fold.AI'; } } catch (e) {}
        })().then(function() {
            var el = settingsPanelContent.querySelector('.settings-version-text');
            if (el) el.textContent = verText;
        });
        settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">' + _('version') + '</div>' +
            '<div class="settings-item"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span class="settings-version-text">' + escapeHtml(verText) + '</span></span></div>' +
            '<div class="settings-item" style="cursor:pointer;" onclick="window.open(\'https://github.com/Xeno-Gen/Fold.AI\')"><span class="settings-item-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>GitHub</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></div></div>';
    }

    if (sidebarSettingsBtn) sidebarSettingsBtn.onclick = openSettings;
    var settingsFab = document.getElementById('sidebarSettingsFab');
    if (settingsFab) settingsFab.onclick = openSettings;
    if (settingsPanelClose) settingsPanelClose.onclick = closeSettings;

    document.addEventListener('click', function(e) {
        if (!settingsModalOverlay.classList.contains('active')) return;
        const t = e.target.closest('#themeSelector .think-mode-option');
        if (t) { currentTheme = t.dataset.theme; applyTheme(currentTheme); saveSettingsToLocal(); renderSettingsModal(); return; }
        const c = e.target.closest('#commandConfirmToggle .think-mode-option');
        if (c) { commandConfirmEnabled = c.dataset.value === 'true'; renderSettingsModal(); saveSettingsToLocal(); if (window.CommandExecutionPlugin) window.CommandExecutionPlugin.setConfirmBeforeExecution(commandConfirmEnabled); }
        const a = e.target.closest('#autoCollapseToggle .think-mode-option');
        if (a) { autoCollapseThink = a.dataset.value === 'true'; e.target.closest('#autoCollapseToggle').querySelectorAll('.think-mode-option').forEach(function(x) { x.classList.toggle('active', x === a); }); saveSettingsToLocal(); }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (currentTheme === 'system') applyTheme('system'); });

    async function uploadFile(file) {
        const fd = new FormData();
        fd.append('file', file);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        try {
            const r = await fetch('/api/upload', { method: 'POST', body: fd, signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) throw new Error(await r.text() || _('uploadFailed'));
            return r.json();
        } catch (err) { clearTimeout(t); throw err; }
    }

    function renderPreviews(container, fileList) {
        if (!container) return;
        container.innerHTML = '';
        fileList.forEach((file, idx) => {
            const wrap = document.createElement('div');
            if (file.type === 'image') {
                wrap.className = 'image-preview-item';
                wrap.style.backgroundImage = 'url(' + file.content + ')';
            } else {
                wrap.className = 'file-preview-item';
                wrap.innerHTML = '<span class="file-icon">📄</span><span class="file-name">' + escapeHtml(file.fileName) + '</span>';
                wrap.style.cursor = 'pointer';
                wrap.onclick = function(e) { if (!e.target.classList.contains('remove-preview')) openFileViewer(file.fileName, file.content); };
            }
            const btn = document.createElement('span');
            btn.className = 'remove-preview';
            btn.textContent = 'x';
            btn.onclick = function(e) { e.stopPropagation(); fileList.splice(idx, 1); renderPreviews(container, fileList); updateSendBtn(); };
            wrap.appendChild(btn);
            container.appendChild(wrap);
        });
    }

    let fileTarget = { textarea: initText, preview: initPreview };
    fileInput.onchange = async function(e) {
        const files = e.target.files;
        if (!files.length) return;
        const target = fileTarget.textarea === initText ? 'initial' : 'chat';
        for (const f of files) {
            try { activeFiles[target].push(await uploadFile(f)); }
            catch (err) { showToast(_('uploadFailed') + ': ' + (err.message || _('unknownError'))); }
        }
        renderPreviews(fileTarget.preview, activeFiles[target]);
        updateSendBtn();
        fileInput.value = '';
    };
    initialAttachBtn.onclick = function() { fileTarget = { textarea: initText, preview: initPreview }; fileInput.click(); };
    chatAttachBtn.onclick = function() { fileTarget = { textarea: chatText, preview: chatPreview }; fileInput.click(); };
    let dropdownInstance = null;
    (function() {
        const div = document.createElement('div');
        div.className = 'model-picker-dropdown';
        div.style.cssText = 'position:fixed;z-index:999;display:none;';
        document.body.appendChild(div);
        dropdownInstance = div;
    })();

    function positionDropdown(btn) {
        if (!btn || !dropdownInstance) return;
        const rect = btn.getBoundingClientRect();
        dropdownInstance.style.left = (rect.right - dropdownInstance.offsetWidth) + 'px';
        dropdownInstance.style.top = (rect.top - dropdownInstance.offsetHeight - 8) + 'px';
    }

    function openModelPicker(btn) {
        if (!dropdownInstance || !btn) return;
        if (dropdownInstance.classList.contains('show') && dropdownInstance.dataset.btn === btn.id) { closeModelPicker(); return; }
        closeModelPicker();
        dropdownInstance.style.display = 'flex';
        dropdownInstance.classList.add('show');
        dropdownInstance.dataset.btn = btn.id;
        renderModelListInDropdown();
        positionDropdown(btn);
        document.addEventListener('click', outsideClickHandler);
    }

    function closeModelPicker() {
        if (dropdownInstance) { dropdownInstance.classList.remove('show'); dropdownInstance.style.display = 'none'; dropdownInstance.dataset.btn = ''; }
        document.removeEventListener('click', outsideClickHandler);
    }

    function outsideClickHandler(e) {
        if (!dropdownInstance || !dropdownInstance.classList.contains('show')) return;
        if (!e.target.closest('.model-select-btn') && !e.target.closest('.model-picker-dropdown')) closeModelPicker();
    }

    function renderModelListInDropdown() {
        if (!dropdownInstance) return;
        let h = '<div class="model-search"><input type="text" class="model-search-input" placeholder="' + _('searchModel') + '"></div><div class="model-list">';
        allModels.forEach(function(m) {
            h += '<div class="model-picker-item' + (m === currentModel ? ' active' : '') + '" data-model="' + m + '"><div class="model-name">' + m + '</div></div>';
        });
        if (!allModels.length) h += '<div style="padding:20px;text-align:center;color:#999;">' + _('noModelAvailable') + '</div>';
        h += '</div>';
        dropdownInstance.innerHTML = h;
        var searchInput = dropdownInstance.querySelector('.model-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                var kw = this.value.toLowerCase();
                dropdownInstance.querySelectorAll('.model-picker-item').forEach(function(item) {
                    item.style.display = item.dataset.model.toLowerCase().includes(kw) ? 'flex' : 'none';
                });
            });
            setTimeout(function() { searchInput.focus(); }, 0);
        }
        dropdownInstance.querySelectorAll('.model-picker-item').forEach(function(item) {
            item.onclick = function() { currentModel = item.dataset.model; updateModelButtonLabels(); closeModelPicker(); saveConfigToBackend(); };
        });
    }

    function updateModelButtonLabels() {
        if (initModelLabel) initModelLabel.textContent = currentModel || _('selectModel');
        if (chatModelLabel) chatModelLabel.textContent = currentModel || _('selectModel');
    }

    initModelBtn.addEventListener('click', function(e) { e.stopPropagation(); openModelPicker(initModelBtn); });
    chatModelBtn.addEventListener('click', function(e) { e.stopPropagation(); openModelPicker(chatModelBtn); });
    window.addEventListener('resize', function() {
        if (dropdownInstance && dropdownInstance.classList.contains('show')) {
            var btnId = dropdownInstance.dataset.btn;
            if (btnId) positionDropdown(document.getElementById(btnId));
        }
    });

    async function saveConfigToBackend() {
        try { await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultParams: currentParams, currentProvider: currentProvider, currentModel: currentModel, customPort: customPort, systemPrompt: currentParams.systemPrompt, chatFormat: currentChatFormat, pureMode: pureMode }) }); } catch (e) {}
    }

    async function loadConfigFromBackend() {
        try {
            var data = await (await fetch('/api/config')).json();
            console.log('[配置] 加载后端配置成功, 模型:', data.currentModel, '提供商:', data.currentProvider, '端口:', data.customPort);
            if (data.defaultParams) currentParams = Object.assign({}, currentParams, data.defaultParams);
            if (data.currentProvider) currentProvider = data.currentProvider;
            else if (providers.length && !currentProvider) currentProvider = providers[0].id;
            if (data.currentModel) currentModel = data.currentModel;
            if (data.customPort !== undefined) customPort = data.customPort;
            if (data.systemPrompt !== undefined) currentParams.systemPrompt = data.systemPrompt;
            if (data.chatFormat) currentChatFormat = data.chatFormat;
            else updateChatFormatFromProvider();
            if (data.pureMode !== undefined) pureMode = data.pureMode;
            if (data.baseSystemPrompt !== undefined) baseSystemPrompt = data.baseSystemPrompt;
            if (data.baseSystemTokenCount !== undefined) baseSystemTokenCount = data.baseSystemTokenCount;
            if (data.workDir) {
                defaultWorkDir = data.workDir;
                if (window.CommandExecutionPlugin && (!window.CommandExecutionPlugin.workingDirectory || window.CommandExecutionPlugin.workingDirectory === 'cwd')) {
                    window.CommandExecutionPlugin.workingDirectory = data.workDir;
                    window.CommandExecutionPlugin.saveSettings();
                }
            }
            updateModelButtonLabels();
        } catch (e) {}
    }

    async function saveChatToBackend() {
        try { await fetch('/api/chat/' + currentChat, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: chatTitles[currentChat], messages: chats[currentChat], token: chatTokens[currentChat] }) }); } catch (e) {}
    }

    async function loadChatsFromBackend(embeddedToken) {
        try {
            var res = await fetch('/api/chats');
            if (!res.ok) return;
            var remote = await res.json();
            if (remote.length) {
                // Only load metadata (title/token) into arrays; messages loaded lazily
                chats = new Array(remote.length);
                chatTitles = new Array(remote.length);
                chatTokens = new Array(remote.length);
                for (var ci = 0; ci < remote.length; ci++) {
                    chatTitles[ci] = remote[ci].title;
                    chatTokens[ci] = remote[ci].token || '';
                }
                var targetToken = embeddedToken || (window.location.pathname.match(/^\/chat\/([A-Za-z0-9]+)$/) || [])[1];
                if (targetToken) {
                    var idx = chatTokens.indexOf(targetToken);
                    if (idx !== -1) {
                        // Only fetch the target chat's full data
                        var detail = await (await fetch('/api/chat/' + idx)).json();
                        chats[idx] = detail.messages || [];
                        if (!isChatActive) activateChat(false);
                        switchChat(idx);
                        return;
                    }
                }
            }
        } catch (e) {}
        updateHistoryList();
    }

    async function loadProviders() {
        try {
            var res = await fetch('/api/providers');
            providers = (await res.json()).providers || [];
            if (providers.length && !currentProvider) currentProvider = providers[0].id;
            updateChatFormatFromProvider();
            if (currentProvider) await loadModels(currentProvider);
        } catch (e) {}
    }

    function getAvailableFormats() {
        var p = providers.find(function(p) { return p.id === currentProvider; });
        if (!p || !p.chatFormat) return ['OpenAI'];
        return p.chatFormat.split(',').map(function(s) { return s.trim(); });
    }

    function updateChatFormatFromProvider() {
        var formats = getAvailableFormats();
        if (formats.length === 1) { currentChatFormat = formats[0]; }
        else if (formats.length > 1 && !formats.includes(currentChatFormat)) { currentChatFormat = formats[0]; }
    }

    async function loadModels(providerId) {
        try {
            var res = await fetch('/api/provider/' + providerId + '/models');
            if (!res.ok) throw new Error(_('loadModelsFailed'));
            availableModels = (await res.json()).models || [];
            allModels = [].concat(availableModels);
            if (availableModels.length && (!currentModel || !availableModels.includes(currentModel))) {
                currentModel = availableModels[0];
                updateModelButtonLabels();
            }
        } catch (e) { showToast(_('loadModelsCheckKey')); }
    }

    async function loadProviderKeys(providerId) {
        try { var res = await fetch('/api/provider/' + providerId + '/keys'); if (!res.ok) return []; return (await res.json()).keys || []; } catch (e) { return []; }
    }
    async function addProviderKey(providerId, key) {
        try { var res = await fetch('/api/provider/' + providerId + '/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) }); return res.ok; } catch (e) { return false; }
    }
    async function deleteProviderKey(providerId, index) {
        try { var res = await fetch('/api/provider/' + providerId + '/key/' + index, { method: 'DELETE' }); return res.ok; } catch (e) { return false; }
    }
    async function useProviderKey(providerId, index) {
        try { var res = await fetch('/api/provider/' + providerId + '/keys/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: index }) }); return res.ok; } catch (e) { return false; }
    }

    function openDrawer() { loadConfigFromBackend().then(function() { renderDrawer(); }); drawerOverlay.classList.add('active'); }
    function closeDrawer() { drawerOverlay.classList.remove('active'); }
    settingsBtn.onclick = openDrawer;
    initialSettingsBtn.onclick = openDrawer;
    drawerClose.onclick = closeDrawer;
    drawerOverlay.onclick = function(e) { if (e.target === drawerOverlay) closeDrawer(); };

    async function renderDrawer() {
        if (!drawerBody) return;
        var html = '<div class="section-title">' + _('modelProvider') + '</div><div class="provider-grid">';
        providers.forEach(function(p) {
            html += '<div class="provider-card' + (currentProvider === p.id ? ' active' : '') + '" data-id="' + p.id + '"><div class="prov-icon">' + (p.icon ? '<img src="' + p.icon + '">' : p.name.charAt(0)) + '</div><div class="provider-name">' + p.name + '</div></div>';
        });
        html += '</div>';
        var formats = getAvailableFormats();
        if (formats.length > 1) {
            html += '<div style="margin:16px 0 20px;"><div class="section-title" style="margin-bottom:10px;">' + _('apiFormat') + '</div><div class="think-mode-selector" id="chatFormatSelector" style="display:inline-flex;">';
            formats.forEach(function(f) {
                html += '<button class="think-mode-option' + (currentChatFormat === f ? ' active' : '') + '" data-format="' + f + '">' + (f === 'OpenAI' ? 'OpenAI' : 'Anthropic') + '</button>';
            });
            html += '</div></div>';
        } else {
            html += '<div style="margin:16px 0 20px;"><div class="section-title" style="margin-bottom:6px;">' + _('apiFormat') + '</div><div style="font-size:13px;color:#888;">' + formats[0] + '</div></div>';
        }
        html += '<div class="section-title" style="margin-top:10px;">' + _('apiKey') + '</div>';
        html += '<div class="key-input-row"><input type="password" id="newKeyInput" placeholder="' + _('inputKey') + '"><button id="addKeyBtn">' + _('add') + '</button></div>';
        html += '<div class="key-list" id="keyListContainer"></div>';
        html += '<div class="section-title" style="margin-top:20px;">' + _('baseSysPrompt') + '</div>';
        html += '<div class="base-prompt-section">';
        html += '<div class="base-prompt-display" id="basePromptDisplay">' + escapeHtml(baseSystemPrompt || _('notSet')) + '</div>';
        html += '<div class="base-prompt-meta">' + _('tokenCount') + '<span id="baseTokenCount">' + baseSystemTokenCount + '</span></div>';
        html += '<div class="pure-mode-toggle">';
        var isPure = pureMode;
        html += '<div class="pure-mode-label">' + _('promptMode') + '</div>';
        html += '<div class="think-mode-selector" id="pureModeSelector" style="display:inline-flex;">';
        html += '<button class="think-mode-option' + (isPure ? '' : ' active') + '" data-mode="normal">' + _('normal') + '</button>';
        html += '<button class="think-mode-option' + (isPure ? ' active' : '') + '" data-mode="pure">' + _('pureMode') + '</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="pure-mode-hint" id="pureModeHint"' + (isPure ? '' : ' style="display:none;"') + '>' + _('pureModeHint') + '</div>';
        html += '</div>';
        html += '<div class="section-title" style="margin-top:20px;">' + _('sysPrompt') + '</div>';
        html += '<div class="system-prompt-section"><textarea id="systemPromptInput" rows="3" placeholder="' + _('sysPromptPlaceholder') + '">' + escapeHtml(currentParams.systemPrompt || '') + '</textarea></div>';
        html += '<div class="section-title" style="margin-top:20px;">' + _('paramAdjust') + '</div><div class="param-group">';
        var paramsDef = [
            { key: 'temperature', label: _('temperature'), min: 0, max: 2, step: 0.1 },
            { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05 },
            { key: 'frequency_penalty', label: _('freqPenalty'), min: -2, max: 2, step: 0.1 },
            { key: 'presence_penalty', label: _('presPenalty'), min: -2, max: 2, step: 0.1 }
        ];
        paramsDef.forEach(function(p) {
            var val = currentParams[p.key] != null ? currentParams[p.key] : 0;
            html += '<div class="param-item"><label>' + p.label + '</label><input type="number" id="param-' + p.key + '" value="' + val + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '"></div>';
        });
        html += '<div class="param-item"><label>' + _('maxLen') + '</label><input type="number" id="param-max_tokens" placeholder="' + _('leaveEmpty') + '" value="' + (currentParams.max_tokens != null ? currentParams.max_tokens : '') + '" min="1" max="8192"></div>';
        html += '<div class="param-item"><label>' + _('seed') + '</label><input type="number" id="param-seed" placeholder="' + _('leaveEmpty') + '" value="' + (currentParams.seed != null ? currentParams.seed : '') + '"></div>';
        html += '<div class="param-item"><label>' + _('topK') + '</label><input type="number" id="param-topk" placeholder="' + _('leaveEmpty') + '" value="' + (currentParams.top_k != null ? currentParams.top_k : '') + '"></div>';
        html += '<div class="param-item"><label>' + _('customPort') + '</label><input type="number" id="customPortInput" value="' + customPort + '" min="1" max="65535"></div>';
        html += '<div class="param-item"><label>Agent最大迭代</label><input type="number" id="agentMaxIterInput" value="' + agentMaxIterations + '" min="1" max="50"></div>';
        html += '</div>';
        html += '<div class="section-title" style="margin-top:20px;">' + _('extraPrompts') + '</div>';
        html += '<div class="extra-prompts-section" id="extraPromptsSection">';
        if (currentThinkMode === 'fast') { html += '<div class="extra-prompt-item"><span class="extra-prompt-label">' + _('fastMode') + '</span><span class="extra-prompt-value">' + _('fastDesc') + '</span></div>'; }
        else if (currentThinkMode === 'think') { html += '<div class="extra-prompt-item"><span class="extra-prompt-label">' + _('thinkModeDesc') + '</span><span class="extra-prompt-value">' + _('thinkDesc') + '</span></div>'; }
        else if (currentThinkMode === 'deep') { html += '<div class="extra-prompt-item"><span class="extra-prompt-label">' + _('deepMode') + '</span><span class="extra-prompt-value">' + _('deepDesc') + '</span></div>'; }
        else if (currentThinkMode === 'meditate') { html += '<div class="extra-prompt-item"><span class="extra-prompt-label">' + _('meditateMode') + '</span><span class="extra-prompt-value">' + _('meditateDesc') + '</span></div>'; }
        html += '</div>';
        drawerBody.innerHTML = html;

        drawerBody.querySelectorAll('.provider-card').forEach(function(card) {
            card.onclick = async function() {
                drawerBody.querySelectorAll('.provider-card').forEach(function(c) { c.classList.remove('active'); });
                card.classList.add('active');
                currentProvider = card.dataset.id;
                updateChatFormatFromProvider();
                await loadModels(currentProvider);
                saveConfigToBackend();
                await refreshKeyList();
                renderDrawer();
            };
        });
        var formatSelector = document.getElementById('chatFormatSelector');
        if (formatSelector) {
            formatSelector.querySelectorAll('.think-mode-option').forEach(function(btn) {
                btn.onclick = function() {
                    formatSelector.querySelectorAll('.think-mode-option').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    currentChatFormat = btn.dataset.format;
                    saveConfigToBackend();
                };
            });
        }
        document.getElementById('addKeyBtn').onclick = async function() {
            var inp = document.getElementById('newKeyInput');
            if (!inp || !inp.value.trim()) { showToast(_('inputKey')); return; }
            if (!currentProvider) { showToast(_('selectProviderFirst')); return; }
            if (await addProviderKey(currentProvider, inp.value.trim())) {
                showToast(_('keyAdded'));
                inp.value = '';
                await refreshKeyList();
                await loadModels(currentProvider);
            } else showToast(_('addFailed'));
        };
        var sysPromptEl = document.getElementById('systemPromptInput');
        if (sysPromptEl) {
            sysPromptEl.addEventListener('change', function() { currentParams.systemPrompt = this.value; saveConfigToBackend(); });
        }
        // 纯净/正常模式切换
        var pureModeSelector = document.getElementById('pureModeSelector');
        if (pureModeSelector) {
            pureModeSelector.querySelectorAll('.think-mode-option').forEach(function(btn) {
                btn.onclick = function() {
                    pureMode = btn.dataset.mode === 'pure';
                    pureModeSelector.querySelectorAll('.think-mode-option').forEach(function(b) { b.classList.toggle('active', b === btn); });
                    var hint = document.getElementById('pureModeHint');
                    if (hint) hint.style.display = pureMode ? '' : 'none';
                    saveConfigToBackend();
                };
            });
        }
        paramsDef.forEach(function(p) {
            var input = document.getElementById('param-' + p.key);
            if (input) {
                input.addEventListener('change', function() { currentParams[p.key] = parseFloat(this.value) || 0; saveConfigToBackend(); });
            }
        });
        ['seed', 'topk', 'max_tokens'].forEach(function(k) {
            var el = document.getElementById('param-' + k);
            if (el) el.addEventListener('change', function() {
                var val = this.value ? parseInt(this.value) : null;
                if (k === 'seed') currentParams.seed = val;
                else if (k === 'topk') currentParams.top_k = val;
                else if (k === 'max_tokens') currentParams.max_tokens = val;
                saveConfigToBackend();
            });
        });
        var customPortInput = document.getElementById('customPortInput');
        if (customPortInput) {
            customPortInput.addEventListener('change', function() { customPort = this.value ? parseInt(this.value) : 8080; saveConfigToBackend(); });
        }
        var agentMaxIterInput = document.getElementById('agentMaxIterInput');
        if (agentMaxIterInput) {
            agentMaxIterInput.addEventListener('change', function() { agentMaxIterations = this.value ? parseInt(this.value) : 10; saveSettingsToLocal(); });
        }
        await refreshKeyList();
    }

    async function refreshKeyList() {
        var container = document.getElementById('keyListContainer');
        if (!container || !currentProvider) return;
        var keys = await loadProviderKeys(currentProvider);
        container.innerHTML = '';
        keys.forEach(function(mask, idx) {
            var row = document.createElement('div');
            row.className = 'key-row';
            row.innerHTML = '<span class="key-mask">' + mask + '</span><input class="key-edit-input" value="" style="display:none;"><div class="key-actions"><button title="' + _('use') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button><button title="' + _('edit') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button title="' + _('delete') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
            var editInput = row.querySelector('.key-edit-input');
            row.querySelector('[title="' + _('use') + '"]').onclick = async function() {
                if (await useProviderKey(currentProvider, idx)) { showToast(_('keySwitched')); await loadModels(currentProvider); await refreshKeyList(); }
            };
            row.querySelector('[title="' + _('edit') + '"]').onclick = function() {
                row.classList.add('edit');
                editInput.value = '';
                editInput.focus();
                var confirmEdit = async function() {
                    var newKey = editInput.value.trim();
                    if (newKey) {
                        if ((await deleteProviderKey(currentProvider, idx)) && (await addProviderKey(currentProvider, newKey))) { showToast(_('keyUpdated')); await refreshKeyList(); }
                    }
                    row.classList.remove('edit');
                };
                editInput.onkeydown = function(e) { if (e.key === 'Enter') confirmEdit(); };
                editInput.onblur = function() { setTimeout(function() { if (row.classList.contains('edit')) confirmEdit(); }, 100); };
            };
            row.querySelector('[title="' + _('delete') + '"]').onclick = async function() {
                if (confirm(_('confirmDelete'))) {
                    if (await deleteProviderKey(currentProvider, idx)) { showToast(_('deleted')); await refreshKeyList(); }
                }
            };
            container.appendChild(row);
        });
    }

    function renderMarkdown(text) {
        if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
        // Prevent marked from treating [title]:score as markdown reference link (which gets hidden)
        text = text.replace(/^\[([^\]]+)\]:(?=\d)/gm, '[$1] :');
        var renderer = new marked.Renderer();
        renderer.code = function(tok) {
            var codeText = tok && tok.text ? tok.text : '';
            var lang = tok && tok.lang ? tok.lang : 'code';
            var escapedCode = escapeHtml(codeText || '');
            var displayLang = lang.toLowerCase();
            return '<div class="_121d384"><div class="d2a24f03"><span class="d813de27">' + escapeHtml(displayLang) + '</span></div><div class="d2a24f03 _246a029"><div class="efa13877"><button class="ds-atom-button ds-text-button ds-text-button--with-icon" style="margin-right:4px;" onclick="(function(b){var w=b.closest(\'._121d384\');var p=w&&w.nextElementSibling;var c=p&&p.querySelector(\'code\');if(c&&c.textContent){navigator.clipboard.writeText(c.textContent).then(function(){window.showToast(\'已复制代码\');})}else{window.showToast(\'❌ 无法获取代码\')}})(this)"><span>复制</span></button><button class="ds-atom-button ds-text-button ds-text-button--with-icon" style="margin-right:4px;" onclick="(function(b){var w=b.closest(\'._121d384\');var p=w&&w.nextElementSibling;var c=p&&p.querySelector(\'code\');var l=w&&w.querySelector(\'.d813de27\');var la=l?l.textContent.trim():\'txt\';if(c&&c.textContent){var bl=new Blob([c.textContent],{type:\'text/plain;charset=utf-8\'});var u=(window.URL||window.webkitURL).createObjectURL(bl);var a=document.createElement(\'a\');a.href=u;a.download=\'code.\'+la;document.body.appendChild(a);a.click();(window.URL||window.webkitURL).revokeObjectURL(u);a.remove();window.showToast(\'下载完成\')}else{window.showToast(\'❌ 无法获取代码\')}})(this)"><span>下载</span></button><button class="ds-atom-button ds-text-button ds-text-button--with-icon" style="margin-right:4px;" onclick="(function(b){var w=b.closest(\'._121d384\');var p=w&&w.nextElementSibling;var c=p&&p.querySelector(\'code\');var l=w&&w.querySelector(\'.d813de27\');var la=l?l.textContent.trim().toLowerCase():\'\';if(c&&c.textContent){try{if(la===\'javascript\'||la===\'js\'){eval(c.textContent);window.showToast(\'运行成功\')}else if(la===\'html\'){var bl=new Blob([c.textContent],{type:\'text/html\'});var u=(window.URL||window.webkitURL).createObjectURL(bl);window.open(u);window.showToast(\'已打开 HTML 页面\')}else{window.showToast(\'⚠️ 仅支持 JavaScript / HTML 代码运行\')}}catch(err){window.showToast(\'❌ 运行错误:\'+err.message)}}else{window.showToast(\'❌ 无法获取代码\')}})(this)"><span>运行</span></button><div class="ae809fef"></div></div></div></div><pre><code class="language-' + escapeHtml(displayLang) + '">' + escapedCode + '</code></pre>';
        };
        // 强制转义所有非代码块的 HTML，防止页面污染
        renderer.html = function(tok) {
            // marked v4 passes token object {text,raw}; v5+ passes raw string directly
            return escapeHtml(typeof tok === 'string' ? tok : (tok.text || tok.raw || ''));
        };
        // escape all html tags that aren't inside code blocks (already escaped by renderer.code)
        renderer.codespan = function(tok) {
            return '<code>' + escapeHtml(typeof tok === 'string' ? tok : (tok.text || '')) + '</code>';
        };
        renderer.del = function(tok) {
            return typeof tok === 'string' ? tok : (tok.text || tok.raw || '');
        };
        renderer.strikethrough = renderer.del;
        return marked.parse(text, { renderer: renderer, breaks: true });
    }

    function createThinkBlock(reasoning, opts) {
        opts = opts || {};
        var isThinking = opts.isThinking || false;
        var elapsedSeconds = opts.elapsedSeconds || 0;
        var titleText;
        if (isThinking) {
            titleText = _('thinkingDeep');
        } else if (elapsedSeconds > 0) {
            titleText = _('thoughtDeepSec') + elapsedSeconds + _('sec');
        } else {
            titleText = _('thoughtDeep');
        }
        var collapsedClass = (!isThinking && autoCollapseThink) ? ' collapsed' : '';
        return '<div class="think-block' + collapsedClass + '" style="margin-left:-12px;"><div class="think-header" onclick="this.parentElement.classList.toggle(\'collapsed\')"><div class="think-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8.00192 6.64454C8.75026 6.64454 9.35732 7.25169 9.35739 8.00001C9.35739 8.74838 8.7503 9.35548 8.00192 9.35548C7.25367 9.35533 6.64743 8.74829 6.64743 8.00001C6.6475 7.25178 7.25371 6.64468 8.00192 6.64454Z" fill="currentColor"></path></svg></div><span>' + titleText + '</span><div class="think-arrow"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor"></path></svg></div></div><div class="think-body-wrapper"><div class="think-line"></div><div class="think-content">' + escapeHtml(reasoning).replace(/\n/g, '<br>') + '</div></div></div>';
    }

    function createMessageBubble(content, role, images, reasoning, msgRef, cotHtml) {
        var bubble = document.createElement('div');
        var roleClass = role === 'system' ? 'system' : (role === 'user' ? 'user' : 'ai');
        bubble.className = 'message-bubble message-' + roleClass;
        var thinkOpts = (msgRef && msgRef.thinkElapsed) ? { elapsedSeconds: msgRef.thinkElapsed } : {};
        var reasoningHtml = reasoning ? createThinkBlock(reasoning, thinkOpts) : '';
        var contentHtml;
        var hasPluginBlocks = (role === 'ai' && collapsePluginOutput);
        if (role === 'ai') {
            var rendered = hasPluginBlocks ? _renderAIContent(content) : renderMarkdown(content);
            contentHtml = '<div class="markdown-body">' + rendered + '</div>';
        } else if (role === 'system') {
            contentHtml = '<div class="markdown-body system-message">' + renderMarkdown(content) + '</div>';
        } else {
            contentHtml = '<div class="markdown-body">' + renderMarkdown(content) + '</div>';
        }
        bubble.innerHTML = (cotHtml || '') + reasoningHtml + contentHtml;

        if (images && images.length) {
            var ic = document.createElement('div');
            images.forEach(function(src) {
                var img = document.createElement('img');
                img.src = src;
                img.style.cssText = 'max-width:100%;border-radius:8px;margin-top:8px;';
                ic.appendChild(img);
            });
            bubble.appendChild(ic);
        }

        var ad = document.createElement('div');
        ad.className = 'message-actions';
        if (role === 'user') {
            ad.innerHTML = '<button class="action-icon" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="action-icon" data-action="edit" title="修改"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="action-icon" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
        } else if (role === 'system') {
            ad.innerHTML = '<button class="action-icon" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="action-icon" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
        } else {
            ad.innerHTML = '<button class="action-icon" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="action-icon" data-action="regenerate" title="重新生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button><button class="action-icon" data-action="edit" title="修改"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="action-icon" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button><button class="action-icon" data-action="tokens" title="Token消耗"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button><button class="action-icon" data-action="apijson" title="请求JSON"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button><button class="action-icon" data-action="responsejson" title="响应JSON"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button>';
        }
        bubble.appendChild(ad);

        ad.querySelector('[data-action="copy"]').onclick = function() { navigator.clipboard.writeText(content).then(function() { showToast(_('copyDone')); }); };
        ad.querySelector('[data-action="delete"]').onclick = function() {
            if (msgRef) {
                var idx = chats[currentChat].indexOf(msgRef);
                if (idx !== -1) chats[currentChat].splice(idx, 1);
            }
            bubble.remove();
            saveChatToBackend();
        };

        var editBtn = ad.querySelector('[data-action="edit"]');
        if (editBtn) editBtn.onclick = function() {
            var editWrap = document.createElement('div');
            editWrap.className = 'message-edit-area';
            var textarea = document.createElement('textarea');
            textarea.className = 'message-edit-textarea';
            textarea.value = content;
            var editActions = document.createElement('div');
            editActions.className = 'message-edit-actions';
            var saveBtn = document.createElement('button');
            saveBtn.className = 'message-edit-save';
            saveBtn.textContent = _('ok');
            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'message-edit-cancel';
            cancelBtn.textContent = _('cancel');
            editActions.appendChild(saveBtn);
            editActions.appendChild(cancelBtn);
            editWrap.appendChild(textarea);
            editWrap.appendChild(editActions);
            while (bubble.firstChild !== ad) {
                bubble.removeChild(bubble.firstChild);
            }
            bubble.insertBefore(editWrap, ad);
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            function autoResize() {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            }
            textarea.addEventListener('input', autoResize);
            autoResize();

            var saveEdit = function() {
                var newContent = textarea.value.trim();
                if (newContent && msgRef) {
                    msgRef.content = newContent;
                    var newBubble = createMessageBubble(newContent, role, msgRef.images || [], msgRef.reasoning || '', msgRef, '');
                    bubble.parentNode.replaceChild(newBubble, bubble);
                    saveChatToBackend();
                }
            };
            var cancelEdit = function() {
                var newBubble = createMessageBubble(content, role, msgRef && msgRef.images || [], msgRef && msgRef.reasoning || '', msgRef, '');
                bubble.parentNode.replaceChild(newBubble, bubble);
            };
            saveBtn.onclick = saveEdit;
            cancelBtn.onclick = cancelEdit;
            textarea.onkeydown = function(e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                if (e.key === 'Escape') cancelEdit();
            };
        };

        if (role === 'ai') {
            ad.querySelector('[data-action="regenerate"]').onclick = function() {
                sendMessage(true);
            };
            ad.querySelector('[data-action="tokens"]').onclick = function() {
                var td = msgRef && msgRef.usage;
                if (!td) { showToast(_('noTokenData')); return; }
                var it = td.prompt_tokens || td.input_tokens || 0;
                var ot = td.completion_tokens || td.output_tokens || 0;
                var tt = td.total_tokens || (it + ot);
                openFileViewer(_('tokenUsage'), 'Token 消耗详情\n\n输入 Token (prompt): ' + it + '\n输出 Token (completion): ' + ot + '\n总计 Token: ' + tt + '\n\n模型: ' + currentModel + '\n时间: ' + new Date().toLocaleString());
            };
            ad.querySelector('[data-action="apijson"]').onclick = function() {
                var rd = msgRef && msgRef.apiRequest;
                if (!rd) { showToast(_('noApiData')); return; }
                openFileViewer(_('apiRequest'), '请求 JSON\n\n模型: ' + currentModel + '\n提供商: ' + currentProvider + '\n时间: ' + new Date().toLocaleString() + '\n\n' + JSON.stringify(rd, null, 2));
            };
            ad.querySelector('[data-action="responsejson"]').onclick = function() {
                var td = msgRef && msgRef.usage;
                if (!td) { showToast(_('noTokenData')); return; }
                var it = td.prompt_tokens || td.input_tokens || 0;
                var ot = td.completion_tokens || td.output_tokens || 0;
                var tt = td.total_tokens || (it + ot);
                var resp = { model: currentModel, usage: { prompt_tokens: it, completion_tokens: ot, total_tokens: tt }, timestamp: new Date().toISOString() };
                openFileViewer('响应 JSON', '提供商返回的 Token 消耗\n\n模型: ' + currentModel + '\n输入 Token: ' + it + '\n输出 Token: ' + ot + '\n总计 Token: ' + tt + '\n\n' + JSON.stringify(resp, null, 2));
            };
        }
        return bubble;
    }

    function refreshChatDisplay() {
        if (!chatAreaInner) return;
        chatAreaInner.innerHTML = '';
        if (chats[currentChat] && chats[currentChat].length > 0) {
            document.body.classList.add('chat-active');
            chats[currentChat].forEach(function(m) {
                var b = createMessageBubble(m.content, m.role, m.images || [], m.reasoning || '', m);
                if (m.hidden) {
                    b.classList.add('msg-collapsed');
                    b.setAttribute('data-title', (m.content || '').split('\n')[0].substring(0, 60));
                }
                chatAreaInner.appendChild(b);
            });
        }
        if (emptyHint) emptyHint.style.display = chatAreaInner.children.length === 0 ? '' : 'none';
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function addMessage(content, role, images, reasoning, msgRef) {
        if (!chatAreaInner) return null;
        var bubble = createMessageBubble(content, role, images, reasoning, msgRef);
        chatAreaInner.appendChild(bubble);
        if (emptyHint) emptyHint.style.display = 'none';
        chatArea.scrollTop = chatArea.scrollHeight;
        return bubble;
    }

    var pluginBlockTimers = {};
    var _pluginBlockPlaceholders = {};
    function _pluginMark(html) {
        var id = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        _pluginBlockPlaceholders[id] = html;
        return '%%PBM_' + id + '%%';
    }
    function updatePluginTimers() {
        var now = Date.now();
        for (var bid in pluginBlockTimers) {
            var t = pluginBlockTimers[bid];
            if (!t || t.done) continue;
            var el = document.getElementById(bid);
            if (!el) continue;
            var elapsed = Math.round((now - t.start) / 100) / 10;
            var timeSpan = el.querySelector('.pb-time');
            if (timeSpan) timeSpan.textContent = elapsed.toFixed(1) + 's';
        }
    }
    setInterval(updatePluginTimers, 200);

    function _resolvePlugins(html) {
        return html.replace(/%%PBM_([a-z0-9-]+)%%/g, function(m, id) {
            var h = _pluginBlockPlaceholders[id];
            if (h) { delete _pluginBlockPlaceholders[id]; return h; }
            return '';
        });
    }
    function _renderAIContent(text) {
        var withBlocks = renderPluginBlocks(text);
        var md = renderMarkdown(withBlocks);
        return _resolvePlugins(md);
    }

    function renderPluginBlocks(text) {
        if (!collapsePluginOutput) return stripTags(text);
        var result = text;
        // Replace power/powershell blocks
        result = result.replace(/<(?:power|powershell)>\s*([\s\S]*?)\s*<\/(?:power|powershell)>/gi, function(match, cmd) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: false, type: 'cmd', content: cmd.trim() };
            return _pluginMark('<div class="plugin-block cmd-block" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
                '<span class="plugin-block-title">正在执行命令</span>' +
                '<span class="pb-time">0.0s</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(cmd.trim()) + '</div>' +
                '</div>');
        });
        // Replace cmd/command blocks
        result = result.replace(/<(?:cmd|command)>\s*([\s\S]*?)\s*<\/(?:cmd|command)>/gi, function(match, cmd) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: false, type: 'cmd', content: cmd.trim() };
            return _pluginMark('<div class="plugin-block cmd-block" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
                '<span class="plugin-block-title">正在执行命令</span>' +
                '<span class="pb-time">0.0s</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(cmd.trim()) + '</div>' +
                '</div>');
        });
        // Replace mem:key blocks
        result = result.replace(/<mem:([^>]+)>([\s\S]*?)<\/mem:\1>/gi, function(match, key, content) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'mem' };
            return _pluginMark('<div class="plugin-block mem-block" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>' +
                '<span class="plugin-block-title">记忆写入: ' + escapeHtml(key.trim()) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content.trim()) + '</div>' +
                '</div>');
        });
        // FileOperations: add tag
        result = result.replace(/<\s*add\s*>([\s\S]*?)\s*<\s*\/\s*add\s*>/gi, function(match, body) {
            var nlIdx = body.indexOf('\n');
            var fname = nlIdx !== -1 ? body.substring(0, nlIdx).trim() : body.trim();
            var content = nlIdx !== -1 ? body.substring(nlIdx + 1).trim() : '';
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'file' };
            return _pluginMark('<div class="plugin-block file-block" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' +
                '<span class="plugin-block-title">文件写入: ' + escapeHtml(fname) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content || '(空内容)') + '</div>' +
                '</div>');
        });
        // FileOperations: mod tag
        result = result.replace(/<\s*mod\s*>([\s\S]*?)\s*<\s*\/\s*mod\s*>/gi, function(match, body) {
            var nlIdx = body.indexOf('\n');
            var fname = nlIdx !== -1 ? body.substring(0, nlIdx).trim() : body.trim();
            var rest = nlIdx !== -1 ? body.substring(nlIdx + 1).trim() : '';
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'file' };
            return _pluginMark('<div class="plugin-block file-block" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                '<span class="plugin-block-title">文件修改: ' + escapeHtml(fname) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(rest || fname) + '</div>' +
                '</div>');
        });
        // 处理未闭合的开标签（流式输出中），检测到开标签立即折叠
        // power/powershell 未闭合
        result = result.replace(/<(?:power|powershell)>\s*([\s\S]*)$/gi, function(match, content) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: false, type: 'cmd', content: content.trim() };
            return _pluginMark('<div class="plugin-block cmd-block streaming" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
                '<span class="plugin-block-title">正在执行命令</span>' +
                '<span class="pb-time">0.0s</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content) + '</div>' +
                '</div>');
        });
        // cmd/command 未闭合
        result = result.replace(/<(?:cmd|command)>\s*([\s\S]*)$/gi, function(match, content) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: false, type: 'cmd', content: content.trim() };
            return _pluginMark('<div class="plugin-block cmd-block streaming" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
                '<span class="plugin-block-title">正在执行命令</span>' +
                '<span class="pb-time">0.0s</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content) + '</div>' +
                '</div>');
        });
        // add 未闭合
        result = result.replace(/<\s*add\s*>([\s\S]*)$/gi, function(match, content) {
            var nlIdx = content.indexOf('\n');
            var fname = nlIdx !== -1 ? content.substring(0, nlIdx).trim() : content.trim();
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'file' };
            return _pluginMark('<div class="plugin-block file-block streaming" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' +
                '<span class="plugin-block-title">文件写入: ' + escapeHtml(fname) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content) + '</div>' +
                '</div>');
        });
        // mod 未闭合
        result = result.replace(/<\s*mod\s*>([\s\S]*)$/gi, function(match, content) {
            var nlIdx = content.indexOf('\n');
            var fname = nlIdx !== -1 ? content.substring(0, nlIdx).trim() : content.trim();
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'file' };
            return _pluginMark('<div class="plugin-block file-block streaming" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                '<span class="plugin-block-title">文件修改: ' + escapeHtml(fname) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content) + '</div>' +
                '</div>');
        });
        // mem:key 未闭合
        result = result.replace(/<mem:([^>]+)>([\s\S]*)$/gi, function(match, key, content) {
            var bid = 'pb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            pluginBlockTimers[bid] = { start: Date.now(), done: true, type: 'mem' };
            return _pluginMark('<div class="plugin-block mem-block streaming" id="' + bid + '">' +
                '<div class="plugin-block-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>' +
                '<span class="plugin-block-title">记忆写入: ' + escapeHtml(key.trim()) + '</span>' +
                '<span class="plugin-block-arrow"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg></span>' +
                '</div>' +
                '<div class="plugin-block-body">' + escapeHtml(content) + '</div>' +
                '</div>');
        });
        // Remove mem-del tags and conti:994
        result = result.replace(/<mem-del:[^>]+>/gi, '');
        result = result.replace(/^conti:994\s*$/gim, '');
        return result;
    }

    // 用于流式输出时的快速折叠：检测开标签立即包裹
    function wrapStreamingBlock(text) {
        // 如果文本包含开标签但无对应闭标签，将开标签之后的内容折叠
        return renderPluginBlocks(text);
    }

    function stripTags(text) {
        return text
            .replace(/<mem:[^>]+>[\s\S]*?<\/mem:[^>]+>/gi, '')
            .replace(/<(?:power|powershell)>\s*[\s\S]*?\s*<\/(?:power|powershell)>/gi, '')
            .replace(/<(?:cmd|command)>\s*[\s\S]*?\s*<\/(?:cmd|command)>/gi, '')
            .replace(/<\s*(?:add|mod)\s*>[\s\S]*?\s*<\s*\/\s*(?:add|mod)\s*>/gi, '')
            .replace(/<mem-del:[^>]+>/gi, '')
            .replace(/^conti:994\s*$/gim, '')
            .trim();
    }

    async function processToolCalls(responseText) {
        // Parse <power>\n...\n</power> and <cmd>\n...\n</cmd> tags
        var commands = [];
        var powerRegex = /<(?:power|powershell)>\s*([\s\S]*?)\s*<\/(?:power|powershell)>/gi;
        var cmdRegex = /<(?:cmd|command)>\s*([\s\S]*?)\s*<\/(?:cmd|command)>/gi;
        var match;
        while ((match = powerRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
        }
        while ((match = cmdRegex.exec(responseText)) !== null) {
            commands.push({ idx: commands.length, shell: 'cmd', command: match[1].trim() });
        }
        if (commands.length === 0) return;

        var dangerous = [/rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i, /rd\s+\/s/i, /shutdown/i];
        for (var ci = 0; ci < commands.length; ci++) {
            var cmd = commands[ci];
            if (dangerous.some(function(p) { return p.test(cmd.command); })) {
                var msg = { role: 'system', content: _('dangerousBlocked') + cmd.command, images: [], _isExec: true };
                chats[currentChat].push(msg);
                addMessage(msg.content, 'system', [], null, msg);
                continue;
            }
            if (commandConfirmEnabled && window.CommandExecutionPlugin) {
                try {
                    if (!(await window.CommandExecutionPlugin.confirmCommand(cmd.shell, cmd.command))) {
                        var msg = { role: 'system', content: _('cmdCancelled') + cmd.shell + ' ' + cmd.command, images: [], _isExec: true };
                        chats[currentChat].push(msg);
                        addMessage(msg.content, 'system', [], null, msg);
                        continue;
                    }
                } catch (e) {
                    console.error('[命令确认] 确认弹窗失败，直接执行:', e);
                }
            }
            var execId = 'exec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            var execMsg = { role: 'system', content: _('cmdRunning') + cmd.shell + '> ' + cmd.command, images: [], _execId: execId, _isExec: true };
            chats[currentChat].push(execMsg);
            var execBubble = addMessage(execMsg.content, 'system', [], null, execMsg);
            if (execBubble) execBubble.setAttribute('data-exec-id', execId);
            try {
                var workDir = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir;
                var res = await fetch('/api/plugin/CommandExecution/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shell: cmd.shell, command: cmd.command, timeout: 30000, workingDirectory: workDir }) });
                var sysMsg;
                if (res.ok) {
                    var d = await res.json();
                    var out = (d.stdout || d.stderr || '').trim();
                    var resultText = (out || _('noOutput')) + '\n' + _('exitCode') + d.exitCode;
                    sysMsg = { role: 'system', content: _('cmdResult') + cmd.shell + '> ' + cmd.command + '\n' + resultText, images: [], _isExec: true };
                } else {
                    var errText = await res.text();
                    sysMsg = { role: 'system', content: _('cmdFailed') + cmd.shell + '> ' + cmd.command + '\n' + errText, images: [], _isExec: true };
                }
                var idx = chats[currentChat].indexOf(execMsg);
                if (idx !== -1) chats[currentChat][idx] = sysMsg;
                var target = document.querySelector('[data-exec-id="' + execId + '"]');
                if (target) {
                    var newBubble = createMessageBubble(sysMsg.content, 'system', [], null, sysMsg);
                    target.replaceWith(newBubble);
                } else {
                    addMessage(sysMsg.content, 'system', [], null, sysMsg);
                }
            } catch (e) {
                var sysMsg = { role: 'system', content: _('cmdError') + cmd.shell + '> ' + cmd.command + '\n' + e.message, images: [], _isExec: true };
                var idx = chats[currentChat].indexOf(execMsg);
                if (idx !== -1) chats[currentChat][idx] = sysMsg;
                var target = document.querySelector('[data-exec-id="' + execId + '"]');
                if (target) {
                    var newBubble = createMessageBubble(sysMsg.content, 'system', [], null, sysMsg);
                    target.replaceWith(newBubble);
                } else {
                    addMessage(sysMsg.content, 'system', [], null, sysMsg);
                }
            }
        }
        saveChatToBackend();
    }

    async function refreshMemories() {
        try {
            var res = await fetch('/api/plugin/Memory/memories');
            if (res.ok) {
                var data = await res.json();
                cachedMemories = data.memories || [];
            }
        } catch (e) {}
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
                    var msg = { role: 'system', content: _('memSaved') + key + ']', images: [] };
                    chats[currentChat].push(msg);
                    addMessage(msg.content, 'system', [], null, msg);
                }
            } catch (e) {}
        }
        while ((match = memDelRegex.exec(responseText)) !== null) {
            var key = match[1].trim();
            if (!key) continue;
            try {
                var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), { method: 'DELETE' });
                if (res.ok) {
                    var msg = { role: 'system', content: _('memDeleted') + key + ']', images: [] };
                    chats[currentChat].push(msg);
                    addMessage(msg.content, 'system', [], null, msg);
                }
            } catch (e) {}
        }
        if (memRegex.lastIndex > 0 || memDelRegex.lastIndex > 0) saveChatToBackend();
        // reset lastIndex for future calls
        memRegex.lastIndex = 0;
        memDelRegex.lastIndex = 0;
        await refreshMemories();
    }

    async function processFileOpsCalls(responseText) {
        var foRegex = /<(add|mod)>([\s\S]*?)<\/\1>/gi;
        var match;
        var hasMatch = false;
        while ((match = foRegex.exec(responseText)) !== null) { hasMatch = true; }
        if (!hasMatch) return;
        foRegex.lastIndex = 0;
        try {
            var res = await fetch('/api/plugin/FileOperations/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: responseText })
            });
            if (res.ok) {
                var data = await res.json();
                if (data.results && data.results.length > 0) {
                    var lines = [];
                    data.results.forEach(function(r) {
                        if (r.error) {
                            lines.push('[文件操作] ' + r.type + ' 失败: ' + r.error);
                        } else if (r.type === 'add') {
                            lines.push('[文件操作] ' + r.file + ' 已' + (r.action === 'updated' ? '更新' : '创建') + ' (' + r.written + ' bytes)');
                        } else if (r.type === 'mod') {
                            lines.push('[文件操作] ' + r.file + ' 行' + r.range + ' 已修改 (替换' + r.replaced + '行为' + r.with + '行)');
                        }
                    });
                    if (lines.length > 0) {
                        var msg = { role: 'system', content: lines.join('\n'), images: [] };
                        chats[currentChat].push(msg);
                        addMessage(msg.content, 'system', [], null, msg);
                        saveChatToBackend();
                    }
                }
            }
        } catch (e) {}
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
            if (msgs[i]._isExec && msgs[i].role === 'system') {
                msgs[i] = { role: 'system', content: '<End_System>', images: [], _isExec: true };
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
            // 找到第一条 system 消息并融合
            var firstSys = null;
            for (var i = 0; i < rest.length; i++) {
                if (rest[i].role === 'system') { firstSys = rest[i]; break; }
            }
            if (firstSys) {
                firstSys.content = firstSys.content + '\n' + toolTexts.join('\n');
            } else {
                rest.unshift({ role: 'system', content: toolTexts.join('\n'), images: [] });
            }
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
        payload.stream = true;
        payload.requestId = requestId;
        if (currentThinkMode !== 'fast') payload.deep_think = true;
        payload.thinkMode = currentThinkMode;
        currentAbortController = new AbortController();
        var controller = currentAbortController;
        var res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!res.ok) { var err = await res.text(); throw new Error(err); }
        return { body: res.body, apiRequest: payload };
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
        var imgs = activeFiles[target].filter(function(f) { return f.type === 'image'; }).map(function(f) { return f.content; });
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
            var displayContent = userText || (imgs.length ? _('image') : '');
            var userMsg = { role: 'user', content: userText || (imgs.length ? _('image') : ''), images: imgs };
            chats[currentChat].push(userMsg);
            saveChatToBackend();
            if (textFiles.length > 0) {
                var grid = document.createElement('div');
                grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:6px;';
                textFiles.forEach(function(f) {
                    var ext = f.fileName.split('.').pop().toUpperCase() || 'FILE';
                    var sizeStr = ext + ' ' + Math.round((new Blob([f.content]).size / 1024) * 100) / 100 + 'KB';
                    var card = document.createElement('div');
                    card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bubble-user);border-radius:12px;width:160px;cursor:pointer;flex-shrink:0;';
                    card.onclick = function() { openFileViewer(f.fileName, f.content); };
                    card.innerHTML = '<span>' + escapeHtml(f.fileName) + '</span>';
                    grid.appendChild(card);
                });
                chatAreaInner.appendChild(grid);
            }
            addMessage(displayContent, 'user', imgs, null, userMsg);
            if (textFiles.length > 0) {
                textFiles.forEach(function(f) {
                    chats[currentChat].push({ role: 'system', content: _('filePrefix') + f.fileName + ']\n' + f.content });
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
                // 构建工具/Agent 提示词，融合到第一条 system 消息中
                var toolPromptText = '';
                if (agentEnabled) {
                    toolPromptText += '\n[Agent能力]\n你拥有Agent能力，即一个完整轮次内多次调用输出。当你认为有命令需要执行、任务无法在单次输出内执行完毕、需要命令执行的信息去回答用户的需求时，就在命令后面单独一行输出conti:994，当你确认本次输出包含命令执行，且会返回结果时，在命令后面单独一行加上conti:994，但是当命令已经返回结果，且无命令继续执行时，停止输出conti:994。当内容重复时、已解决问题与需求时，立刻停止输出conti:994。';
                }
                if (commandExecEnabled || memoryEnabled || fileOpsEnabled) {
                    toolPromptText += '\n[工具调用能力]\n你可以在回复中直接使用标签调用以下功能：';
                    if (commandExecEnabled) toolPromptText += '\n- 执行PowerShell: <powershell>\\n命令内容\\n</powershell> 或 <power>\\n命令内容\\n</power>\n- 执行CMD: <command>\\n命令内容\\n</command> 或 <cmd>\\n命令内容\\n</cmd>';
                    if (memoryEnabled) toolPromptText += '\n- 保存记忆: <mem:键名>内容</mem:键名>\n- 删除记忆: <mem-del:键名>';
                    if (fileOpsEnabled) toolPromptText += '\n- 写入文件: <add>文件名\\n内容</add>\n- 修改文件: <mod>文件名\\n<行号~行号>\\n新内容</mod>';
                    if (memoryEnabled && cachedMemories.length > 0) {
                        toolPromptText += '\n[已有记忆]';
                        cachedMemories.forEach(function(m, i) { toolPromptText += '\n' + (i + 1) + '. ' + m.key + ': ' + (m.content || ''); });
                    }
                    toolPromptText += '\n标签不会显示给用户，请自然地将标签穿插在回复中。';
                    if (commandExecEnabled) {
                        var wd = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || 'cwd';
                        toolPromptText += '\n默认工作目录为 ' + wd + '，所有命令默认在此目录执行。';
                        toolPromptText += '\n记住你有真实的命令调用权限，如果命令错误可以查看错误码进行修正，记住当命令无返回时，表示执行成功（静默执行），命令执行完成后，系统会返回[命令结果]至对话内。执行命令前建议使用 conti:994 字段追加调用。';
                    }
                }
                // 融合到第一条 system 消息中（不新建单独消息）
                if (toolPromptText) {
                    var firstSys = null;
                    for (var si = 0; si < iterMsgs.length; si++) {
                        if (iterMsgs[si].role === 'system') { firstSys = iterMsgs[si]; break; }
                    }
                    if (firstSys) {
                        if (firstSys.content.indexOf('[工具调用能力]') === -1 && firstSys.content.indexOf('[Agent能力]') === -1) {
                            firstSys.content += '\n' + toolPromptText;
                        }
                    } else {
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

                if (agentEnabled) {
                    var iterLabel = document.createElement('div');
                    iterLabel.style.cssText = 'font-size:11px;color:#9b968b;margin-bottom:6px;';
                    iterLabel.textContent = 'Agent 迭代 ' + (agentIter + 1) + '/' + maxAgentIter;
                    bubble.insertBefore(iterLabel, reasoningDiv);
                }

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
                                    }
                                    if (delta.content != null) {
                                        fullContent += String(delta.content);
                                        if (fullContent) contentDiv.innerHTML = _renderAIContent(fullContent) || '...';
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
                if (fileOpsEnabled) {
                    try { await processFileOpsCalls(fullContent); } catch (e) { console.error('[文件操作错误]', e); }
                }

                if (!agentEnabled) break;

                // Check conti:994 on any line
                var shouldContinue = false;
                if (agentIter < maxAgentIter - 1) {
                    var contentLines = fullContent.split('\n');
                    for (var cl = 0; cl < contentLines.length; cl++) {
                        if (contentLines[cl].trim() === 'conti:994') {
                            shouldContinue = true;
                            break;
                        }
                    }
                }
                console.log('[Agent] 迭代 ' + (agentIter + 1) + ' 完成, 长度: ' + fullContent.length + ', conti:994=' + shouldContinue);

                if (!shouldContinue) break;

                // Keep content visible — only collapse following system messages (command results)
                if (agentIter < maxAgentIter - 1) {
                    var oldBubble = bubble;
                    var iterNum = agentIter + 1;
                    oldBubble.dataset.agentIter = iterNum;

                    // Add a subtle iteration badge
                    var badge = document.createElement('div');
                    badge.className = 'agent-iter-badge';
                    badge.style.cssText = 'font-size:11px;color:#9b968b;padding:2px 0 6px 0;user-select:none;display:flex;align-items:center;gap:4px;';
                    badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
                    badge.appendChild(document.createTextNode('Agent ' + iterNum + '/' + maxAgentIter));
                    oldBubble.appendChild(badge);

                    // Collapse following system messages (command results) by default
                    var nextSib = oldBubble.nextElementSibling;
                    while (nextSib) {
                        if (nextSib.classList.contains('message-ai')) break;
                        if (nextSib.classList.contains('message-system')) {
                            nextSib.style.display = 'none';
                        }
                        nextSib = nextSib.nextElementSibling;
                    }

                    bubble = addMessage(_('thinking'), 'ai', [], null, null);
                }
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

    function activateChat(animated) {
        isChatActive = true;
        document.body.classList.add('chat-active');
        if (centerInit) {
            if (animated) {
                centerInit.classList.add('slide-down');
                setTimeout(function() { if (centerInit) centerInit.style.display = 'none'; }, 450);
            } else {
                centerInit.style.display = 'none';
            }
        }
        updateHeaderTitle();
    }

    function deactivateChat() {
        isChatActive = false;
        document.body.classList.remove('chat-active');
        if (centerInit) { centerInit.style.display = null; centerInit.classList.remove('slide-down'); }
        if (chatAreaInner) chatAreaInner.innerHTML = '';
        if (initText) initText.value = '';
        if (chatText) chatText.value = '';
        history.pushState(null, '', '/');
    }

    async function switchChat(idx) {
        if (pendingNewChatIndex !== null && idx !== pendingNewChatIndex && chats[pendingNewChatIndex] && chats[pendingNewChatIndex].length === 0) {
            chats.splice(pendingNewChatIndex, 1);
            chatTitles.splice(pendingNewChatIndex, 1);
            chatTokens.splice(pendingNewChatIndex, 1);
            pendingNewChatIndex = null;
            if (idx > pendingNewChatIndex) idx--;
        }
        if (idx === currentChat && isChatActive) return;
        currentChat = idx;
        updateUrlWithToken();
        if (chatAreaInner) chatAreaInner.innerHTML = '';
        // Lazy load chat messages if not loaded yet
        if (!chats[idx]) {
            try {
                var detail = await (await fetch('/api/chat/' + idx)).json();
                chats[idx] = detail.messages || [];
                if (detail.title) chatTitles[idx] = detail.title;
                if (detail.token) chatTokens[idx] = detail.token;
            } catch (e) { chats[idx] = []; }
        }
        if (!chats[idx] || !chats[idx].length) {
            if (emptyHint) emptyHint.style.display = 'block';
        } else {
            if (emptyHint) emptyHint.style.display = 'none';
            var bubbles = [];
            chats[idx].forEach(function(m) {
                if (!m.role) return;
                var r = m.role === 'system' ? 'system' : (m.role === 'user' ? 'user' : 'ai');
                var b = addMessage(m.content, r, m.images || [], m.reasoning, m);
                bubbles.push({ bubble: b, role: r, msg: m });
            });
            // Re-apply agent iteration collapse for reloaded chats
            applyAgentCollapse(bubbles);
        }
        updateHistoryList();
        updateHeaderTitle();
    }

    async function newChat(animated) {
        // 如果已经有空的待确认对话，忽略（已经在开幕状态）
        if (pendingNewChatIndex !== null && chats[pendingNewChatIndex] && chats[pendingNewChatIndex].length === 0) {
            return;
        }
        // 如果当前在对话中，回到开幕界面
        if (isChatActive) {
            deactivateChat();
        }
        // 创建新的待确认对话
        var newToken = generateToken();
        chats.push([]);
        chatTitles.push(_('newChat'));
        chatTokens.push(newToken);
        pendingNewChatIndex = chats.length - 1;
        currentChat = pendingNewChatIndex;
        if (chatAreaInner) chatAreaInner.innerHTML = '';
        if (emptyHint) { emptyHint.style.display = 'block'; emptyHint.textContent = _('whatCanIDo'); }
        updateHistoryList();
        updateHeaderTitle();
    }

    function applyAgentCollapse(bubbles) {
        if (!bubbles || !bubbles.length) return;
        // Find groups of AI messages separated only by system messages (agent iterations)
        var i = 0;
        while (i < bubbles.length) {
            if (bubbles[i].role !== 'ai') { i++; continue; }
            // Collect all AI indices in this agent round (skip system messages between them, stop at user)
            var aiIndices = [i];
            var peek = i + 1;
            while (peek < bubbles.length) {
                if (bubbles[peek].role === 'system') { peek++; continue; }
                if (bubbles[peek].role === 'ai') { aiIndices.push(peek); peek++; continue; }
                break; // user or other role - end of this agent round
            }
            var groupSize = aiIndices.length;
            if (groupSize > 1) {
                // Collapse all AI bubbles except the last one
                for (var ai = 0; ai < groupSize - 1; ai++) {
                    var gi = aiIndices[ai];
                    var bub = bubbles[gi].bubble;
                    if (!bub) continue;
                    var iterNum = ai + 1;
                    bub.dataset.agentIter = iterNum;
                    // Wrap content
                    var contentWrap = document.createElement('div');
                    contentWrap.className = 'agent-iter-content';
                    while (bub.firstChild) contentWrap.appendChild(bub.firstChild);
                    bub.appendChild(contentWrap);
                    // Create toggle header
                    var toggleHeader = document.createElement('div');
                    toggleHeader.className = 'agent-iter-toggle';
                    toggleHeader.style.cssText = 'font-size:12px;color:#9b968b;cursor:pointer;padding:4px 0;user-select:none;display:flex;align-items:center;gap:6px;';
                    toggleHeader.innerHTML = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 2.15L5.92 2.58L8.65 5.3C8.91 5.56 9.13 5.78 9.3 5.99C9.47 6.2 9.62 6.44 9.67 6.75C9.69 6.92 9.69 7.08 9.67 7.25C9.62 7.56 9.47 7.8 9.3 8.01C9.13 8.22 8.91 8.44 8.65 8.7L5.92 11.42L5.5 11.85L4.65 11L5.08 10.58L7.8 7.85C8.08 7.57 8.25 7.4 8.36 7.26C8.47 7.13 8.48 7.08 8.48 7.06C8.49 7.02 8.49 6.98 8.48 6.94C8.48 6.92 8.47 6.87 8.36 6.74C8.25 6.6 8.08 6.43 7.8 6.15L5.08 3.42L4.65 3L5.5 2.15Z" fill="currentColor"/></svg>';
                    toggleHeader.appendChild(document.createTextNode('Agent ' + iterNum + '/' + groupSize));
                    bub.insertBefore(toggleHeader, contentWrap);
                    // Collapse state
                    bub.dataset.agentCollapsed = '1';
                    contentWrap.style.display = 'none';
                    bub.style.opacity = '0.5';
                    // Collect and collapse system messages between this AI and the next AI (or end)
                    var sysList = [];
                    var nextAiIdx = (ai + 1 < groupSize) ? aiIndices[ai + 1] : bubbles.length;
                    for (var si = gi + 1; si < nextAiIdx; si++) {
                        if (bubbles[si].role === 'system' && bubbles[si].bubble) {
                            bubbles[si].bubble.style.display = 'none';
                            sysList.push(bubbles[si].bubble);
                        }
                    }
                    // Click handler
                    toggleHeader.onclick = function(hdr, wrap, b, sList) {
                        return function() {
                            var isCollapsed = b.dataset.agentCollapsed === '1';
                            if (isCollapsed) {
                                b.dataset.agentCollapsed = '0';
                                wrap.style.display = '';
                                b.style.opacity = '1';
                                hdr.querySelector('svg').style.transform = 'rotate(90deg)';
                                sList.forEach(function(s) { if (s) s.style.display = ''; });
                            } else {
                                b.dataset.agentCollapsed = '1';
                                wrap.style.display = 'none';
                                b.style.opacity = '0.5';
                                hdr.querySelector('svg').style.transform = '';
                                sList.forEach(function(s) { if (s) s.style.display = 'none'; });
                            }
                        };
                    }(toggleHeader, contentWrap, bub, sysList);
                }
            }
            i = aiIndices[groupSize - 1] + 1;
        }
    }

    function updateHistoryTitle() {
        var msgs = chats[currentChat]?.filter(function(m) { return m.role === 'user'; }) || [];
        chatTitles[currentChat] = msgs.length ? (msgs[0].content || _('image')).substring(0, 25) : _('emptyChat');
        updateHeaderTitle();
        updateHistoryList();
    }

    function updateHeaderTitle() { if (chatTitleText) chatTitleText.textContent = chatTitles[currentChat] || _('chat'); }

    function updateHistoryList() {
        if (!historyList) return;
        var ordered = [];
        pinnedChats.forEach(function(id) { if (id < chatTitles.length && chatTitles[id]) ordered.push(id); });
        for (var i = chatTitles.length - 1; i >= 0; i--) {
            if (!pinnedChats.has(i) && chatTitles[i]) ordered.push(i);
        }
        historyList.innerHTML = ordered.map(function(idx) {
            var title = chatTitles[idx] || _('unnamed');
            var pinned = pinnedChats.has(idx);
            return '<li class="chat-history-item' + (idx === currentChat ? ' active' : '') + '" data-index="' + idx + '"><span class="history-title">' + escapeHtml(title) + '</span><div class="history-actions"><button class="action-icon small" title="' + _('pin') + '">' + (pinned ? '★' : '☆') + '</button><button class="action-icon small" title="' + _('rename') + '">✎</button><button class="action-icon small" title="' + _('delete') + '">✕</button></div></li>';
        }).join('');
        historyList.querySelectorAll('li').forEach(function(li) {
            var idx = parseInt(li.dataset.index);
            li.onclick = function(e) {
                if (e.target.closest('button')) return;
                if (!isChatActive) activateChat(false);
                switchChat(idx);
            };
            li.querySelector('[title="' + _('pin') + '"]').onclick = function(e) { e.stopPropagation(); if (pinnedChats.has(idx)) pinnedChats.delete(idx); else pinnedChats.add(idx); updateHistoryList(); };
            li.querySelector('[title="' + _('rename') + '"]').onclick = function(e) {
                e.stopPropagation();
                var newTitle = prompt(_('renameTitle'), chatTitles[idx]);
                if (newTitle) { chatTitles[idx] = newTitle; if (idx === currentChat) updateHeaderTitle(); updateHistoryList(); saveChatToBackend(); }
            };
            li.querySelector('[title="' + _('delete') + '"]').onclick = async function(e) {
                e.stopPropagation();
                if (!confirm(_('confirmDeleteChat'))) return;
                try { await fetch('/api/chat/' + idx, { method: 'DELETE' }); } catch (e) {}
                chats.splice(idx, 1);
                chatTitles.splice(idx, 1);
                chatTokens.splice(idx, 1);
                pinnedChats.delete(idx);
                if (currentChat >= chats.length) currentChat = chats.length - 1;
                if (currentChat < 0) { currentChat = 0; chats = [[]]; chatTitles = [_('currentChatTitle')]; chatTokens = ['']; }
                updateHistoryList();
                if (isChatActive) switchChat(currentChat);
            };
        });
    }

    chatHeader.onclick = function(e) {
        if (e.target === chatTitleInput) return;
        chatTitleText.style.display = 'none';
        chatTitleInput.style.display = 'inline-block';
        chatTitleInput.value = chatTitles[currentChat];
        chatTitleInput.focus();
        chatTitleInput.onkeydown = async function(ev) {
            if (ev.key === 'Enter') {
                var t = chatTitleInput.value.trim();
                if (t) { chatTitles[currentChat] = t; updateHeaderTitle(); updateHistoryList(); saveChatToBackend(); }
                chatTitleInput.style.display = 'none';
                chatTitleText.style.display = 'inline';
            } else if (ev.key === 'Escape') {
                chatTitleInput.style.display = 'none';
                chatTitleText.style.display = 'inline';
            }
        };
        chatTitleInput.onblur = function() { setTimeout(function() { chatTitleInput.style.display = 'none'; chatTitleText.style.display = 'inline'; }, 100); };
    };

    function addDirectChatButton() {
        if (document.getElementById('directChatBtn')) return;
        var wrapper = document.createElement('div');
        wrapper.className = 'direct-chat-container';
        wrapper.innerHTML = '<button id="directChatBtn" style="margin-top:12px;background:none;border:none;color:#aaa;font-size:12px;cursor:pointer;text-decoration:underline;">' + _('startNewChat') + '</button>';
        wrapper.onclick = async function(e) { e.stopPropagation(); await newChat(); };
        var inputWrapper = centerInit && centerInit.querySelector('.input-wrapper-outer');
        if (inputWrapper) inputWrapper.after(wrapper);
    }

    newChatSidebarBtn.onclick = sidebarLogo.onclick = async function() { await newChat(); };
    var fabBtn = document.getElementById('sidebarNewChatFab');
    if (fabBtn) fabBtn.onclick = async function() { await newChat(); };

    window.addEventListener('popstate', function() {
        var match = window.location.pathname.match(/^\/chat\/([A-Za-z0-9]+)$/);
        if (match) {
            var idx = chatTokens.indexOf(match[1]);
            if (idx !== -1 && idx !== currentChat) { if (!isChatActive) activateChat(false); switchChat(idx); }
        }
    });

    function stopGeneration() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        // Also tell the backend to abort the upstream request
        if (currentRequestId) {
            fetch('/api/chat/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: currentRequestId }) }).catch(function() {});
        }
    }
    initSend.onclick = function() {
        if (streaming) { stopGeneration(); }
        else { sendMessage(false); }
    };
    chatSend.onclick = function() {
        if (streaming) { stopGeneration(); }
        else { sendMessage(false); }
    };
    var slashCommands = [
        { name: 'help', desc: _('slashHelp') || '显示可用命令帮助' },
        { name: 'context', desc: _('slashContext') || '显示当前上下文占用情况' },
        { name: 'compact', desc: _('slashCompact') || '压缩上下文，隐藏无用文本' }
    ];
    var slashPopup = null;
    var slashActiveIndex = -1;
    var slashTarget = null;
    var slashGhostEls = {};

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

    function showSlashPopup(ta) {
        initSlashPopup();
        var val = ta.value;
        if (!val.startsWith('/') || val.indexOf(' ') !== -1) {
            hideSlashPopup(ta);
            return;
        }
        var query = val.substring(1).toLowerCase();
        var matches = slashCommands.filter(function(c) { return c.name.indexOf(query) !== -1; });
        matches.sort(function(a, b) {
            var aPre = a.name.indexOf(query) === 0 ? 0 : 1;
            var bPre = b.name.indexOf(query) === 0 ? 0 : 1;
            return aPre - bPre || a.name.length - b.name.length;
        });
        if (matches.length === 0) {
            hideSlashPopup(ta);
            return;
        }
        var completion = query && matches[0].name.substring(query.length);
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
        hideSlashPopup(ta);
        ta.value = '';
        updateSendBtn();
        switch (cmd) {
            case 'help': renderSlashHelp(); break;
            case 'context': renderSlashContext(); break;
            case 'compact': renderSlashCompact(); break;
        }
    }

    function estimateTokens(text) {
        if (!text) return 0;
        var cjk = (text.match(/[一-鿿㐀-䶿⺀-⻿　-〿㇀-㇯㈀-㋿㌀-㏿豈-﫿＀-￯]/g) || []).length;
        var other = text.length - cjk;
        return Math.ceil(cjk * 0.6 + other * 0.25);
    }

    function renderSlashContext() {
        var msgTokens = 0;
        var hiddenTokens = 0;
        if (chats[currentChat]) {
            chats[currentChat].forEach(function(m) {
                var t = estimateTokens(m.content || '');
                if (m.hidden) hiddenTokens += t;
                else msgTokens += t;
            });
        }
        var sysPromptText = baseSystemPrompt || '';
        if (currentParams.systemPrompt) sysPromptText += '\n' + currentParams.systemPrompt;
        var sysTokens = estimateTokens(sysPromptText);
        // Tool prompt (~300 chars avg when enabled)
        var toolTokens = (commandExecEnabled || memoryEnabled || fileOpsEnabled || agentEnabled) ? 80 : 0;
        var totalTokens = msgTokens + sysTokens + toolTokens;
        var maxTokens = 1000000;
        var pct = Math.min(totalTokens / maxTokens * 100, 100);
        var remaining = maxTokens - totalTokens;
        var barClass = 'context-bar-fill';
        if (pct > 80) barClass += ' danger';
        else if (pct > 60) barClass += ' warn';

        var html = '<div class="context-bar-wrap"><div class="' + barClass + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
            '<div class="context-stats"><span>' + (_('used') || '已用') + ': <b>' + totalTokens.toLocaleString() + '</b> tokens (' + pct.toFixed(1) + '%)</span><span>' + (_('remaining') || '剩余') + ': <b>' + remaining.toLocaleString() + '</b> tokens</span></div>' +
            '<div class="context-stats" style="margin-top:4px;flex-direction:column;gap:2px;">' +
            '<span>' + (_('chatMessages') || '对话消息') + ': ' + msgTokens.toLocaleString() + ' tokens</span>' +
            '<span>' + (_('sysPrompt') || '系统提示词') + ': ' + sysTokens.toLocaleString() + ' tokens</span>' +
            (toolTokens ? '<span>' + (_('toolChain') || '工具链') + ': ' + toolTokens.toLocaleString() + ' tokens</span>' : '') +
            (hiddenTokens ? '<span style="color:#8b8178;">' + (_('hiddenText') || '已隐藏') + ': ' + hiddenTokens.toLocaleString() + ' tokens</span>' : '') +
            '</div>' +
            '<div class="context-stats" style="margin-top:4px;"><span>' + (_('totalCapacity') || '总容量') + ': ' + maxTokens.toLocaleString() + ' tokens (1M)</span></div>';

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

    function renderSlashCompact() {
        if (!currentProvider || !currentModel) {
            addSlashResult(_('slashCommands') || '命令', '<p style="color:#b8554a;">' + (_('noProvider') || '请先选择模型') + '</p>');
            return;
        }
        var msgs = chats[currentChat] || [];
        if (msgs.length === 0) {
            addSlashResult('Compact', '<p style="color:#9b968b;">' + (_('emptyChat') || '空对话') + '</p>');
            return;
        }
        // Collect [title]:score first lines from each message
        var lines = [];
        msgs.forEach(function(m, i) {
            if (!m.content) return;
            var firstLine = m.content.split('\n')[0].trim();
            lines.push({ idx: i, role: m.role, firstLine: firstLine });
        });
        var listText = lines.map(function(l) {
            return '[' + l.idx + '] ' + (l.role === 'user' ? '用户' : '模型') + ': ' + l.firstLine;
        }).join('\n');

        var compactPrompt = '程序区分1~3，表示压缩文本程度，目前程度3，清理大部分无用文本，维持命令文本，不触碰维持对话的核心文本。你需要根据文本序号压缩总的上下文，隐藏无用的模型文本，格式如[输出概括]:0~10，序号为重要性程度，你只需要输出需要隐藏的标题文本，并使用|相隔表示隐藏多个，格式如[...]|[...]|，无视其他命令。\n以下是对话文本列表：\n' + listText;

        // Show processing state
        compactOverlayBody = addSlashResult('Compact', '<p style="color:#9b968b;">' + (_('thinking') || '分析中...') + '</p><p style="font-size:12px;color:#8b8178;margin-top:8px;">' + (_('thinking') || '正在分析对话，标记可隐藏文本...') + '</p>');

        // Call the model
        sendCompactRequest(compactPrompt, lines);
    }

    async function sendCompactRequest(compactPrompt, lines) {
        try {
            var resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    model: currentModel,
                    messages: [{ role: 'system', content: compactPrompt }, { role: 'user', content: '请根据规则输出需要隐藏的文本标题' }],
                    temperature: 0.1, max_tokens: 500, stream: false,
                    chatFormat: currentChatFormat
                })
            });
            if (!resp.ok) {
                updateCompactResult('<p style="color:#b8554a;">' + _('requestFailed') + resp.status + '</p>');
                return;
            }
            var data = await resp.json();
            var content = data.content || data.choices?.[0]?.message?.content || '';
            // Parse: [title]|[title]|
            var titles = [];
            var re = /\[([^\]]+)\]/g;
            var m;
            while ((m = re.exec(content)) !== null) {
                var t = m[1].trim();
                if (t && !/^\d+$/.test(t)) titles.push(t); // exclude pure numbers
            }
            // Fuzzy match titles to messages and hide
            var hiddenCount = 0;
            titles.forEach(function(t) {
                var lower = t.toLowerCase();
                var matchLen = Math.min(t.length, 10);
                var searchKey = lower.substring(0, matchLen);
                for (var i = 0; i < lines.length; i++) {
                    var lineTitle = lines[i].firstLine.toLowerCase();
                    if (lineTitle.indexOf(searchKey) !== -1) {
                        if (chats[currentChat][lines[i].idx] && !chats[currentChat][lines[i].idx].hidden) {
                            chats[currentChat][lines[i].idx].hidden = true;
                            hiddenCount++;
                        }
                        break;
                    }
                }
            });
            saveChatToBackend();
            refreshChatDisplay();
            var resultHtml = '<p style="color:#6b8a5e;font-weight:500;">' + (_('compactDone') || '压缩完成') + '</p>' +
                '<p style="font-size:13px;color:#8b8178;margin-top:6px;">' + (_('compactHidden') || '已隐藏') + ' <b>' + hiddenCount + '</b> ' + (_('compactMsgs') || '条消息') + '</p>';
            updateCompactResult(resultHtml);
        } catch (e) {
            if (e.name === 'AbortError') return;
            updateCompactResult('<p style="color:#b8554a;">' + (_('requestFailed') || '请求失败') + ': ' + e.message + '</p>');
        }
    }

    var compactOverlayBody = null;
    function updateCompactResult(html) {
        if (compactOverlayBody) compactOverlayBody.innerHTML = html;
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
        if (val.startsWith('/') && val.indexOf(' ') === -1 && val.length >= 1) {
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
    chatArea.addEventListener('scroll', function() { isUserScrolledAway = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 40; });
    chatArea.addEventListener('click', function(e) {
        var collapsed = e.target.closest('.msg-collapsed');
        if (collapsed) collapsed.classList.toggle('expanded');
        var pbHeader = e.target.closest('.plugin-block-header');
        if (pbHeader) pbHeader.parentElement.classList.toggle('collapsed');
    });

    async function getIdentity() {
        try { var r = await fetch('/api/identity'); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
    }
    async function initIdentity() { try { await fetch('/api/identity', { method: 'POST' }); } catch (e) {} }

    async function renderIdentitySettingsTab() {
        if (!settingsPanelContent) return;
        await initIdentity();
        var identity = await getIdentity();
        if (!identity) {
            settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">用户标识</div><p style="color:#999;font-size:13px;">' + _('identityFail') + '</p></div>';
            return;
        }
        settingsPanelContent.innerHTML = '<div class="settings-section"><div class="settings-section-title">用户标识</div>' +
            '<div class="settings-item"><span class="settings-item-label">唯一标识</span><span style="font-size:12px;color:#888;font-family:monospace;">' + escapeHtml(identity.id || '---') + '</span></div>' +
            '<div class="settings-item"><span class="settings-item-label">首次使用时间</span><span style="font-size:12px;color:#888;">' + (identity.createdAt ? new Date(identity.createdAt).toLocaleString('zh-CN') : '---') + '</span></div>' +
            '<div class="settings-item"><span class="settings-item-label">最后活跃时间</span><span style="font-size:12px;color:#888;">' + (identity.lastActive ? new Date(identity.lastActive).toLocaleString('zh-CN') : '---') + '</span></div></div>';
    }

    document.addEventListener('DOMContentLoaded', function() {
        var initDeepThinkBtn = document.getElementById('initialDeepThinkBtn');
        var chatDeepThinkBtn = document.getElementById('chatDeepThinkBtn');
        if (!initDeepThinkBtn || !chatDeepThinkBtn) { console.warn('深度思考按钮未找到'); return; }

        var currentPopup = null;
        function createDeepThinkPopup(triggerBtn) {
            var existing = document.querySelector('.deep-think-popup');
            if (existing) { existing.remove(); if (existing._triggerBtn === triggerBtn) { currentPopup = null; return; } }
            var popup = document.createElement('div');
            popup.className = 'deep-think-popup';
            popup._triggerBtn = triggerBtn;
            var workDir = (window.CommandExecutionPlugin && window.CommandExecutionPlugin.workingDirectory) || defaultWorkDir || 'cwd';
            popup.innerHTML = '<div class="deep-think-popup-inner"><div class="work-dir-section" style="margin-bottom:14px;"><div class="tool-chain-title" style="margin-bottom:8px;">工作目录</div><div style="display:flex;gap:6px;align-items:center;"><input type="text" id="workDirPopupInput" value="' + workDir.replace(/\\/g, '\\\\') + '" style="flex:1;padding:6px 10px;border:1px solid #e8e5df;border-radius:6px;font-size:12px;background:#fafaf7;color:#3c3630;outline:none;" placeholder="工作目录路径"><button id="workDirResetBtn" style="padding:6px 12px;border:1px solid #e8e5df;border-radius:6px;background:#fafaf7;color:#9b968b;font-size:12px;cursor:pointer;white-space:nowrap;">默认</button></div></div><div class="tool-chain-section"><div class="tool-chain-title">' + _('toolChain') + '</div><div class="tool-chain-item"><div class="tool-chain-item-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg><span>' + _('memory') + '</span></div><div class="tool-chain-toggle"><button class="tool-chain-option' + (memoryEnabled ? ' active' : '') + '" data-tool="memory" data-value="on">' + _('allow') + '</button><button class="tool-chain-option' + (!memoryEnabled ? ' active' : '') + '" data-tool="memory" data-value="off">' + _('disable') + '</button></div></div><div class="tool-chain-item"><div class="tool-chain-item-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>' + _('commandExec') + '</span></div><div class="tool-chain-toggle"><button class="tool-chain-option' + (commandExecEnabled ? ' active' : '') + '" data-tool="command" data-value="on">' + _('allow') + '</button><button class="tool-chain-option' + (!commandExecEnabled ? ' active' : '') + '" data-tool="command" data-value="off">' + _('disable') + '</button></div></div><div class="tool-chain-item"><div class="tool-chain-item-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>' + _('fileOps') + '</span></div><div class="tool-chain-toggle"><button class="tool-chain-option' + (fileOpsEnabled ? ' active' : '') + '" data-tool="fileops" data-value="on">' + _('allow') + '</button><button class="tool-chain-option' + (!fileOpsEnabled ? ' active' : '') + '" data-tool="fileops" data-value="off">' + _('disable') + '</button></div></div><div class="tool-chain-item"><div class="tool-chain-item-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><span>' + _('agent') + '</span></div><div class="tool-chain-toggle"><button class="tool-chain-option' + (agentEnabled ? ' active' : '') + '" data-tool="agent" data-value="on">' + _('allow') + '</button><button class="tool-chain-option' + (!agentEnabled ? ' active' : '') + '" data-tool="agent" data-value="off">' + _('disable') + '</button></div></div><div class="tool-chain-item"><div class="tool-chain-item-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 12 3 12 12 3 21 12 19 12"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/></svg><span>' + _('compressOldExec') + '</span></div><div class="tool-chain-toggle"><button class="tool-chain-option' + (compressOldExecutions ? ' active' : '') + '" data-tool="compressExec" data-value="on">' + _('on') + '</button><button class="tool-chain-option' + (!compressOldExecutions ? ' active' : '') + '" data-tool="compressExec" data-value="off">' + _('off') + '</button></div></div></div><div class="think-section"><span class="think-section-title">' + _('thinkMode') + '</span><div class="think-mode-selector" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px;width:320px;"><button class="think-mode-option' + (currentThinkMode === 'fast' ? ' active' : '') + '" data-mode="fast"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>' + _('fast') + '</span></button><button class="think-mode-option' + (currentThinkMode === 'think' ? ' active' : '') + '" data-mode="think"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>' + _('think') + '</span></button><button class="think-mode-option' + (currentThinkMode === 'deep' ? ' active' : '') + '" data-mode="deep"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg><span>' + _('deep') + '</span></button><button class="think-mode-option' + (currentThinkMode === 'meditate' ? ' active' : '') + '" data-mode="meditate"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>' + _('meditate') + '</span></button></div></div></div>';
            document.body.appendChild(popup);
            var rect = triggerBtn.getBoundingClientRect();
            popup.style.left = (rect.left + rect.width / 2 - 10) + 'px';
            popup.style.top = (rect.top - 8) + 'px';
            popup.style.transformOrigin = 'bottom center';
            requestAnimationFrame(function() {
                popup.classList.add('active');
                requestAnimationFrame(function() { popup.style.left = (rect.left + rect.width / 2 - popup.offsetWidth / 2) + 'px'; popup.style.top = (rect.top - popup.offsetHeight - 8) + 'px'; });
            });
            popup.querySelectorAll('.think-mode-option').forEach(function(op) {
                op.addEventListener('click', function() {
                    currentThinkMode = op.dataset.mode;
                    deepThinkEnabled = currentThinkMode !== 'fast';
                    popup.querySelectorAll('.think-mode-option').forEach(function(o) { o.classList.toggle('active', o === op); });
                    saveSettingsToLocal();
                });
            });
            popup.querySelectorAll('.tool-chain-option').forEach(function(op) {
                op.addEventListener('click', function() {
                    var tool = op.dataset.tool;
                    var value = op.dataset.value;
                    if (tool === 'memory') {
                        memoryEnabled = value === 'on';
                        popup.querySelectorAll('.tool-chain-option[data-tool="memory"]').forEach(function(o) { o.classList.toggle('active', o === op); });
                        if (window.MemoryPlugin) window.MemoryPlugin.setEnabled(memoryEnabled);
                        saveSettingsToLocal();
                    }
                    if (tool === 'command') {
                        commandExecEnabled = value === 'on';
                        popup.querySelectorAll('.tool-chain-option[data-tool="command"]').forEach(function(o) { o.classList.toggle('active', o === op); });
                        if (window.CommandExecutionPlugin) window.CommandExecutionPlugin.setEnabled(commandExecEnabled);
                        saveSettingsToLocal();
                    }
                    if (tool === 'fileops') {
                        fileOpsEnabled = value === 'on';
                        popup.querySelectorAll('.tool-chain-option[data-tool="fileops"]').forEach(function(o) { o.classList.toggle('active', o === op); });
                        if (window.FileOperationsPlugin) window.FileOperationsPlugin.enabled = fileOpsEnabled;
                        saveSettingsToLocal();
                    }
                    if (tool === 'agent') {
                        agentEnabled = value === 'on';
                        popup.querySelectorAll('.tool-chain-option[data-tool="agent"]').forEach(function(o) { o.classList.toggle('active', o === op); });
                        saveSettingsToLocal();
                    }
                    if (tool === 'compressExec') {
                        compressOldExecutions = value === 'on';
                        popup.querySelectorAll('.tool-chain-option[data-tool="compressExec"]').forEach(function(o) { o.classList.toggle('active', o === op); });
                        if (window.CommandExecutionPlugin) window.CommandExecutionPlugin.setCompressOldExecutions(compressOldExecutions);
                        saveSettingsToLocal();
                    }
                });
            });
            var closeHandler = function(e) { if (!popup.contains(e.target) && e.target !== triggerBtn) { popup.classList.remove('active'); setTimeout(function() { popup.remove(); currentPopup = null; }, 200); document.removeEventListener('click', closeHandler); } };
            setTimeout(function() { document.addEventListener('click', closeHandler); }, 10);
            // Work directory handlers
            var workDirInput = popup.querySelector('#workDirPopupInput');
            var workDirResetBtn = popup.querySelector('#workDirResetBtn');
            if (workDirInput) {
                workDirInput.addEventListener('change', function() {
                    if (window.CommandExecutionPlugin) {
                        window.CommandExecutionPlugin.workingDirectory = this.value;
                        window.CommandExecutionPlugin.saveSettings();
                    }
                });
            }
            if (workDirResetBtn) {
                workDirResetBtn.addEventListener('click', function() {
                    var defDir = defaultWorkDir || 'cwd';
                    if (workDirInput) workDirInput.value = defDir;
                    if (window.CommandExecutionPlugin) {
                        window.CommandExecutionPlugin.workingDirectory = defDir;
                        window.CommandExecutionPlugin.saveSettings();
                    }
                });
            }
            currentPopup = popup;
        }
        initDeepThinkBtn.addEventListener('click', function(e) { e.stopPropagation(); createDeepThinkPopup(initDeepThinkBtn); });
        chatDeepThinkBtn.addEventListener('click', function(e) { e.stopPropagation(); createDeepThinkPopup(chatDeepThinkBtn); });
    });

    loadSettings();
    var langText = document.getElementById('langSwitchText');
    if (langText) {
        langText.addEventListener('click', function() {
            var cur = window.__i18n && window.__i18n.getLang() || 'zh';
            window.__i18n && window.__i18n.setLang(cur === 'zh' ? 'en' : 'zh');
        });
        langText.textContent = (window.__i18n && window.__i18n.getLang()) === 'zh' ? '中文' : 'English';
    }
    window.addEventListener('langchange', function(e) {
        if (langText) langText.textContent = e.detail.lang === 'zh' ? '中文' : 'English';
        if (document.querySelector('.settings-panel.active')) switchSettingsTab(settingsLastTab);
        if (document.querySelector('.deep-think-popup-inner')) { var p = document.querySelector('.deep-think-popup'); if (p) { p.remove(); currentPopup = null; } }
    });
    if (window.CommandExecutionPlugin) {
        window.CommandExecutionPlugin.setEnabled(commandExecEnabled);
        window.CommandExecutionPlugin.setConfirmBeforeExecution(commandConfirmEnabled);
        window.CommandExecutionPlugin.setCompressOldExecutions(compressOldExecutions);
    }
    if (window.MemoryPlugin) {
        window.MemoryPlugin.setEnabled(memoryEnabled);
    }
    refreshMemories();

    (async function loadVersion() {
        try { var r = await fetch('/com/ver.json'); if (r.ok) { var d = await r.json(); var ve = document.getElementById('versionDisplay'); if (ve) ve.textContent = '版本 ' + (d.stage || '') + ' ' + (d.ver || '') + ' · Fold.AI'; } } catch (e) {}
    })();

    (async function() {
        // 检查服务端嵌入的对话数据（/chat/{token} 时）
        // 嵌入数据只用于防闪（提前隐藏开幕 + 标出当前 token），
        // 数据加载仍然走 loadChatsFromBackend 保证完整
        var embeddedToken = null;
        if (window.__CHAT_DATA__ && window.__CHAT_TOKEN__) {
            embeddedToken = window.__CHAT_TOKEN__;
        }
        delete window.__CHAT_DATA__;
        delete window.__CHAT_TOKEN__;
        await loadProviders();
        await loadConfigFromBackend();
        await loadConfigPrompts();
        await loadChatsFromBackend(embeddedToken);
        loadUsageStats();
        updateModelButtonLabels();
        updateHistoryList();
        addDirectChatButton();
        if (currentProvider) { await loadModels(currentProvider); }
    })();
})();
