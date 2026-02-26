// ═══════════════════════════════════════════════════════════════
// LIBRARY — Búsqueda de libros vía LibGen JSON API
// Depende de: main.js (mostrarNotificacion, archivosHTML)
//             epub.js / formats.js (cargarCapitulo, cargarFormatoAlternativo)
// Se inserta como panel colapsable en el sidebar.
// ═══════════════════════════════════════════════════════════════

// ── Configuración ────────────────────────────────────────────────
// LibGen tiene varios mirrors; se prueban en orden hasta que uno responda
const LG_MIRRORS = [
    'https://libgen.is',
    'https://libgen.st',
    'https://libgen.rs',
];

// CORS proxy para las llamadas JSON de la API.
// LibGen no devuelve headers CORS, así que el browser bloquea los requests directos.
// corsproxy.io acepta JSON/XML sin autenticación y es gratuito.
// Solo se usa para la API JSON — las descargas se abren en tab nueva (sin CORS).
const LG_CORS_PROXIES = [
    'https://corsproxy.io/?url=',
    'https://api.allorigins.win/raw?url=',
];
let _lgCorsProxy = LG_CORS_PROXIES[0];

// Campos que pedimos de cada edición
const LG_FIELDS_E = 'id,title,year,language,pages,filesize';
// Campos extra de archivos
const LG_FIELDS_F = 'id,md5,extension,filesize';

// Mirror activo (se actualiza si uno falla)
let _lgMirror = LG_MIRRORS[0];

// Cache simple: query → resultado
const _lgCache = {};

// ── Estado del panel ─────────────────────────────────────────────
let _lgOpen = false;   // si el panel está expandido
let _lgPage = 0;       // página actual (offset = _lgPage * LG_PAGE_SIZE)
let _lgTotal = 0;       // total de resultados estimado
let _lgLastQ = '';      // última query ejecutada
let _lgLastType = 'e';    // tipo: 'e', 'a', 's'
const LG_PAGE_SIZE = 25;

