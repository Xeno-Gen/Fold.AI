import { createApp, ref, computed, onMounted, nextTick, watch, shallowRef } from 'vue';
import { rootTemplate } from './template';
import {
  chats, chatTitles, chatTokens, currentChat, chatBranches, pinnedChats,
  isChatActive, streaming, isUserScrolledAway, currentAbortController, currentRequestId,
  currentProvider, currentChatFormat, currentModel, providers, availableModels, allModels,
  currentParams, customPort, pureMode, promptLang, baseSystemPrompt, baseSystemTokenCount,
  pluginPrompts, maxContextTokens, currentTheme, deepThinkEnabled, currentThinkMode,
  cothinkEnabled, autoCollapseThink, thinkCollapseDuring, streamAnimation, includeReasoning,
  chatFontSize, streamEnabled, commandExecEnabled, commandConfirmEnabled, sandboxEnabled,
  compressOldExecutions, collapsePluginOutput, memoryEnabled, agentEnabled, agentMaxIterations,
  askEnabled, askAutoShow, activeFiles, filesCurrentDir, defaultWorkDir,
  showSettings, showSettingsModal, showFileBrowser, showFileViewer, fileViewerData,
  showDeepThinkPopup, showSlashPopup, showAskPopup, showDrawer, activeSettingsTab,
  currentMessages, currentChatTitle, currentChatToken, cachedMemories, resetState,
} from './state';
import { useI18n } from './composables/useI18n';
import { useTheme } from './composables/useTheme';
import { useChat } from './composables/useChat';
import { useHistory } from './composables/useHistory';
import { useSettings } from './composables/useSettings';
import { MessageBubble } from './components/message-bubble';
import { DeepThinkPopup } from './components/deep-think-popup';
import { ModelPicker } from './components/model-picker';

// Marked library declaration
declare const marked: any;

// ============ UTILITY FUNCTIONS ============
function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function generateToken(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).substring(0, 16).replace(/\+/g, '-').replace(/\//g, '_');
}

const videoExts = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.flv', '.wmv'];

