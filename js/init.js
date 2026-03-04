// ═══════════════════════════════════════
// INIT — Lógica de inicialización de UI
// Extraído de index.html — scripts inline
// Depende de: main.js, images.js, tts.js, video.js
// Debe cargarse ÚLTIMO (después de ui.js)
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// EDITAR TEXTO INLINE — reading area
// Migrado desde index.html (script inline)
// ═══════════════════════════════════════

var _editandoTexto = false;
var _textoOriginalAntesDeedicion = null;

window._toggleEditarTexto = function () {
    var contenido = document.getElementById("texto-contenido");
    var btn = document.getElementById("btn-editar-texto");
    if (!contenido) return;
    _editandoTexto = !_editandoTexto;
    if (_editandoTexto) {
        // Limpiar spans TTS para edición limpia — preservar solo el texto plano en párrafos
        var parrafos = Array.from(contenido.querySelectorAll("p"));
        if (parrafos.length > 0) {
            _textoOriginalAntesDeedicion = contenido.innerHTML;
            parrafos.forEach(function (p) {
                p.innerHTML = p.textContent;
            });
        } else {
            // Sin párrafos — limpiar spans directamente
            _textoOriginalAntesDeedicion = contenido.innerHTML;
            contenido.querySelectorAll(".tts-sentence").forEach(function (s) {
                s.replaceWith(document.createTextNode(s.textContent));
            });
            contenido.normalize();
        }
        contenido.contentEditable = "true";
        contenido.style.outline = "2px solid var(--accent)";
        contenido.style.borderRadius = "4px";
        contenido.style.padding = "8px";
        contenido.focus();
        if (btn) {
            btn.innerHTML = "&#10003; Guardar";
            btn.style.color = "var(--accent)";
            btn.style.borderColor = "var(--accent)";
            btn.onmouseover = null;
            btn.onmouseout = null;
        }
    } else {
        // Desactivar edición
        contenido.contentEditable = "false";
        contenido.style.outline = "";
        contenido.style.borderRadius = "";
        contenido.style.padding = "";
        if (btn) {
            btn.innerHTML = "&#9999; Editar texto";
            btn.style.color = "";
            btn.style.borderColor = "";
            btn.onmouseover = function () { this.style.color = "var(--accent)"; this.style.borderColor = "var(--accent)"; };
            btn.onmouseout = function () { this.style.color = ""; this.style.borderColor = ""; };
        }
        // Actualizar sentences para TTS con el nuevo texto
        if (typeof dividirEnOraciones === "function" && typeof sentences !== "undefined") {
            sentences = dividirEnOraciones(contenido.textContent.trim());
        }
        if (typeof actualizarContadores === "function") actualizarContadores();
        if (typeof mostrarNotificacion === "function") mostrarNotificacion("✓ Texto actualizado");
    }
};

// Esc para salir del modo edición
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _editandoTexto) window._toggleEditarTexto();
});

// ═══════════════════════════════════════
// HOVER SIDEBAR DE AJUSTES
// Migrado desde index.html (script inline)
// ═══════════════════════════════════════

document.addEventListener("DOMContentLoaded", function () {
    var section = document.getElementById("ajustes-sidebar-section");
    var content = document.getElementById("ajustes-sidebar-content");
    if (!section || !content) return;
    section.addEventListener("mouseenter", function () {
        content.style.maxHeight = "1000px";
        content.style.opacity = "1";
    });
    section.addEventListener("mouseleave", function () {
        content.style.maxHeight = "0";
        content.style.opacity = "0";
    });
});

// ═══════════════════════════════════════
// ACCORDION MODAL DE AJUSTES
// Migrado desde index.html (script inline)
// ═══════════════════════════════════════

// toggleAjusteAcc está definida en settings-bridge.js (carga antes que init.js).
// Esta versión fue eliminada — hacía el.closest('.ajustes-panel') que retornaba
// null en el nuevo slide-in panel, crasheando en todos los acordeones de ajustes.

