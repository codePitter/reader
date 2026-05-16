// ═══════════════════════════════════════════════════════════
// UI-EXTRA.JS — Funciones de UI migradas desde index.html
// ═══════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── Toggle lista de capítulos (ic-chapters) ──────────────
    window.toggleChapterList = function () {
        var sidebar = document.getElementById('sidebar');
        var ic      = document.getElementById('ic-chapters');
        if (!sidebar || !ic) return;
        var isOn = ic.classList.contains('on');
        if (isOn) {
            ic.classList.remove('on');
            sidebar.classList.add('ch-list-collapsed');
        } else {
            ic.classList.add('on');
            sidebar.classList.remove('ch-list-collapsed');
        }
    };

    // ── Actualizar texto del preview de capítulo activo ───────
    window._actualizarChPreview = function () {
        var preview = document.getElementById('ch-preview-title');
        if (!preview) return;
        var title = (document.getElementById('current-chapter-title') || {}).textContent
                 || (document.getElementById('ch-list-new')
                        ?.querySelector('.ch-item.active')
                        ?.textContent?.trim())
                 || '— sin capítulo —';
        preview.textContent = title;
    };

    // ── Toggle colapso completo del sidebar ──────────────────
    window.toggleSidebarPanel = function () {
        var app = document.querySelector('.app');
        var ic  = document.getElementById('ic-toggle-sidebar');
        if (!app) return;

        var collapsing = !app.classList.contains('sidebar-collapsed');
        app.classList.toggle('sidebar-collapsed', collapsing);

        if (ic) {
            var sp = ic.querySelector('.material-symbols-outlined');
            if (collapsing) {
                ic.title = 'Expandir panel';
                if (sp) sp.textContent = 'left_panel_open';
            } else {
                ic.title = 'Colapsar panel';
                if (sp) sp.textContent = 'left_panel_close';
            }
        }
    };

    // ── Toggle desde botones del rail ────────────────────────
    // - Sidebar colapsado                → expandir + ejecutar acción
    // - Sidebar abierto + botón activo   → colapsar, no ejecutar acción
    // - Sidebar abierto + botón inactivo → ejecutar acción normalmente
    window._togglePanelRail = function (icEl) {
        var app       = document.querySelector('.app');
        var collapsed = app && app.classList.contains('sidebar-collapsed');

        if (collapsed) {
            toggleSidebarPanel();
            return false; // expandió → ejecutar la acción
        }

        if (icEl && icEl.classList.contains('on')) {
            toggleSidebarPanel();
            return true;  // colapsó → no ejecutar la acción
        }

        return false; // abierto sin 'on' → ejecutar la acción
    };

    // ── Toggle biblioteca ─────────────────────────────────────
    window.toggleBibliotecaRail = function () {
        var ic = document.getElementById('ic-biblioteca');
        if (ic && ic.classList.contains('on')) {
            if (typeof window._bibCerrar === 'function') window._bibCerrar();
            ic.classList.remove('on');
        } else {
            if (typeof abrirBiblioteca === 'function') {
                abrirBiblioteca();
                if (ic) ic.classList.add('on');
            }
        }
    };

    window._bibSetRailActive = function (active) {
        var ic = document.getElementById('ic-biblioteca');
        if (ic) ic.classList.toggle('on', !!active);
    };

    // ── Minimizar / restaurar video flotante ─────────────────
    window.minimizeVideoFloat = function () {
        var vf = document.getElementById('video-float');
        if (!vf) return;

        if (vf.classList.contains('minimized')) {
            // RESTAURAR — posicionar en esquina inferior-derecha del text area
            vf.classList.remove('minimized');
            var margin = 35;
            var ta = document.getElementById('text-area-wrap') || document.querySelector('.main-panel');
            if (ta) {
                var rect = ta.getBoundingClientRect();
                // Limpiar posición de drag (left/top) y usar right/bottom relativo al área
                vf.style.left = '';
                vf.style.top  = '';
                vf.style.right  = (window.innerWidth  - rect.right  + margin) + 'px';
                vf.style.bottom = (window.innerHeight - rect.bottom + margin) + 'px';
                vf._tlInit = false; // permitir reconversión en el próximo drag
            }
        } else {
            // MINIMIZAR
            vf.classList.add('minimized');
        }
    };

    // ── Toggle video flotante (rail ic-video) ────────────────
    // Muestra u oculta el float quitando/añadiendo la clase .hidden.
    // La clase .hidden ya está definida en style.css con opacity:0 + pointer-events:none.
    window.toggleVideo = function () {
        var vf = document.getElementById('video-float');
        var ic = document.getElementById('ic-video');
        if (!vf) return;
        var oculto = vf.classList.contains('hidden');
        vf.classList.toggle('hidden', !oculto);
        if (ic) ic.classList.toggle('on', oculto);
        // Persistir estado
        try { if (typeof uSet === 'function') uSet('video_float_visible', oculto ? 'true' : 'false'); } catch(e) {}
        // Arrancar el loop de render cuando se hace visible
        if (oculto && typeof _startFloatLoop === 'function') _startFloatLoop();
    };

    // Restaurar visibilidad del float al cargar (respeta preferencia guardada)
    document.addEventListener('DOMContentLoaded', function () {
        var vf = document.getElementById('video-float');
        var ic = document.getElementById('ic-video');
        if (!vf) return;
        var saved = (typeof uGet === 'function') ? uGet('video_float_visible') : null;
        // Default: visible (true) si nunca se guardó
        var visible = saved !== 'false';
        vf.classList.toggle('hidden', !visible);
        if (ic) ic.classList.toggle('on', visible);
        if (visible && typeof _startFloatLoop === 'function') _startFloatLoop();
    });

    // ── Indicador estado servidor TTS ─────────────────────────
    window._actualizarEstadoServidor = function (online) {
        var dot   = document.getElementById('server-dot');
        var label = document.getElementById('server-status-label');
        if (dot)   dot.className = 'server-dot ' + (online ? 'online' : 'offline');
        if (label) {
            label.style.color = online ? '#4ade80' : '';
            label.textContent = online ? 'TTS online' : 'TTS Local';
        }
    };

    setInterval(function () {
        if (typeof servidorTTSDisponible !== 'undefined') {
            window._actualizarEstadoServidor(servidorTTSDisponible);
        }
    }, 3000);

    // ══════════════════════════════════════════════════════════
    // VIDEO FLOTANTE — drag desde el header + restaurar burbuja
    // ══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function () {
        var vf = document.getElementById('video-float');
        if (!vf) return;

        var header = vf.querySelector('.vid-header');
        if (!header) return;

        var _dragging = false, _startX, _startY, _origLeft, _origTop, _hasMoved = false;

        function _activateTopLeft() {
            if (vf._tlInit) return;
            var r = vf.getBoundingClientRect();
            vf.style.bottom = 'auto'; vf.style.right = 'auto';
            vf.style.left = r.left + 'px'; vf.style.top = r.top + 'px';
            vf._tlInit = true;
        }
        function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
        function _startDrag(clientX, clientY) {
            _activateTopLeft();
            _dragging = true; _hasMoved = false;
            _startX = clientX; _startY = clientY;
            _origLeft = parseFloat(vf.style.left) || 0;
            _origTop  = parseFloat(vf.style.top)  || 0;
            vf.style.transition = 'none'; vf.style.userSelect = 'none';
        }
        // Exponer para que el dock pueda retomar el drag tras desacoplar
        window._startFloatDragExternal = function (cx, cy) { _startDrag(cx, cy); };

        // Drag desde header (normal)
        header.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.closest && e.target.closest('.vid-hbtn, .vc-btn')) return;
            _startDrag(e.clientX, e.clientY);
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // Drag desde burbuja (minimizado)
        vf.addEventListener('mousedown', function (e) {
            if (!vf.classList.contains('minimized')) return;
            if (e.button !== 0) return;
            _startDrag(e.clientX, e.clientY);
            vf.style.cursor = 'grabbing';
            e.preventDefault();
        });

        header.addEventListener('dblclick', function (e) {
            if (e.target.closest && e.target.closest('.vid-hbtn, .vc-btn')) return;
            if (typeof window.minimizeVideoFloat === 'function') window.minimizeVideoFloat();
        });

        document.addEventListener('mousemove', function (e) {
            if (!_dragging) return;
            var dx = e.clientX - _startX, dy = e.clientY - _startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _hasMoved = true;
            vf.style.left = _clamp(_origLeft + dx, 0, window.innerWidth  - vf.offsetWidth)  + 'px';
            vf.style.top  = _clamp(_origTop  + dy, 0, window.innerHeight - vf.offsetHeight) + 'px';

            // ── Ghost preview de dock (estilo Windows snap) ──────
            // Solo activa cuando el BORDE DERECHO del float toca el margen derecho
            if (!window._vfDocked) {
                var vfR   = vf.getBoundingClientRect();
                var ghost = document.getElementById('vf-dock-ghost');
                var distRight = window.innerWidth - vfR.right; // px que faltan para el borde
                if (distRight <= 40) {
                    if (!ghost) {
                        ghost = document.createElement('div');
                        ghost.id = 'vf-dock-ghost';
                        document.body.appendChild(ghost);
                    }
                    // Opacidad 0→0.45 en los últimos 40px
                    var ratio = 1 - (distRight / 40);
                    ghost.style.opacity = (ratio * 0.45).toFixed(2);
                } else if (ghost) {
                    ghost.style.opacity = '0';
                }
            }
        });
        document.addEventListener('mouseup', function () {
            if (!_dragging) return;
            _dragging = false; vf.style.transition = ''; vf.style.userSelect = '';
            header.style.cursor = ''; vf.style.cursor = '';
            // Quitar ghost siempre al soltar
            var ghost = document.getElementById('vf-dock-ghost');
            if (ghost) { ghost.style.opacity = '0'; }
            // ── Snap: sólo cuando el borde derecho TOCA el borde del viewport ──
            if (_hasMoved && !window._vfDocked) {
                if (vf.getBoundingClientRect().right >= window.innerWidth - 8) {
                    window._dockVideoFloat();
                }
            }
        });

        function _startTouchDrag(e) {
            _activateTopLeft(); _dragging = true; _hasMoved = false;
            _startX = e.touches[0].clientX; _startY = e.touches[0].clientY;
            _origLeft = parseFloat(vf.style.left) || 0;
            _origTop  = parseFloat(vf.style.top)  || 0;
            vf.style.transition = 'none';
        }
        header.addEventListener('touchstart', function (e) {
            if (e.target.closest && e.target.closest('.vid-hbtn')) return;
            _startTouchDrag(e);
        }, { passive: true });
        vf.addEventListener('touchstart', function (e) {
            if (!vf.classList.contains('minimized')) return;
            _startTouchDrag(e);
        }, { passive: true });
        document.addEventListener('touchmove', function (e) {
            if (!_dragging) return;
            var dx = e.touches[0].clientX - _startX, dy = e.touches[0].clientY - _startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _hasMoved = true;
            vf.style.left = _clamp(_origLeft + dx, 0, window.innerWidth  - vf.offsetWidth)  + 'px';
            vf.style.top  = _clamp(_origTop  + dy, 0, window.innerHeight - vf.offsetHeight) + 'px';
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchend', function () {
            if (!_dragging) return;
            _dragging = false; vf.style.transition = '';
            if (_hasMoved && !window._vfDocked) {
                if (vf.getBoundingClientRect().right >= window.innerWidth - 8) {
                    window._dockVideoFloat();
                }
            }
        });

        vf.addEventListener('click', function (e) {
            if (_hasMoved) { _hasMoved = false; return; }
            if (vf.classList.contains('minimized') &&
                !(e.target.closest && e.target.closest('.vid-hbtn, .vc-btn'))) {
                if (typeof window.minimizeVideoFloat === 'function') window.minimizeVideoFloat();
            }
        });
    });

    // ══════════════════════════════════════════════════════════
    // CONTROLES DE LECTURA — visibilidad hover/paused
    // ══════════════════════════════════════════════════════════

    // Helper compartido: true si el TTS está activo en este momento.
    // Definido a nivel de módulo para que todos los listeners puedan usarlo.
    function _isPlaying() {
        var bp = document.getElementById('btn-play');
        if (!bp) return false;
        var t = bp.textContent || bp.innerText || '';
        return t.trim() === '⏸' || bp.classList.contains('pause');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var rc = document.getElementById('reading-controls');
        if (!rc) return;

        function _syncRc() {
            var playing = _isPlaying();
            var btn = document.getElementById('rc-play');
            if (btn) btn.textContent = playing ? '⏸' : '▶';
            if (playing) {
                rc.classList.remove('rc-visible');
                rc.classList.remove('rc-mouse-active');
            } else {
                rc.classList.add('rc-visible');
            }
        }

        // Observar cambios en el botón play nativo
        var bp = document.getElementById('btn-play');
        if (bp) {
            new MutationObserver(_syncRc).observe(bp, {
                characterData: true, childList: true, subtree: true, attributes: true, attributeFilter: ['class']
            });
        }

        // Polling de respaldo (por si el MutationObserver se pierde algún cambio)
        setInterval(_syncRc, 500);
        _syncRc();
    });

    // ══════════════════════════════════════════════════════════
    // AUTO-COLAPSAR SIDEBAR AL INICIAR REPRODUCCIÓN (cualquier método)
    // Observa el botón #btn-play: cuando cambia a ⏸ (reproduciendo) → colapsar
    // ══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function () {
        function _colapsarSidebarSiAbierto() {
            var app = document.querySelector('.app');
            if (app && !app.classList.contains('sidebar-collapsed')) {
                if (typeof toggleSidebarPanel === 'function') toggleSidebarPanel();
            }
        }
        var bp = document.getElementById('btn-play');
        if (bp) {
            new MutationObserver(function () {
                var t = (bp.textContent || bp.innerText || '').trim();
                if (t === '⏸') _colapsarSidebarSiAbierto();
            }).observe(bp, {
                childList: true, characterData: true, subtree: true, attributes: true
            });
        }
    });

    // ══════════════════════════════════════════════════════════
    // CONTROLES DE LECTURA — visibles al detectar movimiento en el text area
    // Se ocultan solos 2.5 s después de que el ratón deja de moverse
    // ══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function () {
        var ta = document.getElementById('text-area-wrap');
        var rc = document.getElementById('reading-controls');
        if (!ta || !rc) return;

        var _rcMoveTimer = null;

        ta.addEventListener('mousemove', function () {
            // Solo mostrar con mouse-move cuando NO está reproduciendo
            // (al reproducir, solo el CSS :hover sobre los botones los muestra)
            if (_isPlaying()) return;
            rc.classList.add('rc-mouse-active');
            clearTimeout(_rcMoveTimer);
            _rcMoveTimer = setTimeout(function () {
                rc.classList.remove('rc-mouse-active');
            }, 2500);
        });

        ta.addEventListener('mouseleave', function () {
            clearTimeout(_rcMoveTimer);
            rc.classList.remove('rc-mouse-active');
        });
    });

    // ══════════════════════════════════════════════════════════
    // BARRA ESPACIADORA → play/pause
    // No aplica cuando el foco está en un input/textarea/select
    // ══════════════════════════════════════════════════════════
    document.addEventListener('keydown', function (e) {
        if (e.code !== 'Space' && e.key !== ' ') return;
        var tag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        // Evitar scroll de página
        e.preventDefault();
        if (typeof togglePlayPause === 'function') togglePlayPause();
    });

    // ── Prev / Next para los controles de lectura ────────────────
    window.rcPrev = function () {
        if (typeof videoCapituloAnterior === 'function') { videoCapituloAnterior(); return; }
        var sel = document.getElementById('chapters');
        if (sel && sel.selectedIndex > 0) { sel.selectedIndex--; sel.dispatchEvent(new Event('change')); }
    };
    window.rcNext = function () {
        if (typeof videoCapituloSiguiente === 'function') { videoCapituloSiguiente(); return; }
        var sel = document.getElementById('chapters');
        if (sel && sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; sel.dispatchEvent(new Event('change')); }
    };

    // ══════════════════════════════════════════════════════════
    // AUTO-COLAPSAR SIDEBAR + BLOQUEAR MODO CINE AL INICIAR TTS
    // ══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function () {
        var btnLeer = document.getElementById('btn-leer-capitulo');
        if (!btnLeer) return;

        // Se ejecuta en fase capture — ANTES que aplicarConfiguracion()
        btnLeer.addEventListener('click', function () {
            // 1. Colapsar sidebar
            var app = document.querySelector('.app');
            if (app && !app.classList.contains('sidebar-collapsed')) {
                if (typeof toggleSidebarPanel === 'function') toggleSidebarPanel();
            }
            // 2. Bloquear apertura automática del modo cine en ESTA llamada
            //    (tts.js comprueba window._noAutoVideo antes de llamar abrirvideo)
            window._noAutoVideo = true;
            // Limpiar el flag tras un tick para no afectar futuras llamadas manuales
            setTimeout(function () { window._noAutoVideo = false; }, 300);
        }, true); // capture: antes que el onclick del botón
    });

    // ══════════════════════════════════════════════════════════
    // VIDEO FLOAT — DOCK SIDEBAR (snap-to-right edge)
    // Al arrastrar el float contra el borde derecho se convierte
    // en un panel lateral de 210px con visor + player de música.
    // ══════════════════════════════════════════════════════════

    window._vfDocked        = false;
    var _vfDockAnimFrame    = null;
    var _vfDockSyncTimer    = null;

    // Inicializar icono del botón al cargar
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('vid-hbtn-dock');
        if (btn) { btn.textContent = '⊣'; btn.title = 'Acoplar al panel lateral'; }
    });

    // ── Inyectar el panel dock ───────────────────────────────
    function _inyectarVfDock() {
        if (document.getElementById('vf-sidebar-dock')) return;
        var dock = document.createElement('div');
        dock.id = 'vf-sidebar-dock';
        dock.innerHTML =
            '<div class="vfd-topbar">' +
                '<div class="vfd-live-dot"></div>' +
                '<span class="vfd-live-label">LIVE</span>' +
                '<button class="vfd-undock" onclick="window._undockVideoFloat()" title="Desacoplar">⊟</button>' +
            '</div>' +
            '<div class="vfd-screen"><canvas id="vfd-canvas"></canvas></div>' +
            '<div class="vfd-controls">' +
                '<div class="vfd-ctrl-btn" id="vfd-rec" ' +
                     'onclick="(typeof _REC!==\'undefined\'&&_REC.activo)?recorder_detener():recorder_iniciar()">● REC</div>' +
                '<div class="vfd-ctrl-btn" onclick="abrirvideo()">⤢ Cine</div>' +
                '<div class="vfd-ctrl-btn" onclick="exportarVideoDirecto()">⤓ MP4</div>' +
            '</div>' +
            '<div class="vfd-music">' +
                '<div class="vfd-music-hdr">' +
                    '<div class="vfd-eq" id="vfd-eq"><span></span><span></span><span></span><span></span></div>' +
                    '<div class="vfd-track-info">' +
                        '<div class="vfd-track-name"  id="vfd-track-name">Selecciona un género</div>' +
                        '<div class="vfd-track-genre" id="vfd-track-genre">─</div>' +
                    '</div>' +
                    '<div class="vfd-play-row">' +
                        '<button class="vfd-play-btn" id="vfd-play-btn" onclick="toggleAmbientPlay()">▶</button>' +
                        '<button class="vfd-play-btn" onclick="siguienteTrack()">⏭</button>' +
                    '</div>' +
                '</div>' +
                '<div class="vfd-genres">' +
                    '<button class="vfd-gbtn" data-genre="mystery"  onclick="selectGenre(\'mystery\')">Misterio</button>' +
                    '<button class="vfd-gbtn" data-genre="suspense" onclick="selectGenre(\'suspense\')">Suspenso</button>' +
                    '<button class="vfd-gbtn" data-genre="drama"    onclick="selectGenre(\'drama\')">Drama</button>' +
                    '<button class="vfd-gbtn" data-genre="action"   onclick="selectGenre(\'action\')">Acción</button>' +
                    '<button class="vfd-gbtn" data-genre="fantasy"  onclick="selectGenre(\'fantasy\')">Fantasía</button>' +
                    '<button class="vfd-gbtn" data-genre="romance"  onclick="selectGenre(\'romance\')">Romance</button>' +
                    '<button class="vfd-gbtn" data-genre="lofi"     onclick="selectGenre(\'lofi\')">Lo-Fi</button>' +
                    '<button class="vfd-gbtn" data-genre="nature"   onclick="selectGenre(\'nature\')">Naturaleza</button>' +
                    '<button class="vfd-gbtn vfd-gbtn-detect" onclick="detectarGeneroConIA()">✨ Auto-detectar</button>' +
                '</div>' +
                '<div class="vfd-vol-row">' +
                    '<span class="vfd-vol-lbl">Vol</span>' +
                    '<input type="range" class="vfd-vol-slider" min="0" max="100" value="15" ' +
                           'oninput="setAmbientVolume(this.value);this.nextElementSibling.textContent=this.value+\'%\'">' +
                    '<span class="vfd-vol-pct">15%</span>' +
                '</div>' +
            '</div>';
        document.body.appendChild(dock);

        // ── Drag-to-undock desde el topbar del dock ──────────────
        // Arrastrar el topbar más de 8px suelta el dock y
        // convierte el movimiento en drag normal del float restaurado.
        (function () {
            var topbar = dock.querySelector('.vfd-topbar');
            if (!topbar) return;
            var _dndActive = false, _dndSX, _dndSY;

            topbar.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (e.target.closest && e.target.closest('.vfd-undock')) return;
                _dndActive = true;
                _dndSX = e.clientX; _dndSY = e.clientY;
                e.preventDefault();
            });

            function _dndMove(e) {
                if (!_dndActive) return;
                var dx = e.clientX - _dndSX, dy = e.clientY - _dndSY;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    _dndActive = false;
                    document.removeEventListener('mousemove', _dndMove);
                    document.removeEventListener('mouseup', _dndUp);
                    // Desacoplar y reubicar el float cerca del cursor
                    window._undockVideoFloat();
                    requestAnimationFrame(function () {
                        var floatEl = document.getElementById('video-float');
                        if (!floatEl) return;
                        var fw = floatEl.offsetWidth  || 320;
                        var fh = floatEl.offsetHeight || 200;
                        var nx = Math.max(0, Math.min(e.clientX - fw / 2, window.innerWidth  - fw));
                        var ny = Math.max(0, Math.min(e.clientY - 18,    window.innerHeight - fh));
                        floatEl.style.right  = '';
                        floatEl.style.bottom = '';
                        floatEl.style.left   = nx + 'px';
                        floatEl.style.top    = ny + 'px';
                        floatEl._tlInit = true;
                        if (typeof window._startFloatDragExternal === 'function') {
                            window._startFloatDragExternal(e.clientX, e.clientY);
                        }
                    });
                }
            }
            function _dndUp() { _dndActive = false; }

            document.addEventListener('mousemove', _dndMove);
            document.addEventListener('mouseup', _dndUp);
        })();

        // Sincronizar volumen inicial
        var mainVol = document.getElementById('ambient-volume');
        if (mainVol) {
            var vfdSlider = dock.querySelector('.vfd-vol-slider');
            var vfdPct    = dock.querySelector('.vfd-vol-pct');
            if (vfdSlider) { vfdSlider.value = mainVol.value; }
            if (vfdPct)    { vfdPct.textContent = mainVol.value + '%'; }
        }

        _vfDockLoop();
        _vfDockSyncTimer = setInterval(_vfSyncMusicUI, 350);
    }

    // ── Loop de canvas ───────────────────────────────────────
    function _vfDockLoop() {
        if (!window._vfDocked) return;
        var fc = document.getElementById('vfd-canvas');
        if (fc) {
            var W = fc.parentElement.clientWidth;
            var H = fc.parentElement.clientHeight;
            if (W > 0 && H > 0) {
                if (fc.width !== W || fc.height !== H) { fc.width = W; fc.height = H; }
                var ctx = fc.getContext('2d');
                ctx.clearRect(0, 0, W, H);
                ctx.fillStyle = '#0a0908';
                ctx.fillRect(0, 0, W, H);
                var src = null;
                if (typeof videoActive !== 'undefined' && videoActive && typeof videoCanvas !== 'undefined' && videoCanvas) {
                    src = videoCanvas;
                } else {
                    var flt = document.getElementById('vid-float-canvas');
                    if (flt && flt.width > 0) src = flt;
                }
                if (src) {
                    try {
                        var scale = Math.min(W / (src.width || 1), H / (src.height || 1));
                        var dw = Math.round((src.width || W) * scale);
                        var dh = Math.round((src.height || H) * scale);
                        ctx.drawImage(src, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
                    } catch (ex) {}
                }
            }
        }
        _vfDockAnimFrame = requestAnimationFrame(_vfDockLoop);
    }

    // ── Sync periódico de estado musical ────────────────────
    function _vfSyncMusicUI() {
        // track name / genre
        var sName  = document.getElementById('ambient-track-name');
        var sGenre = document.getElementById('ambient-track-genre');
        var sPlay  = document.getElementById('ambient-play-btn');
        var sEq    = document.getElementById('ambient-eq');
        var dName  = document.getElementById('vfd-track-name');
        var dGenre = document.getElementById('vfd-track-genre');
        var dPlay  = document.getElementById('vfd-play-btn');
        var dEq    = document.getElementById('vfd-eq');
        if (sName  && dName  && sName.textContent  !== dName.textContent)  dName.textContent  = sName.textContent;
        if (sGenre && dGenre && sGenre.textContent !== dGenre.textContent) dGenre.textContent = sGenre.textContent;
        if (sPlay  && dPlay  && sPlay.textContent  !== dPlay.textContent)  dPlay.textContent  = sPlay.textContent;
        if (sEq && dEq) dEq.classList.toggle('playing', sEq.classList.contains('playing'));
        // género activo
        var curGenre = (typeof ambientGenre !== 'undefined') ? ambientGenre : null;
        document.querySelectorAll('#vf-sidebar-dock .vfd-gbtn').forEach(function (btn) {
            btn.classList.toggle('vfd-gbtn-on', btn.dataset.genre === curGenre);
        });
        // REC state
        var mRec = document.getElementById('vid-float-rec');
        var dRec = document.getElementById('vfd-rec');
        if (mRec && dRec) dRec.classList.toggle('active', mRec.classList.contains('active'));
    }

    // ── Sync icon del botón en el float ─────────────────────
    function _syncDockBtn(docked) {
        var btn = document.getElementById('vid-hbtn-dock');
        if (!btn) return;
        if (docked) {
            btn.textContent = '⊢';   // flecha apuntando afuera → desacoplar
            btn.title       = 'Desacoplar';
        } else {
            btn.textContent = '⊣';   // flecha apuntando al panel → acoplar
            btn.title       = 'Acoplar al panel lateral';
        }
    }

    // ── Toggle público (llamado desde el botón del float) ────
    window._toggleDockVideoFloat = function () {
        if (window._vfDocked) {
            window._undockVideoFloat();
        } else {
            window._dockVideoFloat();
        }
    };
    window._dockVideoFloat = function () {
        if (window._vfDocked) return;
        window._vfDocked = true;
        // Quitar ghost antes de mostrar el dock real
        var ghost = document.getElementById('vf-dock-ghost');
        if (ghost) { ghost.style.opacity = '0'; setTimeout(function () { if (ghost.parentNode) ghost.remove(); }, 160); }
        var vf = document.getElementById('video-float');
        if (vf) vf.classList.add('vf-hidden-for-dock');
        // Empujar el reading-wrap para que no quede debajo del dock
        var app = document.querySelector('.app');
        if (app) app.classList.add('vf-docked');
        _inyectarVfDock();
        _syncDockBtn(true);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var dock = document.getElementById('vf-sidebar-dock');
                if (dock) dock.classList.add('vfd-visible');
            });
        });
    };

    window._undockVideoFloat = function () {
        window._vfDocked = false;
        var dock = document.getElementById('vf-sidebar-dock');
        var vf   = document.getElementById('video-float');
        if (dock) {
            dock.classList.remove('vfd-visible');
            setTimeout(function () { if (dock.parentNode) dock.remove(); }, 300);
        }
        // Restaurar reading-wrap
        var app = document.querySelector('.app');
        if (app) app.classList.remove('vf-docked');
        if (vf) {
            vf.classList.remove('vf-hidden-for-dock');
            vf.style.left   = '';
            vf.style.top    = '';
            vf.style.right  = '20px';
            vf.style.bottom = '58px';
            vf._tlInit = false;
        }
        _syncDockBtn(false);
        if (_vfDockAnimFrame) { cancelAnimationFrame(_vfDockAnimFrame); _vfDockAnimFrame = null; }
        if (_vfDockSyncTimer) { clearInterval(_vfDockSyncTimer); _vfDockSyncTimer = null; }

        // ── Reiniciar loop de render del float ──────────────────
        // El loop fue cancelado por el dock. Necesitamos esperar a que:
        //   a) el float ya no tenga transform/opacity overrides
        //   b) el layout haya recalculado dimensiones reales del canvas
        // Hacemos dos intentos: uno rápido (layout pass) y uno de respaldo (150ms).
        function _reiniciarLoopFloat() {
            var fc = document.getElementById('vid-float-canvas');
            if (fc) {
                var screen = fc.parentElement;
                if (screen) {
                    var W = screen.clientWidth, H = screen.clientHeight;
                    if (W > 0 && H > 0) {
                        fc.width  = W;
                        fc.height = H;
                        // Limpiar canvas para evitar artefactos residuales del dock
                        var ctx = fc.getContext('2d');
                        if (ctx) { ctx.clearRect(0, 0, W, H); }
                    }
                }
            }
            if (typeof _stopFloatLoop  === 'function') _stopFloatLoop();
            if (typeof _startFloatLoop === 'function') _startFloatLoop();
        }

        // Intento 1 — tras el primer layout pass (~1 frame)
        requestAnimationFrame(function () {
            requestAnimationFrame(_reiniciarLoopFloat);
        });
        // Intento 2 — respaldo para máquinas lentas o cuando el rAF del dock-DnD
        // aún no terminó de reubicar el float cuando corre el primer intento
        setTimeout(_reiniciarLoopFloat, 200);
    };

    // ══════════════════════════════════════════════════════════
    // SIDEBAR TTS SECTION — engine switcher + voice sync
    // ══════════════════════════════════════════════════════════
    window._sbTtsSetEngine = function (engine) {
        var isEdge = engine === 'edge';
        // Sync the existing pill + toggleServidorLive if needed
        var currentLive = typeof _usarServidorLive !== 'undefined' ? _usarServidorLive : false;
        if (isEdge !== currentLive && typeof toggleServidorLive === 'function') {
            toggleServidorLive();
        }
        // Update buttons
        var btnB = document.getElementById('sb-tts-btn-browser');
        var btnE = document.getElementById('sb-tts-btn-edge');
        if (btnB) btnB.classList.toggle('active', !isEdge);
        if (btnE) btnE.classList.toggle('active',  isEdge);
        // Show/hide panels
        var panelB = document.getElementById('sb-tts-browser-panel');
        var panelE = document.getElementById('sb-tts-edge-panel');
        if (panelB) panelB.style.display = isEdge ? 'none' : '';
        if (panelE) panelE.style.display = isEdge ? ''     : 'none';
    };

    // Poblar selector de voces del navegador cuando estén listas
    function _sbSyncBrowserVoices() {
        var sbSel = document.getElementById('sb-voice-select');
        var mainSel = document.getElementById('voice-select');
        if (!sbSel || !mainSel || mainSel.options.length <= 1) return;
        if (sbSel.options.length > 1) return; // ya poblado
        sbSel.innerHTML = '';
        for (var i = 0; i < mainSel.options.length; i++) {
            sbSel.appendChild(mainSel.options[i].cloneNode(true));
        }
        sbSel.value = mainSel.value;
    }

    // Sync inicial del estado del motor
    document.addEventListener('DOMContentLoaded', function () {
        // Determinar motor actual
        var live = (typeof uGet === 'function') && uGet('tts_servidor_live') === 'true';
        _sbTtsSetEngine(live ? 'edge' : 'browser');
        // Sync Edge voice select
        var edgeSb = document.getElementById('sb-edge-voice-select');
        var edgeMain = document.getElementById('edge-voice-select');
        if (edgeSb && edgeMain) edgeSb.value = edgeMain.value || 'es-MX-JorgeNeural';
        // Intentar poblar voces del navegador (pueden no estar listas aún)
        setTimeout(_sbSyncBrowserVoices, 600);
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.addEventListener('voiceschanged', function () {
                setTimeout(_sbSyncBrowserVoices, 100);
            });
        }
        // Sync rate/pitch sliders from existing values
        var rateCtrl = document.getElementById('rate-control');
        var pitchCtrl = document.getElementById('pitch-control');
        document.querySelectorAll('.sb-tts-slider').forEach(function (sl, i) {
            if (i === 0 && rateCtrl)  { sl.value = rateCtrl.value;  }
            if (i === 1 && pitchCtrl) { sl.value = pitchCtrl.value; }
        });
    });

})();

window._toggleMusicProviderMenu = function() {
    const menu = document.getElementById('music-provider-menu');
    if (!menu) return;
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
    // Actualizar estado visual de opciones
    document.querySelectorAll('.music-provider-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.provider === musicProvider);
    });
    // Mostrar/ocultar panel de key según proveedor activo
    const needsKey = MUSIC_PROVIDERS[musicProvider]?.needsKey;
    const keyPanel = document.getElementById('provider-key-panel');
    if (keyPanel) keyPanel.style.display = needsKey ? 'block' : 'none';
};

// Cerrar menú al hacer clic fuera
document.addEventListener('click', function(e) {
    const menu = document.getElementById('music-provider-menu');
    const btn = document.getElementById('ar-music-provider-btn');
    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});