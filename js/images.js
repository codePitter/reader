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

// ─── PEXELS CONFIG ───
const PEXELS_API_BASE = 'https://api.pexels.com/v1/';
let _pexelsKey = localStorage.getItem('pexels_api_key') || '0eYJYF7CXXnjo9fOuyYvRNnAZL26iuOCM7RGGMbrx1EXqrWwPN5REP66';

// ─── UNSPLASH CONFIG ───
const UNSPLASH_API_BASE = 'https://api.unsplash.com/';
let _unsplashKey = localStorage.getItem('unsplash_api_key') || '';

// ─── OPENVERSE CONFIG ───
// API pública sin key para primeras requests (800M imágenes CC)
// Docs: https://api.openverse.org/v1/
const OPENVERSE_API_BASE = 'https://api.openverse.org/v1/images/';
let _openversePool = [];
let _openversePoolIdx = 0;
let _openversePoolListo = false;
let _openversePoolCargando = false;

// ─── POOL UNSPLASH ───
let _unsplashPool = [];
let _unsplashPoolIdx = 0;
let _unsplashPoolCargando = false;
let _unsplashPoolListo = false;

// Proveedor activo: 'pixabay' | 'pexels' | 'picsum' | 'unsplash'
let _imageProvider = localStorage.getItem('image_provider') || 'picsum';

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
// Queries escritas como escenas visuales concretas (no conceptos abstractos)
// ═══════════════════════════════════════

const UNIVERSE_IMAGE_QUERIES = {
    fantasy_epic: [
        'ancient stone castle fog mountains',
        'dark enchanted forest mist path',
        'ruined temple overgrown jungle stone',
        'dramatic storm sky mountain kingdom',
        'glowing crystal cave underground depth'
    ],
    cultivation: [
        'misty mountain peaks clouds bamboo',
        'ancient wooden pagoda fog sunrise',
        'bamboo forest morning light mist',
        'stone steps mountain temple ancient',
        'waterfall cliff rock zen nature'
    ],
    sci_fi: [
        'futuristic city night rain neon reflection',
        'dark space station corridor metal lights',
        'galaxy nebula stars deep space',
        'cyberpunk alley rain neon glowing',
        'alien landscape barren planet horizon'
    ],
    romance: [
        'golden hour field flowers soft light',
        'rainy window cafe warm bokeh night',
        'cherry blossom park pathway spring',
        'sunset beach water reflection soft',
        'autumn leaves park bench empty warm'
    ],
    thriller: [
        'dark alley rain night wet pavement',
        'empty corridor shadows building interior',
        'storm lightning dramatic dark clouds',
        'abandoned warehouse interior dark',
        'fog city street night empty'
    ],
    horror: [
        'dark fog forest dead trees path',
        'abandoned decayed mansion exterior night',
        'empty dark corridor flickering light',
        'cemetery fog night stone crosses',
        'dark basement door shadow underground'
    ],
    adventure: [
        'dramatic mountain summit clouds aerial',
        'jungle dense canopy tropical mist',
        'desert sand dunes sunset horizon',
        'ocean cliff dramatic wave coast',
        'ancient stone ruins overgrown forest'
    ],
    drama: [
        'rain drops window glass city blur',
        'empty park bench autumn leaves fog',
        'dramatic overcast sky empty road',
        'old wooden door stone wall aged',
        'golden hour empty field melancholy'
    ],
    _default: [
        'old leather book pages texture vintage',
        'library shelves books warm candlelight',
        'ancient manuscript parchment ink aged',
        'reading nook armchair lamp warm cozy',
        'wooden desk books scattered morning light'
    ]
};

// ─── Color palette por universo (parámetro Pixabay) ───
// Valores válidos: grayscale, transparent, red, orange, yellow, green,
//                  turquoise, blue, lilac, pink, white, gray, black, brown
const UNIVERSE_COLOR_HINTS = {
    fantasy_epic: 'blue',
    cultivation: 'green',
    sci_fi: 'blue',
    romance: 'orange',
    thriller: 'gray',
    horror: 'black',
    adventure: 'brown',
    drama: 'gray',
    _default: 'brown'
};

// ═══════════════════════════════════════
// CONSTRUCCIÓN DEL QUERY
// ═══════════════════════════════════════

function construirQueryImagen(universo, textoCapitulo = '') {
    const queries = UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default;
    // Rotación con offset aleatorio para evitar siempre empezar por la misma
    const offset = Math.floor(Math.random() * queries.length);
    const baseQuery = queries[(_imgActualIndex + offset) % queries.length];
    _imgActualIndex++;
    return baseQuery;
}

// ═══════════════════════════════════════
// BÚSQUEDA EN PIXABAY
// ═══════════════════════════════════════

// Wrapper para búsquedas del smart pool: añade términos de exclusión al query
// Tags que indican presencia de personas — se usan para filtrar resultados post-fetch
const _PERSON_TAGS = new Set([
    'person', 'people', 'man', 'woman', 'men', 'women', 'girl', 'boy', 'child', 'children',
    'baby', 'infant', 'toddler', 'kid', 'kids', 'teen', 'teenager', 'adult', 'face', 'portrait',
    'human', 'crowd', 'family', 'couple', 'bride', 'groom', 'model', 'student', 'soldier',
    'nurse', 'doctor', 'athlete', 'player', 'dancer', 'actor', 'actress'
]);

// Filtra un array de hits de Pixabay eliminando los que tengan tags de personas
// Términos parciales — si cualquier tag los CONTIENE se descarta
const _PERSON_PARTIALS = ['person', 'people', 'man', 'woman', 'girl', 'boy', 'child', 'human', 'face', 'portrait', 'crowd', 'couple', 'model', 'soldier', 'athlete', 'dancer'];

function _filtrarSinPersonas(hits) {
    return hits.filter(h => {
        const tags = (h.tags || '').toLowerCase().split(',').map(t => t.trim());
        // Coincidencia exacta
        const exacta = tags.some(t => _PERSON_TAGS.has(t));
        // Coincidencia parcial (ej: "young woman" o "businessman" contienen términos de persona)
        const parcial = !exacta && tags.some(t => _PERSON_PARTIALS.some(p => t.includes(p)));
        const tienePersona = exacta || parcial;
        if (tienePersona) {
            console.log(`[img] ❌ Descartada · tags: "${h.tags}"`);
        } else {
            console.log(`[img] ✅ Aceptada · tags: "${h.tags}" · id:${h.id}`);
        }
        return !tienePersona;
    });
}