// ═══════════════════════════════════════════════════════════════
// INYECCIÓN DEL PANEL EN EL SIDEBAR
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const panel = document.createElement('div');
    panel.className = 'sidebar-section';
    panel.id = 'lg-section';
    panel.innerHTML = `
        <!-- ── Encabezado colapsable ── -->
        <div class="section-label collapsible-label"
             onclick="lgTogglePanel()"
             style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.8rem;">🔍</span>
            Buscar libros
            <span id="lg-arrow" style="margin-left:auto;font-size:0.7rem;color:var(--text-dim);">▶</span>
        </div>

        <!-- ── Cuerpo (colapsado por defecto) ── -->
        <div id="lg-body" style="display:none;">

            <!-- Barra de búsqueda -->
            <div style="display:flex;gap:4px;margin-bottom:6px;">
                <input  id="lg-input"
                        type="text"
                        placeholder="Título, autor o serie..."
                        autocomplete="off"
                        style="flex:1;background:var(--bg);border:1px solid var(--border);
                               border-radius:4px;color:var(--text);font-family:'DM Mono',monospace;
                               font-size:0.65rem;padding:6px 8px;outline:none;min-width:0;
                               transition:border-color 0.2s;"
                        onfocus="this.style.borderColor='var(--accent)'"
                        onblur="this.style.borderColor='var(--border)'"
                        onkeydown="if(event.key==='Enter')lgBuscar()">
                <button onclick="lgBuscar()"
                        style="background:var(--accent);border:none;border-radius:4px;
                               color:var(--bg);font-family:'DM Mono',monospace;font-size:0.65rem;
                               padding:6px 10px;cursor:pointer;flex-shrink:0;
                               transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.85'"
                        onmouseout="this.style.opacity='1'">
                    Buscar
                </button>
            </div>

            <!-- Filtros de tipo -->
            <div style="display:flex;gap:4px;margin-bottom:8px;" id="lg-type-btns">
                <button id="lg-type-e" onclick="lgSetType('e')"
                        class="lg-type-btn lg-type-active"
                        style="flex:1;">📖 Libros</button>
                <button id="lg-type-a" onclick="lgSetType('a')"
                        class="lg-type-btn"
                        style="flex:1;">✍ Autores</button>
                <button id="lg-type-s" onclick="lgSetType('s')"
                        class="lg-type-btn"
                        style="flex:1;">📚 Series</button>
            </div>

            <!-- Mirror selector (pequeño) -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="font-size:0.55rem;color:var(--text-dim);flex-shrink:0;">Mirror:</span>
                <select id="lg-mirror-sel"
                        onchange="lgSetMirror(this.value)"
                        style="flex:1;background:var(--bg);border:1px solid var(--border);
                               border-radius:3px;color:var(--text-dim);font-family:'DM Mono',monospace;
                               font-size:0.55rem;padding:2px 4px;outline:none;cursor:pointer;">
                    ${LG_MIRRORS.map(m => `<option value="${m}">${m.replace('https://', '')}</option>`).join('')}
                </select>
                <span id="lg-mirror-status" style="font-size:0.6rem;color:var(--text-dim);flex-shrink:0;">●</span>
            </div>

            <!-- Estado / spinner -->
            <div id="lg-status"
                 style="font-size:0.6rem;color:var(--text-dim);font-family:'DM Mono',monospace;
                        margin-bottom:6px;min-height:14px;"></div>

            <!-- Lista de resultados -->
            <div id="lg-results"
                 style="display:flex;flex-direction:column;gap:5px;
                        max-height:340px;overflow-y:auto;
                        scrollbar-width:thin;scrollbar-color:var(--border) transparent;">
            </div>

            <!-- Paginación -->
            <div id="lg-pagination"
                 style="display:none;display:flex;justify-content:space-between;
                        align-items:center;margin-top:8px;gap:4px;">
                <button id="lg-prev" onclick="lgPaginar(-1)"
                        style="background:none;border:1px solid var(--border);border-radius:4px;
                               color:var(--text-dim);font-family:'DM Mono',monospace;
                               font-size:0.6rem;padding:3px 8px;cursor:pointer;">◀</button>
                <span id="lg-page-label"
                      style="font-size:0.58rem;color:var(--text-dim);font-family:'DM Mono',monospace;">
                </span>
                <button id="lg-next" onclick="lgPaginar(1)"
                        style="background:none;border:1px solid var(--border);border-radius:4px;
                               color:var(--text-dim);font-family:'DM Mono',monospace;
                               font-size:0.6rem;padding:3px 8px;cursor:pointer;">▶</button>
            </div>

        </div><!-- /#lg-body -->
    `;

    // Insertar antes de la primera sección del sidebar (encima de "Archivo")
    const firstSection = sidebar.querySelector('.sidebar-section');
    if (firstSection) {
        sidebar.insertBefore(panel, firstSection);
    } else {
        sidebar.appendChild(panel);
    }

    // Estilos dinámicos
    const style = document.createElement('style');
    style.textContent = `
        .lg-type-btn {
            background: none;
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            font-size: 0.58rem;
            padding: 4px 0;
            cursor: pointer;
            transition: all 0.15s;
        }
        .lg-type-btn:hover { border-color: var(--accent); color: var(--accent); }
        .lg-type-active {
            background: var(--accent) !important;
            border-color: var(--accent) !important;
            color: var(--bg) !important;
        }
        .lg-book-card {
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 7px 9px;
            cursor: default;
            transition: border-color 0.15s;
        }
        .lg-book-card:hover { border-color: var(--accent2); }
        .lg-book-title {
            font-size: 0.68rem;
            color: var(--text);
            font-family: 'Lora', serif;
            line-height: 1.35;
            margin-bottom: 3px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .lg-book-meta {
            font-size: 0.56rem;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            margin-bottom: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .lg-book-actions {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .lg-dl-btn {
            background: none;
            border: 1px solid var(--border);
            border-radius: 3px;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            font-size: 0.55rem;
            padding: 2px 6px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .lg-dl-btn:hover { border-color: var(--accent2); color: var(--accent2); }
        .lg-dl-btn.primary { border-color: var(--accent); color: var(--accent); }
        .lg-dl-btn.primary:hover { background: var(--accent); color: var(--bg); }
        .lg-author-card {
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 6px 9px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
        }
        .lg-author-name {
            font-size: 0.65rem;
            color: var(--text);
            font-family: 'DM Mono', monospace;
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
});

// ═══════════════════════════════════════════════════════════════
// TOGGLE PANEL
// ═══════════════════════════════════════════════════════════════

function lgTogglePanel() {
    _lgOpen = !_lgOpen;
    const body = document.getElementById('lg-body');
    const arrow = document.getElementById('lg-arrow');
    if (body) body.style.display = _lgOpen ? 'block' : 'none';
    if (arrow) arrow.textContent = _lgOpen ? '▼' : '▶';
}

function lgSetMirror(url) {
    _lgMirror = url;
    const st = document.getElementById('lg-mirror-status');
    if (st) { st.textContent = '●'; st.style.color = 'var(--text-dim)'; }
}

function lgSetType(type) {
    _lgLastType = type;
    ['e', 'a', 's'].forEach(t => {
        const btn = document.getElementById(`lg-type-${t}`);
        if (btn) btn.classList.toggle('lg-type-active', t === type);
    });
    // Si ya había una búsqueda, re-ejecutarla con el nuevo tipo
    if (_lgLastQ) { _lgPage = 0; lgEjecutarBusqueda(_lgLastQ, type); }
}

// ═══════════════════════════════════════════════════════════════
// BÚSQUEDA
// ═══════════════════════════════════════════════════════════════

function lgBuscar() {
    const input = document.getElementById('lg-input');
    const q = input?.value?.trim();
    if (!q) return;
    _lgPage = 0;
    _lgLastQ = q;
    lgEjecutarBusqueda(q, _lgLastType);
}

function lgPaginar(dir) {
    const newPage = _lgPage + dir;
    if (newPage < 0) return;
    const maxPage = Math.ceil(_lgTotal / LG_PAGE_SIZE) - 1;
    if (newPage > maxPage) return;
    _lgPage = newPage;
    lgEjecutarBusqueda(_lgLastQ, _lgLastType);
}

async function lgEjecutarBusqueda(query, type) {
    const statusEl = document.getElementById('lg-status');
    const resultsEl = document.getElementById('lg-results');
    const paginEl = document.getElementById('lg-pagination');

    if (statusEl) statusEl.textContent = '⏳ Buscando...';
    if (resultsEl) resultsEl.innerHTML = '';
    if (paginEl) paginEl.style.display = 'none';

    const offset = _lgPage * LG_PAGE_SIZE;

    try {
        let data;

        if (type === 'e') {
            // Buscar ediciones por título
            data = await lgFetch({
                object: 'e', title: query,
                fields: LG_FIELDS_E,
                limit1: offset, limit2: LG_PAGE_SIZE
            });
        } else if (type === 'a') {
            // Buscar autores
            data = await lgFetch({
                object: 'a', name: query,
                fields: 'id,name',
                limit1: offset, limit2: LG_PAGE_SIZE
            });
        } else if (type === 's') {
            // Buscar series
            data = await lgFetch({
                object: 's', title: query,
                fields: 'id,title',
                limit1: offset, limit2: LG_PAGE_SIZE
            });
        }

        if (!data || data.length === 0) {
            if (statusEl) statusEl.textContent = '— Sin resultados';
            return;
        }

        _lgTotal = data.length < LG_PAGE_SIZE
            ? offset + data.length
            : offset + data.length + 1; // estimado mínimo

        lgRenderResultados(data, type, resultsEl);

        const totalPages = Math.ceil(_lgTotal / LG_PAGE_SIZE);
        if (statusEl) statusEl.textContent = `${data.length} resultado(s) · pág. ${_lgPage + 1}`;

        // Paginación
        if (paginEl) {
            const showPagin = _lgPage > 0 || data.length >= LG_PAGE_SIZE;
            paginEl.style.display = showPagin ? 'flex' : 'none';
            const lbl = document.getElementById('lg-page-label');
            if (lbl) lbl.textContent = `Pág. ${_lgPage + 1}`;
            const prev = document.getElementById('lg-prev');
            const next = document.getElementById('lg-next');
            if (prev) prev.disabled = _lgPage === 0;
            if (next) next.disabled = data.length < LG_PAGE_SIZE;
        }

        // Marcar mirror como OK
        const st = document.getElementById('lg-mirror-status');
        if (st) { st.textContent = '●'; st.style.color = 'var(--accent2)'; }

    } catch (err) {
        console.error('[library]', err);
        if (statusEl) statusEl.textContent = `⚠ ${err.message}`;
        const st = document.getElementById('lg-mirror-status');
        if (st) { st.textContent = '●'; st.style.color = '#ff6b6b'; }
    }
}

// ═══════════════════════════════════════════════════════════════
// FETCH — llama a la API con reintentos en mirrors
// ═══════════════════════════════════════════════════════════════

async function lgFetch(params) {
    // Construir query string
    const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    // Intentar cada combinación de mirror × cors-proxy
    const mirrors = [_lgMirror, ...LG_MIRRORS.filter(m => m !== _lgMirror)];
    const proxies = [_lgCorsProxy, ...LG_CORS_PROXIES.filter(p => p !== _lgCorsProxy)];

    for (const proxy of proxies) {
        for (const mirror of mirrors) {
            try {
                const apiUrl = `${mirror}/json.php?${qs}`;
                const fullUrl = `${proxy}${encodeURIComponent(apiUrl)}`;
                const resp = await fetch(fullUrl, { signal: AbortSignal.timeout(10000) });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();

                // Actualizar mirror y proxy activos si cambiamos
                if (mirror !== _lgMirror) {
                    _lgMirror = mirror;
                    const sel = document.getElementById('lg-mirror-sel');
                    if (sel) sel.value = mirror;
                }
                if (proxy !== _lgCorsProxy) _lgCorsProxy = proxy;

                return Array.isArray(json) ? json : [];
            } catch (e) {
                console.warn(`[library] ${proxy} + ${mirror} falló:`, e.message);
            }
        }
    }

    throw new Error('No se pudo conectar. Verificá tu conexión a internet.');
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════

function lgRenderResultados(data, type, container) {
    if (type === 'e') {
        data.forEach(item => container.appendChild(lgCardEdicion(item)));
    } else if (type === 'a') {
        data.forEach(item => container.appendChild(lgCardAutor(item)));
    } else if (type === 's') {
        data.forEach(item => container.appendChild(lgCardSerie(item)));
    }
}

function lgCardEdicion(item) {
    const card = document.createElement('div');
    card.className = 'lg-book-card';

    const title = _escLg(item.title || 'Sin título');
    const year = item.year ? `${item.year} · ` : '';
    const lang = item.language ? `${item.language.toUpperCase()} · ` : '';
    const pages = item.pages ? `${item.pages} pág. · ` : '';
    const size = item.filesize ? `${_formatBytes(item.filesize)}` : '';

    card.innerHTML = `
        <div class="lg-book-title" title="${title}">${title}</div>
        <div class="lg-book-meta">${year}${lang}${pages}${size}</div>
        <div class="lg-book-actions" id="lg-actions-${item.id}">
            <button class="lg-dl-btn primary"
                    onclick="lgVerArchivos(${item.id}, this)">
                📥 Descargar
            </button>
            <button class="lg-dl-btn"
                    onclick="lgVerDetalle(${item.id})">
                ℹ Detalle
            </button>
        </div>
    `;
    return card;
}

function lgCardAutor(item) {
    const card = document.createElement('div');
    card.className = 'lg-author-card';
    card.innerHTML = `
        <span class="lg-author-name" title="${_escLg(item.name || '')}">${_escLg(item.name || 'Autor desconocido')}</span>
        <button class="lg-dl-btn"
                onclick="lgBuscarPorAutor(${item.id}, '${_escLg(item.name || '')}')">
            Ver libros →
        </button>
    `;
    return card;
}

function lgCardSerie(item) {
    const card = document.createElement('div');
    card.className = 'lg-author-card';
    card.innerHTML = `
        <span class="lg-author-name" title="${_escLg(item.title || '')}">${_escLg(item.title || 'Serie sin título')}</span>
        <button class="lg-dl-btn"
                onclick="lgBuscarPorSerie(${item.id}, '${_escLg(item.title || '')}')">
            Ver libros →
        </button>
    `;
    return card;
}

// ── Ver archivos de una edición ──────────────────────────────────
async function lgVerArchivos(editionId, btnEl) {
    const actionsEl = btnEl?.parentElement;
    if (actionsEl) {
        actionsEl.innerHTML = '<span style="font-size:0.58rem;color:var(--text-dim);">⏳ Cargando archivos...</span>';
    }

    try {
        // Obtener edición con archivos relacionados
        const data = await lgFetch({ object: 'e', ids: editionId, fields: '*' });
        if (!data || data.length === 0) throw new Error('Edición no encontrada');

        const edition = data[0];
        const files = edition.files || [];

        if (files.length === 0) {
            // Sin archivos directos — buscar por id de edición en archivos
            const fdata = await lgFetch({
                object: 'f', ids: editionId,
                fields: 'id,md5,extension,filesize'
            });
            if (fdata && fdata.length > 0) {
                lgRenderArchivos(fdata, actionsEl, edition.title);
            } else {
                if (actionsEl) actionsEl.innerHTML =
                    `<span style="font-size:0.58rem;color:#ff6b6b;">Sin archivos disponibles</span>`;
            }
            return;
        }

        lgRenderArchivos(files, actionsEl, edition.title);

    } catch (err) {
        console.error('[library] lgVerArchivos:', err);
        if (actionsEl) actionsEl.innerHTML =
            `<span style="font-size:0.58rem;color:#ff6b6b;">⚠ ${err.message}</span>`;
    }
}

function lgRenderArchivos(files, container, bookTitle) {
    if (!container) return;
    container.innerHTML = '';

    // Ordenar: formatos legibles primero
    const PREF_ORDER = ['epub', 'fb2', 'mobi', 'azw3', 'pdf', 'txt', 'docx', 'rtf'];
    files.sort((a, b) => {
        const ai = PREF_ORDER.indexOf((a.extension || '').toLowerCase());
        const bi = PREF_ORDER.indexOf((b.extension || '').toLowerCase());
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    files.forEach(file => {
        const ext = (file.extension || '???').toLowerCase();
        const size = file.filesize ? ` · ${_formatBytes(file.filesize)}` : '';
        const md5 = file.md5 || '';

        const btn = document.createElement('button');
        btn.className = 'lg-dl-btn' + (PREF_ORDER.includes(ext) ? ' primary' : '');
        btn.textContent = `⬇ ${ext.toUpperCase()}${size}`;
        btn.title = `Descargar como ${ext.toUpperCase()}`;
        btn.onclick = () => lgDescargarArchivo(md5, ext, bookTitle, btn);
        container.appendChild(btn);
    });

    if (files.length === 0) {
        container.innerHTML =
            '<span style="font-size:0.58rem;color:var(--text-dim);">Sin archivos</span>';
    }
}

// ── Descargar y cargar directamente en el lector ─────────────────
// Las descargas binarias desde LibGen también están bloqueadas por CORS.
// Estrategia: abrir la página de descarga de LibGen en una nueva tab.
// El usuario descarga el archivo normalmente desde ahí y luego lo arrastra
// al lector, O usa el botón "Abrir archivo descargado" que aparece en la notificación.
async function lgDescargarArchivo(md5, ext, title, btnEl) {
    if (!md5) {
        mostrarNotificacion('⚠ Sin MD5 para este archivo');
        return;
    }

    // Formatos que el lector puede abrir directamente
    const READABLE = ['epub', 'txt', 'html', 'htm', 'pdf', 'fb2', 'fb3', 'docx', 'rtf', 'odt', 'mobi', 'prc', 'azw3', 'azw', 'cbz'];

    // URLs de descarga directa de LibGen (el usuario las abre en su browser sin CORS)
    const dlUrls = [
        `https://libgen.is/get.php?md5=${md5}`,
        `https://libgen.st/get.php?md5=${md5}`,
        `https://library.lol/main/${md5}`,
    ];

    // Abrir la primera URL en tab nueva — el browser no bloquea window.open
    window.open(dlUrls[0], '_blank', 'noopener');

    // Mostrar notificación con instrucciones claras
    const formatLabel = ext.toUpperCase();
    const isReadable = READABLE.includes(ext.toLowerCase());

    mostrarNotificacion(
        isReadable
            ? `📥 Descargando ${formatLabel}… Arrastrá el archivo al lector cuando termine`
            : `📥 Descargando ${formatLabel}… guardado en tu carpeta de descargas`
    );

    if (btnEl) {
        btnEl.textContent = '✓ Abierto en tab';
        setTimeout(() => {
            btnEl.textContent = `⬇ ${formatLabel}`;
        }, 3000);
    }
}

