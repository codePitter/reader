// ═══════════════════════════════════════════════════════════════
// BOOKMARKS — Sistema de marcadores por libro
//
// Permite al usuario guardar marcadores con:
//   • Capítulo + índice de frase
//   • Fragmento del texto en ese punto
//   • Nota opcional
//   • Timestamp
//
// UI:
//   • Botón 🔖 en la barra de estadísticas
//   • Panel colapsable en el sidebar
//   • Tooltip de nota al hover
//
// Claves uStorage:
//   bookmarks_{bookId} → [ {id, chapter, sentenceIndex, chapterTitle,
//                           snippet, note, timestamp}, ... ]
//
// Hooks requeridos:
//   onCapituloCargadoBookmarks(ruta) — llamado desde progress.js
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Estado interno ──────────────────────────────────────────
    let _bookmarks = [];       // array del libro activo
    let _currentRoute = null;  // ruta del capítulo activo

    // ── Helpers ─────────────────────────────────────────────────

    function _getBookId() {
        return (typeof progresoGetBookId === 'function') ? progresoGetBookId() : null;
    }

    function _storageKey(bookId) {
        return 'bookmarks_' + bookId;
    }

    function _load() {
        const bookId = _getBookId();
        if (!bookId) { _bookmarks = []; return; }
        try {
            const raw = uGet(_storageKey(bookId));
            _bookmarks = raw ? JSON.parse(raw) : [];
        } catch { _bookmarks = []; }
    }

    function _save() {
        const bookId = _getBookId();
        if (!bookId) return;
        uSet(_storageKey(bookId), JSON.stringify(_bookmarks));
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _getSnippet() {
        // Obtener el texto de la frase activa del TTS
        const idx = (typeof currentSentenceIndex !== 'undefined') ? currentSentenceIndex : 0;
        const frases = (typeof sentences !== 'undefined') ? sentences : [];
        if (frases.length > idx && frases[idx]) {
            return String(frases[idx]).slice(0, 120).trim();
        }
        // Fallback: primer texto del contenedor
        const contenido = document.getElementById('texto-contenido');
        return contenido ? contenido.textContent.slice(0, 120).trim() : '';
    }

    function _getChapterTitle() {
        const sel = document.getElementById('chapters');
        return sel?.options[sel.selectedIndex]?.textContent || '';
    }

    function _formatFecha(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // ── Agregar marcador ─────────────────────────────────────────

    function _agregarMarcador(nota) {
        const route = (typeof progresoGetChapter === 'function') ? progresoGetChapter() : _currentRoute;
        if (!route) {
            mostrarNotificacion('⚠ Cargá un libro antes de marcar');
            return null;
        }

        const idx = (typeof currentSentenceIndex !== 'undefined') ? currentSentenceIndex : 0;
        const bm = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            chapter: route,
            sentenceIndex: idx,
            chapterTitle: _getChapterTitle(),
            snippet: _getSnippet(),
            note: nota || '',
            timestamp: Date.now()
        };

        _bookmarks.unshift(bm);   // más reciente primero
        _save();
        _renderPanel();
        mostrarNotificacion('🔖 Marcador guardado');
        return bm;
    }

    // ── Ir a un marcador ─────────────────────────────────────────

    function _irAMarcador(bm) {
        const sel = document.getElementById('chapters');
        if (!sel) return;

        const opcionExiste = Array.from(sel.options).some(o => o.value === bm.chapter);
        if (!opcionExiste) {
            mostrarNotificacion('\u26a0 El cap\u00edtulo ya no existe en este libro');
            return;
        }

        // Sincronizar configuracion pendiente antes de cargar
        // (traduccionAutomatica solo se actualiza al presionar "Aplicar" — aqui la sincronizamos
        //  para que el marcador respete el estado actual del checkbox, igual que hace aplicarConfiguracion)
        _sincronizarConfigAntesDeCarga();

        if (sel.value !== bm.chapter) {
            // Capitulo diferente: invalidar cache del destino para reprocesar con config actual
            if (typeof _capCache !== 'undefined') delete _capCache[bm.chapter];

            window._progresoRestaurarFrase = bm.sentenceIndex;
            window._navegacionIntencionada = true;
            window._cargandoProgramaticamente = true;
            sel.value = bm.chapter;
            window._cargandoProgramaticamente = false;
            cargarCapitulo(bm.chapter);
            // onCapituloCargado (en progress.js) arrancara el TTS desde bm.sentenceIndex

        } else {
            // Mismo capitulo
            const hayProcesamiento =
                (typeof traduccionAutomatica !== 'undefined' && traduccionAutomatica) ||
                (typeof ttsHumanizerActivo !== 'undefined' && ttsHumanizerActivo &&
                    typeof claudeApiKey !== 'undefined' && !!claudeApiKey) ||
                (typeof grammarReviewActivo !== 'undefined' && grammarReviewActivo) ||
                (typeof autoReemplazarOnomatopeyas !== 'undefined' && autoReemplazarOnomatopeyas);

            const configEraPendiente = typeof _configPendiente !== 'undefined' && _configPendiente;

            if (hayProcesamiento && configEraPendiente) {
                // Config sin aplicar + procesamiento activo: re-cargar el capitulo actual
                // para que el texto se procese, luego arrancar TTS en la frase del marcador
                if (typeof _capCache !== 'undefined') delete _capCache[bm.chapter];
                window._progresoRestaurarFrase = bm.sentenceIndex;
                window._navegacionIntencionada = true;
                cargarCapitulo(bm.chapter);
            } else {
                // Texto ya procesado correctamente: solo mover el TTS a la frase del marcador
                if (typeof iniciarTTS === 'function') {
                    iniciarTTS(bm.sentenceIndex);
                    setTimeout(() => {
                        const span = document.getElementById('tts-s-' + bm.sentenceIndex);
                        if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 250);
                }
                mostrarNotificacion('\ud83d\udd16 ' + (bm.chapterTitle || 'Marcador') + ' \u2014 frase ' + bm.sentenceIndex);
            }
        }
    }

    // Sincronizar variables globales de config con el estado actual de los checkboxes.
    // Solo traduccionAutomatica tiene el patron "pending" (no se actualiza hasta presionar Aplicar).
    // El resto (ttsHumanizerActivo, grammarReviewActivo, autoReemplazarOnomatopeyas) ya
    // se actualizan en tiempo real desde sus toggles.
    function _sincronizarConfigAntesDeCarga() {
        const chk = document.getElementById('auto-translate');
        if (chk && typeof traduccionAutomatica !== 'undefined') {
            traduccionAutomatica = chk.checked;
        }
    }

    // ── Eliminar marcador ────────────────────────────────────────

    function _eliminarMarcador(id) {
        _bookmarks = _bookmarks.filter(b => b.id !== id);
        _save();
        _renderPanel();
    }

    // ── Editar nota ──────────────────────────────────────────────

    function _editarNota(id) {
        const bm = _bookmarks.find(b => b.id === id);
        if (!bm) return;

        // Mini inline editor dentro del item
        const noteEl = document.getElementById(`bm-note-${id}`);
        if (!noteEl) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = bm.note || '';
        input.placeholder = 'Agregar nota...';
        input.maxLength = 80;
        input.style.cssText = `
            width:100%; background:var(--bg); border:1px solid var(--accent);
            border-radius:3px; color:var(--text); font-family:'DM Mono',monospace;
            font-size:0.58rem; padding:3px 6px; outline:none; box-sizing:border-box;
        `;

        const _confirmar = () => {
            bm.note = input.value.trim();
            _save();
            _renderPanel();
        };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); _confirmar(); }
            if (e.key === 'Escape') { _renderPanel(); }
        });
        input.addEventListener('blur', _confirmar);

        noteEl.innerHTML = '';
        noteEl.appendChild(input);
        input.focus();
    }

    // ── Inyectar estilos ─────────────────────────────────────────

    function _inyectarEstilos() {
        if (document.getElementById('bm-styles')) return;
        const s = document.createElement('style');
        s.id = 'bm-styles';
        s.textContent = `
            /* Botón en toolbar */
            #btn-agregar-marcador {
                background: none;
                border: 1px solid var(--border);
                border-radius: 4px;
                color: var(--text-dim);
                font-family: 'DM Mono', monospace;
                font-size: 0.6rem;
                padding: 2px 8px;
                cursor: pointer;
                transition: color 0.2s, border-color 0.2s;
                white-space: nowrap;
                flex-shrink: 0;
            }
            #btn-agregar-marcador:hover,
            #btn-agregar-marcador.active {
                color: var(--accent);
                border-color: var(--accent);
            }
            #btn-agregar-marcador.pulsing {
                animation: bm-pulse 0.4s ease;
            }
            @keyframes bm-pulse {
                0%   { transform: scale(1); }
                40%  { transform: scale(1.15); }
                100% { transform: scale(1); }
            }

            /* Panel sidebar */
            #bm-panel-body {
                max-height: 340px;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: var(--border) transparent;
            }
            #bm-panel-body::-webkit-scrollbar { width: 3px; }
            #bm-panel-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

            /* Item de marcador */
            .bm-item {
                background: var(--surface2);
                border: 1px solid var(--border);
                border-radius: 5px;
                padding: 7px 9px;
                margin-bottom: 5px;
                cursor: pointer;
                transition: border-color 0.15s;
                position: relative;
            }
            .bm-item:hover { border-color: var(--accent2, #6ec8a0); }
            .bm-item:last-child { margin-bottom: 0; }

            .bm-item-header {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 3px;
            }
            .bm-item-cap {
                font-size: 0.6rem;
                color: var(--accent, #c8a97e);
                font-family: 'DM Mono', monospace;
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-weight: 600;
            }
            .bm-item-date {
                font-size: 0.52rem;
                color: var(--text-dim);
                font-family: 'DM Mono', monospace;
                flex-shrink: 0;
            }
            .bm-item-snippet {
                font-size: 0.6rem;
                color: var(--text-dim);
                font-family: 'Lora', serif;
                font-style: italic;
                line-height: 1.4;
                margin-bottom: 5px;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .bm-item-footer {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .bm-note-area {
                font-size: 0.56rem;
                color: var(--text-dim);
                font-family: 'DM Mono', monospace;
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .bm-note-area.empty {
                color: var(--border);
                font-style: italic;
            }
            .bm-actions {
                display: flex;
                gap: 4px;
                flex-shrink: 0;
            }
            .bm-action-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 0.65rem;
                color: var(--text-dim);
                padding: 0 2px;
                line-height: 1;
                transition: color 0.15s;
            }
            .bm-action-btn:hover { color: var(--accent); }
            .bm-action-btn.del:hover { color: #ff6b6b; }

            /* Empty state */
            .bm-empty {
                font-size: 0.62rem;
                color: var(--text-dim);
                font-family: 'DM Mono', monospace;
                text-align: center;
                padding: 14px 0;
                font-style: italic;
            }

            /* Badge de conteo */
            #bm-count-badge {
                font-size: 0.5rem;
                background: var(--accent);
                color: var(--bg);
                border-radius: 99px;
                padding: 1px 5px;
                font-weight: 700;
                margin-left: auto;
                display: none;
            }
            #bm-count-badge.visible { display: inline-block; }
        `;
        document.head.appendChild(s);
    }

    // ── Render del panel sidebar ─────────────────────────────────

    function _renderPanel() {
        const body = document.getElementById('bm-panel-body');
        const badge = document.getElementById('bm-count-badge');
        if (!body) return;

        // Badge
        if (badge) {
            if (_bookmarks.length > 0) {
                badge.textContent = _bookmarks.length;
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }

        if (_bookmarks.length === 0) {
            body.innerHTML = `<div class="bm-empty">Sin marcadores en este libro</div>`;
            return;
        }

        body.innerHTML = _bookmarks.map(bm => {
            const esCapActual = bm.chapter === _currentRoute;
            const noteHtml = bm.note
                ? `<span class="bm-note-area">📝 ${_esc(bm.note)}</span>`
                : `<span class="bm-note-area empty">+ nota</span>`;

            return `
                <div class="bm-item ${esCapActual ? 'bm-item--current' : ''}"
                     onclick="bmIrA('${_esc(bm.id)}')"
                     title="${_esc(bm.snippet)}">
                    <div class="bm-item-header">
                        <span class="bm-item-cap">🔖 ${_esc(bm.chapterTitle || 'Capítulo')}</span>
                        <span class="bm-item-date">${_formatFecha(bm.timestamp)}</span>
                    </div>
                    ${bm.snippet ? `<div class="bm-item-snippet">"${_esc(bm.snippet)}"</div>` : ''}
                    <div class="bm-item-footer">
                        <div id="bm-note-${_esc(bm.id)}"
                             onclick="event.stopPropagation();bmEditarNota('${_esc(bm.id)}')"
                             style="flex:1;cursor:text;" title="Click para editar nota">
                            ${noteHtml}
                        </div>
                        <div class="bm-actions" onclick="event.stopPropagation()">
                            <button class="bm-action-btn"
                                    onclick="bmEditarNota('${_esc(bm.id)}')"
                                    title="Editar nota">✏</button>
                            <button class="bm-action-btn del"
                                    onclick="bmEliminar('${_esc(bm.id)}')"
                                    title="Eliminar marcador">✕</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Inyectar panel en sidebar ────────────────────────────────

    function _inyectarPanelSidebar() {
        if (document.getElementById('bm-sidebar-section')) return;
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        const section = document.createElement('div');
        section.className = 'sidebar-section';
        section.id = 'bm-sidebar-section';
        section.innerHTML = `
            <div class="section-label"
                 style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;"
                 onclick="bmTogglePanel()">
                <span style="font-size:0.8rem;">🔖</span>
                Marcadores
                <span id="bm-count-badge"></span>
                <span id="bm-panel-arrow" style="margin-left:auto;font-size:0.7rem;color:var(--text-dim);">▶</span>
            </div>
            <div id="bm-panel-body" style="display:none;padding-top:4px;"></div>
        `;

        // Insertar después de la sección "Capítulos" (segunda sidebar-section)
        const sections = sidebar.querySelectorAll('.sidebar-section');
        if (sections.length >= 2) {
            sections[1].insertAdjacentElement('afterend', section);
        } else {
            sidebar.appendChild(section);
        }
    }

    // ── Inyectar botón en toolbar ────────────────────────────────

    function _inyectarBotonToolbar() {
        if (document.getElementById('btn-agregar-marcador')) return;

        // Buscar el botón "Copiar" para insertar antes de él
        const btnCopiar = document.querySelector('.btn-copy-reading');
        if (!btnCopiar) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-agregar-marcador';
        btn.title = 'Guardar marcador en la posición actual (Ctrl+B)';
        btn.textContent = '🔖 Marcar';
        btn.onclick = bmAgregar;

        btnCopiar.parentNode.insertBefore(btn, btnCopiar);
    }

    // ── API pública (llamada desde HTML inline y otros módulos) ──

    window.bmAgregar = function (nota) {
        // Pulsar animación en el botón
        const btn = document.getElementById('btn-agregar-marcador');
        if (btn) {
            btn.classList.add('pulsing');
            setTimeout(() => btn.classList.remove('pulsing'), 500);
        }
        _agregarMarcador(nota || '');
        // Abrir el panel si está cerrado
        const body = document.getElementById('bm-panel-body');
        if (body && body.style.display === 'none') bmTogglePanel();
    };

    window.bmEliminar = function (id) {
        _eliminarMarcador(id);
    };

    window.bmIrA = function (id) {
        const bm = _bookmarks.find(b => b.id === id);
        if (bm) _irAMarcador(bm);
    };

    window.bmEditarNota = function (id) {
        _editarNota(id);
    };

    window.bmTogglePanel = function () {
        const body = document.getElementById('bm-panel-body');
        const arrow = document.getElementById('bm-panel-arrow');
        if (!body) return;
        const abierto = body.style.display !== 'none';
        body.style.display = abierto ? 'none' : 'block';
        if (arrow) arrow.textContent = abierto ? '▶' : '▼';
    };

    // ── Hook desde progress.js ───────────────────────────────────

    window.onCapituloCargadoBookmarks = function (ruta) {
        _currentRoute = ruta;
        _load();           // recargar marcadores del libro activo
        _renderPanel();
    };

    // ── Atajo de teclado Ctrl+B ──────────────────────────────────

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            bmAgregar();
        }
    });

    // ── Inicialización ───────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        _inyectarEstilos();
        _inyectarPanelSidebar();
        _inyectarBotonToolbar();
        _renderPanel();
        console.log('[bookmarks] Inicializado — Ctrl+B para marcar');
    });

})();