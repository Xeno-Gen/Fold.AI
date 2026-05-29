import { ref } from 'vue';

declare global {
  interface Window {
    t: (key: string) => string;
    __i18n: any;
    __I18N_ZH__: Record<string, string>;
    __I18N_EN__: Record<string, string>;
  }
}

// Read initial language from the existing i18n engine or localStorage
function getInitialLang(): string {
  try {
    if (window.__i18n) return window.__i18n.getLang();
    const saved = localStorage.getItem('fold_lang');
    if (saved) return saved;
  } catch {}
  return 'zh';
}

const currentLang = ref(getInitialLang());

export function useI18n() {
  function t(key: string): string {
    const _ = currentLang.value;
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function setLang(lang: string) {
    currentLang.value = lang;
    if (window.__i18n) {
      window.__i18n.setLang(lang);
    }
  }

  function getLang(): string {
    return currentLang.value;
  }

  // Listen for lang changes from external code
  if (typeof window !== 'undefined') {
    window.addEventListener('langchange', ((e: CustomEvent) => {
      if (e.detail?.lang) {
        currentLang.value = e.detail.lang;
      }
    }) as EventListener);
  }

  return { t, setLang, getLang, currentLang };
}
