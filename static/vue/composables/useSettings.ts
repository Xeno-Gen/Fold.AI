import { watch } from 'vue';
import {
  currentTheme, currentThinkMode, autoCollapseThink, thinkCollapseDuring,
  streamAnimation, includeReasoning, chatFontSize, streamEnabled,
  commandConfirmEnabled, compressOldExecutions, collapsePluginOutput,
  agentEnabled, agentMaxIterations, commandExecEnabled, memoryEnabled,
  askEnabled, askAutoShow, cothinkEnabled, sandboxEnabled, deepThinkEnabled,
} from '../state';

export function useSettings() {
  function loadSettingsFromLocal() {
    try {
      const saved = localStorage.getItem('fold_ai_settings');
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.theme) currentTheme.value = s.theme;
      if (s.thinkMode) { currentThinkMode.value = s.thinkMode; deepThinkEnabled.value = s.thinkMode !== 'fast'; }
      if (s.autoCollapse !== undefined) autoCollapseThink.value = s.autoCollapse;
      if (s.thinkCollapse) thinkCollapseDuring.value = s.thinkCollapse;
      if (s.streamAnimation) streamAnimation.value = s.streamAnimation;
      if (s.includeReasoning !== undefined) includeReasoning.value = s.includeReasoning;
      if (s.fontSize) chatFontSize.value = s.fontSize;
      if (s.streamEnabled !== undefined) streamEnabled.value = s.streamEnabled;
      if (s.commandConfirm !== undefined) commandConfirmEnabled.value = s.commandConfirm;
      if (s.compressExec !== undefined) compressOldExecutions.value = s.compressExec;
      if (s.collapsePlugin !== undefined) collapsePluginOutput.value = s.collapsePlugin;
      if (s.agentEnabled !== undefined) agentEnabled.value = s.agentEnabled;
      if (s.agentMaxIterations) agentMaxIterations.value = s.agentMaxIterations;
      if (s.commandExecEnabled !== undefined) commandExecEnabled.value = s.commandExecEnabled;
      if (s.memoryEnabled !== undefined) memoryEnabled.value = s.memoryEnabled;
      if (s.askEnabled !== undefined) askEnabled.value = s.askEnabled;
      if (s.askAutoShow !== undefined) askAutoShow.value = s.askAutoShow;
      if (s.cothinkEnabled !== undefined) cothinkEnabled.value = s.cothinkEnabled;
      if (s.sandboxEnabled !== undefined) sandboxEnabled.value = s.sandboxEnabled;
    } catch {}
  }

  function saveSettingsToLocal() {
    try {
      localStorage.setItem('fold_ai_settings', JSON.stringify({
        theme: currentTheme.value,
        thinkMode: currentThinkMode.value,
        autoCollapse: autoCollapseThink.value,
        thinkCollapse: thinkCollapseDuring.value,
        streamAnimation: streamAnimation.value,
        includeReasoning: includeReasoning.value,
        fontSize: chatFontSize.value,
        streamEnabled: streamEnabled.value,
        commandConfirm: commandConfirmEnabled.value,
        compressExec: compressOldExecutions.value,
        collapsePlugin: collapsePluginOutput.value,
        agentEnabled: agentEnabled.value,
        agentMaxIterations: agentMaxIterations.value,
        commandExecEnabled: commandExecEnabled.value,
        memoryEnabled: memoryEnabled.value,
        askEnabled: askEnabled.value,
        askAutoShow: askAutoShow.value,
        cothinkEnabled: cothinkEnabled.value,
        sandboxEnabled: sandboxEnabled.value,
      }));
    } catch {}
  }

  // Auto-save on changes with deep watch
  watch(
    [currentTheme, currentThinkMode, autoCollapseThink, thinkCollapseDuring,
     streamAnimation, includeReasoning, chatFontSize, streamEnabled,
     commandConfirmEnabled, compressOldExecutions, collapsePluginOutput,
     agentEnabled, agentMaxIterations, commandExecEnabled, memoryEnabled,
     askEnabled, askAutoShow, cothinkEnabled, sandboxEnabled],
    () => { saveSettingsToLocal(); },
    { deep: true }
  );

  loadSettingsFromLocal();

  return { loadSettingsFromLocal, saveSettingsToLocal };
}
