# Fold.AI Frontend

### 入口页面

| 文件 | 用途 |
|---|---|
| `intro.html` | 主页面 SPA — 完整聊天界面，包含侧边栏、设置面板、文件浏览器、文件查看器 |
| `init.html` | 初始化向导 — 三步设置（语言 → 主题/字体 → 提供商/API Key） |

### 核心 JS 文件（按加载顺序）

| 文件 | 行数 | 用途 |
|---|---|---|
| `/plugins/index.js` | 插件前端 | CommandExecution / Memory 等插件的浏览器端代码 |
| `lang/zh.js` | ~300 | 中文语言包（`window.__I18N_ZH__`） |
| `lang/en.js` | ~300 | 英文语言包（`window.__I18N_EN__`） |
| `lang/i18n.js` | 74 | i18n 引擎：语言切换、`data-i18n` 属性渲染 |
| `intro.js` | ~5000+ | **前端主控** — 核心状态管理、UI 构建、设置面板、文件浏览器、数据持久化 |
| `chat.js` | 821 | **聊天引擎** — 消息发送/流式接收、Agent 循环、工具调用（命令/记忆）处理、视频抽帧 |
| `slash.js` | 493 | **斜杠命令系统** — `/help`, `/context`, `/clear`, `/del context`, `/setctx`, `/remem` |
| `debug.js` | 41 | 调试/版本信息渲染面板 |

### CSS

| 文件 | 行数 | 用途 |
|---|---|---|
| `css/intro.css` | 7 | 字体变量声明 |
| `css/style.css` | 2082 | **完整样式** — 含 2000+ 行包括侧边栏、消息气泡、深度思考块、设置面板、命令执行块、暗色模式、文件查看器、Ask 弹窗、插件块等所有组件样式 |

### Vue 3 应用 (`vue/`)

| 文件 | 用途 |
|---|---|
| `app.ts` | Vue App 入口 — 组件注册、状态绑定、文件操作、配置持久化 |
| `template.ts` | Vue 模板 — 完整 UI 结构（sidebars, chat, settings, drawer, modal） |
| `state.ts` | Vue 响应式状态 — 聊天、模型、设置、插件、UI 状态 |
| `composables/useChat.ts` | 聊天逻辑封装（与原生 JS 版本平行） |
| `composables/useStreaming.ts` | SSE 流式处理 |
| `composables/useHistory.ts` | 后端对话 CRUD |
| `composables/useSettings.ts` | 设置自动持久化 |
| `composables/useI18n.ts` | Vue 层国际化桥接 |
| `composables/useTheme.ts` | 主题切换 + 系统偏好监听 |
| `components/message-bubble.ts` | 消息气泡组件 |
| `components/deep-think-popup.ts` | 深度思考模式选择弹出框 |
| `components/model-picker.ts` | 模型选择下拉框 |

### 控制面板 (`ctrl/`)

| 文件 | 用途 |
|---|---|
| `index.html` | 控制面板页面 |
| `app.ts` | Vue 3 控制面板应用 — 上传/对话保存/插件的全局开关、用户管理 |

### 资源

| 文件 | 用途 |
|---|---|
| `img/bilibili.png` | 站外图标资源 |
| `lang/` | 国际化语言包 |

## 双渲染系统协作

```
原生 JS (intro.js) ←→ 全局状态 (window 变量) ←→ Vue 3 (vue/app.ts)
      ↓                        ↓                        ↓
  DOM 操作                chats[],                    Vue reactive
  chat flow               currentModel,               computed (currentMessages)
  tool calls               streaming,                  模板渲染
                           providers[],
                           settings
```

**数据流动：**
1. `intro.js` 定义所有全局状态（`chats`, `currentModel`, `streaming` 等）
2. Vue 层通过 `window.t()` 获取 i18n，通过 window 共享数据
3. 原生 JS 负责核心聊天流程、流式处理、工具调用
4. Vue 负责设置面板、侧边栏、模态框等辅助 UI

## i18n 系统

- 语言包挂载在 `window.__I18N_ZH__` / `window.__I18N_EN__`（约 300 键）
- 引擎 `lang/i18n.js` 提供 `window.t(key)` 函数
- HTML 元素支持 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 自动翻译
- 语言切换触发 `langchange` 自定义事件
- 偏好持久化到 `localStorage.fold_lang`

## 插件前端集成

插件通过 `/plugins/` 路由加载其 `index.js`，注册到 `window` 全局：
- **CommandExecution**: `window.CommandExecutionPlugin`（命令确认弹窗、执行块渲染）
- **Memory**: `window.MemoryPlugin`（记忆 CRUD API）

前端通过 `intro.js` 中定义的标记解析引擎，从 AI 回复中提取 `<power>`, `<cmd>`, `<mem:key>` 等标记，调用对应插件 API。

## 斜杠命令

| 命令 | 用途 |
|---|---|
| `/help` | 显示所有可用命令 |
| `/context` | 显示上下文占用统计（token 估算 + 实际 API usage） |
| `/clear` | 清空当前对话 |
| `/del context` | 删除除当前对话外的所有对话 |
| `/setctx 32k` | 设置最大上下文容量 |
| `/remem` | 保存对话内容为记忆 |
