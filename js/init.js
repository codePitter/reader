// ═══════════════════════════════════════
// INIT — Lógica de inicialización de UI
// Extraído de index.html — scripts inline
// Depende de: main.js, images.js, tts.js, video.js
// Debe cargarse ÚLTIMO (después de ui.js)
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// SELECTOR DE PROVEEDOR DE IMÁGENES (video bar popup)
// ═══════════════════════════════════════

(function () {
    const PROVS = [
        { key: 'picsum', label: 'Picsum', optId: 'opt-picsum', panelId: 'picsum-freq-popover' },
        { key: 'pexels', label: 'Pexels', optId: 'opt-pexels', panelId: 'pexels-key-popover' },
        { key: 'unsplash', label: 'Unsplash', optId: 'opt-unsplash', panelId: null },
        { key: 'pixabay', label: 'Pixabay', optId: 'opt-pixabay', panelId: 'pixabay-key-popover' },
        { key: 'openverse', label: 'Openverse', optId: 'opt-openverse', panelId: 'openverse-key-popover' },
        { key: 'puter', label: 'Puter.js', optId: 'opt-puter', panelId: 'puter-key-popover' },
        { key: 'pollinations', label: 'Pollinations', optId: 'opt-pollinations', panelId: 'pollinations-freq-popover' },
        { key: 'procedural', label: 'Procedural', optId: 'opt-procedural', panelId: 'procedural-freq-popover' },
    ];

    // IDs de los inputs de frecuencia por proveedor (en el popup)
    const FREQ_INPUT_IDS = {
        picsum: 'freq-picsum-pop',
        pexels: 'freq-pexels-pop',
        pixabay: 'freq-pixabay-pop',
        openverse: 'freq-openverse-pop',
        puter: 'freq-puter-pop',
        pollinations: 'freq-pollinations-pop',
        procedural: 'freq-procedural-pop',
    };

    function _activarProv(key) {
        // Actualizar radio oculto
        const radio = document.getElementById('prov-' + key);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }

        // ── Sincronizar con images.js (_imageProvider + pool) ──
        // Solo proveedores soportados por images.js; puter/pollinations/procedural
        // son manejados por video.js y no deben tocar _imageProvider.
        const _webProvs = new Set(['pixabay', 'pexels', 'picsum', 'unsplash', 'openverse']);
        if (_webProvs.has(key)) {
            if (typeof cambiarProveedorImagenes === 'function') {
                cambiarProveedorImagenes(key);
            } else {
                localStorage.setItem('image_provider', key);
            }
        }

        // Actualizar estilos de labels
        PROVS.forEach(p => {
            const el = document.getElementById(p.optId);
            if (el) el.classList.toggle('img-prov-active', p.key === key);
        });

        // Actualizar label del botón
        const prov = PROVS.find(p => p.key === key);
        const lblEl = document.getElementById('btn-img-prov-label');
        if (lblEl && prov) lblEl.textContent = prov.label;

        // Mostrar/ocultar paneles de configuración
        PROVS.forEach(p => {
            if (p.panelId) {
                const panel = document.getElementById(p.panelId);
                if (panel) panel.style.display = p.key === key ? 'block' : 'none';
            }
        });

        // Poblar el input de frecuencia del proveedor activo con su valor guardado
        const freqInputId = FREQ_INPUT_IDS[key];
        if (freqInputId) {
            const freqEl = document.getElementById(freqInputId);
            if (freqEl && typeof _getChangeEvery === 'function') {
                freqEl.value = _getChangeEvery(key);
            }
        }

        // Limpiar status del popover
        const statusEl = document.getElementById('img-prov-status-pop');
        if (statusEl) statusEl.textContent = '';
    }

    window._toggleImgProvMenu = function () {
        const menu = document.getElementById('img-prov-menu');
        const btn = document.getElementById('btn-img-prov');
        const isOpen = menu.classList.toggle('open');
        if (btn) {
            btn.style.borderColor = isOpen ? 'var(--accent2)' : 'var(--border)';
            btn.style.color = isOpen ? 'var(--accent2)' : 'var(--text-dim)';
        }
    };

    window._toggleMusicMenu = function () {
        const menu = document.getElementById('video-music-menu');
        const btn = document.getElementById('kbtn-music-popup');
        const isOpen = menu.classList.toggle('open');
        menu.style.display = isOpen ? 'block' : 'none';
        if (btn) {
            btn.style.borderColor = isOpen ? 'var(--accent2)' : 'var(--border)';
            btn.style.color = isOpen ? 'var(--accent2)' : 'var(--text-dim)';
        }
    };

    // Cerrar menús al hacer clic fuera
    document.addEventListener('click', function (e) {
        const wrapper = document.getElementById('img-prov-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            const menu = document.getElementById('img-prov-menu');
            const btn = document.getElementById('btn-img-prov');
            if (menu) menu.classList.remove('open');
            if (btn) { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-dim)'; }
        }
        const mwrapper = document.getElementById('video-music-wrapper');
        if (mwrapper && !mwrapper.contains(e.target)) {
            const mmenu = document.getElementById('video-music-menu');
            const mbtn = document.getElementById('kbtn-music-popup');
            if (mmenu) { mmenu.classList.remove('open'); mmenu.style.display = 'none'; }
            if (mbtn) { mbtn.style.borderColor = 'var(--border)'; mbtn.style.color = 'var(--text-dim)'; }
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        // Asignar click a cada opción del menú
        PROVS.forEach(p => {
            const el = document.getElementById(p.optId);
            if (el) el.addEventListener('click', function (e) {
                e.stopPropagation();
                _activarProv(p.key);
            });
        });

        // Leer proveedor guardado — Pixabay como default.
        // Si hay un provider de IA guardado, limpiarlo y forzar picsum.
        const _webProvs = new Set(['pixabay', 'pexels', 'picsum', 'unsplash', 'openverse', 'procedural']);
        const _rawProv = localStorage.getItem('image_provider');
        if (_rawProv && !_webProvs.has(_rawProv)) localStorage.removeItem('image_provider');
        const savedProv = (_rawProv && _webProvs.has(_rawProv)) ? _rawProv : 'picsum';
        _activarProv(savedProv);

        // Sincronizar modelo Puter
        const puterModelSaved = localStorage.getItem('puter_model') || 'gpt-image-1.5';
        const puterModelPop = document.getElementById('puter-model-pop');
        if (puterModelPop) puterModelPop.value = puterModelSaved;

        // Mostrar estado de key Pixabay
        const pixKey = localStorage.getItem('pixabay_api_key');
        const pixStatusEl = document.getElementById('pixabay-key-status-video');
        if (pixKey && pixStatusEl) { pixStatusEl.textContent = '✓'; pixStatusEl.style.color = 'var(--accent2)'; }

        // Mostrar estado de key Pexels
        const pexKey = localStorage.getItem('pexels_api_key');
        const pexStatusEl = document.getElementById('pexels-key-status-video');
        if (pexKey && pexStatusEl) { pexStatusEl.textContent = '✓'; pexStatusEl.style.color = 'var(--accent2)'; }
    });
})();