async function _buscarSinPersonas(query, page, perPage) {
    // Nota: Pixabay ignora operadores negativos (-term) en la API.
    // El filtrado real de personas se hace POST-FETCH con _filtrarSinPersonas().
    // Pedimos más imágenes de las necesarias para compensar las descartadas.
    const overFetch = Math.min(perPage * 2, 200); // pedir el doble, máx 200

    // Randomizar página (1–3) para evitar siempre las mismas top-N imágenes
    const randomPage = page === 1 ? Math.floor(Math.random() * 3) + 1 : page;

    // Color hint según universo detectado
    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const colorHint = UNIVERSE_COLOR_HINTS[universo] || '';

    const url = new URL(PIXABAY_API_BASE);
    url.searchParams.set('key', _pixabayKey);
    url.searchParams.set('q', query);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', overFetch);
    url.searchParams.set('page', randomPage);
    url.searchParams.set('min_width', '1280');
    url.searchParams.set('order', 'popular');
    url.searchParams.set('category', 'backgrounds');
    if (colorHint) url.searchParams.set('colors', colorHint);

    console.log(`[img] 🔍 Pixabay request · query="${query}" · page=${randomPage} · colors=${colorHint || 'none'} · per_page=${overFetch}`);

    try {
        const res = await fetch(url.toString());
        if (!res.ok) {
            console.warn(`[img] ⚠ Pixabay HTTP ${res.status} para query="${query}"`);
            // Fallback: reintentar sin el filtro de color si falla
            if (colorHint) {
                console.log(`[img] 🔄 Reintentando sin filtro de color...`);
                url.searchParams.delete('colors');
                const res2 = await fetch(url.toString());
                if (!res2.ok) return { hits: [] };
                const data2 = await res2.json();
                const filtrados2 = _filtrarSinPersonas(data2.hits || []);
                console.log(`[img] ✓ Reintento sin color · recibidas:${data2.hits?.length || 0} · filtradas:${filtrados2.length}`);
                return { hits: filtrados2 };
            }
            return { hits: [] };
        }
        const data = await res.json();
        const total = data.hits?.length || 0;
        const filtrados = _filtrarSinPersonas(data.hits || []);
        console.log(`[img] ✓ Pixabay · query="${query}" · recibidas:${total} · después de filtro personas:${filtrados.length}`);
        return { hits: filtrados };
    } catch (e) {
        console.warn(`[img] ⚠ Pixabay fetch error · query="${query}":`, e.message);
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
// BÚSQUEDA EN PEXELS
// ═══════════════════════════════════════

async function buscarImagenesPexels(query, page = 1, perPage = 12) {
    if (!_pexelsKey) throw new Error('NO_KEY');

    const url = new URL(PEXELS_API_BASE + 'search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('page', page);
    url.searchParams.set('orientation', 'landscape');

    const res = await fetch(url.toString(), {
        headers: { 'Authorization': _pexelsKey }
    });

    if (!res.ok) {
        if (res.status === 401) throw new Error('API Key de Pexels inválida.');
        if (res.status === 429) throw new Error('Límite de requests de Pexels alcanzado. Esperá un momento.');
        throw new Error(`Error Pexels: ${res.status}`);
    }

    const data = await res.json();
    // Normalizar al mismo formato interno que Pixabay
    const hits = (data.photos || []).map(p => ({
        id: p.id,
        urlSmall: p.src.medium,
        urlFull: p.src.large2x || p.src.large || p.src.original,
        urlThumb: p.src.tiny,
        autor: p.photographer,
        tags: p.alt || query,
        pageUrl: p.url,
        fuente: 'Pexels'
    }));
    return { hits, totalHits: data.total_results };
}

async function _buscarSinPersonasPexels(query, page, perPage) {
    const safeQuery = query + ' landscape nature';
    const url = new URL(PEXELS_API_BASE + 'search');
    url.searchParams.set('query', safeQuery);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('page', page);
    url.searchParams.set('orientation', 'landscape');
    try {
        const res = await fetch(url.toString(), { headers: { 'Authorization': _pexelsKey } });
        if (!res.ok) return { photos: [] };
        return await res.json();
    } catch (e) {
        return { photos: [] };
    }
}

// ═══════════════════════════════════════
// BÚSQUEDA EN UNSPLASH
// ═══════════════════════════════════════

async function buscarImagenesUnsplash(query, perPage = 5) {
    if (!_unsplashKey) throw new Error('NO_KEY');

    const url = new URL(UNSPLASH_API_BASE + 'search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Client-ID ${_unsplashKey}` }
    });

    if (!res.ok) {
        if (res.status === 401) throw new Error('API Key de Unsplash inválida.');
        if (res.status === 403) throw new Error('Límite de requests de Unsplash alcanzado.');
        throw new Error(`Error Unsplash: ${res.status}`);
    }

    const data = await res.json();
    return (data.results || []).map(p => ({
        id: p.id,
        urlFull: p.urls.full,
        urlSmall: p.urls.regular,
        autor: p.user?.name || 'Unsplash',
        tags: p.alt_description || query,
        pageUrl: p.links?.html || 'https://unsplash.com',
        fuente: 'Unsplash'
    }));
}

// Carga el pool Unsplash: 5 imgs del universo + 5 del prompt de Claude
async function _cargarPoolUnsplash(promptVisual = '') {
    if (_unsplashPoolCargando) return;
    if (!_unsplashKey) { console.warn('[img] ⚠ Unsplash: no hay API key'); return; }
    _unsplashPoolCargando = true;

    const statusTxt = document.getElementById('img-ia-status-txt');
    if (statusTxt) statusTxt.textContent = '⏳ Cargando pool Unsplash…';

    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const universQueries = UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default;
    const queryUniverso = universQueries[0]; // query principal del universo

    // 5 palabras clave del prompt de Claude
    const promptWords = promptVisual
        ? _extraerGruposDePrompt(promptVisual)[0] // primer grupo de 3 palabras
        : universQueries[1] || queryUniverso;

    console.log(`[img] 🚀 Unsplash pool · universo="${queryUniverso}" · prompt="${promptWords}"`);

    const urls = [];
    try {
        // Query 1: universo (5 imágenes)
        if (statusTxt) statusTxt.textContent = '⏳ Unsplash 1/2…';
        try {
            const fotos1 = await buscarImagenesUnsplash(queryUniverso, 5);
            fotos1.forEach(f => urls.push(f.urlFull));
            console.log(`[img] Unsplash universo "${queryUniverso}" → ${fotos1.length} imgs`);
        } catch (e) { console.warn('[img] Unsplash universo falló:', e.message); }

        // Query 2: prompt de Claude (5 imágenes)
        if (statusTxt) statusTxt.textContent = '⏳ Unsplash 2/2…';
        try {
            const fotos2 = await buscarImagenesUnsplash(promptWords, 5);
            fotos2.forEach(f => urls.push(f.urlFull));
            console.log(`[img] Unsplash prompt "${promptWords}" → ${fotos2.length} imgs`);
        } catch (e) { console.warn('[img] Unsplash prompt falló:', e.message); }

        if (urls.length === 0) {
            _unsplashPoolListo = false;
            if (statusTxt) statusTxt.textContent = '⚠ Unsplash sin resultados';
        } else {
            _unsplashPool = _shuffleArray(urls);
            _unsplashPoolIdx = 0;
            _unsplashPoolListo = true;
            console.log(`[img] ✓ Unsplash pool listo · ${_unsplashPool.length} imgs`);
            if (statusTxt) statusTxt.textContent = `✓ Unsplash · ${_unsplashPool.length} imgs`;
        }
    } finally {
        _unsplashPoolCargando = false;
    }
}

function _siguienteUrlUnsplash() {
    if (_unsplashPool.length === 0) return null;
    const url = _unsplashPool[_unsplashPoolIdx % _unsplashPool.length];
    _unsplashPoolIdx++;
    return url;
}

// ═══════════════════════════════════════
// OPENVERSE — API pública CC, sin key
// 800M+ imágenes libres de derechos
// ═══════════════════════════════════════

// Queries cortas por universo para Openverse (Elasticsearch token matching — 1-2 palabras)
// Queries largas tipo "old leather book pages texture vintage" devuelven 0 resultados
// porque Openverse indexa title/tags y rara vez tienen esa combinación exacta de tokens
const OPENVERSE_QUERIES = {
    fantasy_epic: ['castle', 'forest', 'ruins', 'mountain', 'fog', 'cliff', 'stone'],
    cultivation: ['mountain', 'waterfall', 'bamboo', 'mist', 'temple', 'landscape'],
    sci_fi: ['city night', 'space', 'galaxy', 'neon', 'technology', 'industrial'],
    romance: ['sunset', 'flowers', 'park', 'golden hour', 'autumn', 'beach'],
    thriller: ['rain', 'dark alley', 'fog', 'storm', 'abandoned', 'shadow'],
    horror: ['forest', 'dark', 'cemetery', 'fog', 'ruins', 'storm'],
    adventure: ['mountain', 'jungle', 'desert', 'ocean', 'cliff', 'landscape'],
    drama: ['rain', 'window', 'bench', 'autumn', 'overcast', 'road'],
    _default: ['library', 'books', 'landscape', 'nature', 'architecture', 'sky']
};

async function _buscarEnOpenverse(query, page = 1) {
    const url = new URL(OPENVERSE_API_BASE);
    url.searchParams.set('q', query);
    url.searchParams.set('page_size', '20');
    url.searchParams.set('page', page);
    // Sin license_type: muchas imágenes no tienen este metadato y quedan excluidas
    // Sin aspect_ratio: el filtro reduce demasiado los resultados en Openverse
    // Sin source: ampliar el índice mejora los resultados notablemente
    url.searchParams.set('extension', 'jpg');  // solo JPG para calidad consistente

    console.log(`[img] 🔍 Openverse request · query="${query}" · page=${page}`);
    try {
        const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            console.warn(`[img] ⚠ Openverse HTTP ${res.status}`);
            return [];
        }
        const data = await res.json();
        // Sin filtro de width: Openverse raramente tiene ese metadato disponible
        const results = (data.results || [])
            .map(r => ({
                id: r.id,
                urlFull: r.url,
                urlSmall: r.thumbnail || r.url,
                autor: r.creator || 'Openverse CC',
                tags: r.title || query,
                pageUrl: r.foreign_landing_url || r.url,
                fuente: 'Openverse'
            }));
        console.log(`[img] ✓ Openverse · ${results.length} imgs para "${query}"`);
        return results;
    } catch (e) {
        console.warn(`[img] ⚠ Openverse error:`, e.message);
        return [];
    }
}

// Timestamp del último intento fallido — evita reintentos en cada frase
let _openverseLastFailTs = 0;
const _OPENVERSE_RETRY_COOLDOWN = 60000; // 1 min entre reintentos fallidos

async function _cargarPoolOpenverse(promptVisual = '') {
    if (_openversePoolCargando || _openversePoolListo) return;

    // Cooldown: si el último intento falló hace menos de 1 min, no reintentar
    const ahora = Date.now();
    if (_openverseLastFailTs && (ahora - _openverseLastFailTs) < _OPENVERSE_RETRY_COOLDOWN) {
        console.log(`[img] ⏳ Openverse cooldown activo — ${Math.round((_OPENVERSE_RETRY_COOLDOWN - (ahora - _openverseLastFailTs)) / 1000)}s restantes`);
        return;
    }

    _openversePoolCargando = true;

    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const queries = OPENVERSE_QUERIES[universo] || OPENVERSE_QUERIES._default;
    // Fallback: si las queries del universo fallan, usar _default
    const queriesFallback = OPENVERSE_QUERIES._default;

    console.log(`[img] 🚀 Openverse pool · universo="${universo}" · queries:`, queries.slice(0, 3));

    const urls = [];

    // Intentar hasta 3 queries del universo (en vez de 2)
    const queriesToFetch = queries.slice(0, 3);
    for (const q of queriesToFetch) {
        const page = Math.floor(Math.random() * 5) + 1;
        const results = await _buscarEnOpenverse(q, page);
        results.forEach(r => { if (r.urlFull) urls.push(r.urlFull); });
        console.log(`[img]   └─ "${q}" p${page} → ${results.length} imgs · acum: ${urls.length}`);
        if (urls.length >= 15) break; // suficientes, no gastar más cuota
    }

    // Si el universo no dio resultados, intentar con queries _default como fallback
    if (urls.length === 0 && universo !== '_default') {
        console.warn(`[img] ⚠ Openverse: queries del universo sin resultados — intentando _default`);
        for (const q of queriesFallback.slice(0, 2)) {
            const page = Math.floor(Math.random() * 3) + 1;
            const results = await _buscarEnOpenverse(q, page);
            results.forEach(r => { if (r.urlFull) urls.push(r.urlFull); });
            console.log(`[img]   └─ [fallback] "${q}" p${page} → ${results.length} imgs · acum: ${urls.length}`);
            if (urls.length >= 10) break;
        }
    }

    if (urls.length > 0) {
        _openversePool = _shuffleArray(urls);
        _openversePoolIdx = 0;
        _openversePoolListo = true;
        _openverseLastFailTs = 0; // resetear cooldown
        console.log(`[img] ✓ Openverse pool listo · ${_openversePool.length} imgs`);
    } else {
        _openverseLastFailTs = Date.now(); // activar cooldown
        console.warn(`[img] ⚠ Openverse pool vacío — usando Picsum · próximo reintento en ${_OPENVERSE_RETRY_COOLDOWN / 1000}s`);
    }
    _openversePoolCargando = false;
}

function _siguienteUrlOpenverse() {
    if (_openversePool.length === 0) return null;
    const url = _openversePool[_openversePoolIdx % _openversePool.length];
    _openversePoolIdx++;
    return url;
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

    // ── Helper: extraer query genérica (últimas 1-2 palabras) ──
    const _queryGenerica = (q) => q.split(' ').slice(-2).join(' ');

    try {
        const proveedorActivo = _imageProvider;

        if (proveedorActivo === 'pexels' && _pexelsKey) {
            // ── Pexels con fallback en cadena ──
            let data = await buscarImagenesPexels(query, page, 12);
            let fotos = data.hits || [];

            if (fotos.length === 0) {
                const queryGen = _queryGenerica(query);
                console.log(`[img] 🔄 Pexels sin resultados para "${query}" → fallback genérico "${queryGen}"`);
                data = await buscarImagenesPexels(queryGen, 1, 12);
                fotos = data.hits || [];
            }

            if (fotos.length === 0) {
                console.warn(`[img] ⚠ Pexels sin resultados tras fallback — usando Picsum`);
                const urls = generarUrlsPicsum(9);
                fotos = urls.map((url, i) => ({ id: `picsum-${i}`, urlSmall: url, urlFull: url, urlThumb: url, autor: 'Picsum', tags: query, pageUrl: 'https://picsum.photos', fuente: 'Picsum' }));
            }

            _imgResultados = fotos;
            renderizarGaleriaImagenes(fotos, query);
            mostrarNotificacion(`✓ ${fotos.length} imágenes · ${fotos[0]?.fuente || 'Pexels'}`);
            _autoRotPool = fotos.map(f => f.urlFull);
            _autoRotPoolIdx = 0;

        } else if (proveedorActivo === 'pixabay' && _pixabayKey) {
            // ── Pixabay con fallback en cadena ──
            let data = await buscarImagenesPixabay(query, page, 12);
            let rawHits = data.hits || [];

            if (rawHits.length === 0) {
                const queryGen = _queryGenerica(query);
                console.log(`[img] 🔄 Pixabay sin resultados para "${query}" → fallback genérico "${queryGen}"`);
                data = await buscarImagenesPixabay(queryGen, 1, 12);
                rawHits = data.hits || [];
            }

            if (rawHits.length === 0) {
                console.warn(`[img] ⚠ Pixabay sin resultados tras fallback — usando Picsum`);
                const urls = generarUrlsPicsum(9);
                const fotos = urls.map((url, i) => ({ id: `picsum-${i}`, urlSmall: url, urlFull: url, urlThumb: url, autor: 'Picsum', tags: query, pageUrl: 'https://picsum.photos', fuente: 'Picsum' }));
                _imgResultados = fotos;
                renderizarGaleriaImagenes(fotos, `${query} (Picsum)`);
                _autoRotPool = urls;
                _autoRotPoolIdx = 0;
                return;
            }

            _imgResultados = rawHits;
            const fotos = rawHits.map(h => ({
                id: h.id, urlSmall: h.webformatURL, urlFull: h.largeImageURL,
                urlThumb: h.previewURL, autor: h.user, tags: h.tags,
                pageUrl: h.pageURL, fuente: 'Pixabay'
            }));
            renderizarGaleriaImagenes(fotos, query);
            mostrarNotificacion(`✓ ${fotos.length} imágenes · Pixabay`);
            _autoRotPool = fotos.map(f => f.urlFull);
            _autoRotPoolIdx = 0;

        } else {
            // ── Fallback: Picsum (sin key) ──
            const urls = generarUrlsPicsum(9);
            const fotos = urls.map((url, i) => ({
                id: `picsum-${i}`, urlSmall: url.replace('1920/1080', '400/300'),
                urlFull: url, urlThumb: url.replace('1920/1080', '200/150'),
                autor: 'Picsum Photos', tags: query,
                pageUrl: 'https://picsum.photos', fuente: 'Picsum'
            }));
            _imgResultados = fotos;
            renderizarGaleriaImagenes(fotos, `${query} (Picsum — sin key)`);
            mostrarNotificacion(`✓ Imágenes aleatorias · Picsum`);
            _autoRotPool = urls;
            _autoRotPoolIdx = 0;
        }

    } catch (err) {
        if (err.message === 'NO_KEY') {
            const urls = generarUrlsPicsum(9);
            const fotos = urls.map((url, i) => ({
                id: `picsum-${i}`, urlSmall: url.replace('1920/1080', '400/300'),
                urlFull: url, urlThumb: url.replace('1920/1080', '200/150'),
                autor: 'Picsum Photos', tags: query,
                pageUrl: 'https://picsum.photos', fuente: 'Picsum'
            }));
            _imgResultados = fotos;
            renderizarGaleriaImagenes(fotos, `${query} (Picsum)`);
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
    if (fuente === 'Pexels') {
        footer.innerHTML = 'Imágenes via <a href="https://www.pexels.com" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">Pexels</a> · Fotos por sus autores';
    } else if (fuente === 'Pixabay') {
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

    // NO pre-cargar pool al inicio — el universo aún no está detectado.
    // El pool se cargará en detectarUniverso() (video.js) una vez conocido el universo.
    // Picsum no necesita requests, se inicializa siempre como fallback.
    _inicializarPoolPicsum();

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

    const pexelsOk = !!_pexelsKey;
    const pixabayOk = !!_pixabayKey;

    // Helper: mini input de frecuencia reutilizable por proveedor
    const _freqInput = (prov) => {
        const val = _getChangeEvery(prov);
        return `
            <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
                <label style="font-size:0.54rem;color:var(--text-dim);white-space:nowrap;">⏱ Cambiar cada</label>
                <input type="number" min="1" max="200" value="${val}"
                    id="freq-input-${prov}"
                    onblur="guardarFrecuenciaImagen('${prov}', this)"
                    onkeydown="if(event.key==='Enter') guardarFrecuenciaImagen('${prov}', this)"
                    style="width:42px;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                           color:var(--text);font-family:'DM Mono',monospace;font-size:0.62rem;
                           padding:3px 5px;outline:none;text-align:center;">
                <label style="font-size:0.54rem;color:var(--text-dim);">frases</label>
            </div>`;
    };

    galeria.innerHTML = `
        <div style="padding:6px 0;">
            <!-- Selector de proveedor -->
            <div style="margin-bottom:6px;">
                <label style="font-size:0.58rem;color:var(--text-dim);display:block;margin-bottom:3px;">📷 Proveedor de imágenes</label>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button type="button" id="btn-prov-pexels"
                        onclick="cambiarProveedorImagenes('pexels')"
                        style="flex:1;font-family:'DM Mono',monospace;font-size:0.58rem;padding:4px 6px;border-radius:4px;cursor:pointer;transition:all 0.2s;border:1px solid var(--border);background:${_imageProvider === 'pexels' ? 'var(--accent2)' : 'var(--bg-3)'};color:${_imageProvider === 'pexels' ? 'var(--bg)' : 'var(--text-dim)'};">
                        Pexels ${pexelsOk ? '✓' : ''}
                    </button>
                    <button type="button" id="btn-prov-pixabay"
                        onclick="cambiarProveedorImagenes('pixabay')"
                        style="flex:1;font-family:'DM Mono',monospace;font-size:0.58rem;padding:4px 6px;border-radius:4px;cursor:pointer;transition:all 0.2s;border:1px solid var(--border);background:${_imageProvider === 'pixabay' ? 'var(--accent2)' : 'var(--bg-3)'};color:${_imageProvider === 'pixabay' ? 'var(--bg)' : 'var(--text-dim)'};">
                        Pixabay ${pixabayOk ? '✓' : ''}
                    </button>
                    <button type="button" id="btn-prov-picsum"
                        onclick="cambiarProveedorImagenes('picsum')"
                        style="flex:1;font-family:'DM Mono',monospace;font-size:0.58rem;padding:4px 6px;border-radius:4px;cursor:pointer;transition:all 0.2s;border:1px solid var(--border);background:${_imageProvider === 'picsum' ? 'var(--accent2)' : 'var(--bg-3)'};color:${_imageProvider === 'picsum' ? 'var(--bg)' : 'var(--text-dim)'};">
                        Picsum
                    </button>
                    <button type="button" id="btn-prov-openverse"
                        onclick="cambiarProveedorImagenes('openverse')"
                        style="flex:1;font-family:'DM Mono',monospace;font-size:0.58rem;padding:4px 6px;border-radius:4px;cursor:pointer;transition:all 0.2s;border:1px solid var(--border);background:${_imageProvider === 'openverse' ? 'var(--accent2)' : 'var(--bg-3)'};color:${_imageProvider === 'openverse' ? 'var(--bg)' : 'var(--text-dim)'};">
                        Openverse
                    </button>
                </div>
            </div>

            <!-- Panel Pexels -->
            <div id="pexels-key-panel" style="display:${_imageProvider === 'pexels' ? 'block' : 'none'};margin-bottom:6px;">
                <p style="font-size:0.56rem;color:var(--text-dim);margin-bottom:4px;line-height:1.4;">
                    🔑 Key Pexels
                    <a href="https://www.pexels.com/api/key/" target="_blank" rel="noopener"
                       style="color:var(--accent);text-decoration:none;">pexels.com/api/key</a>
                </p>
                <div style="display:flex;gap:4px;">
                    <input id="pexels-key-input" type="password" placeholder="tu-api-key-pexels"
                           value="${_pexelsKey ? '••••••••' : ''}"
                           style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                                  color:var(--text);font-family:'DM Mono',monospace;font-size:0.62rem;
                                  padding:5px 8px;outline:none;min-width:0;">
                    <button type="button" onclick="guardarPexelsKey()"
                            style="background:var(--accent2);border:none;border-radius:4px;color:var(--bg);
                                   font-family:'DM Mono',monospace;font-size:0.6rem;padding:5px 8px;cursor:pointer;flex-shrink:0;">
                        OK
                    </button>
                </div>
                ${pexelsOk ? `<div style="font-size:0.55rem;color:var(--accent2);margin-top:3px;">✓ Key configurada</div>` : ''}
                ${_freqInput('pexels')}
            </div>

            <!-- Panel Pixabay -->
            <div id="pixabay-key-panel" style="display:${_imageProvider === 'pixabay' ? 'block' : 'none'};margin-bottom:6px;">
                ${!pixabayOk ? `
                <p style="font-size:0.56rem;color:var(--text-dim);margin-bottom:4px;line-height:1.4;">
                    🔑 Key Pixabay
                    <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener"
                       style="color:var(--accent);text-decoration:none;">pixabay.com/api/docs</a>
                </p>
                <div style="display:flex;gap:4px;">
                    <input id="pixabay-key-input" type="password" placeholder="tu-api-key-pixabay"
                           style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                                  color:var(--text);font-family:'DM Mono',monospace;font-size:0.62rem;
                                  padding:5px 8px;outline:none;min-width:0;">
                    <button type="button" onclick="guardarPixabayKey()"
                            style="background:var(--accent2);border:none;border-radius:4px;color:var(--bg);
                                   font-family:'DM Mono',monospace;font-size:0.6rem;padding:5px 8px;cursor:pointer;flex-shrink:0;">
                        OK
                    </button>
                </div>` : `<div style="font-size:0.55rem;color:var(--accent2);margin-bottom:4px;">✓ Key configurada</div>`}
                ${_freqInput('pixabay')}
            </div>

            <!-- Panel Picsum -->
            <div id="picsum-freq-panel" style="display:${_imageProvider === 'picsum' ? 'block' : 'none'};margin-bottom:6px;">
                <p style="font-size:0.55rem;color:var(--text-dim);margin-bottom:2px;">Sin API key · imágenes aleatorias</p>
                ${_freqInput('picsum')}
            </div>

            <!-- Panel Openverse -->
            <div id="openverse-freq-panel" style="display:${_imageProvider === 'openverse' ? 'block' : 'none'};margin-bottom:6px;">
                <p style="font-size:0.55rem;color:var(--text-dim);margin-bottom:2px;">Sin API key · 800M imágenes CC0</p>
                ${_freqInput('openverse')}
            </div>

            <!-- Botón cargar imágenes -->
            <button type="button" onclick="generarImagenesUniverso()"
                    style="width:100%;background:none;border:1px solid var(--border);border-radius:4px;
                           color:var(--text-dim);font-family:'DM Mono',monospace;font-size:0.6rem;
                           padding:4px 0;cursor:pointer;transition:border-color 0.2s;margin-top:4px;"
                    onmouseover="this.style.borderColor='var(--accent2)'"
                    onmouseout="this.style.borderColor='var(--border)'">
                📷 Cargar imágenes →
            </button>
        </div>
    `;
}

// Cambiar proveedor activo y actualizar UI
function cambiarProveedorImagenes(proveedor) {
    _imageProvider = proveedor;
    localStorage.setItem('image_provider', proveedor);
    IMAGE_CHANGE_EVERY = _getChangeEvery(proveedor);  // actualizar frecuencia activa
    _renderizarPanelKey();
    mostrarNotificacion(`✓ Proveedor: ${proveedor.charAt(0).toUpperCase() + proveedor.slice(1)}`);
    // Resetear pools para recarga con el nuevo proveedor
    _pixabayPoolShared = []; _pixabayPoolListo = false; _pixabayPoolIdx = 0;
    _openversePool = []; _openversePoolListo = false; _openversePoolIdx = 0;
    // Todos los proveedores esperan al universo antes de cargar el pool
    const _univOk = typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse;
    if (!_univOk) {
        console.log(`[img] Proveedor "${proveedor}" seleccionado — esperando universo para cargar pool`);
        return;
    }
    if (proveedor === 'pixabay' && _pixabayKey) _cargarPoolPixabay();
    if (proveedor === 'openverse') _cargarPoolOpenverse();
    if (proveedor === 'unsplash' && _unsplashKey) _cargarPoolUnsplash();
}

// Guardar key de Pexels
function guardarPexelsKey() {
    const input = document.getElementById('pexels-key-input');
    const key = input?.value?.trim();
    if (!key || key === '••••••••') { mostrarNotificacion('⚠ Ingresa una API Key válida'); return; }
    _pexelsKey = key;
    localStorage.setItem('pexels_api_key', key);
    mostrarNotificacion('✓ Pexels key guardada');
    _renderizarPanelKey();
    if (_imgUltimaQuery) _ejecutarBusqueda(_imgUltimaQuery, 1);
}

function _actualizarBadgeUniverso() {
    const badge = document.getElementById('img-universe-label');
    if (!badge) return;
    const univ = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '—';
    if (badge.textContent !== univ) badge.textContent = univ;
}


// ═══════════════════════════════════════════════════════════════
// INTEGRACIÓN CON VIDEO.JS — SISTEMA DE IMÁGENES POR FRASES
//
// ── Pixabay ──────────────────────────────────────────────────
//   Al activar el proveedor se descargan hasta 200 imágenes en
//   un pool local (_pixabayPoolShared).  Durante la reproducción
//   se cicla el pool cada IMAGE_CHANGE_EVERY frases: 0 requests
//   adicionales después de la carga inicial.
//
// ── Pexels / Puter / Pollinations (APIs con IA) ───────────────
//   1 request por cada IMAGE_CHANGE_EVERY frases leídas.
//
// ── Picsum ────────────────────────────────────────────────────
//   URLs directas generadas localmente, sin requests.
// ═══════════════════════════════════════════════════════════════

// ─── Frecuencia de cambio de imagen por proveedor (frases entre cada cambio) ───
// Cada proveedor tiene su propio valor porque tienen costos distintos:
//   - Pixabay/Unsplash: pool local, cambio frecuente no cuesta requests extra
//   - Pexels/Openverse: 1 request por cambio, frecuencia más conservadora
const IMAGE_CHANGE_DEFAULTS = {
    pixabay: 10,
    pexels: 20,
    unsplash: 10,
    openverse: 15,
    picsum: 8,
};

function _getChangeEvery(proveedor) {
    const key = `img_change_every_${proveedor}`;
    const saved = parseInt(localStorage.getItem(key), 10);
    return (!isNaN(saved) && saved >= 1) ? saved : (IMAGE_CHANGE_DEFAULTS[proveedor] || 20);
}

function _setChangeEvery(proveedor, valor) {
    const v = Math.max(1, parseInt(valor, 10) || IMAGE_CHANGE_DEFAULTS[proveedor] || 20);
    localStorage.setItem(`img_change_every_${proveedor}`, v);
    console.log(`[img] ⚙ Frecuencia "${proveedor}" → cada ${v} frases`);
    return v;
}

// Llamada desde el input del panel al hacer blur o presionar Enter
function guardarFrecuenciaImagen(proveedor, inputEl) {
    const v = _setChangeEvery(proveedor, inputEl.value);
    inputEl.value = v;
    if (_imageProvider === proveedor) IMAGE_CHANGE_EVERY = v;
    mostrarNotificacion(`✓ ${proveedor}: cada ${v} frases`);
}

// Valor activo — se recalcula al cambiar proveedor
let IMAGE_CHANGE_EVERY = _getChangeEvery(_imageProvider);

// ─── Estado general ───
let _imgSentenceLastChange = -IMAGE_CHANGE_EVERY;  // forzar primer cambio en frase 0
let _imgUrlActual = '';                            // URL actualmente en pantalla
const _imgSlotCache = {};                          // slot → url  (para video.js)

// ─── Pool Pixabay (descarga única de hasta 200 imágenes) ───
let _pixabayPoolShared = [];      // array de URLs largeImageURL
let _pixabayPoolIdx = 0;       // cursor de rotación
let _pixabayPoolCargando = false; // semáforo: solo 1 carga simultánea
let _pixabayPoolListo = false;   // true una vez que el pool está listo

// ─── Semáforo para Pexels (1 request a la vez) ───
let _imgRequestActivo = false;

// ─── Pool Picsum (200 URLs pre-generadas, sin requests) ───
const PICSUM_POOL_SIZE = 200;
let _picsumPool = [];
let _picsumPoolIdx = 0;

function _inicializarPoolPicsum() {
    if (_picsumPool.length > 0) return;
    // Generar 200 seeds únicos mezclados
    const seeds = Array.from({ length: PICSUM_POOL_SIZE }, (_, i) => i + 1);
    // Fisher-Yates shuffle con seed fijo por sesión para variedad
    const rng = (() => { let s = Date.now() % 9999; return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; }; })();
    for (let i = seeds.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
    }
    _picsumPool = seeds.map(s => `https://picsum.photos/seed/${s}/1920/1080`);
    _picsumPoolIdx = 0;
    console.log(`[img] ✓ Picsum pool listo · ${_picsumPool.length} imágenes pre-generadas`);
}

function _siguienteUrlPicsum() {
    if (_picsumPool.length === 0) _inicializarPoolPicsum();
    const url = _picsumPool[_picsumPoolIdx % _picsumPool.length];
    _picsumPoolIdx++;
    return url;
}

// ═══════════════════════════════════════════════════════════════
// EXTRACCIÓN DE KEYWORDS DESDE PROMPT VISUAL
//
// Toma el prompt de Claude/Pollinations (~80 palabras en inglés),
// filtra stopwords y forma 5 grupos de 3 palabras → 5 queries.
// ═══════════════════════════════════════════════════════════════

const _STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'shall', 'can', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either',
    'neither', 'one', 'two', 'three', 'its', 'it', 'this', 'that', 'these', 'those',
    'their', 'there', 'they', 'he', 'she', 'we', 'you', 'i', 'my', 'his', 'her', 'our',
    'your', 'all', 'each', 'every', 'some', 'any', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
    'then', 'than', 'too', 'very', 'just', 'about', 'up', 'down', 'end', 'style',
    'photorealistic', 'cinematic', 'prompt', 'image', 'generation', 'scene',
    'background', 'foreground', 'silhouette', 'distant', 'figure', 'tiny'
]);

function _extraerGruposDePrompt(prompt) {
    // 1. Tokenizar y filtrar stopwords
    const palabras = prompt
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !_STOPWORDS.has(w));

    // 2. Deduplicar manteniendo orden
    const vistas = new Set();
    const unicas = palabras.filter(w => {
        if (vistas.has(w)) return false;
        vistas.add(w);
        return true;
    });

    // 3. Si hay menos de 15 palabras, rellenar con queries del universo
    const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? aiDetectedUniverse : '_default';
    const fallbackWords = (UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default)
        .join(' ').split(' ').filter(w => w.length > 2 && !_STOPWORDS.has(w));

    const pool = [...unicas];
    while (pool.length < 15) pool.push(...fallbackWords);

    // 4. Formar 5 grupos de 3 palabras
    const grupos = [];
    for (let i = 0; i < 5; i++) {
        grupos.push(pool.slice(i * 3, i * 3 + 3).join(' '));
    }
    return grupos;
}

