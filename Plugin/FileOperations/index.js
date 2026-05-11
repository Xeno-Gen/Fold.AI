(function() {
    'use strict';

    class FileOperationsPlugin {
        constructor() {
            this.id = 'FileOperations';
            this.name = '文件操作';
            this.enabled = true;
        }

        // Execute a tag-format file operation command
        async execute(command) {
            const res = await fetch('/api/plugin/FileOperations/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });
            return await res.json();
        }

        // List files
        async listFiles() {
            const res = await fetch('/api/plugin/FileOperations/files');
            return await res.json();
        }

        // Write file directly (UTF-8)
        async writeFile(name, content) {
            const res = await fetch('/api/plugin/FileOperations/write/' + encodeURIComponent(name), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            return await res.json();
        }

        // Get history
        async getHistory() {
            const res = await fetch('/api/plugin/FileOperations/history');
            return await res.json();
        }

        // Rollback
        async rollback(id) {
            const res = await fetch('/api/plugin/FileOperations/rollback/' + id, { method: 'POST' });
            return await res.json();
        }
    }

    window.FileOperationsPlugin = new FileOperationsPlugin();
    console.log('[FileOperations] 插件已加载');
})();
