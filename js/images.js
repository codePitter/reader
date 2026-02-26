// ═══════════════════════════════════════
// IMAGES — Búsqueda de imágenes via Pixabay API
// Proveedor: Pixabay (key gratuita en pixabay.com/api/docs)
// Fallback:  Picsum Photos (sin key, siempre funciona)
// Depende de: main.js (aiDetectedUniverse, UNIVERSE_CONFIG, mostrarNotificacion)
//             video.js (mostrarImagenEnPanel, aiImagesEnabled) — llamada opcional
// ═══════════════════════════════════════

// ─── CONFIG ───
const PIXABAY_API_BASE = 'https://pixabay.com/api/';
let _pixabayKey = localStorage.getItem('pixabay_api_key') || '';

// ─── ESTADO ───
let _imgActualIndex = 0;
let _imgResultados = [];   // array de objetos Pixabay
let _imgUltimaQuery = '';
let _imgCargando = false;

// ─── AUTO-ROTACIÓN EN VIDEO ───
let _autoRotTimer = null;   // setInterval handle
let _autoRotPool = [];     // pool de URLs precargadas
let _autoRotPoolIdx = 0;
let _autoRotActivo = false;
const AUTO_ROT_INTERVAL = 18000; // ms entre cambios de fondo (18 s)

// ═══════════════════════════════════════
// MAPEO UNIVERSO → QUERIES PIXABAY
// ═══════════════════════════════════════

const UNIVERSE_IMAGE_QUERIES = {
    fantasy_epic: [
        'epic fantasy landscape',
        'medieval castle dark',
        'fantasy forest magical',
        'ancient ruins mystical',
        'dark fantasy dragon'
    ],
    cultivation: [
        'chinese mountain misty',
        'zen nature serene asia',
        'ancient temple fog asia',
        'bamboo forest morning',
        'traditional chinese landscape'
    ],
    sci_fi: [
        'futuristic city neon',
        'space galaxy stars',
        'cyberpunk street night',
        'technology abstract circuit',
        'space station cosmos'
    ],
    romance: [
        'romantic sunset couple',
        'soft flowers bokeh light',
        'cozy cafe warm',
        'autumn park leaves',
        'ocean sunrise pastel'
    ],
    thriller: [
        'dark alley rainy night',
        'mysterious fog city',
        'abandoned building moody',
        'storm lightning dramatic',
        'noir dark corridor'
    ],
    horror: [
        'dark haunted forest',
        'abandoned house fog',
        'cemetery gothic night',
        'dark shadows horror',
        'eerie tunnel darkness'
    ],
    adventure: [
        'epic mountain summit',
        'jungle exploration tropical',
        'desert dunes sunset',
        'ocean voyage horizon',
        'ancient ruins adventure'
    ],
    drama: [
        'cinematic portrait dramatic',
        'rain window melancholy',
        'golden hour landscape',
        'black white portrait',
        'empty road journey'
    ],
    _default: [
        'library books vintage',
        'old book pages texture',
        'reading nook cozy',
        'ancient manuscript ink',
        'bookshelf literary'
    ]
};

// ═══════════════════════════════════════
// CONSTRUCCIÓN DEL QUERY
// ═══════════════════════════════════════

function construirQueryImagen(universo, textoCapitulo = '') {
    const queries = UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default;
    const baseQuery = queries[_imgActualIndex % queries.length];
    _imgActualIndex++;
    return baseQuery;
}

// ═══════════════════════════════════════
// BÚSQUEDA EN PIXABAY
// ═══════════════════════════════════════

// Wrapper para búsquedas del smart pool: añade términos de exclusión al query
async function _buscarSinPersonas(query, page, perPage) {
    // Pixabay no soporta exclusión directa por categoría en la API gratuita,
    // pero podemos appender términos negativos y usar category=backgrounds
    const safeQuery = query + ' -person -people -portrait';
    const url = new URL(PIXABAY_API_BASE);
    url.searchParams.set('key', _pixabayKey);
    url.searchParams.set('q', safeQuery);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('page', page);
    url.searchParams.set('min_width', '1280');
    url.searchParams.set('order', 'popular');
    // category=backgrounds filtra hacia fondos/paisajes
    url.searchParams.set('category', 'backgrounds');
    try {
        const res = await fetch(url.toString());
        if (!res.ok) return { hits: [] };
        return await res.json();
    } catch (e) {
        return { hits: [] };
    }
}

async function buscarImagenesPixabay(query, page = 1, perPage = 12) {
    if (!_pixabayKey) {
        throw new Error('NO_KEY');
    }

    const url = new URL(PIXABAY_API_BASE);
    url.searchParams.set('key', _pixabayKey);
    url.searchParams.set('q', query);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('page', page);
    url.searchParams.set('min_width', '1280');
    url.searchParams.set('order', 'popular');

    const res = await fetch(url.toString());

    if (!res.ok) {
        if (res.status === 400) throw new Error('API Key de Pixabay inválida.');
        if (res.status === 429) throw new Error('Límite de requests de Pixabay alcanzado. Esperá un momento.');
        throw new Error(`Error Pixabay: ${res.status}`);
    }

    const data = await res.json();
    return data; // { hits: [...], totalHits: N }
}

// ═══════════════════════════════════════
// FALLBACK: PICSUM PHOTOS (sin key)
// Genera URLs directas, sin fetch necesario
// ═══════════════════════════════════════

function generarUrlsPicsum(cantidad = 9) {
    const urls = [];
    // seed basado en query para consistencia dentro de una sesión
    const seedBase = Math.floor(Math.random() * 900) + 100;
    for (let i = 0; i < cantidad; i++) {
        urls.push(`https://picsum.photos/seed/${seedBase + i}/1920/1080`);
    }
    return urls;
}

// ═══════════════════════════════════════
// ACCIÓN PRINCIPAL: GENERAR IMÁGENES
// ═══════════════════════════════════════

