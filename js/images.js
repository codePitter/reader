// ═══════════════════════════════════════
// IMAGES — Búsqueda de imágenes web via Unsplash API
// Depende de: main.js (aiDetectedUniverse, UNIVERSE_CONFIG, mostrarNotificacion)
// Carga después de: main.js, player.js
// ═══════════════════════════════════════

// ─── CONFIG UNSPLASH ───
// El usuario debe poner su Access Key aquí o en localStorage bajo 'unsplash_access_key'
const UNSPLASH_ACCESS_KEY = localStorage.getItem('unsplash_access_key') || 'TU_ACCESS_KEY_AQUI';
const UNSPLASH_API_BASE = 'https://api.unsplash.com';

// ─── ESTADO ───
let _imgActualIndex = 0;
let _imgResultados = [];   // array de objetos Unsplash
let _imgUltimaQuery = '';
let _imgCargando = false;

// ═══════════════════════════════════════
// MAPEO UNIVERSO → QUERIES UNSPLASH
// ═══════════════════════════════════════

const UNIVERSE_IMAGE_QUERIES = {
    fantasy_epic: [
        'epic fantasy landscape art',
        'medieval castle dark fantasy',
        'fantasy forest magical light',
        'ancient ruins mystical fog',
        'dragon fantasy illustration'
    ],
    cultivation: [
        'chinese traditional landscape mountain',
        'misty mountain peaks asia',
        'zen meditation nature serene',
        'ancient chinese temple fog',
        'bamboo forest morning light'
    ],
    sci_fi: [
        'futuristic city neon cyberpunk',
        'space station stars galaxy',
        'alien planet landscape sci-fi',
        'technology circuit board abstract',
        'rocket launch cosmos'
    ],
    romance: [
        'romantic sunset couple silhouette',
        'soft light flowers bokeh',
        'cozy cafe warm light',
        'autumn park bench leaves',
        'gentle ocean sunrise pastel'
    ],
    thriller: [
        'dark alley rainy night noir',
        'mysterious shadow fog city',
        'abandoned building decay moody',
        'dark corridor suspense thriller',
        'storm dramatic sky lightning'
    ],
    horror: [
        'dark haunted forest night',
        'abandoned house scary fog',
        'creepy shadows darkness horror',
        'cemetery gothic night moon',
        'dark tunnel eerie atmosphere'
    ],
    adventure: [
        'epic mountain summit adventure',
        'jungle exploration tropical',
        'ancient map treasure exploration',
        'desert dunes journey sunset',
        'ocean voyage horizon boat'
    ],
    drama: [
        'cinematic portrait emotion dramatic',
        'rain window melancholy mood',
        'golden hour emotional landscape',
        'black white portrait expressive',
        'empty road existential journey'
    ],
    _default: [
        'open book library reading',
        'vintage library shelves books',
        'old paper texture literary',
        'reading nook cozy atmosphere',
        'ink pen manuscript writing'
    ]
};

// ═══════════════════════════════════════
// CONSTRUCCIÓN DEL PROMPT DE BÚSQUEDA
// ═══════════════════════════════════════

/**
 * Genera la query de búsqueda combinando:
 *  1. El universo narrativo detectado por la IA
 *  2. Palabras clave extraídas del texto actualmente visible
 *  3. Un índice para rotar queries dentro del universo
 */
function construirQueryImagen(universo, textoCapitulo = '') {
    const queries = UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default;

    // Extraer sustantivos/adjetivos relevantes del capítulo (heurística simple)
    const keywords = extraerKeywordsTexto(textoCapitulo, 3);

    // Elegir una query base del universo (rotar con cada llamada)
    const baseQuery = queries[_imgActualIndex % queries.length];
    _imgActualIndex++;

    // Si hay keywords del texto, enriquecemos la query
    if (keywords.length > 0) {
        return `${baseQuery} ${keywords.join(' ')}`;
    }
    return baseQuery;
}

