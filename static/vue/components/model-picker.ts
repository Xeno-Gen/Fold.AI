import { defineComponent, ref, computed, watch } from 'vue';
import { useI18n } from '../composables/useI18n';
import { currentModel, allModels } from '../state';

export const ModelPicker = defineComponent({
  name: 'ModelPicker',
  props: {
    show: { type: Boolean, default: false },
    style: { type: Object, default: () => ({}) },
  },
  emits: ['close', 'select'],
  template: `
    <div class="model-picker-dropdown" :class="{ show: show }" :style="style">
      <div class="model-search">
        <input type="text" ref="searchInput" v-model="search" :placeholder="'搜索模型...'" @keydown="onKeydown">
      </div>
      <div class="model-list">
        <div v-for="(m, i) in filteredModels" :key="m"
             class="model-picker-item" :class="{ active: m === currentModel }"
             @click="selectModel(m)"
             ref="modelItems">
          <span class="model-name">{{ m }}</span>
        </div>
        <div v-if="filteredModels.length === 0" style="padding:20px;text-align:center;color:#999;">{{ t('noModelAvailable') }}</div>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const { t } = useI18n();
    const search = ref('');
    const selectedIndex = ref(0);

    const filteredModels = computed(() => {
      if (!search.value) return allModels.value;
      return allModels.value.filter((m: string) => m.toLowerCase().includes(search.value.toLowerCase()));
    });

    function selectModel(model: string) {
      currentModel.value = model;
      emit('select', model);
      emit('close');
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, filteredModels.value.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      } else if (e.key === 'Enter' && filteredModels.value[selectedIndex.value]) {
        selectModel(filteredModels.value[selectedIndex.value]);
      } else if (e.key === 'Escape') {
        emit('close');
      }
    }

    watch(search, () => { selectedIndex.value = 0; });

    return { t, search, filteredModels, currentModel, selectedIndex, selectModel, onKeydown };
  },
});
