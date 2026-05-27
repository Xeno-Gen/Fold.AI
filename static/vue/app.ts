import { createApp, ref, reactive, computed, onMounted, onUnmounted } from 'vue';

// ========== 文件浏览器组件 ==========
const FileBrowser = {
    name: 'FileBrowser',
    template: `
    <div class="vue-file-browser">
        <div class="vue-fb-toolbar">
            <span class="vue-fb-path">{{ currentPath }}</span>
            <button class="vue-fb-refresh" @click="refresh">⟳</button>
        </div>
        <div class="vue-fb-grid" @contextmenu.prevent="closeContext">
            <div v-for="item in items" :key="item.name"
                class="vue-fb-item"
                :class="{ 'vue-fb-selected': selected === item.name }"
                @click="select(item.name)"
                @dblclick="openItem(item)"
                @contextmenu.prevent.stop="showContext($event, item)">
                <div class="vue-fb-icon">
                    <span v-if="item.isDir">📁</span>
                    <span v-else-if="isImage(item.name)">🖼</span>
                    <span v-else>📄</span>
                </div>
                <div class="vue-fb-name">{{ item.name }}</div>
            </div>
            <div v-if="items.length === 0" class="vue-fb-empty">空目录</div>
        </div>
        <!-- 右键菜单 -->
        <div v-if="contextMenu.visible" class="vue-fb-context"
            :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
            <div class="vue-fb-context-item" @click="viewItem">查看</div>
            <div class="vue-fb-context-item" @click="renameItem">重命名</div>
            <div class="vue-fb-context-item" @click="downloadItem">下载</div>
            <div class="vue-fb-context-divider"></div>
            <div class="vue-fb-context-item vue-fb-context-danger" @click="deleteItem">删除</div>
        </div>
        <!-- 重命名输入框 -->
        <div v-if="renaming" class="vue-fb-rename-overlay" @click.self="renaming = ''">
            <div class="vue-fb-rename-dialog">
                <div>重命名</div>
                <input v-model="renameNew" @keyup.enter="doRename" @keyup.escape="renaming = ''">
                <div class="vue-fb-rename-actions">
                    <button @click="doRename">确定</button>
                    <button @click="renaming = ''">取消</button>
                </div>
            </div>
        </div>
    </div>`,
    setup() {
        const currentPath = ref('/');
        const items = ref<any[]>([]);
        const selected = ref('');
        const renaming = ref('');
        const renameNew = ref('');
        const contextMenu = reactive({ visible: false, x: 0, y: 0, item: null as any });

        async function loadDir(dir?: string) {
            const params = new URLSearchParams();
            if (dir) params.set('dir', dir);
            const wd = (window as any).defaultWorkDir;
            if (wd) params.set('workingDirectory', wd);
            try {
                const res = await fetch('/api/files/browse?' + params.toString());
                if (res.ok) {
                    const data = await res.json();
                    currentPath.value = data.path || '/';
                    items.value = data.items || [];
                }
            } catch (e) { console.error('[VueFB] browse error:', e); }
        }

        function refresh() { loadDir(currentPath.value === '/' ? undefined : currentPath.value); }

        function select(name: string) { selected.value = name; }

        function openItem(item: any) {
            if (item.isDir) {
                const path = currentPath.value === '/' ? '/' + item.name : currentPath.value + '/' + item.name;
                loadDir(path);
            } else {
                viewFile(item.name);
            }
        }

        async function viewFile(name: string) {
            const params = new URLSearchParams({ file: (currentPath.value === '/' ? '' : currentPath.value) + '/' + name });
            const wd = (window as any).defaultWorkDir;
            if (wd) params.set('workingDirectory', wd);
            try {
                const res = await fetch('/api/files/read?' + params.toString());
                if (res.ok) {
                    const data = await res.json();
                    if (typeof (window as any).openFileViewer === 'function') {
                        (window as any).openFileViewer(data.name, data.content || '');
                    }
                }
            } catch (e) { console.error('[VueFB] read error:', e); }
        }

        function isImage(name: string) {
            return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name);
        }

        function showContext(e: MouseEvent, item: any) {
            selected.value = item.name;
            contextMenu.item = item;
            contextMenu.x = e.clientX;
            contextMenu.y = e.clientY;
            contextMenu.visible = true;
        }

        function closeContext() { contextMenu.visible = false; }

        function viewItem() {
            if (contextMenu.item) viewFile(contextMenu.item.name);
            closeContext();
        }

        function downloadItem() {
            if (contextMenu.item) {
                const path = (currentPath.value === '/' ? '' : currentPath.value) + '/' + contextMenu.item.name;
                const wd = (window as any).defaultWorkDir;
                const url = '/cwd' + path;
                const a = document.createElement('a');
                a.href = url;
                a.download = contextMenu.item.name;
                a.click();
            }
            closeContext();
        }

        function renameItem() {
            if (contextMenu.item) {
                renameNew.value = contextMenu.item.name;
                renaming.value = contextMenu.item.name;
            }
            closeContext();
        }

        async function doRename() {
            if (!renaming.value || !renameNew.value) { renaming.value = ''; return; }
            // Use existing file rename logic if available
            closeContext();
            renaming.value = '';
            refresh();
        }

        async function deleteItem() {
            if (!contextMenu.item) return;
            if (!confirm('确定要删除 "' + contextMenu.item.name + '" 吗？')) return;
            // Use existing delete logic
            closeContext();
            refresh();
        }

        function onGlobalClick() { closeContext(); }

        onMounted(() => {
            loadDir();
            document.addEventListener('click', onGlobalClick);
        });
        onUnmounted(() => document.removeEventListener('click', onGlobalClick));

        return { currentPath, items, selected, contextMenu, renaming, renameNew,
            refresh, select, openItem, isImage, showContext, closeContext,
            viewItem, downloadItem, renameItem, doRename, deleteItem };
    }
};