function abrirAjusteAcc(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}

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
                uSet('image_provider', key);
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
        const _rawProv = uGet('image_provider');
        if (_rawProv && !_webProvs.has(_rawProv)) uRemove('image_provider');
        const savedProv = (_rawProv && _webProvs.has(_rawProv)) ? _rawProv : 'picsum';
        _activarProv(savedProv);

        // Sincronizar modelo Puter
        const puterModelSaved = uGet('puter_model') || 'gpt-image-1.5';
        const puterModelPop = document.getElementById('puter-model-pop');
        if (puterModelPop) puterModelPop.value = puterModelSaved;

        // Mostrar estado de key Pixabay
        const pixKey = uGet('pixabay_api_key');
        const pixStatusEl = document.getElementById('pixabay-key-status-video');
        if (pixKey && pixStatusEl) { pixStatusEl.textContent = '✓'; pixStatusEl.style.color = 'var(--accent2)'; }

        // Mostrar estado de key Pexels
        const pexKey = uGet('pexels_api_key');
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
    uSet('pexels_api_key', key);
    const status = document.getElementById('pexels-key-status-video');
    if (status) { status.textContent = '✓'; status.style.color = 'var(--accent2)'; }
    uSet('image_provider', 'pexels');
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
    const btnLeer = document.getElementById('btn-leer-capitulo');
    const sbLeerWrap = document.getElementById('sb-leer-wrap');
    if (!sel || !chip) return;
    _selectorExpandidoManualmente = false;
    const selOpt = chapters && chapters.selectedIndex >= 0 ? chapters.options[chapters.selectedIndex] : null;
    const label = selOpt && !selOpt.disabled ? selOpt.text : '— sin capítulos —';
    chipText.textContent = label;
    sel.style.display = 'none';
    chip.style.display = 'flex';
    // Mostrar/ocultar el wrapper del botón Leer (no solo el botón)
    const mostrarLeer = !!(selOpt && !selOpt.disabled);
    if (sbLeerWrap) sbLeerWrap.style.display = mostrarLeer ? '' : 'none';
    if (btnLeer) btnLeer.style.display = mostrarLeer ? 'block' : 'none';
    // Actualizar preview compacto del capítulo activo
    if (typeof window._actualizarChPreview === 'function') window._actualizarChPreview();
}

function expandirSelectorCapitulos() {
    const sel = document.getElementById('chapter-selector');
    const chip = document.getElementById('chapter-active-chip');
    const btnLeer = document.getElementById('btn-leer-capitulo');
    if (!sel || !chip) return;
    _selectorExpandidoManualmente = true;
    chip.style.display = 'none';
    if (btnLeer) btnLeer.style.display = 'none';
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

    // Restaurar toggles en la carga inicial (prefijo guest_ — sesión aún no resolvió)
    _restaurarToggles();
    _registrarListenersPrefs();

    // ── Sincronizar pills del sidebar nuevo ──
    if (typeof syncSidebarPills === 'function') syncSidebarPills();
});