/**
 * Extrae N palabras "interesantes" del texto del capítulo:
 * - ≥ 5 caracteres, no stopwords comunes, priorizando las más frecuentes
 */
function extraerKeywordsTexto(texto, n = 3) {
    if (!texto || texto.length < 50) return [];

    const STOPWORDS = new Set([
        'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'them', 'their',
        'what', 'when', 'where', 'which', 'while', 'would', 'could', 'should', 'about',
        'there', 'these', 'those', 'then', 'than', 'into', 'more', 'some', 'also', 'each',
        'just', 'like', 'only', 'over', 'such', 'well', 'even', 'back', 'much', 'most',
        'pero', 'para', 'como', 'está', 'este', 'esta', 'una', 'los', 'las', 'del', 'que',
        'con', 'por', 'son', 'una', 'más', 'muy', 'todo', 'también', 'porque', 'cuando',
        'hacer', 'haber', 'tiene', 'puede', 'había', 'donde', 'hasta'
    ]);

    const palabras = texto.toLowerCase()
        .replace(/[^a-záéíóúüñ\s]/gi, ' ')
        .split(/\s+/)
        .filter(p => p.length >= 5 && !STOPWORDS.has(p));

    // Frecuencia
    const freq = {};
    palabras.forEach(p => { freq[p] = (freq[p] || 0) + 1; });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([word]) => word);
}

// ═══════════════════════════════════════
// BÚSQUEDA EN UNSPLASH
// ═══════════════════════════════════════

async function buscarImagenesUnsplash(query, page = 1, perPage = 9) {
    if (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY === 'TU_ACCESS_KEY_AQUI') {
        throw new Error('API Key de Unsplash no configurada. Agrégala en Configuración.');
    }

    const url = new URL(`${UNSPLASH_API_BASE}/search/photos`);
    url.searchParams.set('query', query);
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url.toString(), {
        headers: {
            'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            'Accept-Version': 'v1'
        }
    });

    if (!res.ok) {
        if (res.status === 401) throw new Error('API Key inválida. Revisa tu Access Key de Unsplash.');
        if (res.status === 403) throw new Error('Límite de requests de Unsplash alcanzado.');
        throw new Error(`Error Unsplash: ${res.status}`);
    }

    const data = await res.json();
    return data;
}

// ═══════════════════════════════════════
// ACCIÓN PRINCIPAL: GENERAR IMÁGENES
// ═══════════════════════════════════════

async function generarImagenesUniverso() {
    if (_imgCargando) return;

    const universo = aiDetectedUniverse || '_default';
    const textoEl = document.getElementById('texto-contenido');
    const texto = textoEl ? textoEl.textContent.slice(0, 2000) : '';
    const query = construirQueryImagen(universo, texto);

    _imgUltimaQuery = query;
    await _ejecutarBusqueda(query, 1);
}

async function refrescarImagenes() {
    if (!_imgUltimaQuery || _imgCargando) return;
    // Página aleatoria para variedad
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
        const data = await buscarImagenesUnsplash(query, page, 9);
        _imgResultados = data.results || [];

        if (_imgResultados.length === 0) {
            _mostrarEstadoCarga(false);
            _mostrarError('Sin resultados para esa búsqueda. Intenta otra query.');
            return;
        }

        renderizarGaleriaImagenes(_imgResultados, query);
        mostrarNotificacion(`✓ ${_imgResultados.length} imágenes encontradas`);

    } catch (err) {
        _mostrarEstadoCarga(false);
        _mostrarError(err.message);
        console.error('[images.js]', err);
    } finally {
        _imgCargando = false;
        _mostrarEstadoCarga(false);
    }
}

// ═══════════════════════════════════════
// RENDER DE LA GALERÍA
// ═══════════════════════════════════════