async function generarImagenesUniverso() {
    if (_imgCargando) return;

    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const textoEl = document.getElementById('texto-contenido');
    const texto = textoEl ? textoEl.textContent.slice(0, 1000) : '';
    const query = construirQueryImagen(universo, texto);

    _imgUltimaQuery = query;
    await _ejecutarBusqueda(query, 1);
}

async function refrescarImagenes() {
    if (!_imgUltimaQuery || _imgCargando) return;
    const page = Math.floor(Math.random() * 5) + 1;
    await _ejecutarBusqueda(_imgUltimaQuery, page);
}

async function buscarImagenesCustom(queryCustom) {
    if (!queryCustom.trim() || _imgCargando) return;
    _imgActualIndex = 0;
    _imgUltimaQuery = queryCustom.trim();
    await _ejecutarBusqueda(_imgUltimaQuery, 1);
}

async function _ejecutarBusqueda(query, page) {
    _imgCargando = true;
    _mostrarEstadoCarga(true, query);

    try {
        if (_pixabayKey) {
            // ── Pixabay ──
            const data = await buscarImagenesPixabay(query, page, 12);
            _imgResultados = data.hits || [];

            if (_imgResultados.length === 0) {
                _mostrarError('Sin resultados. Probá otra búsqueda.');
                return;
            }

            // Convertir al formato interno normalizado
            const fotos = _imgResultados.map(h => ({
                id: h.id,
                urlSmall: h.webformatURL,
                urlFull: h.largeImageURL,
                urlThumb: h.previewURL,
                autor: h.user,
                tags: h.tags,
                pageUrl: h.pageURL,
                fuente: 'Pixabay'
            }));

            renderizarGaleriaImagenes(fotos, query);
            mostrarNotificacion(`✓ ${fotos.length} imágenes encontradas · Pixabay`);

            // Cargar pool para auto-rotación en video
            _autoRotPool = fotos.map(f => f.urlFull);
            _autoRotPoolIdx = 0;

        } else {
            // ── Fallback: Picsum (sin key) ──
            const urls = generarUrlsPicsum(9);
            const fotos = urls.map((url, i) => ({
                id: `picsum-${i}`,
                urlSmall: url.replace('1920/1080', '400/300'),
                urlFull: url,
                urlThumb: url.replace('1920/1080', '200/150'),
                autor: 'Picsum Photos',
                tags: query,
                pageUrl: 'https://picsum.photos',
                fuente: 'Picsum'
            }));

            _imgResultados = fotos;
            renderizarGaleriaImagenes(fotos, `${query} (Picsum — sin key)`);
            mostrarNotificacion(`✓ Imágenes aleatorias · Picsum (configurá Pixabay para buscar por tema)`);

            _autoRotPool = urls;
            _autoRotPoolIdx = 0;
        }

    } catch (err) {
        if (err.message === 'NO_KEY') {
            // Silenciosamente usar Picsum
            const urls = generarUrlsPicsum(9);
            const fotos = urls.map((url, i) => ({
                id: `picsum-${i}`,
                urlSmall: url.replace('1920/1080', '400/300'),
                urlFull: url,
                urlThumb: url.replace('1920/1080', '200/150'),
                autor: 'Picsum Photos',
                tags: query,
                pageUrl: 'https://picsum.photos',
                fuente: 'Picsum'
            }));
            _imgResultados = fotos;
            renderizarGaleriaImagenes(fotos, `${query} (Picsum — configurá Pixabay key)`);
            _autoRotPool = urls;
            _autoRotPoolIdx = 0;
        } else {
            _mostrarError(err.message);
            console.error('[images.js]', err);
        }
    } finally {
        _imgCargando = false;
        _mostrarEstadoCarga(false);
    }
}

// ═══════════════════════════════════════
// AUTO-ROTACIÓN DE FONDO EN VIDEO
// Activa cuando el modo video está abierto y aiImagesEnabled es false
// (complementa las imágenes IA generadas por Puter/Pollinations)
// ═══════════════════════════════════════

function iniciarAutoRotacionFondo() {
    if (_autoRotActivo) return;
    if (_autoRotPool.length === 0) return;
    _autoRotActivo = true;
    _aplicarSiguienteFondoWeb();
    _autoRotTimer = setInterval(_aplicarSiguienteFondoWeb, AUTO_ROT_INTERVAL);
    console.log('[images.js] Auto-rotación de fondo iniciada');
}

function detenerAutoRotacionFondo() {
    if (_autoRotTimer) { clearInterval(_autoRotTimer); _autoRotTimer = null; }
    _autoRotActivo = false;
}

function _aplicarSiguienteFondoWeb() {
    if (_autoRotPool.length === 0) return;
    const url = _autoRotPool[_autoRotPoolIdx % _autoRotPool.length];
    _autoRotPoolIdx++;
    // Reutilizar la función unificada con crossfade
    _aplicarUrlImagen(url);
}

// Se llama desde video.js cuando se activa el modo video
function activarImagenesWebEnVideo() {
    if (_autoRotPool.length === 0) {
        // Cargar imágenes primero, luego iniciar rotación
        generarImagenesUniverso().then(() => {
            iniciarAutoRotacionFondo();
        });
    } else {
        iniciarAutoRotacionFondo();
    }
}

// Se llama cuando se cierra el video o se activan las imágenes IA
function desactivarImagenesWebEnVideo() {
    detenerAutoRotacionFondo();
}

// ═══════════════════════════════════════
// RENDER DE LA GALERÍA
// ═══════════════════════════════════════

