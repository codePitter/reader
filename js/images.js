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

    // Si el video overlay usa mostrarImagenEnPanel (video.js), lo usamos
    if (typeof mostrarImagenEnPanel === 'function' &&
        typeof aiImagesEnabled !== 'undefined' && !aiImagesEnabled) {
        // Simulamos slot -1 (especial para imágenes web)
        mostrarImagenEnPanel(-1, url);
    } else {
        // Fallback: aplicar directamente en los divs ai-bg-a/b
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
    }
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