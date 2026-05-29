"use strict";
(() => {
  (function() {
    "use strict";
    window.__renderDebugTab = function(container) {
      if (!container) return;
      const verEl = document.getElementById("versionDisplay");
      const versionText = verEl ? verEl.textContent : "\u672A\u77E5";
      function sc(v) {
        return v ? "#6b8a5e" : "#b8554a";
      }
      function st(v) {
        return v ? "\u5F00\u542F" : "\u5173\u95ED";
      }
      function esc(t) {
        const m = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
        return String(t).replace(/[&<>"']/g, (c) => m[c]);
      }
      const plugin = window.CommandExecutionPlugin;
      const workDir = plugin ? plugin.workingDirectory || "cwd" : "\u2014";
      let html = '<div class="settings-section"><div class="settings-section-title">\u7248\u672C\u4FE1\u606F</div><div class="settings-item"><span class="settings-item-label">' + esc(versionText) + "</span></div></div>";
      html += '<div class="settings-section"><div class="settings-section-title">\u529F\u80FD\u5F00\u5173</div>';
      const sw = [
        ["\u547D\u4EE4\u6267\u884C", commandExecEnabled],
        ["\u5B89\u5168\u6C99\u7BB1", sandboxEnabled],
        ["\u6267\u884C\u524D\u786E\u8BA4", commandConfirmEnabled],
        ["\u8BB0\u5FC6\u63D2\u4EF6", memoryEnabled],
        ["Agent", agentEnabled],
        ["\u601D\u7EF4\u94FE\u6CE8\u5165", cothinkEnabled],
        ["\u538B\u7F29\u65E7\u6267\u884C", compressOldExecutions],
        ["\u6298\u53E0\u63D2\u4EF6\u8F93\u51FA", collapsePluginOutput],
        ["\u6A21\u578B\u63D0\u95EE", askEnabled]
      ];
      for (let i = 0; i < sw.length; i++) {
        html += '<div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">' + sw[i][0] + '</span><span style="font-size:12px;font-weight:500;color:' + sc(sw[i][1]) + ';">' + st(sw[i][1]) + "</span></div>";
      }
      html += "</div>";
      html += '<div class="settings-section"><div class="settings-section-title">\u8FD0\u884C\u65F6</div><div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">\u5DE5\u4F5C\u76EE\u5F55</span><span style="font-size:12px;color:#8b8178;">' + esc(workDir) + "</span></div></div>";
      container.innerHTML = html;
    };
  })();
})();
