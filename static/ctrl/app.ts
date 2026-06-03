import { createApp, ref, onMounted, computed } from 'vue';

const api = {
  async getState() { const r = await fetch('/api/state'); return r.ok ? r.json() : null; },
  async setState(data: any) { const r = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.ok ? r.json() : null; },
  async getUsers() { const r = await fetch('/api/users'); return r.ok ? r.json() : { users: [] }; },
  async deleteUser(token: string) { const r = await fetch('/api/user/' + encodeURIComponent(token), { method: 'DELETE' }); return r.ok ? r.json() : null; },
  async getLogs() { const r = await fetch('/api/logs'); return r.ok ? r.json() : { logs: [] }; },
};

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? m[1] : '';
}
function setCookie(name: string, val: string) {
  document.cookie = name + '=' + val + ';path=/;max-age=31536000';
}

const CtrlApp = {
  name: 'CtrlPanel',
  template: `
  <div class="ctrl-panel">
    <div class="ctrl-header">
      <h2>{{ t('title') }}</h2>
      <div class="ctrl-header-right">
        <span class="ctrl-info">{{ t('mode') }}: {{ modeLabel }}</span>
        <button class="lang-btn" @click="toggleLang">{{ langLabel }}</button>
        <button class="theme-btn" @click="toggleTheme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>
    </div>

    <div class="ctrl-tabs">
      <button v-for="tab in tabs" :key="tab.id" class="ctrl-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button>
    </div>

    <div class="ctrl-body">
      <!-- 常规设置 -->
      <div v-show="activeTab === 'settings'">
        <div class="ctrl-section">
          <div class="ctrl-section-title">{{ t('general') }}</div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <div><div>{{ t('disableUpload') }}</div><div class="desc">{{ t('disableUploadDesc') }}</div></div>
            </div>
            <div class="ctrl-toggle">
              <button class="ctrl-toggle-btn" :class="{ active: !disableFileUpload }" @click="setUpload(false)">{{ t('off') }}</button>
              <button class="ctrl-toggle-btn" :class="{ active: disableFileUpload }" @click="setUpload(true)">{{ t('on') }}</button>
            </div>
          </div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              <div><div>{{ t('noSaveConv') }}</div><div class="desc">{{ t('noSaveConvDesc') }}</div></div>
            </div>
            <div class="ctrl-toggle">
              <button class="ctrl-toggle-btn" :class="{ active: !disableSaveConversation }" @click="setSave(false)">{{ t('off') }}</button>
              <button class="ctrl-toggle-btn" :class="{ active: disableSaveConversation }" @click="setSave(true)">{{ t('on') }}</button>
            </div>
          </div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>
              <div><div>{{ t('disablePlugins') }}</div><div class="desc">{{ t('disablePluginsDesc') }}</div></div>
            </div>
            <div class="ctrl-toggle">
              <button class="ctrl-toggle-btn" :class="{ active: !disableAllPlugins }" @click="setPlugins(false)">{{ t('off') }}</button>
              <button class="ctrl-toggle-btn" :class="{ active: disableAllPlugins }" @click="setPlugins(true)">{{ t('on') }}</button>
            </div>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">{{ t('workdir') }}</div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2l-2-3H5a2 2 0 0 0-2 2z"/></svg>
              <div><div>{{ t('disableWorkdir') }}</div><div class="desc">{{ t('disableWorkdirDesc') }}</div></div>
            </div>
            <div class="ctrl-toggle">
              <button class="ctrl-toggle-btn" :class="{ active: !disableWorkDir }" @click="setWorkdir(false)">{{ t('off') }}</button>
              <button class="ctrl-toggle-btn" :class="{ active: disableWorkDir }" @click="setWorkdir(true)">{{ t('on') }}</button>
            </div>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">{{ t('ipAccess') }}</div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div><div>{{ t('ipAccessMode') }}</div><div class="desc">{{ t('ipAccessDesc') }}</div></div>
            </div>
            <div class="ctrl-mode-group">
              <button v-for="opt in ipOptions" :key="opt.value" class="ctrl-mode-btn" :class="{ active: ipAccessMode === opt.value }" @click="setIPMode(opt.value)">{{ opt.label }}</button>
            </div>
          </div>
        </div>

        <div class="ctrl-section">
          <div class="ctrl-section-title">{{ t('users') }}</div>
          <div class="ctrl-item">
            <div class="ctrl-item-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <div><div>{{ t('deleteUser') }}</div><div class="desc">{{ t('deleteUserDesc') }}</div></div>
            </div>
            <button class="ctrl-danger-btn" @click="openDeleteDialog">{{ t('delete') }}</button>
          </div>
        </div>
      </div>

      <!-- 访问日志 -->
      <div v-show="activeTab === 'logs'">
        <div class="ctrl-section">
          <div class="ctrl-section-title" style="display:flex;align-items:center;justify-content:space-between;">
            <span>{{ t('accessLogs') }}</span>
            <button class="ctrl-refresh-btn" @click="refreshLogs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {{ t('refresh') }}
            </button>
          </div>
          <div class="ctrl-logs">
            <div v-if="logs.length === 0" class="ctrl-log-empty">{{ t('noLogs') }}</div>
            <div v-for="(line, i) in logs" :key="i" class="ctrl-log-line">{{ line }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="ctrl-dialog-overlay" v-if="showDeleteDialog" @click.self="showDeleteDialog = false">
    <div class="ctrl-dialog">
      <h3>{{ t('deleteUser') }}</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">{{ t('deleteUserHint') }}</p>
      <select v-model="selectedUserToken" v-if="userList.length > 0">
        <option value="" disabled>{{ t('selectUser') }}</option>
        <option v-for="u in userList" :key="u.token" :value="u.token">{{ u.label }}</option>
      </select>
      <p v-else style="font-size:13px;color:var(--text2);margin-bottom:12px;">{{ t('noUsers') }}</p>
      <div class="ctrl-dialog-actions">
        <button class="cancel" @click="showDeleteDialog = false">{{ t('cancel') }}</button>
        <button class="confirm" :disabled="!selectedUserToken" @click="confirmDeleteUser">{{ t('confirm') }}</button>
      </div>
    </div>
  </div>
  `,
  setup() {
    const currentLang = ref(getCookie('fold_ctrl_lang') || 'zh');
    const currentTheme = ref(getCookie('fold_ctrl_theme') || 'light');

    const langData: Record<string, Record<string, string>> = {
      zh: {
        title: '控制面板', mode: '模式', general: '常规', workdir: '工作目录',
        ipAccess: 'IP 访问', ipAccessMode: 'IP 访问控制', ipAccessDesc: '限制可访问控制面板的 IP 范围',
        disableUpload: '禁止文件上传', disableUploadDesc: '用户无法上传文件到服务器',
        noSaveConv: '不保存对话', noSaveConvDesc: '不在 data 文件夹保存对话记录',
        disablePlugins: '禁用全部插件', disablePluginsDesc: '前端与后端插件全部禁用',
        disableWorkdir: '禁用工作目录', disableWorkdirDesc: '所有工作目录查询请求将被拒绝',
        users: '用户管理', deleteUser: '删除用户', deleteUserDesc: '删除指定用户的全部数据',
        delete: '删除', confirm: '确认删除', cancel: '取消', selectUser: '请选择用户', noUsers: '暂无用户数据',
        deleteUserHint: '选择要删除的用户，此操作不可恢复。',
        on: '开启', off: '关闭',
        local: '仅本地', lan: '局域网', open: '完全开放',
        accessLogs: '访问日志', refresh: '刷新', noLogs: '暂无访问记录',
      },
      en: {
        title: 'Control Panel', mode: 'Mode', general: 'General', workdir: 'Working Directory',
        ipAccess: 'IP Access', ipAccessMode: 'IP Access Control', ipAccessDesc: 'Restrict which IPs can access the panel',
        disableUpload: 'Disable File Upload', disableUploadDesc: 'Users cannot upload files to server',
        noSaveConv: 'No Save Conversation', noSaveConvDesc: 'Do not save chat history in data folder',
        disablePlugins: 'Disable All Plugins', disablePluginsDesc: 'Disable all frontend and backend plugins',
        disableWorkdir: 'Disable Work Directory', disableWorkdirDesc: 'All work directory queries will be rejected',
        users: 'User Management', deleteUser: 'Delete User', deleteUserDesc: 'Delete all data for a user',
        delete: 'Delete', confirm: 'Confirm Delete', cancel: 'Cancel', selectUser: 'Select user', noUsers: 'No users',
        deleteUserHint: 'Select a user to delete. This action cannot be undone.',
        on: 'On', off: 'Off',
        local: 'Local Only', lan: 'LAN Only', open: 'Fully Open',
        accessLogs: 'Access Logs', refresh: 'Refresh', noLogs: 'No access records yet',
      },
    };

    function t(key: string): string {
      return langData[currentLang.value]?.[key] || key;
    }

    const langLabel = computed(() => currentLang.value === 'zh' ? 'English' : '中文');

    function toggleLang() {
      currentLang.value = currentLang.value === 'zh' ? 'en' : 'zh';
      setCookie('fold_ctrl_lang', currentLang.value);
    }

    function applyTheme(t: string) {
      currentTheme.value = t;
      document.documentElement.setAttribute('data-theme', t);
      setCookie('fold_ctrl_theme', t);
    }

    function toggleTheme() {
      applyTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
    }

    applyTheme(currentTheme.value);

    const activeTab = ref('settings');
    const tabs = computed(() => [
      { id: 'settings', label: t('general') },
      { id: 'logs', label: t('accessLogs') },
    ]);

    const disableFileUpload = ref(false);
    const disableSaveConversation = ref(false);
    const disableAllPlugins = ref(false);
    const disableWorkDir = ref(false);
    const ipAccessMode = ref('local');
    const toastMsg = ref('');
    const showDeleteDialog = ref(false);
    const userList = ref<any[]>([]);
    const selectedUserToken = ref('');
    const logs = ref<string[]>([]);

    const ipOptions = [
      { value: 'local', label: t('local') },
      { value: 'lan', label: t('lan') },
      { value: 'open', label: t('open') },
    ];

    const modeLabel = computed(() => {
      const opt = ipOptions.find(o => o.value === ipAccessMode.value);
      return opt ? opt.label : ipAccessMode.value;
    });

    let toastTimer: any = null;
    function showToast(msg: string) {
      const el = document.getElementById('ctrlToast');
      if (!el) return;
      el.textContent = msg;
      el.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
    }

    let syncTimer: any = null;
    function debouncedSync() {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        const result = await api.setState({
          disableFileUpload: disableFileUpload.value,
          disableSaveConversation: disableSaveConversation.value,
          disableAllPlugins: disableAllPlugins.value,
          disableWorkDir: disableWorkDir.value,
          ipAccessMode: ipAccessMode.value,
        });
        if (result?.success) showToast(t('mode') + ' ' + t('on'));
      }, 300);
    }

    async function loadState() {
      const state = await api.getState();
      if (state) {
        disableFileUpload.value = !!state.disableFileUpload;
        disableSaveConversation.value = !!state.disableSaveConversation;
        disableAllPlugins.value = !!state.disableAllPlugins;
        disableWorkDir.value = !!state.disableWorkDir;
        if (state.ipAccessMode) ipAccessMode.value = state.ipAccessMode;
      }
    }

    function setUpload(v: boolean) { disableFileUpload.value = v; debouncedSync(); }
    function setSave(v: boolean) { disableSaveConversation.value = v; debouncedSync(); }
    function setPlugins(v: boolean) { disableAllPlugins.value = v; debouncedSync(); }
    function setWorkdir(v: boolean) { disableWorkDir.value = v; debouncedSync(); }
    function setIPMode(v: string) { ipAccessMode.value = v; debouncedSync(); }

    async function openDeleteDialog() {
      showDeleteDialog.value = true;
      selectedUserToken.value = '';
      const data = await api.getUsers();
      userList.value = data.users || [];
    }

    async function confirmDeleteUser() {
      if (!selectedUserToken.value) return;
      const result = await api.deleteUser(selectedUserToken.value);
      if (result?.success) {
        showToast(t('deleteUser') + ' ✓');
        showDeleteDialog.value = false;
        userList.value = userList.value.filter((u: any) => u.token !== selectedUserToken.value);
      } else {
        showToast(t('deleteUser') + ' ✗');
      }
    }

    async function refreshLogs() {
      const data = await api.getLogs();
      logs.value = data.logs || [];
      showToast(t('refresh') + ' ✓');
    }

    onMounted(() => {
      loadState();
      refreshLogs();
    });

    return {
      t, langLabel, toggleLang, toggleTheme, activeTab, tabs,
      disableFileUpload, disableSaveConversation, disableAllPlugins, disableWorkDir, ipAccessMode,
      setUpload, setSave, setPlugins, setWorkdir, setIPMode,
      showDeleteDialog, userList, selectedUserToken, openDeleteDialog, confirmDeleteUser,
      ipOptions, modeLabel, logs, refreshLogs,
      toastMsg,
    };
  },
};

createApp(CtrlApp).mount('#ctrl-app');
