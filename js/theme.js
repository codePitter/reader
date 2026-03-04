// ═══════════════════════════════════════
// THEME.JS — Gestión de temas visuales (Ember · Mercury · Folio · Graphite)
// Debe cargarse antes que ui.js e init.js
// Depende de: ustorage.js (uGet/uSet)
// ═══════════════════════════════════════
(function () {
    'use strict';

    var THEMES = {
        ember:    { label: '01 · Ember',    desc: 'Charcoal & Amber aplicado' },
        mercury:  { label: '02 · Mercury',  desc: 'Slate & Electric aplicado' },
        folio:    { label: '03 · Folio',    desc: 'Ink & Coral aplicado' },
        graphite: { label: '04 · Graphite', desc: 'Graphite & Emerald aplicado' }
    };

    var _currentTheme  = 'ember';
    var _pendingTheme  = 'ember';
    var _settingsOpen  = false;
    var _musicOpen     = false;
    var _videoVisible  = true;
    var _videoMinimized = false;

    // ── Inicialización desde uStorage ──
    function init() {
        var saved;
        try { saved = (typeof uGet === 'function') ? uGet('reader-theme') : localStorage.getItem('reader-theme'); } catch (e) {}
        if (saved && THEMES[saved]) {
            _currentTheme = _pendingTheme = saved;
        }
        applyThemeDOM(_currentTheme);
        _updateThemeCards(_currentTheme);

        // Sincronizar icon rail
        var icVideo = document.getElementById('ic-video');
        if (icVideo) icVideo.classList.toggle('on', _videoVisible);
    }

    // ── Aplicar tema al DOM ──
    function applyThemeDOM(theme) {
        document.body.setAttribute('data-theme', theme);
        syncMusicUI(theme, _musicOpen);
    }

    // ── Selección desde la grilla (preview en vivo) ──
    window.selectTheme = function (theme) {
        _pendingTheme = theme;
        _updateThemeCards(theme);
        applyThemeDOM(theme);
    };

    // ── Abrir panel de ajustes ──
    window.openSettings = function () {
        _settingsOpen = true;
        _pendingTheme = _currentTheme;
        var overlay = document.getElementById('settings-overlay');
        var panel   = document.getElementById('settings-panel');
        if (overlay) overlay.classList.add('open');
        if (panel)   panel.classList.add('open');
    };

    // ── Cerrar panel de ajustes ──
    window.closeSettings = function () {
        _settingsOpen = false;
        // Revertir preview si se canceló
        if (_pendingTheme !== _currentTheme) {
            applyThemeDOM(_currentTheme);
            _updateThemeCards(_currentTheme);
        }
        var overlay = document.getElementById('settings-overlay');
        var panel   = document.getElementById('settings-panel');
        if (overlay) overlay.classList.remove('open');
        if (panel)   panel.classList.remove('open');
    };

    window.closeSettingsOverlay = function (e) {
        if (e.target === document.getElementById('settings-overlay')) window.closeSettings();
    };

    // ── Aplicar y guardar ──
    window.applySettings = function () {
        _currentTheme = _pendingTheme;
        try {
            if (typeof uSet === 'function') uSet('reader-theme', _currentTheme);
            else localStorage.setItem('reader-theme', _currentTheme);
        } catch (e) {}
        applyThemeDOM(_currentTheme);
        window.closeSettings();
        showToast('✓  ' + THEMES[_currentTheme].desc);
    };

    // ── Helper: actualizar tarjetas seleccionadas ──
    function _updateThemeCards(theme) {
        document.querySelectorAll('.theme-card').forEach(function (c) { c.classList.remove('selected'); });
        var card = document.getElementById('card-' + theme);
        if (card) card.classList.add('selected');
    }

    // ── MUSIC ──
    window.syncMusicUI = function (theme, open) {
        ['ember', 'mercury', 'folio', 'graphite'].forEach(function (t) {
            var el = document.getElementById('music-' + t);
            if (el) el.classList.remove('open');
        });
        if (!open) return;
        var active = document.getElementById('music-' + theme);
        if (active) active.classList.add('open');
    };

    window.toggleMusic = function () {
        _musicOpen = !_musicOpen;
        var theme = document.body.getAttribute('data-theme') || 'ember';
        window.syncMusicUI(theme, _musicOpen);
        var icMusic = document.getElementById('ic-music');
        if (icMusic) icMusic.classList.toggle('on', _musicOpen);
    };

    // Sincronizar etiquetas entre variantes de música
    window._syncMusicLabel = function () {
        var name  = (document.getElementById('ambient-track-name')  || {}).textContent || '─';
        var genre = (document.getElementById('ambient-track-genre') || {}).textContent || '─';
        var fields = [
            ['ember-track-name',      name],
            ['mercury-track-name',    name],
            ['graphite-genre-label',  genre]
        ];
        fields.forEach(function (f) {
            var el = document.getElementById(f[0]);
            if (el) el.textContent = f[1];
        });
    };

    // Observar cambios en IDs del player.js
    document.addEventListener('DOMContentLoaded', function () {
        var nameEl = document.getElementById('ambient-track-name');
        if (nameEl) {
            var obs = new MutationObserver(window._syncMusicLabel);
            obs.observe(nameEl, { childList: true, characterData: true, subtree: true });
        }
    });

    // ── VIDEO FLOTANTE ──
    window.toggleVideo = function () {
        _videoVisible = !_videoVisible;
        _videoMinimized = false;
        var vf = document.getElementById('video-float');
        if (vf) {
            vf.classList.toggle('hidden', !_videoVisible);
            vf.classList.remove('minimized');
        }
        var icVideo = document.getElementById('ic-video');
        if (icVideo) icVideo.classList.toggle('on', _videoVisible);
    };

    window.minimizeVideoFloat = function () {
        _videoMinimized = !_videoMinimized;
        var vf = document.getElementById('video-float');
        if (!vf) return;

        // La clase .minimized usa width/height: 58px !important.
        // vf.style.height = 'X' NO puede ganarle a !important en CSS.
        // La única forma de ganar a un !important de hoja de estilos es
        // con style.setProperty(prop, val, 'important') — que crea un
        // inline !important que tiene mayor prioridad que cualquier regla.

        var EASE  = '0.4s cubic-bezier(0.34,1.56,0.64,1)';
        var TRANS  = 'width ' + EASE + ', height ' + EASE + ', border-radius ' + EASE;

        if (_videoMinimized) {
            // ── MINIMIZAR ──
            var rect  = vf.getBoundingClientRect();
            var initW = rect.width;
            var initH = rect.height;

            // 1. Agregar clase (oculta hijos, aplica fondo burbuja)
            vf.classList.add('minimized');

            // 2. Sobreescribir con inline !important el tamaño CSS !important
            vf.style.setProperty('width',         initW + 'px', 'important');
            vf.style.setProperty('height',        initH + 'px', 'important');
            vf.style.setProperty('border-radius', '8px',        'important');
            vf.style.transition = 'none';

            // 3. Reflow: el browser registra el valor inicial
            void vf.offsetHeight;

            // 4. Habilitar transición y animar al destino
            vf.style.transition = TRANS;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    vf.style.setProperty('width',         '58px', 'important');
                    vf.style.setProperty('height',        '58px', 'important');
                    vf.style.setProperty('border-radius', '50%',  'important');
                });
            });

            // 5. Al terminar, limpiar inline — la clase toma el control
            vf.addEventListener('transitionend', function _done(e) {
                if (e.propertyName !== 'width' && e.propertyName !== 'height') return;
                vf.style.removeProperty('width');
                vf.style.removeProperty('height');
                vf.style.removeProperty('border-radius');
                vf.style.transition = '';
                vf.removeEventListener('transitionend', _done);
            });

        } else {
            // ── RESTAURAR ──

            // 1. Medir tamaño natural SIN la clase (temporalmente sin transición)
            vf.style.transition = 'none';
            vf.style.removeProperty('width');
            vf.style.removeProperty('height');
            vf.style.removeProperty('border-radius');
            vf.classList.remove('minimized');
            void vf.offsetHeight;
            var natW = vf.getBoundingClientRect().width;
            var natH = vf.getBoundingClientRect().height;

            // 1b. Clamp posición: si restaurado queda fuera del viewport, reubicar.
            var curLeft = parseFloat(vf.style.left);
            var curTop  = parseFloat(vf.style.top);
            if (isNaN(curLeft) || isNaN(curTop)) {
                var r0 = vf.getBoundingClientRect();
                curLeft = r0.left; curTop = r0.top;
                vf.style.bottom = 'auto'; vf.style.right = 'auto';
                vf._tlInit = true;
            }
            var maxLeft = Math.max(0, window.innerWidth  - natW);
            var maxTop  = Math.max(0, window.innerHeight - natH);
            vf.style.left = Math.max(0, Math.min(curLeft, maxLeft)) + 'px';
            vf.style.top  = Math.max(0, Math.min(curTop,  maxTop))  + 'px';

            // 2. Volver al punto de partida (burbuja) para animar desde ahí
            vf.style.setProperty('width',         '58px', 'important');
            vf.style.setProperty('height',        '58px', 'important');
            vf.style.setProperty('border-radius', '50%',  'important');
            void vf.offsetHeight;

            // 3. Animar al tamaño natural
            vf.style.transition = TRANS;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    vf.style.setProperty('width',         natW + 'px', 'important');
                    vf.style.setProperty('height',        natH + 'px', 'important');
                    vf.style.setProperty('border-radius', '8px',       'important');
                });
            });

            // 4. Limpiar inline al terminar
            vf.addEventListener('transitionend', function _done(e) {
                if (e.propertyName !== 'width' && e.propertyName !== 'height') return;
                vf.style.removeProperty('width');
                vf.style.removeProperty('height');
                vf.style.removeProperty('border-radius');
                vf.style.transition = '';
                vf.removeEventListener('transitionend', _done);
            });
        }
    };

    // ── PILL TOGGLES (sidebar nueva) ──
    window.togglePillRow = function (row, storageKey, callback) {
        var pill = row.querySelector('.pill');
        if (!pill) return;
        var isNowOn = pill.classList.contains('off');
        pill.classList.toggle('on',  isNowOn);
        pill.classList.toggle('off', !isNowOn);
        try {
            if (typeof uSet === 'function') uSet(storageKey, String(isNowOn));
            else localStorage.setItem(storageKey, String(isNowOn));
        } catch (e) {}
        // Sincronizar checkboxes ocultos que algunos módulos necesitan leer
        var _CB_MAP = {
            'toggle_auto_translate': 'auto-translate',
            'grammar_review_activo': 'grammar-review',
            'toggle_tts_humanizer':  'tts-humanizer',
            'toggle_auto_next':      'auto-next-chapter'
        };
        var cbId = _CB_MAP[storageKey];
        if (cbId) { var cb = document.getElementById(cbId); if (cb) cb.checked = isNowOn; }
        if (typeof callback === 'function') callback();
        if (typeof marcarCambioPendiente === 'function') marcarCambioPendiente();
    };

    // ── MIRROR: lista de capítulos ──
    window.renderChListMirror = function () {
        var select = document.getElementById('chapters');
        var listEl = document.getElementById('ch-list-new');
        if (!select || !listEl) return;

        listEl.innerHTML = '';
        Array.from(select.options).forEach(function (opt, idx) {
            var item = document.createElement('div');
            item.className = 'ch-item' + (idx === select.selectedIndex ? ' active' : '');
            item.dataset.idx = idx;
            item.innerHTML = '<span class="ch-num">' + (idx + 1) + '</span>' + escapeHtml(opt.text);
            item.addEventListener('click', function () {
                select.selectedIndex = idx;
                select.dispatchEvent(new Event('change'));
                listEl.querySelectorAll('.ch-item').forEach(function (c) { c.classList.remove('active'); });
                item.classList.add('active');
                // Actualizar breadcrumb
                var bc = document.getElementById('current-chapter-title');
                if (bc) bc.textContent = opt.text;
                // Actualizar book title en sidebar
                var sbTitle = document.getElementById('sb-book-title');
                // Solo si existe, no sobreescribir
            });
            listEl.appendChild(item);
        });

        // Sincronizar capítulo activo con breadcrumb
        if (select.selectedIndex >= 0) {
            var activeOpt = select.options[select.selectedIndex];
            var bc = document.getElementById('current-chapter-title');
            if (bc && activeOpt) bc.textContent = activeOpt.text;
        }
    };

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Observar cambios en el <select> oculto de capítulos
    document.addEventListener('DOMContentLoaded', function () {
        var sel = document.getElementById('chapters');
        if (sel) {
            var chapObs = new MutationObserver(window.renderChListMirror);
            chapObs.observe(sel, { childList: true });
        }
    });

    // ── SINCRONIZAR PILLS DEL SIDEBAR ──
    window.syncSidebarPills = function () {
        var get = (typeof uGet === 'function') ? uGet : function (k) { return localStorage.getItem(k); };
        var map = {
            'pill-translate': get('toggle_auto_translate') === 'true',
            'pill-tts-local': get('tts_servidor_live')     === 'true',
            'pill-grammar':   get('grammar_review_activo') === 'true',
            'pill-humanizer': get('toggle_tts_humanizer')  === 'true',
            'pill-autonext':  get('toggle_auto_next') !== 'false'
        };
        Object.keys(map).forEach(function (id) {
            var pill = document.getElementById(id);
            if (!pill) return;
            var isOn = map[id];
            pill.classList.toggle('on',  isOn);
            pill.classList.toggle('off', !isOn);
        });
        // Sincronizar los botones de motor TTS del sidebar (Browser / Edge)
        var live = get('tts_servidor_live') === 'true';
        if (typeof window._sbTtsSetEngine === 'function') {
            window._sbTtsSetEngine(live ? 'edge' : 'browser');
        }
    };

    // ── TOAST APILABLE ──
    // Contenedor único fijo; cada llamada crea un item que se apila hacia arriba.
    var _toastContainer = null;

    function _getToastContainer() {
        if (_toastContainer && document.body.contains(_toastContainer)) return _toastContainer;
        _toastContainer = document.createElement('div');
        _toastContainer.id = 'toast-stack';
        document.body.appendChild(_toastContainer);
        return _toastContainer;
    }

    window.showToast = function (msg) {
        if (!msg) return;
        var container = _getToastContainer();

        var item = document.createElement('div');
        item.className = 'toast-item';
        item.innerHTML = '<div class="toast-dot"></div><span>' + String(msg).replace(/</g,'&lt;') + '</span>';
        container.appendChild(item);

        // Animar entrada
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { item.classList.add('show'); });
        });

        // Auto-dismiss
        var timer = setTimeout(function () {
            item.classList.remove('show');
            item.addEventListener('transitionend', function () {
                if (item.parentNode) item.parentNode.removeChild(item);
            }, { once: true });
            // Fallback si transitionend no dispara
            setTimeout(function () {
                if (item.parentNode) item.parentNode.removeChild(item);
            }, 400);
        }, 3500);

        // Click para cerrar antes
        item.addEventListener('click', function () {
            clearTimeout(timer);
            item.classList.remove('show');
            setTimeout(function () {
                if (item.parentNode) item.parentNode.removeChild(item);
            }, 300);
        });
    };

    // ── UNIFICAR NOTIFICACIONES: solo toast, suprimir #notification heredado ──
    document.addEventListener('DOMContentLoaded', function () {
        var _orig = window.mostrarNotificacion;
        if (typeof _orig === 'function') {
            window.mostrarNotificacion = function (msg, tipo) {
                _orig.call(window, msg, tipo);
                // También mostrar en toast si el mensaje no es muy largo
                if (msg && msg.length < 120) showToast(msg);
            };
        }
    });

    // ── ACTUALIZAR SIDEBAR METADATA ──
    window.actualizarSidebarLibro = function (titulo, numCaps, porcentaje) {
        var sbTitle = document.getElementById('sb-book-title');
        var sbMeta  = document.getElementById('sb-book-meta');
        var sbFill  = document.getElementById('sb-prog-fill');
        var sbPct   = document.getElementById('sb-prog-pct');
        if (sbTitle) sbTitle.textContent = titulo || 'Sin título';
        if (sbMeta)  sbMeta.textContent  = (numCaps || 0) + ' caps.';
        var pct = porcentaje || 0;
        if (sbFill) sbFill.style.width = pct + '%';
        if (sbPct)  sbPct.textContent  = pct + '%';
    };

    // ── Redirigir abrirAjustes al nuevo panel ──
    document.addEventListener('DOMContentLoaded', function () {
        var _origAbrir = window.abrirAjustes;
        window.abrirAjustes = function (tab) {
            window.openSettings();
            // Si hay una pestaña específica, hacer scroll a la sección
            if (tab) {
                setTimeout(function () {
                    var map = {
                        'apikeys':    'settings-api-section',
                        'reemplazar': 'settings-reemplazar-section',
                        'apariencia': 'settings-tema-section'
                    };
                    var targetId = map[tab];
                    if (targetId) {
                        var el = document.getElementById(targetId);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }
                }, 350);
            }
        };

        var _origCerrar = window.cerrarAjustes;
        window.cerrarAjustes = function () {
            window.closeSettings();
        };
    });

    // ── Teclado ──
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _settingsOpen) window.closeSettings();
    });

    // ── Boot ──
    document.addEventListener('DOMContentLoaded', init);

    // ── Restaurar tema cuando el usuario autenticado esté listo ──
    // init() corre en DOMContentLoaded con prefijo 'guest' — si el usuario está
    // autenticado, su tema se guarda bajo 'user_XXXX_reader-theme' y no se encuentra.
    // auth:ready dispara después de uSetUser() → re-leer con el prefijo correcto.
    document.addEventListener('auth:ready', function () {
        var saved;
        try { saved = (typeof uGet === 'function') ? uGet('reader-theme') : localStorage.getItem('reader-theme'); } catch (e) {}
        if (saved && THEMES[saved]) {
            _currentTheme = _pendingTheme = saved;
            applyThemeDOM(_currentTheme);
            _updateThemeCards(_currentTheme);
        }
    });

    // Exponer init para que init.js pueda llamarlo explícitamente si es necesario
    window.initTheme = init;

    // Exponer estado
    window._getThemeState = function () {
        return { current: _currentTheme, pending: _pendingTheme, musicOpen: _musicOpen, videoVisible: _videoVisible };
    };

})();