function renderizarGaleriaImagenes(fotos, query) {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container) return;

    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'img-galeria-header';
    header.innerHTML = `
        <span class="img-query-badge">🔍 "${escapeHTMLImg(query)}"</span>
        <button class="img-btn-refresh" onclick="refrescarImagenes()" title="Nuevas imágenes">↻</button>
    `;
    container.appendChild(header);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'img-galeria-grid';

    fotos.forEach((foto, i) => {
        const item = document.createElement('div');
        item.className = 'img-galeria-item';
        item.style.animationDelay = `${i * 50}ms`;

        const img = document.createElement('img');
        img.src = foto.urlSmall;
        img.alt = foto.tags || query;
        img.loading = 'lazy';
        img.title = `📷 ${foto.autor} · ${foto.fuente}`;
        img.addEventListener('click', () => abrirPreviewImagen(foto, i));

        const overlay = document.createElement('div');
        overlay.className = 'img-galeria-overlay';
        overlay.innerHTML = `
            <span class="img-attr">📷 ${escapeHTMLImg(foto.autor)}</span>
            <div class="img-actions">
                <button onclick="event.stopPropagation();establecerImagenFondo('${foto.urlFull}')" title="Usar como fondo">🖼</button>
                <button onclick="event.stopPropagation();_abrirEnWeb('${foto.pageUrl}')" title="Ver original">↗</button>
            </div>
        `;

        item.appendChild(img);
        item.appendChild(overlay);
        grid.appendChild(item);
    });

    container.appendChild(grid);

    // Nota de fuente
    const footer = document.createElement('div');
    footer.style.cssText = 'font-size:0.52rem;color:var(--text-dim);text-align:center;margin-top:6px;';
    const fuente = fotos[0]?.fuente || 'Pixabay';
    if (fuente === 'Pixabay') {
        footer.innerHTML = 'Imágenes via <a href="https://pixabay.com" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">Pixabay</a>';
    } else {
        footer.innerHTML = 'Imágenes via <a href="https://picsum.photos" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">Picsum Photos</a>';
    }
    container.appendChild(footer);
}

// ═══════════════════════════════════════
// MODAL DE PREVIEW
// ═══════════════════════════════════════

function abrirPreviewImagen(foto, index) {
    let modal = document.getElementById('img-preview-modal');
    if (!modal) {
        modal = _crearModalPreview();
        document.body.appendChild(modal);
    }

    const imgEl = modal.querySelector('.img-preview-img');
    const infoEl = modal.querySelector('.img-preview-info');
    const navPrev = modal.querySelector('.img-nav-prev');
    const navNext = modal.querySelector('.img-nav-next');

    imgEl.src = foto.urlFull;
    imgEl.alt = foto.tags || '';

    infoEl.innerHTML = `
        <div class="img-preview-meta">
            <strong>${escapeHTMLImg(foto.autor)}</strong>
            ${foto.tags ? `<p style="font-size:0.62rem;color:var(--text-dim);margin-top:4px;">${escapeHTMLImg(foto.tags.slice(0, 80))}</p>` : ''}
            <div class="img-preview-btns">
                <button onclick="establecerImagenFondo('${foto.urlFull}')">🖼 Usar como fondo</button>
                <button onclick="_abrirEnWeb('${foto.pageUrl}')">↗ Ver en ${foto.fuente}</button>
            </div>
        </div>
    `;

    navPrev.onclick = () => {
        const ni = (index - 1 + _imgResultados.length) % _imgResultados.length;
        abrirPreviewImagen(_imgResultados[ni], ni);
    };
    navNext.onclick = () => {
        const ni = (index + 1) % _imgResultados.length;
        abrirPreviewImagen(_imgResultados[ni], ni);
    };

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function cerrarPreviewImagen() {
    const modal = document.getElementById('img-preview-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

function _crearModalPreview() {
    const modal = document.createElement('div');
    modal.id = 'img-preview-modal';
    modal.className = 'img-preview-modal';
    modal.innerHTML = `
        <div class="img-preview-backdrop" onclick="cerrarPreviewImagen()"></div>
        <div class="img-preview-content">
            <button class="img-preview-close" onclick="cerrarPreviewImagen()">✕</button>
            <button class="img-nav-prev img-nav-btn">‹</button>
            <div class="img-preview-main">
                <img class="img-preview-img" src="" alt="" />
                <div class="img-preview-info"></div>
            </div>
            <button class="img-nav-next img-nav-btn">›</button>
        </div>
    `;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarPreviewImagen();
    });
    return modal;
}

// ═══════════════════════════════════════
// ACCIONES DE IMAGEN
// ═══════════════════════════════════════

function establecerImagenFondo(url) {
    // 1. Aplicar en el video overlay si está abierto
    const videoOverlay = document.getElementById('video-overlay');
    if (videoOverlay && videoOverlay.classList.contains('active')) {
        const panelA = document.getElementById('ai-bg-a');
        const panelB = document.getElementById('ai-bg-b');
        const overlay = document.getElementById('ai-bg-overlay');
        if (panelA) {
            panelA.style.backgroundImage = `url("${url}")`;
            panelA.style.backgroundSize = 'cover';
            panelA.style.backgroundPosition = 'center';
            panelA.style.opacity = '1';
        }
        if (panelB) panelB.style.opacity = '0';
        if (overlay) overlay.style.background = 'rgba(8,7,6,0.45)';
        mostrarNotificacion('✓ Fondo aplicado en video');
    } else {
        // 2. Aplicar en el reading area
        const lector = document.getElementById('texto-contenido')?.parentElement;
        if (lector) {
            lector.style.backgroundImage = `url('${url}')`;
            lector.style.backgroundSize = 'cover';
            lector.style.backgroundPosition = 'center';
            lector.style.backgroundBlendMode = 'overlay';
            mostrarNotificacion('✓ Imagen aplicada como fondo');
        }
    }
    cerrarPreviewImagen();
}

function quitarImagenFondo() {
    detenerAutoRotacionFondo();
    const panelA = document.getElementById('ai-bg-a');
    const panelB = document.getElementById('ai-bg-b');
    const overlay = document.getElementById('ai-bg-overlay');
    if (panelA) { panelA.style.backgroundImage = ''; panelA.style.opacity = '0'; }
    if (panelB) { panelB.style.backgroundImage = ''; panelB.style.opacity = '0'; }
    if (overlay) overlay.style.background = 'rgba(8,7,6,0)';

    const lector = document.getElementById('texto-contenido')?.parentElement;
    if (lector) lector.style.backgroundImage = '';
    mostrarNotificacion('✓ Fondo removido');
}

function _abrirEnWeb(url) {
    window.open(url, '_blank', 'noopener');
}

// ═══════════════════════════════════════
// BÚSQUEDA CUSTOM DESDE INPUT
// ═══════════════════════════════════════

function ejecutarBusquedaImagenCustom() {
    const val = document.getElementById('img-search-input')?.value || '';
    buscarImagenesCustom(val);
}

function handleBusquedaImagenKeypress(e) {
    if (e.key === 'Enter') ejecutarBusquedaImagenCustom();
}

// ═══════════════════════════════════════
// CONFIGURACIÓN API KEY — PIXABAY
// ═══════════════════════════════════════

function guardarPixabayKey() {
    const input = document.getElementById('pixabay-key-input');
    const key = input?.value?.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa una API Key válida'); return; }
    _pixabayKey = key;
    localStorage.setItem('pixabay_api_key', key);
    mostrarNotificacion('✓ Pixabay key guardada');
    // Actualizar estado en el panel
    const status = document.getElementById('pixabay-key-status');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    // Ocultar el panel de configuración
    const panel = document.getElementById('pixabay-key-panel');
    if (panel) panel.style.display = 'none';
    // Disparar búsqueda si hay una query pendiente
    if (_imgUltimaQuery) _ejecutarBusqueda(_imgUltimaQuery, 1);
}

// ═══════════════════════════════════════
// ESTADOS DE CARGA Y ERROR
// ═══════════════════════════════════════

function _mostrarEstadoCarga(loading, query = '') {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container || !loading) return;
    container.innerHTML = `
        <div class="img-loading">
            <div class="img-spinner"></div>
            <p>Buscando imágenes…</p>
            ${query ? `<small>"${escapeHTMLImg(query)}"</small>` : ''}
        </div>
    `;
}

