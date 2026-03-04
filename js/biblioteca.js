// ═══════════════════════════════════════════════════════════════
// BIBLIOTECA — Librería personal del usuario
//
// Almacenamiento en dos capas:
//   · IndexedDB  → blobs de archivos (nunca salen del dispositivo)
//   · Supabase   → metadata + progreso (solo si hay sesión activa)
//   · uStorage   → metadata local como fallback para guests
//
// Integración con el lector:
//   · Al abrir un libro llama a cargarArchivoEnLector(file, nombre)
//   · epub.js llama a bibActualizarProgreso() al cambiar de capítulo
//
// Depende de: auth.js, ustorage.js, main.js
// Debe cargarse DESPUÉS de auth.js y ANTES de init.js
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ─── CONSTANTES ───────────────────────────────────────────────
    const IDB_NAME = 'totalreader_biblioteca';
    const IDB_VERSION = 1;
    const IDB_STORE = 'archivos';
    const SB_TABLE = 'biblioteca';
    const META_KEY = 'biblioteca_meta'; // uStorage fallback para guests

    // Formatos aceptados por el lector
    const FORMATOS_ACEPTADOS = [
        'epub', 'pdf', 'txt', 'html', 'htm', 'fb2', 'fb3',
        'docx', 'rtf', 'odt', 'mobi', 'prc', 'azw3', 'azw', 'cbz', 'cbr'
    ];

    // Paletas procedurales para portadas sin imagen
    const COVER_PALETTES = [
        ['#1a2a1a', '#3a6a3a', '#7eb89a'],
        ['#2a1a0a', '#6a3a0a', '#c8a96e'],
        ['#1a1a2a', '#3a3a6a', '#8a8ac8'],
        ['#2a0a0a', '#6a1a1a', '#c87a7a'],
        ['#0a2a2a', '#1a5a5a', '#5ab8b8'],
        ['#1a1a0a', '#4a4a1a', '#a8a860'],
        ['#2a0a1a', '#6a1a4a', '#c87ab0'],
    ];

    // ─── ESTADO ───────────────────────────────────────────────────
    let _idb = null;   // instancia de IDBDatabase
    let _libros = [];     // array de metadata en memoria
    let _vista = 'grid'; // 'grid' | 'lista'
    let _tab = 'todos';
    let _busqueda = '';
    let _orden = 'reciente';
    let _abierta = false;

    // ─── INIT ─────────────────────────────────────────────────────

    async function init() {
        await _abrirIDB();
        await _cargarMeta();
        _inyectarHTML();
        _inyectarEstilos();
        _render();

        // Escuchar eventos de auth para sincronizar con Supabase
        document.addEventListener('auth:signin', () => _sincronizarConSupabase());
        document.addEventListener('auth:signout', () => _cargarMeta());
    }

    // ─── INDEXEDDB ────────────────────────────────────────────────

    function _abrirIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = e => { _idb = e.target.result; resolve(); };
            req.onerror = e => { console.error('[bib] IDB error:', e); resolve(); };
        });
    }

    function _idbGuardar(id, blob, nombre) {
        return new Promise((resolve, reject) => {
            if (!_idb) return resolve();
            const tx = _idb.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put({ id, blob, nombre });
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    }

    function _idbLeer(id) {
        return new Promise((resolve, reject) => {
            if (!_idb) return resolve(null);
            const tx = _idb.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(id);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = reject;
        });
    }

    function _idbEliminar(id) {
        return new Promise((resolve, reject) => {
            if (!_idb) return resolve();
            const tx = _idb.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(id);
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    }

    // ─── METADATA ─────────────────────────────────────────────────
    // Metadata se guarda en Supabase si hay sesión, o en uStorage como fallback.

    async function _cargarMeta() {
        if (typeof estaAutenticado === 'function' && estaAutenticado()) {
            await _cargarMetaSupabase();
        } else {
            _cargarMetaLocal();
        }
        _render();
    }

    function _cargarMetaLocal() {
        try {
            _libros = JSON.parse(uGet(META_KEY) || '[]');
        } catch (e) {
            _libros = [];
        }
    }

    function _persistirMetaLocal() {
        uSet(META_KEY, JSON.stringify(_libros));
    }

    async function _cargarMetaSupabase() {
        if (!window._supabase) return _cargarMetaLocal();
        try {
            const { data, error } = await window._supabase
                .from(SB_TABLE)
                .select('*')
                .order('fecha_agregado', { ascending: false });
            if (error) throw error;
            _libros = (data || []).map(_mapSupabaseALocal);
        } catch (e) {
            console.warn('[bib] Supabase load failed, using local:', e.message);
            _cargarMetaLocal();
        }
    }

    async function _guardarMetaSupabase(libro) {
        if (!window._supabase || !estaAutenticado()) return;
        try {
            const row = _mapLocalASupabase(libro);
            const { error } = await window._supabase
                .from(SB_TABLE)
                .upsert(row, { onConflict: 'id' });
            if (error) throw error;
        } catch (e) {
            console.warn('[bib] Supabase upsert failed:', e.message);
        }
    }

    async function _eliminarMetaSupabase(id) {
        if (!window._supabase || !estaAutenticado()) return;
        try {
            const { error } = await window._supabase
                .from(SB_TABLE)
                .delete()
                .eq('id', id);
            if (error) throw error;
        } catch (e) {
            console.warn('[bib] Supabase delete failed:', e.message);
        }
    }

    // Al iniciar sesión: migrar libros locales a Supabase
    async function _sincronizarConSupabase() {
        const librosLocales = [..._libros];
        await _cargarMetaSupabase(); // cargar lo que ya hay en Supabase
        // Subir libros locales que no estén en Supabase
        for (const libro of librosLocales) {
            const existe = _libros.find(l => l.id === libro.id);
            if (!existe) {
                _libros.unshift(libro);
                await _guardarMetaSupabase(libro);
            }
        }
        _render();
        mostrarNotificacion('✓ Biblioteca sincronizada');
    }

    // Mapeo Supabase ↔ local
    function _mapSupabaseALocal(row) {
        return {
            id: row.id,
            titulo: row.titulo,
            autor: row.autor || '',
            formato: row.formato,
            portada: row.portada || null,
            progreso: row.progreso || 0,
            capActual: row.cap_actual || 0,
            totalCaps: row.total_caps || 0,
            idbKey: row.idb_key,
            tamano: row.tamano || 0,
            fechaAgregado: new Date(row.fecha_agregado).getTime(),
            activo: false,
        };
    }

    function _mapLocalASupabase(libro) {
        return {
            id: libro.id,
            user_id: typeof getUserId === 'function' ? getUserId() : null,
            titulo: libro.titulo,
            autor: libro.autor || null,
            formato: libro.formato,
            portada: libro.portada || null,
            progreso: libro.progreso || 0,
            cap_actual: libro.capActual || 0,
            total_caps: libro.totalCaps || 0,
            idb_key: libro.idbKey,
            tamano: libro.tamano || 0,
            fecha_agregado: new Date(libro.fechaAgregado).toISOString(),
        };
    }

    // ─── AGREGAR LIBRO ────────────────────────────────────────────

    async function bibAgregarArchivo(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!FORMATOS_ACEPTADOS.includes(ext)) {
            mostrarNotificacion(`⚠ Formato .${ext} no soportado`);
            return;
        }

        // Generar ID único
        const id = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);

        // Extraer metadata básica del nombre
        const nombreLimpio = file.name.replace(/\.(epub|pdf|txt|html?|fb[23]|docx|rtf|odt|mobi|prc|azw3?|cbz|cbr)$/i, '');
        const partes = nombreLimpio.split(' - ');
        const titulo = partes[0]?.trim() || nombreLimpio;
        const autor = partes[1]?.trim() || '';

        const libro = {
            id,
            titulo,
            autor,
            formato: ext,
            portada: null,
            progreso: 0,
            capActual: 0,
            totalCaps: 0,
            idbKey: id,
            tamano: file.size,
            fechaAgregado: Date.now(),
            activo: false,
        };

        // Mostrar feedback inmediato
        _libros.unshift(libro);
        _render();
        mostrarNotificacion('⏳ Guardando en biblioteca...');

        try {
            // Guardar blob en IndexedDB
            await _idbGuardar(id, file, file.name);

            // Intentar extraer portada (async, no bloqueante)
            _extraerPortada(id, file, ext).then(portadaB64 => {
                if (portadaB64) {
                    libro.portada = portadaB64;
                    _persistirMetaLocal();
                    _guardarMetaSupabase(libro);
                    _render();
                }
            });

            // Persistir metadata
            _persistirMetaLocal();
            await _guardarMetaSupabase(libro);

            mostrarNotificacion(`✓ "${titulo}" agregado a la biblioteca`);
            _render();
        } catch (e) {
            console.error('[bib] Error al agregar libro:', e);
            mostrarNotificacion('⚠ Error al guardar el archivo');
            _libros = _libros.filter(l => l.id !== id);
            _render();
        }
    }

    // Extrae portada de EPUB (primera imagen del ZIP) o miniatura de PDF
    async function _extraerPortada(id, file, ext) {
        try {
            if (ext === 'epub') {
                if (typeof JSZip === 'undefined') return null;
                const zip = await JSZip.loadAsync(file);
                // Buscar la imagen de portada más probable
                const candidatos = Object.keys(zip.files).filter(f =>
                    /cover|portada|front/i.test(f) && /\.(jpe?g|png|webp)$/i.test(f)
                );
                const imgKey = candidatos[0] ||
                    Object.keys(zip.files).find(f => /\.(jpe?g|png|webp)$/i.test(f));
                if (!imgKey) return null;
                const blob = await zip.files[imgKey].async('blob');
                return await _blobABase64(blob);
            }
            // PDF y otros: sin portada por ahora (se puede agregar PDF.js en el futuro)
            return null;
        } catch (e) {
            console.warn('[bib] No se pudo extraer portada:', e.message);
            return null;
        }
    }

    function _blobABase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ─── ABRIR LIBRO EN EL LECTOR ─────────────────────────────────

    async function bibAbrirLibro(id) {
        const libro = _libros.find(l => l.id === id);
        if (!libro) return;

        const entrada = await _idbLeer(id);
        if (!entrada?.blob) {
            mostrarNotificacion('⚠ Archivo no encontrado en este dispositivo');
            return;
        }

        // Marcar como activo
        _libros = _libros.map(l => ({ ...l, activo: l.id === id }));
        _render();

        // Cerrar la biblioteca y pasar el archivo al lector
        bibCerrar();

        // Crear un File a partir del blob guardado
        const file = new File([entrada.blob], entrada.nombre || `${libro.titulo}.${libro.formato}`, {
            type: entrada.blob.type || ''
        });

        // Esperar a que el panel se cierre antes de cargar
        setTimeout(() => {
            // Simular selección de archivo en el input del lector
            const dt = new DataTransfer();
            dt.items.add(file);
            const input = document.getElementById('epub-file');
            if (input) {
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 330);
    }

    // ─── ACTUALIZAR PROGRESO ──────────────────────────────────────
    // Llamado desde epub.js al cambiar de capítulo

    async function bibActualizarProgreso(nombreArchivo, capActual, totalCaps) {
        const libro = _libros.find(l =>
            l.titulo === nombreArchivo ||
            (nombreArchivo && nombreArchivo.includes(l.titulo))
        );
        if (!libro) return;

        libro.capActual = capActual;
        libro.totalCaps = totalCaps;
        libro.progreso = totalCaps > 0 ? capActual / totalCaps : 0;

        _persistirMetaLocal();
        await _guardarMetaSupabase(libro);
        // Re-render solo la barra de progreso para no interrumpir lectura
        _actualizarBarraProgreso(libro.id, libro.progreso);
    }

    function _actualizarBarraProgreso(id, progreso) {
        const fill = document.getElementById(`bib-prog-${id}`);
        if (fill) fill.style.width = `${Math.round(progreso * 100)}%`;
    }

    // ─── ELIMINAR ─────────────────────────────────────────────────

    async function bibEliminar(id) {
        const libro = _libros.find(l => l.id === id);
        if (!libro) return;

        _libros = _libros.filter(l => l.id !== id);
        _persistirMetaLocal();

        await _idbEliminar(id);
        await _eliminarMetaSupabase(id);

        _render();
        mostrarNotificacion(`✓ "${libro.titulo}" eliminado`);
    }

    // ─── TOGGLE PANEL ─────────────────────────────────────────────

    function bibAbrir() {
        _abierta = true;
        document.querySelector('.sidebar')?.classList.add('biblioteca-activa');
        _render();
        setTimeout(() => document.getElementById('bib-search')?.focus(), 320);
    }

    function bibCerrar() {
        _abierta = false;
        document.querySelector('.sidebar')?.classList.remove('biblioteca-activa');
    }

    // ─── RENDER ───────────────────────────────────────────────────

    function _render() {
        _renderGrid();
        _renderBadge();
    }

    function _renderBadge() {
        const el = document.getElementById('bib-badge-count');
        if (el) el.textContent = _libros.length;
    }

    function _renderGrid() {
        const grid = document.getElementById('bib-grid');
        const countEl = document.getElementById('bib-count-label');
        if (!grid) return;

        let libros = [..._libros];

        // Filtro tab
        if (_tab === 'epub') libros = libros.filter(l => l.formato === 'epub');
        if (_tab === 'pdf') libros = libros.filter(l => l.formato === 'pdf');
        if (_tab === 'leyendo') libros = libros.filter(l => l.progreso > 0);

        // Filtro búsqueda
        if (_busqueda.trim()) {
            const q = _busqueda.toLowerCase();
            libros = libros.filter(l =>
                l.titulo.toLowerCase().includes(q) ||
                (l.autor || '').toLowerCase().includes(q)
            );
        }

        // Ordenar
        if (_orden === 'titulo') libros.sort((a, b) => a.titulo.localeCompare(b.titulo));
        if (_orden === 'autor') libros.sort((a, b) => (a.autor || '').localeCompare(b.autor || ''));
        if (_orden === 'reciente') libros.sort((a, b) => b.fechaAgregado - a.fechaAgregado);
        if (_orden === 'progreso') libros.sort((a, b) => b.progreso - a.progreso);

        if (countEl) {
            const n = _libros.length;
            countEl.textContent = `${n} libro${n !== 1 ? 's' : ''}`;
        }

        grid.className = `bib-grid${_vista === 'lista' ? ' lista' : ''}`;

        if (libros.length === 0) {
            grid.innerHTML = `
                <div class="bib-empty" style="grid-column:1/-1;">
                    <div class="bib-empty-icon">📭</div>
                    <div class="bib-empty-titulo">
                        ${_busqueda ? 'Sin resultados' : 'Tu biblioteca está vacía'}
                    </div>
                    <div class="bib-empty-sub">
                        ${_busqueda
                    ? `No hay libros que coincidan con "${_busqueda}"`
                    : 'Agregá archivos EPUB o PDF\narrastrándolos aquí o con el botón +'}
                    </div>
                    ${!_busqueda ? `<button class="bib-empty-btn" onclick="window._bibAgregarClick()">📂 Agregar libro</button>` : ''}
                </div>`;
            return;
        }

        grid.innerHTML = libros.map((l, idx) => _renderCard(l, idx)).join('');
    }

    function _hashTitulo(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return Math.abs(h) % COVER_PALETTES.length;
    }

    function _renderCard(l, idx) {
        const palette = COVER_PALETTES[_hashTitulo(l.titulo)];
        const iconos = { epub: '📖', pdf: '📄', txt: '📝' };
        const pct = Math.round(l.progreso * 100);

        const coverHTML = l.portada
            ? `<img class="libro-cover" src="${l.portada}" alt="${_esc(l.titulo)}" loading="lazy">`
            : `<div class="libro-cover-placeholder"
                    style="background:linear-gradient(160deg,${palette[0]} 0%,${palette[1]} 100%);">
                   <div class="ph-icon">${iconos[l.formato] || '📚'}</div>
                   <div class="ph-formato">${l.formato.toUpperCase()}</div>
               </div>`;

        const progressBar = l.progreso > 0
            ? `<div class="libro-progreso-wrap">
                   <div class="libro-progreso-fill" id="bib-prog-${l.id}"
                        style="width:${pct}%"></div>
               </div>`
            : '';

        return `
            <div class="libro-card${l.activo ? ' activo' : ''}"
                 style="animation-delay:${idx * 0.03}s"
                 onclick="window._bibAbrirLibro('${l.id}')"
                 title="${_esc(l.titulo)}">
                <button class="libro-menu-btn"
                        onclick="window._bibMenuLibro(event,'${l.id}')"
                        title="Opciones">⋯</button>
                <div class="libro-cover-wrap">${coverHTML}</div>
                <div class="libro-info">
                    <div class="libro-titulo">${_esc(l.titulo)}</div>
                    <div class="libro-autor">${_esc(l.autor || '')}</div>
                    <div class="libro-meta">
                        <span class="libro-formato-badge ${l.formato}">${l.formato.toUpperCase()}</span>
                        ${pct > 0 ? `<span class="libro-pct">${pct}%</span>` : ''}
                    </div>
                    ${progressBar}
                </div>
            </div>`;
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── INYECCIÓN HTML ───────────────────────────────────────────

    function _inyectarHTML() {
        // El panel biblioteca se inyecta directamente DENTRO de .sidebar (sin wrapper).
        // Esto evita el naipe flip (translateX desde la derecha) que desincronizaba
        // el colapso del sidebar con el layout flex de .app.
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // 1) Inyectar botón "Mis libros" al inicio del sidebar
        const misLibrosSlot = document.getElementById('sb-mis-libros-slot');
        const btnWrap = document.createElement('div');
        btnWrap.id = 'sb-mis-libros-slot-inner';
        const btn = document.createElement('button');
        btn.className = 'btn-abrir-biblioteca';
        btn.setAttribute('onclick', 'window._bibAbrir()');
        btn.innerHTML = `📚 Mis libros <span class="badge" id="bib-badge-count">0</span>`;
        btnWrap.appendChild(btn);
        if (misLibrosSlot) {
            misLibrosSlot.appendChild(btnWrap);
        } else {
            sidebar.insertBefore(btnWrap, sidebar.firstChild);
        }

        // 2) Inyectar panel biblioteca dentro del sidebar (oculto por defecto)
        const bibPanel = document.createElement('div');
        bibPanel.className = 'sidebar-biblioteca';
        bibPanel.id = 'sidebar-biblioteca';
        bibPanel.innerHTML = `
            <!-- DROP OVERLAY -->
            <div class="bib-drop-overlay" id="bib-drop-overlay">
                <div class="bib-drop-msg">📂 Soltar para agregar<br>a la biblioteca</div>
            </div>

            <!-- HEADER -->
            <div class="bib-header">
                <div class="bib-header-top">
                    <span class="bib-titulo">📚 Biblioteca</span>
                    <span class="bib-count" id="bib-count-label">0 libros</span>
                    <button class="bib-btn-volver" onclick="window._bibCerrar()" title="Volver al lector">✕</button>
                </div>
                <input class="bib-search" id="bib-search" type="text"
                       placeholder="🔍 Buscar título, autor..."
                       oninput="window._bibFiltrar(this.value)">
                <div class="bib-tabs">
                    <button class="bib-tab active" id="bib-tab-todos"   onclick="window._bibTab('todos')">Todos</button>
                    <button class="bib-tab"         id="bib-tab-epub"   onclick="window._bibTab('epub')">EPUB</button>
                    <button class="bib-tab"         id="bib-tab-pdf"    onclick="window._bibTab('pdf')">PDF</button>
                    <button class="bib-tab"         id="bib-tab-leyendo" onclick="window._bibTab('leyendo')">Leyendo</button>
                </div>
            </div>

            <!-- TOOLBAR -->
            <div class="bib-toolbar">
                <select class="bib-sort" onchange="window._bibOrdenar(this.value)">
                    <option value="reciente">↓ Reciente</option>
                    <option value="titulo">A→Z título</option>
                    <option value="autor">A→Z autor</option>
                    <option value="progreso">Progreso</option>
                </select>
                <div class="bib-view-toggle">
                    <button class="bib-view-btn active" id="bib-btn-grid"  onclick="window._bibVista('grid')"  title="Grilla">⊞</button>
                    <button class="bib-view-btn"         id="bib-btn-lista" onclick="window._bibVista('lista')" title="Lista">☰</button>
                </div>
                <button class="bib-btn-url" onclick="window._bibAgregarURLClick()" title="Agregar desde URL web">🌐</button>
                <button class="bib-btn-agregar" onclick="window._bibAgregarClick()">+ Agregar</button>
            </div>

            <!-- MODAL URL -->
            <div class="bib-url-modal" id="bib-url-modal" style="display:none;">
                <div class="bib-url-modal-inner">
                    <div class="bib-url-modal-title">🌐 Agregar desde URL</div>
                    <div class="bib-url-modal-hint">Soporta Google Drive · Dropbox · OneDrive · Box · GitHub · URLs directas</div>
                    <div class="bib-url-modal-hint bib-url-tip" id="bib-url-cloud-tip">
                        💡 <strong>Google Drive:</strong> El archivo debe ser público.<br>
                        Compartir → <em>"Cualquier persona con el enlace"</em> → pegá la URL.
                    </div>
                    <input class="bib-url-input" id="bib-url-input" type="url"
                           placeholder="https://drive.google.com/file/d/…/view"
                           autocomplete="off" spellcheck="false"
                           oninput="window._bibURLHint(this.value)">
                    <input class="bib-url-input" id="bib-url-titulo" type="text"
                           placeholder="Título (opcional — se auto-detecta del nombre)"
                           autocomplete="off">
                    <div class="bib-url-actions">
                        <button class="bib-url-btn-cancel" onclick="window._bibCerrarURLModal()">Cancelar</button>
                        <button class="bib-url-btn-ok" id="bib-url-btn-ok" onclick="window._bibAgregarDesdeURL()">⬇ Descargar y agregar</button>
                    </div>
                    <div class="bib-url-status" id="bib-url-status"></div>
                </div>
            </div>

            <!-- GRID -->
            <div class="bib-grid-container" id="bib-grid-container">
                <div class="bib-grid" id="bib-grid"></div>
            </div>

            <!-- FOOTER -->
            <div class="bib-footer">
                <span class="bib-storage-label">IndexedDB</span>
                <div class="bib-storage-bar-wrap">
                    <div class="bib-storage-bar-fill" id="bib-storage-fill" style="width:0%"></div>
                </div>
                <span class="bib-storage-label" id="bib-storage-size">—</span>
            </div>

            <!-- Input file oculto -->
            <input type="file" id="bib-file-input" accept=".epub,.pdf,.txt,.fb2,.docx"
                   style="display:none" multiple>
        `;
        sidebar.appendChild(bibPanel);

        // 4) Drag & drop
        bibPanel.addEventListener('dragover', e => {
            e.preventDefault();
            document.getElementById('bib-drop-overlay')?.classList.add('visible');
        });
        bibPanel.addEventListener('dragleave', e => {
            if (!bibPanel.contains(e.relatedTarget)) {
                document.getElementById('bib-drop-overlay')?.classList.remove('visible');
            }
        });
        bibPanel.addEventListener('drop', e => {
            e.preventDefault();
            document.getElementById('bib-drop-overlay')?.classList.remove('visible');
            if (e.dataTransfer?.files) _procesarArchivos(e.dataTransfer.files);
        });

        // 5) Input file change
        document.getElementById('bib-file-input')?.addEventListener('change', function () {
            if (this.files) _procesarArchivos(this.files);
            this.value = '';
        });

        // 6) Calcular uso de IndexedDB (estimado)
        _calcularUsoStorage();
    }

    async function _calcularUsoStorage() {
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const { usage, quota } = await navigator.storage.estimate();
                const usageMB = (usage / 1024 / 1024).toFixed(1);
                const pct = quota > 0 ? Math.round((usage / quota) * 100) : 0;
                const el = document.getElementById('bib-storage-size');
                const fill = document.getElementById('bib-storage-fill');
                if (el) el.textContent = `~${usageMB} MB`;
                if (fill) fill.style.width = `${Math.min(pct, 100)}%`;
            }
        } catch (e) { /* silencioso */ }
    }

    async function _procesarArchivos(files) {
        for (const file of Array.from(files)) {
            await bibAgregarArchivo(file);
        }
        _calcularUsoStorage();
    }

    // ─── INYECCIÓN DE ESTILOS ─────────────────────────────────────

    function _inyectarEstilos() {
        const style = document.createElement('style');
        style.textContent = `
/* ── Biblioteca: show/hide directo dentro del .sidebar (sin wrapper, sin translate) ── */
.sidebar-biblioteca {
    display: none;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: var(--bg-panel);
}
.sidebar-biblioteca::-webkit-scrollbar { width: 3px; }
.sidebar-biblioteca::-webkit-scrollbar-thumb { background: var(--border); }

/* Cuando biblioteca está activa: ocultar contenido normal, mostrar panel bib */
.sidebar.biblioteca-activa > *:not(#sidebar-biblioteca):not(.sidebar-biblioteca) {
    display: none !important;
}
.sidebar.biblioteca-activa .sidebar-biblioteca {
    display: flex;
}

/* ── Botón "Mis libros" en el sidebar lector ── */
.btn-abrir-biblioteca {
    width: 100%;
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    padding: 7px 10px;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
    margin-top: 8px;
}
.btn-abrir-biblioteca:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(200,169,110,0.04);
}
.btn-abrir-biblioteca .badge {
    margin-left: auto;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 0.5rem;
    padding: 1px 5px;
    color: var(--text-dim);
}

/* ── Biblioteca: header ── */
.bib-header {
    padding: 14px 20px 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.bib-header-top {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}
.bib-titulo {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    flex: 1;
}
.bib-count {
    font-size: 0.5rem;
    color: var(--text-dim);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
    margin-right: 8px;
}
.bib-btn-volver {
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 2px 4px;
    transition: color 0.2s;
    line-height: 1;
}
.bib-btn-volver:hover { color: var(--accent); }

.bib-search {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    padding: 6px 10px;
    outline: none;
    margin-bottom: 10px;
    transition: border-color 0.2s;
}
.bib-search:focus { border-color: var(--accent); }
.bib-search::placeholder { color: var(--text-dim); }

.bib-tabs { display: flex; gap: 0; margin-bottom: -1px; }
.bib-tab {
    background: none;
    border: 1px solid transparent;
    border-bottom: none;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 0.04em;
    padding: 5px 10px;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.bib-tab:hover { color: var(--text-muted); }
.bib-tab.active {
    color: var(--accent);
    background: var(--surface2);
    border-color: var(--border);
}

/* ── Toolbar ── */
.bib-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.bib-sort {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.55rem;
    padding: 4px 6px;
    outline: none;
    cursor: pointer;
}
.bib-btn-agregar {
    background: var(--accent);
    border: none;
    border-radius: 4px;
    color: var(--bg);
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    font-weight: 500;
    padding: 5px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
}
.bib-btn-agregar:hover { opacity: 0.85; }
.bib-view-toggle { display: flex; gap: 2px; }
.bib-view-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-dim);
    font-size: 0.65rem;
    padding: 3px 6px;
    cursor: pointer;
    transition: all 0.15s;
    line-height: 1;
}
.bib-view-btn.active,
.bib-view-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Grid ── */
.bib-grid-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px 12px 20px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
}
.bib-grid-container::-webkit-scrollbar { width: 3px; }
.bib-grid-container::-webkit-scrollbar-thumb { background: var(--border); }
.bib-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.bib-grid.lista { grid-template-columns: 1fr; gap: 5px; }

/* ── Tarjeta libro ── */
.libro-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
    position: relative;
    display: flex;
    flex-direction: column;
    animation: bibCardIn 0.22s ease both;
}
@keyframes bibCardIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
.libro-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
}
.libro-card.activo { border-color: var(--accent2); }
.libro-card.activo::after {
    content: '▶';
    position: absolute;
    top: 6px; right: 6px;
    font-size: 0.5rem;
    color: var(--accent2);
    background: rgba(0,0,0,0.7);
    border-radius: 3px;
    padding: 2px 4px;
    line-height: 1;
}
.libro-cover {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    display: block;
    background: var(--surface);
}
.libro-cover-placeholder {
    width: 100%;
    aspect-ratio: 2/3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px;
}
.libro-cover-placeholder .ph-icon   { font-size: 1.4rem; opacity: 0.35; }
.libro-cover-placeholder .ph-formato {
    font-size: 0.42rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    background: rgba(0,0,0,0.3);
    border-radius: 3px;
    padding: 1px 5px;
}
.libro-cover-wrap { position: relative; }
.libro-cover-wrap::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 35%;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    pointer-events: none;
}
.libro-info {
    padding: 6px 8px 8px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.libro-titulo {
    font-size: 0.58rem;
    color: var(--text);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.libro-autor {
    font-size: 0.5rem;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.libro-meta { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.libro-formato-badge {
    font-size: 0.42rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 4px;
}
.libro-formato-badge.epub { color: var(--accent2); border-color: rgba(126,184,154,0.3); }
.libro-formato-badge.pdf  { color: var(--accent);  border-color: rgba(200,169,110,0.3); }
.libro-pct { font-size: 0.46rem; color: var(--text-dim); margin-left: 2px; }
.libro-progreso-wrap {
    margin-top: 4px;
    height: 2px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
}
.libro-progreso-fill {
    height: 100%;
    background: var(--accent2);
    border-radius: 2px;
    transition: width 0.4s ease;
}
.libro-menu-btn {
    position: absolute;
    top: 5px; left: 5px;
    background: rgba(0,0,0,0.6);
    border: none;
    border-radius: 4px;
    color: var(--text-dim);
    font-size: 0.65rem;
    width: 22px; height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    z-index: 2;
    line-height: 1;
}
.libro-card:hover .libro-menu-btn { opacity: 1; }
.libro-menu-btn:hover { color: var(--accent); }

/* ── Vista lista ── */
.bib-grid.lista .libro-card     { flex-direction: row; height: 54px; }
.bib-grid.lista .libro-cover-wrap { width: 36px; flex-shrink: 0; }
.bib-grid.lista .libro-cover,
.bib-grid.lista .libro-cover-placeholder { width: 36px; height: 54px; aspect-ratio: unset; }
.bib-grid.lista .libro-cover-wrap::after { display: none; }
.bib-grid.lista .libro-info {
    flex-direction: row;
    align-items: center;
    padding: 0 10px;
    gap: 0;
}
.bib-grid.lista .libro-titulo    { flex: 1; -webkit-line-clamp: 1; font-size: 0.62rem; }
.bib-grid.lista .libro-autor     { display: none; }
.bib-grid.lista .libro-progreso-wrap { display: none; }
.bib-grid.lista .libro-meta      { margin-top: 0; margin-left: 6px; }
.bib-grid.lista .libro-menu-btn  { top: 50%; left: unset; right: 6px; transform: translateY(-50%); }

/* ── Empty state ── */
.bib-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 36px 20px;
    color: var(--text-dim);
    text-align: center;
}
.bib-empty-icon   { font-size: 2rem; opacity: 0.2; }
.bib-empty-titulo { font-size: 0.65rem; color: var(--text-muted); }
.bib-empty-sub    { font-size: 0.55rem; color: var(--text-dim); line-height: 1.6; white-space: pre-line; }
.bib-empty-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem;
    padding: 7px 14px;
    cursor: pointer;
    margin-top: 4px;
    transition: border-color 0.2s, color 0.2s;
}
.bib-empty-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Drop overlay ── */
.bib-drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(200,169,110,0.07);
    border: 2px dashed var(--accent);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
}
.bib-drop-overlay.visible { display: flex; }
.bib-drop-msg { font-size: 0.65rem; color: var(--accent); text-align: center; line-height: 1.6; }

/* ── Footer ── */
.bib-footer {
    padding: 8px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}
.bib-storage-bar-wrap {
    flex: 1;
    height: 3px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
}
.bib-storage-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent2), var(--accent));
    border-radius: 3px;
}
.bib-btn-url {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    font-size: 0.75rem;
    padding: 3px 7px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    line-height: 1.4;
}
.bib-btn-url:hover { border-color: var(--accent2); color: var(--accent2); }

/* ── Modal URL ── */
.bib-url-modal {
    position: absolute;
    inset: 0;
    background: rgba(10,10,10,0.75);
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(3px);
    animation: bibFadeIn 0.15s ease;
}
@keyframes bibFadeIn { from { opacity:0; } to { opacity:1; } }
.bib-url-modal-inner {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 340px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
}
.bib-url-modal-title {
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent2);
}
.bib-url-modal-hint {
    font-size: 0.55rem;
    color: var(--text-dim);
    line-height: 1.5;
}
.bib-url-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}
.bib-url-input:focus { border-color: var(--accent); }
.bib-url-input::placeholder { color: var(--text-dim); }
.bib-url-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
}
.bib-url-btn-cancel {
    flex: 1;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    padding: 6px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}
.bib-url-btn-cancel:hover { border-color: var(--accent); color: var(--accent); }
.bib-url-btn-ok {
    flex: 2;
    background: var(--accent2);
    border: none;
    border-radius: 4px;
    color: var(--bg);
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    font-weight: 500;
    padding: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
}
.bib-url-btn-ok:hover { opacity: 0.85; }
.bib-url-btn-ok:disabled { opacity: 0.5; cursor: default; }
.bib-url-status {
    font-size: 0.55rem;
    min-height: 14px;
    color: var(--text-dim);
    text-align: center;
}
.bib-url-status.error { color: #ff6b6b; }
.bib-url-status.ok    { color: var(--accent2); }
.bib-url-tip {
    background: rgba(126,184,154,0.06);
    border: 1px solid rgba(126,184,154,0.18);
    border-radius: 4px;
    padding: 6px 8px;
    line-height: 1.6;
    font-size: 0.52rem !important;
}
.bib-url-tip strong { color: var(--accent2); }
.bib-url-tip em     { color: var(--text-muted); font-style: normal; }
        `;
        document.head.appendChild(style);
    }

    // ─── IMPORTAR DESDE URL ───────────────────────────────────────

    function _abrirURLModal() {
        const modal = document.getElementById('bib-url-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        const input = document.getElementById('bib-url-input');
        if (input) { input.value = ''; input.focus(); }
        const tituloInput = document.getElementById('bib-url-titulo');
        if (tituloInput) tituloInput.value = '';
        _setURLStatus('', '');
        const btn = document.getElementById('bib-url-btn-ok');
        if (btn) { btn.disabled = false; btn.textContent = '⬇ Descargar y agregar'; }
    }

    function _cerrarURLModal() {
        const modal = document.getElementById('bib-url-modal');
        if (modal) modal.style.display = 'none';
    }

    function _setURLStatus(msg, tipo) {
        const el = document.getElementById('bib-url-status');
        if (!el) return;
        el.textContent = msg;
        el.className = `bib-url-status${tipo ? ' ' + tipo : ''}`;
    }

    // ─── RESOLVER URLS DE SERVICIOS CLOUD ────────────────────────
    // Transforma URLs de visor/compartir en URLs de descarga directa.
    //
    // Servicios soportados:
    //   1. Google Drive   — proxy requerido (CORS bloqueado)
    //   2. Dropbox        — dl.dropboxusercontent.com + mantener rlkey
    //   3. OneDrive       — proxy requerido (302 no-CORS)
    //   4. Box            — proxy para links /s/, directo para /shared/static/
    //   5. GitHub         — raw.githubusercontent.com CORS nativo ✓
    //
    // Retorna: { downloadURL, ext, nombreSugerido, servicio, corsNativo, needsProxy, error? }

    function _resolverURLCloud(rawURL) {
        let url;
        try { url = new URL(rawURL); } catch { return null; }

        const host = url.hostname.toLowerCase();

        // ── 1. Google Drive ───────────────────────────────────────
        if (host === 'drive.google.com' || host === 'docs.google.com') {
            // Google Docs/Sheets/Slides → exportar
            const matchDoc = url.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
            if (matchDoc) {
                const tipo = matchDoc[1];
                const docId = matchDoc[2];
                const fmt = tipo === 'document' ? 'docx' : tipo === 'spreadsheets' ? 'xlsx' : 'pdf';
                return {
                    downloadURL: `https://docs.google.com/feeds/download/${tipo}/Export?id=${docId}&exportFormat=${fmt}`,
                    ext: fmt,
                    nombreSugerido: `documento-google.${fmt}`,
                    servicio: 'Google Docs',
                    corsNativo: false,
                    needsProxy: true,
                };
            }
            let fileId = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1]
                || url.searchParams.get('id');
            if (!fileId) return { error: 'No se pudo extraer el ID de Google Drive. Usá el enlace "Compartir" del archivo.' };
            return {
                downloadURL: `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
                ext: null,
                nombreSugerido: 'archivo-gdrive',
                fileId,
                servicio: 'Google Drive',
                corsNativo: false,
                needsProxy: true,
                instruccion: 'El archivo debe ser público: Drive → Compartir → "Cualquier persona con el enlace".',
            };
        }

        // ── 2. Dropbox ────────────────────────────────────────────
        // FIX CRÍTICO: mantener rlkey (obligatorio en /scl/fi/ links)
        // Cambiar host a dl.dropboxusercontent.com que tiene CORS habilitado
        // Usar raw=1 en vez de dl=1 para evitar redirect que rompe CORS
        if (host === 'www.dropbox.com' || host === 'dropbox.com' || host === 'dl.dropboxusercontent.com') {
            const pathParts = url.pathname.split('/');
            const fileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo');
            const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);

            const cdnURL = new URL(rawURL);
            cdnURL.hostname = 'dl.dropboxusercontent.com';
            cdnURL.searchParams.delete('dl');      // quitar dl=0/dl=1
            cdnURL.searchParams.set('raw', '1');   // raw=1 sirve los bytes directos
            // rlkey SE MANTIENE — es obligatorio en links /scl/fi/

            return {
                downloadURL: cdnURL.toString(),
                ext: extMatch ? extMatch[1].toLowerCase() : null,
                nombreSugerido: fileName,
                servicio: 'Dropbox',
                corsNativo: true,
                needsProxy: false,
            };
        }

        // ── 3. OneDrive / SharePoint ──────────────────────────────
        if (host === '1drv.ms' || host.includes('onedrive.live.com') || host.includes('sharepoint.com')) {
            const resid = url.searchParams.get('resid');
            const authkey = url.searchParams.get('authkey') || url.searchParams.get('AuthKey') || '';
            const dlURL = resid
                ? `https://onedrive.live.com/download?resid=${resid}&authkey=${authkey}`
                : rawURL;
            const pathParts = url.pathname.split('/');
            const fileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo-onedrive');
            const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
            return {
                downloadURL: dlURL,
                ext: extMatch ? extMatch[1].toLowerCase() : null,
                nombreSugerido: fileName,
                servicio: 'OneDrive',
                corsNativo: false,
                needsProxy: true,
                instruccion: 'Verificá que el archivo sea compartido públicamente desde OneDrive.',
            };
        }

        // ── 4. Box ────────────────────────────────────────────────
        if (host === 'app.box.com' || host === 'box.com' || host === 'www.box.com') {
            const pathParts = url.pathname.split('/');
            const fileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo');
            const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
            const esDirecta = url.pathname.includes('/shared/static/');
            return {
                downloadURL: rawURL,
                ext: extMatch ? extMatch[1].toLowerCase() : null,
                nombreSugerido: fileName,
                servicio: 'Box',
                corsNativo: esDirecta,
                needsProxy: !esDirecta,
                instruccion: 'En Box usar "Compartir" → "Crear enlace directo" para mejor compatibilidad.',
            };
        }

        // ── 5. GitHub ─────────────────────────────────────────────
        // github.com/.../blob/... → raw.githubusercontent.com (CORS nativo)
        if (host === 'github.com') {
            const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
            if (match) {
                const [, user, repo, rest] = match;
                const rawGHURL = `https://raw.githubusercontent.com/${user}/${repo}/${rest}`;
                const pathParts = rest.split('/');
                const fileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo');
                const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
                return {
                    downloadURL: rawGHURL,
                    ext: extMatch ? extMatch[1].toLowerCase() : null,
                    nombreSugerido: fileName,
                    servicio: 'GitHub',
                    corsNativo: true,
                    needsProxy: false,
                };
            }
        }
        if (host === 'raw.githubusercontent.com') {
            const pathParts = url.pathname.split('/');
            const fileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo');
            const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
            return {
                downloadURL: rawURL,
                ext: extMatch ? extMatch[1].toLowerCase() : null,
                nombreSugerido: fileName,
                servicio: 'GitHub',
                corsNativo: true,
                needsProxy: false,
            };
        }

        // ── URL directa sin transformación ────────────────────────
        const pathParts = url.pathname.split('/');
        const rawFilename = decodeURIComponent(pathParts[pathParts.length - 1] || 'archivo');
        const extMatch = rawFilename.match(/\.([a-zA-Z0-9]+)(\?|$)/);
        return {
            downloadURL: rawURL,
            ext: extMatch ? extMatch[1].toLowerCase() : null,
            nombreSugerido: rawFilename || 'archivo',
            servicio: null,
            corsNativo: false,
            needsProxy: false,
        };
    }

    // ─── DETECTAR MIME → EXTENSIÓN ────────────────────────────────
    const MIME_A_EXT = {
        'application/epub+zip': 'epub',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/html': null,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc',
        'application/x-mobipocket-ebook': 'mobi',
        'application/x-fictionbook+xml': 'fb2',
        'application/zip': 'epub',
        'application/octet-stream': null,
    };

    function _extDesdeMime(contentType) {
        if (!contentType) return null;
        const base = contentType.split(';')[0].trim().toLowerCase();
        return MIME_A_EXT[base] ?? null;
    }

    // ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────

    // Proxies CORS — solo para servidores que no admiten CORS nativo.
    // Se prueban en orden con timeout individual.
    const CORS_PROXIES = [
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];

    // fetch con AbortController timeout
    function _fetchTimeout(url, opts = {}, ms = 25000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        return fetch(url, { ...opts, signal: ctrl.signal })
            .finally(() => clearTimeout(timer));
    }

    // Intenta fetch directo; si falla por CORS/red prueba proxies (salvo corsNativo=true).
    // Retorna { resp, viaProxy } o lanza error.
    async function _fetchConFallback(targetURL, corsNativo, onStatus) {
        // 1. Intento directo (siempre primero)
        try {
            onStatus('Conectando...', '');
            const resp = await _fetchTimeout(targetURL, { method: 'GET', mode: 'cors' }, 20000);
            if (resp.ok) return { resp, viaProxy: false };
            // HTTP error no-CORS (ej: 404, 500)
            throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado. El servidor no respondió.');
            // Si es error de red/CORS y el servicio tiene CORS nativo → no hay proxy que ayude
            if (corsNativo) throw new Error(e.message || 'Error de red');
            // Solo continuar con proxies si fue CORS/red
            const esCORSoRed = e.message.includes('Failed to fetch') ||
                e.message.includes('NetworkError') ||
                e.message.includes('Load failed') ||
                e.message.includes('fetch');
            if (!esCORSoRed) throw e;
            console.warn('[bib] Fetch directo bloqueado, probando proxies:', e.message);
        }

        // 2. Proxies con timeout individual
        for (let i = 0; i < CORS_PROXIES.length; i++) {
            const proxyURL = CORS_PROXIES[i](targetURL);
            try {
                onStatus(`⏳ Proxy ${i + 1}/${CORS_PROXIES.length}...`, '');
                const resp = await _fetchTimeout(proxyURL, { method: 'GET' }, 25000);
                if (resp.ok) return { resp, viaProxy: true };
                console.warn(`[bib] Proxy ${i + 1} devolvió ${resp.status}`);
            } catch (e) {
                const msg = e.name === 'AbortError' ? 'timeout' : e.message;
                console.warn(`[bib] Proxy ${i + 1} falló: ${msg}`);
            }
        }

        throw new Error('CORS_ALL_FAILED');
    }

    async function _agregarDesdeURL() {
        const urlInput = document.getElementById('bib-url-input');
        const tituloInput = document.getElementById('bib-url-titulo');
        const btn = document.getElementById('bib-url-btn-ok');

        const rawURL = (urlInput?.value || '').trim();
        if (!rawURL) { _setURLStatus('⚠ Ingresá una URL', 'error'); return; }

        // Resolver URL (detecta Drive, Dropbox, etc.)
        const resolved = _resolverURLCloud(rawURL);
        if (!resolved) { _setURLStatus('⚠ URL inválida', 'error'); return; }
        if (resolved.error) { _setURLStatus(`⚠ ${resolved.error}`, 'error'); return; }

        const { downloadURL, nombreSugerido, servicio, adviso, corsNativo } = resolved;
        const tituloRaw = (tituloInput?.value || '').trim();

        if (servicio) _setURLStatus(`🔗 Detectado: ${servicio} — preparando descarga...`, '');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Descargando...'; }

        try {
            const { resp, viaProxy } = await _fetchConFallback(downloadURL, corsNativo || false, _setURLStatus);

            // Detectar extensión desde Content-Type de la respuesta real
            const contentType = resp.headers.get('content-type') || '';

            // Si el Content-Type es HTML, el servidor devolvió una página de login/visor
            if (contentType.includes('text/html')) {
                throw new Error(
                    servicio === 'Google Drive'
                        ? 'Google Drive requiere que el archivo sea público: Compartir → "Cualquier persona con el enlace".'
                        : 'El servidor devolvió una página HTML en vez del archivo. Usá un enlace de descarga directa.'
                );
            }

            const extDesdeMime = _extDesdeMime(contentType);
            const ext = resolved.ext || extDesdeMime;
            if (!ext) throw new Error(`No se pudo determinar el tipo de archivo. Content-Type: "${contentType}"`);
            if (!FORMATOS_ACEPTADOS.includes(ext)) {
                throw new Error(`Formato .${ext} no soportado. Válidos: ${FORMATOS_ACEPTADOS.join(', ')}`);
            }

            _setURLStatus(`Recibiendo archivo${viaProxy ? ' (vía proxy)' : ''}...`, '');

            // arrayBuffer con timeout de 60s para archivos grandes
            const arrayBuffer = await Promise.race([
                resp.arrayBuffer(),
                new Promise((_, rej) =>
                    setTimeout(() => rej(new Error('Tiempo de espera al leer el archivo (60s). El archivo puede ser demasiado grande para descarga directa.')), 60000)
                ),
            ]);

            // Verificar que no sea HTML disfrazado (primeros bytes: '<!')
            const primeros = new Uint8Array(arrayBuffer.slice(0, 5));
            const eraHTML = primeros[0] === 0x3C &&
                (primeros[1] === 0x21 || primeros[1] === 0x68 || primeros[1] === 0x48 || primeros[1] === 0x44);
            if (eraHTML) {
                throw new Error(
                    servicio === 'Google Drive'
                        ? 'Google Drive devolvió la página del visor. Verificá que el archivo sea público y usá el enlace de compartir.'
                        : 'El servidor devolvió HTML en vez del archivo binario.'
                );
            }

            const mimeBlob = contentType.split(';')[0].trim() || 'application/octet-stream';
            const blob = new Blob([arrayBuffer], { type: mimeBlob });
            const nombreBase = tituloRaw || nombreSugerido.replace(/\.[^.]+$/, '') || 'archivo';
            const nombreFinal = `${nombreBase}.${ext}`;
            const file = new File([blob], nombreFinal, { type: mimeBlob });

            if (adviso) mostrarNotificacion(`ℹ️ ${adviso}`);
            _cerrarURLModal();
            await bibAgregarArchivo(file);

        } catch (err) {
            console.warn('[bib] Error importando URL:', err);
            let msg;
            if (err.message === 'CORS_ALL_FAILED') {
                msg = servicio
                    ? `⚠ ${servicio} bloqueó todos los intentos de descarga. Descargá el archivo manualmente y usá el botón + Agregar.`
                    : '⚠ No se pudo descargar el archivo (bloqueado por CORS). Descargalo manualmente y agregalo con el botón + Agregar.';
            } else {
                msg = `⚠ ${err.message}`;
            }
            _setURLStatus(msg, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '⬇ Descargar y agregar'; }
        }
    }

    // ─── API PÚBLICA (expuesta en window) ─────────────────────────

    window._bibAbrir = bibAbrir;
    window._bibCerrar = bibCerrar;
    window._bibAbrirLibro = (id) => bibAbrirLibro(id);
    window._bibEliminar = (id) => bibEliminar(id);
    window._bibAgregarClick = () => document.getElementById('bib-file-input')?.click();
    window._bibAgregarURLClick = _abrirURLModal;
    window._bibCerrarURLModal = _cerrarURLModal;
    window._bibAgregarDesdeURL = _agregarDesdeURL;

    // Actualiza el tip del modal según el servicio detectado en tiempo real
    window._bibURLHint = function (val) {
        const tip = document.getElementById('bib-url-cloud-tip');
        if (!tip) return;
        const v = (val || '').toLowerCase();
        if (v.includes('drive.google.com') || v.includes('docs.google.com')) {
            tip.innerHTML = '💡 <strong>Google Drive:</strong> El archivo debe ser público.<br>Compartir → <em>"Cualquier persona con el enlace"</em> → pegá la URL de compartir.';
            tip.style.display = 'block';
        } else if (v.includes('dropbox.com')) {
            tip.innerHTML = '💡 <strong>Dropbox:</strong> Se transforma automáticamente a descarga directa. Asegurate de compartir el link públicamente.';
            tip.style.display = 'block';
        } else if (v.includes('1drv.ms') || v.includes('onedrive.live.com') || v.includes('sharepoint.com')) {
            tip.innerHTML = '💡 <strong>OneDrive:</strong> Usá "Compartir" → "Copiar vínculo" con acceso público (sin iniciar sesión).';
            tip.style.display = 'block';
        } else if (v.includes('box.com')) {
            tip.innerHTML = '💡 <strong>Box:</strong> Compartir → "Crear enlace directo" para mejor compatibilidad.';
            tip.style.display = 'block';
        } else if (v.includes('github.com') || v.includes('raw.githubusercontent.com')) {
            tip.innerHTML = '💡 <strong>GitHub:</strong> Se convierte automáticamente a raw. También podés pegar directamente la URL raw.';
            tip.style.display = 'block';
        } else if (v.length > 8) {
            tip.innerHTML = '💡 URL directa a un archivo EPUB, PDF, TXT, DOCX, etc.';
            tip.style.display = 'block';
        } else {
            tip.style.display = 'none';
        }
    };

    window._bibTab = (tab) => {
        _tab = tab;
        document.querySelectorAll('.bib-tab').forEach(b => b.classList.remove('active'));
        document.getElementById(`bib-tab-${tab}`)?.classList.add('active');
        _render();
    };

    window._bibFiltrar = (q) => { _busqueda = q; _render(); };

    window._bibOrdenar = (v) => { _orden = v; _render(); };

    window._bibVista = (v) => {
        _vista = v;
        document.getElementById('bib-btn-grid')?.classList.toggle('active', v === 'grid');
        document.getElementById('bib-btn-lista')?.classList.toggle('active', v === 'lista');
        _render();
    };

    window._bibMenuLibro = (e, id) => {
        e.stopPropagation();
        const libro = _libros.find(l => l.id === id);
        if (!libro) return;
        if (confirm(`¿Eliminar "${libro.titulo}" de la biblioteca?\n\nEl archivo se borrará de este dispositivo.`)) {
            bibEliminar(id);
        }
    };

    // Exponer para que epub.js pueda actualizar el progreso
    window.bibActualizarProgreso = bibActualizarProgreso;

    // ── Alias para el botón del rail (ic-chapters nth-child 4) ──
    window.abrirBiblioteca = bibAbrir;

    // ─── ARRANQUE ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

})();