// ═══════════════════════════════════════════════════════════════
// CARGA DEL POOL PIXABAY
//
// Recibe el prompt visual, lo divide en 5 grupos de 3 palabras y
// hace 1 request por grupo con _buscarSinPersonas
// (category=backgrounds, sin personas). ~40 imgs × 5 = ~200 total.
// Permite recarga con nuevo prompt (promptVisual distinto).
// ═══════════════════════════════════════════════════════════════

async function _cargarPoolPixabay(promptVisual = '') {
    if (_pixabayPoolCargando) {
        console.log('[img] ⚠ _cargarPoolPixabay ignorada — ya hay una carga en curso');
        return;
    }
    if (!_pixabayKey) {
        console.log('[img] ⚠ _cargarPoolPixabay ignorada — no hay _pixabayKey');
        return;
    }
    console.log(`[img] 🚀 _cargarPoolPixabay iniciada · provider=${_imageProvider} · promptVisual="${(promptVisual || '').slice(0, 60)}"`);
    _pixabayPoolCargando = true;

    const statusTxt = document.getElementById('img-ia-status-txt');
    if (statusTxt) statusTxt.textContent = '⏳ Cargando pool Pixabay…';

    // Si no hay prompt todavía, usar queries del universo como base
    const basePrompt = promptVisual || (() => {
        const universo = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
            ? aiDetectedUniverse : '_default';
        return (UNIVERSE_IMAGE_QUERIES[universo] || UNIVERSE_IMAGE_QUERIES._default).join(' ');
    })();

    const grupos = _extraerGruposDePrompt(basePrompt);
    console.log(`[img] 📝 Prompt base: "${basePrompt.slice(0, 120)}"`);
    console.log('[img] 🗂 Grupos de keywords extraídos:', grupos);

    const urls = [];

    try {
        for (let i = 0; i < grupos.length; i++) {
            if (statusTxt) statusTxt.textContent = `⏳ Pixabay ${i + 1}/5…`;
            console.log(`[img] ── Grupo ${i + 1}/5: "${grupos[i]}"`);
            try {
                const data = await _buscarSinPersonas(grupos[i], 1, 40);
                const hits = data.hits || [];
                hits.forEach(h => {
                    const u = h.largeImageURL || h.webformatURL;
                    if (u) urls.push(u);
                });
                console.log(`[img]    └─ Aceptadas al pool: ${hits.length} · Pool acumulado: ${urls.length}`);
            } catch (e) {
                console.warn(`[img]    └─ ⚠ Falló: ${e.message}`);
            }
        }

        if (urls.length === 0) {
            _pixabayPoolListo = false;
            if (statusTxt) statusTxt.textContent = '⚠ Pixabay sin resultados';
        } else {
            _pixabayPoolShared = _shuffleArray(urls);
            _pixabayPoolIdx = 0;
            _pixabayPoolListo = true;
            console.log(`[img] Pool Pixabay listo · ${_pixabayPoolShared.length} imágenes`);
            if (statusTxt) statusTxt.textContent = `✓ Pixabay · ${_pixabayPoolShared.length} imgs`;
        }
    } finally {
        _pixabayPoolCargando = false;
    }
}

