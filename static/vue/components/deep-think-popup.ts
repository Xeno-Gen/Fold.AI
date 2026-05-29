import { defineComponent } from 'vue';
import { useI18n } from '../composables/useI18n';
import {
  deepThinkEnabled, currentThinkMode, memoryEnabled, commandExecEnabled,
  sandboxEnabled, agentEnabled, askEnabled,
} from '../state';

export const DeepThinkPopup = defineComponent({
  name: 'DeepThinkPopup',
  props: {
    show: { type: Boolean, default: false },
    style: { type: Object, default: () => ({}) },
  },
  emits: ['close', 'select-mode'],
  template: `
    <div class="deep-think-popup" :class="{ active: show }" :style="style" @click.stop @mouseleave="delayedClose">
      <div class="deep-think-popup-inner">
        <div class="tool-chain-section">
          <div class="tool-chain-title">{{ t('toolChain') }}</div>
          <div class="tool-chain-item" v-for="tool in tools" :key="tool.key">
            <div class="tool-chain-item-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="tool.icon"></svg>
              <span>{{ t(tool.labelKey) }}</span>
            </div>
            <div class="tool-chain-toggle">
              <button class="tool-chain-option" :class="{ active: tool.enabled.value }" @click="tool.enabled.value = true">{{ t('on') }}</button>
              <button class="tool-chain-option" :class="{ active: !tool.enabled.value }" @click="tool.enabled.value = false">{{ t('off') }}</button>
            </div>
          </div>
        </div>
        <div class="think-section">
          <div class="think-section-title">{{ t('thinkMode') }}</div>
          <div class="think-mode-selector">
            <button v-for="mode in thinkModes" :key="mode.key"
                    class="think-mode-option" :class="{ active: currentThinkMode === mode.key }"
                    @click="selectMode(mode.key)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="mode.icon"></svg>
              <span>{{ t(mode.labelKey) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const { t } = useI18n();

    const tools = [
      { key: 'memory', labelKey: 'memory', icon: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>', enabled: memoryEnabled },
      { key: 'command', labelKey: 'command', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', enabled: commandExecEnabled },
      { key: 'sandbox', labelKey: 'sandbox', icon: '<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>', enabled: sandboxEnabled },
      { key: 'agent', labelKey: 'agent', icon: '<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/>', enabled: agentEnabled },
      { key: 'ask', labelKey: 'askModel', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', enabled: askEnabled },
    ];

    const thinkModes = [
      { key: 'fast', labelKey: 'fast', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
      { key: 'think', labelKey: 'think', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { key: 'deep', labelKey: 'deep', icon: '<path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/>' },
      { key: 'meditate', labelKey: 'meditate', icon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/>' },
    ];

    function selectMode(mode: string) {
      currentThinkMode.value = mode;
      deepThinkEnabled.value = mode !== 'fast';
      localStorage.setItem('fold_deep_think_mode', mode);
      emit('select-mode', mode);
      emit('close');
    }

    function delayedClose() {
      setTimeout(() => emit('close'), 200);
    }

    return { t, tools, thinkModes, currentThinkMode, selectMode, delayedClose };
  },
});
