import { watch } from 'vue';
import { currentTheme } from '../state';

export function useTheme() {
  function applyTheme(theme?: string) {
    const t = theme || currentTheme.value;
    let resolved: string;
    if (t === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      resolved = t;
    }
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function setTheme(theme: 'light' | 'dark' | 'system') {
    currentTheme.value = theme;
    localStorage.setItem('fold_ai_theme', theme);
    applyTheme(theme);
  }

  // Watch for changes
  watch(currentTheme, (val) => {
    applyTheme(val);
    localStorage.setItem('fold_ai_theme', val);
  });

  // System preference change
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme.value === 'system') applyTheme('system');
    });
  }

  // Init from localStorage
  const saved = localStorage.getItem('fold_ai_theme') as 'light' | 'dark' | 'system' | null;
  if (saved) {
    currentTheme.value = saved;
  }
  applyTheme();

  return { currentTheme, setTheme, applyTheme };
}