function _shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Obtiene la siguiente URL del pool Pixabay (cicla infinitamente)
function _siguienteUrlPixabay() {
    if (_pixabayPoolShared.length === 0) return null;
    const idx = _pixabayPoolIdx % _pixabayPoolShared.length;
    const url = _pixabayPoolShared[idx];
    _pixabayPoolIdx++;
    console.log(`[img] 🖼 Pool[${idx}/${_pixabayPoolShared.length}] → ${url.slice(0, 80)}…`);
    return url;
}

// ═══════════════════════════════════════════════════════════════
// OBTENER IMAGEN — según proveedor activo
//   · Pixabay  → ciclar pool local (sin request)
//   · Pexels   → 1 request a la API
//   · Picsum   → URL directa local (sin request)
// ═══════════════════════════════════════════════════════════════

async function _pedirImagen(fragmentoTexto) {
    const statusTxt = document.getElementById('img-ia-status-txt');

    // ── Pixabay: solo leer del pool ──────────────────────────────
    if (_imageProvider === 'pixabay' && _pixabayKey) {
        if (!_pixabayPoolListo) {
            if (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse) {
                console.log('[img] ⏳ Pool Pixabay no listo aún — iniciando carga con universo:', aiDetectedUniverse);
                _cargarPoolPixabay();
            } else {
                console.log('[img] ⏳ Pool Pixabay sin universo aún — usando Picsum transitorio');
            }
            return _siguienteUrlPicsum();
        }
        const url = _siguienteUrlPixabay();
        if (url) {
            _imgUrlActual = url;
            const idx = _pixabayPoolIdx;
            const total = _pixabayPoolShared.length;
            console.log(`[img] 🖼 Pixabay pool · imagen ${idx}/${total} · ${url.slice(0, 80)}`);
            if (statusTxt) statusTxt.textContent = `✓ Pixabay pool (${idx}/${total})`;
            return url;
        }
    }

    // ── Pexels: 1 request por turno ─────────────────────────────
    if (_imageProvider === 'pexels' && _pexelsKey) {
        if (!aiDetectedUniverse) {
            console.log('[img] ⏳ Pexels sin universo aún — usando Picsum transitorio');
            return _siguienteUrlPicsum();
        }
        if (_imgRequestActivo) return _imgUrlActual || null;
        _imgRequestActivo = true;

        const universo = aiDetectedUniverse;
        const query = (typeof construirQueryImagen === 'function')
            ? construirQueryImagen(universo, fragmentoTexto)
            : 'landscape nature';

        if (statusTxt) statusTxt.textContent = `⏳ Pexels…`;
        try {
            const page = Math.ceil(Math.random() * 10);
            const data = await buscarImagenesPexels(query, page, 1);
            const url = data.hits?.[0]?.urlFull || data.hits?.[0]?.urlSmall || null;
            if (url) {
                _imgUrlActual = url;
                if (statusTxt) statusTxt.textContent = `✓ Pexels`;
                console.log(`[img] Pexels · query="${query}"`);
            }
            return url;
        } catch (e) {
            console.warn('[img] Pexels request falló:', e.message);
            return _imgUrlActual || null;
        } finally {
            _imgRequestActivo = false;
        }
    }

    // ── Unsplash: ciclar pool local ──────────────────────────────
    if (_imageProvider === 'unsplash' && _unsplashKey) {
        if (!_unsplashPoolListo && !_unsplashPoolCargando) {
            if (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse) {
                console.log('[img] 🔄 Unsplash pool vacío — iniciando carga con universo:', aiDetectedUniverse);
                _cargarPoolUnsplash();
            } else {
                console.log('[img] ⏳ Unsplash sin universo aún — usando Picsum transitorio');
                return _siguienteUrlPicsum();
            }
        }
        if (_unsplashPoolListo) {
            const url = _siguienteUrlUnsplash();
            if (url) {
                _imgUrlActual = url;
                const idx = _unsplashPoolIdx;
                const total = _unsplashPool.length;
                if (statusTxt) statusTxt.textContent = `✓ Unsplash (${idx}/${total})`;
                console.log(`[img] 🖼 Unsplash pool · imagen ${idx}/${total}`);
                return url;
            }
        }
        // Pool aún no listo — usar Picsum transitorio
        return _siguienteUrlPicsum();
    }

    // ── Openverse: ciclar pool local (sin key, CC) ───────────────
    if (_imageProvider === 'openverse') {
        if (!_openversePoolListo && !_openversePoolCargando) {
            if (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse) {
                console.log('[img] 🔄 Openverse pool vacío — iniciando carga con universo:', aiDetectedUniverse);
                _cargarPoolOpenverse();
            } else {
                console.log('[img] ⏳ Openverse pool vacío pero sin universo aún — usando Picsum transitorio');
                return _siguienteUrlPicsum();
            }
        }
        if (_openversePoolListo) {
            const url = _siguienteUrlOpenverse();
            if (url) {
                _imgUrlActual = url;
                if (statusTxt) statusTxt.textContent = `✓ Openverse (${_openversePoolIdx}/${_openversePool.length})`;
                console.log(`[img] 🖼 Openverse pool · imagen ${_openversePoolIdx}/${_openversePool.length}`);
                return url;
            }
        }
        return _siguienteUrlPicsum();
    }

    // ── Picsum: ciclar pool local (sin requests) ─────────────────
    const url = _siguienteUrlPicsum();
    _imgUrlActual = url;
    if (statusTxt) statusTxt.textContent = `✓ Picsum pool (${_picsumPoolIdx}/${_picsumPool.length})`;
    console.log(`[img] 🖼 Picsum pool · imagen ${_picsumPoolIdx}/${_picsumPool.length} · seed=${url.match(/seed\/(\w+)/)?.[1]}`);
    return url;
}

