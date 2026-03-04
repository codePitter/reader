// ═══════════════════════════════════════════════════════════
// SETTINGS-BRIDGE.JS — Funciones del nuevo settings panel
// Conecta los acordeones y campos del slide-in panel con los
// módulos funcionales (tts.js, translation.js, grammar.js, etc.)
// Depende de: ustorage.js (uGet/uSet) — cargar después de ui.js
// ═══════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── ACORDEONES ──────────────────────────────────────────
    // Abre/cierra la sección de un acordeón en el settings panel.
    // Uso: onclick="toggleAjusteAcc('acc-humanizer')"
    window.toggleAjusteAcc = function (id) {
        var body = document.getElementById(id);
        if (!body) return;
        var isOpen = body.style.display !== 'none' && body.style.display !== '';
        // Cerrar todos primero
        document.querySelectorAll('.ajuste-acc-body').forEach(function (el) {
            el.style.display = 'none';
        });
        document.querySelectorAll('.ajuste-acc-btn').forEach(function (btn) {
            btn.classList.remove('open');
        });
        if (!isOpen) {
            body.style.display = 'block';
            // Marcar el botón padre como abierto
            var btn = body.previousElementSibling;
            if (btn && btn.classList.contains('ajuste-acc-btn')) btn.classList.add('open');
        }
    };

    // ── HUMANIZER ──────────────────────────────────────────
    window.cambiarProveedorHumanizerAjustes = function (val) {
        // Sync con el select del sidebar oculto
        var sel = document.getElementById('humanizer-provider');
        if (sel) sel.value = val;
        // Llamar función del módulo si existe
        if (typeof cambiarProveedorHumanizer === 'function') cambiarProveedorHumanizer(val);
        // Mostrar/ocultar campo de key según proveedor
        _toggleKeyField('humanizer-key-row', val !== 'none');
        try { if (typeof uSet === 'function') uSet('humanizer_provider', val); } catch (e) {}
    };

    window.guardarHumanizerKeyDesdeAjustes = function () {
        var inp = document.getElementById('ajustes-humanizer-key');
        if (!inp) return;
        var key = inp.value.trim();
        if (!key) return;
        try {
            if (typeof uSet === 'function') uSet('claude_api_key', key);
            else localStorage.setItem('claude_api_key', key);
        } catch (e) {}
        // Sync con campo del modal oculto
        var orig = document.getElementById('claude-api-key');
        if (orig) orig.value = key;
        if (typeof showToast === 'function') showToast('✓ API key humanizer guardada');
    };

    // ── UNIVERSO NARRATIVO ─────────────────────────────────
    window.cambiarProveedorUniversoAjustes = function (val) {
        if (typeof cambiarProveedorUniverso === 'function') cambiarProveedorUniverso(val);
        try { if (typeof uSet === 'function') uSet('universo_provider', val); } catch (e) {}
    };

    // ── TRADUCCIÓN ─────────────────────────────────────────
    window.cambiarProveedorTraduccionAjustes = function (val) {
        if (typeof cambiarProveedorTraduccion === 'function') cambiarProveedorTraduccion(val);
        _toggleKeyField('traduccion-key-row', val !== 'none' && val !== 'libre');
        try { if (typeof uSet === 'function') uSet('traduccion_provider', val); } catch (e) {}
    };

    window.guardarTranslateKeyDesdeAjustes = function () {
        var inp = document.getElementById('ajustes-translate-key');
        if (!inp) return;
        var key = inp.value.trim();
        if (!key) return;
        try {
            if (typeof uSet === 'function') uSet('translate_api_key', key);
            else localStorage.setItem('translate_api_key', key);
        } catch (e) {}
        if (typeof showToast === 'function') showToast('✓ API key traducción guardada');
    };

    // ── GRAMÁTICA / LANGUAGETOOL ───────────────────────────
    window.guardarLtDesdeAjustes = function () {
        var user = document.getElementById('ajustes-lt-username') || document.getElementById('lt-username');
        var key  = document.getElementById('ajustes-lt-apikey')   || document.getElementById('lt-apikey');
        if (!user || !key) return;
        var u = user.value.trim();
        var k = key.value.trim();
        // Sync con los campos ocultos que grammar.js lee directamente
        var origUser = document.getElementById('lt-username');
        var origKey  = document.getElementById('lt-apikey');
        if (origUser) origUser.value = u;
        if (origKey)  origKey.value  = k;
        try {
            if (typeof uSet === 'function') { uSet('lt_username', u); uSet('lt_apikey', k); }
            else { localStorage.setItem('lt_username', u); localStorage.setItem('lt_apikey', k); }
        } catch (e) {}
        if (typeof showToast === 'function') showToast('✓ Credenciales LanguageTool guardadas');
    };

    // ── MÚSICA AMBIENTAL ───────────────────────────────────
    window.cambiarProveedorMusicaAjustes = function (val) {
        if (typeof cambiarProveedorMusica === 'function') cambiarProveedorMusica(val);
        _toggleKeyField('musica-key-row', val === 'freesound');
        try { if (typeof uSet === 'function') uSet('music_provider', val); } catch (e) {}
    };

    window.guardarFreesoundDesdeAjustes = function () {
        var inp = document.getElementById('ajustes-freesound-key') || document.getElementById('freesound-api-key');
        if (!inp) return;
        var key = inp.value.trim();
        if (!key) return;
        // Sync con campo oculto que player.js lee
        var orig = document.getElementById('freesound-api-key');
        if (orig) orig.value = key;
        try {
            if (typeof uSet === 'function') uSet('freesound_api_key', key);
            else localStorage.setItem('freesound_api_key', key);
        } catch (e) {}
        if (typeof showToast === 'function') showToast('✓ API key Freesound guardada');
    };

    // ── BÚSQUEDA DE IMÁGENES ───────────────────────────────
    window.cambiarProveedorImgSearchAjustes = function (val) {
        // Sync con radios del sidebar oculto
        var radio = document.getElementById('prov-' + val);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        else if (typeof setImageProvider === 'function') setImageProvider(val);
        _toggleKeyField('imgsearch-key-row', ['pixabay', 'pexels', 'unsplash'].includes(val));
        try { if (typeof uSet === 'function') uSet('image_provider', val); } catch (e) {}
    };

    window.guardarImgSearchKeyDesdeAjustes = function () {
        var inp = document.getElementById('ajustes-imgsearch-key');
        if (!inp) return;
        var key     = inp.value.trim();
        var prov    = (document.getElementById('ajustes-imgsearch-provider') || {}).value || '';
        var keyMap  = { pixabay: 'pixabay_api_key', pexels: 'pexels_api_key', unsplash: 'unsplash_api_key' };
        var storKey = keyMap[prov] || (prov + '_api_key');
        if (!key) return;
        try {
            if (typeof uSet === 'function') uSet(storKey, key);
            else localStorage.setItem(storKey, key);
        } catch (e) {}
        if (typeof showToast === 'function') showToast('✓ API key ' + prov + ' guardada');
    };

    // ── IA DE IMÁGENES ─────────────────────────────────────
    window.cambiarProveedorImgIADesdeAjustes = function (val) {
        // Sync con radio del sidebar oculto
        var radio = document.getElementById('prov-' + val);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        else if (typeof setImageProvider === 'function') setImageProvider(val);
        _toggleKeyField('imgia-key-row', val === 'stability');
        try { if (typeof uSet === 'function') uSet('imgia_provider', val); } catch (e) {}
    };

    window.guardarStabilityDesdeAjustes = function () {
        var inp = document.getElementById('ajustes-stability-key');
        if (!inp) return;
        var key = inp.value.trim();
        if (!key) return;
        // Sync con función original si existe
        if (typeof guardarStabilityKey === 'function') {
            var orig = document.getElementById('stability-api-key');
            if (orig) orig.value = key;
            guardarStabilityKey();
            return;
        }
        try {
            if (typeof uSet === 'function') uSet('stability_api_key', key);
            else localStorage.setItem('stability_api_key', key);
        } catch (e) {}
        if (typeof showToast === 'function') showToast('✓ API key Stability guardada');
    };

    // ── REEMPLAZOS ─────────────────────────────────────────
    window.togglePanelOtrosLibros = function () {
        var panel = document.getElementById('panel-otros-libros');
        if (!panel) return;
        var visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'block';
    };

    // ── HELPER INTERNO: mostrar/ocultar fila de key ────────
    function _toggleKeyField(rowId, show) {
        var row = document.getElementById(rowId);
        if (row) row.style.display = show ? '' : 'none';
    }

    // ── INIT: poblar selects del settings panel con valores guardados ──
    document.addEventListener('DOMContentLoaded', function () {
        var get = (typeof uGet === 'function') ? uGet : function (k) { return localStorage.getItem(k); };

        // Acordeones cerrados por defecto
        document.querySelectorAll('.ajuste-acc-body').forEach(function (el) {
            el.style.display = 'none';
        });

        // Pre-rellenar selects con valores guardados
        var syncSelect = function (elId, storKey) {
            var el  = document.getElementById(elId);
            var val = get(storKey);
            if (el && val) el.value = val;
        };
        syncSelect('ajustes-humanizer-provider',  'humanizer_provider');
        syncSelect('ajustes-universe-provider',    'universo_provider');
        syncSelect('ajustes-translate-provider',   'traduccion_provider');
        syncSelect('ajustes-grammar-provider',     'grammar_provider');
        syncSelect('ajustes-music-provider',       'music_provider');
        syncSelect('ajustes-imgsearch-provider',   'image_provider');
        syncSelect('ajustes-imgia-provider',       'imgia_provider');
    });

})();