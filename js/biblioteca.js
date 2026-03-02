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
    const IDB_NAME    = 'totalreader_biblioteca';
    const IDB_VERSION = 1;
    const IDB_STORE   = 'archivos';
    const SB_TABLE    = 'biblioteca';
    const META_KEY    = 'biblioteca_meta'; // uStorage fallback para guests

    // Formatos aceptados por el lector
    const FORMATOS_ACEPTADOS = [
        'epub','pdf','txt','html','htm','fb2','fb3',
        'docx','rtf','odt','mobi','prc','azw3','azw','cbz','cbr'
    ];

    // Paletas procedurales para portadas sin imagen
    const COVER_PALETTES = [
        ['#1a2a1a','#3a6a3a','#7eb89a'],
        ['#2a1a0a','#6a3a0a','#c8a96e'],
        ['#1a1a2a','#3a3a6a','#8a8ac8'],
        ['#2a0a0a','#6a1a1a','#c87a7a'],
        ['#0a2a2a','#1a5a5a','#5ab8b8'],
        ['#1a1a0a','#4a4a1a','#a8a860'],
        ['#2a0a1a','#6a1a4a','#c87ab0'],
    ];

    // ─── ESTADO ───────────────────────────────────────────────────
    let _idb        = null;   // instancia de IDBDatabase
    let _libros     = [];     // array de metadata en memoria
    let _vista      = 'grid'; // 'grid' | 'lista'
    let _tab        = 'todos';
    let _busqueda   = '';
    let _orden      = 'reciente';
    let _abierta    = false;

    // ─── INIT ─────────────────────────────────────────────────────

    async function init() {
        await _abrirIDB();
        await _cargarMeta();
        _inyectarHTML();
        _inyectarEstilos();
        _render();

        // Escuchar eventos de auth para sincronizar con Supabase
        document.addEventListener('auth:signin',  () => _sincronizarConSupabase());
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
            req.onerror   = e => { console.error('[bib] IDB error:', e); resolve(); };
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
            req.onerror   = reject;
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
            id:           row.id,
            titulo:       row.titulo,
            autor:        row.autor || '',
            formato:      row.formato,
            portada:      row.portada || null,
            progreso:     row.progreso || 0,
            capActual:    row.cap_actual || 0,
            totalCaps:    row.total_caps || 0,
            idbKey:       row.idb_key,
            tamano:       row.tamano || 0,
            fechaAgregado: new Date(row.fecha_agregado).getTime(),
            activo:       false,
        };
    }

    function _mapLocalASupabase(libro) {
        return {
            id:             libro.id,
            user_id:        typeof getUserId === 'function' ? getUserId() : null,
            titulo:         libro.titulo,
            autor:          libro.autor || null,
            formato:        libro.formato,
            portada:        libro.portada || null,
            progreso:       libro.progreso || 0,
            cap_actual:     libro.capActual || 0,
            total_caps:     libro.totalCaps || 0,
            idb_key:        libro.idbKey,
            tamano:         libro.tamano || 0,
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
        const autor  = partes[1]?.trim() || '';

        const libro = {
            id,
            titulo,
            autor,
            formato:       ext,
            portada:       null,
            progreso:      0,
            capActual:     0,
            totalCaps:     0,
            idbKey:        id,
            tamano:        file.size,
            fechaAgregado: Date.now(),
            activo:        false,
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

        libro.capActual  = capActual;
        libro.totalCaps  = totalCaps;
        libro.progreso   = totalCaps > 0 ? capActual / totalCaps : 0;

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
        document.getElementById('sidebar-wrapper')?.classList.add('biblioteca-activa');
        _render();
        setTimeout(() => document.getElementById('bib-search')?.focus(), 320);
    }

    function bibCerrar() {
        _abierta = false;
        document.getElementById('sidebar-wrapper')?.classList.remove('biblioteca-activa');
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
        if (_tab === 'epub')    libros = libros.filter(l => l.formato === 'epub');
        if (_tab === 'pdf')     libros = libros.filter(l => l.formato === 'pdf');
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
        if (_orden === 'titulo')   libros.sort((a,b) => a.titulo.localeCompare(b.titulo));
        if (_orden === 'autor')    libros.sort((a,b) => (a.autor||'').localeCompare(b.autor||''));
        if (_orden === 'reciente') libros.sort((a,b) => b.fechaAgregado - a.fechaAgregado);
        if (_orden === 'progreso') libros.sort((a,b) => b.progreso - a.progreso);

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
        const iconos  = { epub:'📖', pdf:'📄', txt:'📝' };
        const pct     = Math.round(l.progreso * 100);

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
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── INYECCIÓN HTML ───────────────────────────────────────────

    function _inyectarHTML() {
        // 1) Envolver .sidebar existente en .sidebar-wrapper
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar-wrapper';
        wrapper.id = 'sidebar-wrapper';
        sidebar.parentNode.insertBefore(wrapper, sidebar);
        sidebar.classList.add('sidebar-reader');
        sidebar.id = 'sidebar-reader';
        wrapper.appendChild(sidebar);

        // 2) Inyectar botón "Mis libros" en la primera sidebar-section (Archivo)
        const secArchivo = sidebar.querySelector('.sidebar-section');
        if (secArchivo) {
            const btn = document.createElement('button');
            btn.className = 'btn-abrir-biblioteca';
            btn.setAttribute('onclick', 'window._bibAbrir()');
            btn.innerHTML = `📚 Mis libros <span class="badge" id="bib-badge-count">0</span>`;
            secArchivo.appendChild(btn);
        }

        // 3) Inyectar panel biblioteca
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
                <button class="bib-btn-agregar" onclick="window._bibAgregarClick()">+ Agregar</button>
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
        wrapper.appendChild(bibPanel);

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
/* ── Sidebar wrapper — contenedor del naipe flip ── */
.sidebar-wrapper {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    width: var(--sidebar-w);
}

/* Las dos caras del naipe comparten el mismo espacio */
.sidebar-reader,
.sidebar-biblioteca {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: var(--surface);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
    transition: transform 0.32s cubic-bezier(0.4,0,0.2,1),
                opacity 0.28s ease;
    will-change: transform, opacity;
}

.sidebar-reader::-webkit-scrollbar,
.sidebar-biblioteca::-webkit-scrollbar { width: 3px; }
.sidebar-reader::-webkit-scrollbar-thumb,
.sidebar-biblioteca::-webkit-scrollbar-thumb { background: var(--border); }

/* Estado inicial: lector visible, biblioteca fuera por la derecha */
.sidebar-reader     { transform: translateX(0);    opacity: 1; pointer-events: auto; }
.sidebar-biblioteca { transform: translateX(100%); opacity: 0; pointer-events: none; }

/* Biblioteca activa */
.sidebar-wrapper.biblioteca-activa .sidebar-reader {
    transform: translateX(-100%); opacity: 0; pointer-events: none;
}
.sidebar-wrapper.biblioteca-activa .sidebar-biblioteca {
    transform: translateX(0); opacity: 1; pointer-events: auto;
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
.bib-storage-label { font-size: 0.5rem; color: var(--text-dim); white-space: nowrap; }
        `;
        document.head.appendChild(style);
    }

    // ─── API PÚBLICA (expuesta en window) ─────────────────────────

    window._bibAbrir        = bibAbrir;
    window._bibCerrar       = bibCerrar;
    window._bibAbrirLibro   = (id) => bibAbrirLibro(id);
    window._bibEliminar     = (id) => bibEliminar(id);
    window._bibAgregarClick = () => document.getElementById('bib-file-input')?.click();

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

    // ─── ARRANQUE ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

})();