// ═══════════════════════════════════════
// RESTAURAR TOGGLES — función reutilizable
// Se llama en DOMContentLoaded Y en auth:ready para que los valores del usuario
// autenticado (prefijo user_XXXX_) se apliquen correctamente a la UI incluso
// cuando la sesión Supabase resuelve después del primer render.
// IMPORTANTE: solo restaura el estado visual del checkbox.
// La variable interna `traduccionAutomatica` NO se toca aquí — solo cambia
// cuando el usuario presiona "Aplicar".
// ═══════════════════════════════════════
function _restaurarToggles() {
    // auto-translate
    const autoTranslate = document.getElementById('auto-translate');
    if (autoTranslate) {
        const saved = uGet('toggle_auto_translate');
        if (saved !== null) {
            autoTranslate.checked = saved === 'true';
            const statusEl = document.getElementById('translation-status');
            if (statusEl && autoTranslate.checked) {
                statusEl.textContent = '⏳ Traducción activada (presiona Aplicar)';
            }
            if (autoTranslate.checked) {
                const row = document.getElementById('aplicar-row');
                if (row) row.style.display = 'block';
            }
        }
    }

    // tts-humanizer
    const ttsHumanizer = document.getElementById('tts-humanizer');
    if (ttsHumanizer) {
        const saved = uGet('toggle_tts_humanizer');
        if (saved !== null) {
            ttsHumanizer.checked = saved === 'true';
            if (typeof ttsHumanizerActivo !== 'undefined') {
                ttsHumanizerActivo = ttsHumanizer.checked;
            }
            const panel = document.getElementById('claude-key-panel');
            if (panel) panel.style.display = ttsHumanizer.checked ? 'block' : 'none';
            const humStatus = document.getElementById('humanizer-status');
            if (humStatus) humStatus.textContent = ttsHumanizer.checked ? '⏳ activo (pendiente)' : 'Desactivado';
        }
    }

    // auto-play-after-translate
    const autoPlay = document.getElementById('auto-play-after-translate');
    if (autoPlay) {
        const saved = uGet('toggle_auto_play');
        if (saved !== null) autoPlay.checked = saved === 'true';
    }

    // auto-next-chapter
    const autoNext = document.getElementById('auto-next-chapter');
    if (autoNext) {
        const saved = uGet('toggle_auto_next');
        if (saved !== null) autoNext.checked = saved === 'true';
    }

    // auto-onoma
    const autoOnoma = document.getElementById('auto-onoma');
    if (autoOnoma) {
        const saved = uGet('auto_onoma');
        if (saved !== null) {
            autoOnoma.checked = saved === 'true';
            if (typeof autoReemplazarOnomatopeyas !== 'undefined') {
                autoReemplazarOnomatopeyas = autoOnoma.checked;
            }
            const statusEl = document.getElementById('auto-onoma-status');
            if (statusEl) {
                statusEl.textContent = autoOnoma.checked ? '✓ Activo' : 'Desactivado';
                statusEl.style.color = autoOnoma.checked ? 'var(--accent2)' : '';
            }
        }
    }

    // grammar-review
    const gramReview = document.getElementById('grammar-review');
    if (gramReview) {
        const saved = uGet('grammar_review_activo');
        if (saved !== null) {
            gramReview.checked = saved === 'true';
            if (typeof grammarReviewActivo !== 'undefined') {
                grammarReviewActivo = gramReview.checked;
            }
            const statusEl = document.getElementById('grammar-review-status');
            if (statusEl && gramReview.checked) {
                statusEl.textContent = '✓ Activo';
                statusEl.style.color = 'var(--accent2)';
            }
        }
    }

    // btn-tts-servidor-live: restaurar estado visual (el valor ya se cargó en tts.js)
    // _sincronizarBtnServidorLive() puede no estar disponible si tts.js aún no cargó,
    // por eso usamos un pequeño defer.
    setTimeout(() => {
        if (typeof _sincronizarBtnServidorLive === 'function') {
            _sincronizarBtnServidorLive();
        }
    }, 0);

    // ── Sliders TTS ──
    const rateControl = document.getElementById('rate-control');
    const rateValue = document.getElementById('rate-value');
    const savedRate = uGet('tts_rate');
    if (rateControl && savedRate !== null) {
        rateControl.value = savedRate;
        if (rateValue) rateValue.textContent = savedRate;
    }

    const pitchControl = document.getElementById('pitch-control');
    const pitchValue = document.getElementById('pitch-value');
    const savedPitch = uGet('tts_pitch');
    if (pitchControl && savedPitch !== null) {
        pitchControl.value = savedPitch;
        if (pitchValue) pitchValue.textContent = savedPitch;
    }

    const volumeControl = document.getElementById('volume-control');
    const volumeValue = document.getElementById('volume-value');
    const savedVolume = uGet('tts_volume');
    if (volumeControl && savedVolume !== null) {
        volumeControl.value = savedVolume;
        if (volumeValue) volumeValue.textContent = savedVolume;
    }
}

// ── Handlers de guardado para toggles del sidebar que no tienen módulo propio ──
// Se definen aquí (init.js carga último) para que no dependan del orden de carga
// de grammar.js, tts.js, etc.

window.toggleTTSHumanizer = function () {
    const cb = document.getElementById('tts-humanizer');
    if (!cb) return;
    const checked = cb.checked;
    uSet('toggle_tts_humanizer', checked);
    if (typeof ttsHumanizerActivo !== 'undefined') ttsHumanizerActivo = checked;
    const panel = document.getElementById('claude-key-panel');
    if (panel) panel.style.display = checked ? 'block' : 'none';
    const humStatus = document.getElementById('humanizer-status');
    if (humStatus) {
        humStatus.textContent = checked
            ? (typeof claudeApiKey !== 'undefined' && claudeApiKey ? '✓ activo' : '⚠ necesita API key')
            : 'Desactivado';
    }
    marcarCambioPendiente();
};

