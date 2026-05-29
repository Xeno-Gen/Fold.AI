import { createApp, ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

// ========== 后端 API ==========
const API = {
    async browse(dir?: string, wd?: string) {
        const p = new URLSearchParams();
        if (dir) p.set('dir', dir);
        if (wd) p.set('workingDirectory', wd);
        const r = await fetch('/api/files/browse?' + p.toString());
        return r.ok ? r.json() : { items: [] };
    },
    async read(file: string, wd?: string) {
        const p = new URLSearchParams({ file });
        if (wd) p.set('workingDirectory', wd);
        const r = await fetch('/api/files/read?' + p.toString());
        return r.ok ? r.json() : null;
    },
    async del(file: string, wd?: string) {
        const p = new URLSearchParams({ file });
        if (wd) p.set('workingDirectory', wd);
        const r = await fetch('/api/files/delete?' + p.toString(), { method: 'DELETE' });
        return r.ok;
    },
    async rename(file: string, newName: string, wd?: string) {
        const p = new URLSearchParams();
        if (wd) p.set('workingDirectory', wd);
        const r = await fetch('/api/files/rename?' + p.toString(), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file, newName })
        });
        return r.ok;
    }
};

// ========== 文件浏览器 ==========
const FileBrowserComp = {
    name: 'FileBrowser',
    template: `
    <div class="vue-fb">
        <div class="vue-fb-toolbar">
            <button class="vue-fb-back" @click="goBack" :disabled="!parentDir">←</button>
            <span class="vue-fb-path">{{ path }}</span>
            <button class="vue-fb-btn" @click="load">⟳</button>
        </div>
        <div class="vue-fb-grid" @contextmenu.prevent="closeCtx" @click="closeCtx">
            <div v-for="item in items" :key="item.name" class="vue-fb-item"
                :class="{ selected: sel === item.name }"
                @click="sel = item.name"
                @dblclick="open(item)"
                @contextmenu.prevent.stop="showCtx($event, item)">
                <div class="vue-fb-icon">
                    <img v-if="isImage(item.name) && thumbs[item.name]" :src="thumbs[item.name]" class="vue-fb-thumb">
                    <span v-else-if="item.isDir" class="vue-fb-ico">📁</span>
                    <span v-else class="vue-fb-ico">📄</span>
                </div>
                <div class="vue-fb-lbl">{{ item.name }}</div>
            </div>
            <div v-if="!loading && items.length === 0" class="vue-fb-empty">空目录</div>
            <div v-if="loading" class="vue-fb-empty">加载中...</div>
        </div>
        <div v-if="ctx.show" class="vue-fb-ctx" :style="{ left: ctx.x+'px', top: ctx.y+'px' }">
            <div class="vue-fb-ctx-i" @click="doView">查看</div>
            <div class="vue-fb-ctx-i" @click="doRename">重命名</div>
            <div class="vue-fb-ctx-i" @click="doDownload">下载</div>
            <div class="vue-fb-ctx-div"></div>
            <div class="vue-fb-ctx-i vue-fb-ctx-danger" @click="doDelete">删除</div>
        </div>
        <div v-if="rename.active" class="vue-fb-overlay" @click.self="rename.active=false">
            <div class="vue-fb-dlg">
                <div class="vue-fb-dlg-title">重命名</div>
                <input v-model="rename.name" @keyup.enter="confirmRename" @keyup.escape="rename.active=false" class="vue-fb-input">
                <div class="vue-fb-dlg-acts">
                    <button class="vue-fb-btn-p" @click="confirmRename">确定</button>
                    <button class="vue-fb-btn-s" @click="rename.active=false">取消</button>
                </div>
            </div>
        </div>
    </div>`,
    setup() {
        const path = ref('/');
        const parentDir = ref('');
        const items = ref<any[]>([]);
        const sel = ref('');
        const loading = ref(false);
        const ctx = reactive({ show: false, x: 0, y: 0, item: null as any });
        const rename = reactive({ active: false, name: '', item: null as any });
        const thumbs = reactive<Record<string, string>>({});
        let wd = '';

        function getWd() {
            const g = window as any;
            return g.defaultWorkDir || (g.CommandExecutionPlugin?.workingDirectory) || 'cwd';
        }

        async function load(dir?: string) {
            loading.value = true;
            wd = getWd();
            try {
                console.log('[VueFB] browsing dir:', dir, 'wd:', wd);
                const data = await API.browse(dir, wd);
                console.log('[VueFB] data:', JSON.stringify(data).substring(0, 300));
                path.value = data.path || '/';
                items.value = data.items || [];
                parentDir.value = path.value === '/' ? '' : path.value.split('/').slice(0, -1).join('/') || '/';
                sel.value = '';
                // Load image thumbnails
                for (const item of items.value) {
                    if (!item.isDir && isImage(item.name)) {
                        const fpath = (path.value === '/' ? '' : path.value) + '/' + item.name;
                        API.read(fpath, wd).then(d => { if (d?.image) thumbs[item.name] = d.image; });
                    }
                }
            } catch (e) { console.error('[FB]', e); }
            loading.value = false;
        }

        function isImage(name: string) { return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name); }

        function goBack() { if (parentDir.value !== undefined) load(parentDir.value); }

        function open(item: any) {
            if (item.isDir) { load((path.value === '/' ? '' : path.value) + '/' + item.name); }
            else { doViewItem(item); }
        }

        async function doViewItem(item: any) {
            const fpath = (path.value === '/' ? '' : path.value) + '/' + item.name;
            const data = await API.read(fpath, wd);
            if (data && typeof (window as any).openFileViewer === 'function') {
                (window as any).openFileViewer(data.name, data.content || data.image || '');
            }
        }

        function showCtx(e: MouseEvent, item: any) {
            sel.value = item.name; ctx.item = item; ctx.x = e.clientX; ctx.y = e.clientY; ctx.show = true;
        }
        function closeCtx() { ctx.show = false; }

        function doView() { if (ctx.item) doViewItem(ctx.item); closeCtx(); }
        function doDownload() {
            if (!ctx.item) return;
            const fpath = (path.value === '/' ? '' : path.value) + '/' + ctx.item.name;
            const a = document.createElement('a'); a.href = '/cwd' + fpath; a.download = ctx.item.name; a.click();
            closeCtx();
        }
        function doRename() {
            if (!ctx.item) return;
            rename.item = ctx.item; rename.name = ctx.item.name; rename.active = true;
            closeCtx();
        }
        async function confirmRename() {
            if (!rename.item || !rename.name) return;
            const fpath = (path.value === '/' ? '' : path.value) + '/' + rename.item.name;
            const ok = await API.rename(fpath, rename.name, wd);
            rename.active = false;
            if (ok) load(path.value === '/' ? undefined : path.value);
        }
        async function doDelete() {
            if (!ctx.item || !confirm('确定删除 "' + ctx.item.name + '" 吗？')) return;
            const fpath = (path.value === '/' ? '' : path.value) + '/' + ctx.item.name;
            const ok = await API.del(fpath, wd);
            closeCtx();
            if (ok) load(path.value === '/' ? undefined : path.value);
        }

        onMounted(() => load());
        return { path, parentDir, items, sel, loading, ctx, rename, thumbs,
            load, goBack, open, isImage, showCtx, closeCtx, doView, doDownload, doRename, confirmRename, doDelete };
    }
};

