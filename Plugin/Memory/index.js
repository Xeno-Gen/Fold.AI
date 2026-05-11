(function() {
    var STORAGE_KEY = 'plugin_Memory';

    function MemoryPlugin() {
        var self = this;
        var settings = loadSettings();

        function loadSettings() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
        }
        function saveSettings() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        }

        this.enabled = settings.enabled !== false; // default true

        this.setEnabled = function(v) {
            self.enabled = v;
            settings.enabled = v;
            saveSettings();
        };

        this.save = async function(key, content) {
            var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content })
            });
            return await res.json();
        };

        this.remove = async function(key) {
            var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), {
                method: 'DELETE'
            });
            return await res.json();
        };

        this.get = async function(key) {
            var res = await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key));
            if (!res.ok) return null;
            return await res.json();
        };

        this.list = async function() {
            var res = await fetch('/api/plugin/Memory/memories');
            return await res.json();
        };
    }

    window.MemoryPlugin = new MemoryPlugin();
})();