function renderizarGaleriaImagenes(fotos, query) {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container) return;

    container.innerHTML = '';

    // Header con la query usada
    const header = document.createElement('div');
    header.className = 'img-galeria-header';
    header.innerHTML = `
        <span class="img-query-badge">🔍 "${query}"</span>
        <button class="img-btn-refresh" onclick="refrescarImagenes()" title="Nuevas imágenes">↻ Refrescar</button>
    `;
    container.appendChild(header);

    // Grid de imágenes
    const grid = document.createElement('div');
    grid.className = 'img-galeria-grid';

    fotos.forEach((foto, i) => {
        const item = document.createElement('div');
        item.className = 'img-galeria-item';
        item.style.animationDelay = `${i * 60}ms`;

        const img = document.createElement('img');
        img.src = foto.urls.small;
        img.alt = foto.alt_description || query;
        img.loading = 'lazy';
        img.title = `📷 ${foto.user.name} · Unsplash`;

        // Click → abrir modal de preview
        img.addEventListener('click', () => abrirPreviewImagen(foto, i));

        // Overlay con atribución
        const overlay = document.createElement('div');
        overlay.className = 'img-galeria-overlay';
        overlay.innerHTML = `
            <span class="img-attr">📷 ${escapeHTMLImg(foto.user.name)}</span>
            <div class="img-actions">
                <button onclick="event.stopPropagation(); establecerImagenFondo('${foto.urls.regular}')" title="Usar como fondo">🖼 Fondo</button>
                <button onclick="event.stopPropagation(); abrirEnUnsplash('${foto.links.html}')" title="Ver en Unsplash">↗</button>
            </div>
        `;

        item.appendChild(img);
        item.appendChild(overlay);
        grid.appendChild(item);
    });

    container.appendChild(grid);
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

    imgEl.src = foto.urls.regular;
    imgEl.alt = foto.alt_description || '';

    infoEl.innerHTML = `
        <div class="img-preview-meta">
            <strong>${escapeHTMLImg(foto.user.name)}</strong>
            ${foto.description ? `<p>${escapeHTMLImg(foto.description.slice(0, 120))}</p>` : ''}
            <div class="img-preview-btns">
                <button onclick="establecerImagenFondo('${foto.urls.full}')">🖼 Usar como fondo</button>
                <button onclick="abrirEnUnsplash('${foto.links.html}')">↗ Ver en Unsplash</button>
                <button onclick="descargarImagen('${foto.urls.full}', '${foto.id}')">⬇ Descargar</button>
            </div>
        </div>
    `;

    // Navegación
    navPrev.onclick = () => {
        const newIdx = (index - 1 + _imgResultados.length) % _imgResultados.length;
        abrirPreviewImagen(_imgResultados[newIdx], newIdx);
    };
    navNext.onclick = () => {
        const newIdx = (index + 1) % _imgResultados.length;
        abrirPreviewImagen(_imgResultados[newIdx], newIdx);
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
    // Tecla ESC para cerrar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarPreviewImagen();
    });
    return modal;
}

// ═══════════════════════════════════════
// ACCIONES DE IMAGEN
// ═══════════════════════════════════════

function establecerImagenFondo(url) {
    const lector = document.getElementById('reader-panel') ||
        document.getElementById('texto-contenido')?.parentElement;
    if (!lector) {
        mostrarNotificacion('⚠ No se encontró el panel del lector');
        return;
    }
    lector.style.backgroundImage = `url('${url}')`;
    lector.style.backgroundSize = 'cover';
    lector.style.backgroundPosition = 'center';
    lector.style.backgroundBlendMode = 'overlay';
    mostrarNotificacion('✓ Imagen aplicada como fondo');
    cerrarPreviewImagen();
}

function quitarImagenFondo() {
    const lector = document.getElementById('reader-panel') ||
        document.getElementById('texto-contenido')?.parentElement;
    if (!lector) return;
    lector.style.backgroundImage = '';
    mostrarNotificacion('✓ Fondo removido');
}