window.toggleAutoOnoma = function () {
    const cb = document.getElementById('auto-onoma');
    if (!cb) return;
    const checked = cb.checked;
    uSet('auto_onoma', checked);
    if (typeof autoReemplazarOnomatopeyas !== 'undefined') autoReemplazarOnomatopeyas = checked;
    const statusEl = document.getElementById('auto-onoma-status');
    if (statusEl) {
        statusEl.textContent = checked ? '✓ Activo' : 'Desactivado';
        statusEl.style.color = checked ? 'var(--accent2)' : '';
    }
};

window.toggleGrammarReview = function () {
    const cb = document.getElementById('grammar-review');
    if (!cb) return;
    const checked = cb.checked;
    uSet('grammar_review_activo', checked);
    if (typeof grammarReviewActivo !== 'undefined') grammarReviewActivo = checked;
    const statusEl = document.getElementById('grammar-review-status');
    if (statusEl) {
        statusEl.textContent = checked ? '✓ Activo' : 'Desactivado';
        statusEl.style.color = checked ? 'var(--accent2)' : '';
    }
};

// ── Reaplicar toggles cuando la sesión auth resuelve ──
document.addEventListener('auth:ready', (e) => {
    const userId = e.detail?.user?.id ?? null;
    console.log(`[Prefs] auth:ready — userId: ${userId} | prefijo: ${uGetPrefix()}`);

    // Aplicar tema del usuario autenticado
    if (typeof initTheme === 'function') initTheme();

    _restaurarToggles();
    _restaurarVoces();

    // ── Sincronizar pills del sidebar nuevo ──
    if (typeof syncSidebarPills === 'function') syncSidebarPills();

    // ── Sincronizar provider selects del settings panel ──
    // _sincronizarInputsApiKeys vive en ui.js y ahora corre con
    // prefijo user_XXXX_ → rellena los selects con los datos reales.
    if (typeof _sincronizarInputsApiKeys === 'function') {
        _sincronizarInputsApiKeys();
    }

    // ── Sincronizar sliders visibles del sidebar (sb-tts-slider) ──
    // _restaurarToggles() actualiza #rate-control (control oculto) pero los
    // sliders visibles que el usuario ve (.sb-tts-slider) quedan en 1.0 porque
    // son elementos separados sin binding inverso. Hay que sincronizarlos aquí.
    setTimeout(() => {
        const rateControl  = document.getElementById('rate-control');
        const pitchControl = document.getElementById('pitch-control');
        const sbSliders    = document.querySelectorAll('.sb-tts-slider');
        // sbSliders[0] = Rate, sbSliders[1] = Tono
        if (sbSliders[0] && rateControl) {
            sbSliders[0].value = rateControl.value;
            const lbl0 = sbSliders[0].nextElementSibling;
            if (lbl0 && lbl0.classList.contains('sb-tts-val')) {
                lbl0.textContent = parseFloat(rateControl.value).toFixed(1) + '×';
            }
        }
        if (sbSliders[1] && pitchControl) {
            sbSliders[1].value = pitchControl.value;
            const lbl1 = sbSliders[1].nextElementSibling;
            if (lbl1 && lbl1.classList.contains('sb-tts-val')) {
                lbl1.textContent = parseFloat(pitchControl.value).toFixed(1) + '×';
            }
        }
        // Aplicar volumen al engine
        const volumeControl = document.getElementById('volume-control');
        if (volumeControl) {
            const vol = parseFloat(volumeControl.value) / 100;
            if (typeof window._masterVolume !== 'undefined') window._masterVolume = vol;
        }
    }, 0);

    // Re-aplicar preferencias TTS desde storage con el prefijo correcto.
    // _applyStoredTTSPrefs() (tts.js) es silenciosa: no dispara toasts ni llama
    // verificarServidorTTS(). Evita la acumulación de toasts al cargar la página.
    if (typeof window._applyStoredTTSPrefs === 'function') {
        window._applyStoredTTSPrefs();
    }

    _registrarListenersPrefs();
});

