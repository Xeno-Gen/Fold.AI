// i18n engine — frontend language switching
(function() {
    var packs = {};
    var currentLang = 'zh';

    // Discover language packs from window.__I18N_XX__
    for (var key in window) {
        if (key.indexOf('__I18N_') === 0 && key.indexOf('__I18N__') !== 0) {
            var lang = key.replace('__I18N_', '').replace('__', '').toLowerCase();
            packs[lang] = window[key];
        }
    }
    // Legacy: if old __I18N__ exists, treat as 'en'
    if (window.__I18N__ && Object.keys(window.__I18N__).length > 0) {
        packs['en'] = window.__I18N__;
    }

    // Load saved preference
    try {
        var saved = localStorage.getItem('fold_lang');
        if (saved && packs[saved]) currentLang = saved;
    } catch(e) {}

    function setLang(lang) {
        if (!packs[lang]) return;
        currentLang = lang;
        try { localStorage.setItem('fold_lang', lang); } catch(e) {}
        // Update all elements with data-i18n
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', t(key));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', t(key));
        });
        // Dispatch event for manual re-renders
        window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
        // Update switcher buttons
        document.querySelectorAll('.lang-switch-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    function t(key) {
        var map = packs[currentLang];
        if (map && map[key] !== undefined) return map[key];
        // Fallback to Chinese
        if (packs['zh'] && packs['zh'][key] !== undefined) return packs['zh'][key];
        return key;
    }

    window.__i18n = {
        t: t,
        setLang: setLang,
        getLang: function() { return currentLang; },
        packs: packs
    };

    // Shorthand
    window.t = t;

    // Process HTML on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setLang(currentLang); });
    } else {
        setLang(currentLang);
    }
})();