function _mostrarError(msg) {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container) return;
    container.innerHTML = `
        <div class="img-error">
            <p>⚠ ${escapeHTMLImg(msg)}</p>
        </div>
    `;
}

// ═══════════════════════════════════════
// HELPER escapeHTML (independiente de ui.js)
// ═══════════════════════════════════════

function escapeHTMLImg(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('imagen-ia-galeria');
    const searchInput = document.getElementById('img-search-input');

    // Inyectar panel de key de Pixabay en el sidebar si no está configurada
    _renderizarPanelKey();

    // Mostrar estado de key en el panel del visor de video
    if (_pixabayKey) {
        const statusVideo = document.getElementById('pixabay-key-status-video');
        if (statusVideo) { statusVideo.textContent = '✓'; statusVideo.style.color = 'var(--accent2)'; }
    }

    // Enter en input de búsqueda
    if (searchInput) {
        searchInput.addEventListener('keypress', handleBusquedaImagenKeypress);
    }

    // Actualizar badge de universo cuando cambie
    _actualizarBadgeUniverso();
    // Observar cambios en aiDetectedUniverse cada 2s (no hay evento nativo)
    setInterval(_actualizarBadgeUniverso, 2000);
});

function _renderizarPanelKey() {
    const galeria = document.getElementById('imagen-ia-galeria');
    if (!galeria) return;

    if (_pixabayKey) {
        // Key configurada — mostrar estado OK y listo
        galeria.innerHTML = `
            <div style="font-size:0.6rem;color:var(--accent2);text-align:center;padding:8px 0;">
                ✓ Pixabay configurado · <button onclick="generarImagenesUniverso()"
                    style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;font-family:'DM Mono',monospace;">
                    Cargar imágenes →
                </button>
            </div>
        `;
    } else {
        // Sin key — mostrar formulario de configuración + opción Picsum
        galeria.innerHTML = `
            <div id="pixabay-key-panel" style="padding:6px 0;">
                <p style="font-size:0.58rem;color:var(--text-dim);margin-bottom:5px;line-height:1.4;">
                    🔑 Configurá tu key gratuita en
                    <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener"
                       style="color:var(--accent);text-decoration:none;">pixabay.com/api/docs</a>
                    para buscar por tema.
                </p>
                <div style="display:flex;gap:4px;margin-bottom:6px;">
                    <input id="pixabay-key-input" type="password" placeholder="tu-api-key-aquí"
                           style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                                  color:var(--text);font-family:'DM Mono',monospace;font-size:0.62rem;
                                  padding:5px 8px;outline:none;min-width:0;">
                    <button type="button" onclick="guardarPixabayKey()"
                            style="background:var(--accent2);border:none;border-radius:4px;color:var(--bg);
                                   font-family:'DM Mono',monospace;font-size:0.6rem;padding:5px 8px;cursor:pointer;
                                   flex-shrink:0;">
                        OK
                    </button>
                </div>
                <button type="button" onclick="generarImagenesUniverso()"
                        style="width:100%;background:none;border:1px solid var(--border);border-radius:4px;
                               color:var(--text-dim);font-family:'DM Mono',monospace;font-size:0.6rem;
                               padding:4px 0;cursor:pointer;transition:border-color 0.2s;"
                        onmouseover="this.style.borderColor='var(--accent2)'"
                        onmouseout="this.style.borderColor='var(--border)'">
                    📷 Usar Picsum (sin key, aleatorias)
                </button>
            </div>
        `;
    }
}

function _actualizarBadgeUniverso() {
    const badge = document.getElementById('img-universe-label');
    if (!badge) return;
    const univ = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '—';
    if (badge.textContent !== univ) badge.textContent = univ;
}

// ═══════════════════════════════════════
// INTEGRACIÓN CON VIDEO.JS
// Llamada desde solicitarImagenParaSlot cuando imageProvider === 'pixabay'
// ═══════════════════════════════════════

// Cache de URLs por slot para no repetir búsquedas
const _pixabaySlotCache = {};
let _pixabayPoolShared = [];   // pool compartido de todas las búsquedas activas
let _pixabayPoolSharedIdx = 0;