// ── Ver detalle de una edición (abre ventana externa) ────────────
async function lgVerDetalle(editionId) {
    window.open(`${_lgMirror}/edition.php?id=${editionId}`, '_blank', 'noopener');
}

// ── Buscar libros de un autor concreto ───────────────────────────
async function lgBuscarPorAutor(autorId, nombre) {
    _lgLastType = 'e';
    _lgPage = 0;
    ['e', 'a', 's'].forEach(t => {
        const btn = document.getElementById(`lg-type-${t}`);
        if (btn) btn.classList.toggle('lg-type-active', t === 'e');
    });
    const input = document.getElementById('lg-input');
    if (input) input.value = nombre;
    _lgLastQ = nombre;

    const statusEl = document.getElementById('lg-status');
    const resultsEl = document.getElementById('lg-results');
    if (statusEl) statusEl.textContent = `⏳ Buscando libros de "${nombre}"...`;
    if (resultsEl) resultsEl.innerHTML = '';

    try {
        // La API permite buscar ediciones por autor_id con addkeys
        const data = await lgFetch({
            object: 'e', author_ids: autorId,
            fields: LG_FIELDS_E,
            limit1: 0, limit2: LG_PAGE_SIZE
        });
        if (!data || data.length === 0) {
            if (statusEl) statusEl.textContent = '— Sin resultados para este autor';
            return;
        }
        lgRenderResultados(data, 'e', resultsEl);
        if (statusEl) statusEl.textContent = `${data.length} libro(s) de ${nombre}`;
    } catch (err) {
        if (statusEl) statusEl.textContent = `⚠ ${err.message}`;
    }
}

