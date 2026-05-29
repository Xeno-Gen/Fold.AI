import { createApp, ref, onMounted } from 'vue';

const api = {
  async getState() {
    const r = await fetch('/api/state');
    return r.ok ? r.json() : null;
  },
  async setState(data: any) {
    const r = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.ok ? r.json() : null;
  },
  async getUsers() {
    const r = await fetch('/api/users');
    return r.ok ? r.json() : { users: [] };
  },
  async deleteUser(token: string) {
    const r = await fetch('/api/user/' + encodeURIComponent(token), { method: 'DELETE' });
    return r.ok ? r.json() : null;
  },
};

const CtrlApp = {
  name: 'CtrlPanel',
  template: `
  <div class="ctrl-panel">
    <div class="ctrl-panel-header">
      <h2>控制面板</h2>
    </div>
    <div class="ctrl-panel-body">

      <div class="settings-item">
        <div class="settings-item-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <div><div>关闭文件上传</div><div class="desc">禁止用户上传文件到服务器</div></div>
        </div>
        <div class="tool-chain-toggle">
          <button class="tool-chain-option" :class="{ active: !disableFileUpload }" @click="setUpload(false)">关闭</button>
          <button class="tool-chain-option" :class="{ active: disableFileUpload }" @click="setUpload(true)">开启</button>
        </div>
      </div>

      <div class="settings-item">
        <div class="settings-item-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <div><div>不保存用户对话</div><div class="desc">不在 data 文件夹内保存对话记录</div></div>
        </div>
        <div class="tool-chain-toggle">
          <button class="tool-chain-option" :class="{ active: !disableSaveConversation }" @click="setSave(false)">关闭</button>
          <button class="tool-chain-option" :class="{ active: disableSaveConversation }" @click="setSave(true)">开启</button>
        </div>
      </div>

      <div class="settings-item">
        <div class="settings-item-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>
          <div><div>禁用所有插件</div><div class="desc">前端插件关闭，后端也不执行插件</div></div>
        </div>
        <div class="tool-chain-toggle">
          <button class="tool-chain-option" :class="{ active: !disableAllPlugins }" @click="setPlugins(false)">关闭</button>
          <button class="tool-chain-option" :class="{ active: disableAllPlugins }" @click="setPlugins(true)">开启</button>
        </div>
      </div>

      <div class="settings-item" style="border-top:1px solid #f0efeb;margin-top:4px;padding-top:14px;">
        <div class="settings-item-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <div><div>删除用户</div><div class="desc">删除指定用户的全部数据</div></div>
        </div>
        <button class="action-btn danger" @click="openDeleteDialog">删除</button>
      </div>

    </div>
  </div>

  <div class="snackbar" :style="{ opacity: snackbarVisible ? 1 : 0 }">{{ snackbarMsg }}</div>

  <div class="dialog-overlay" v-if="showDeleteDialog" @click.self="showDeleteDialog = false">
    <div class="dialog-card">
      <h3>删除用户数据</h3>
      <p style="font-size:13px;color:#666;margin-bottom:12px;">选择要删除的用户，此操作不可恢复。</p>
      <select v-model="selectedUserToken" v-if="userList.length > 0">
        <option value="" disabled>请选择用户</option>
        <option v-for="u in userList" :key="u.token" :value="u.token">{{ u.label }}</option>
      </select>
      <p v-else style="font-size:13px;color:#999;margin-bottom:12px;">暂无用户数据</p>
      <div class="dialog-actions">
        <button class="cancel" @click="showDeleteDialog = false">取消</button>
        <button class="confirm-delete" :disabled="!selectedUserToken" @click="confirmDeleteUser">确认删除</button>
      </div>
    </div>
  </div>
  `,
  setup() {
    const disableFileUpload = ref(false);
    const disableSaveConversation = ref(false);
    const disableAllPlugins = ref(false);
    const snackbarMsg = ref('');
    const snackbarVisible = ref(false);
    const showDeleteDialog = ref(false);
    const userList = ref<any[]>([]);
    const selectedUserToken = ref('');

    let snackbarTimer: any = null;

    function showSnackbar(msg: string) {
      snackbarMsg.value = msg;
      snackbarVisible.value = true;
      if (snackbarTimer) clearTimeout(snackbarTimer);
      snackbarTimer = setTimeout(() => { snackbarVisible.value = false; }, 2500);
    }

    let syncTimer: any = null;
    function debouncedSync() {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        const result = await api.setState({
          disableFileUpload: disableFileUpload.value,
          disableSaveConversation: disableSaveConversation.value,
          disableAllPlugins: disableAllPlugins.value,
        });
        if (result?.success) showSnackbar('状态已更新');
      }, 300);
    }

    async function loadState() {
      const state = await api.getState();
      if (state) {
        disableFileUpload.value = !!state.disableFileUpload;
        disableSaveConversation.value = !!state.disableSaveConversation;
        disableAllPlugins.value = !!state.disableAllPlugins;
      }
    }

    function setUpload(val: boolean) { disableFileUpload.value = val; debouncedSync(); }
    function setSave(val: boolean) { disableSaveConversation.value = val; debouncedSync(); }
    function setPlugins(val: boolean) { disableAllPlugins.value = val; debouncedSync(); }

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
        showSnackbar('用户已删除');
        showDeleteDialog.value = false;
        userList.value = userList.value.filter((u: any) => u.token !== selectedUserToken.value);
      } else {
        showSnackbar('删除失败');
      }
    }

    onMounted(() => { loadState(); });

    return {
      disableFileUpload, disableSaveConversation, disableAllPlugins,
      snackbarMsg, snackbarVisible,
      showDeleteDialog, userList, selectedUserToken,
      setUpload, setSave, setPlugins,
      openDeleteDialog, confirmDeleteUser,
    };
  },
};

createApp(CtrlApp).mount('#ctrl-app');