// ═══════════════════════════════════════════════════════════════
// HOOK PRINCIPAL — llamado desde tts.js en cada frase
// ═══════════════════════════════════════════════════════════════

async function smartRotCheck(sentenceIndex) {
    if (sentenceIndex - _imgSentenceLastChange < IMAGE_CHANGE_EVERY) return;
    _imgSentenceLastChange = sentenceIndex;

    // Diagnóstico completo antes de decidir
    const _dbgKey = _pixabayKey ? `"${_pixabayKey.slice(0, 6)}..."` : 'VACÍA';
    console.log(`[img] ⏱ smartRotCheck · frase ${sentenceIndex} · provider=${_imageProvider} · key=${_dbgKey} · poolListo=${_pixabayPoolListo} · poolSize=${_pixabayPoolShared.length} · cargando=${_pixabayPoolCargando}`);

    // Si Pixabay está activo pero el pool está vacío, forzar carga solo si hay universo
    if (_imageProvider === 'pixabay' && _pixabayKey && !_pixabayPoolListo && !_pixabayPoolCargando) {
        if (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse) {
            console.log(`[img] 🔄 pool vacío — iniciando _cargarPoolPixabay() · universo: ${aiDetectedUniverse}`);
            _cargarPoolPixabay();
        } else {
            console.log(`[img] ⏳ pool vacío pero sin universo — esperando detección`);
        }
    } else if (_imageProvider === 'pixabay' && !_pixabayKey) {
        console.warn(`[img] ❌ Pixabay seleccionado pero _pixabayKey está vacía — ¿guardaste la API key?`);
    }

    const desde = Math.max(0, sentenceIndex - 2);
    const hasta = Math.min((typeof sentences !== 'undefined' ? sentences.length : 0) - 1, sentenceIndex + 5);
    const frag = (typeof sentences !== 'undefined') ? sentences.slice(desde, hasta + 1).join(' ') : '';

    const url = await _pedirImagen(frag);
    if (url) _aplicarUrlImagen(url);
}