async function buscarYAplicarFondoPixabay(slot, fragmentoTexto) {
    const statusTxt = document.getElementById('img-ia-status-txt');

    // Si ya tenemos URL para este slot, aplicarla directamente
    if (_pixabaySlotCache[slot]) {
        mostrarImagenEnPanel(slot, _pixabaySlotCache[slot]);
        return;
    }

    // Si el pool compartido tiene imágenes, usar la siguiente sin esperar fetch
    if (_pixabayPoolShared.length > 0) {
        const url = _pixabayPoolShared[_pixabayPoolSharedIdx % _pixabayPoolShared.length];
        _pixabayPoolSharedIdx++;
        _pixabaySlotCache[slot] = url;
        mostrarImagenEnPanel(slot, url);
        // Disparar recarga en background cada 3 slots para renovar el pool
        if (_pixabayPoolSharedIdx % 3 === 0) _recargarPoolPixabay();
        return;
    }

    // Sin pool todavía — cargar por primera vez
    if (statusTxt) statusTxt.textContent = '🔍 Buscando en Pixabay...';
    try {
        await _recargarPoolPixabay(fragmentoTexto);
        if (_pixabayPoolShared.length > 0) {
            const url = _pixabayPoolShared[0];
            _pixabaySlotCache[slot] = url;
            mostrarImagenEnPanel(slot, url);
            _pixabayPoolSharedIdx = 1;
            if (statusTxt) statusTxt.textContent = `✓ Pixabay · slot ${slot}`;
        }
    } catch (e) {
        console.warn('[images.js] Pixabay falló, usando procedural:', e.message);
        if (statusTxt) statusTxt.textContent = '⚠ Pixabay sin key — usando procedural';
    }
}

async function _recargarPoolPixabay(textoHint = '') {
    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const query = construirQueryImagen(universo, textoHint);

    if (_pixabayKey) {
        const data = await buscarImagenesPixabay(query, Math.ceil(Math.random() * 3), 15);
        const hits = data.hits || [];
        if (hits.length > 0) {
            _pixabayPoolShared = hits.map(h => h.largeImageURL);
            // Mezclar aleatoriamente para variedad
            _pixabayPoolShared.sort(() => Math.random() - 0.5);
        }
    } else {
        // Picsum: generar URLs directas (no requiere fetch)
        _pixabayPoolShared = generarUrlsPicsum(15);
        // Mezclar
        _pixabayPoolShared.sort(() => Math.random() - 0.5);
    }
}

// Llamada desde video.js al abrir el modo video con proveedor 'pixabay'
// para precargar el pool antes de que empiece la reproducción
function precalentarPoolPixabay() {
    if (_pixabayPoolShared.length > 0) return;
    _recargarPoolPixabay().catch(() => { });
}

// Limpiar cache de slots al cambiar de capítulo
function limpiarCachePixabaySlots() {
    Object.keys(_pixabaySlotCache).forEach(k => delete _pixabaySlotCache[k]);
    _pixabayPoolSharedIdx = 0;
    // No limpiar el pool — reutilizarlo para el capítulo siguiente
}

// Guardar key desde el panel del visor de video (input #pixabay-key-input-video)
function guardarPixabayKeyVideo() {
    const input = document.getElementById('pixabay-key-input-video');
    const key = input?.value?.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa una API Key de Pixabay'); return; }
    _pixabayKey = key;
    localStorage.setItem('pixabay_api_key', key);
    // Sincronizar con el otro input si existe
    const otroInput = document.getElementById('pixabay-key-input');
    if (otroInput) otroInput.value = '';
    // Actualizar estado visual
    const status = document.getElementById('pixabay-key-status-video');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    mostrarNotificacion('✓ Pixabay key guardada — listo para buscar');
    // Limpiar pool para que se recargue con la nueva key
    _pixabayPoolShared = [];
    if (typeof precalentarPoolPixabay === 'function') precalentarPoolPixabay();
}
// ═══════════════════════════════════════════════════════════════════
// SISTEMA INTELIGENTE DE IMÁGENES
// Pool grande (200 imgs) persistido en localStorage, scoring por tags
// y rotación automática cada N frases durante el TTS
// ═══════════════════════════════════════════════════════════════════

// ─── SMART POOL ───
const SMART_POOL_KEY = 'pixabay_smart_pool';
const SMART_POOL_TTL = 24 * 60 * 60 * 1000; // 24 horas en ms
const SMART_POOL_SIZE = 1500;                 // ~7 queries × 200 imgs + filtrado
const SMART_ROT_EVERY = 25;                   // cambiar imagen cada N frases

let _smartPool = [];   // [{ url, tags, query }] — cargado desde localStorage o API
let _smartPoolLoaded = false;
let _smartRotSentence = 0;    // última frase en la que se rotó
let _smartRotActive = false;

// ─── PERSISTENCIA ───
function _saveSmartPool() {
    try {
        const payload = { ts: Date.now(), pool: _smartPool };
        localStorage.setItem(SMART_POOL_KEY, JSON.stringify(payload));
    } catch (e) { console.warn('[smartPool] localStorage lleno:', e.message); }
}

function _loadSmartPool() {
    try {
        const raw = localStorage.getItem(SMART_POOL_KEY);
        if (!raw) return false;
        const { ts, pool } = JSON.parse(raw);
        if (Date.now() - ts > SMART_POOL_TTL) return false;   // expirado
        if (!Array.isArray(pool) || pool.length === 0) return false;
        _smartPool = pool;
        _smartPoolLoaded = true;
        console.log(`[smartPool] Cargado desde localStorage: ${pool.length} imágenes`);
        return true;
    } catch (e) { return false; }
}

