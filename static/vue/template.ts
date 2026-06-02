export const rootTemplate = `
<div class="lang-switcher" id="langSwitcher">
    <span class="lang-switch-text" id="langSwitchText" @click="toggleLang">{{ langText }}</span>
    <button class="theme-toggle-btn" id="themeToggleBtn" @click="cycleTheme" title="切换主题">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    </button>
</div>
<div class="app-container">
  <aside class="sidebar-left" id="sidebarLeft" :class="{ visible: sidebarVisible }">
      <button class="sidebar-toggle" id="sidebarToggle" @click="toggleSidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <button class="sidebar-newchat-fab" id="sidebarNewChatFab" @click="newChat" data-i18n-title="newChat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="sidebar-settings-fab" id="sidebarSettingsFab" @click="openSettings" data-i18n-title="settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
      </button>
      <div class="sidebar-content">
          <div class="sidebar-logo" id="sidebarLogo"><span class="bold">Fold</span><span class="light">.AI</span></div>
          <button class="new-chat-btn" id="newChatSidebarBtn" @click="newChat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>{{ t('newChat') }}</span></button>
          <div class="sidebar-section-title"><span>{{ t('chatHistory') }}</span></div>
          <ul class="chat-history-list" id="chatHistoryList">
            <li v-for="(title, idx) in chatTitles" :key="idx" class="chat-history-item" :class="{ active: currentChat === idx }" @click="switchChat(idx)">
              <span class="history-title">{{ title }}</span>
              <span class="history-actions">
                <button class="action-icon small" @click.stop="deleteChat(idx)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </span>
            </li>
          </ul>
      </div>
      <button class="sidebar-settings-btn" id="sidebarSettingsBtn" @click="openSettings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>{{ t('settings') }}</span>
      </button>
  </aside>

  <main class="main-content" id="mainContent">
      <div class="chat-header" id="chatHeader">
          <span id="chatTitleText" @click="startEditTitle">{{ currentChatTitle }}</span>
          <input type="text" id="chatTitleInput" v-show="editingTitle" v-model="editTitleValue" @keyup.enter="saveTitle" @blur="saveTitle">
      </div>
      <div class="center-initial" id="centerInitial" v-show="!isChatActive && !showSettings && !showFileBrowser">
          <div class="title-container">
              <div class="title-glow"></div>
              <div class="title-text"><span class="bold">Fold</span><span class="light">.AI</span></div>
              <div class="title-subtitle">{{ t('greeting') }}</div>
              <div class="title-beam"></div>
          </div>
          <div class="input-wrapper-outer">
              <div class="input-inner-area"><textarea class="input-textarea" id="initialTextarea" :placeholder="t('initialPlaceholder')" v-model="initialInput" @keydown="onInitialKeydown" rows="2"></textarea></div>
              <div class="image-preview-area" id="initialImagePreview">
                <div v-for="(f, i) in activeFiles.initial" :key="i" class="image-preview-item" :style="{ backgroundImage: 'url(' + f.content + ')' }"><div class="remove-preview" @click="removeFile('initial', i)">✕</div></div>
              </div>
              <div class="input-toolbar">
                  <div class="toolbar-left">
                      <button class="tool-btn" id="initialAttachBtn" @click="triggerFileInput('initial')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>
                      <button class="tool-btn" id="initialSettingsBtn" @click="toggleDrawer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
<button class="tool-btn" id="initialFileBtn" @click="openFileBrowser" title="文件"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></button>
<button class="tool-btn" id="initialDeepThinkBtn" @click="toggleDeepThinkPopup" title="深度思考">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/>
    </svg>
</button>
                  </div>
                  <div class="toolbar-right">
                      <div class="model-select-wrapper" id="initialModelWrapper">
                          <button class="model-select-btn" id="initialModelBtn" @click="openModelPicker"><span id="initialModelLabel">{{ currentModel }}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
                      </div>
                      <button class="tool-btn send-btn" id="initialSendBtn" @click="sendFromInitial" :disabled="!canSend || streaming"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                  </div>
              </div>
          </div>
      </div>

      <div class="chat-area" id="chatArea" v-show="isChatActive && !showSettings && !showFileBrowser">
          <div class="chat-area-inner" id="chatAreaInner">
            <div v-for="(msg, idx) in currentMessages" :key="idx" class="message-line">
              <div v-if="msg.role === 'user'" class="message-bubble message-user">
                <div class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
                <div v-if="msg.images && msg.images.length" class="msg-images" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                  <img v-for="(img, ii) in msg.images" :key="ii" :src="img" style="max-width:200px;border-radius:6px;">
                </div>
                <div class="message-actions">
                  <button class="action-icon" @click="copyMessage(msg.content)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                  <button class="action-icon" @click="editMessage(idx)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                  <button class="action-icon" @click="deleteMessage(idx)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
              </div>
              <div v-else-if="msg.role === 'system'" class="message-bubble message-system">
                <div class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
                <div class="message-actions">
                  <button class="action-icon" @click="copyMessage(msg.content)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
              </div>
              <div v-else class="message-bubble message-ai">
                <div v-if="msg.reasoning" class="think-block" :class="{ collapsed: msg._thinkCollapsed }">
                  <div class="think-header" @click="toggleThinkCollapse(idx)">
                    <span class="think-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg></span>
                    <span>{{ t('deepThink') }}</span>
                    <span class="think-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
                  </div>
                  <div class="think-body-wrapper"><div class="think-line"></div><div class="think-content" v-html="renderMarkdown(msg.reasoning)"></div></div>
                </div>
                <div class="markdown-body" v-html="renderAIContent(msg.content)"></div>
                <div class="message-actions">
                  <button class="action-icon" @click="copyMessage(msg.content)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                  <button class="action-icon" @click="regenerateMessage(idx)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
                </div>
              </div>
            </div>
            <div class="empty-state-hint" v-if="currentMessages.length === 0" id="emptyHint">{{ t('startNewChat') }}</div>
          </div>
      </div>

      <div class="bottom-input-container" id="bottomInputContainer" v-show="isChatActive && !showSettings && !showFileBrowser">
          <div class="input-wrapper-outer">
              <div class="input-inner-area"><textarea class="input-textarea" id="chatTextarea" :placeholder="t('chatPlaceholder')" v-model="chatInput" @keydown="onChatKeydown" rows="2"></textarea></div>
              <div class="image-preview-area" id="chatImagePreview">
                <div v-for="(f, i) in activeFiles.chat" :key="i" class="image-preview-item" :style="{ backgroundImage: 'url(' + f.content + ')' }"><div class="remove-preview" @click="removeFile('chat', i)">✕</div></div>
              </div>
              <div class="input-toolbar">
                  <div class="toolbar-left">
                      <button class="tool-btn" id="chatAttachBtn" @click="triggerFileInput('chat')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>
                      <button class="tool-btn" id="settingsBtn" @click="toggleDrawer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
<button class="tool-btn" id="chatFileBtn" @click="openFileBrowser" title="文件"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></button>
<button class="tool-btn" id="chatDeepThinkBtn" @click="toggleDeepThinkPopup" title="深度思考">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/>
    </svg>
</button>
                  </div>
                  <div class="toolbar-right">
                      <div class="model-select-wrapper" id="chatModelWrapper">
                          <button class="model-select-btn" id="chatModelBtn" @click="openModelPicker"><span id="chatModelLabel">{{ currentModel }}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
                      </div>
                      <button class="tool-btn send-btn" id="chatSendBtn" @click="sendFromChat" :disabled="!canSend || streaming"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                  </div>
              </div>
          </div>
      </div>
      <div class="bottom-spacer"></div>

      <div class="files-panel" id="filesPanel" :class="{ active: showFileBrowser }" v-show="showFileBrowser">
          <div class="settings-panel-header">
              <h2 id="filesPanelTitle">{{ t('workDirectory') }}</h2>
              <button class="settings-panel-close" id="filesPanelClose" @click="closeFileBrowser">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
          </div>
          <div class="files-workdir-row">
              <input type="text" id="filesWorkDirInput" class="files-workdir-input" v-model="workDirInput" placeholder="工作目录路径" spellcheck="false">
              <button class="files-workdir-reset" id="filesWorkDirReset" @click="resetWorkDir">{{ t('default') }}</button>
          </div>
          <div class="files-panel-toolbar">
              <div class="files-breadcrumb" id="filesBreadcrumb">
                <span v-for="(part, pi) in breadcrumbParts" :key="pi" :class="{ current: pi === breadcrumbParts.length - 1 }" @click="navigateBreadcrumb(pi)">{{ part }}</span>
              </div>
              <button class="files-refresh-btn" id="filesRefreshBtn" @click="refreshFiles"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
          </div>
          <div class="files-panel-body" id="filesPanelBody">
            <div v-if="filesLoading" class="files-panel-empty">{{ t('loading') }}</div>
            <div v-else-if="filesItems.length === 0" class="files-panel-empty">{{ t('empty') }}</div>
            <div v-else>
              <div v-for="item in filesItems" :key="item.name" class="file-list-item" @dblclick="openFileItem(item)">
                <span class="file-icon" :class="item.isDir ? 'folder' : 'file'">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path v-if="item.isDir" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <path v-else d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline v-if="!item.isDir" points="14 2 14 8 20 8"/>
                  </svg>
                </span>
                <span class="file-name">{{ item.name }}</span>
                <span class="file-meta" v-if="!item.isDir">{{ formatFileSize(item.size) }}</span>
              </div>
            </div>
          </div>
      </div>

      <div class="settings-panel" id="settingsPanel" :class="{ active: showSettings }" v-show="showSettings">
          <div class="settings-panel-header">
              <h2>{{ t('settings') }}</h2>
              <button class="settings-panel-close" id="settingsPanelClose" @click="closeSettings">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
          </div>
          <div class="settings-panel-layout">
              <nav class="settings-panel-nav" id="settingsPanelNav">
                <button v-for="tab in settingsTabs" :key="tab.id" class="settings-panel-nav-item" :class="{ active: activeSettingsTab === tab.id }" @click="activeSettingsTab = tab.id" v-html="tab.icon"></button>
              </nav>
              <div class="settings-panel-content" id="settingsPanelContent">
                <div v-if="activeSettingsTab === 'preferences'" class="settings-section">
                  <div class="settings-section-title">{{ t('appearance') }}</div>
                  <div class="settings-item">
                    <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>{{ t('themeMode') }}</span></div>
                    <div class="think-mode-selector" id="themeSelector">
                      <button class="think-mode-option" :class="{ active: currentTheme === 'light' }" @click="setTheme('light')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>{{ t('light') }}</span></button>
                      <button class="think-mode-option" :class="{ active: currentTheme === 'dark' }" @click="setTheme('dark')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>{{ t('dark') }}</span></button>
                      <button class="think-mode-option" :class="{ active: currentTheme === 'system' }" @click="setTheme('system')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>{{ t('system') }}</span></button>
                    </div>
                  </div>
                  <div class="settings-item">
                    <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg><span>{{ t('autoCollapseThink') }}</span></div>
                    <div class="think-mode-selector" id="autoCollapseToggle" style="display:inline-flex;">
                      <button class="think-mode-option" :class="{ active: autoCollapseThink }" @click="autoCollapseThink = true">{{ t('on') }}</button>
                      <button class="think-mode-option" :class="{ active: !autoCollapseThink }" @click="autoCollapseThink = false">{{ t('off') }}</button>
                    </div>
                  </div>
                  <div class="settings-item">
                    <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>{{ t('thinkCollapse') }}</span></div>
                    <div class="think-mode-selector" id="thinkCollapseToggle" style="display:inline-flex;">
                      <button class="think-mode-option" :class="{ active: thinkCollapseDuring === 'on' }" @click="thinkCollapseDuring = 'on'">{{ t('on') }}</button>
                      <button class="think-mode-option" :class="{ active: thinkCollapseDuring === 'off' }" @click="thinkCollapseDuring = 'off'">{{ t('off') }}</button>
                      <button class="think-mode-option" :class="{ active: thinkCollapseDuring === 'latest' }" @click="thinkCollapseDuring = 'latest'">最新六行</button>
                    </div>
                  </div>
                </div>
                <div v-if="activeSettingsTab === 'plugins'" class="settings-section">
                  <div class="settings-section-title">{{ t('plugins') }}</div>
                  <div class="settings-item">
                    <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>{{ t('confirmBeforeExec') }}</span></div>
                    <div class="think-mode-selector" style="display:inline-flex;">
                      <button class="think-mode-option" :class="{ active: commandConfirmEnabled }" @click="commandConfirmEnabled = true">{{ t('on') }}</button>
                      <button class="think-mode-option" :class="{ active: !commandConfirmEnabled }" @click="commandConfirmEnabled = false">{{ t('off') }}</button>
                    </div>
                  </div>
                  <div class="settings-item"><div class="settings-item-left"><span>{{ t('compressOldExec') }}</span></div><div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: compressOldExecutions }" @click="compressOldExecutions = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !compressOldExecutions }" @click="compressOldExecutions = false">{{ t('off') }}</button></div></div>
                  <div class="settings-item"><div class="settings-item-left"><span>{{ t('collapsePluginOutput') }}</span></div><div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: collapsePluginOutput }" @click="collapsePluginOutput = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !collapsePluginOutput }" @click="collapsePluginOutput = false">{{ t('off') }}</button></div></div>
                </div>
                <div v-if="activeSettingsTab === 'model'" class="settings-section"><div class="settings-section-title">{{ t('model') }}</div>
                  <div class="settings-item"><div class="settings-item-left"><span>Stream</span></div><div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: streamEnabled }" @click="streamEnabled = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !streamEnabled }" @click="streamEnabled = false">{{ t('off') }}</button></div></div>
                  <div class="settings-item"><div class="settings-item-left"><span>{{ t('includeReasoning') }}</span></div><div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: includeReasoning }" @click="includeReasoning = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !includeReasoning }" @click="includeReasoning = false">{{ t('off') }}</button></div></div>
                </div>
                <div v-if="activeSettingsTab === 'memories'" class="settings-section"><div class="settings-section-title">{{ t('memories') }}</div><div v-if="memories.length === 0" style="color:#999;font-size:13px;padding:8px 0;">暂无记忆</div><div v-for="(mem, i) in memories" :key="i" style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;"><strong>{{ mem.key }}</strong>: {{ mem.content }}<button @click="deleteMemory(i)" style="float:right;color:#e74c3c;border:none;background:none;cursor:pointer;">✕</button></div></div>
                <div v-if="activeSettingsTab === 'usage'" class="settings-section"><div class="settings-section-title">{{ t('usage') }}</div><div v-for="(count, model) in usageStats" :key="model" style="padding:6px 0;font-size:13px;border-bottom:1px solid #eee;">{{ model }}: {{ count }}次</div></div>
                <div v-if="activeSettingsTab === 'version'" class="settings-section"><div class="settings-section-title">{{ t('version') }}</div><div style="font-size:13px;padding:8px 0;">Fold.AI v0.3.3</div></div>
              </div>
          </div>
      </div>
  </main>

  <div class="drawer-overlay" id="drawerOverlay" :class="{ active: showDrawer }" @click.self="closeDrawer">
      <div class="drawer" id="drawer">
          <div class="drawer-header"><h2>{{ t('settings') }}</h2><button class="drawer-close" id="drawerClose" @click="closeDrawer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <div class="drawer-body" id="drawerBody">
              <div class="section-title">{{ t('selectProvider') }}</div>
              <div class="provider-grid">
                <div v-for="p in providers" :key="p.id" class="provider-card" :class="{ active: currentProvider === p.id }" @click="selectProvider(p.id)">
                  <div class="prov-icon"><img v-if="p.icon" :src="p.icon"><span v-else>{{ p.name?.charAt(0) }}</span></div>
                  <div class="provider-name">{{ p.name }}</div>
                </div>
              </div>
              <div class="section-title">{{ t('apiKeys') }}</div>
              <div class="key-input-row"><input type="text" v-model="newKeyValue" :placeholder="t('enterApiKey')" @keyup.enter="addKey"><button @click="addKey">{{ t('add') }}</button></div>
              <div class="key-list"><div v-for="(key, ki) in providerKeys" :key="ki" class="key-row"><span class="key-mask">{{ maskKey(key) }}</span><span class="key-actions"><button @click="deleteKey(ki)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></span></div></div>
              <div class="section-title">{{ t('parameters') }}</div>
              <div class="param-group">
                <div class="param-item"><label>{{ t('temperature') }}</label><input type="number" v-model.number="currentParams.temperature" min="0" max="2" step="0.1"></div>
                <div class="param-item"><label>top_p</label><input type="number" v-model.number="currentParams.top_p" min="0" max="1" step="0.1"></div>
                <div class="param-item"><label>{{ t('maxTokens') }}</label><input type="number" v-model.number="currentParams.max_tokens"></div>
              </div>
              <div class="system-prompt-section"><textarea v-model="currentParams.systemPrompt" :placeholder="t('systemPrompt')"></textarea></div>
          </div>
      </div>
  </div>
  <div class="toast" id="toast" :style="{ opacity: toastVisible ? 1 : 0, pointerEvents: toastVisible ? 'auto' : 'none' }">{{ toastMessage }}</div>
  <input type="file" id="hiddenFileInput" multiple style="display:none;" accept="image/*,.txt,.md,.json,.js,.py,.ts,.jsx,.tsx,.css,.html,.csv,.xml,.yaml,.yml,.log,video/*" ref="fileInput" @change="onFileSelected">
</div>

<div class="settings-modal-overlay" id="settingsModalOverlay" v-show="showSettingsModal" @click.self="closeSettingsModal">
  <div class="settings-modal" id="settingsModal">
      <div class="settings-modal-header"><h2>{{ t('settings') }}</h2><button class="settings-modal-close" id="settingsModalClose" @click="closeSettingsModal"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="settings-modal-body" id="settingsModalBody">
          <div class="settings-section">
              <div class="settings-section-title">{{ t('general') }}</div>
              <div class="settings-item">
                  <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>{{ t('themeMode') }}</span></div>
                  <div class="think-mode-selector" id="themeSelector">
                    <button class="think-mode-option" :class="{ active: currentTheme === 'light' }" @click="setTheme('light')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>{{ t('light') }}</span></button>
                    <button class="think-mode-option" :class="{ active: currentTheme === 'dark' }" @click="setTheme('dark')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>{{ t('dark') }}</span></button>
                    <button class="think-mode-option" :class="{ active: currentTheme === 'system' }" @click="setTheme('system')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>{{ t('system') }}</span></button>
                  </div>
              </div>
              <div class="settings-item">
                  <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg><span>{{ t('autoCollapseThink') }}</span></div>
                  <div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: autoCollapseThink }" @click="autoCollapseThink = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !autoCollapseThink }" @click="autoCollapseThink = false">{{ t('off') }}</button></div>
              </div>
          </div>
          <div class="settings-section">
              <div class="settings-section-title">{{ t('commandExecution') }}</div>
              <div class="settings-item">
                  <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>{{ t('confirmBeforeExec') }}</span></div>
                  <div class="think-mode-selector" style="display:inline-flex;"><button class="think-mode-option" :class="{ active: commandConfirmEnabled }" @click="commandConfirmEnabled = true">{{ t('on') }}</button><button class="think-mode-option" :class="{ active: !commandConfirmEnabled }" @click="commandConfirmEnabled = false">{{ t('off') }}</button></div>
              </div>
          </div>
          <div class="settings-section">
              <div class="settings-section-title">{{ t('about') }}</div>
              <div class="settings-item">
                  <div class="settings-item-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>Fold.AI v0.3.3</span></div>
              </div>
          </div>
      </div>
  </div>
</div>

<div class="file-viewer-overlay" id="fileViewerOverlay" v-show="showFileViewer" @click.self="closeFileViewer">
  <div class="file-viewer-drawer">
      <div class="file-viewer-header"><h2 id="fileViewerTitle">{{ fileViewerData.name }}</h2><button class="file-viewer-close" id="fileViewerClose" @click="closeFileViewer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="file-viewer-body" id="fileViewerBody" v-html="fileViewerContent"></div>
  </div>
</div>
`;