// ============ MAIN APP ============
const MainApp = {
  name: 'MainApp',
  components: { MessageBubble, DeepThinkPopup, ModelPicker },
  template: rootTemplate,
  setup() {
    const { t, setLang, currentLang } = useI18n();
    const { setTheme } = useTheme();
    const { sendMessage: sendChatMessage, stopGeneration: stopChatGeneration, streamingMsgIndex, streamingContent, streamingReasoning, stripTags } = useChat();
    const { saveChatToBackend, loadChatsFromBackend } = useHistory();
    useSettings();

    // === Local UI State ===
    const sidebarVisible = ref(false);
    const initialInput = ref('');
    const chatInput = ref('');
    const editingTitle = ref(false);
    const editTitleValue = ref('');
    const toastVisible = ref(false);
    const toastMessage = ref('');
    let toastTimer: any = null;

    // File browser state
    const filesItems = ref<any[]>([]);
    const filesLoading = ref(false);
    const workDirInput = ref('');
    const breadcrumbParts = ref<string[]>([]);

    // Deep think popup positioning
    const deepThinkPopupStyle = ref({});
    const modelPickerStyle = ref({});
    const showModelPicker = ref(false);
    const modelSearch = ref('');
    const modelPickerIndex = ref(0);

    // Provider keys state
    const newKeyValue = ref('');
    const providerKeys = ref<string[]>([]);
    const editingKey = ref<number | null>(null);
    const editingKeyValue = ref('');

    // File viewer
    const fileViewerContent = ref('');
    let fileInputTarget = 'initial';

    // Settings
    const langText = computed(() => currentLang.value === 'zh' ? 'English' : '中文');
    const settingsTabs = [
      { id: 'preferences', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>偏好</span>' },
      { id: 'model', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg><span>模型</span>' },
      { id: 'plugins', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg><span>插件</span>' },
      { id: 'memories', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>记忆</span>' },
      { id: 'usage', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>用量</span>' },
      { id: 'identity', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>身份</span>' },
      { id: 'version', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg><span>版本</span>' },
    ];
    const memories = ref<any[]>([]);
    const usageStats = ref<any>({});
    const userIdentity = ref('');
    const maxContextTokensStr = ref('1M');

    // Computed
    const canSend = computed(() => {
      return (initialInput.value.trim() || chatInput.value.trim() || activeFiles.initial.length > 0 || activeFiles.chat.length > 0);
    });

    const filteredModels = computed(() => {
      if (!modelSearch.value) return allModels.value;
      return allModels.value.filter((m: string) => m.toLowerCase().includes(modelSearch.value.toLowerCase()));
    });

    // === TOAST ===
    function showToast(msg: string) {
      toastMessage.value = msg;
      toastVisible.value = true;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastVisible.value = false; }, 2200);
    }

    // === SIDEBAR ===
    function toggleSidebar() { sidebarVisible.value = !sidebarVisible.value; }
    function openSettings() { showSettings.value = true; sidebarVisible.value = false; }
    function closeSettings() { showSettings.value = false; }
    function openSettingsModal() { showSettingsModal.value = true; }
    function closeSettingsModal() { showSettingsModal.value = false; }

    // === CHAT ===
    function newChat() {
      chats.value.push([]);
      chatTitles.value.push(t('currentChatTitle'));
      chatTokens.value.push(generateToken());
      currentChat.value = chats.value.length - 1;
      chatBranches.value[currentChat.value] = {};
      if (!isChatActive.value) activateChat();
      saveChatsToBackend();
    }

    function switchChat(idx: number) {
      if (streaming.value) stopGeneration();
      currentChat.value = idx;
      if (!isChatActive.value) activateChat();
    }

    function deleteChat(idx: number) {
      if (chats.value.length <= 1) return;
      chats.value.splice(idx, 1);
      chatTitles.value.splice(idx, 1);
      chatTokens.value.splice(idx, 1);
      if (currentChat.value >= chats.value.length) currentChat.value = chats.value.length - 1;
      if (currentChat.value < 0) currentChat.value = 0;
      updateHistoryList();
      saveChatsToBackend();
    }

    function activateChat() {
      isChatActive.value = true;
      document.body.classList.add('chat-active');
    }

    function deactivateChat() {
      isChatActive.value = false;
      document.body.classList.remove('chat-active');
    }

    // === CHAT TITLE EDITING ===
    function startEditTitle() {
      editingTitle.value = true;
      editTitleValue.value = chatTitles.value[currentChat.value] || '';
      nextTick(() => {
        const el = document.getElementById('chatTitleInput');
        if (el) { el.focus(); el.select(); }
      });
    }

    function saveTitle() {
      if (editTitleValue.value.trim()) {
        chatTitles.value[currentChat.value] = editTitleValue.value.trim();
        updateHistoryList();
        saveChatsToBackend();
      }
      editingTitle.value = false;
    }

    function cancelEditTitle() { editingTitle.value = false; }

    // === MESSAGE HANDLING ===
    function sendFromInitial() {
      const text = initialInput.value.trim();
      if (!text && activeFiles.initial.length === 0) return;
      if (!isChatActive.value) activateChat();
      if (!chatTokens.value[currentChat.value]) {
        chatTokens.value[currentChat.value] = generateToken();
      }
      showToast('发送: ' + text.substring(0, 20));
      sendChatMessage(text, 'initial').catch((e: any) => showToast('错误: ' + e.message));
      initialInput.value = '';
    }

    function sendFromChat() {
      const text = chatInput.value.trim();
      if (!text && activeFiles.chat.length === 0) return;
      sendChatMessage(text, 'chat').catch((e: any) => showToast('错误: ' + e.message));
      chatInput.value = '';
    }

    function stopGeneration() {
      stopChatGeneration();
    }

    function cycleTheme() {
      const order: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
      const idx = order.indexOf(currentTheme.value);
      const next = order[(idx + 1) % order.length];
      setTheme(next);
    }

    function onSelectThinkMode(mode: string) {
      currentThinkMode.value = mode;
      deepThinkEnabled.value = mode !== 'fast';
      showDeepThinkPopup.value = false;
    }

    function onSelectModel(model: string) {
      currentModel.value = model;
      showModelPicker.value = false;
      saveConfigToBackend();
    }

    // === KEYBOARD ===
    function onInitialKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFromInitial();
      }
    }

    function onChatKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFromChat();
      }
    }

    // === FILE UPLOAD ===
    function triggerFileInput(target: string) {
      fileInputTarget = target;
      const el = document.getElementById('hiddenFileInput') as HTMLInputElement;
      if (el) el.click();
    }

    async function onFileSelected(e: Event) {
      const input = e.target as HTMLInputElement;
      if (!input.files?.length) return;
      for (const file of Array.from(input.files)) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const r = await fetch('/api/upload', { method: 'POST', body: formData });
          if (r.ok) {
            const data = await r.json();
            activeFiles[fileInputTarget as 'initial' | 'chat'].push(data);
          }
        } catch (err) {
          showToast(t('uploadFailed'));
        }
      }
      input.value = '';
    }

    function removeFile(target: string, index: number) {
      activeFiles[target as 'initial' | 'chat'].splice(index, 1);
    }

    // === DEEP THINK ===
    function toggleDeepThinkPopup(e: MouseEvent) {
      const btn = e.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      showDeepThinkPopup.value = !showDeepThinkPopup.value;
      if (showDeepThinkPopup.value) {
        const popupWidth = 320;
        let left = rect.left + rect.width / 2 - popupWidth / 2;
        if (left < 10) left = 10;
        deepThinkPopupStyle.value = {
          bottom: (window.innerHeight - rect.top + 8) + 'px',
          left: left + 'px',
          width: popupWidth + 'px',
        };
      }
    }

    function closeDeepThinkPopupDelayed() {
      setTimeout(() => { showDeepThinkPopup.value = false; }, 200);
    }

    function selectThinkMode(mode: string) {
      currentThinkMode.value = mode;
      deepThinkEnabled.value = mode !== 'fast';
      showDeepThinkPopup.value = false;
      localStorage.setItem('fold_deep_think_mode', mode);
    }

    // === MODEL PICKER ===
    function openModelPicker(e: MouseEvent) {
      const btn = e.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      showModelPicker.value = !showModelPicker.value;
      if (showModelPicker.value) {
        modelPickerStyle.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: Math.max(10, rect.left - 100) + 'px',
        };
        modelSearch.value = '';
        modelPickerIndex.value = 0;
      }
    }

    function selectModel(model: string) {
      currentModel.value = model;
      showModelPicker.value = false;
      saveConfigToBackend();
    }

    function onModelSearchKeydown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); modelPickerIndex.value = Math.min(modelPickerIndex.value + 1, filteredModels.value.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); modelPickerIndex.value = Math.max(modelPickerIndex.value - 1, 0); }
      else if (e.key === 'Enter' && filteredModels.value[modelPickerIndex.value]) { selectModel(filteredModels.value[modelPickerIndex.value]); }
      else if (e.key === 'Escape') { showModelPicker.value = false; }
    }

    // === DRAWER SETTINGS ===
    function openDrawer() { showDrawer.value = true; }
    function closeDrawer() { showDrawer.value = false; }

    function selectProvider(id: string) {
      currentProvider.value = id;
      loadModels(id);
      saveConfigToBackend();
    }

    async function loadModels(providerId: string) {
      try {
        const r = await fetch('/api/provider/' + providerId + '/models');
        if (r.ok) {
          const data = await r.json();
          allModels.value = data.models || [];
          availableModels.value = data.models || [];
          if (allModels.value.length > 0 && !allModels.value.includes(currentModel.value)) {
            currentModel.value = allModels.value[0];
          }
        }
      } catch (e) {}
    }

    // API Keys
    function maskKey(key: string): string {
      if (key.length <= 8) return '****';
      return key.substring(0, 4) + '****' + key.substring(key.length - 4);
    }

    async function addKey() {
      if (!newKeyValue.value.trim() || !currentProvider.value) return;
      try {
        const r = await fetch('/api/provider/' + currentProvider.value + '/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: newKeyValue.value.trim() }),
        });
        if (r.ok) {
          newKeyValue.value = '';
          refreshKeyList();
          showToast(t('keyAdded'));
        }
      } catch (e) {}
    }

    async function deleteKey(index: number) {
      if (!currentProvider.value) return;
      try {
        const r = await fetch('/api/provider/' + currentProvider.value + '/key/' + index, { method: 'DELETE' });
        if (r.ok) {
          refreshKeyList();
          showToast(t('keyDeleted'));
        }
      } catch (e) {}
    }

    function applyMaxContext() {
      const v = maxContextTokensStr.value.toLowerCase().replace(/k$/, '000').replace(/m$/, '000000');
      const n = parseInt(v);
      if (n > 0) maxContextTokens.value = n;
    }

    async function loadMemories() {
      try {
        const r = await fetch('/api/plugin/Memory/memories');
        if (r.ok) { const d = await r.json(); memories.value = d.memories || d || []; }
      } catch {}
    }

    async function deleteMemory(index: number) {
      const mem = memories.value[index];
      if (!mem) return;
      try {
        await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(mem.key || mem.id), { method: 'DELETE' });
        memories.value.splice(index, 1);
        showToast(t('deleted'));
      } catch {}
    }

    async function loadUsage() {
      try {
        const r = await fetch('/api/usage');
        if (r.ok) usageStats.value = await r.json();
      } catch {}
    }

    async function loadIdentity() {
      try {
        const r = await fetch('/api/identity');
        if (r.ok) { const d = await r.json(); userIdentity.value = d.id || d.userId || ''; }
      } catch {}
    }

    async function refreshKeyList() {
      if (!currentProvider.value) { providerKeys.value = []; return; }
      try {
        const r = await fetch('/api/provider/' + currentProvider.value + '/keys');
        if (r.ok) {
          const data = await r.json();
          providerKeys.value = data.keys || [];
        }
      } catch (e) {}
    }

    function saveKeyEdit(index: number) { editingKey.value = null; }

    // === FILE BROWSER ===
    function openFileBrowser() {
      showFileBrowser.value = true;
      loadDirectory('/');
    }

    function closeFileBrowser() { showFileBrowser.value = false; }

    async function loadDirectory(dir: string) {
      filesLoading.value = true;
      try {
        const wd = workDirInput.value || defaultWorkDir.value || undefined;
        const params = new URLSearchParams();
        if (dir) params.set('dir', dir);
        if (wd) params.set('workingDirectory', wd);
        const r = await fetch('/api/files/browse?' + params.toString());
        if (r.ok) {
          const data = await r.json();
          breadcrumbParts.value = (data.path || '/').split('/').filter(Boolean);
          filesItems.value = data.items || [];
          filesCurrentDir.value = data.path || '/';
        }
      } catch (e) {}
      filesLoading.value = false;
    }

    function resetWorkDir() {
      workDirInput.value = '';
      loadDirectory('/');
    }

    function refreshFiles() { loadDirectory(filesCurrentDir.value); }

    function navigateBreadcrumb(index: number) {
      const path = '/' + breadcrumbParts.value.slice(0, index + 1).join('/');
      loadDirectory(path);
    }

    function openFileItem(item: any) {
      if (item.isDir) {
        const path = (filesCurrentDir.value === '/' ? '' : filesCurrentDir.value) + '/' + item.name;
        loadDirectory(path);
      } else {
        viewFile(item);
      }
    }

    function formatFileSize(bytes: number): string {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // === FILE VIEWER ===
    async function viewFile(item: any) {
      const fpath = (filesCurrentDir.value === '/' ? '' : filesCurrentDir.value) + '/' + item.name;
      try {
        const wd = workDirInput.value || defaultWorkDir.value || undefined;
        const params = new URLSearchParams({ file: fpath });
        if (wd) params.set('workingDirectory', wd);
        const r = await fetch('/api/files/read?' + params.toString());
        if (r.ok) {
          const data = await r.json();
          fileViewerData.name = data.name;
          fileViewerContent.value = data.text ? '<pre style="padding:16px;font-size:13px;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(data.content) + '</pre>' : '<img src="' + data.image + '" style="max-width:100%;">';
          showFileViewer.value = true;
        }
      } catch (e) {}
    }

    function closeFileViewer() { showFileViewer.value = false; }

    // === MESSAGE ACTIONS ===
    function copyMessage(content: string) {
      navigator.clipboard.writeText(content).then(() => showToast(t('copied')));
    }

    function editMessage(idx: number) {
      // To be implemented in Phase 3
    }

    function deleteMessage(idx: number) {
      if (currentMessages.value.length <= 1) return;
      chats.value[currentChat.value].splice(idx, 1);
    }

    function regenerateMessage(idx: number) {
      // To be implemented in Phase 2
    }

    function toggleThinkCollapse(idx: number) {
      const msg = currentMessages.value[idx];
      if (msg) msg._thinkCollapsed = !msg._thinkCollapsed;
    }

    // === RENDER HELPERS ===
    function renderMarkdown(text: string): string {
      if (!text) return '';
      try {
        return marked.parse(text, { breaks: true });
      } catch (e) {
        return escapeHtml(text);
      }
    }

    function renderAIContent(text: string): string {
      if (!text) return '';
      // Replace plugin blocks with styled HTML
      let html = text
        .replace(/<power>([\s\S]*?)<\/power>/g, '<div class="plugin-block plugin-power"><div class="plugin-block-header">⚡ $1</div></div>')
        .replace(/<cmd>([\s\S]*?)<\/cmd>/g, '<div class="plugin-block plugin-cmd"><div class="plugin-block-header">💻 $1</div></div>')
        .replace(/<mem>([\s\S]*?)<\/mem>/g, '<div class="plugin-block plugin-mem"><div class="plugin-block-header">📝 $1</div></div>')
        .replace(/<ask[^>]*>([\s\S]*?)<\/ask>/g, '<div class="plugin-block plugin-ask"><div class="plugin-block-header">❓ $1</div></div>');
      try {
        return marked.parse(html, { breaks: true });
      } catch (e) {
        return escapeHtml(html);
      }
    }

    // === CHAT SCROLL ===
    function onChatScroll(e: Event) {
      const el = e.target as HTMLElement;
      const threshold = 100;
      isUserScrolledAway.value = el.scrollHeight - el.scrollTop - el.clientHeight > threshold;
      lastScrollTop.value = el.scrollTop;
    }

    function updateHistoryList() {
      // Force reactivity by replacing the array
      chatTitles.value = [...chatTitles.value];
    }

    // === CONFIG PERSISTENCE ===
    async function saveConfigToBackend() {
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultParams: { ...currentParams },
            currentProvider: currentProvider.value,
            currentModel: currentModel.value,
            customPort: customPort.value,
            systemPrompt: currentParams.systemPrompt,
            chatFormat: currentChatFormat.value,
            pureMode: pureMode.value,
          }),
        });
      } catch (e) {}
    }

    async function saveChatsToBackend() {
      for (let i = 0; i < chats.value.length; i++) {
        saveChatToBackend(i);
      }
    }

    async function loadAllFromBackend() {
      try {
        // Load config
        const configR = await fetch('/api/config');
        if (configR.ok) {
          const config = await configR.json();
          if (config.defaultParams) Object.assign(currentParams, config.defaultParams);
          if (config.currentProvider) currentProvider.value = config.currentProvider;
          if (config.currentModel) currentModel.value = config.currentModel;
          if (config.customPort) customPort.value = config.customPort;
          if (config.systemPrompt !== undefined) currentParams.systemPrompt = config.systemPrompt;
          if (config.chatFormat) currentChatFormat.value = config.chatFormat;
          if (config.pureMode !== undefined) pureMode.value = config.pureMode;
          if (config.promptLang) promptLang.value = config.promptLang;
          if (config.baseSystemPrompt) baseSystemPrompt.value = config.baseSystemPrompt;
          if (config.baseSystemTokenCount) baseSystemTokenCount.value = config.baseSystemTokenCount;
          if (config.pluginPrompts) pluginPrompts.value = config.pluginPrompts;
          if (config.workDir) defaultWorkDir.value = config.workDir;
        }

        // Load providers
        const provR = await fetch('/api/providers');
        if (provR.ok) {
          const data = await provR.json();
          providers.value = data.providers || data || [];
        }

        // Load chats
        await loadChatsFromBackend();
      } catch (e) {
        console.error('Failed to load initial data', e);
      }
    }

    // === WATCHERS ===
    // Save config changes to backend
    watch([currentProvider, currentModel], () => {
      saveConfigToBackend();
    });

    // Watch provider changes to reload keys
    watch(currentProvider, () => {
      refreshKeyList();
      if (currentProvider.value) loadModels(currentProvider.value);
    });

    // === LANG ===
    function toggleLang() {
      setLang(currentLang.value === 'zh' ? 'en' : 'zh');
    }

    // === INIT ===
    onMounted(async () => {
      await loadAllFromBackend();
      loadMemories();
      loadUsage();
      loadIdentity();
    });

    return {
      // State
      t, langText, toggleLang, setTheme, cycleTheme,
      sidebarVisible, toggleSidebar, openSettings, closeSettings, showSettings,
      showSettingsModal, closeSettingsModal, openSettingsModal,
      showFileBrowser, openFileBrowser, closeFileBrowser,
      showFileViewer, closeFileViewer,
      showDrawer, openDrawer, closeDrawer,
      showDeepThinkPopup, toggleDeepThinkPopup, deepThinkPopupStyle,
      showModelPicker, modelPickerStyle, openModelPicker,
      onSelectThinkMode, onSelectModel,
      deepThinkEnabled, currentThinkMode, memoryEnabled, commandExecEnabled,
      sandboxEnabled, agentEnabled, askEnabled,
      autoCollapseThink, thinkCollapseDuring, commandConfirmEnabled,
      currentTheme, editTitleValue, editingTitle,
      providerKeys, newKeyValue, editingKey, editingKeyValue,
      filesItems, filesLoading, workDirInput, breadcrumbParts,
      fileViewerContent, fileViewerData,
      toastVisible, toastMessage,
      settingsTabs, activeSettingsTab, memories, usageStats, userIdentity, maxContextTokensStr,

      // Chat
      isChatActive, chats, chatTitles, currentChat, currentMessages,
      currentChatTitle, currentModel, currentParams, customPort, pureMode,
      streaming, canSend,
      initialInput, chatInput,
      activeFiles, filesCurrentDir,
      providers, currentProvider, provider: currentProvider,

      // Methods
      newChat, switchChat, deleteChat,
      sendFromInitial, sendFromChat,
      onInitialKeydown, onChatKeydown,
      stopGeneration,
      startEditTitle, saveTitle, cancelEditTitle,
      copyMessage, editMessage, deleteMessage, regenerateMessage,
      toggleThinkCollapse,
      renderMarkdown, renderAIContent,
      onChatScroll, updateHistoryList,
      triggerFileInput, onFileSelected, removeFile,
      selectProvider, addKey, deleteKey, maskKey, refreshKeyList, saveKeyEdit,
      applyMaxContext, loadMemories, deleteMemory, loadUsage, loadIdentity,
      loadDirectory, resetWorkDir, refreshFiles, navigateBreadcrumb,
      openFileItem, viewFile, formatFileSize,
    };
  },
};

createApp(MainApp).mount('#vue-app');