function abrirEnUnsplash(url) {
    // Agregar UTM para cumplir con guidelines de Unsplash
    const fullUrl = url + '?utm_source=epub_reader&utm_medium=referral';
    window.open(fullUrl, '_blank', 'noopener');
}

function descargarImagen(url, id) {
    // Disparar download-location para cumplir con Unsplash API guidelines
    const dlUrl = `${UNSPLASH_API_BASE}/photos/${id}/download?client_id=${UNSPLASH_ACCESS_KEY}`;
    fetch(dlUrl).catch(() => { });   // fire-and-forget

    const a = document.createElement('a');
    a.href = url;
    a.download = `unsplash-${id}.jpg`;
    a.target = '_blank';
    a.click();
    mostrarNotificacion('⬇ Descargando imagen…');
}

// ═══════════════════════════════════════
// BÚSQUEDA CUSTOM DESDE INPUT
// ═══════════════════════════════════════

function handleBusquedaImagenKeypress(e) {
    if (e.key === 'Enter') {
        const val = document.getElementById('img-search-input')?.value || '';
        buscarImagenesCustom(val);
    }
}

function ejecutarBusquedaImagenCustom() {
    const val = document.getElementById('img-search-input')?.value || '';
    buscarImagenesCustom(val);
}

// ═══════════════════════════════════════
// CONFIGURACIÓN API KEY
// ═══════════════════════════════════════

function guardarUnsplashKey() {
    const key = document.getElementById('unsplash-key-input')?.value?.trim();
    if (!key) {
        mostrarNotificacion('⚠ Ingresa una Access Key válida');
        return;
    }
    localStorage.setItem('unsplash_access_key', key);
    // Actualizar la variable activa
    // (La constante no se puede reasignar, pero la búsqueda leerá desde localStorage)
    location.reload();   // recargar para que UNSPLASH_ACCESS_KEY tome el nuevo valor
}

// ═══════════════════════════════════════
// ESTADOS DE CARGA Y ERROR
// ═══════════════════════════════════════

function _mostrarEstadoCarga(loading, query = '') {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container) return;
    if (loading) {
        container.innerHTML = `
            <div class="img-loading">
                <div class="img-spinner"></div>
                <p>Buscando imágenes…</p>
                ${query ? `<small>"${escapeHTMLImg(query)}"</small>` : ''}
            </div>
        `;
    }
}

function _mostrarError(msg) {
    const container = document.getElementById('imagen-ia-galeria');
    if (!container) return;
    const needsKey = msg.includes('API Key') || msg.includes('Access Key');
    container.innerHTML = `
        <div class="img-error">
            <p>⚠ ${escapeHTMLImg(msg)}</p>
            ${needsKey ? `
            <div class="img-key-setup">
                <p>Obtén tu Access Key gratuita en 
                   <a href="https://unsplash.com/developers" target="_blank" rel="noopener">unsplash.com/developers</a>
                </p>
                <div class="img-key-row">
                    <input id="unsplash-key-input" type="text" placeholder="tu-access-key-aqui" />
                    <button onclick="guardarUnsplashKey()">Guardar</button>
                </div>
            </div>` : ''}
        </div>
    `;
}

// ═══════════════════════════════════════
// HELPER: escapeHTML (local, sin depender de ui.js)
// ═══════════════════════════════════════

function escapeHTMLImg(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Estilos en style.css — sección "IMÁGENES WEB — Unsplash (images.js)"
// ═══════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si la key está configurada y mostrar estado
    const container = document.getElementById('imagen-ia-galeria');
    if (container && (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY === 'TU_ACCESS_KEY_AQUI')) {
        _mostrarError('API Key de Unsplash no configurada. Agrégala para comenzar.');
    }

    // Botón buscar custom con Enter
    const searchInput = document.getElementById('img-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', handleBusquedaImagenKeypress);
    }
});