// ═══════════════════════════════════════════════════════════════
// ENTRY POINT PARA video.js  (solicitarImagenParaSlot)
// ═══════════════════════════════════════════════════════════════

async function buscarYAplicarFondoPixabay(slot, fragmentoTexto) {
    if (_imgSlotCache[slot]) {
        mostrarImagenEnPanel(slot, _imgSlotCache[slot]);
        return;
    }
    if (_imgUrlActual) {
        _imgSlotCache[slot] = _imgUrlActual;
        mostrarImagenEnPanel(slot, _imgUrlActual);
        return;
    }
    const url = await _pedirImagen(fragmentoTexto);
    if (url) {
        _imgSlotCache[slot] = url;
        mostrarImagenEnPanel(slot, url);
    }
}

// ═══════════════════════════════════════════════════════════════
// PRECALENTAR — llamado desde video.js al abrir el modo video
// Para Pixabay: dispara la carga del pool (async, no bloquea).
// Para otros proveedores: reinicia el contador de frases.
// ═══════════════════════════════════════════════════════════════

function precalentarPoolPixabay() {
    _imgSentenceLastChange = -IMAGE_CHANGE_EVERY;
    console.log(`[img] precalentarPoolPixabay · provider=${_imageProvider} · poolListo=${_pixabayPoolListo} · poolSize=${_pixabayPoolShared.length}`);
    if (_imageProvider === 'pixabay' && _pixabayKey && !_pixabayPoolListo) {
        _cargarPoolPixabay();
    }
}

