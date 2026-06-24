// Global types for Fold.AI frontend JS-to-TS conversion
// These are shared across all non-module scripts (intro.js, chat.js, slash.js, debug.js)

// --- Core state variables (defined in intro.js) ---
declare var chats: any[][];
declare var chatTitles: string[];
declare var chatTokens: string[];
declare var currentChat: number;
declare var chatBranches: any;
declare var streaming: boolean;
declare var isUserScrolledAway: boolean;
declare var currentAbortController: AbortController | null;
declare var currentRequestId: string | null;
declare var currentProvider: string | null;
declare var currentChatFormat: string;
declare var currentModel: string;
declare var currentParams: Record<string, any>;
declare var providers: any[];
declare var availableModels: string[];
declare var allModels: string[];
declare var isChatActive: boolean;
declare var deepThinkEnabled: boolean;
declare var currentThinkMode: string;
declare var cothinkEnabled: boolean;
declare var commandExecEnabled: boolean;
declare var sandboxEnabled: boolean;
declare var commandConfirmEnabled: boolean;
declare var compressOldExecutions: boolean;
declare var memoryEnabled: boolean;
declare var agentEnabled: boolean;
declare var agentMaxIterations: number;
declare var currentTheme: string;
declare var streamEnabled: boolean;
declare var askEnabled: boolean;
declare var askAutoShow: boolean;
declare var cachedMemories: any[];
declare var activeFiles: { initial: any[]; chat: any[] };
declare var autoCollapseThink: boolean;
declare var thinkCollapseDuring: string;
declare var streamAnimation: string;
declare var includeReasoning: boolean;
declare var chatFontSize: number;
declare var lastScrollTop: number;
declare var baseSystemPrompt: string;
declare var baseSystemTokenCount: number;
declare var defaultWorkDir: string;
declare var pluginPrompts: Record<string, string>;
declare var pureMode: boolean;
declare var promptLang: string;
declare var maxContextTokens: number;
declare var cachedThinkPrompt: string;
declare var configPrompts: any;
declare var pendingNewChatIndex: any;

// --- Window extensions ---
interface Window {
  __renderDebugTab?: (container: HTMLElement) => void;
  CommandExecutionPlugin?: {
    workingDirectory?: string;
    confirmCommand?: (shell: string, cmd: string) => Promise<boolean>;
    saveSettings?: () => void;
    [key: string]: any;
  };
  MemoryPlugin?: {
    save?: (key: string, content: string) => Promise<any>;
    get?: (key: string) => Promise<any>;
    remove?: (key: string) => Promise<any>;
    list?: () => Promise<any>;
    enabled?: boolean;
    setEnabled?: (v: boolean) => void;
    [key: string]: any;
  };
  showToast?: (msg: string) => void;
  t?: (key: string) => string;
  __i18n?: any;
  __I18N_ZH__?: Record<string, string>;
  __I18N_EN__?: Record<string, string>;
  __CHAT_DATA__?: any;
  __CHAT_TOKEN__?: string;
}