// ─── FILTRO DE PERSONAS ───
// Tags de Pixabay que indican presencia de seres humanos
const _HUMAN_TAGS = new Set([
    // Personas directas
    'person', 'people', 'man', 'woman', 'girl', 'boy', 'child', 'children', 'baby',
    'human', 'face', 'portrait', 'crowd', 'couple', 'family', 'adult', 'teenager',
    'selfie', 'model', 'athlete', 'player', 'soldier', 'monk', 'student', 'worker',
    // Partes del cuerpo
    'hands', 'body', 'skin', 'hair', 'eye', 'eyes', 'smile', 'lips', 'nose', 'mouth',
    // Siluetas y figuras (capturan "hooded figure", etc.)
    'silhouette', 'shadow person', 'figure', 'hood', 'costume', 'dress', 'suit',
    // Lifestyle/moda
    'fashion', 'lifestyle', 'makeup', 'beauty', 'fitness', 'yoga', 'meditation',
    // Grupos
    'team', 'group', 'meeting', 'office', 'business', 'wedding', 'party'
]);

function _tienePersonas(tagsStr) {
    return tagsStr.split(',').map(t => t.trim()).some(t => _HUMAN_TAGS.has(t));
}

// ─── CONSTRUCCIÓN DEL POOL ───
// Hace múltiples queries (una por universo + queries del universo actual)
// para llenar el pool con variedad y guardar en localStorage
async function construirSmartPool(forzar = false) {
    if (_smartPoolLoaded && !forzar) return;
    if (!_pixabayKey) {
        // Sin key: usar Picsum con metadatos ficticios
        _smartPool = generarUrlsPicsum(60).map((url, i) => ({
            url,
            tags: ['ambient', 'nature', 'landscape'],
            query: 'picsum'
        }));
        _smartPoolLoaded = true;
        return;
    }

    // Intentar desde localStorage primero
    if (!forzar && _loadSmartPool()) return;

    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';

    // Todas las queries: universo actual + todos los demás universos + genéricas
    // Cada query se pagina (hasta 3 páginas × 200 imgs = 600 por query)
    const universoQueries = UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default;
    const otrosUniversos = Object.entries(UNIVERSE_IMAGE_QUERIES)
        .filter(([k]) => k !== universo && k !== '_default')
        .flatMap(([, qs]) => qs.slice(0, 2));  // 2 queries de cada universo extra
    const genericas = UNIVERSE_IMAGE_QUERIES._default;

    const queries = [...new Set([...universoQueries, ...otrosUniversos, ...genericas])];

    const poolTemp = [];
    const seenIds = new Set();
    let requestCount = 0;
    const MAX_REQUESTS = 25;  // techo conservador: 25 × 200 = 5000 candidatos

    console.log(`[smartPool] Construyendo pool · ${queries.length} queries · universo: ${universo}`);

    for (const query of queries) {
        if (poolTemp.length >= SMART_POOL_SIZE) break;
        if (requestCount >= MAX_REQUESTS) break;

        // Pedir 200 por página (máximo Pixabay), hasta 3 páginas por query
        for (let page = 1; page <= 3; page++) {
            if (poolTemp.length >= SMART_POOL_SIZE) break;
            if (requestCount >= MAX_REQUESTS) break;
            try {
                const data = await _buscarSinPersonas(query, page, 200);
                requestCount++;
                const hits = data.hits || [];
                if (hits.length === 0) break;  // sin más páginas

                for (const hit of hits) {
                    if (seenIds.has(hit.id)) continue;
                    const hitTags = (hit.tags || '').toLowerCase();
                    if (_tienePersonas(hitTags)) continue;  // filtrar personas
                    seenIds.add(hit.id);
                    poolTemp.push({
                        url: hit.largeImageURL || hit.webformatURL,
                        tags: hitTags.split(',').map(t => t.trim()).filter(Boolean),
                        query: query
                    });
                }
                console.log(`[smartPool] ${query} p${page}: +${hits.length} candidatos → ${poolTemp.length} en pool`);

                // Pequeña pausa entre páginas para no saturar la API
                if (page < 3 && poolTemp.length < SMART_POOL_SIZE) {
                    await new Promise(r => setTimeout(r, 120));
                }
            } catch (e) {
                console.warn(`[smartPool] "${query}" p${page} falló:`, e.message);
                break;
            }
        }
    }
    console.log(`[smartPool] Construido: ${poolTemp.length} imgs limpias · ${requestCount} requests usados`);

    if (poolTemp.length > 0) {
        _smartPool = poolTemp;
        _smartPoolLoaded = true;
        _saveSmartPool();
        console.log(`[smartPool] Pool construido: ${_smartPool.length} imágenes`);
    }
}

// ─── SCORING POR AFINIDAD ───
// Extrae keywords del fragmento de texto y las compara con los tags de cada imagen
function _generarNgramas(palabras, n) {
    const ngramas = [];
    for (let i = 0; i <= palabras.length - n; i++) {
        ngramas.push(palabras.slice(i, i + n).join(' '));
    }
    return ngramas;
}