// Llamada desde video.js al obtener el prompt visual del capítulo.
// Recarga el pool del proveedor activo con las keywords del nuevo prompt.
function actualizarPoolPixabayConPrompt(promptVisual) {
    if (!promptVisual) return;

    if (_imageProvider === 'pixabay' && _pixabayKey) {
        _pixabayPoolListo = false;
        _pixabayPoolShared = [];
        _pixabayPoolIdx = 0;
        _cargarPoolPixabay(promptVisual);
    }

    if (_imageProvider === 'unsplash' && _unsplashKey) {
        _unsplashPoolListo = false;
        _unsplashPool = [];
        _unsplashPoolIdx = 0;
        _cargarPoolUnsplash(promptVisual);
    }

    // Openverse: resetear el pool para que se recargue con el universo correcto
    // (el pool inicial se cargó con _default antes de que aiDetectedUniverse estuviera disponible)
    if (_imageProvider === 'openverse') {
        console.log(`[img] 🔄 Openverse pool reseteado — universo ahora disponible: "${aiDetectedUniverse}"`);
        _openversePoolListo = false;
        _openversePool = [];
        _openversePoolIdx = 0;
        _cargarPoolOpenverse(promptVisual);
    }
}

// ═══════════════════════════════════════════════════════════════
// GENERACIÓN DE QUERIES VÍA CLAUDE API
// Cuando el universo detectado es un nombre propio (ej: "Shadow Slave webnovel")
// y no está en los diccionarios estáticos, Claude genera queries visuales Y musicales.
// Resultado cacheado en localStorage para no repetir la llamada.
// ═══════════════════════════════════════════════════════════════

