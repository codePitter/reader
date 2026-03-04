// ═══════════════════════════════════════════════════════════
// SETTINGS-BRIDGE.JS — Funciones del nuevo settings panel
// Conecta los acordeones y campos del slide-in panel con los
// módulos funcionales (tts.js, translation.js, grammar.js, etc.)
// Depende de: ustorage.js (uGet/uSet) — cargar después de ui.js
// ═══════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── ACORDEONES ──────────────────────────────────────────
    // El id que llega es el del .ajuste-seccion (e.g. 'acc-humanizer').
    // El cuerpo expandible es el .ajuste-acc-body dentro de esa sección.
    window.toggleAjusteAcc = function (id) {
        var section = document.getElementById(id);
        if (!section) return;
        var isOpen = section.classList.contains('open');

        // Cerrar todas las secciones abiertas
        document.querySelectorAll('.ajuste-seccion.open').forEach(function (el) {
            el.classList.remove('open');
        });

        // Abrir esta si estaba cerrada
        if (!isOpen) {
            section.classList.add('open');
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
        try { if (typeof uSet === 'function') uSet('universe_provider', val); } catch (e) {}
    };

    // ── TRADUCCIÓN ─────────────────────────────────────────
    window.cambiarProveedorTraduccionAjustes = function (val) {
        if (typeof cambiarProveedorTraduccion === 'function') cambiarProveedorTraduccion(val);
        _toggleKeyField('traduccion-key-row', val !== 'none' && val !== 'libre');
        try { if (typeof uSet === 'function') uSet('translation_provider', val); } catch (e) {}
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
        try { if (typeof uSet === 'function') uSet('img_provider', val); } catch (e) {}
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

    // ── PILLS DEL SIDEBAR ──────────────────────────────────
    // Mapa: storageKey → { pillId, checkboxId }
    var _PILL_MAP = {
        'toggle_auto_translate': { pill: 'pill-translate', cb: 'auto-translate'    },
        'tts_servidor_live':     { pill: 'pill-tts-local', cb: null                },
        'grammar_review_activo': { pill: 'pill-grammar',   cb: 'grammar-review'    },
        'toggle_tts_humanizer':  { pill: 'pill-humanizer', cb: 'tts-humanizer'     },
        'toggle_auto_next':      { pill: 'pill-autonext',  cb: 'auto-next-chapter' },
    };

    // Llamado por onclick="togglePillRow(this,'storageKey',callback)" en index.html
    window.togglePillRow = function (rowEl, storageKey, callback) {
        var map    = _PILL_MAP[storageKey];
        var pillEl = map
            ? document.getElementById(map.pill)
            : (rowEl && rowEl.querySelector('.pill'));
        if (!pillEl) return;

        var nuevoOn = !pillEl.classList.contains('on');
        pillEl.classList.toggle('on',  nuevoOn);
        pillEl.classList.toggle('off', !nuevoOn);

        // Persistir en uStorage
        try { if (typeof uSet === 'function') uSet(storageKey, nuevoOn); } catch (e) {}

        // Sincronizar checkbox oculto
        if (map && map.cb) {
            var cb = document.getElementById(map.cb);
            if (cb) { cb.checked = nuevoOn; cb.dispatchEvent(new Event('change')); }
        }

        if (typeof callback === 'function') callback();
    };

    // Restaura estado visual de todas las pills desde uStorage.
    // Llamado en DOMContentLoaded y en auth:ready (init.js).
    window.syncSidebarPills = function () {
        Object.keys(_PILL_MAP).forEach(function (storageKey) {
            var map = _PILL_MAP[storageKey];
            var raw = (typeof uGet === 'function') ? uGet(storageKey) : null;
            if (raw === null) return; // nunca guardado — respetar default del HTML
            var esOn   = raw === 'true';
            var pillEl = document.getElementById(map.pill);
            if (pillEl) {
                pillEl.classList.toggle('on',  esOn);
                pillEl.classList.toggle('off', !esOn);
            }
            // Sync checkbox oculto sin disparar módulos
            if (map.cb) {
                var cb = document.getElementById(map.cb);
                if (cb) cb.checked = esOn;
            }
        });
    };

    // ── HELPER INTERNO: mostrar/ocultar fila de key ────────
    function _toggleKeyField(rowId, show) {
        var row = document.getElementById(rowId);
        if (row) row.style.display = show ? '' : 'none';
    }

    // ════════════════════════════════════════════════════════
    // ── IDIOMA DESTINO — poblar select del settings panel ──────────
    // ui.js pobla 'translation-lang-select' (oculto); esta función sincroniza
    // también 'translation-lang-select-settings' (visible en el panel).
    // Por defecto usa el idioma preferido del navegador, con fallback a 'es'.
    var SETTINGS_LANGS = {
        es: 'Español', en: 'English', pt: 'Português', fr: 'Français',
        de: 'Deutsch', it: 'Italiano', ja: '日本語', ko: '한국어',
        zh: '中文', ru: 'Русский', ar: 'العربية', pl: 'Polski',
        nl: 'Nederlands', sv: 'Svenska', tr: 'Türkçe', uk: 'Українська',
        hi: 'हिन्दी', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia'
    };

    function _getBrowserLang() {
        // navigator.language devuelve 'es-AR', 'es', 'en-US', etc.
        var lang = (navigator.language || navigator.userLanguage || 'es').split('-')[0].toLowerCase();
        return SETTINGS_LANGS[lang] ? lang : 'es';
    }

    function _poblarIdiomaSelectSettings() {
        var sel = document.getElementById('translation-lang-select-settings');
        if (!sel) return;
        if (sel.options.length > 1) return; // ya estaba poblado
        sel.innerHTML = '';
        var saved = (typeof uGet === 'function' ? uGet('translation_lang') : null) || _getBrowserLang();
        Object.entries(SETTINGS_LANGS).forEach(function (entry) {
            var opt = document.createElement('option');
            opt.value = entry[0];
            opt.textContent = entry[1] + ' (' + entry[0] + ')';
            if (entry[0] === saved) opt.selected = true;
            sel.appendChild(opt);
        });
        // Asegurar que el select oculto también tenga el valor correcto
        var hiddenSel = document.getElementById('translation-lang-select');
        if (hiddenSel && hiddenSel.options.length > 0) hiddenSel.value = saved;
        // Aplicar el override de idioma inicial
        if (saved) window._traduccionLangOverride = saved;
    }

    // _syncProviderSelects — rellena los <select> del settings
    // panel con los valores guardados en uStorage.
    //
    // PROBLEMA RAÍZ: DOMContentLoaded corre con prefijo 'guest'.
    // Para usuarios autenticados los datos están bajo 'user_XXXX_'.
    // uSetUser() cambia el prefijo en auth:ready → hay que volver
    // a llamar esta función con el prefijo correcto.
    // ════════════════════════════════════════════════════════
    window._syncProviderSelects = function () {
        function syncSelect(elId, storKey) {
            var el  = document.getElementById(elId);
            var val = (typeof uGet === 'function') ? uGet(storKey) : localStorage.getItem(storKey);
            if (el && val) el.value = val;
        }
        // Claves canónicas — deben coincidir con las que ui.js lee en
        // _sincronizarInputsApiKeys() para que la fuente de verdad sea la misma.
        syncSelect('ajustes-humanizer-provider', 'humanizer_provider');
        syncSelect('ajustes-universe-provider',  'universe_provider');  // ← era universo_provider
        syncSelect('ajustes-translate-provider', 'translation_provider'); // ← era traduccion_provider
        syncSelect('ajustes-grammar-provider',   'grammar_provider');
        syncSelect('ajustes-music-provider',     'music_provider');
        syncSelect('ajustes-imgsearch-provider', 'image_provider');
        syncSelect('ajustes-imgia-provider',     'img_provider');       // ← era imgia_provider
    };

    // ── INIT: poblar selects del settings panel con valores guardados ──
    document.addEventListener('DOMContentLoaded', function () {

        // Poblar el select de idioma destino en el panel de ajustes
        _poblarIdiomaSelectSettings();

        // Rellenar selects con prefijo activo (puede ser 'guest' en este momento).
        // Para usuarios autenticados se re-ejecuta en auth:ready (abajo).
        window._syncProviderSelects();

        // ── Persistir sliders TTS al moverlos ─────────────────────
        // Guard para no duplicar si tts.js ya añadió su propio listener.
        function _bindSliderPersist(ctrlId, storKey) {
            var el = document.getElementById(ctrlId);
            if (!el || el._sbPersistBound) return;
            el._sbPersistBound = true;
            el.addEventListener('input', function () {
                try { if (typeof uSet === 'function') uSet(storKey, this.value); } catch (e) {}
            });
        }
        _bindSliderPersist('rate-control',   'tts_rate');
        _bindSliderPersist('pitch-control',  'tts_pitch');
        _bindSliderPersist('volume-control', 'tts_volume');

        // Restaurar pills con valores guardados
        if (typeof window.syncSidebarPills === 'function') window.syncSidebarPills();

        // ── MutationObserver: sincronizar selects al abrir #settings-panel ──
        // openSettings() (theme.js) añade la clase 'open' al panel.
        // En ese momento ya tiene el prefijo correcto (auth:ready ya corrió)
        // y podemos llamar _sincronizarInputsApiKeys() para poblar los campos.
        var panel = document.getElementById('settings-panel');
        if (panel) {
            new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                    if (m.type === 'attributes' && m.attributeName === 'class') {
                        if (panel.classList.contains('open')) {
                            _poblarIdiomaSelectSettings();
                            // _sincronizarInputsApiKeys vive en ui.js y lee con uGet()
                            // al momento de la llamada → prefijo siempre actualizado
                            if (typeof _sincronizarInputsApiKeys === 'function') {
                                _sincronizarInputsApiKeys();
                            }
                            // También re-sincronizar los selects propios del bridge
                            window._syncProviderSelects();
                            // Sincronizar sliders del panel con los controles reales
                            _syncSettingsPanelSliders();
                        }
                    }
                });
            }).observe(panel, { attributes: true, attributeFilter: ['class'] });
        }
    });

    // ── AUTH:READY: re-sincronizar con prefijo de usuario autenticado ──
    // Este es el fix central para usuarios con sesión: DOMContentLoaded corrió
    // con prefijo 'guest' y no encontró sus datos. auth:ready dispara después
    // de que uSetUser() cambia el prefijo a 'user_XXXX_'.
    document.addEventListener('auth:ready', function () {
        _poblarIdiomaSelectSettings();
        window._syncProviderSelects();
        if (typeof window.syncSidebarPills === 'function') window.syncSidebarPills();

        // Restaurar sliders con el prefijo correcto
        function restoreSliderDOM(elId, storKey, labelId) {
            var el    = document.getElementById(elId);
            var label = labelId ? document.getElementById(labelId) : null;
            var val   = (typeof uGet === 'function') ? uGet(storKey) : null;
            if (!el || val === null || val === undefined) return;
            el.value = val;
            if (label) label.textContent = parseFloat(val).toFixed(1);
        }
        restoreSliderDOM('rate-control',   'tts_rate',   'rate-value');
        restoreSliderDOM('pitch-control',  'tts_pitch',  'pitch-value');
        restoreSliderDOM('volume-control', 'tts_volume', 'volume-value');

        // Sincronizar sliders visibles del sidebar (sb-tts-slider)
        // init.js _restaurarToggles también los restaura, pero este es el fallback.
        _syncSbSliders();

        // Aplicar proveedores guardados a los módulos funcionales (no solo al DOM).
        // _syncProviderSelects actualiza el select.value pero no llama los onChange
        // que actualizan las variables internas de cada módulo.
        // Se hace aquí de forma diferida para asegurar que los módulos ya cargaron.
        setTimeout(function () {
            var provHumanizer = (typeof uGet === 'function') ? uGet('humanizer_provider') : null;
            if (provHumanizer && typeof cambiarProveedorHumanizer === 'function') {
                cambiarProveedorHumanizer(provHumanizer);
            }
            var provUniverse = (typeof uGet === 'function') ? uGet('universe_provider') : null;
            if (provUniverse && typeof cambiarProveedorUniverso === 'function') {
                cambiarProveedorUniverso(provUniverse);
            }
            var provTranslate = (typeof uGet === 'function') ? uGet('translation_provider') : null;
            if (provTranslate && typeof cambiarProveedorTraduccion === 'function') {
                cambiarProveedorTraduccion(provTranslate);
            }
            var provMusic = (typeof uGet === 'function') ? uGet('music_provider') : null;
            if (provMusic && typeof cambiarProveedorMusica === 'function') {
                cambiarProveedorMusica(provMusic);
            }
            // Proveedor de imágenes (video bar popup)
            var provImg = (typeof uGet === 'function') ? uGet('image_provider') : null;
            if (provImg && typeof _activarProv === 'function') {
                _activarProv(provImg);
            } else if (provImg && typeof cambiarProveedorImagenes === 'function') {
                cambiarProveedorImagenes(provImg);
            }
        }, 0);
    });

    // ── Sincronizar sliders visibles del sidebar con los controles reales ──
    function _syncSbSliders() {
        var mainRate  = document.getElementById('rate-control');
        var mainPitch = document.getElementById('pitch-control');
        var sbSliders = document.querySelectorAll('.sb-tts-slider');
        // sb-tts-slider[0] = Rate, sb-tts-slider[1] = Tono
        if (sbSliders[0] && mainRate) {
            sbSliders[0].value = mainRate.value;
            var lbl0 = sbSliders[0].nextElementSibling;
            if (lbl0 && lbl0.classList.contains('sb-tts-val')) {
                lbl0.textContent = parseFloat(mainRate.value).toFixed(1) + '×';
            }
        }
        if (sbSliders[1] && mainPitch) {
            sbSliders[1].value = mainPitch.value;
            var lbl1 = sbSliders[1].nextElementSibling;
            if (lbl1 && lbl1.classList.contains('sb-tts-val')) {
                lbl1.textContent = parseFloat(mainPitch.value).toFixed(1) + '×';
            }
        }
    }

    // ── Sincronizar sliders del settings panel al abrirlo ──
    function _syncSettingsPanelSliders() {
        var mainRate  = document.getElementById('rate-control');
        var mainPitch = document.getElementById('pitch-control');
        var mainVol   = document.getElementById('volume-control');
        // Los .settings-range con min="0.5" son Rate y Tono (en ese orden en el DOM)
        var rangeSliders = Array.from(document.querySelectorAll('#settings-panel .settings-range[min="0.5"]'));
        var volSlider    = document.querySelector('#settings-panel .settings-range[min="0"][max="100"]');
        if (rangeSliders[0] && mainRate) {
            rangeSliders[0].value = mainRate.value;
            var l0 = rangeSliders[0].previousElementSibling;
            if (l0) l0.textContent = parseFloat(mainRate.value).toFixed(1);
        }
        if (rangeSliders[1] && mainPitch) {
            rangeSliders[1].value = mainPitch.value;
            var l1 = rangeSliders[1].previousElementSibling;
            if (l1) l1.textContent = parseFloat(mainPitch.value).toFixed(1);
        }
        if (volSlider && mainVol) {
            volSlider.value = mainVol.value;
            var lv = volSlider.previousElementSibling;
            if (lv) lv.textContent = mainVol.value;
        }
        // Edge voice
        var spEdge  = document.getElementById('sp-edge-voice');
        var mainEdge = document.getElementById('edge-voice-select');
        if (spEdge && mainEdge) spEdge.value = mainEdge.value;
        // Browser voice
        var spBrowser  = document.getElementById('sp-browser-voice');
        var mainBrowser = document.getElementById('voice-select');
        if (spBrowser && mainBrowser && spBrowser.options.length === 0 && mainBrowser.options.length > 0) {
            Array.from(mainBrowser.options).forEach(function(o) {
                spBrowser.appendChild(o.cloneNode(true));
            });
        }
        if (spBrowser && mainBrowser) spBrowser.value = mainBrowser.value;
    }

})();