// ═══════════════════════════════════════
// RESTAURAR VOCES
// ═══════════════════════════════════════
function _restaurarVoces() {
    const edgeVoice = uGet('edge_tts_voice');
    if (edgeVoice) {
        // Actualizar selects directamente — sin llamar setEdgeTtsVoice() que muestra un toast
        if (typeof _edgeTtsVoice !== 'undefined') window._edgeTtsVoiceRestore = edgeVoice; // hint para tts.js si necesita
        ['edge-voice-select', 'sb-edge-voice-select', 'sp-edge-voice'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) sel.value = edgeVoice;
        });
    }
    const voiceIdx = uGet('tts_voice_idx');
    if (voiceIdx !== null) {
        const sel = document.getElementById('voice-select');
        if (sel && sel.querySelector(`option[value="${voiceIdx}"]`)) sel.value = voiceIdx;
    }
    // Después de restaurar, no debe haber diff → ocultar botones
    _actualizarBtnVozPredeterminada();
}

// ═══════════════════════════════════════
// BOTÓN "⭐ Predeterminado" — voz TTS
// Aparece al lado del selector activo cuando la voz difiere de uStorage.
// Usa clase CSS .btn-voz-default (definida en style.css).
// ═══════════════════════════════════════

function _edgeSelVisible() {
    const s = document.getElementById('edge-voice-select');
    return s && s.style.display !== 'none';
}

function _vozActualDifiere() {
    if (_edgeSelVisible()) {
        const sel = document.getElementById('edge-voice-select');
        const stored = uGet('edge_tts_voice');
        // null = nunca guardada → siempre ofrecer guardar si hay valor seleccionado
        return sel && sel.value && (stored === null || sel.value !== stored);
    } else {
        const sel = document.getElementById('voice-select');
        const stored = uGet('tts_voice_idx');
        return sel && sel.value && (stored === null || sel.value !== stored);
    }
}

function _actualizarBtnVozPredeterminada() {
    const difiere = _vozActualDifiere();
    const edgeVisible = _edgeSelVisible();
    const btnEdge = document.getElementById('btn-edge-voz-predeterminada');
    const btnNative = document.getElementById('btn-voz-predeterminada');
    // Usar inline-flex para respetar el layout flexbox de .tts-control-bar
    if (btnEdge) btnEdge.style.display = (edgeVisible && difiere) ? 'inline-flex' : 'none';
    if (btnNative) btnNative.style.display = (!edgeVisible && difiere) ? 'inline-flex' : 'none';
}

window.guardarVozPredeterminada = function () {
    if (_edgeSelVisible()) {
        const sel = document.getElementById('edge-voice-select');
        if (sel && sel.value) {
            uSet('edge_tts_voice', sel.value);
            console.log(`[Prefs] Voz Edge guardada: ${sel.value}`);
        }
    } else {
        const sel = document.getElementById('voice-select');
        if (sel && sel.value) {
            uSet('tts_voice_idx', sel.value);
            console.log(`[Prefs] Voz navegador guardada: ${sel.value}`);
        }
    }
    _actualizarBtnVozPredeterminada();
    mostrarNotificacion('⭐ Voz guardada como predeterminada');
};

// ═══════════════════════════════════════
// GUARDAR PREFERENCIAS (toggles)
// ═══════════════════════════════════════

const _PREFS_TOGGLES = {
    'auto-translate': 'toggle_auto_translate',
    'tts-humanizer': 'toggle_tts_humanizer',
    'auto-play-after-translate': 'toggle_auto_play',
    'auto-next-chapter': 'toggle_auto_next',
    'auto-onoma': 'auto_onoma',
    'grammar-review': 'grammar_review_activo',
};

let _ttsBtnObserver = null;
let _restaurandoPrefs = false;

function _leerEstadoBtnTTS() {
    const btn = document.getElementById('btn-tts-servidor-live');
    return btn ? btn.classList.contains('active') : false;
}

function _hayDiffPrefs() {
    for (const [id, storageKey] of Object.entries(_PREFS_TOGGLES)) {
        const el = document.getElementById(id);
        const raw = uGet(storageKey);
        if (raw !== null && (el ? el.checked : false) !== (raw === 'true')) return true;
    }
    const ttsRaw = uGet('tts_servidor_live');
    if (ttsRaw !== null && _leerEstadoBtnTTS() !== (ttsRaw === 'true')) return true;
    return false;
}