async function _generarQueriesConClaude(universo) {
    const cacheKey = `img_queries__${universo.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const cachedData = JSON.parse(cached);
            const imageQueries = cachedData.imageQueries || (Array.isArray(cachedData) ? cachedData : null);
            const freesoundQueries = cachedData.freesoundQueries || null;
            if (Array.isArray(imageQueries) && imageQueries.length > 0) {
                console.log(`[img] 🤖 Claude queries (cached) para "${universo}":`, imageQueries);
                UNIVERSE_IMAGE_QUERIES[universo] = imageQueries.map(q => q + ' cinematic');
                OPENVERSE_QUERIES[universo] = imageQueries;
                if (Array.isArray(freesoundQueries) && freesoundQueries.length > 0) {
                    if (!UNIVERSE_CONFIG[universo]) UNIVERSE_CONFIG[universo] = {};
                    if (!UNIVERSE_CONFIG[universo].ambient) UNIVERSE_CONFIG[universo].ambient = {};
                    UNIVERSE_CONFIG[universo].ambient.freesoundQueries = freesoundQueries;
                    UNIVERSE_CONFIG[universo].ambient.label = universo;
                }
                return imageQueries;
            }
        } catch (e) { /* ignorar cache corrupto */ }
    }

    // Usar la misma variable global que translation.js
    const apiKey = (typeof claudeApiKey !== 'undefined' ? claudeApiKey : '')
        || localStorage.getItem('claude_api_key') || '';
    if (!apiKey) {
        console.warn(`[img] ⚠ Claude API key no disponible — no se pueden generar queries para "${universo}"`);
        return null;
    }

    console.log(`[img] 🤖 Generando queries visuales con Claude para universo: "${universo}"…`);

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{
                    role: 'user',
                    content: `You are an expert in fiction and ambient aesthetics. For the fictional universe "${universo}", generate search queries that capture its MOOD and VISUAL STYLE.

Respond ONLY with a valid JSON object (no markdown, no explanation):
{
  "imageQueries": ["query1", "query2", "query3", "query4", "query5", "query6"],
  "freesoundQueries": ["ambient music query1", "ambient music query2", "ambient music query3", "ambient music query4"]
}

Rules for imageQueries (Openverse/Pixabay — 1-3 words each):
- Environments, landscapes, atmosphere — no character names or proper nouns
- Short noun phrases: "dark forest", "ancient ruins", "storm sky"

Rules for freesoundQueries (Freesound — 3-5 words each):
- Ambient/atmospheric music that fits the universe mood
- Examples: "dark eldritch ambient drone", "epic fantasy orchestral", "horror tension music"`
                }]
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error('No JSON object in response');
        const parsed = JSON.parse(match[0]);
        const imageQueries = parsed.imageQueries;
        const freesoundQueries = parsed.freesoundQueries;
        if (!Array.isArray(imageQueries) || imageQueries.length === 0) throw new Error('Empty imageQueries');

        console.log(`[img] 🤖 Claude image queries para "${universo}":`, imageQueries);
        console.log(`[img] 🤖 Claude freesound queries para "${universo}":`, freesoundQueries);
        localStorage.setItem(cacheKey, JSON.stringify({ imageQueries, freesoundQueries }));

        // Inyectar image queries en los diccionarios
        UNIVERSE_IMAGE_QUERIES[universo] = imageQueries.map(q => q + ' cinematic');
        OPENVERSE_QUERIES[universo] = imageQueries;

        // Inyectar freesoundQueries en UNIVERSE_CONFIG para que player.js las use
        if (Array.isArray(freesoundQueries) && freesoundQueries.length > 0) {
            if (!UNIVERSE_CONFIG[universo]) UNIVERSE_CONFIG[universo] = {};
            if (!UNIVERSE_CONFIG[universo].ambient) UNIVERSE_CONFIG[universo].ambient = {};
            UNIVERSE_CONFIG[universo].ambient.freesoundQueries = freesoundQueries;
            UNIVERSE_CONFIG[universo].ambient.label = universo;
            console.log(`[img] 🎵 freesoundQueries inyectadas en UNIVERSE_CONFIG["${universo}"]`);
        }

        return imageQueries;
    } catch (e) {
        console.warn(`[img] ⚠ Claude query generation falló:`, e.message);
        return null;
    }
}

// Llamar cuando aiDetectedUniverse cambia — permite recargar el pool.
// Es async para esperar a que Claude genere las queries ANTES de cargar los pools.
async function notificarUniversoDetectado(universo) {
    if (!universo) return;
    console.log(`[img] 🌍 Universo detectado: "${universo}" — recargando pool del proveedor activo`);

    // Si el universo no está en los diccionarios estáticos, pedir queries a Claude
    const esUniversoConocido = universo in OPENVERSE_QUERIES || universo in UNIVERSE_IMAGE_QUERIES;
    if (!esUniversoConocido) {
        const queries = await _generarQueriesConClaude(universo);
        if (queries) {
            mostrarNotificacion(`🤖 Queries generadas para "${universo}"`);
        } else {
            // Sin API key o error: fallback por keywords del nombre
            const nombreLower = universo.toLowerCase();
            let generoFallback = '_default';
            if (/shadow|dark|nightmare|horror|eldritch|demon|curse/.test(nombreLower)) generoFallback = 'horror';
            else if (/slave|war|battle|warrior|sword|knight/.test(nombreLower)) generoFallback = 'fantasy_epic';
            else if (/cultivat|xianxia|wuxia|immortal|dao/.test(nombreLower)) generoFallback = 'cultivation';
            else if (/space|star|galaxy|cyber|sci/.test(nombreLower)) generoFallback = 'sci_fi';
            else if (/romance|love|heart/.test(nombreLower)) generoFallback = 'romance';
            else if (/adventure|quest|journey/.test(nombreLower)) generoFallback = 'adventure';
            OPENVERSE_QUERIES[universo] = OPENVERSE_QUERIES[generoFallback];
            UNIVERSE_IMAGE_QUERIES[universo] = UNIVERSE_IMAGE_QUERIES[generoFallback];
            console.log(`[img] 🔀 Universo "${universo}" → fallback a género "${generoFallback}"`);
        }
    }

    // Ahora que las queries están listas, cargar los pools
    if (_imageProvider === 'pixabay' && _pixabayKey) {
        _pixabayPoolListo = false;
        _pixabayPoolShared = [];
        _pixabayPoolIdx = 0;
        _cargarPoolPixabay();
    }
    if (_imageProvider === 'openverse') {
        _openversePoolListo = false;
        _openversePool = [];
        _openversePoolIdx = 0;
        _openverseLastFailTs = 0; // resetear cooldown al cambiar de universo
        _cargarPoolOpenverse();
    }
    if (_imageProvider === 'unsplash' && _unsplashKey) {
        _unsplashPoolListo = false;
        _unsplashPool = [];
        _unsplashPoolIdx = 0;
        _cargarPoolUnsplash();
    }

    // Reconstruir smart pool y precalentar Pixabay
    if (typeof refrescarSmartPool === 'function') refrescarSmartPool();
    if (typeof precalentarPoolPixabay === 'function') precalentarPoolPixabay();

    // ── Música: ahora que UNIVERSE_CONFIG tiene las freesoundQueries listas ──
    const univConfig = UNIVERSE_CONFIG[universo];
    const ambientCfg = univConfig?.ambient;
    if (ambientCfg && typeof selectGenre === 'function') {
        const genre = ambientCfg.defaultGenre || 'mystery';
        const label = ambientCfg.label || universo;
        if (!ambientGenre) {
            const ck = `__universe__${universo}`;
            if (typeof _lastFreesoundResults !== 'undefined') delete _lastFreesoundResults[ck];
            selectGenre(genre).then(() => {
                const trackGenreEl = document.getElementById('ambient-track-genre');
                if (trackGenreEl) trackGenreEl.textContent = `${label} · auto`;
            });
            console.log(`🎵 [img] Música iniciada para universo "${universo}"`);
        } else {
            // Ya hay género — invalidar cache para que la próxima pista use las nuevas queries
            const ck = `__universe__${universo}`;
            if (typeof _lastFreesoundResults !== 'undefined') delete _lastFreesoundResults[ck];
            console.log(`🎵 [img] Cache Freesound invalidado — próxima pista usará queries de "${universo}"`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// LIMPIAR al cambiar de capítulo
// ═══════════════════════════════════════════════════════════════

function limpiarCachePixabaySlots() {
    Object.keys(_imgSlotCache).forEach(k => delete _imgSlotCache[k]);
    _imgUrlActual = '';
    _imgSentenceLastChange = -IMAGE_CHANGE_EVERY;
    // No resetear el pool Pixabay: sigue siendo válido entre capítulos
}

// ═══════════════════════════════════════════════════════════════
// GUARDAR KEYS — accesible desde el panel de video
// ═══════════════════════════════════════════════════════════════

function guardarUnsplashKey() {
    const input = document.getElementById('unsplash-key-input');
    const key = input?.value?.trim();
    if (!key) { if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⚠ Ingresa una Access Key de Unsplash'); return; }
    _unsplashKey = key;
    localStorage.setItem('unsplash_api_key', key);
    const status = document.getElementById('unsplash-key-status');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✓ Unsplash key guardada');
    // Disparar carga del pool inmediatamente
    _unsplashPoolListo = false;
    _unsplashPool = [];
    _cargarPoolUnsplash();
}

function guardarPixabayKeyVideo() {
    const input = document.getElementById('pixabay-key-input-video');
    const key = input?.value?.trim();
    if (!key) { if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⚠ Ingresa una API Key'); return; }
    _pixabayKey = key;
    localStorage.setItem('pixabay_api_key', key);
    const status = document.getElementById('pixabay-key-status-video');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✓ Pixabay key guardada');
    // Forzar recarga del pool con la nueva key
    _pixabayPoolListo = false;
    _pixabayPoolShared = [];
    _cargarPoolPixabay();
}

// ═══════════════════════════════════════════════════════════════
// API PÚBLICA para tts.js
// ═══════════════════════════════════════════════════════════════

let _smartRotActive = false;

function iniciarSmartRot() {
    _smartRotActive = true;
    _imgSentenceLastChange = -IMAGE_CHANGE_EVERY;
    // Asegurar que el pool Pixabay esté cargado
    if (_imageProvider === 'pixabay' && _pixabayKey && !_pixabayPoolListo) {
        _cargarPoolPixabay();
    }
}

function detenerSmartRot() {
    _smartRotActive = false;
}

// ═══════════════════════════════════════════════════════════════
// READER BACKGROUND (modo lectura, sin video)
// ═══════════════════════════════════════════════════════════════

let _readerBgEnabled = false;

function toggleReaderBg(enabled) {
    _readerBgEnabled = enabled;
    if (!enabled) { limpiarReaderBg(); return; }
    _pedirImagen('').then(url => { if (url) _aplicarUrlImagenLector(url); });
}

function _aplicarUrlImagenLector(url) {
    if (!_readerBgEnabled) return;
    const r = document.getElementById('reading-area');
    if (r) r.classList.add('has-reader-bg');
    _crossfadeLayer('reader-bg-a', 'reader-bg-b', url);
}

function _aplicarUrlImagen(url) {
    console.log(`[img] 🎬 Aplicando fondo · proveedor=${_imageProvider} · url=${url.slice(0, 80)}…`);
    const isVideo = typeof videoActive !== 'undefined' && videoActive;
    if (isVideo) {
        if (typeof mostrarImagenEnPanel === 'function' && typeof aiImagesEnabled !== 'undefined' && !aiImagesEnabled)
            mostrarImagenEnPanel(-1, url);
        else
            _crossfadeLayer('ai-bg-a', 'ai-bg-b', url);
    } else {
        _aplicarUrlImagenLector(url);
    }
}

function _crossfadeLayer(idA, idB, url) {
    const a = document.getElementById(idA), b = document.getElementById(idB);
    if (!a || !b) return;
    const aVis = parseFloat(a.style.opacity || 0) > 0.5;
    const incoming = aVis ? b : a;
    const outgoing = aVis ? a : b;
    const img = new Image();
    img.onload = img.onerror = () => {
        incoming.style.backgroundImage = `url("${url}")`;
        incoming.style.backgroundSize = 'cover';
        incoming.style.backgroundPosition = 'center';
        if (typeof _grayscaleActive !== 'undefined' && _grayscaleActive)
            incoming.style.filter = 'grayscale(1) brightness(0.82) contrast(1.12)';
        incoming.style.opacity = '1';
        outgoing.style.opacity = '0';
    };
    img.src = url;
}

function limpiarReaderBg() {
    ['reader-bg-a', 'reader-bg-b'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = '0';
    });
    const r = document.getElementById('reading-area');
    if (r) r.classList.remove('has-reader-bg');
}