"use strict";
(() => {
  (function() {
    "use strict";
    window.__renderDebugTab = function(container) {
      if (!container) return;
      const verEl = document.getElementById("versionDisplay");
      const versionText = verEl ? verEl.textContent : "未知";
      function sc(v) {
        return v ? "#6b8a5e" : "#b8554a";
      }
      function st(v) {
        return v ? (_("enabled") || "开启") : (_("disabled") || "关闭");
      }
      function esc(t) {
        const m = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
        return String(t).replace(/[&<>"']/g, (c) => m[c]);
      }
      const plugin = window.CommandExecutionPlugin;
      const workDir = plugin ? plugin.workingDirectory || "" : "—";
      let html = '<div class="settings-section"><div class="settings-section-title">' + (_("version") || "版本信息") + '</div><div class="settings-item"><span class="settings-item-label">' + esc(versionText) + "</span></div></div>";
      html += '<div class="settings-section"><div class="settings-section-title">' + (_("plugins") || "功能开关") + '</div>';
      const sw = [
        [_("commandExec"), commandExecEnabled],
        [(_("sandbox") || "安全沙箱"), sandboxEnabled],
        [(_("confirmBeforeExec") || "执行前确认"), commandConfirmEnabled],
        [(_("memory") || "记忆"), memoryEnabled],
        ["Agent", agentEnabled],
        [(_("cothink") || "思维链注入"), cothinkEnabled],
        [(_("compressOldExec") || "压缩旧执行"), compressOldExecutions],
        [(_("collapsePluginOutput") || "折叠插件输出"), collapsePluginOutput],
        [(_("modelAsk") || "模型提问"), askEnabled]
      ];
      for (let i = 0; i < sw.length; i++) {
        html += '<div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">' + sw[i][0] + '</span><span style="font-size:12px;font-weight:500;color:' + sc(sw[i][1]) + ';">' + st(sw[i][1]) + "</span></div>";
      }
      html += "</div>";
      html += '<div class="settings-section"><div class="settings-section-title">' + (_("runtime") || "运行时") + '</div><div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">' + (_("workDirectory") || "工作目录") + '</span><span style="font-size:12px;color:#8b8178;">' + esc(workDir) + "</span></div></div>";
      container.innerHTML = html;
    };
  })();
})();