function _actualizarBtnGuardarPrefs() {
    if (_restaurandoPrefs) return;
    const btn = document.getElementById('btn-guardar-prefs');
    if (!btn) return;
    btn.style.display = _hayDiffPrefs() ? 'block' : 'none';
}

window.guardarTodasPreferencias = function () {
    console.log(`[Prefs] Guardando — prefijo: ${uGetPrefix()}`);
    for (const [id, storageKey] of Object.entries(_PREFS_TOGGLES)) {
        const el = document.getElementById(id);
        uSet(storageKey, el ? el.checked : false);
    }
    uSet('tts_servidor_live', _leerEstadoBtnTTS());
    const btn = document.getElementById('btn-guardar-prefs');
    if (btn) btn.style.display = 'none';
    mostrarNotificacion('✓ Preferencias guardadas');
};

function _registrarListenersPrefs() {
    console.log(`[Prefs] _registrarListenersPrefs() — prefijo: ${uGetPrefix()}`);
    if (_ttsBtnObserver) { _ttsBtnObserver.disconnect(); _ttsBtnObserver = null; }

    _restaurandoPrefs = true;
    setTimeout(() => {
        _restaurandoPrefs = false;

        // Toggles → botón guardar prefs
        for (const id of Object.keys(_PREFS_TOGGLES)) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.removeEventListener('change', _actualizarBtnGuardarPrefs);
            el.addEventListener('change', _actualizarBtnGuardarPrefs);
        }

        // Selects de voz → botón ⭐ predeterminado
        ['edge-voice-select', 'voice-select'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.removeEventListener('change', _actualizarBtnVozPredeterminada);
            el.addEventListener('change', _actualizarBtnVozPredeterminada);
        });

        // MutationObserver en btn-tts-servidor-live
        const btnTTS = document.getElementById('btn-tts-servidor-live');
        if (btnTTS) {
            _ttsBtnObserver = new MutationObserver(() => {
                if (_restaurandoPrefs) return;
                _actualizarBtnGuardarPrefs();
                _actualizarBtnVozPredeterminada(); // re-evaluar qué selector está visible
            });
            _ttsBtnObserver.observe(btnTTS, { attributes: true, attributeFilter: ['class'] });
        }
    }, 400);
}

// ═══════════════════════════════════════
// RENDER THEME GRID — panel Apariencia
// Los datos de temas están embebidos aquí para no depender del orden de carga de theme.js
// ═══════════════════════════════════════

window.renderThemeGrid = function () {
    const grid = document.getElementById('theme-selector-grid');
    if (!grid) return;

    // Datos de temas (espejo de theme.js — fuente de verdad en theme.js)
    const TEMAS = [
        { id: 'ember',   nombre: 'Ember',   desc: 'Ámbar oscuro',      dot: '#e8a44e' },
        { id: 'ghost',   nombre: 'Ghost',   desc: 'Azul noche',        dot: '#60a8e8' },
        { id: 'crimson', nombre: 'Crimson', desc: 'Terracota cálida',  dot: '#d4705a' },
        { id: 'abyss',   nombre: 'Abyss',   desc: 'Esmeralda oscuro',  dot: '#52c49a' }
    ];

    const current = (typeof getTheme === 'function') ? getTheme()
        : (typeof uGet === 'function' ? uGet('ui_theme') : localStorage.getItem('ui_theme')) || 'ember';

    grid.innerHTML = TEMAS.map(function(t) {
        const isActive = t.id === current;
        return '<button'
            + ' class="theme-opt-btn' + (isActive ? ' active' : '') + '"'
            + ' data-theme="' + t.id + '"'
            + ' onclick="setTheme(\'' + t.id + '\');renderThemeGrid()"'
            + ' title="' + t.nombre + '">'
            + '<span class="theme-opt-dot" style="background:' + t.dot + ';box-shadow:0 0 8px ' + t.dot + '55;"></span>'
            + '<span class="theme-opt-info">'
            + '<span class="theme-opt-name">' + t.nombre + '</span>'
            + '<span class="theme-opt-desc">' + t.desc + '</span>'
            + '</span>'
            + '</button>';
    }).join('');
};

// Aplicar tema guardado al arrancar (sesión guest)
document.addEventListener('DOMContentLoaded', function () {
    if (typeof initTheme === 'function') initTheme();
});