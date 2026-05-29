import { defineComponent, computed } from 'vue';
import { useI18n } from '../composables/useI18n';

declare const marked: any;

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  try { return marked.parse(text, { breaks: true }); } catch { return escapeHtml(text); }
}

function renderAIContent(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/<power>([\s\S]*?)<\/power>/g, '<div class="plugin-block plugin-power"><div class="plugin-block-header">⚡ $1</div></div>')
    .replace(/<cmd>([\s\S]*?)<\/cmd>/g, '<div class="plugin-block plugin-cmd"><div class="plugin-block-header">💻 $1</div></div>')
    .replace(/<mem>([\s\S]*?)<\/mem>/g, '<div class="plugin-block plugin-mem"><div class="plugin-block-header">📝 $1</div></div>')
    .replace(/<ask[^>]*>([\s\S]*?)<\/ask>/g, '<div class="plugin-block plugin-ask"><div class="plugin-block-header">❓ $1</div></div>');
  try { return marked.parse(html, { breaks: true }); } catch { return escapeHtml(html); }
}

export const MessageBubble = defineComponent({
  name: 'MessageBubble',
  props: {
    message: { type: Object, required: true },
    index: { type: Number, required: true },
  },
  emits: ['copy', 'edit', 'delete', 'regenerate', 'toggle-think'],
  template: `
    <div :class="['message-bubble', bubbleClass]">
      <!-- Reasoning block -->
      <div v-if="message.reasoning" class="think-block" :class="{ collapsed: message._thinkCollapsed }">
        <div class="think-header" @click="$emit('toggle-think', index)">
          <span class="think-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.47V19a2 2 0 11-4 0v-.53c0-1.03-.47-1.99-1.274-2.618l-.548-.547z"/></svg>
          </span>
          <span>{{ t('deepThink') }}</span>
          <span class="think-arrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        <div class="think-body-wrapper">
          <div class="think-line"></div>
          <div class="think-content" v-html="renderedReasoning"></div>
        </div>
      </div>
      <!-- Content -->
      <div v-if="message.role === 'assistant'" class="markdown-body" v-html="aiContent"></div>
      <div v-else class="markdown-body" v-html="renderedContent"></div>
      <!-- Images -->
      <div v-if="message.images && message.images.length" class="msg-images" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
        <img v-for="(img, ii) in message.images" :key="ii" :src="img" style="max-width:200px;border-radius:6px;">
      </div>
      <!-- Actions -->
      <div class="message-actions">
        <button v-for="act in actions" :key="act.key" class="action-icon" @click="act.handler" :title="t(act.labelKey)">
          <component :is="'svg'" v-bind="act.svg" v-html="act.path" />
        </button>
      </div>
      <!-- Edit area -->
      <div v-if="editing" class="message-edit-area">
        <textarea class="message-edit-textarea" v-model="editText" @keyup.enter="saveEdit" @keyup.escape="cancelEdit"></textarea>
        <div class="message-edit-actions">
          <button class="message-edit-save" @click="saveEdit">{{ t('saved') }}</button>
          <button class="message-edit-cancel" @click="cancelEdit">{{ t('cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const { t } = useI18n();

    const bubbleClass = computed(() => 'message-' + props.message.role);
    const renderedContent = computed(() => renderMarkdown(props.message.content || ''));
    const aiContent = computed(() => renderAIContent(props.message.content || ''));
    const renderedReasoning = computed(() => renderMarkdown(props.message.reasoning || ''));

    const actions = computed(() => {
      const acts: any[] = [];
      const msg = props.message;
      const idx = props.index;

      acts.push({
        key: 'copy', labelKey: 'copy',
        svg: { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
        path: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        handler: () => emit('copy', idx),
      });

      if (msg.role === 'user') {
        acts.push({
          key: 'edit', labelKey: 'edit',
          svg: { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
          path: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
          handler: () => { editing.value = true; editText.value = msg.content || ''; },
        });
        acts.push({
          key: 'delete', labelKey: 'delete',
          svg: { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
          path: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
          handler: () => emit('delete', idx),
        });
      }

      if (msg.role === 'assistant') {
        acts.push({
          key: 'regenerate', labelKey: 'regenerate',
          svg: { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
          path: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
          handler: () => emit('regenerate', idx),
        });
      }

      return acts;
    });

    const editing = computed(() => false); // Will be local state
    const editText = computed(() => '');

    function saveEdit() {}
    function cancelEdit() {}

    return { t, bubbleClass, renderedContent, aiContent, renderedReasoning, actions, editing, editText, saveEdit, cancelEdit };
  },
});
