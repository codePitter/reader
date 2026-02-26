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
    const buscar = document.getElementById('palabra-buscar').value.trim();
    const reemplazar = document.getElementById('palabra-reemplazar').value.trim();

    if (!buscar) {
        mostrarNotificacion('⚠ Ingresa una palabra para buscar');
        return;
    }

    const elemento = document.getElementById('texto-contenido');
    let regex;
    try {
        regex = new RegExp(buscar, 'gi');
    } catch (e) {
        regex = new RegExp(buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }

    const textoOriginal = elemento.textContent;
    const ocurrencias = (textoOriginal.match(regex) || []).length;

    if (ocurrencias === 0) {
        alert(`No se encontró "${buscar}"`);
        return;
    }

    elemento.textContent = textoOriginal.replace(regex, (match) => {
        // Preservar capitalización del match
        if (match.charAt(0) === match.charAt(0).toUpperCase() &&
            match.charAt(0) !== match.charAt(0).toLowerCase()) {
            return reemplazar.charAt(0).toUpperCase() + reemplazar.slice(1);
        }
        if (match === match.toUpperCase()) return reemplazar.toUpperCase();
        return reemplazar;
    });

    actualizarEstadisticas();
    mostrarNotificacion(`✓ ${ocurrencias} ocurrencia(s) reemplazada(s)`);

    // Guardar en localStorage y en el diccionario activo
    reemplazosAutomaticos[buscar] = reemplazar;
    localStorage.setItem('reemplazos_custom', JSON.stringify(reemplazosAutomaticos));

    // Invalidar cache BG: el texto cacheado no tiene este reemplazo aplicado
    Object.keys(_capCache).forEach(k => delete _capCache[k]);

    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();

    document.getElementById('palabra-buscar').value = '';
    document.getElementById('palabra-reemplazar').value = '';
}

function limpiarReemplazosGuardados() {
    if (!confirm('¿Eliminar todos los reemplazos guardados?')) return;
    Object.keys(reemplazosAutomaticos).forEach(k => delete reemplazosAutomaticos[k]);
    localStorage.removeItem('reemplazos_custom');
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
    mostrarNotificacion('✓ Reemplazos eliminados');
}

function actualizarBotonLimpiarReemplazos() {
    const btn = document.getElementById('btn-limpiar-reemplazos');
    if (!btn) return;
    const count = Object.keys(reemplazosAutomaticos).length;
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `🗑 Limpiar (${count})` : '🗑 Limpiar';
}

// Renderiza la lista de pares activos dentro del panel colapsable
function renderListaReemplazos() {
    const lista = document.getElementById('reemplazos-guardados-lista');
    if (!lista) return;
    const pares = Object.entries(reemplazosAutomaticos);
    if (pares.length === 0) {
        lista.style.display = 'none';
        lista.innerHTML = '';
        return;
    }
    lista.style.display = 'block';
    lista.innerHTML = pares.map(([b, r]) =>
        `<div style="display:flex;align-items:center;gap:4px;font-size:0.6rem;padding:2px 0;color:var(--text-dim);">
            <span style="color:var(--accent2);font-family:'DM Mono',monospace;">${escapeHTML(b)}</span>
            <span>→</span>
            <span style="font-family:'DM Mono',monospace;">${escapeHTML(r)}</span>
            <button onclick="eliminarReemplazo('${escapeHTML(b)}')" title="Eliminar"
                style="margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.65rem;padding:0 2px;transition:color 0.2s;"
                onmouseover="this.style.color='var(--accent)'"
                onmouseout="this.style.color='var(--text-dim)'">✕</button>
        </div>`
    ).join('');
}

function eliminarReemplazo(buscar) {
    delete reemplazosAutomaticos[buscar];
    localStorage.setItem('reemplazos_custom', JSON.stringify(reemplazosAutomaticos));
    Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
    // Actualizar también el modal si está abierto
    if (document.getElementById('modal-reemplazos').style.display === 'flex') {
        renderModalReemplazos();
    }
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

// Tecla Enter para ejecutar reemplazar
document.addEventListener('DOMContentLoaded', () => {
    const inputReemplazar = document.getElementById('palabra-reemplazar');
    if (inputReemplazar) {
        inputReemplazar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') reemplazarPalabra();
        });
    }
    // Inicializar estado del botón limpiar
    actualizarBotonLimpiarReemplazos();
    renderListaReemplazos();
});

// ======================
// MODAL REEMPLAZOS
// ======================

function abrirModalReemplazos() {
    const modal = document.getElementById('modal-reemplazos');
    if (!modal) return;
    renderModalReemplazos();
    modal.style.display = 'flex';
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
    if (typeof sentences === 'undefined' || sentences.length === 0) return;
    const track = document.getElementById('main-progress-track');
    const tooltip = document.getElementById('main-progress-tooltip');
    if (!track || !tooltip) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const idx = Math.floor(pct * sentences.length);
    const sentence = sentences[idx] || '';
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.textContent = sentence.length > 60 ? sentence.slice(0, 57) + '…' : sentence;
}

function mainProgressMouseLeave() {
    const tooltip = document.getElementById('main-progress-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// ======================
// INICIALIZACIÓN GLOBAL
// ======================

document.addEventListener('DOMContentLoaded', () => {
    actualizarEstadisticas();
    actualizarBotonLimpiarReemplazos();
    // Verificar servidor TTS al cargar
    if (typeof verificarServidorTTS === 'function') verificarServidorTTS();
});