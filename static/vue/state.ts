import { ref, reactive, computed } from 'vue';

// === Chat State ===
export const chats = ref<any[][]>([]);
export const chatTitles = ref<string[]>([]);
export const chatTokens = ref<string[]>([]);
export const currentChat = ref(-1);
export const chatBranches = ref<any>({});
export const pinnedChats = ref<Set<number>>(new Set());
export const pendingNewChatIndex = ref<any>(null);
export const isChatActive = ref(false);
export const streaming = ref(false);
export const isUserScrolledAway = ref(false);
export const currentAbortController = ref<AbortController | null>(null);
export const currentRequestId = ref<string | null>(null);
export const lastScrollTop = ref(0);
export const cachedMemories = ref<any[]>([]);

// === Model / Provider ===
export const currentProvider = ref<string | null>(null);
export const currentChatFormat = ref('OpenAI');
export const currentModel = ref('deepseek-v4-flash');
export const providers = ref<any[]>([]);
export const availableModels = ref<string[]>([]);
export const allModels = ref<string[]>([]);
export const currentParams = reactive({
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: 2048,
  seed: null as number | null,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_k: null as number | null,
  systemPrompt: '',
});
export const customPort = ref(8080);
export const pureMode = ref(false);
export const promptLang = ref('zh');
export const baseSystemPrompt = ref('');
export const baseSystemTokenCount = ref(0);
export const pluginPrompts = ref<any>({});
export const maxContextTokens = ref(1000000);

// === Settings ===
export const currentTheme = ref<'light' | 'dark' | 'system'>('system');
export const deepThinkEnabled = ref(false);
export const currentThinkMode = ref('fast');
export const cothinkEnabled = ref(true);
export const autoCollapseThink = ref(true);
export const thinkCollapseDuring = ref('off');
export const streamAnimation = ref('none');
export const includeReasoning = ref(true);
export const chatFontSize = ref(15);
export const streamEnabled = ref(true);

// === Plugin Toggles ===
export const commandExecEnabled = ref(false);
export const commandConfirmEnabled = ref(true);
export const sandboxEnabled = ref(true);
export const compressOldExecutions = ref(true);
export const collapsePluginOutput = ref(true);
export const memoryEnabled = ref(true);
export const agentEnabled = ref(false);
export const agentMaxIterations = ref(10);
export const askEnabled = ref(true);
export const askAutoShow = ref(true);

// === Files ===
export const activeFiles = reactive<{ initial: any[]; chat: any[] }>({ initial: [], chat: [] });
export const filesCurrentDir = ref('/');
export const defaultWorkDir = ref('');

// === UI State ===
export const showSettings = ref(false);
export const showSettingsModal = ref(false);
export const showFileBrowser = ref(false);
export const showFileViewer = ref(false);
export const fileViewerData = reactive({ name: '', content: '' });
export const showDeepThinkPopup = ref(false);
export const showSlashPopup = ref(false);
export const showAskPopup = ref(false);
export const showDrawer = ref(false);
export const activeSettingsTab = ref('preferences');

// === Derived ===
export const currentMessages = computed(() => chats.value[currentChat.value] || []);
export const currentChatTitle = computed(() => chatTitles.value[currentChat.value] || '');
export const currentChatToken = computed(() => chatTokens.value[currentChat.value] || '');
export const currentChatBranch = computed(() => chatBranches.value[currentChat.value] || {});

// === Actions ===
export function resetState() {
  chats.value = [];
  chatTitles.value = [];
  chatTokens.value = [];
  currentChat.value = -1;
  isChatActive.value = false;
  streaming.value = false;
  activeFiles.initial = [];
  activeFiles.chat = [];
  showSettings.value = false;
  showSettingsModal.value = false;
  showFileBrowser.value = false;
  showFileViewer.value = false;
  showDeepThinkPopup.value = false;
  showDrawer.value = false;
}