// ========== 历史对话列表 ==========
const HistoryListComp = {
    name: 'HistoryList',
    template: `
    <div class="vue-hl">
        <div v-for="(c, i) in list" :key="c.idx" class="vue-hl-item"
            :class="{ active: c.idx === cur }" @click="sw(c.idx)">
            <div class="vue-hl-t">{{ c.title }}</div>
            <div class="vue-hl-p">{{ c.prev }}</div>
        </div>
        <div v-if="list.length === 0" class="vue-hl-empty">暂无对话</div>
    </div>`,
    setup() {
        const list = ref<any[]>([]);
        const cur = ref(0);
        let timer: any;

        function refresh() {
            const g = window as any;
            if (!g.chats) return;
            const items: any[] = [];
            for (let i = 0; i < g.chats.length; i++) {
                const msgs = g.chats[i] || [];
                let last = 0, prev = '';
                for (let j = msgs.length - 1; j >= 0; j--) {
                    const m = msgs[j];
                    if (m?.content) {
                        if (!prev) prev = m.content.substring(0, 80);
                        if (!last) last = j;
                    }
                }
                items.push({ idx: i, title: g.chatTitles?.[i] || '新对话', prev: prev || '', sort: last || i });
            }
            items.sort((a, b) => b.sort - a.sort);
            list.value = items;
            cur.value = g.currentChat ?? 0;
        }

        function sw(idx: number) {
            const g = window as any;
            if (typeof g.switchChat === 'function') g.switchChat(idx);
        }

        onMounted(() => { refresh(); timer = setInterval(refresh, 1500); });
        onUnmounted(() => clearInterval(timer));
        return { list, cur, sw };
    }
};

// ========== 启动 Vue 应用 ==========
function mountFB() {
    let el = document.getElementById('vue-fb-container');
    if (!el) {
        el = document.createElement('div');
        el.id = 'vue-fb-container';
        el.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:hidden;';
        const panel = document.getElementById('filesPanel');
        const body = document.getElementById('filesPanelBody');
        if (panel) panel.insertBefore(el, body);
    }
    if (el.hasAttribute('data-vue-fb')) return;
    console.log('[Vue] Mounting file browser...');
    el.setAttribute('data-vue-fb', '1');
    el.style.display = 'flex';
    const old = document.getElementById('filesPanelBody');
    if (old) old.style.display = 'none';
    createApp(FileBrowserComp).mount(el);
    console.log('[Vue] File browser mounted');
}

function mountHL() {
    const parent = document.getElementById('chatHistoryList')?.parentElement;
    if (!parent || parent.hasAttribute('data-vue-hl')) return;
    console.log('[Vue] Mounting history list...');
    parent.setAttribute('data-vue-hl', '1');
    const old = document.getElementById('chatHistoryList');
    if (old) old.style.display = 'none';
    const el = document.createElement('div');
    parent.appendChild(el);
    createApp(HistoryListComp).mount(el);
    console.log('[Vue] History list mounted');
}

export function initVueApps() {
    console.log('[Vue] Initializing...');
    mountHL();
    const panel = document.getElementById('filesPanel');
    if (panel && panel.classList.contains('active')) mountFB();
    if (panel) {
        new MutationObserver(() => {
            if (panel.classList.contains('active')) mountFB();
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
}

// Auto init
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initVueApps());
else setTimeout(initVueApps, 300);