// ========== 历史对话列表组件 ==========
const HistoryList = {
    name: 'HistoryList',
    template: `
    <div class="vue-history-list">
        <div v-for="(chat, idx) in sortedChats" :key="idx"
            class="vue-history-item"
            :class="{ 'vue-history-active': idx === currentIdx }"
            @click="switchChat(idx)">
            <div class="vue-history-title">{{ chat.title || '新对话' }}</div>
            <div class="vue-history-preview">{{ chat.preview }}</div>
            <div class="vue-history-time">{{ chat.time }}</div>
        </div>
        <div v-if="sortedChats.length === 0" class="vue-history-empty">暂无对话</div>
    </div>`,
    setup() {
        const chats = ref<any[]>([]);
        const currentIdx = ref(0);
        let pollTimer: any = null;

        function update() {
            const g = window as any;
            if (g.chats && g.chatTitles && g.chatTokens) {
                const now = Date.now();
                const list: any[] = [];
                for (let i = 0; i < g.chats.length; i++) {
                    const msgs = g.chats[i] || [];
                    // Find last activity time (from message timestamps or indices)
                    let lastActive = 0;
                    let preview = '';
                    for (let j = msgs.length - 1; j >= 0; j--) {
                        const m = msgs[j];
                        if (m.content) {
                            if (!preview) preview = m.content.substring(0, 60);
                            if (!lastActive) lastActive = j;
                        }
                    }
                    list.push({
                        index: i,
                        title: g.chatTitles[i] || '新对话',
                        preview: preview || '空对话',
                        time: lastActive ? lastActive.toString() : '0',
                        sortKey: lastActive || i
                    });
                }
                // Sort by last activity (descending)
                list.sort((a, b) => b.sortKey - a.sortKey);
                chats.value = list;
                currentIdx.value = g.currentChat !== undefined ? g.currentChat : 0;
            }
        }

        function switchChat(idx: number) {
            const realIdx = chats.value[idx]?.index;
            if (realIdx !== undefined) {
                const g = window as any;
                if (typeof g.switchChat === 'function') {
                    g.switchChat(realIdx);
                }
            }
        }

        onMounted(() => {
            update();
            pollTimer = setInterval(update, 2000);
        });
        onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

        const sortedChats = computed(() => chats.value);

        return { sortedChats, currentIdx, switchChat };
    }
};

// ========== 启动 ==========
export function initVueApps() {
    // 文件浏览器
    const fbEl = document.getElementById('vue-file-browser');
    if (fbEl) {
        const fbApp = createApp(FileBrowser);
        fbApp.mount(fbEl);
    }

    // 历史对话列表
    const hlEl = document.getElementById('vue-history-list');
    if (hlEl) {
        const hlApp = createApp(HistoryList);
        hlApp.mount(hlEl);
    }
}

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initVueApps());
} else {
    initVueApps();
}
