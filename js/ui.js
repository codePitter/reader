// ── Colapsable genérico para sub-paneles ──
function toggleSubPanel(bodyId, arrowId) {
    const body = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    if (!body) return;
    const open = body.style.display === 'none' || body.style.display === '';
    body.style.display = open ? 'block' : 'none';
    if (arrow) arrow.textContent = open ? '▼' : '▶';
}

// ═══════════════════════════════════════
// UI — Editor, reemplazos, modales, helpers de DOM
// Depende de: main.js (mostrarNotificacion, actualizarEstadisticas, reemplazosAutomaticos)
//             translation.js (aplicarReemplazosAutomaticos, renderizarTextoEnContenedor,
//                             traducirTexto, TRANSLATION_TARGET_LANG, _capCache)
// Carga ÚLTIMO — parchea y extiende lo definido por los demás módulos
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// REEMPLAZOS — CLAVE POR ARCHIVO
// Los reemplazos se guardan en localStorage bajo una clave derivada del nombre
// del EPUB cargado, de modo que cada libro tiene su propio diccionario.
// ═══════════════════════════════════════

function _getReemplazosKey() {
    if (!_epubFilename) return 'reemplazos__sin_archivo';
    const safe = _epubFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `reemplazos__${safe}`;
}

// Llamado desde epub.js al cargar un nuevo archivo
function cargarReemplazosParaArchivo(filename) {
    Object.keys(reemplazosAutomaticos).forEach(k => delete reemplazosAutomaticos[k]);
    const rawKey = `reemplazos__${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const guardados = JSON.parse(uGet(rawKey) || '{}');
    Object.assign(reemplazosAutomaticos, guardados);
    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
    _actualizarContextoReemplazos();
}

function _persistirReemplazos() {
    uSet(_getReemplazosKey(), JSON.stringify(reemplazosAutomaticos));
}

function _actualizarContextoReemplazos() {
    const el = document.getElementById('ajustes-archivo-activo');
    if (!el) return;
    if (_epubFilename) {
        el.textContent = `📖 ${_epubFilename}`;
        el.style.color = 'var(--accent2)';
    } else {
        el.textContent = 'Sin archivo cargado — los reemplazos no se guardarán';
        el.style.color = 'var(--text-dim)';
    }
}

// ======================
// EDITOR DE TEXTO
// ======================

async function aplicarTexto() {
    const textoEditor = document.getElementById('editor-texto').value;
    if (!textoEditor.trim()) {
        alert('El editor está vacío');
        return;
    }
    const textoFinal = aplicarReemplazosAutomaticos(textoEditor);
    renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoFinal);
    actualizarEstadisticas();
    mostrarNotificacion('✓ Texto aplicado correctamente');
}

function limpiarEditor() {
    document.getElementById('editor-texto').value = '';
}

function copiarTexto() {
    const texto = document.getElementById('texto-contenido').textContent;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✓ Texto copiado al portapapeles');
    });
}

function toggleEditor() {
    const panel = document.getElementById('editor-panel');
    const btn = document.getElementById('editor-toggle-btn');
    if (!panel) return;
    const visible = panel.style.display !== 'none' && panel.style.display !== '';
    panel.style.display = visible ? 'none' : 'block';
    if (btn) btn.classList.toggle('active', !visible);
}

// ======================
// REEMPLAZOS
// ======================

function reemplazarPalabra() {
    // Leer desde los inputs del modal Ajustes (con fallback a los del sidebar por compatibilidad)
    const buscar = (document.getElementById('ajustes-buscar')?.value ||
        document.getElementById('palabra-buscar')?.value || '').trim();
    const reemplazar = (document.getElementById('ajustes-reemplazar')?.value ||
        document.getElementById('palabra-reemplazar')?.value || '').trim();

    if (!buscar) {
        mostrarNotificacion('⚠ Ingresa una palabra para buscar');
        return;
    }

    const elemento = document.getElementById('texto-contenido');
    let regex;
    try {
        const buscarEscapado = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(buscarEscapado, 'gi');
    } catch (e) {
        regex = new RegExp(buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }

    const textoOriginal = elemento.textContent;
    const ocurrencias = (textoOriginal.match(regex) || []).length;

    if (ocurrencias === 0) {
        mostrarNotificacion(`⚠ No se encontró "${buscar}"`);
        return;
    }

    elemento.textContent = textoOriginal.replace(regex, (match) => {
        if (!reemplazar) return '';
        if (match.charAt(0) === match.charAt(0).toUpperCase() &&
            match.charAt(0) !== match.charAt(0).toLowerCase())
            return reemplazar.charAt(0).toUpperCase() + reemplazar.slice(1);
        if (match === match.toUpperCase()) return reemplazar.toUpperCase();
        return reemplazar;
    });

    actualizarEstadisticas();
    mostrarNotificacion(`✓ ${ocurrencias} ocurrencia(s) reemplazada(s)`);

    // Persistir con clave escopada por archivo
    reemplazosAutomaticos[buscar] = reemplazar;
    _persistirReemplazos();

    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);

    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();

    // Limpiar inputs (ambos si existen)
    ['ajustes-buscar', 'ajustes-reemplazar', 'palabra-buscar', 'palabra-reemplazar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function limpiarReemplazosGuardados() {
    const count = Object.keys(reemplazosAutomaticos).length;
    const libro = _epubFilename || 'este libro';
    if (!confirm(`⚠ ¿Eliminar los ${count} reemplazo(s) guardados para:\n"${libro}"?\n\nEsta acción no se puede deshacer.`)) return;
    Object.keys(reemplazosAutomaticos).forEach(k => delete reemplazosAutomaticos[k]);
    uRemove(_getReemplazosKey());
    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
    mostrarNotificacion('✓ Reemplazos del libro eliminados');
}

function actualizarBotonLimpiarReemplazos() {
    const btn = document.getElementById('btn-limpiar-reemplazos');
    if (!btn) return;
    const count = Object.keys(reemplazosAutomaticos).length;
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `🗑 Limpiar todo (${count})` : '🗑 Limpiar todo';
}

// Renderiza la lista de pares activos en el panel del modal Ajustes
function renderListaReemplazos() {
    const lista = document.getElementById('ajustes-lista-reemplazos') ||
        document.getElementById('reemplazos-guardados-lista');
    if (!lista) return;
    const pares = Object.entries(reemplazosAutomaticos);
    if (pares.length === 0) {
        lista.innerHTML = '<div style="font-size:0.62rem;color:var(--text-dim);padding:8px 0;text-align:center;">Sin reemplazos para este libro</div>';
        return;
    }
    lista.innerHTML = pares.map(([b, r]) =>
        `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.68rem;">
            <span style="color:var(--accent2);font-family:'DM Mono',monospace;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(b)}</span>
            <span style="color:var(--text-dim);flex-shrink:0;">→</span>
            <span style="font-family:'DM Mono',monospace;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(r) || '<em style="color:var(--text-dim)">vacío</em>'}</span>
            <button onclick="eliminarReemplazo('${escapeHTML(b)}')" title="Eliminar"
                style="margin-left:4px;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.7rem;padding:0 3px;flex-shrink:0;transition:color 0.2s;"
                onmouseover="this.style.color='#ff6b6b'"
                onmouseout="this.style.color='var(--text-dim)'">✕</button>
        </div>`
    ).join('');
}

function eliminarReemplazo(buscar) {
    delete reemplazosAutomaticos[buscar];
    _persistirReemplazos();
    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
}

// Toggle del panel de reemplazos en sidebar
function toggleReemplazar() {
    const body = document.getElementById('reemplazar-body');
    const arrow = document.getElementById('reemplazar-arrow');
    if (!body) return;
    const visible = body.style.display !== 'none' && body.style.display !== '';
    body.style.display = visible ? 'none' : 'block';
    if (arrow) arrow.textContent = visible ? '▶' : '▼';
}

// Tecla Enter en cualquier input de reemplazo
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const id = document.activeElement?.id;
            if (id === 'ajustes-reemplazar' || id === 'palabra-reemplazar') reemplazarPalabra();
        }
    });
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
});

// ======================
// MODAL REEMPLAZOS
// ======================

function abrirModalReemplazos() {
    // Redirigir al modal de Ajustes en la solapa Reemplazar
    abrirAjustes('reemplazar');
}

function cerrarModalReemplazos() {
    const modal = document.getElementById('modal-reemplazos');
    if (modal) modal.style.display = 'none';
}

function renderModalReemplazos() {
    const body = document.getElementById('modal-reemplazos-body');
    if (!body) return;
    const pares = Object.entries(reemplazosAutomaticos);
    if (pares.length === 0) {
        body.innerHTML = '<div class="modal-empty">No hay reemplazos guardados.</div>';
        return;
    }
    body.innerHTML = pares.map(([b, r]) =>
        `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
            <span style="color:var(--accent2);font-family:'DM Mono',monospace;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(b)}</span>
            <span style="color:var(--text-dim);">→</span>
            <span style="font-family:'DM Mono',monospace;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(r)}</span>
            <button onclick="eliminarReemplazo('${escapeHTML(b)}')" title="Eliminar este reemplazo"
                style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.75rem;padding:2px 4px;flex-shrink:0;transition:color 0.2s;"
                onmouseover="this.style.color='var(--accent)'"
                onmouseout="this.style.color='var(--text-dim)'">✕</button>
        </div>`
    ).join('');
}

// Cerrar modal al hacer clic fuera
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-reemplazos');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModalReemplazos();
        });
    }
});

// ======================
// BÚSQUEDA DE CAPÍTULOS
// ======================

function filtrarCapitulos(query) {
    const sel = document.getElementById('chapters');
    if (!sel) return;
    const q = query.toLowerCase().trim();
    Array.from(sel.options).forEach(opt => {
        if (!opt.value) return; // saltar opciones deshabilitadas
        opt.style.display = (!q || opt.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
}

// ======================
// SELECTOR DE IDIOMA DE TRADUCCIÓN
// ======================

// Mapa completo de idiomas soportados
const SUPPORTED_LANGS = {
    es: 'Español', en: 'English', pt: 'Português', fr: 'Français',
    de: 'Deutsch', it: 'Italiano', ja: '日本語', ko: '한국어',
    zh: '中文', ru: 'Русский', ar: 'العربية', pl: 'Polski',
    nl: 'Nederlands', sv: 'Svenska', tr: 'Türkçe', uk: 'Українська',
    hi: 'हिन्दी', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia'
};

function poblarSelectorIdioma() {
    const sel = document.getElementById('translation-lang-select');
    if (!sel) return;
    sel.innerHTML = '';
    Object.entries(SUPPORTED_LANGS).forEach(([code, name]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = `${name} (${code})`;
        if (code === (typeof TRANSLATION_TARGET_LANG !== 'undefined' ? TRANSLATION_TARGET_LANG : 'es')) {
            opt.selected = true;
        }
        sel.appendChild(opt);
    });
}

function cambiarIdiomaTraduccion(langCode) {
    // Sobrescribir la constante en translation.js no es posible directamente,
    // pero podemos sobreescribir la variable que usan las funciones de traducción.
    // Se usa window para hacerla accesible globalmente.
    window._traduccionLangOverride = langCode;
    // Reflejar en la constante exportada si es posible (TRANSLATION_TARGET_LANG es const,
    // así que parcheamos a través de las funciones que la consumen)
    mostrarNotificacion(`✓ Idioma destino: ${SUPPORTED_LANGS[langCode] || langCode}`);
    marcarCambioPendiente();
}

document.addEventListener('DOMContentLoaded', () => {
    poblarSelectorIdioma();
});

// ======================
// TOGGLE PANEL IMÁGENES IA
// ======================

function toggleImagenIAPanel() {
    const body = document.getElementById('imagen-ia-body');
    const arrow = document.getElementById('img-ia-arrow');
    if (!body) return;
    const visible = body.style.display !== 'none' && body.style.display !== '';
    body.style.display = visible ? 'none' : 'block';
    if (arrow) arrow.textContent = visible ? '▶' : '▼';
}

// ======================
// PROGRESS BAR SEEK (barra principal)
// ======================

function seekTTS(event) {
    if (typeof sentences === 'undefined' || sentences.length === 0) return;
    const track = document.getElementById('main-progress-track');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetIndex = Math.floor(pct * sentences.length);

    // Detener reproducción actual y saltar al índice calculado
    if (typeof isReading !== 'undefined' && isReading) {
        if (typeof servidorTTSDisponible !== 'undefined' && servidorTTSDisponible) {
            if (typeof audioActual !== 'undefined' && audioActual) {
                audioActual.pause();
                audioActual = null;
            }
        } else {
            if (typeof synth !== 'undefined') synth.cancel();
        }
        currentSentenceIndex = targetIndex;
        if (typeof servidorTTSDisponible !== 'undefined' && servidorTTSDisponible) {
            leerOracionLocal(targetIndex);
        } else {
            leerOracion(targetIndex);
        }
    }
}

function mainProgressMouseMove(event) {
    // No procesar si hay un modal de exportación abierto
    if (document.getElementById('export-modal')) return;
    if (typeof sentences === 'undefined' || sentences.length === 0) return;
    const track = document.getElementById('main-progress-track');
    const tooltip = document.getElementById('main-progress-tooltip');
    if (!track || !tooltip) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const idx = Math.floor(pct * sentences.length);
    const sentence = sentences[idx] || '';
    tooltip.classList.add('visible');
    // Clamp tooltip so it doesn't overflow left or right edge
    const tooltipHalf = 120; // approx half of max-width:240px
    const rawLeft = event.clientX - rect.left;
    const clampedLeft = Math.max(tooltipHalf, Math.min(rect.width - tooltipHalf, rawLeft));
    tooltip.style.left = `${clampedLeft}px`;
    tooltip.textContent = sentence.length > 60 ? sentence.slice(0, 57) + '…' : sentence;
}

function mainProgressMouseLeave() {
    const tooltip = document.getElementById('main-progress-tooltip');
    if (tooltip) tooltip.classList.remove('visible');
}

// ======================
// MODAL AJUSTES (☰ hamburguesa)
// ======================

let _solapaActiva = 'apikeys';

function abrirAjustes(solapa) {
    const modal = document.getElementById('modal-ajustes');
    if (!modal) return;
    modal.style.display = 'flex';
    cambiarSolapa(solapa || _solapaActiva);
    _actualizarContextoReemplazos();
    renderListaReemplazos();
    actualizarBotonLimpiarReemplazos();
    _sincronizarInputsApiKeys();
}

function cerrarAjustes() {
    const modal = document.getElementById('modal-ajustes');
    if (modal) modal.style.display = 'none';
}

function cambiarSolapa(nombre) {
    _solapaActiva = nombre;
    document.querySelectorAll('.ajustes-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === nombre);
    });
    document.querySelectorAll('.ajustes-panel').forEach(panel => {
        panel.style.display = panel.id === `ajustes-panel-${nombre}` ? 'block' : 'none';
    });
}

function _sincronizarInputsApiKeys() {

    // ── Humanizador ──
    const provEl = document.getElementById('ajustes-humanizer-provider');
    const activeProvider = (typeof humanizerProvider !== 'undefined') ? humanizerProvider : 'perplexity';
    if (provEl) provEl.value = activeProvider;

    const humKey = typeof claudeApiKey !== 'undefined' ? claudeApiKey : '';
    const humStatus = document.getElementById('ajustes-humanizer-key-status');
    if (humStatus) humStatus.textContent = humKey ? '✓ guardada' : '';

    const modoHum = document.getElementById('ajustes-humanizer-modo');
    if (modoHum) modoHum.textContent = activeProvider;

    const orNote = document.getElementById('ajustes-humanizer-or-note');
    if (orNote) orNote.style.display = activeProvider === 'openrouter' ? 'block' : 'none';

    // ── Detección de universo ──
    const univProv = uGet('universe_provider') || 'local';
    const univSel = document.getElementById('ajustes-universe-provider');
    if (univSel) univSel.value = univProv;
    const univKeyArea = document.getElementById('ajustes-universe-key-area');
    if (univKeyArea) univKeyArea.style.display = univProv === 'openrouter' ? 'block' : 'none';
    const univModo = document.getElementById('ajustes-universe-modo');
    if (univModo) univModo.textContent = univProv === 'openrouter' ? 'IA' : 'local';
    const univKeyOk = document.getElementById('ajustes-universe-key-ok');
    if (univKeyOk && univProv === 'openrouter') {
        const k = uGet('humanizer_key_openrouter') || uGet('openrouter_api_key') || '';
        univKeyOk.textContent = k ? '✓ encontrada' : '⚠ no configurada';
    }

    // ── Traducción ──
    const trProv = uGet('translation_provider') || 'google';
    const trSel = document.getElementById('ajustes-translate-provider');
    if (trSel) trSel.value = trProv;
    _toggleTranslateKeyArea(trProv);
    const trKey = uGet('deepl_api_key') || '';
    const trStatus = document.getElementById('ajustes-translate-key-status');
    if (trStatus) trStatus.textContent = trKey ? '✓ guardada' : '';
    const trModo = document.getElementById('ajustes-translate-modo');
    if (trModo) trModo.textContent = trProv;

    // ── Gramática ──
    const hasLt = !!(typeof _ltUsername !== 'undefined' && _ltUsername && typeof _ltApiKey !== 'undefined' && _ltApiKey);
    const ltProv = hasLt ? 'languagetool-premium' : 'languagetool';
    const ltSel = document.getElementById('ajustes-grammar-provider');
    if (ltSel) ltSel.value = ltProv;
    _toggleGramarPremiumArea(ltProv);
    const ltStatus = document.getElementById('ajustes-lt-status');
    if (ltStatus) ltStatus.textContent = hasLt ? '✓ guardadas' : '';
    const ltModo = document.getElementById('ajustes-lt-modo');
    if (ltModo) ltModo.textContent = hasLt ? 'premium' : 'público';

    // ── Música ──
    const musicProv = uGet('music_provider') || 'freesound';
    const musicSel = document.getElementById('ajustes-music-provider');
    if (musicSel) musicSel.value = musicProv;
    _toggleMusicKeyArea(musicProv);
    const fsKey = uGet('freesound_api_key') || uGet('freesound-api-key') || '';
    const fsStatus = document.getElementById('ajustes-freesound-status');
    if (fsStatus) fsStatus.textContent = fsKey ? '✓ guardada' : '';
    const musicModo = document.getElementById('ajustes-music-modo');
    if (musicModo) musicModo.textContent = musicProv === 'freesound' ? 'Freesound' : 'local';

    // ── Imágenes búsqueda ──
    const imgSearchProv = uGet('image_provider') || 'picsum';
    const imgSearchSel = document.getElementById('ajustes-imgsearch-provider');
    if (imgSearchSel) imgSearchSel.value = imgSearchProv;
    _toggleImgSearchKeyArea(imgSearchProv);
    const imgSearchModo = document.getElementById('ajustes-imgsearch-modo');
    if (imgSearchModo) imgSearchModo.textContent = imgSearchProv;

    // ── Imágenes IA ──
    const imgIAProv = uGet('img_provider') || 'procedural';
    const imgIASel = document.getElementById('ajustes-imgia-provider');
    if (imgIASel) imgIASel.value = imgIAProv;
    _toggleImgIAKeyArea(imgIAProv);
    const stKey = uGet('stability_api_key') || '';
    const stStatus = document.getElementById('ajustes-stability-status');
    if (stStatus) stStatus.textContent = stKey ? '✓ guardada' : '';
    const imgIAModo = document.getElementById('ajustes-imgia-modo');
    if (imgIAModo) imgIAModo.textContent = imgIAProv;
}

// ── Toggle helpers ──

function _toggleTranslateKeyArea(prov) {
    const area = document.getElementById('ajustes-translate-key-area');
    if (area) area.style.display = prov === 'deepl' ? 'block' : 'none';
}

function _toggleGramarPremiumArea(prov) {
    const area = document.getElementById('ajustes-lt-premium-area');
    const freeNota = document.getElementById('ajustes-lt-free-nota');
    if (area) area.style.display = prov === 'languagetool-premium' ? 'block' : 'none';
    if (freeNota) freeNota.style.display = prov === 'languagetool' ? 'block' : 'none';
}

function _toggleMusicKeyArea(prov) {
    const area = document.getElementById('ajustes-freesound-key-area');
    if (area) area.style.display = prov === 'freesound' ? 'block' : 'none';
}

const _IMG_SEARCH_LINKS = {
    pixabay: 'Gratis en <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com</a>',
    pexels: 'Gratis en <a href="https://www.pexels.com/api/key/" target="_blank" rel="noopener">pexels.com/api/key</a>',
    unsplash: 'Gratis en <a href="https://unsplash.com/developers" target="_blank" rel="noopener">unsplash.com/developers</a>',
};
const _IMG_SEARCH_NEEDS_KEY = new Set(['pixabay', 'pexels', 'unsplash']);

function _toggleImgSearchKeyArea(prov) {
    const area = document.getElementById('ajustes-imgsearch-key-area');
    const linkNota = document.getElementById('ajustes-imgsearch-link-nota');
    if (!area) return;
    const needsKey = _IMG_SEARCH_NEEDS_KEY.has(prov);
    area.style.display = needsKey ? 'block' : 'none';
    if (linkNota && _IMG_SEARCH_LINKS[prov]) linkNota.innerHTML = _IMG_SEARCH_LINKS[prov];
    // Update key status from localStorage
    const keyMap = { pixabay: 'pixabay_api_key', pexels: 'pexels_api_key', unsplash: 'unsplash_api_key' };
    const savedKey = keyMap[prov] ? (uGet(keyMap[prov]) || '') : '';
    const ks = document.getElementById('ajustes-imgsearch-key-status');
    if (ks) ks.textContent = savedKey ? '✓ guardada' : '';
}

function _toggleImgIAKeyArea(prov) {
    const area = document.getElementById('ajustes-imgia-key-area');
    const puterNota = document.getElementById('ajustes-imgia-puter-nota');
    if (area) area.style.display = prov === 'stability' ? 'block' : 'none';
    if (puterNota) puterNota.style.display = prov === 'puter' ? 'block' : 'none';
}

// ── Provider change handlers ──

function cambiarProveedorUniversoAjustes(prov) {
    uSet('universe_provider', prov);
    const keyArea = document.getElementById('ajustes-universe-key-area');
    if (keyArea) keyArea.style.display = prov === 'openrouter' ? 'block' : 'none';
    const modo = document.getElementById('ajustes-universe-modo');
    if (modo) modo.textContent = prov === 'openrouter' ? 'IA' : 'local';
    const ok = document.getElementById('ajustes-universe-key-ok');
    if (ok && prov === 'openrouter') {
        const k = uGet('humanizer_key_openrouter') || uGet('openrouter_api_key') || '';
        ok.textContent = k ? '✓ encontrada' : '⚠ no configurada';
    }
    mostrarNotificacion('✓ Detección de universo: ' + prov);
}

function cambiarProveedorTraduccionAjustes(prov) {
    uSet('translation_provider', prov);
    _toggleTranslateKeyArea(prov);
    const modo = document.getElementById('ajustes-translate-modo');
    if (modo) modo.textContent = prov;
    mostrarNotificacion('✓ Traducción: ' + prov);
}

function cambiarProveedorGramaticaAjustes(prov) {
    _toggleGramarPremiumArea(prov);
    const modo = document.getElementById('ajustes-lt-modo');
    if (modo) modo.textContent = prov === 'languagetool-premium' ? 'premium' : 'público';
}

function cambiarProveedorMusicaAjustes(prov) {
    uSet('music_provider', prov);
    _toggleMusicKeyArea(prov);
    const modo = document.getElementById('ajustes-music-modo');
    if (modo) modo.textContent = prov === 'freesound' ? 'Freesound' : 'local';
    // Sincronizar con player.js: si no hay key de Freesound, forzar local
    if (prov === 'local' && typeof stopAmbient === 'function') stopAmbient();
    mostrarNotificacion('✓ Música: ' + prov);
}

function cambiarProveedorImgSearchAjustes(prov) {
    _toggleImgSearchKeyArea(prov);
    const modo = document.getElementById('ajustes-imgsearch-modo');
    if (modo) modo.textContent = prov;
    // Llamar a cambiarProveedorImagenes de images.js si existe
    if (typeof cambiarProveedorImagenes === 'function') cambiarProveedorImagenes(prov);
    else uSet('image_provider', prov);
}

function cambiarProveedorImgIADesdeAjustes(prov) {
    _toggleImgIAKeyArea(prov);
    const modo = document.getElementById('ajustes-imgia-modo');
    if (modo) modo.textContent = prov;
    // Llamar a setImageProvider de video.js si existe
    if (typeof setImageProvider === 'function') setImageProvider(prov);
    else uSet('img_provider', prov);
}

// ── Save handlers ──

function guardarTranslateKeyDesdeAjustes() {
    const input = document.getElementById('ajustes-translate-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key de DeepL'); return; }
    uSet('deepl_api_key', key);
    input.value = '';
    const status = document.getElementById('ajustes-translate-key-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ DeepL key guardada');
}

function guardarImgSearchKeyDesdeAjustes() {
    const input = document.getElementById('ajustes-imgsearch-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key'); return; }
    const prov = document.getElementById('ajustes-imgsearch-provider')?.value || 'pixabay';
    const keyMap = { pixabay: 'pixabay_api_key', pexels: 'pexels_api_key', unsplash: 'unsplash_api_key' };
    if (keyMap[prov]) {
        uSet(keyMap[prov], key);
        // Actualizar variable global correspondiente
        if (prov === 'pixabay' && typeof _pixabayKey !== 'undefined') window._pixabayKey = key;
        if (prov === 'pexels' && typeof _pexelsKey !== 'undefined') window._pexelsKey = key;
        if (prov === 'unsplash' && typeof _unsplashKey !== 'undefined') window._unsplashKey = key;
    }
    input.value = '';
    const status = document.getElementById('ajustes-imgsearch-key-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ ' + prov + ' key guardada');
}

function guardarHumanizerKeyDesdeAjustes() {
    const input = document.getElementById('ajustes-humanizer-key');
    const status = document.getElementById('ajustes-humanizer-key-status');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { if (status) status.textContent = '⚠ vacía'; return; }

    // Simular flujo de translation.js: escribir en el input original y llamar a guardarClaudeApiKey
    const origInput = document.getElementById('claude-api-key');
    if (origInput) origInput.value = key;
    if (typeof guardarClaudeApiKey === 'function') guardarClaudeApiKey();
    else {
        // Fallback directo
        if (typeof claudeApiKey !== 'undefined') window.claudeApiKey = key;
        uSet('claude_api_key', key);
        if (typeof humanizerProvider !== 'undefined')
            uSet(`humanizer_key_${humanizerProvider}`, key);
    }

    input.value = '';
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ API Key guardada');
}

function cambiarProveedorHumanizerAjustes(provId) {
    // Sincronizar con el select original oculto y llamar al handler de translation.js
    const origSel = document.getElementById('humanizer-provider');
    if (origSel) { origSel.value = provId; origSel.dispatchEvent(new Event('change')); }
    else if (typeof cambiarProveedorHumanizer === 'function') cambiarProveedorHumanizer(provId);
    const savedKey = uGet(`humanizer_key_${provId}`) || '';
    const status = document.getElementById('ajustes-humanizer-key-status');
    if (status) status.textContent = savedKey ? '✓ guardada' : '';
}

function guardarLtDesdeAjustes() {
    const u = document.getElementById('ajustes-lt-username')?.value.trim() || '';
    const k = document.getElementById('ajustes-lt-apikey')?.value.trim() || '';
    // Rellenar los inputs ocultos que usa grammar.js y llamar a su función
    const origU = document.getElementById('lt-username');
    const origK = document.getElementById('lt-apikey');
    if (origU) origU.value = u;
    if (origK) origK.value = k;
    if (typeof guardarLtCredenciales === 'function') guardarLtCredenciales();
    else {
        uSet('lt_username', u);
        uSet('lt_apikey', k);
    }
    const status = document.getElementById('ajustes-lt-status');
    if (status) status.textContent = (u && k) ? '✓ guardadas' : '';
    if (document.getElementById('ajustes-lt-username')) document.getElementById('ajustes-lt-username').value = '';
    if (document.getElementById('ajustes-lt-apikey')) document.getElementById('ajustes-lt-apikey').value = '';
    mostrarNotificacion(u && k ? '✓ Cuenta LT guardada' : '✓ Credenciales LT borradas');
}

function guardarFreesoundDesdeAjustes() {
    const input = document.getElementById('ajustes-freesound-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key de Freesound'); return; }
    // Rellenar el input original oculto y llamar a guardarApiKey de player.js
    const orig = document.getElementById('freesound-api-key');
    if (orig) { orig.value = key; if (typeof guardarApiKey === 'function') guardarApiKey(); }
    else { uSet('freesound_api_key', key); mostrarNotificacion('✓ Freesound key guardada'); }
    input.value = '';
    const status = document.getElementById('ajustes-freesound-status');
    if (status) status.textContent = '✓ guardada';
}

function guardarPixabayDesdeAjustes() {
    const input = document.getElementById('ajustes-pixabay-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key de Pixabay'); return; }
    // Actualizar variable global y localStorage
    if (typeof _pixabayKey !== 'undefined') window._pixabayKey = key;
    uSet('pixabay_api_key', key);
    // Disparar recarga del pool si hay una función disponible
    if (typeof guardarPixabayKey === 'function') {
        const orig = document.getElementById('pixabay-key-input');
        if (orig) { orig.value = key; guardarPixabayKey(); }
    }
    input.value = '';
    const status = document.getElementById('ajustes-pixabay-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ Pixabay key guardada');
}

function guardarPexelsDesdeAjustes() {
    const input = document.getElementById('ajustes-pexels-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key de Pexels'); return; }
    if (typeof _pexelsKey !== 'undefined') window._pexelsKey = key;
    uSet('pexels_api_key', key);
    if (typeof guardarPexelsKey === 'function') {
        const orig = document.getElementById('pexels-key-input');
        if (orig) { orig.value = key; guardarPexelsKey(); }
    }
    input.value = '';
    const status = document.getElementById('ajustes-pexels-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ Pexels key guardada');
}

function guardarUnsplashDesdeAjustes() {
    const input = document.getElementById('ajustes-unsplash-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la Access key de Unsplash'); return; }
    if (typeof _unsplashKey !== 'undefined') window._unsplashKey = key;
    uSet('unsplash_api_key', key);
    if (typeof guardarUnsplashKey === 'function') {
        const orig = document.getElementById('unsplash-key-input');
        if (orig) { orig.value = key; guardarUnsplashKey(); }
    }
    input.value = '';
    const status = document.getElementById('ajustes-unsplash-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ Unsplash key guardada');
}

function guardarStabilityDesdeAjustes() {
    const input = document.getElementById('ajustes-stability-key');
    if (!input) return;
    const key = input.value.trim();
    if (!key) { mostrarNotificacion('⚠ Ingresa la API key de Stability AI'); return; }
    if (typeof stabilityApiKey !== 'undefined') window.stabilityApiKey = key;
    uSet('stability_api_key', key);
    // Sincronizar con el input oculto original de video.js si existe
    const orig = document.getElementById('stability-api-key');
    if (orig) { orig.value = key; if (typeof guardarStabilityKey === 'function') guardarStabilityKey(); }
    input.value = '';
    const status = document.getElementById('ajustes-stability-status');
    if (status) status.textContent = '✓ guardada';
    mostrarNotificacion('✓ Stability AI key guardada');
}

// Cerrar modal al clic fuera del contenedor
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-ajustes');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) cerrarAjustes(); });
});

// ======================
// INICIALIZACIÓN GLOBAL
// ======================

document.addEventListener('DOMContentLoaded', () => {
    actualizarEstadisticas();
    actualizarBotonLimpiarReemplazos();
    // Verificar servidor TTS al cargar
    if (typeof verificarServidorTTS === 'function') verificarServidorTTS();
});
// ── Panel "Otros libros guardados" ──────────────────────────────────────────
function togglePanelOtrosLibros() {
    const panel = document.getElementById('panel-otros-libros');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    if (visible) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    renderPanelOtrosLibros();
}

function renderPanelOtrosLibros() {
    const panel = document.getElementById('panel-otros-libros');
    if (!panel) return;
    const claveActual = uKey(_getReemplazosKey());
    const prefijo = uGetPrefix() + '_reemplazos__';
    const libros = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefijo)) continue;
        if (k === claveActual) continue;
        try {
            const pares = JSON.parse(localStorage.getItem(k) || '{}');
            const count = Object.keys(pares).length;
            // Nombre legible: quitar el prefijo de usuario y 'reemplazos__'
            const nombre = k.replace(prefijo, '').replace(/_/g, ' ');
            if (count > 0) libros.push({ clave: k, nombre, pares, count });
        } catch (e) { /* ignorar corruptos */ }
    }
    if (libros.length === 0) {
        panel.innerHTML = '<div style="font-size:0.62rem;color:var(--text-dim);padding:6px 0;text-align:center;">No hay reemplazos de otros libros guardados</div>';
        return;
    }
    panel.innerHTML = libros.map(lib => {
        const paresHTML = Object.entries(lib.pares).map(([b, r]) =>
            `<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid var(--border);font-size:0.65rem;">
                <span style="color:var(--accent2);font-family:'DM Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(b)}</span>
                <span style="color:var(--text-dim);flex-shrink:0;">→</span>
                <span style="font-family:'DM Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(r) || '<em style="color:var(--text-dim)">vacío</em>'}</span>
                <button onclick="importarReemplazo(${JSON.stringify(b)},${JSON.stringify(r)})"
                    title="Importar al libro actual"
                    style="background:var(--accent2);border:none;border-radius:3px;color:var(--bg);font-size:0.55rem;
                           padding:2px 5px;cursor:pointer;flex-shrink:0;font-family:'DM Mono',monospace;">+libro</button>
            </div>`
        ).join('');
        return `<details style="margin-bottom:8px;border:1px solid var(--border);border-radius:5px;overflow:hidden;">
            <summary style="padding:6px 10px;font-size:0.62rem;font-weight:700;cursor:pointer;
                            background:var(--bg);color:var(--text);display:flex;justify-content:space-between;align-items:center;list-style:none;">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">📖 ${escapeHTML(lib.nombre)}</span>
                <span style="color:var(--text-dim);font-weight:400;flex-shrink:0;margin-left:8px;">${lib.count} par(es)</span>
            </summary>
            <div style="padding:6px 10px;background:var(--surface2);">
                <button onclick="importarTodosReemplazos(${JSON.stringify(lib.clave)})"
                    style="width:100%;margin-bottom:6px;background:var(--accent);border:none;border-radius:4px;
                           color:var(--bg);font-family:'DM Mono',monospace;font-size:0.6rem;font-weight:700;
                           padding:5px 0;cursor:pointer;">↩ Importar todos al libro actual</button>
                ${paresHTML}
            </div>
        </details>`;
    }).join('');
}

function importarReemplazo(buscar, reemplazar) {
    if (!buscar) return;
    reemplazosAutomaticos[buscar] = reemplazar;
    _persistirReemplazos();
    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
    mostrarNotificacion(`\u2713 Importado: "${buscar}" \u2192 "${reemplazar}"`);
}

function importarTodosReemplazos(clave) {
    try {
        // clave ya viene prefijada desde renderPanelOtrosLibros
        const pares = JSON.parse(localStorage.getItem(clave) || '{}');
        const count = Object.keys(pares).length;
        if (count === 0) { mostrarNotificacion('\u26a0 Sin reemplazos para importar'); return; }
        Object.assign(reemplazosAutomaticos, pares);
        _persistirReemplazos();
        if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
        actualizarBotonLimpiarReemplazos();
        renderListaReemplazos();
        mostrarNotificacion(`\u2713 ${count} reemplazos importados al libro actual`);
    } catch (e) { mostrarNotificacion('\u26a0 Error al importar'); }
}
// ═══════════════════════════════════════
// AMBIENT LOOP TOGGLE
// Movido desde el <script> inline de index.html
// ═══════════════════════════════════════
window._ambientLoopOn = false;

function toggleAmbientLoop() {
    window._ambientLoopOn = !window._ambientLoopOn;
    // Aplicar loop al audio de Freesound (variable en player.js)
    if (typeof freesoundAudio !== 'undefined' && freesoundAudio) {
        freesoundAudio.loop = window._ambientLoopOn;
        // Si loop se activa, quitar onended para que el audio no avance al siguiente
        freesoundAudio.onended = window._ambientLoopOn
            ? null
            : () => { console.log('🎵 [Player] Track terminado — cargando siguiente automáticamente'); siguienteTrack(); };
    }
    const btn = document.getElementById('kbtn-ambient-loop');
    if (btn) btn.style.color = window._ambientLoopOn ? 'var(--accent)' : 'var(--text-dim)';
    if (typeof mostrarNotificacion === 'function')
        mostrarNotificacion(window._ambientLoopOn ? '\u{1F501} Loop música: ON' : '\u{1F501} Loop música: OFF');
}