// ── Buscar libros de una serie ────────────────────────────────────
async function lgBuscarPorSerie(serieId, titulo) {
    _lgLastType = 'e';
    _lgPage = 0;
    ['e', 'a', 's'].forEach(t => {
        const btn = document.getElementById(`lg-type-${t}`);
        if (btn) btn.classList.toggle('lg-type-active', t === 'e');
    });
    const input = document.getElementById('lg-input');
    if (input) input.value = titulo;
    _lgLastQ = titulo;

    const statusEl = document.getElementById('lg-status');
    const resultsEl = document.getElementById('lg-results');
    if (statusEl) statusEl.textContent = `⏳ Buscando libros de la serie "${titulo}"...`;
    if (resultsEl) resultsEl.innerHTML = '';

    try {
        const data = await lgFetch({
            object: 'e', series_ids: serieId,
            fields: LG_FIELDS_E,
            limit1: 0, limit2: LG_PAGE_SIZE
        });
        if (!data || data.length === 0) {
            if (statusEl) statusEl.textContent = '— Sin resultados para esta serie';
            return;
        }
        lgRenderResultados(data, 'e', resultsEl);
        if (statusEl) statusEl.textContent = `${data.length} libro(s) en "${titulo}"`;
    } catch (err) {
        if (statusEl) statusEl.textContent = `⚠ ${err.message}`;
    }
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════

function _escLg(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _formatBytes(bytes) {
    const n = parseInt(bytes, 10);
    if (isNaN(n) || n === 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}

// Exponer para debugging
window._lgFetch = lgFetch;