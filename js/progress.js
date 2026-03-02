// ═══════════════════════════════════════════════════════════════
// PROGRESS — Progreso de lectura por libro (capítulo + frase)
//
// Guarda automáticamente:
//   • Capítulo activo (al cargarse)
//   • Índice de frase activa del TTS (en tiempo real)
//   • Timestamp del último acceso
//
// Al abrir un libro con progreso guardado, muestra un modal
// preguntando si el usuario desea continuar donde lo dejó.
//
// Claves uStorage:
//   progress_{bookId}  → { chapter, sentenceIndex, chapterTitle, timestamp }
//
// Hooks requeridos en epub.js:
//   onEpubCargado(archivos, fallback)   — después de armar el selector
//   onCapituloCargado(ruta)             — después de renderizar el capítulo
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Constantes ─────────────────────────────────────────────
    const SAVE_INTERVAL_MS = 4000;   // guardar índice de frase cada 4s
    const MIN_SENTENCE = 3;          // no guardar si el índice es muy bajo (comienzo del cap)

    // ── Estado interno ──────────────────────────────────────────
    let _bookId = null;
    let _currentChapterRoute = null;
    let _saveTimer = null;
    let _modalVisible = false;

    // ── Helpers ─────────────────────────────────────────────────

    function _getBookId(filename) {
        if (!filename) return null;
        return 'book_' + filename
            .replace(/\.[^.]+$/, '')          // quitar extensión
            .replace(/[^a-zA-Z0-9_\-áéíóúñü]/gi, '_')
            .toLowerCase()
            .slice(0, 80);
    }

    function _storageKey(bookId) {
        return 'progress_' + bookId;
    }

    function _getProgress(bookId) {
        try {
            const raw = uGet(_storageKey(bookId));
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function _saveProgress(bookId, chapter, sentenceIndex, chapterTitle) {
        if (!bookId || !chapter) return;
        const data = {
            chapter,
            sentenceIndex: sentenceIndex || 0,
            chapterTitle: chapterTitle || '',
            timestamp: Date.now()
        };
        uSet(_storageKey(bookId), JSON.stringify(data));
    }

    function _clearProgress(bookId) {
        if (bookId) uRemove(_storageKey(bookId));
    }

    function _getChapterTitle() {
        const sel = document.getElementById('chapters');
        if (!sel) return '';
        return sel.options[sel.selectedIndex]?.textContent || '';
    }

    function _getCurrentSentenceIndex() {
        return (typeof currentSentenceIndex !== 'undefined') ? currentSentenceIndex : 0;
    }

    // ── Guardado periódico ───────────────────────────────────────

    function _startAutoSave() {
        _stopAutoSave();
        _saveTimer = setInterval(() => {
            if (!_bookId || !_currentChapterRoute) return;
            const idx = _getCurrentSentenceIndex();
            if (idx < MIN_SENTENCE) return;   // no guardar si está al inicio
            _saveProgress(_bookId, _currentChapterRoute, idx, _getChapterTitle());
        }, SAVE_INTERVAL_MS);
    }

    function _stopAutoSave() {
        if (_saveTimer) { clearInterval(_saveTimer); _saveTimer = null; }
    }

    // ── Modal "¿Continuar?" ──────────────────────────────────────

    function _inyectarEstilosModal() {
        if (document.getElementById('progress-modal-styles')) return;
        const s = document.createElement('style');
        s.id = 'progress-modal-styles';
        s.textContent = `
            #progress-modal-overlay {
                position: fixed; inset: 0; z-index: 9000;
                background: rgba(0,0,0,0.65);
                backdrop-filter: blur(3px);
                display: flex; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.22s;
                pointer-events: none;
            }
            #progress-modal-overlay.visible {
                opacity: 1; pointer-events: all;
            }
            #progress-modal {
                background: var(--surface2, #1a1917);
                border: 1px solid var(--accent, #c8a97e);
                border-radius: 10px;
                padding: 26px 28px 22px;
                max-width: 380px; width: 90%;
                font-family: 'DM Mono', monospace;
                transform: translateY(12px);
                transition: transform 0.22s;
            }
            #progress-modal-overlay.visible #progress-modal {
                transform: translateY(0);
            }
            #progress-modal h3 {
                font-size: 0.8rem; font-weight: 700;
                color: var(--accent, #c8a97e);
                letter-spacing: 0.06em; text-transform: uppercase;
                margin: 0 0 6px;
            }
            #progress-modal .pm-chapter {
                font-size: 0.68rem; color: var(--text, #e8e0d5);
                margin: 0 0 4px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #progress-modal .pm-meta {
                font-size: 0.58rem; color: var(--text-dim, #7a7060);
                margin: 0 0 20px;
            }
            #progress-modal .pm-actions {
                display: flex; gap: 10px;
            }
            #progress-modal .pm-btn {
                flex: 1; padding: 9px 0;
                border-radius: 6px;
                font-family: 'DM Mono', monospace;
                font-size: 0.65rem; font-weight: 600;
                letter-spacing: 0.04em; cursor: pointer;
                border: none; transition: opacity 0.15s;
            }
            #progress-modal .pm-btn:hover { opacity: 0.85; }
            #progress-modal .pm-btn-primary {
                background: var(--accent, #c8a97e);
                color: var(--bg, #0e0d0b);
            }
            #progress-modal .pm-btn-secondary {
                background: none;
                border: 1px solid var(--border, #3a3530) !important;
                color: var(--text-dim, #7a7060);
            }
        `;
        document.head.appendChild(s);
    }

    function _mostrarModal(progreso, onContinuar, onEmpezarDesdeInicio) {
        _inyectarEstilosModal();
        _modalVisible = true;

        // Formato de fecha relativa
        const mins = Math.round((Date.now() - progreso.timestamp) / 60000);
        let tiempoStr;
        if (mins < 2) tiempoStr = 'hace un momento';
        else if (mins < 60) tiempoStr = `hace ${mins} min`;
        else if (mins < 1440) tiempoStr = `hace ${Math.round(mins / 60)} h`;
        else tiempoStr = `hace ${Math.round(mins / 1440)} día(s)`;

        const fraseStr = progreso.sentenceIndex > 0
            ? ` · frase ${progreso.sentenceIndex}`
            : '';

        let overlay = document.getElementById('progress-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'progress-modal-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div id="progress-modal">
                <h3>📖 Continuar lectura</h3>
                <p class="pm-chapter">${_escProgress(progreso.chapterTitle || 'Capítulo guardado')}</p>
                <p class="pm-meta">${tiempoStr}${fraseStr}</p>
                <div class="pm-actions">
                    <button class="pm-btn pm-btn-primary" id="pm-btn-continuar">
                        ▶ Continuar
                    </button>
                    <button class="pm-btn pm-btn-secondary" id="pm-btn-inicio">
                        Desde el inicio
                    </button>
                </div>
            </div>
        `;

        // Mostrar con animación
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('visible'));
        });

        const _cerrar = () => {
            overlay.classList.remove('visible');
            _modalVisible = false;
            setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 250);
        };

        document.getElementById('pm-btn-continuar').onclick = () => {
            _cerrar();
            onContinuar();
        };
        document.getElementById('pm-btn-inicio').onclick = () => {
            _cerrar();
            onEmpezarDesdeInicio();
        };
    }

    function _escProgress(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Navegación a la posición guardada ────────────────────────

    // Sincroniza traduccionAutomatica con el checkbox antes de cargar el capitulo.
    // Las demas variables (ttsHumanizerActivo, grammarReviewActivo, autoReemplazarOnomatopeyas)
    // ya se actualizan en tiempo real desde sus propios toggles.
    function _sincronizarConfigAntesDeCarga() {
        const chk = document.getElementById('auto-translate');
        if (chk && typeof traduccionAutomatica !== 'undefined') {
            traduccionAutomatica = chk.checked;
        }
    }

    function _irAProgresoGuardado(progreso, archivosDisponibles) {
        const sel = document.getElementById('chapters');
        if (!sel) { cargarCapitulo(archivosDisponibles[0]); return; }

        const opcionExiste = Array.from(sel.options).some(o => o.value === progreso.chapter);
        const rutaDestino = opcionExiste ? progreso.chapter : archivosDisponibles[0];

        // Sincronizar configuracion pendiente (igual que al hacer click en un marcador)
        _sincronizarConfigAntesDeCarga();

        // Invalidar cache del destino para que se reprocese con la config actual
        if (typeof _capCache !== 'undefined') delete _capCache[rutaDestino];

        // Seleccionar el capitulo en el selector
        if (opcionExiste) {
            window._cargandoProgramaticamente = true;
            sel.value = rutaDestino;
            window._cargandoProgramaticamente = false;
            // Actualizar el chip del sidebar para que muestre el capitulo correcto
            if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
        }

        // Guardar el indice de frase a restaurar; onCapituloCargado lo consumira
        window._progresoRestaurarFrase = opcionExiste ? (progreso.sentenceIndex || 0) : 0;

        // Marcar como navegacion intencional para que epub.js NO arranque el TTS
        // desde la frase 0 (nosotros lo arrancamos desde la frase guardada en onCapituloCargado)
        window._navegacionIntencionada = true;

        cargarCapitulo(rutaDestino);
    }

    // ── Hook: capítulo cargado → restaurar frase si aplica ──────

    window.onCapituloCargado = function (ruta) {
        _currentChapterRoute = ruta;

        // Hay frase pendiente de restaurar?
        // null/undefined = no hacer nada (carga normal sin auto-TTS)
        // 0              = arrancar TTS desde el inicio del capitulo
        // N >= MIN_SENTENCE = arrancar TTS desde la frase N
        const fraseTarget = window._progresoRestaurarFrase;
        if (fraseTarget !== null && fraseTarget !== undefined) {
            window._progresoRestaurarFrase = null;
            const _indice = (fraseTarget >= MIN_SENTENCE) ? fraseTarget : 0;

            // Arrancar TTS (~350ms para que el DOM este listo)
            setTimeout(() => {
                if (typeof iniciarTTS === 'function') {
                    iniciarTTS(_indice);

                    // Scroll a la frase si no es el inicio
                    if (_indice > 0) {
                        setTimeout(() => {
                            const span = document.getElementById('tts-s-' + _indice);
                            if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 250);
                    }
                }
            }, 350);
        }

        // Guardar inmediatamente el progreso del capítulo actual
        if (_bookId) {
            const idx = _getCurrentSentenceIndex();
            _saveProgress(_bookId, ruta, idx, _getChapterTitle());
        }

        // Notificar a bookmarks
        if (typeof onCapituloCargadoBookmarks === 'function') {
            onCapituloCargadoBookmarks(ruta);
        }
    };

    // ── Hook: EPUB cargado ───────────────────────────────────────

    window.onEpubCargado = function (archivosOrdenados, fallbackCargar) {
        // _epubFilename ya está seteado en este punto (epub.js línea ~58)
        const filename = (typeof _epubFilename !== 'undefined') ? _epubFilename : '';
        _bookId = _getBookId(filename);
        _currentChapterRoute = null;

        // Reiniciar autosave con el nuevo libro
        _startAutoSave();

        if (!_bookId) { fallbackCargar(); return; }

        const progreso = _getProgress(_bookId);

        if (!progreso || !progreso.chapter) {
            // Sin progreso previo → cargar normalmente
            fallbackCargar();
            return;
        }

        // Hay progreso guardado -> mostrar modal
        _mostrarModal(
            progreso,
            // Continuar: procesa el capitulo guardado con la config actual
            () => _irAProgresoGuardado(progreso, archivosOrdenados),
            // Desde el inicio: cargar el capitulo guardado tal cual, sin traducir ni iniciar TTS
            () => {
                _clearProgress(_bookId);

                const sel = document.getElementById('chapters');
                const opcionExiste = sel && Array.from(sel.options).some(o => o.value === progreso.chapter);
                const rutaDestino = opcionExiste ? progreso.chapter : archivosOrdenados[0];

                if (sel && opcionExiste) {
                    window._cargandoProgramaticamente = true;
                    sel.value = rutaDestino;
                    window._cargandoProgramaticamente = false;
                    // Actualizar el chip del sidebar
                    if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
                }

                // Sin frase a restaurar y sin navegacion intencional:
                // cargarCapitulo mostrara el texto sin iniciar TTS ni traducir
                window._progresoRestaurarFrase = null;
                window._navegacionIntencionada = false;
                cargarCapitulo(rutaDestino);
            }
        );
    };

    // ── Exponer API pública ──────────────────────────────────────

    // Llamar manualmente para guardar en cualquier momento
    window.progresoGuardarAhora = function () {
        if (!_bookId || !_currentChapterRoute) return;
        _saveProgress(
            _bookId,
            _currentChapterRoute,
            _getCurrentSentenceIndex(),
            _getChapterTitle()
        );
    };

    // Obtener progreso del libro activo (para uso externo, ej. bookmarks)
    window.progresoGetBookId = function () { return _bookId; };
    window.progresoGetChapter = function () { return _currentChapterRoute; };

    // Guardar al cerrar/salir de la página
    window.addEventListener('beforeunload', () => {
        progresoGuardarAhora();
    });

    // Guardar al cambiar visibilidad (app en background, cambio de tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') progresoGuardarAhora();
    });

    console.log('[progress] Inicializado');
})();