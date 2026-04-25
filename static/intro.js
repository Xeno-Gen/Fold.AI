(function() {
    const $ = id => {
        const el = document.getElementById(id);
        if (!el) console.warn('⚠️ 未找到元素:', id);
        return el;
    };

    const chatArea = $('chatArea'),
        bottomInput = $('bottomInputContainer');
    const chatAreaInner = $('chatAreaInner');
    const initText = $('initialTextarea'),
        chatText = $('chatTextarea');
    const initSend = $('initialSendBtn'),
        chatSend = $('chatSendBtn');
    const initChar = $('initialCharCount'),
        chatChar = $('chatCharCount');
    const initPreview = $('initialImagePreview'),
        chatPreview = $('chatImagePreview');
    const chatHeader = $('chatHeader'),
        centerInit = $('centerInitial');
    const chatTitleText = $('chatTitleText'),
        chatTitleInput = $('chatTitleInput');
    const emptyHint = $('emptyHint'),
        historyList = $('chatHistoryList');
    const settingsBtn = $('settingsBtn'),
        initialSettingsBtn = $('initialSettingsBtn');
    const drawerOverlay = $('drawerOverlay'),
        drawerBody = $('drawerBody'),
        drawerClose = $('drawerClose');
    const fileInput = $('hiddenFileInput'),
        toast = $('toast');
    const initModelBtn = $('initialModelBtn'),
        chatModelBtn = $('chatModelBtn');
    const initModelLabel = $('initialModelLabel'),
        chatModelLabel = $('chatModelLabel');
    const sidebarLeft = $('sidebarLeft'),
        sidebarToggle = $('sidebarToggle');
    const newChatIcon = $('newChatIcon'),
        newChatSidebarBtn = $('newChatSidebarBtn'),
        sidebarLogo = $('sidebarLogo');
    const historyIcon = $('historyIcon');
    const initialAttachBtn = $('initialAttachBtn'),
        chatAttachBtn = $('chatAttachBtn');

    let isChatActive = false;
    let chats = [[]],
        chatTitles = ['当前对话'],
        currentChat = 0;
    let activeImages = { initial: [], chat: [] };
    let streaming = false;
    let currentProvider = null;
    let currentModel = 'deepseek-v4-flash';
    let currentParams = {
        temperature: 0.7,
        top_p: 1.0,
        max_tokens: 2048,
        seed: null,
        frequency_penalty: 0,
        presence_penalty: 0,
        top_k: null,
        systemPrompt: ''
    };
    let customPort = 8080;
    let providers = [];
    let availableModels = [],
        allModels = [];
    const pinnedChats = new Set();

    // ==================== 工具函数 ====================
    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    function updateSendBtn() {
        const ta = isChatActive ? chatText : initText;
        const imgs = isChatActive ? activeImages.chat : activeImages.initial;
        const btn = isChatActive ? chatSend : initSend;
        if (!btn) return;
        btn.disabled = (!ta.value.trim() && !imgs.length) || streaming;
    }

    function renderPreviews(container, images) {
        if (!container) return;
        container.innerHTML = '';
        images.forEach((src, i) => {
            const d = document.createElement('div');
            d.className = 'image-preview-item';
            d.style.backgroundImage = `url(${src})`;
            const r = document.createElement('span');
            r.className = 'remove-preview';
            r.textContent = '×';
            r.onclick = e => {
                e.stopPropagation();
                images.splice(i, 1);
                renderPreviews(container, images);
                updateSendBtn();
            };
            d.appendChild(r);
            container.appendChild(d);
        });
    }

    let fileTarget = { textarea: initText, preview: initPreview };
    fileInput.onchange = e => {
        const files = e.target.files;
        if (!files.length) return;
        const arr = fileTarget.textarea === initText ? activeImages.initial : activeImages.chat;
        Array.from(files).forEach(f => {
            if (!f.type.startsWith('image/')) return;
            const r = new FileReader();
            r.onload = ev => {
                arr.push(ev.target.result);
                renderPreviews(fileTarget.preview, arr);
                updateSendBtn();
            };
            r.readAsDataURL(f);
        });
        fileInput.value = '';
    };
    initialAttachBtn.onclick = () => {
        fileTarget = { textarea: initText, preview: initPreview };
        fileInput.click();
    };
    chatAttachBtn.onclick = () => {
        fileTarget = { textarea: chatText, preview: chatPreview };
        fileInput.click();
    };
    initText.oninput = () => {
        initChar.textContent = initText.value.length + '/8000';
        updateSendBtn();
    };
    chatText.oninput = () => {
        chatChar.textContent = chatText.value.length + '/8000';
        updateSendBtn();
    };

    // ==================== 模型选择悬浮卡片 ====================
    let dropdownInstance = null;
    function createDropdown() {
        const div = document.createElement('div');
        div.className = 'model-picker-dropdown';
        div.style.position = 'fixed';
        div.style.zIndex = '999';
        div.style.display = 'none';
        document.body.appendChild(div);
        return div;
    }
    dropdownInstance = createDropdown();

    function positionDropdown(btn) {
        if (!btn || !dropdownInstance) return;
        const rect = btn.getBoundingClientRect();
        dropdownInstance.style.left = rect.left + 'px';
        dropdownInstance.style.top = rect.top - dropdownInstance.offsetHeight - 8 + 'px';
    }

    function openModelPicker(btn) {
        if (!dropdownInstance || !btn) return;
        if (dropdownInstance.style.display === 'flex' && dropdownInstance.dataset.btn === btn.id) {
            closeModelPicker();
            return;
        }
        closeModelPicker();
        dropdownInstance.style.display = 'flex';
        dropdownInstance.dataset.btn = btn.id;
        renderModelListInDropdown();
        positionDropdown(btn);
        document.addEventListener('click', outsideClickHandler);
    }

    function closeModelPicker() {
        if (dropdownInstance) {
            dropdownInstance.style.display = 'none';
            dropdownInstance.dataset.btn = '';
        }
        document.removeEventListener('click', outsideClickHandler);
    }

    function outsideClickHandler(e) {
        if (!dropdownInstance || dropdownInstance.style.display !== 'flex') return;
        if (!e.target.closest('.model-select-btn') && !e.target.closest('.model-picker-dropdown')) closeModelPicker();
    }

    function renderModelListInDropdown() {
        if (!dropdownInstance) return;
        let html =
            '<div class="model-search"><input type="text" class="model-search-input" placeholder="搜索模型..."></div><div class="model-list">';
        allModels.forEach(m => {
            html +=
                `<div class="model-picker-item${m === currentModel ? ' active' : ''}" data-model="${m}">
                <div class="model-icon">${currentProvider && providers.find(p => p.id === currentProvider)?.icon ? `<img src="${providers.find(p => p.id === currentProvider).icon}">` : '🤖'}</div>
                <div class="model-info"><div class="model-name">${m}</div><div class="model-desc">高性能对话模型</div></div>
                <div class="model-check">✓</div>
            </div>`;
        });
        if (!allModels.length) html += '<div style="padding:20px;text-align:center;color:#999;">暂无可用模型</div>';
        html += '</div>';
        dropdownInstance.innerHTML = html;
        const searchInput = dropdownInstance.querySelector('.model-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const kw = this.value.toLowerCase();
                dropdownInstance.querySelectorAll('.model-picker-item').forEach(item =>
                    (item.style.display = item.dataset.model.toLowerCase().includes(kw) ? 'flex' : 'none')
                );
            });
            setTimeout(() => searchInput.focus(), 0);
        }
        dropdownInstance.querySelectorAll('.model-picker-item').forEach(item => {
            item.onclick = () => {
                currentModel = item.dataset.model;
                updateModelButtonLabels();
                closeModelPicker();
                saveConfigToBackend();
            };
        });
    }

    function updateModelButtonLabels() {
        if (initModelLabel) initModelLabel.textContent = currentModel || '选择模型';
        if (chatModelLabel) chatModelLabel.textContent = currentModel || '选择模型';
    }

    initModelBtn.addEventListener('click', e => {
        e.stopPropagation();
        openModelPicker(initModelBtn);
    });
    chatModelBtn.addEventListener('click', e => {
        e.stopPropagation();
        openModelPicker(chatModelBtn);
    });
    window.addEventListener('resize', () => {
        if (dropdownInstance && dropdownInstance.style.display === 'flex') {
            const btnId = dropdownInstance.dataset.btn;
            if (btnId) positionDropdown(document.getElementById(btnId));
        }
    });

    // ==================== 后端同步 ====================
    async function saveConfigToBackend() {
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    defaultParams: currentParams,
                    currentProvider,
                    currentModel,
                    customPort,
                    systemPrompt: currentParams.systemPrompt
                })
            });
        } catch (e) {}
    }

    async function loadConfigFromBackend() {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();
            if (data.defaultParams) currentParams = { ...currentParams, ...data.defaultParams };
            if (data.currentProvider) currentProvider = data.currentProvider;
            else if (providers.length && !currentProvider) currentProvider = providers[0].id;
            if (data.currentModel) currentModel = data.currentModel;
            if (data.customPort !== undefined) customPort = data.customPort;
            if (data.systemPrompt !== undefined) currentParams.systemPrompt = data.systemPrompt;
            updateModelButtonLabels();
        } catch (e) {}
    }

    // ==================== 聊天历史同步 ====================
    async function saveChatToBackend() {
        try {
            await fetch(`/api/chat/${currentChat}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: chatTitles[currentChat], messages: chats[currentChat] })
            });
        } catch (e) {}
    }

    async function loadChatsFromBackend() {
        try {
            const res = await fetch('/api/chats');
            if (!res.ok) return;
            const remote = await res.json();
            if (remote.length) {
                const nc = [],
                    nt = [];
                for (const c of remote) {
                    const detailRes = await fetch(`/api/chat/${c.id}`);
                    const detail = await detailRes.json();
                    nc.push(detail.messages || []);
                    nt.push(detail.title || c.title);
                }
                chats = nc;
                chatTitles = nt;
                currentChat = chats.length - 1;
                switchChat(currentChat);
            }
        } catch (e) {}
        updateHistoryList();
    }

    // ==================== 提供商与模型加载 ====================
    async function loadProviders() {
        try {
            const res = await fetch('/api/providers');
            providers = (await res.json()).providers || [];
            if (providers.length && !currentProvider) {
                currentProvider = providers[0].id;
            }
            if (currentProvider) await loadModels(currentProvider);
        } catch (e) {}
    }

    async function loadModels(providerId) {
        try {
            const res = await fetch(`/api/provider/${providerId}/models`);
            if (!res.ok) throw new Error('获取模型列表失败');
            availableModels = (await res.json()).models || [];
            allModels = [...availableModels];
            if (availableModels.length && (!currentModel || !availableModels.includes(currentModel))) {
                currentModel = availableModels[0];
                updateModelButtonLabels();
            }
        } catch (e) {
            showToast('无法加载模型列表，请检查 API Key');
        }
    }

    // ==================== 多密钥管理 API ====================
    async function loadProviderKeys(providerId) {
        try {
            const res = await fetch(`/api/provider/${providerId}/keys`);
            if (!res.ok) return [];
            return (await res.json()).keys || [];
        } catch (e) { return []; }
    }
    async function addProviderKey(providerId, key) {
        try {
            const res = await fetch(`/api/provider/${providerId}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });
            return res.ok;
        } catch (e) { return false; }
    }
    async function deleteProviderKey(providerId, index) {
        try {
            const res = await fetch(`/api/provider/${providerId}/key/${index}`, { method: 'DELETE' });
            return res.ok;
        } catch (e) { return false; }
    }
    async function useProviderKey(providerId, index) {
        try {
            const res = await fetch(`/api/provider/${providerId}/keys/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index })
            });
            return res.ok;
        } catch (e) { return false; }
    }

    // ==================== 设置抽屉 ====================
    function openDrawer() {
        loadConfigFromBackend().then(() => renderDrawer());
        drawerOverlay.classList.add('active');
    }
    function closeDrawer() {
        drawerOverlay.classList.remove('active');
    }
    settingsBtn.onclick = openDrawer;
    initialSettingsBtn.onclick = openDrawer;
    drawerClose.onclick = closeDrawer;
    drawerOverlay.onclick = e => { if (e.target === drawerOverlay) closeDrawer(); };

    async function renderDrawer() {
        if (!drawerBody) return;
        let html = '<div class="section-title">模型提供商</div><div class="provider-grid">';
        providers.forEach(p => {
            html += `<div class="provider-card${currentProvider === p.id ? ' active' : ''}" data-id="${p.id}">
                <div class="prov-icon">${p.icon ? `<img src="${p.icon}">` : p.name.charAt(0)}</div>
                <div class="provider-name">${p.name}</div>
            </div>`;
        });
        html += '</div><div class="section-title" style="margin-top:10px;">API 密钥</div>';
        html += '<div class="key-input-row"><input type="password" id="newKeyInput" placeholder="输入新的 API Key..."><button id="addKeyBtn">添加</button></div>';
        html += '<div class="key-list" id="keyListContainer"></div>';
        html += '<div class="section-title" style="margin-top:20px;">系统提示词</div>';
        html += `<div class="system-prompt-section"><textarea id="systemPromptInput" rows="3" placeholder="定义 AI 的行为、角色或风格...">${currentParams.systemPrompt || ''}</textarea></div>`;
        html += '<div class="section-title" style="margin-top:20px;">参数调节</div><div class="param-group">';
        const paramsDef = [
            { key: 'temperature', label: '温度', min: 0, max: 2, step: 0.1 },
            { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05 },
            { key: 'max_tokens', label: '最大长度', min: 1, max: 8192, step: 1 },
            { key: 'frequency_penalty', label: '频率惩罚', min: -2, max: 2, step: 0.1 },
            { key: 'presence_penalty', label: '存在惩罚', min: -2, max: 2, step: 0.1 }
        ];
        paramsDef.forEach(p => {
            const val = currentParams[p.key] ?? 0;
            html += `<div class="param-item"><label>${p.label}</label><input type="number" id="param-${p.key}" value="${val}" min="${p.min}" max="${p.max}" step="${p.step}"></div>`;
        });
        html += `<div class="param-item"><label>种子</label><input type="number" id="param-seed" placeholder="留空" value="${currentParams.seed || ''}"></div>`;
        html += `<div class="param-item"><label>Top K</label><input type="number" id="param-topk" placeholder="留空" value="${currentParams.top_k || ''}"></div>`;
        html += `<div class="param-item"><label>自定义端口</label><input type="number" id="customPortInput" value="${customPort}" min="1" max="65535"></div>`;
        html += '</div>';
        drawerBody.innerHTML = html;

        drawerBody.querySelectorAll('.provider-card').forEach(card => {
            card.onclick = async () => {
                drawerBody.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                currentProvider = card.dataset.id;
                await loadModels(currentProvider);
                saveConfigToBackend();
                await refreshKeyList();
            };
        });
        $('addKeyBtn').onclick = async () => {
            const inp = $('newKeyInput');
            if (!inp || !inp.value.trim()) { showToast('请输入密钥'); return; }
            if (!currentProvider) { showToast('请先选择提供商'); return; }
            if (await addProviderKey(currentProvider, inp.value.trim())) {
                showToast('密钥已添加');
                inp.value = '';
                await refreshKeyList();
                await loadModels(currentProvider);
            } else showToast('添加失败');
        };

        const sysPromptEl = document.getElementById('systemPromptInput');
        if (sysPromptEl) {
            sysPromptEl.addEventListener('change', function() {
                currentParams.systemPrompt = this.value;
                saveConfigToBackend();
            });
        }

        paramsDef.forEach(p => {
            const input = document.getElementById(`param-${p.key}`);
            if (input) {
                input.addEventListener('change', function() {
                    currentParams[p.key] = parseFloat(this.value) || 0;
                    saveConfigToBackend();
                });
            }
        });
        ['seed', 'topk'].forEach(k => {
            const el = document.getElementById(`param-${k}`);
            if (el) el.addEventListener('change', function() {
                const val = this.value ? parseInt(this.value) : null;
                if (k === 'seed') currentParams.seed = val;
                else currentParams.top_k = val;
                saveConfigToBackend();
            });
        });
        const customPortInput = document.getElementById('customPortInput');
        if (customPortInput) {
            customPortInput.addEventListener('change', function() {
                customPort = this.value ? parseInt(this.value) : 8080;
                saveConfigToBackend();
            });
        }

        await refreshKeyList();
    }

    async function refreshKeyList() {
        const container = $('keyListContainer');
        if (!container || !currentProvider) return;
        const keys = await loadProviderKeys(currentProvider);
        container.innerHTML = '';
        keys.forEach((mask, idx) => {
            const row = document.createElement('div');
            row.className = 'key-row';
            row.innerHTML = `<span class="key-mask">${mask}</span><input class="key-edit-input" value="" style="display:none;">
            <div class="key-actions">
                <button title="使用"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
                <button title="修改"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button title="删除"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 12 2v2"/></svg></button>
            </div>`;
            const editInput = row.querySelector('.key-edit-input');
            row.querySelector('[title="使用"]').onclick = async () => {
                if (await useProviderKey(currentProvider, idx)) {
                    showToast('已切换密钥');
                    await loadModels(currentProvider);
                    await refreshKeyList();
                }
            };
            row.querySelector('[title="修改"]').onclick = () => {
                row.classList.add('edit');
                editInput.value = '';
                editInput.focus();
                const confirmEdit = async () => {
                    const newKey = editInput.value.trim();
                    if (newKey) {
                        if ((await deleteProviderKey(currentProvider, idx)) && (await addProviderKey(currentProvider, newKey))) {
                            showToast('密钥已更新');
                            await refreshKeyList();
                        }
                    }
                    row.classList.remove('edit');
                };
                editInput.onkeydown = e => { if (e.key === 'Enter') confirmEdit(); };
                editInput.onblur = () => { setTimeout(() => { if (row.classList.contains('edit')) confirmEdit(); }, 100); };
            };
            row.querySelector('[title="删除"]').onclick = async () => {
                if (confirm('确认删除？')) {
                    if (await deleteProviderKey(currentProvider, idx)) {
                        showToast('已删除');
                        await refreshKeyList();
                    }
                }
            };
            container.appendChild(row);
        });
    }

    // ==================== Markdown 渲染 ====================
    function renderMarkdown(text) {
        if (typeof marked === 'undefined') return text.replace(/\n/g, '<br>');
        return marked.parse(text, { breaks: true });
    }

    // ==================== 深度思考块 ====================
    function createThinkBlock(reasoning) {
        return `<div class="think-block">
            <div class="think-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <div class="think-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.00192 6.64454C8.75026 6.64454 9.35732 7.25169 9.35739 8.00001C9.35739 8.74838 8.7503 9.35548 8.00192 9.35548C7.25367 9.35533 6.64743 8.74829 6.64743 8.00001C6.6475 7.25178 7.25371 6.64468 8.00192 6.64454Z" fill="currentColor"></path>
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M9.97165 1.29981C11.5853 0.718916 13.271 0.642197 14.3144 1.68555C15.3577 2.72902 15.2811 4.41466 14.7002 6.02833C14.4707 6.66561 14.1504 7.32937 13.75 8.00001C14.1504 8.67062 14.4707 9.33444 14.7002 9.97169C15.2811 11.5854 15.3578 13.271 14.3144 14.3145C13.271 15.3579 11.5854 15.2811 9.97165 14.7002C9.3344 14.4708 8.67059 14.1505 7.99997 13.75C7.32933 14.1505 6.66558 14.4708 6.02829 14.7002C4.41461 15.2811 2.72899 15.3578 1.68552 14.3145C0.642155 13.271 0.71887 11.5854 1.29977 9.97169C1.52915 9.33454 1.84865 8.67049 2.24899 8.00001C1.84866 7.32953 1.52915 6.66544 1.29977 6.02833C0.718852 4.41459 0.64207 2.729 1.68552 1.68555C2.72897 0.642112 4.41456 0.718887 6.02829 1.29981C6.66541 1.52918 7.32949 1.8487 7.99997 2.24903C8.67045 1.84869 9.33451 1.52919 9.97165 1.29981ZM12.9404 9.2129C12.4391 9.893 11.8616 10.5681 11.2148 11.2149C10.568 11.8616 9.89296 12.4391 9.21286 12.9404C9.62532 13.1579 10.0271 13.338 10.4121 13.4766C11.9146 14.0174 12.9172 13.8738 13.3955 13.3955C13.8737 12.9173 14.0174 11.9146 13.4765 10.4121C13.3379 10.0271 13.1578 9.62535 12.9404 9.2129ZM3.05856 9.2129C2.84121 9.62523 2.66197 10.0272 2.52341 10.4121C1.98252 11.9146 2.12627 12.9172 2.60446 13.3955C3.08278 13.8737 4.08544 14.0174 5.58786 13.4766C5.97264 13.338 6.37389 13.1577 6.7861 12.9404C6.10624 12.4393 5.43168 11.8614 4.78513 11.2149C4.13823 10.5679 3.55992 9.89313 3.05856 9.2129ZM7.99899 3.792C7.23179 4.31419 6.45306 4.95512 5.70407 5.70411C4.95509 6.45309 4.31415 7.23184 3.79196 7.99903C4.3143 8.76666 4.95471 9.54653 5.70407 10.2959C6.45309 11.0449 7.23271 11.6848 7.99997 12.207C8.76725 11.6848 9.54683 11.0449 10.2959 10.2959C11.0449 9.54686 11.6848 8.76729 12.207 8.00001C11.6848 7.23275 11.0449 6.45312 10.2959 5.70411C9.5465 4.95475 8.76662 4.31434 7.99899 3.792ZM5.58786 2.52344C4.08533 1.98255 3.08272 2.12625 2.60446 2.6045C2.12621 3.08275 1.98252 4.08536 2.52341 5.5879C2.66189 5.97253 2.8414 6.37409 3.05856 6.78614C3.55983 6.10611 4.1384 5.43189 4.78513 4.78516C5.43186 4.13843 6.10606 3.55987 6.7861 3.0586C6.37405 2.84144 5.97249 2.66192 5.58786 2.52344ZM13.3955 2.6045C12.9172 2.12631 11.9146 1.98257 10.4121 2.52344C10.0272 2.66201 9.62519 2.84125 9.21286 3.0586C9.8931 3.55996 10.5679 4.13827 11.2148 4.78516C11.8614 5.43172 12.4392 6.10627 12.9404 6.78614C13.1577 6.37393 13.338 5.97267 13.4765 5.5879C14.0174 4.08549 13.8736 3.08281 13.3955 2.6045Z" fill="currentColor"></path>
                    </svg>
                </div>
                <span>已深度思考</span>
                <div class="think-arrow">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor"></path>
                    </svg>
                </div>
            </div>
            <div class="think-body-wrapper">
                <div class="think-line"></div>
                <div class="think-content">${reasoning.replace(/\n/g, '<br>')}</div>
            </div>
        </div>`;
    }

   function createMessageBubble(content, role, images = [], reasoning = null, msgRef = null) {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble message-' + (role === 'user' ? 'user' : 'ai');
    let reasoningHtml = '';
    if (reasoning) {
        reasoningHtml = createThinkBlock(reasoning);
    }
    let contentHtml = role === 'ai' ? renderMarkdown(content) : content.replace(/\n/g, '<br>');
    bubble.innerHTML = reasoningHtml + `<div class="markdown-body">${contentHtml}</div>`;
    if (images.length) {
        const c = document.createElement('div');
        images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.marginTop = '8px';
            c.appendChild(img);
        });
        bubble.appendChild(c);
    }
    
    // 添加工具栏
    function addActionsToBubble(bubbleEl, contentText, roleType, msgReference) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        if (roleType === 'user') {
            actionsDiv.innerHTML = `<button class="action-icon" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 12-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button class="action-icon" data-action="edit" title="修改"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="action-icon" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 12 2v2"/></svg></button>`;
        } else {
            actionsDiv.innerHTML = `<button class="action-icon" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 12-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button class="action-icon" data-action="regenerate" title="重新生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
            <button class="action-icon" data-action="edit" title="修改"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="action-icon" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 12 2v2"/></svg></button>`;
        }
        bubbleEl.appendChild(actionsDiv);
        
        // 绑定事件
        actionsDiv.querySelector('[data-action="copy"]').onclick = () =>
            navigator.clipboard.writeText(contentText).then(() => showToast('已复制'));
        actionsDiv.querySelector('[data-action="delete"]').onclick = () => {
            if (msgReference) {
                const idx = chats[currentChat].indexOf(msgReference);
                if (idx !== -1) chats[currentChat].splice(idx, 1);
            }
            bubbleEl.remove();
            saveChatToBackend();
        };
        
        if (roleType === 'user') {
            actionsDiv.querySelector('[data-action="edit"]').onclick = () => {
                const originalText = contentText;
                const textarea = document.createElement('textarea');
                textarea.value = originalText;
                textarea.setAttribute('rows', '3');
                textarea.style.cssText = 'width:100%; min-height:80px; border:1px solid #ccc; border-radius:12px; padding:12px; font-size:15px; font-family:inherit; line-height:1.55; resize:vertical; background:#fff; box-sizing:border-box; margin:0;';
                
                // 保存原始内容
                const originalInnerHTML = bubbleEl.innerHTML;
                const originalStyleWidth = bubbleEl.style.width;
                const originalStyleMaxWidth = bubbleEl.style.maxWidth;
                const originalStyleBg = bubbleEl.style.backgroundColor;
                const originalStyleBorderRadius = bubbleEl.style.borderRadius;
                
                bubbleEl.innerHTML = '';
                bubbleEl.style.maxWidth = '100%';
                bubbleEl.style.width = '100%';
                bubbleEl.style.backgroundColor = 'var(--bubble-user)';
                bubbleEl.style.borderRadius = '18px 18px 6px 18px';
                bubbleEl.appendChild(textarea);
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                
                const saveEdit = () => {
                    const newContent = textarea.value.trim();
                    if (newContent && newContent !== originalText) {
                        // 恢复样式
                        bubbleEl.style.maxWidth = originalStyleMaxWidth || '';
                        bubbleEl.style.width = originalStyleWidth || '';
                        bubbleEl.style.backgroundColor = originalStyleBg || '';
                        bubbleEl.style.borderRadius = originalStyleBorderRadius || '';
                        bubbleEl.innerHTML = `<div class="markdown-body">${newContent.replace(/\n/g, '<br>')}</div>`;
                        if (msgReference) msgReference.content = newContent;
                        saveChatToBackend();
                        // 重新添加工具栏
                        addActionsToBubble(bubbleEl, newContent, 'user', msgReference);
                    } else if (!newContent) {
                        bubbleEl.remove();
                        if (msgReference) {
                            const idx = chats[currentChat].indexOf(msgReference);
                            if (idx !== -1) {
                                chats[currentChat].splice(idx, 1);
                                saveChatToBackend();
                            }
                        }
                    } else {
                        // 内容未变，恢复原样
                        bubbleEl.style.maxWidth = originalStyleMaxWidth || '';
                        bubbleEl.style.width = originalStyleWidth || '';
                        bubbleEl.style.backgroundColor = originalStyleBg || '';
                        bubbleEl.style.borderRadius = originalStyleBorderRadius || '';
                        bubbleEl.innerHTML = originalInnerHTML;
                        // 重新添加工具栏（因为 innerHTML 被覆盖了）
                        addActionsToBubble(bubbleEl, originalText, 'user', msgReference);
                    }
                };
                
                textarea.onblur = () => setTimeout(saveEdit, 200);
                textarea.onkeydown = (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit();
                    }
                    if (e.key === 'Escape') {
                        bubbleEl.style.maxWidth = originalStyleMaxWidth || '';
                        bubbleEl.style.width = originalStyleWidth || '';
                        bubbleEl.style.backgroundColor = originalStyleBg || '';
                        bubbleEl.style.borderRadius = originalStyleBorderRadius || '';
                        bubbleEl.innerHTML = originalInnerHTML;
                        addActionsToBubble(bubbleEl, originalText, 'user', msgReference);
                    }
                };
            };
        } else {
            actionsDiv.querySelector('[data-action="regenerate"]').onclick = () => {
                if (msgReference) {
                    const idx = chats[currentChat].indexOf(msgReference);
                    if (idx !== -1) chats[currentChat].splice(idx, 1);
                }
                bubbleEl.remove();
                sendMessage(true);
            };
            actionsDiv.querySelector('[data-action="edit"]').onclick = () => {
                const contentDiv = bubbleEl.querySelector('.markdown-body');
                const originalText = contentText;
                contentDiv.innerHTML = `<textarea style="width:100%; min-height:80px; border:1px solid #ccc; border-radius:8px; padding:8px; font-size:15px; font-family:inherit; line-height:1.55; box-sizing:border-box;">${originalText}</textarea>`;
                const textarea = contentDiv.querySelector('textarea');
                textarea.focus();
                const saveEdit = () => {
                    const newContent = textarea.value;
                    contentDiv.innerHTML = renderMarkdown(newContent);
                    if (msgReference) msgReference.content = newContent;
                    saveChatToBackend();
                };
                textarea.onblur = saveEdit;
                textarea.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } };
            };
        }
    }
    
    addActionsToBubble(bubble, content, role, msgRef);
    return bubble;
}

    function addMessage(content, role, images = [], reasoning = null, msgRef = null) {
        if (!chatAreaInner) return null;
        const bubble = createMessageBubble(content, role, images, reasoning, msgRef);
        chatAreaInner.appendChild(bubble);
        if (emptyHint) emptyHint.style.display = 'none';
        chatArea.scrollTop = chatArea.scrollHeight;
        return bubble;
    }

    // ==================== 流式 API ====================
    async function callAPI(messages) {
        if (!currentModel) throw new Error('未选择模型');
        const payload = {
            messages,
            provider: currentProvider,
            model: currentModel,
            ...currentParams,
            stream: true
        };
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }
        return res.body;
    }

    // ==================== 发送消息 ====================
    async function sendMessage(isRegenerate = false) {
        if (streaming) return;
        if (!currentModel) {
            showToast('请先选择模型');
            return;
        }
        const ta = isChatActive ? chatText : initText;
        const imgs = isChatActive ? activeImages.chat : activeImages.initial;
        const content = ta.value.trim();
        if (!isRegenerate && !content && !imgs.length) return;

        if (!isChatActive) {
            await newChat();
        }

        if (!isRegenerate) {
            const userMsg = { role: 'user', content, images: imgs };
            chats[currentChat].push(userMsg);
            addMessage(content || '图片', 'user', imgs, null, userMsg);            ta.value = '';
            if (isChatActive) {
                activeImages.chat = [];
                renderPreviews(chatPreview, []);
            } else {
                activeImages.initial = [];
                renderPreviews(initPreview, []);
            }
            updateSendBtn();
        }

        streaming = true;
        updateSendBtn();
        const bubble = addMessage('思考中...', 'ai', [], null, null);
        try {
            const msgs = chats[currentChat]
                .filter(m => m.role)
                .map(m => ({ role: m.role, content: m.content }));

            const stream = await callAPI(msgs);
            bubble.innerHTML = '';
            const reasoningDiv = document.createElement('div');
            const contentDiv = document.createElement('div');
            contentDiv.className = 'markdown-body';
            bubble.appendChild(reasoningDiv);
            bubble.appendChild(contentDiv);

            let fullContent = '';
            let fullReasoning = '';
            const decoder = new TextDecoder();
            const reader = stream.getReader();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') continue;
                        try {
                            const json = JSON.parse(data);
                            const delta = json.choices?.[0]?.delta;
                            if (delta) {
                                if (delta.reasoning_content) {
                                    fullReasoning += delta.reasoning_content;
                                    reasoningDiv.innerHTML = createThinkBlock(fullReasoning);
                                }
                                if (delta.content) {
                                    fullContent += delta.content;
                                    contentDiv.innerHTML = renderMarkdown(fullContent);
                                }
                            }
                        } catch (e) {}
                    }
                }
                chatArea.scrollTop = chatArea.scrollHeight;
            }
            const assistantMsg = { role: 'assistant', content: fullContent, reasoning: fullReasoning || null };
            chats[currentChat].push(assistantMsg);
            const newBubble = createMessageBubble(fullContent, 'ai', [], fullReasoning, assistantMsg);
            bubble.replaceWith(newBubble);
            updateHistoryTitle();
            saveChatToBackend();
        } catch (e) {
            bubble.innerHTML = '请求失败: ' + e.message;
            console.error(e);
        }
        streaming = false;
        updateSendBtn();
    }

    initSend.onclick = () => sendMessage(false);
    chatSend.onclick = () => sendMessage(false);
    initText.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(false);
        }
    };
    chatText.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(false);
        }
    };

    sidebarToggle.onclick = () => {
        if (!sidebarLeft.classList.contains('visible')) {
            // 完全隐藏 → 显示窄图标栏
            sidebarLeft.classList.add('visible');
            sidebarLeft.classList.remove('expanded');
        } else if (sidebarLeft.classList.contains('visible') && !sidebarLeft.classList.contains('expanded')) {
            // 窄图标栏 → 展开完整侧边栏
            sidebarLeft.classList.add('expanded');
        } else if (sidebarLeft.classList.contains('expanded')) {
            // 展开状态 → 收回到窄图标栏
            sidebarLeft.classList.remove('expanded');
        }
    };

    // ==================== 界面管理 ====================
    function activateChat() {
        isChatActive = true;
        document.body.classList.add('chat-active');
        if (centerInit) centerInit.style.display = 'none';
        if (bottomInput) {
            bottomInput.style.opacity = '1';
            bottomInput.style.pointerEvents = 'all';
            bottomInput.style.maxHeight = '300px';
        }
        if (chatArea) {
            chatArea.style.opacity = '1';
            chatArea.style.pointerEvents = 'all';
            chatArea.style.maxHeight = 'none';
            chatArea.style.flex = '1 1 auto';
        }
        if (sidebarLeft && window.innerWidth > 768) sidebarLeft.classList.add('visible');
        updateHeaderTitle();
    }

    function switchChat(idx) {
        if (idx === currentChat && isChatActive) return;
        currentChat = idx;
        if (chatAreaInner) chatAreaInner.innerHTML = '';
        if (!chats[idx] || !chats[idx].length) {
            if (emptyHint) emptyHint.style.display = 'block';
        } else {
            if (emptyHint) emptyHint.style.display = 'none';
            chats[idx].forEach(m => {
                if (m.role)
                    addMessage(m.content, m.role === 'user' ? 'user' : 'ai', m.images || [], m.reasoning, m);
            });
        }
        updateHistoryList();
        updateHeaderTitle();
    }

    async function newChat() {
        let newId;
        try {
            const res = await fetch('/api/chats', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                newId = data.id;
            } else {
                newId = chats.length;
            }
        } catch (e) {
            newId = chats.length;
        }
        chats.push([]);
        chatTitles.push('新对话');
        currentChat = chats.length - 1;
        if (!isChatActive) activateChat();
        if (chatAreaInner) chatAreaInner.innerHTML = '';
        if (emptyHint) emptyHint.style.display = 'block';
        updateHistoryList();
        updateHeaderTitle();
    }

    function updateHistoryTitle() {
        const msgs = chats[currentChat]?.filter(m => m.role === 'user') || [];
        chatTitles[currentChat] = msgs.length ? (msgs[0].content || '图片').substring(0, 25) : '空对话';
        updateHeaderTitle();
        updateHistoryList();
    }

    function updateHeaderTitle() {
        if (chatTitleText) chatTitleText.textContent = chatTitles[currentChat] || '对话';
    }

    function updateHistoryList() {
        if (!historyList) return;
        let ordered = [];
        pinnedChats.forEach(id => {
            if (id < chatTitles.length) ordered.push(id);
        });
        for (let i = chatTitles.length - 1; i >= 0; i--) {
            if (!pinnedChats.has(i)) ordered.push(i);
        }
        historyList.innerHTML = ordered
            .map(idx => {
                const title = chatTitles[idx] || '未命名';
                const pinned = pinnedChats.has(idx);
                return `<li class="chat-history-item${idx === currentChat ? ' active' : ''}" data-index="${idx}">
                <span class="history-title">${title}</span>
                <div class="history-actions">
                    <button class="action-icon small" title="收藏置顶">${pinned ? '★' : '☆'}</button>
                    <button class="action-icon small" title="重命名">✎</button>
                    <button class="action-icon small" title="删除">✕</button>
                </div>
            </li>`;
            })
            .join('');
        historyList.querySelectorAll('li').forEach(li => {
            const idx = parseInt(li.dataset.index);
            li.onclick = e => {
                if (e.target.closest('button')) return;
                if (!isChatActive) activateChat();
                switchChat(idx);
            };
            const favBtn = li.querySelector('[title="收藏置顶"]');
            if (favBtn)
                favBtn.onclick = e => {
                    e.stopPropagation();
                    if (pinnedChats.has(idx)) pinnedChats.delete(idx);
                    else pinnedChats.add(idx);
                    updateHistoryList();
                };
            const renameBtn = li.querySelector('[title="重命名"]');
            if (renameBtn)
                renameBtn.onclick = e => {
                    e.stopPropagation();
                    const newTitle = prompt('修改标题', chatTitles[idx]);
                    if (newTitle) {
                        chatTitles[idx] = newTitle;
                        if (idx === currentChat) updateHeaderTitle();
                        updateHistoryList();
                        saveChatToBackend();
                    }
                };
            const delBtn = li.querySelector('[title="删除"]');
            if (delBtn)
                delBtn.onclick = async e => {
                    e.stopPropagation();
                    if (!confirm('确定删除此对话？')) return;
                    try { await fetch(`/api/chat/${idx}`, { method: 'DELETE' }); } catch (e) {}
                    chats.splice(idx, 1);
                    chatTitles.splice(idx, 1);
                    pinnedChats.delete(idx);
                    if (currentChat >= chats.length) currentChat = chats.length - 1;
                    if (currentChat < 0) {
                        currentChat = 0;
                        chats = [[]];
                        chatTitles = ['当前对话'];
                    }
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
        chatTitleInput.onkeydown = async ev => {
            if (ev.key === 'Enter') {
                const t = chatTitleInput.value.trim();
                if (t) {
                    chatTitles[currentChat] = t;
                    updateHeaderTitle();
                    updateHistoryList();
                    saveChatToBackend();
                }
                chatTitleInput.style.display = 'none';
                chatTitleText.style.display = 'inline';
            } else if (ev.key === 'Escape') {
                chatTitleInput.style.display = 'none';
                chatTitleText.style.display = 'inline';
            }
        };
        chatTitleInput.onblur = () => {
            setTimeout(() => {
                chatTitleInput.style.display = 'none';
                chatTitleText.style.display = 'inline';
            }, 100);
        };
    };

    function addDirectChatButton() {
        if (document.getElementById('directChatBtn')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'direct-chat-container';
        wrapper.innerHTML =
            '<button id="directChatBtn" style="margin-top:12px;background:none;border:none;color:#aaa;font-size:12px;cursor:pointer;text-decoration:underline;">直接进入对话</button>';
        wrapper.onclick = async e => {
            e.stopPropagation();
            await newChat();
        };
        const inputWrapper = centerInit.querySelector('.input-wrapper-outer');
        if (inputWrapper) inputWrapper.after(wrapper);
    }

    newChatIcon.onclick = newChatSidebarBtn.onclick = sidebarLogo.onclick = () => newChat();
    historyIcon.onclick = () => {
        sidebarLeft.classList.add('visible', 'expanded');
    };

    (async () => {
        await loadProviders();
        await loadConfigFromBackend();
        await loadChatsFromBackend();
        updateModelButtonLabels();
        updateHistoryList();
        addDirectChatButton();
        if (currentProvider) { await loadModels(currentProvider); }
        console.log('✅ 初始化完成，当前提供商：', currentProvider, '模型：', currentModel);
    })();
})();