function _scorearImagen(img, fragmento, universo) {
    let score = 0;

    const STOPWORDS = new Set([
        'the', 'a', 'an', 'of', 'in', 'to', 'and', 'or', 'but', 'is', 'was', 'were', 'he', 'she', 'it',
        'they', 'his', 'her', 'their', 'this', 'that', 'with', 'for', 'on', 'at', 'by', 'from',
        'very', 'some', 'into', 'have', 'been', 'would', 'could', 'should', 'will', 'just',
        'el', 'la', 'los', 'las', 'de', 'del', 'en', 'un', 'una', 'con', 'por', 'para', 'se', 'que',
        'su', 'sus', 'lo', 'le', 'al', 'y', 'o', 'no', 'si', 'me', 'te', 'nos', 'es', 'era', 'fue'
    ]);

    const promptLower = fragmento.toLowerCase();

    // Palabras limpias del prompt
    const palabras = promptLower
        .replace(/[^a-záéíóúüña-z\s]/gi, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));

    // Generar bigramas y trigramas del prompt
    // Ej: "dark stone floor" → ["dark stone", "stone floor", "dark stone floor"]
    const bigramas = _generarNgramas(palabras, 2);
    const trigramas = _generarNgramas(palabras, 3);

    for (const tag of img.tags) {
        if (!tag || tag.length < 2) continue;

        // +6 trigrama exacto con el tag  (máxima afinidad)
        if (trigramas.some(t => t === tag || tag.includes(t))) { score += 6; continue; }

        // +4 bigrama exacto con el tag
        if (bigramas.some(b => b === tag || tag.includes(b))) { score += 4; continue; }

        // +3 tag aparece literalmente en el prompt completo
        if (promptLower.includes(tag)) { score += 3; continue; }

        // +2 palabra exacta del prompt = tag
        if (palabras.some(p => p === tag)) { score += 2; continue; }

        // +1 match parcial (uno contiene al otro)
        if (palabras.some(p => tag.includes(p) || p.includes(tag))) score += 1;
    }

    // +3 si el query base de la imagen pertenece al universo actual
    const universoPalabras = (UNIVERSE_IMAGE_QUERIES[universo] || []).join(' ').toLowerCase();
    if (img.query && universoPalabras.includes(img.query.split(' ')[0])) score += 3;

    // +1 por tag del universo que aparece en los tags
    const UNIVERSE_TAGS = {
        fantasy_epic: ['fantasy', 'dragon', 'castle', 'magic', 'medieval', 'dark', 'forest', 'mystical'],
        cultivation: ['chinese', 'mountain', 'fog', 'zen', 'temple', 'bamboo', 'asia', 'misty'],
        sci_fi: ['futuristic', 'space', 'neon', 'cyberpunk', 'galaxy', 'technology', 'circuit'],
        romance: ['romantic', 'flowers', 'sunset', 'couple', 'cozy', 'soft', 'bokeh'],
        thriller: ['dark', 'alley', 'rain', 'night', 'mysterious', 'abandoned', 'noir', 'storm'],
        horror: ['haunted', 'cemetery', 'gothic', 'eerie', 'shadows', 'darkness', 'abandoned'],
        adventure: ['mountain', 'jungle', 'desert', 'ocean', 'ruins', 'exploration', 'horizon'],
        drama: ['cinematic', 'portrait', 'rain', 'golden', 'melancholy', 'journey'],
        _default: ['library', 'book', 'vintage', 'manuscript', 'reading', 'literary']
    };
    const univTags = UNIVERSE_TAGS[universo] || UNIVERSE_TAGS._default;
    for (const utag of univTags) {
        if (img.tags.includes(utag)) score += 1;
    }

    return score;
}

// Devuelve la URL de la imagen más afín al fragmento dado
function seleccionarImagenAfin(fragmento) {
    if (_smartPool.length === 0) return null;
    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';

    // Evaluar todo el pool — el scorer es O(n × tags) y es rápido incluso a 1500 imgs
    // No usar muestra aleatoria — con pool grande queremos el mejor match real
    const muestra = _smartPool;

    let mejorScore = -1;
    let mejorImg = muestra[0];
    // Evitar repetir la última imagen mostrada
    const urlAnterior = _smartPool._lastShown || '';

    for (const img of muestra) {
        if (img.url === urlAnterior) continue;  // skip la misma
        const s = _scorearImagen(img, fragmento, universo);
        if (s > mejorScore) {
            mejorScore = s;
            mejorImg = img;
        }
    }

    if (mejorImg) _smartPool._lastShown = mejorImg.url;
    console.log(`[smartPool] Score: ${mejorScore} · tags: [${(mejorImg?.tags || []).slice(0, 4).join(', ')}] · query: ${mejorImg?.query || '?'}`);
    return mejorImg ? mejorImg.url : null;
}

// ─── ROTACIÓN POR FRASES (hook para TTS) ───
// Llamar desde leerOracion / leerOracionLocal en cada frase

function smartRotCheck(sentenceIndex) {
    if (!_smartRotActive) return;
    if (_smartPool.length === 0) return;

    // Cambiar imagen cada SMART_ROT_EVERY frases
    if (sentenceIndex === 0 || sentenceIndex - _smartRotSentence >= SMART_ROT_EVERY) {
        _smartRotSentence = sentenceIndex;

        // Obtener el fragmento de texto alrededor de las frases actuales
        const desde = Math.max(0, sentenceIndex - 2);
        const hasta = Math.min((typeof sentences !== 'undefined' ? sentences.length : 0) - 1, sentenceIndex + 5);
        const fragmento = (typeof sentences !== 'undefined')
            ? sentences.slice(desde, hasta + 1).join(' ')
            : '';

        const url = seleccionarImagenAfin(fragmento);
        if (!url) return;

        _aplicarUrlImagen(url);
        console.log(`[smartPool] Imagen rotada en frase ${sentenceIndex} (score-based)`);
    }
}

// ── Toggle de fondo en lector: controlado por #toggle-reader-bg ──
let _readerBgEnabled = false;

function toggleReaderBg(enabled) {
    _readerBgEnabled = enabled;
    if (!enabled) {
        limpiarReaderBg();
    } else {
        // Si el smart pool ya tiene imágenes, mostrar una ahora
        if (_smartPool.length > 0) {
            const fragmento = (typeof sentences !== 'undefined' && sentences.length > 0)
                ? sentences.slice(0, 5).join(' ') : '';
            const url = seleccionarImagenAfin(fragmento);
            if (url) _aplicarUrlImagenLector(url);
        } else {
            construirSmartPool().then(() => {
                const url = seleccionarImagenAfin('');
                if (url) _aplicarUrlImagenLector(url);
            });
        }
    }
}

// Aplica URL solo en el lector (con crossfade A/B)
function _aplicarUrlImagenLector(url) {
    if (!_readerBgEnabled) return;
    const reading = document.getElementById('reading-area');
    if (reading) reading.classList.add('has-reader-bg');
    _crossfadeLayer('reader-bg-a', 'reader-bg-b', url);
}