// ═══════════════════════════════════════
// GUARDAR KEY DE PEXELS (popup video bar)
// ═══════════════════════════════════════

window.guardarPexelsKeyVideo = function () {
    const input = document.getElementById('pexels-key-input-video');
    const key = input?.value?.trim();
    if (!key) { if (typeof mostrarNotificacion === 'function') mostrarNotificacion('⚠ Ingresa una API Key de Pexels'); return; }
    if (typeof _pexelsKey !== 'undefined') window._pexelsKey = key;
    localStorage.setItem('pexels_api_key', key);
    const status = document.getElementById('pexels-key-status-video');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    localStorage.setItem('image_provider', 'pexels');
    if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✓ Pexels key guardada');
    if (typeof _pixabayPoolShared !== 'undefined') window._pixabayPoolShared = [];
    if (typeof precalentarPoolPixabay === 'function') precalentarPoolPixabay();
};

// ═══════════════════════════════════════
// SELECTOR DE CAPÍTULOS — COLAPSAR / EXPANDIR
// ═══════════════════════════════════════

let _selectorExpandidoManualmente = false;

function colapsarSelectorCapitulos() {
    const sel = document.getElementById('chapter-selector');
    const chip = document.getElementById('chapter-active-chip');
    const chipText = document.getElementById('chapter-active-chip-text');
    const chapters = document.getElementById('chapters');
    if (!sel || !chip) return;
    _selectorExpandidoManualmente = false;
    const selOpt = chapters && chapters.selectedIndex >= 0 ? chapters.options[chapters.selectedIndex] : null;
    const label = selOpt && !selOpt.disabled ? selOpt.text : '— sin capítulos —';
    chipText.textContent = label;
    sel.style.display = 'none';
    chip.style.display = 'flex';
}

function expandirSelectorCapitulos() {
    const sel = document.getElementById('chapter-selector');
    const chip = document.getElementById('chapter-active-chip');
    if (!sel || !chip) return;
    _selectorExpandidoManualmente = true;
    chip.style.display = 'none';
    sel.style.display = 'block';
    const search = document.getElementById('chapter-search');
    if (search) { search.value = ''; search.focus(); filtrarCapitulos(''); }
}

document.addEventListener('DOMContentLoaded', () => {
    const chapters = document.getElementById('chapters');
    if (chapters) {
        chapters.addEventListener('change', () => {
            _selectorExpandidoManualmente = false;
            setTimeout(colapsarSelectorCapitulos, 120);
        });
    }
    const sel = document.getElementById('chapter-selector');
    if (sel) {
        const obs = new MutationObserver(() => {
            if (sel.style.display === 'block' && !_selectorExpandidoManualmente) {
                setTimeout(colapsarSelectorCapitulos, 500);
            }
        });
        obs.observe(sel, { attributes: true, attributeFilter: ['style'] });
    }

    // Limpiar caché ambiental al cargar un nuevo archivo (EPUB u otro)
    const epubInput = document.getElementById('epub-file');
    if (epubInput) {
        epubInput.addEventListener('change', () => {
            if (typeof limpiarCacheAmbiental === 'function') {
                limpiarCacheAmbiental();
            }
        });
    }
});