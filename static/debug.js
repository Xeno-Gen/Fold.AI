// debug.js — 内部调试渲染函数
(function() {
    'use strict';

    window.__renderDebugTab = function(container) {
        if (!container) return;
        var verEl = document.getElementById('versionDisplay');
        var versionText = verEl ? verEl.textContent : '未知';

        function sc(v) { return v ? '#6b8a5e' : '#b8554a'; }
        function st(v) { return v ? '开启' : '关闭'; }
        function esc(t) { var m = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }; return String(t).replace(/[&<>"']/g,function(c){return m[c];}); }

        var plugin = window.CommandExecutionPlugin;
        var workDir = plugin ? (plugin.workingDirectory || 'cwd') : '—';

        var html = '<div class="settings-section"><div class="settings-section-title">版本信息</div>' +
            '<div class="settings-item"><span class="settings-item-label">' + esc(versionText) + '</span></div></div>';

        html += '<div class="settings-section"><div class="settings-section-title">功能开关</div>';
        var sw = [
            ['命令执行', commandExecEnabled], ['安全沙箱', sandboxEnabled],
            ['执行前确认', commandConfirmEnabled],
            ['记忆插件', memoryEnabled], ['Agent', agentEnabled],
            ['思维链注入', cothinkEnabled], ['压缩旧执行', compressOldExecutions],
            ['折叠插件输出', collapsePluginOutput], ['模型提问', askEnabled],
        ];
        for (var i = 0; i < sw.length; i++) {
            html += '<div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">' + sw[i][0] + '</span>' +
                '<span style="font-size:12px;font-weight:500;color:' + sc(sw[i][1]) + ';">' + st(sw[i][1]) + '</span></div>';
        }
        html += '</div>';

        html += '<div class="settings-section"><div class="settings-section-title">运行时</div>' +
            '<div class="settings-item" style="padding:5px 0;"><span class="settings-item-label">工作目录</span><span style="font-size:12px;color:#8b8178;">' + esc(workDir) + '</span></div>' +
            '</div>';

        html += '<div class="settings-section"><div class="settings-section-title">命令参考</div>' +
            '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
        var cmds = [
            [1, '命令执行', commandExecEnabled], [2, '记忆插件', memoryEnabled],
            [3, '安全沙箱', sandboxEnabled], [4, 'Agent', agentEnabled],
            [5, '思维链注入', cothinkEnabled], [6, '压缩旧执行', compressOldExecutions],
            [7, '模型提问', askEnabled],
        ];
        for (var i = 0; i < cmds.length; i++) {
            html += '<tr><td style="padding:4px 12px 4px 0;color:#8b8178;white-space:nowrap;">/set ' + cmds[i][0] + '</td>' +
                '<td style="padding:4px 0;">' + cmds[i][1] + '</td>' +
                '<td style="padding:4px 0 4px 12px;font-weight:500;text-align:right;color:' + sc(cmds[i][2]) + ';">' + st(cmds[i][2]) + '</td></tr>';
        }
        html += '</table></div>';

        container.innerHTML = html;
    };
})();