// Aplica la URL a todos los contenedores de imagen activos
// Usa crossfade A/B para transición suave en ambos contextos
function _aplicarUrlImagen(url) {
    const isVideoOpen = typeof videoActive !== 'undefined' && videoActive;

    if (isVideoOpen) {
        // ── Modo video: usar ai-bg-a/b con crossfade ──
        if (typeof mostrarImagenEnPanel === 'function' &&
            typeof aiImagesEnabled !== 'undefined' && !aiImagesEnabled) {
            mostrarImagenEnPanel(-1, url);
        } else {
            _crossfadeLayer('ai-bg-a', 'ai-bg-b', url);
        }
    } else {
        // ── Lector principal: respetar toggle ──
        _aplicarUrlImagenLector(url);
    }
}

// Crossfade entre dos capas A/B
function _crossfadeLayer(idA, idB, url) {
    const layerA = document.getElementById(idA);
    const layerB = document.getElementById(idB);
    if (!layerA || !layerB) return;

    // Determinar cuál está visible ahora
    const aVisible = parseFloat(layerA.style.opacity || 0) > 0.5;
    const incoming = aVisible ? layerB : layerA;
    const outgoing = aVisible ? layerA : layerB;

    // Precargar imagen antes de mostrarla
    const img = new Image();
    const _applyBg = (el, url) => {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        // Re-aplicar filtro de grises si está activo
        if (typeof _grayscaleActive !== 'undefined' && _grayscaleActive) {
            el.style.filter = 'grayscale(1) brightness(0.82) contrast(1.12)';
        }
    };
    img.onload = () => {
        _applyBg(incoming, url);
        incoming.style.opacity = '1';
        outgoing.style.opacity = '0';
    };
    img.onerror = () => {
        _applyBg(incoming, url);
        incoming.style.opacity = '1';
        outgoing.style.opacity = '0';
    };
    img.src = url;
}

// ─── API PÚBLICA ───

// Llama esto al iniciar TTS para activar rotación por frases
function iniciarSmartRot() {
    _smartRotActive = true;
    _smartRotSentence = -SMART_ROT_EVERY; // forzar cambio en frase 0
    // Asegurarse de tener el pool
    if (!_smartPoolLoaded) {
        construirSmartPool().then(() => {
            // Mostrar la primera imagen inmediatamente
            smartRotCheck(0);
        });
    } else {
        smartRotCheck(0);
    }
}

// Llama esto al detener TTS
function detenerSmartRot() {
    _smartRotActive = false;
}

// Forzar reconstrucción del pool (cuando cambia el universo detectado)
function refrescarSmartPool() {
    _smartPoolLoaded = false;
    localStorage.removeItem(SMART_POOL_KEY);
    construirSmartPool(true);
}

// ─── DEBOUNCE PARA SLOTS PIXABAY ───
// Múltiples solicitarImagenParaSlot() pueden llegar en ráfaga al abrir el visor.
// Este debounce colapsa todas las llamadas rápidas en una sola, usando el
// fragmento del último slot solicitado para el scoring.
let _pixabayDebounceTimer = null;
let _pixabayDebounceFragment = '';

function _pixabaySlotDebounced(slot, fragmento) {
    // Acumular el fragmento (el último slot tiene el contexto más adelantado)
    if (fragmento) _pixabayDebounceFragment = fragmento;

    clearTimeout(_pixabayDebounceTimer);
    _pixabayDebounceTimer = setTimeout(() => {
        _pixabayDebounceTimer = null;
        _aplicarPixabaySmart(_pixabayDebounceFragment);
        _pixabayDebounceFragment = '';
    }, 350);  // esperar 350ms para que lleguen todas las llamadas de la ráfaga
}

function _aplicarPixabaySmart(fragmento) {
    if (_smartPool.length > 0) {
        const url = seleccionarImagenAfin(fragmento);
        if (url) {
            console.log(`[smartPool] Prompt→imagen · "${fragmento.slice(0, 55)}"`);
            if (typeof mostrarImagenEnPanel === 'function') {
                mostrarImagenEnPanel(-1, url);
            } else {
                _crossfadeLayer('ai-bg-a', 'ai-bg-b', url);
            }
        }
    } else if (_pixabayPoolShared.length > 0) {
        // Fallback al pool viejo si el smart pool no está listo aún
        const url = _pixabayPoolShared[_pixabayPoolSharedIdx % _pixabayPoolShared.length];
        _pixabayPoolSharedIdx++;
        if (typeof mostrarImagenEnPanel === 'function') {
            mostrarImagenEnPanel(-1, url);
        }
    } else {
        // Sin pool todavía — construir y luego mostrar
        construirSmartPool().then(() => _aplicarPixabaySmart(fragmento));
    }
}

// Inicializar: limpiar pool viejo (puede tener personas, sin filtros)
// y reconstruir en background con los filtros actuales
(function () {
    try {
        const raw = localStorage.getItem('pixabay_smart_pool');
        if (raw) {
            const { ts, pool } = JSON.parse(raw);
            // Si el pool tiene imágenes con tags de personas → invalidar
            const tieneSucios = Array.isArray(pool) && pool.some(img =>
                Array.isArray(img.tags) && img.tags.some(t => _HUMAN_TAGS.has(t))
            );
            // También invalidar si es muy viejo (>2h) para recoger filtro -person
            const esViejo = Date.now() - ts > 2 * 60 * 60 * 1000;
            if (tieneSucios || esViejo) {
                localStorage.removeItem('pixabay_smart_pool');
                console.log('[smartPool] Pool invalidado — reconstruyendo con filtros...');
            }
        }
    } catch (e) { }
    _loadSmartPool();
})();

// Limpiar fondos del lector principal (llamar al detener TTS o cambiar capítulo)
function limpiarReaderBg() {
    const a = document.getElementById('reader-bg-a');
    const b = document.getElementById('reader-bg-b');
    if (a) a.style.opacity = '0';
    if (b) b.style.opacity = '0';
    const reading = document.getElementById('reading-area');
    if (reading) reading.classList.remove('has-reader-bg');
}