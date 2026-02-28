// ═══════════════════════════════════════════════════════════════════
// EXPORT_VIDEO.JS — Exportación offscreen silenciosa
// Flujo: Modal config → Selección de imágenes → Pre-gen audio → Render → Descarga
// Depende de: video.js, images.js, tts.js, main.js
// ═══════════════════════════════════════════════════════════════════

const EXPORT_SITE_TAG = 'reader.com';
const EXPORT_FPS = 30;
const EXPORT_W = 1280;
const EXPORT_H = 720;
let EXPORT_IMGS_PER = 10;    // frases por grupo de imagen (modificable desde el modal)
const EXPORT_SEC_FRASE = 4.0;   // segundos/frase cuando no hay XTTS

let _expTtsMode = 'browser'; // se setea en el modal de config, se lee en _iniciarExportacion
let _expFileName = '';       // nombre de archivo congelado al iniciar
let _expTtsBuffers = null;   // ArrayBuffer[] pre-generado desde el panel TTS del preview — no cambia aunque cambie el capítulo

// Efectos globales para la exportación (configurables en el paso de preview)
let _expEffects = {
    grayscale: false,
    vignette: true,
    vigIntensity: 0.65,   // 0–1
    vigSize: 0.85,    // radio exterior (0.5–1.2)
    imgOpacity: 0.58,    // 0.05–1
    brightness: 1.0,     // 0.5–2
    contrast: 1.0,     // 0.5–2
    zoom: 1.0,     // 1–2
    textColor: '#c8a96e',
    textOpacity: 1.0,
    fontFamily: 'Georgia,serif',  // tipografía del texto
    strokeEnabled: false,
    strokeColor: '#000000',
    strokeWidth: 2,               // px (1–8)
};
let _expImagenes = [];   // [{ img: HTMLImageElement|null, url: string, grupo: int }]
// _expImageRanges: [{ desde: int, hasta: int }] — índices de frase (0-based, inclusive)
// Se inicializa en _inicializarRanges() y se puede editar desde el timeline del preview
let _expImageRanges = [];   // sincronizado con _expImagenes por índice

function _inicializarRanges() {
    const total = sentences.length;
    const grupos = _expImagenes.length;
    _expImageRanges = _expImagenes.map((_, g) => ({
        desde: g * EXPORT_IMGS_PER,
        hasta: Math.min((g + 1) * EXPORT_IMGS_PER - 1, total - 1)
    }));
    // Asegurar que el último grupo llegue hasta el final
    if (grupos > 0) _expImageRanges[grupos - 1].hasta = total - 1;
}

// Dado un índice de frase, retorna el índice del grupo/imagen que le corresponde
function _expGetGrupoParaFrase(fraseIdx) {
    for (let g = 0; g < _expImageRanges.length; g++) {
        if (fraseIdx >= _expImageRanges[g].desde && fraseIdx <= _expImageRanges[g].hasta) return g;
    }
    // fallback
    return Math.min(Math.floor(fraseIdx / EXPORT_IMGS_PER), _expImagenes.length - 1);
}

// ───────────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA
// ───────────────────────────────────────────────────────────────────
function exportarVideo() {
    if (!sentences || sentences.length === 0) {
        mostrarNotificacion('⚠ Carga y reproduce un capítulo primero');
        return;
    }
    _expCancelled = false;
    _expImagenes = [];
    _expImageRanges = [];
    _abrirModalConfig();
}

function cancelarExportacion() {
    _expCancelled = true;
    mostrarNotificacion('✕ Cancelando exportación…');
}

// ───────────────────────────────────────────────────────────────────
// PASO 1 — MODAL DE CONFIGURACIÓN
// ───────────────────────────────────────────────────────────────────
async function _abrirModalConfig() {
    _quitarModal();

    // Pausar musica ambiental al entrar al modal de exportacion
    if (typeof freesoundAudio !== 'undefined' && freesoundAudio && !freesoundAudio.paused) {
        freesoundAudio.pause();
    }

    // Re-verificar servidor en tiempo real antes de dibujar el modal
    // (servidorTTSDisponible puede estar en false por error transitorio previo)
    try {
        const hRes = await fetch(`${TTS_API_URL}/health`, { method: 'GET' });
        if (hRes.ok) servidorTTSDisponible = true;
    } catch (e) { /* mantener valor actual */ }

    const xttsOk = (typeof servidorTTSDisponible !== 'undefined') && servidorTTSDisponible;
    const grupos = Math.ceil(sentences.length / EXPORT_IMGS_PER);
    const durEst = Math.round(sentences.length * EXPORT_SEC_FRASE / 60);
    const chapSel = document.getElementById('chapters');
    const chapTxt = chapSel?.options[chapSel?.selectedIndex]?.text || 'capitulo';
    const fileName = `${chapTxt.trim()} - ${EXPORT_SITE_TAG}.webm`;

    const m = document.createElement('div');
    m.id = 'export-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);
        display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;`;
    m.innerHTML = `
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:10px;
                padding:28px 30px;width:460px;max-width:95vw;max-height:95vh;overflow-y:auto;color:#e8e0d0;">
        <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.12em;margin-bottom:18px;">⬇ EXPORTAR</div>

        <!-- TTS -->
        <div style="font-size:.58rem;color:#666;margin-bottom:8px;">Motor de voz</div>
        <div style="display:flex;gap:10px;margin-bottom:18px;">
            <label id="exp-lbl-xtts" style="flex:1;border:1px solid ${xttsOk ? '#c8a96e' : '#2a2a2a'};
                   border-radius:6px;padding:10px 12px;cursor:pointer;
                   background:${xttsOk ? 'rgba(200,169,110,.07)' : '#0d0d0d'};transition:all .2s;">
                <input type="radio" name="exp-tts" value="xtts"
                       ${xttsOk ? 'checked' : ''} ${xttsOk ? '' : 'disabled'}
                       onchange="_expTtsChange()" style="accent-color:#c8a96e;margin-right:5px;">
                <span style="font-size:.6rem;">XTTS v2 / Edge TTS</span><br>
                <span style="font-size:.53rem;color:${xttsOk ? '#7eb89a' : '#444'};">
                    ${xttsOk ? '● Servidor activo' : '○ Sin servidor local'}
                </span>
                ${xttsOk ? `
                <div style="margin-top:8px;">
                    <div style="font-size:.5rem;color:#666;margin-bottom:4px;">Voz</div>
                    <select id="exp-voice-select"
                        style="width:100%;background:#0d0d0d;border:1px solid rgba(200,169,110,.35);
                               border-radius:4px;color:#c8a96e;font-family:'DM Mono',monospace;
                               font-size:.55rem;padding:4px 6px;outline:none;cursor:pointer;"
                        onchange="setEdgeTtsVoice(this.value)">
                    <optgroup label="🇲🇽 México">
                                        <option value="es-MX-JorgeNeural">Jorge — ♂</option>
                                        <option value="es-MX-DaliaNeural">Dalia — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇦🇷 Argentina">
                                        <option value="es-AR-TomasNeural">Tomas — ♂</option>
                                        <option value="es-AR-ElenaNeural">Elena — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇪🇸 España">
                                        <option value="es-ES-AlvaroNeural">Alvaro — ♂</option>
                                        <option value="es-ES-ElviraNeural">Elvira — ♀</option>
                                        <option value="es-ES-XimenaNeural">Ximena — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇨🇴 Colombia">
                                        <option value="es-CO-GonzaloNeural">Gonzalo — ♂</option>
                                        <option value="es-CO-SalomeNeural">Salome — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇺🇸 EEUU">
                                        <option value="es-US-AlonsoNeural">Alonso — ♂</option>
                                        <option value="es-US-PalomaNeural">Paloma — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇨🇱 Chile">
                                        <option value="es-CL-LorenzoNeural">Lorenzo — ♂</option>
                                        <option value="es-CL-CatalinaNeural">Catalina — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇵🇪 Perú">
                                        <option value="es-PE-AlexNeural">Alex — ♂</option>
                                        <option value="es-PE-CamilaNeural">Camila — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇻🇪 Venezuela">
                                        <option value="es-VE-SebastianNeural">Sebastian — ♂</option>
                                        <option value="es-VE-PaolaNeural">Paola — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇺🇾 Uruguay">
                                        <option value="es-UY-MateoNeural">Mateo — ♂</option>
                                        <option value="es-UY-ValentinaNeural">Valentina — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇵🇾 Paraguay">
                                        <option value="es-PY-MarioNeural">Mario — ♂</option>
                                        <option value="es-PY-TaniaNeural">Tania — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇧🇴 Bolivia">
                                        <option value="es-BO-MarceloNeural">Marcelo — ♂</option>
                                        <option value="es-BO-SofiaNeural">Sofia — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇪🇨 Ecuador">
                                        <option value="es-EC-LuisNeural">Luis — ♂</option>
                                        <option value="es-EC-AndreaNeural">Andrea — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇩🇴 R. Dominicana">
                                        <option value="es-DO-EmilioNeural">Emilio — ♂</option>
                                        <option value="es-DO-RamonaNeural">Ramona — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇨🇺 Cuba">
                                        <option value="es-CU-ManuelNeural">Manuel — ♂</option>
                                        <option value="es-CU-BelkysNeural">Belkys — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇨🇷 Costa Rica">
                                        <option value="es-CR-JuanNeural">Juan — ♂</option>
                                        <option value="es-CR-MariaNeural">Maria — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇵🇦 Panamá">
                                        <option value="es-PA-RobertoNeural">Roberto — ♂</option>
                                        <option value="es-PA-MargaritaNeural">Margarita — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇸🇻 El Salvador">
                                        <option value="es-SV-RodrigoNeural">Rodrigo — ♂</option>
                                        <option value="es-SV-LorenaNeural">Lorena — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇬🇹 Guatemala">
                                        <option value="es-GT-AndresNeural">Andres — ♂</option>
                                        <option value="es-GT-MartaNeural">Marta — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇭🇳 Honduras">
                                        <option value="es-HN-CarlosNeural">Carlos — ♂</option>
                                        <option value="es-HN-KarlaNeural">Karla — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇳🇮 Nicaragua">
                                        <option value="es-NI-FedericoNeural">Federico — ♂</option>
                                        <option value="es-NI-YolandaNeural">Yolanda — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇵🇷 Puerto Rico">
                                        <option value="es-PR-VictorNeural">Victor — ♂</option>
                                        <option value="es-PR-KarinaNeural">Karina — ♀</option>
                                    </optgroup>
                                    <optgroup label="🇬🇶 Guinea Ecuatorial">
                                        <option value="es-GQ-JavierNeural">Javier — ♂</option>
                                        <option value="es-GQ-TeresaNeural">Teresa — ♀</option>
                                    </optgroup>
                    </select>
                </div>` : ''}
            </label>
            <label id="exp-lbl-browser" style="flex:1;border:1px solid ${!xttsOk ? '#c8a96e' : '#2a2a2a'};
                   border-radius:6px;padding:10px 12px;cursor:pointer;
                   background:${!xttsOk ? 'rgba(200,169,110,.07)' : '#0d0d0d'};transition:all .2s;">
                <input type="radio" name="exp-tts" value="browser"
                       ${!xttsOk ? 'checked' : ''}
                       onchange="_expTtsChange()" style="accent-color:#c8a96e;margin-right:5px;">
                <span style="font-size:.6rem;">Sin audio</span><br>
                <span style="font-size:.53rem;color:#555;">Solo imagen + texto</span>
            </label>
            <label id="exp-lbl-audioonly" style="flex:1;border:1px solid ${xttsOk ? '#2a2a2a' : '#2a2a2a'};
                   border-radius:6px;padding:10px 12px;cursor:pointer;
                   background:#0d0d0d;transition:all .2s;"
                   title="${xttsOk ? '' : 'Requiere servidor activo'}">
                <input type="radio" name="exp-tts" value="audioonly"
                       ${xttsOk ? '' : 'disabled'}
                       onchange="_expTtsChange()" style="accent-color:#c8a96e;margin-right:5px;">
                <span style="font-size:.6rem;${xttsOk ? '' : 'color:#444;'}">Solo audio</span><br>
                <span style="font-size:.53rem;color:${xttsOk ? '#7eb89a' : '#444'};">
                    ${xttsOk ? '● Exporta .wav' : '○ Necesita servidor'}
                </span>
            </label>
        </div>

        <!-- Info -->
        <div style="background:#0d0d0d;border-radius:6px;padding:11px 14px;
                    font-size:.57rem;color:#666;line-height:2;margin-bottom:18px;">
            <span>📝 Frases: <b style="color:#e8e0d0">${sentences.length}</b></span> &nbsp;·&nbsp;
            <span>🖼 Grupos:
                <span style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;">
                    <button onclick="_expCambiarGrupos(-1)"
                            style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;color:#888;font-size:.65rem;width:18px;height:18px;line-height:1;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;">−</button>
                    <b id="exp-grupos-val" style="color:#c8a96e;min-width:20px;text-align:center;">${grupos}</b>
                    <button onclick="_expCambiarGrupos(1)"
                            style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;color:#888;font-size:.65rem;width:18px;height:18px;line-height:1;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;">+</button>
                    <span id="exp-fxg-val" style="color:#444;font-size:.5rem;">(${EXPORT_IMGS_PER} fr/img)</span>
                </span>
            </span> &nbsp;·&nbsp;
            <span>⏱ ~<b style="color:#e8e0d0">${durEst} min</b></span><br>
            <span style="color:#555;">💾 </span><span style="color:#c8a96e;word-break:break-all;">${fileName}</span>
        </div>

        <!-- Aviso sin audio -->
        <div id="exp-browser-warning" style="display:${!xttsOk ? 'block' : 'none'};
             background:rgba(255,180,0,.06);border:1px solid rgba(255,180,0,.18);
             border-radius:6px;padding:9px 12px;font-size:.55rem;color:#d4a840;
             margin-bottom:16px;line-height:1.8;">
            ⚠ Sin servidor XTTS el video se exporta <b>sin audio</b>.<br>
            Duración de frase fija: ${EXPORT_SEC_FRASE}s · total ~${durEst} min.
        </div>

        <!-- Botones -->
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
            <button onclick="_cerrarModalExport()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#666;font-size:.58rem;padding:8px 16px;cursor:pointer;">
                Cancelar
            </button>
            <button onclick="_pasarASeleccionImagenes()"
                    id="exp-btn-next"
                    style="background:#1e1e1e;border:1px solid #c8a96e;border-radius:5px;
                           color:#c8a96e;font-size:.58rem;padding:8px 18px;cursor:pointer;">
                Siguiente → Elegir imágenes
            </button>
        </div>
    </div>`;
    document.body.appendChild(m);
    // Sincronizar selector de voz con el valor guardado
    const _expVoiceSel = document.getElementById('exp-voice-select');
    if (_expVoiceSel && typeof _edgeTtsVoice !== 'undefined') _expVoiceSel.value = _edgeTtsVoice;
}

function _expCambiarGrupos(delta) {
    const total = sentences.length;
    // Calcular nuevo EXPORT_IMGS_PER: grupos+delta → frases/grupo = ceil(total / nuevosGrupos)
    const gruposActuales = Math.ceil(total / EXPORT_IMGS_PER);
    const nuevosGrupos = Math.max(1, Math.min(total, gruposActuales + delta));
    EXPORT_IMGS_PER = Math.ceil(total / nuevosGrupos);
    // Actualizar display
    const realGrupos = Math.ceil(total / EXPORT_IMGS_PER);
    const gVal = document.getElementById('exp-grupos-val');
    const fVal = document.getElementById('exp-fxg-val');
    if (gVal) gVal.textContent = realGrupos;
    if (fVal) fVal.textContent = `(${EXPORT_IMGS_PER} fr/img)`;
}

function _expTtsChange() {
    const val = document.querySelector('input[name="exp-tts"]:checked')?.value;
    const warn = document.getElementById('exp-browser-warning');
    if (warn) warn.style.display = (val === 'browser') ? 'block' : 'none';
    const btnNext = document.getElementById('exp-btn-next');
    if (btnNext) {
        if (val === 'audioonly') {
            btnNext.textContent = '▶ Siguiente → Opciones de audio';
            btnNext.onclick = _abrirModalSoloAudio;
        } else {
            btnNext.textContent = 'Siguiente → Elegir imágenes';
            btnNext.onclick = _pasarASeleccionImagenes;
        }
    }
    ['xtts', 'browser', 'audioonly'].forEach(v => {
        const lbl = document.getElementById(`exp-lbl-${v}`);
        if (!lbl) return;
        lbl.style.borderColor = (val === v) ? '#c8a96e' : '#2a2a2a';
        lbl.style.background = (val === v) ? 'rgba(200,169,110,.07)' : '#0d0d0d';
    });
}

// ───────────────────────────────────────────────────────────────────
// PASO 2 — SELECCIÓN MANUAL DE IMÁGENES
// ───────────────────────────────────────────────────────────────────
async function _pasarASeleccionImagenes() {
    // Capturar el modo TTS AHORA — el radio input desaparece cuando se reemplaza el modal
    _expTtsMode = document.querySelector('input[name="exp-tts"]:checked')?.value || 'browser';

    const btnNext = document.getElementById('exp-btn-next');
    if (btnNext) { btnNext.disabled = true; btnNext.textContent = '⏳ Cargando imágenes…'; }

    // Construir smart pool si hace falta
    if (typeof construirSmartPool === 'function' &&
        (typeof _smartPoolLoaded === 'undefined' || !_smartPoolLoaded)) {
        try { await construirSmartPool(); } catch (e) { }
    }

    // Limpiar historial de URLs ya usadas para que cada export parta desde cero
    if (typeof limpiarUsadasSmartPool === 'function') limpiarUsadasSmartPool();

    const total = sentences.length;
    const grupos = Math.ceil(total / EXPORT_IMGS_PER);
    _expImagenes = [];

    // Pre-cargar sugerencia automática para cada grupo usando el proveedor activo
    for (let g = 0; g < grupos; g++) {
        const desde = g * EXPORT_IMGS_PER;
        const hasta = Math.min(desde + EXPORT_IMGS_PER, total);
        const fragmento = sentences.slice(desde, hasta).join(' ');
        let url = null;
        try {
            // Usar _pedirImagen de images.js: respeta el proveedor activo (Openverse, Pixabay, etc.)
            if (typeof _pedirImagen === 'function') {
                url = await _pedirImagen(fragmento);
            }
        } catch (e) { }
        if (!url) url = `https://picsum.photos/seed/${g * 13 + 7}/${EXPORT_W}/${EXPORT_H}`;
        _expImagenes.push({ url, img: null, grupo: g, fragmento, offsetX: 0, offsetY: 0 });
        if (btnNext) btnNext.textContent = `⏳ Cargando ${g + 1}/${grupos}…`;
        await new Promise(r => setTimeout(r, 0)); // no bloquear UI
    }

    _renderModalImagenes();
    _inicializarRanges();
}

function _renderModalImagenes() {
    _quitarModal();
    const grupos = _expImagenes.length;

    const m = document.createElement('div');
    m.id = 'export-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);
        display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;
        font-family:'DM Mono',monospace;padding:16px 12px;box-sizing:border-box;`;

    const grid = _expImagenes.map((item, g) => {
        const desde = g * EXPORT_IMGS_PER + 1;
        const hasta = Math.min((g + 1) * EXPORT_IMGS_PER, sentences.length);
        return `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;">
            <!-- Thumbnail con drag para centrar -->
            <div id="exp-thumb-wrap-${g}" style="position:relative;width:100%;padding-bottom:56.25%;background:#0d0d0d;overflow:hidden;cursor:grab;
                 background-image:url('${item.url}');background-size:cover;background-position:${50 + (item.offsetX || 0)}% ${50 + (item.offsetY || 0)}%;opacity:.85;"
                 onmousedown="_expDragStart(event,${g})" title="Arrastrá para reposicionar la imagen">
                <div style="position:absolute;top:4px;left:4px;font-size:.45rem;color:rgba(200,169,110,.6);
                            background:rgba(0,0,0,.5);border-radius:3px;padding:1px 4px;pointer-events:none;">
                    ✥ mover
                </div>
                <div style="position:absolute;bottom:0;left:0;right:0;
                            background:linear-gradient(transparent,rgba(0,0,0,.7));
                            padding:6px 8px;font-size:.5rem;color:#c8a96e;pointer-events:none;">
                    Frases ${desde}–${hasta}
                </div>
            </div>
            <!-- Snippet de texto -->
            <div style="padding:7px 9px;font-size:.5rem;color:#555;line-height:1.5;
                        height:40px;overflow:hidden;border-bottom:1px solid #1a1a1a;">
                ${_expImagenes[g].fragmento.slice(0, 80)}…
            </div>
            <!-- URL y controles -->
            <div style="padding:7px 9px;display:flex;gap:5px;align-items:center;">
                <input id="exp-url-${g}" type="text" value="${item.url}"
                       placeholder="URL de imagen…"
                       style="flex:1;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;
                              color:#e8e0d0;font-size:.5rem;padding:4px 7px;font-family:'DM Mono',monospace;"
                       onchange="_expCambiarUrl(${g}, this.value)">
                <button onclick="_expSugerirOtra(${g})" title="Sugerir otra automáticamente"
                        style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;
                               color:#888;font-size:.65rem;padding:4px 7px;cursor:pointer;
                               white-space:nowrap;">🔀</button>
                <button onclick="_expAbrirArchivoLocal(${g})" title="Cargar imagen desde tu PC"
                        style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;
                               color:#888;font-size:.65rem;padding:4px 7px;cursor:pointer;
                               white-space:nowrap;">📁</button>
                <input id="exp-file-input-${g}" type="file" accept="image/*"
                       style="display:none;"
                       onchange="_expCargarArchivoLocal(${g}, this)">
            </div>
        </div>`;
    }).join('');

    m.innerHTML = `
    <div style="width:100%;max-width:860px;">
        <!-- Header + botones ARRIBA -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.1em;">
                🖼 SELECCIÓN DE IMÁGENES — ${grupos} grupos
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <span style="font-size:.5rem;color:#555;margin-right:4px;">Editá la URL o pulsá 🔀 para sugerir otra</span>

                <!-- Botón carpeta local global -->
                <label id="exp-folder-label"
                       title="Cargá una carpeta con imágenes y se distribuyen automáticamente entre los grupos"
                       style="display:flex;align-items:center;gap:5px;cursor:pointer;
                              background:#1a1a1a;border:1px solid #3a3a3a;border-radius:5px;
                              color:#888;font-size:.54rem;padding:6px 11px;
                              transition:all .18s;white-space:nowrap;"
                       onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e'"
                       onmouseout="this.style.borderColor='#3a3a3a';this.style.color='#888'">
                    📂 Carpeta local
                    <input id="exp-folder-input" type="file" accept="image/*" multiple
                           webkitdirectory mozdirectory directory
                           style="display:none;"
                           onchange="_expCargarCarpetaLocal(this)">
                </label>
                <!-- Modo de asignación -->
                <select id="exp-folder-mode"
                        title="Modo de distribución de las imágenes de la carpeta"
                        onchange="_expReasignarCarpeta()"
                        style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;
                               color:#666;font-size:.5rem;padding:5px 6px;cursor:pointer;
                               font-family:'DM Mono',monospace;display:none;">
                    <option value="secuencial">En orden</option>
                    <option value="aleatorio">Aleatoria</option>
                    <option value="ciclico">Cíclico</option>
                </select>

                <button onclick="_abrirModalConfig()"
                        id="exp-btn-back"
                        style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                               color:#555;font-size:.57rem;padding:6px 12px;cursor:pointer;">
                    ← Atrás
                </button>
                <button onclick="_cerrarModalExport()"
                        style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                               color:#555;font-size:.57rem;padding:6px 12px;cursor:pointer;">
                    Cancelar
                </button>
                <button onclick="_abrirPreviewEfectos()"
                        id="exp-btn-start"
                        style="background:#c8a96e;border:none;border-radius:5px;
                               color:#0a0908;font-size:.58rem;font-weight:700;
                               padding:6px 18px;cursor:pointer;">
                    Siguiente → Preview
                </button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
                    gap:12px;margin-bottom:16px;">
            ${grid}
        </div>

        <!-- Barra de progreso (oculta al inicio) -->
        <div id="exp-progress-wrap" style="display:none;background:#111;border:1px solid #2a2a2a;
             border-radius:8px;padding:16px 18px;margin-bottom:16px;">
            <div style="font-size:.58rem;color:#888;margin-bottom:8px;" id="exp-phase-label">Iniciando...</div>
            <div style="background:#1a1a1a;border-radius:4px;height:5px;overflow:hidden;margin-bottom:4px;">
                <div id="exp-progress-bar"
                     style="height:100%;width:0%;background:#c8a96e;transition:width .25s;"></div>
            </div>
            <div style="font-size:.52rem;color:#444;text-align:right;" id="exp-progress-pct">0%</div>
        </div>
    </div>`;
    document.body.appendChild(m);

    // Ajustar altura de thumbnails si el grid desborda el viewport
    (function _adjustThumbHeight() {
        const gridEl = m.querySelector('div[style*="grid-template-columns"]');
        if (!gridEl) return;
        const thumbWraps = m.querySelectorAll('[id^="exp-thumb-wrap-"]');
        if (!thumbWraps.length) return;

        const HEADER_H = 60;
        const CARD_EXTRA = 90;
        const MIN_PCT = 25;
        const DEFAULT_PCT = 56.25;

        const applyPct = (pct) => {
            thumbWraps.forEach(w => { w.style.paddingBottom = pct + '%'; });
        };

        const recalc = () => {
            applyPct(DEFAULT_PCT);
            requestAnimationFrame(() => {
                const vh = window.innerHeight;
                const cols = Math.max(1, Math.round(gridEl.offsetWidth / 212));
                const rows = Math.ceil(thumbWraps.length / cols);
                const cardW = (gridEl.offsetWidth / cols) - 12;
                const thumbH_default = cardW * (DEFAULT_PCT / 100);
                const totalContentH = HEADER_H + rows * (thumbH_default + CARD_EXTRA) + 32;
                if (totalContentH <= vh) { applyPct(DEFAULT_PCT); return; }
                const availableForThumbs = vh - HEADER_H - rows * CARD_EXTRA - 32;
                const thumbHNeeded = availableForThumbs / rows;
                const pct = Math.max(MIN_PCT, (thumbHNeeded / cardW) * 100);
                applyPct(pct);
            });
        };

        recalc();
        const ro = new ResizeObserver(recalc);
        ro.observe(m);
        m._thumbRO = ro;
    })();

    // Precargar los HTMLImageElement en background
    _expImagenes.forEach((item, g) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { _expImagenes[g].img = img; };
        img.src = item.url;
    });
}

function _expCambiarUrl(g, url) {
    if (!url.trim()) return;
    _expImagenes[g].url = url.trim();
    // Actualizar thumbnail (ahora es background-image en el wrap div)
    const wrap = document.getElementById(`exp-thumb-wrap-${g}`);
    if (wrap) wrap.style.backgroundImage = `url('${url.trim()}')`;
    // Recargar HTMLImageElement para la exportación
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _expImagenes[g].img = img; };
    img.src = url.trim();
}

async function _expSugerirOtra(g) {
    let url = null;
    try {
        // Usar _pedirImagen de images.js: respeta el proveedor activo
        if (typeof _pedirImagen === 'function') {
            url = await _pedirImagen(_expImagenes[g].fragmento);
        }
    } catch (e) { }
    if (!url) url = `https://picsum.photos/seed/${Date.now() % 9999}/${EXPORT_W}/${EXPORT_H}`;
    const input = document.getElementById(`exp-url-${g}`);
    if (input) input.value = url;
    _expCambiarUrl(g, url);
}


function _expAbrirArchivoLocal(g) {
    const fileInput = document.getElementById(`exp-file-input-${g}`);
    if (fileInput) fileInput.click();
}

function _expCargarArchivoLocal(g, inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    // Actualizar thumbnail inmediatamente (background-image en wrap div)
    const wrap = document.getElementById(`exp-thumb-wrap-${g}`);
    if (wrap) wrap.style.backgroundImage = `url('${objectUrl}')`;
    // Actualizar campo URL con nombre del archivo
    const urlInput = document.getElementById(`exp-url-${g}`);
    if (urlInput) urlInput.value = `[local] ${file.name}`;
    // Cargar la imagen como HTMLImageElement para la exportación (sin crossOrigin para blobs)
    const img = new Image();
    img.onload = () => {
        _expImagenes[g].img = img;
        _expImagenes[g].url = objectUrl;
        _expImagenes[g].localBlob = true;
    };
    img.src = objectUrl;
}

// ───────────────────────────────────────────────────────────────────
// CARPETA LOCAL — carga múltiples imágenes y las distribuye entre grupos
// ───────────────────────────────────────────────────────────────────

// Extensiones de imagen aceptadas
const _EXP_IMG_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tiff', 'tif']);

function _expCargarCarpetaLocal(inputEl) {
    // Filtrar solo archivos de imagen válidos y ordenar por nombre
    const files = Array.from(inputEl.files || [])
        .filter(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return _EXP_IMG_EXTS.has(ext);
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (files.length === 0) {
        mostrarNotificacion('⚠ No se encontraron imágenes en la carpeta');
        return;
    }

    const grupos = _expImagenes.length;
    const modo = document.getElementById('exp-folder-mode')?.value || 'secuencial';

    // Construir lista de índices de archivo para cada grupo según el modo
    let indices = [];
    if (modo === 'aleatorio') {
        // Fisher-Yates sobre índices de archivos, replicados para cubrir todos los grupos
        const base = [];
        for (let i = 0; i < Math.ceil(grupos / files.length); i++) {
            for (let j = 0; j < files.length; j++) base.push(j);
        }
        for (let i = base.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [base[i], base[j]] = [base[j], base[i]];
        }
        indices = base.slice(0, grupos);
    } else if (modo === 'ciclico') {
        // Distribuye cíclicamente: grupo 0→img 0, grupo 1→img 1, ... vuelve al inicio
        for (let g = 0; g < grupos; g++) indices.push(g % files.length);
    } else {
        // Secuencial: reparte de forma proporcional; si hay más grupos que imágenes, repite
        for (let g = 0; g < grupos; g++) {
            indices.push(Math.min(Math.floor(g * files.length / grupos), files.length - 1));
        }
    }

    // Aplicar cada imagen al grupo correspondiente
    let cargadas = 0;
    indices.forEach((fileIdx, g) => {
        const file = files[fileIdx];
        const objectUrl = URL.createObjectURL(file);

        // Actualizar thumbnail visual
        const wrap = document.getElementById(`exp-thumb-wrap-${g}`);
        if (wrap) wrap.style.backgroundImage = `url('${objectUrl}')`;

        // Actualizar input de URL
        const urlInput = document.getElementById(`exp-url-${g}`);
        if (urlInput) urlInput.value = `[local] ${file.name}`;

        // Cargar HTMLImageElement para la exportación
        const img = new Image();
        img.onload = () => {
            _expImagenes[g].img = img;
            _expImagenes[g].url = objectUrl;
            _expImagenes[g].localBlob = true;
            cargadas++;
            if (cargadas === grupos) {
                mostrarNotificacion(`✓ ${files.length} imagen(s) asignada(s) a ${grupos} grupos`);
            }
        };
        img.onerror = () => { cargadas++; };
        img.src = objectUrl;
    });

    // Mostrar selector de modo y notificación
    const modeEl = document.getElementById('exp-folder-mode');
    if (modeEl) modeEl.style.display = 'block';

    // Actualizar label del botón con cantidad
    const lbl = document.getElementById('exp-folder-label');
    if (lbl) {
        // Preservar el input dentro, solo cambiar el texto visible
        const txt = lbl.childNodes[0];
        if (txt && txt.nodeType === Node.TEXT_NODE) {
            txt.textContent = `📂 ${files.length} img`;
        } else {
            lbl.firstChild.textContent = `📂 ${files.length} img`;
        }
        lbl.style.borderColor = '#7eb89a';
        lbl.style.color = '#7eb89a';
    }

    mostrarNotificacion(`⏳ Asignando ${files.length} imágenes a ${grupos} grupos…`);
}

// Reaplicar la carpeta con el nuevo modo cuando el usuario cambia el select
function _expReasignarCarpeta() {
    const inputEl = document.getElementById('exp-folder-input');
    if (inputEl && inputEl.files && inputEl.files.length > 0) {
        _expCargarCarpetaLocal(inputEl);
    }
}
function _quitarModal() {
    const m = document.getElementById('export-modal');
    if (m) {
        if (m._resizeObs) m._resizeObs.disconnect();
        if (m._thumbRO) m._thumbRO.disconnect();
        m.remove();
    }
    document.getElementById('exp-float-widget')?.remove();
}

function _cerrarModalExport() { _quitarModal(); }

function _expSetProgress(pct, label) {
    const bar = document.getElementById('exp-progress-bar');
    const lbl = document.getElementById('exp-phase-label');
    const pctEl = document.getElementById('exp-progress-pct');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = label;
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
}

// ───────────────────────────────────────────────────────────────────
// INICIO DEL PROCESO (llamado desde el modal de imágenes)
// ───────────────────────────────────────────────────────────────────
async function _iniciarExportacion() {
    // Usar el modo capturado en el paso 1 — el radio ya no existe en el DOM
    const ttsMode = _expTtsMode;
    // Congelar nombre del archivo ahora — el capítulo puede cambiar durante la exportación
    const chapSel = document.getElementById('chapters');
    const chapTxt = chapSel?.options[chapSel?.selectedIndex]?.text || 'capitulo';
    _expFileName = `${chapTxt.trim()} - ${EXPORT_SITE_TAG}`;

    _expCancelled = false;

    // ── Minimizar modal y mostrar widget flotante INMEDIATAMENTE ──
    // Antes de cualquier trabajo async para que el usuario vea el progreso
    // y el video overlay quede libre.
    const exportModal = document.getElementById('export-modal');
    if (exportModal) exportModal.style.display = 'none';

    // Quitar cualquier widget anterior
    document.getElementById('exp-float-widget')?.remove();

    const _floatWidget = document.createElement('div');
    _floatWidget.id = 'exp-float-widget';
    _floatWidget.style.cssText = `position:fixed;bottom:18px;right:18px;z-index:10000;
        background:rgba(10,9,8,.95);border:1px solid #333;border-radius:8px;
        padding:12px 16px;min-width:240px;font-family:'DM Mono',monospace;
        box-shadow:0 4px 24px rgba(0,0,0,.6);`;
    _floatWidget.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
            <span style="font-size:.55rem;color:#c8a96e;letter-spacing:.08em;">⬇ EXPORTANDO</span>
            <button id="exp-float-cancel" title="Cancelar"
                style="background:none;border:none;color:#555;cursor:pointer;font-size:.75rem;padding:0 2px;">✕</button>
        </div>
        <div id="exp-float-label" style="font-size:.52rem;color:#888;margin-bottom:6px;">Preparando…</div>
        <div style="background:#1a1a1a;border-radius:3px;height:4px;overflow:hidden;margin-bottom:4px;">
            <div id="exp-float-bar" style="height:100%;width:0%;background:#c8a96e;transition:width .4s;"></div>
        </div>
        <div id="exp-float-pct" style="font-size:.5rem;color:#555;text-align:right;">0%</div>`;
    document.body.appendChild(_floatWidget);

    document.getElementById('exp-float-cancel').onclick = () => {
        _expCancelled = true;
        window._exportEnCurso = false;

        mostrarNotificacion('✕ Exportación cancelada');
    };

    // Redirigir _expSetProgress al widget desde ahora
    const _updateWidget = (pct, label) => {
        const bar = document.getElementById('exp-float-bar');
        const lbl = document.getElementById('exp-float-label');
        const pctEl = document.getElementById('exp-float-pct');
        if (bar) bar.style.width = pct + '%';
        if (lbl) lbl.textContent = label;
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    };

    // Dar un frame al browser para pintar el widget antes de empezar el trabajo
    await new Promise(r => setTimeout(r, 80));

    try {
        _updateWidget(2, '🖼 Verificando imágenes…');
        await _expEsperarImagenes();
        if (_expCancelled) return;

        let audioBuffers = null;
        if (ttsMode === 'xtts') {
            // Reutilizar buffers pre-generados si existen
            if (typeof _expTtsBuffers !== 'undefined' && _expTtsBuffers && _expTtsBuffers.length === sentences.length) {
                _updateWidget(10, '✓ Audio TTS pre-generado — reutilizando…');
                audioBuffers = _expTtsBuffers;
                _expTtsBuffers = null;
            } else {
                _updateWidget(5, '🔌 Verificando servidor TTS…');
                let servidorOk = false;
                try {
                    const hRes = await fetch(`${TTS_API_URL}/health`, { method: 'GET' });
                    servidorOk = hRes.ok;
                    if (servidorOk) servidorTTSDisponible = true;
                } catch (e) { servidorOk = false; }

                if (!servidorOk) {
                    mostrarNotificacion('⚠ Servidor XTTS no responde — exportando sin audio');
                } else {
                    let _ttsPausadoPorExport = false;
                    if (typeof isReading !== 'undefined' && isReading) {
                        if (typeof pausarTTS === 'function') pausarTTS();
                        _ttsPausadoPorExport = true;
                        if (typeof _limpiarTTSCache === 'function') await _limpiarTTSCache();
                        await new Promise(r => setTimeout(r, 600));
                    }

                    window._exportEnCurso = true;
                    audioBuffers = await _expGenerarAudioXTTSWidget(_updateWidget);
                    window._exportEnCurso = false;

                    if (_ttsPausadoPorExport && typeof reanudarTTS === 'function') reanudarTTS();
                    if (_expCancelled) { return; }
                }
            } // end else (no pre-generados)
        }

        _updateWidget(audioBuffers ? 55 : 10, '🎬 Renderizando video…');
        await _expRenderizar(audioBuffers, _updateWidget);


    } catch (err) {
        window._exportEnCurso = false;

        console.error('[export]', err);
        mostrarNotificacion('⚠ Error: ' + err.message);
        _cerrarModalExport();
    }
}

async function _expEsperarImagenes() {
    const pending = _expImagenes.filter(item => !item.img);
    if (pending.length === 0) return;
    await Promise.all(pending.map(item => new Promise(resolve => {
        if (item.img) { resolve(); return; }
        const img = new Image();
        // No usar crossOrigin en blobs locales (causa error CORS)
        if (!item.localBlob) img.crossOrigin = 'anonymous';
        img.onload = () => { item.img = img; resolve(); };
        img.onerror = () => resolve(); // continuar aunque falle
        img.src = item.url;
    })));
}

// ───────────────────────────────────────────────────────────────────
// FASE AUDIO — XTTS
// ───────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────
// MODAL DEDICADO SOLO AUDIO — WAV o MP3
// ───────────────────────────────────────────────────────────────────
function _abrirModalSoloAudio() {
    _quitarModal();
    const chapSel = document.getElementById('chapters');
    const chapTxt = chapSel?.options[chapSel?.selectedIndex]?.text || 'capitulo';
    _expFileName = `${chapTxt.trim()} - ${EXPORT_SITE_TAG}`;

    const durEst = Math.round(sentences.length * 0.07); // ~4s/frase estimado en minutos

    const m = document.createElement('div');
    m.id = 'export-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);
        display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;`;

    m.innerHTML = `
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;
                padding:28px 30px;width:420px;max-width:95vw;max-height:95vh;overflow-y:auto;color:#e8e0d0;">

        <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.12em;margin-bottom:4px;">🔊 EXPORTAR AUDIO</div>
        <div style="font-size:.47rem;color:#444;margin-bottom:22px;">
            ${sentences.length} frases · ~${durEst} min · ${_expFileName}
        </div>

        <!-- Formato -->
        <div style="font-size:.55rem;color:#666;margin-bottom:10px;">Formato de salida</div>
        <div style="display:flex;gap:10px;margin-bottom:22px;">

            <label id="aud-lbl-wav" style="flex:1;border:1px solid #2a2a2a;border-radius:8px;
                   padding:14px 14px;cursor:pointer;background:#0d0d0d;transition:all .2s;">
                <input type="radio" name="aud-fmt" value="wav" checked
                       onchange="_audFmtChange()" style="accent-color:#c8a96e;margin-right:6px;">
                <span style="font-size:.6rem;font-weight:700;">WAV</span><br>
                <span style="font-size:.47rem;color:#555;margin-top:4px;display:block;line-height:1.6;">
                    Sin compresión<br>
                    Descarga inmediata<br>
                    <span style="color:#666;">Mayor tamaño</span>
                </span>
            </label>

            <label id="aud-lbl-mp3" style="flex:1;border:1px solid #2a2a2a;border-radius:8px;
                   padding:14px 14px;cursor:pointer;background:#0d0d0d;transition:all .2s;">
                <input type="radio" name="aud-fmt" value="mp3"
                       onchange="_audFmtChange()" style="accent-color:#c8a96e;margin-right:6px;">
                <span style="font-size:.6rem;font-weight:700;">MP3</span><br>
                <span style="font-size:.47rem;color:#555;margin-top:4px;display:block;line-height:1.6;">
                    Comprimido · portable<br>
                    <span style="color:#666;">~25s extra (FFmpeg.wasm)</span><br>
                    <span id="aud-mp3-bitrate-row" style="display:none;">
                        Bitrate:
                        <select id="aud-mp3-bitrate"
                            style="background:#0d0d0d;border:1px solid rgba(200,169,110,.3);
                                   border-radius:3px;color:#c8a96e;font-family:'DM Mono',monospace;
                                   font-size:.47rem;padding:1px 4px;outline:none;cursor:pointer;">
                            <option value="320k">320 kbps (máxima)</option>
                            <option value="192k" selected>192 kbps (alta)</option>
                            <option value="128k">128 kbps (estándar)</option>
                            <option value="96k">96 kbps (ligero)</option>
                        </select>
                    </span>
                </span>
            </label>
        </div>

        <div style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);
                    border-radius:6px;padding:8px 12px;font-size:.46rem;color:#555;
                    margin-bottom:20px;line-height:1.7;">
            ℹ El audio se genera con XTTS v2 / Edge TTS frase por frase.<br>
            Los archivos <b style="color:#666;">nunca salen de tu dispositivo</b>.
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="_abrirModalConfig()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-size:.57rem;padding:8px 14px;cursor:pointer;">
                ← Atrás
            </button>
            <button onclick="_cerrarModalExport()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-size:.57rem;padding:8px 14px;cursor:pointer;">
                Cancelar
            </button>
            <button id="aud-btn-export"
                    onclick="_exportarSoloAudioDesdeModal()"
                    style="background:#1e1e1e;border:1px solid #c8a96e;border-radius:5px;
                           color:#c8a96e;font-size:.58rem;font-weight:700;
                           padding:8px 18px;cursor:pointer;">
                ▶ Exportar
            </button>
        </div>
    </div>`;

    document.body.appendChild(m);
    _audFmtChange(); // estado inicial
}

function _exportarSoloAudioDesdeModal() {
    const fmt = document.querySelector('input[name="aud-fmt"]:checked')?.value || 'wav';
    const bitrate = document.getElementById('aud-mp3-bitrate')?.value || '192k';
    _exportarSoloAudio(fmt, bitrate);
}

function _audFmtChange() {
    const val = document.querySelector('input[name="aud-fmt"]:checked')?.value;
    ['wav', 'mp3'].forEach(v => {
        const lbl = document.getElementById(`aud-lbl-${v}`);
        if (!lbl) return;
        lbl.style.borderColor = val === v ? '#c8a96e' : '#2a2a2a';
        lbl.style.background = val === v ? 'rgba(200,169,110,.07)' : '#0d0d0d';
    });
    // Mostrar selector de bitrate solo con MP3
    const bitrateRow = document.getElementById('aud-mp3-bitrate-row');
    if (bitrateRow) bitrateRow.style.display = val === 'mp3' ? 'inline' : 'none';
    // Actualizar texto del botón
    const btn = document.getElementById('aud-btn-export');
    if (btn) btn.textContent = val === 'mp3' ? '▶ Exportar MP3' : '▶ Exportar WAV';
}

// ───────────────────────────────────────────────────────────────────
// EXPORTAR SOLO AUDIO — genera WAV y opcionalmente convierte a MP3
// ───────────────────────────────────────────────────────────────────
async function _exportarSoloAudio(formato = 'wav', mp3Bitrate = '192k') {
    _expCancelled = false;
    _quitarModal();

    // Widget flotante
    document.getElementById('exp-float-widget')?.remove();
    const _floatWidget = document.createElement('div');
    _floatWidget.id = 'exp-float-widget';
    _floatWidget.style.cssText = `position:fixed;bottom:18px;right:18px;z-index:10000;
        background:rgba(10,9,8,.95);border:1px solid #333;border-radius:8px;
        padding:12px 16px;min-width:240px;font-family:'DM Mono',monospace;
        box-shadow:0 4px 24px rgba(0,0,0,.6);`;
    _floatWidget.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
            <span style="font-size:.55rem;color:#c8a96e;letter-spacing:.08em;">🔊 EXPORTANDO AUDIO</span>
            <button id="exp-float-cancel" title="Cancelar"
                style="background:none;border:none;color:#555;cursor:pointer;font-size:.75rem;padding:0 2px;">✕</button>
        </div>
        <div id="exp-float-label" style="font-size:.52rem;color:#888;margin-bottom:6px;">Preparando…</div>
        <div style="background:#1a1a1a;border-radius:3px;height:4px;overflow:hidden;margin-bottom:4px;">
            <div id="exp-float-bar" style="height:100%;width:0%;background:#c8a96e;transition:width .4s;"></div>
        </div>
        <div id="exp-float-pct" style="font-size:.5rem;color:#555;text-align:right;">0%</div>`;
    document.body.appendChild(_floatWidget);

    document.getElementById('exp-float-cancel').onclick = () => {
        _expCancelled = true;
        window._exportEnCurso = false;
        mostrarNotificacion('✕ Exportación cancelada');
    };

    const _updateWidget = (pct, label) => {
        const bar = document.getElementById('exp-float-bar');
        const lbl = document.getElementById('exp-float-label');
        const pctEl = document.getElementById('exp-float-pct');
        if (bar) bar.style.width = pct + '%';
        if (lbl) lbl.textContent = label;
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    };

    await new Promise(r => setTimeout(r, 80));

    try {
        // Verificar servidor
        _updateWidget(2, '🔌 Verificando servidor TTS…');
        const hRes = await fetch(`${TTS_API_URL}/health`, { method: 'GET' });
        if (!hRes.ok) throw new Error('Servidor TTS no responde');

        // Pausar TTS si está reproduciendo
        let _ttsPausado = false;
        if (typeof isReading !== 'undefined' && isReading) {
            if (typeof pausarTTS === 'function') pausarTTS();
            _ttsPausado = true;
            if (typeof _limpiarTTSCache === 'function') await _limpiarTTSCache();
            await new Promise(r => setTimeout(r, 600));
        }

        // Generar audio frase por frase (batch de 4)
        window._exportEnCurso = true;
        const audioBuffers = await _expGenerarAudioXTTSWidget(_updateWidget);
        window._exportEnCurso = false;

        if (_ttsPausado && typeof reanudarTTS === 'function') reanudarTTS();
        if (_expCancelled) return;

        // Calcular duraciones reales
        _updateWidget(58, '🎵 Mezclando audio…');
        const total = sentences.length;
        const duraciones = new Array(total).fill(EXPORT_SEC_FRASE);
        const tmpCtx = new AudioContext();
        for (let i = 0; i < total; i++) {
            if (!audioBuffers[i]) continue;
            try {
                const dec = await tmpCtx.decodeAudioData(audioBuffers[i].slice(0));
                duraciones[i] = dec.duration + 0.15;
            } catch (e) { }
        }
        tmpCtx.close();

        // Mezclar en WAV
        const wavBlob = await _expMezclarAudio(audioBuffers, duraciones);
        if (!wavBlob) throw new Error('Error al mezclar audio');

        if (_expCancelled) return;

        if (_expCancelled) return;

        // Descargar o convertir a MP3
        if (formato === 'mp3') {
            _updateWidget(92, '🔄 Convirtiendo a MP3…');
            document.getElementById('exp-float-widget')?.remove();
            // Delegar a convert_mp3.js
            if (typeof convertirWAVaMP3 === 'function') {
                await convertirWAVaMP3(wavBlob, _expFileName, mp3Bitrate);
            } else {
                // Fallback: descargar WAV si convert_mp3.js no está cargado
                mostrarNotificacion('⚠ convert_mp3.js no disponible — descargando WAV');
                const url = URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url; a.download = `${_expFileName}.wav`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 8000);
            }
        } else {
            _updateWidget(100, '✓ Preparando descarga…');
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${_expFileName}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 8000);
            mostrarNotificacion('✓ Audio WAV exportado correctamente');
            document.getElementById('exp-float-widget')?.remove();
        }

    } catch (err) {
        window._exportEnCurso = false;
        console.error('[export audio]', err);
        mostrarNotificacion('⚠ Error: ' + err.message);
        document.getElementById('exp-float-widget')?.remove();
    }
}


// ───────────────────────────────────────────────────────────────────
// DRAG para reposicionar imágenes en el grid
// ───────────────────────────────────────────────────────────────────
let _expDragState = null;

function _expDragStart(e, g) {
    e.preventDefault();
    const wrap = document.getElementById(`exp-thumb-wrap-${g}`);
    if (!wrap) return;

    wrap.style.cursor = 'grabbing';
    _expDragState = {
        g,
        startX: e.clientX,
        startY: e.clientY,
        baseOffX: _expImagenes[g].offsetX || 0,
        baseOffY: _expImagenes[g].offsetY || 0,
    };

    const onMove = (ev) => {
        if (!_expDragState) return;
        const dx = ev.clientX - _expDragState.startX;
        const dy = ev.clientY - _expDragState.startY;
        const maxOff = 40;
        const nx = Math.max(-maxOff, Math.min(maxOff, _expDragState.baseOffX + dx * 0.25));
        const ny = Math.max(-maxOff, Math.min(maxOff, _expDragState.baseOffY + dy * 0.25));
        _expImagenes[g].offsetX = nx;
        _expImagenes[g].offsetY = ny;
        wrap.style.backgroundPosition = `${50 + nx}% ${50 + ny}%`;
    };

    const onUp = () => {
        if (_expDragState) {
            const w = document.getElementById(`exp-thumb-wrap-${_expDragState.g}`);
            if (w) w.style.cursor = 'grab';
        }
        _expDragState = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}



// ───────────────────────────────────────────────────────────────────
// PASO 3 — PREVIEW DE EFECTOS
// ───────────────────────────────────────────────────────────────────
function _abrirPreviewEfectos() {
    // Sincronizar _expEffects con variables globales del visor
    _expEffects.grayscale = (typeof _grayscaleActive !== 'undefined') ? _grayscaleActive : false;
    _expEffects.vignette = (typeof _vignetteEnabled !== 'undefined') ? _vignetteEnabled : true;
    _expEffects.imgOpacity = (typeof _videoTextOpacity !== 'undefined') ? _videoTextOpacity * 0.58 : 0.58;
    _expEffects.textColor = (typeof _videoTextColor !== 'undefined') ? _videoTextColor : '#c8a96e';
    _expEffects.textOpacity = (typeof _videoTextOpacity !== 'undefined') ? _videoTextOpacity : 1.0;

    if (_expImageRanges.length !== _expImagenes.length) _inicializarRanges();

    // Inyectar CSS dedicado (una sola vez)
    if (!document.getElementById('exp-preview-style')) {
        const st = document.createElement('style');
        st.id = 'exp-preview-style';
        st.textContent = `
        #export-modal {
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            background: #0a0908 !important;
            font-family: 'DM Mono', monospace !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            color: #e8e0d0 !important;
        }
        #exp-topbar {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 16px;
            border-bottom: 1px solid #1e1e1e;
        }
        #exp-body {
            flex: 1 1 0;
            min-height: 0;
            display: flex;
            gap: 12px;
            padding: 10px 14px 8px;
            overflow: hidden;
        }
        #exp-left-col {
            flex: 1 1 0;
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            gap: 7px;
            overflow: hidden;
        }
        #exp-canvas-wrap {
            flex: 1 1 0;
            min-height: 0;
            background: #000;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #exp-canvas-wrap canvas {
            max-width: 100%;
            max-height: 100%;
            display: block;
        }
        #exp-playback-row {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #exp-timeline-wrap {
            flex-shrink: 0;
            background: #0d0d0d;
            border: 1px solid #1e1e1e;
            border-radius: 6px;
            padding: 7px 10px;
        }
        #exp-right-panel {
            flex: 0 0 256px;
            min-height: 0;
            display: flex;
            flex-direction: column;
            gap: 5px;
            overflow-y: auto;
            padding-bottom: 4px;
        }
        #exp-right-panel::-webkit-scrollbar { width: 3px; }
        #exp-right-panel::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        #exp-tl-toolbar {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-bottom: 1px solid #1e1e1e;
        }
        #exp-audio-tracks { padding: 0; }
        /* Cada track row = [controles fijos] + [canvas scrollable] */
        .exp-track-row {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
        }
        /* Columna izquierda: label + vol + mute + del — ancho fijo, no scrollea */
        .exp-track-controls {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            width: 200px;
            padding: 0 6px 0 10px;
        }
        .exp-track-label {
            font-size: .42rem;
            color: #888;
            width: 66px;
            flex-shrink: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        /* Columna derecha: solo el canvas, se alinea con el scroll wrapper de arriba */
        .exp-track-canvas-col {
            flex: 1;
            min-width: 0;
            overflow: hidden; /* el scroll lo maneja el wrapper padre */
        }
        .exp-track-canvas-wrap {
            width: 100%;
            position: relative;
            height: 100%;   /* hereda del canvasRow — NO fijar aquí */
            border-radius: 3px;
            background: #0a0a0a;
            border: 1px solid #1e1e1e;
            cursor: pointer;
            overflow: visible;
        }
        .exp-track-canvas-wrap canvas { display:block; width:100%; height:100%; }
        /* Scrollbars discretos */
        #exp-tl-scroll-wrap,
        #exp-img-tl-scroll-wrap {
            scrollbar-width: thin;
            scrollbar-color: #2a2a2a transparent;
        }
        #exp-tl-scroll-wrap::-webkit-scrollbar,
        #exp-img-tl-scroll-wrap::-webkit-scrollbar { height: 3px; }
        #exp-tl-scroll-wrap::-webkit-scrollbar-thumb,
        #exp-img-tl-scroll-wrap::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        #exp-tl-scroll-wrap::-webkit-scrollbar-track,
        #exp-img-tl-scroll-wrap::-webkit-scrollbar-track { background: transparent; }
        .exp-tl-btn {
            background: none;
            border: 1px solid #2a2a2a;
            border-radius: 4px;
            color: #666;
            font-family: 'DM Mono', monospace;
            font-size: .47rem;
            padding: 3px 8px;
            cursor: pointer;
            transition: all .15s;
            white-space: nowrap;
        }
        .exp-tl-btn:hover { border-color: #c8a96e; color: #c8a96e; }
        .exp-tl-btn.active { border-color: #c8a96e; color: #c8a96e; }
        .exp-tl-btn.danger:hover { border-color: #cc6655; color: #cc6655; }

        .exp-img-tl-wrap { padding: 3px 10px 7px; border-top: 1px solid #1e1e1e; }
        .exp-img-tl-inner { margin-left: 72px; }
        #exp-img-timeline-inner { width: 100%; display: block; cursor: pointer; }
        .exp-fade-tooltip {
            position: fixed;
            background: #111;
            border: 1px solid #3a3a3a;
            border-radius: 4px;
            padding: 3px 8px;
            font-size: .44rem;
            color: #c8a96e;
            pointer-events: none;
            z-index: 99999;
            display: none;
            white-space: nowrap;
            font-family: 'DM Mono', monospace;
        }
        .exp-ctx-menu {
            position: fixed;
            background: #111;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            padding: 4px 0;
            z-index: 99999;
            min-width: 150px;
            box-shadow: 0 8px 24px rgba(0,0,0,.7);
            display: none;
            font-family: 'DM Mono', monospace;
        }
        .exp-ctx-item { padding: 6px 14px; font-size: .51rem; color: #888; cursor: pointer; transition: background .1s, color .1s; }
        .exp-ctx-item:hover { background: #1a1a1a; color: #e8e0d0; }
        .exp-ctx-item.danger:hover { color: #cc6655; }
        .exp-ctx-sep { border-top: 1px solid #1e1e1e; margin: 3px 0; }
        `;
        document.head.appendChild(st);
    }

    _quitarModal();
    const m = document.createElement('div');
    m.id = 'export-modal';

    m.innerHTML = `
        <div id="exp-topbar">
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
                <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.1em;white-space:nowrap;">🎨 PREVIEW — EFECTOS DE VIDEO</div>
                <div style="font-size:.47rem;color:#444;white-space:nowrap;">Los efectos se aplican a todo el video</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                <button onclick="_expStopPlay();_renderModalImagenes()"
                        style="background:none;border:1px solid #2a2a2a;border-radius:5px;color:#555;font-family:'DM Mono',monospace;font-size:.56rem;padding:5px 14px;cursor:pointer;transition:all .15s;"
                        onmouseover="this.style.borderColor='#555';this.style.color='#e8e0d0'"
                        onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">← Atrás</button>
                <button onclick="_expStopPlay();_cerrarModalExport()"
                        style="background:none;border:1px solid #2a2a2a;border-radius:5px;color:#555;font-family:'DM Mono',monospace;font-size:.56rem;padding:5px 14px;cursor:pointer;transition:all .15s;"
                        onmouseover="this.style.borderColor='#555';this.style.color='#e8e0d0'"
                        onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">Cancelar</button>
                <button onclick="_expStopPlay();_iniciarExportacion()"
                        style="background:#c8a96e;border:none;border-radius:5px;color:#0a0908;font-family:'DM Mono',monospace;font-size:.57rem;font-weight:700;padding:5px 18px;cursor:pointer;transition:opacity .15s;"
                        onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">▶ Exportar</button>
            </div>
        </div>

        <div id="exp-body">

            <div id="exp-left-col">
                <div id="exp-canvas-wrap">
                    <canvas id="exp-preview-canvas"></canvas>
                </div>

                <div id="exp-playback-row">
                    <button id="exp-play-btn" onclick="_expTogglePlay()"
                            style="background:#1a1a1a;border:1px solid #3a3a3a;border-radius:5px;
                                   color:#c8a96e;font-family:'DM Mono',monospace;font-size:.66rem;
                                   padding:4px 14px;cursor:pointer;min-width:68px;transition:all .15s;"
                            onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.07)'"
                            onmouseout="this.style.borderColor='#3a3a3a';this.style.background='#1a1a1a'">▶ Play</button>
                    <button id="exp-restart-btn" onclick="_expRestartPlay()"
                            title="Volver al inicio"
                            style="background:#1a1a1a;border:1px solid #3a3a3a;border-radius:5px;
                                   color:#888;font-family:'DM Mono',monospace;font-size:.66rem;
                                   padding:4px 10px;cursor:pointer;transition:all .15s;margin-left:4px;"
                            onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e';this.style.background='rgba(200,169,110,.07)'"
                            onmouseout="this.style.borderColor='#3a3a3a';this.style.color='#888';this.style.background='#1a1a1a'">⏮</button>
                    <span id="exp-play-counter" style="font-size:11px;color:#666;">Frase 1 / ${sentences.length}</span>
                    <div style="flex:1;"></div>
                    <span style="font-size:10px;color:#555;">Arrastrá los bordes del timeline para reasignar imágenes</span>
                </div>

                <div id="exp-timeline-wrap">
                    <div id="exp-tl-toolbar">
                        <span style="font-size:10px;color:#666;letter-spacing:.07em;text-transform:uppercase;flex:1;">Timeline</span>
                        <button class="exp-tl-btn" id="exp-btn-split" onclick="_expAudioSetMode('split')" title="Click en un track para dividirlo">✂ Split</button>
                        <button class="exp-tl-btn danger" onclick="_expAudioDeleteSelected()" title="Eliminar segmento seleccionado">🗑 Eliminar</button>
                        <button class="exp-tl-btn" onclick="_expAudioUndoSplit()">↩ Deshacer</button>
                        <div style="display:flex;align-items:center;gap:4px;margin-left:6px;border-left:1px solid #1e1e1e;padding-left:6px;">
                            <button class="exp-tl-btn" onclick="_expZoomOut()" title="Alejar">−</button>
                            <span id="exp-zoom-label" style="font-size:10px;color:#666;min-width:26px;text-align:center;">1×</span>
                            <button class="exp-tl-btn" onclick="_expZoomIn()" title="Acercar">+</button>
                        </div>
                    </div>

                    <!-- Layout: [controles fijos 200px] + [canvas scrollable flex:1] -->
                    <div style="display:flex;padding-top:5px;">
                        <!-- Columna izquierda: labels y controles — NO scrollea -->
                        <div id="exp-tl-controls-col" style="flex-shrink:0;width:240px;padding-top:0;"></div>
                        <!-- Columna derecha: solo los canvas — scrollea -->
                        <div id="exp-tl-scroll-wrap" style="flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;">
                            <div id="exp-tl-scroll-inner" style="min-width:100%;">
                                <div id="exp-audio-tracks"></div>
                            </div>
                        </div>
                    </div>

                    <div class="exp-img-tl-wrap">
                        <div style="display:flex;">
                            <!-- Etiqueta alineada con los 200px de controles -->
                            <div style="flex-shrink:0;width:240px;padding:0 6px 0 10px;display:flex;align-items:center;box-sizing:border-box;">
                                <span style="font-size:10px;color:#666;letter-spacing:.07em;text-transform:uppercase;">Imágenes</span>
                            </div>
                            <!-- Canvas scrollable alineado con el área de canvas de tracks -->
                            <div id="exp-img-tl-scroll-wrap" style="flex:1;min-width:0;overflow-x:hidden;padding-right:10px;box-sizing:border-box;">
                                <div id="exp-img-tl-scroll-inner" style="min-width:100%;">
                                    <canvas id="exp-timeline-canvas" height="50"
                                            style="width:100%;display:block;cursor:pointer;"></canvas>
                                    <!-- Ruler de tiempo con marcador de posición -->
                                    <canvas id="exp-timeline-ruler" height="16"
                                            style="width:100%;display:block;pointer-events:none;"></canvas>
                                </div>
                            </div>
                        </div>
                        <div id="exp-timeline-hint" style="font-size:10px;color:#555;margin-top:2px;text-align:right;padding-left:200px;">
                            Click para ir a una frase · Arrastrá los separadores para cambiar rangos
                        </div>
                    </div>
                </div>
            </div>

            <div id="exp-right-panel">

                <!-- ══ SECCIÓN IMAGEN ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-imagen',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">IMAGEN</span>
                        <span id="sec-imagen-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-imagen" style="display:none;padding:11px 14px;">
                        <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">
                            <span style="font-size:.5rem;color:#888;">Blanco y negro</span>
                            <input type="checkbox" id="exp-fx-bw" ${_expEffects.grayscale ? 'checked' : ''}
                                   onchange="_expFxChange()" style="accent-color:#c8a96e;width:14px;height:14px;">
                        </label>
                        <div style="margin-bottom:9px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Opacidad imagen</span>
                                <span id="exp-fx-opacity-val" style="font-size:.5rem;color:#c8a96e;">${Math.round(_expEffects.imgOpacity * 100)}%</span>
                            </div>
                            <input type="range" id="exp-fx-opacity" min="5" max="100" value="${Math.round(_expEffects.imgOpacity * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                        <div style="margin-bottom:9px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Brillo</span>
                                <span id="exp-fx-brightness-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.brightness.toFixed(2)}</span>
                            </div>
                            <input type="range" id="exp-fx-brightness" min="50" max="200" value="${Math.round(_expEffects.brightness * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Contraste</span>
                                <span id="exp-fx-contrast-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.contrast.toFixed(2)}</span>
                            </div>
                            <input type="range" id="exp-fx-contrast" min="50" max="200" value="${Math.round(_expEffects.contrast * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                    </div>
                </div>

                <!-- ══ SECCIÓN ZOOM ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-zoom',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">ZOOM IMAGEN</span>
                        <span id="sec-zoom-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-zoom" style="display:none;padding:11px 14px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:.5rem;color:#888;">Zoom</span>
                            <span id="exp-fx-zoom-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.zoom.toFixed(2)}x</span>
                        </div>
                        <input type="range" id="exp-fx-zoom" min="100" max="200" value="${Math.round(_expEffects.zoom * 100)}"
                               oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                    </div>
                </div>

                <!-- ══ SECCIÓN VIÑETA ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-vineta',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">VIÑETA</span>
                        <span id="sec-vineta-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-vineta" style="display:none;padding:11px 14px;">
                        <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">
                            <span style="font-size:.5rem;color:#888;">Activar viñeta</span>
                            <input type="checkbox" id="exp-fx-vignette" ${_expEffects.vignette ? 'checked' : ''}
                                   onchange="_expFxChange()" style="accent-color:#c8a96e;width:14px;height:14px;">
                        </label>
                        <div style="margin-bottom:9px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Intensidad</span>
                                <span id="exp-fx-vigint-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.vigIntensity.toFixed(2)}</span>
                            </div>
                            <input type="range" id="exp-fx-vigint" min="0" max="100" value="${Math.round(_expEffects.vigIntensity * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Tamaño</span>
                                <span id="exp-fx-vigsize-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.vigSize.toFixed(2)}</span>
                            </div>
                            <input type="range" id="exp-fx-vigsize" min="50" max="120" value="${Math.round(_expEffects.vigSize * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                    </div>
                </div>

                <!-- ══ SECCIÓN TEXTO ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-texto',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">TEXTO</span>
                        <span id="sec-texto-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-texto" style="display:none;padding:11px 14px;">
                        <div style="margin-bottom:9px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Color texto</span>
                                <span id="exp-fx-textcolor-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.textColor}</span>
                            </div>
                            <input type="color" id="exp-fx-textcolor" value="${_expEffects.textColor}"
                                   oninput="_expFxChange()" style="width:100%;height:24px;border:1px solid #2a2a2a;border-radius:4px;background:#0d0d0d;cursor:pointer;">
                        </div>
                        <div style="margin-bottom:9px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:.5rem;color:#888;">Opacidad texto</span>
                                <span id="exp-fx-textopacity-val" style="font-size:.5rem;color:#c8a96e;">${Math.round(_expEffects.textOpacity * 100)}%</span>
                            </div>
                            <input type="range" id="exp-fx-textopacity" min="10" max="100" value="${Math.round(_expEffects.textOpacity * 100)}"
                                   oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                        </div>
                        <div style="border-top:1px solid #1e1e1e;padding-top:9px;">
                            <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">
                                <span style="font-size:.5rem;color:#888;">Borde de texto</span>
                                <input type="checkbox" id="exp-fx-stroke" ${_expEffects.strokeEnabled ? 'checked' : ''}
                                       onchange="_expFxChange()" style="accent-color:#c8a96e;width:14px;height:14px;">
                            </label>
                            <div id="exp-stroke-controls" style="display:${_expEffects.strokeEnabled ? 'block' : 'none'};">
                                <div style="margin-bottom:8px;">
                                    <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                        <span style="font-size:.5rem;color:#888;">Color borde</span>
                                    </div>
                                    <input type="color" id="exp-fx-strokecolor" value="${_expEffects.strokeColor}"
                                           oninput="_expFxChange()" style="width:100%;height:24px;border:1px solid #2a2a2a;border-radius:4px;background:#0d0d0d;cursor:pointer;">
                                </div>
                                <div>
                                    <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                                        <span style="font-size:.5rem;color:#888;">Grosor</span>
                                        <span id="exp-fx-strokewidth-val" style="font-size:.5rem;color:#c8a96e;">${_expEffects.strokeWidth}px</span>
                                    </div>
                                    <input type="range" id="exp-fx-strokewidth" min="1" max="8" value="${_expEffects.strokeWidth}"
                                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ══ SECCIÓN TIPOGRAFÍA ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-typo',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">TIPOGRAFÍA</span>
                        <span id="sec-typo-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-typo" style="display:none;padding:11px 14px;">
                        <select id="exp-fx-font" onchange="_expFxChange()"
                                style="width:100%;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;
                                       color:#e8e0d0;font-family:'DM Mono',monospace;font-size:.52rem;
                                       padding:4px 7px;cursor:pointer;">
                            <option value="Georgia,serif" ${_expEffects.fontFamily === 'Georgia,serif' ? 'selected' : ''}>Georgia (Clásica)</option>
                            <option value="'Times New Roman',serif" ${_expEffects.fontFamily === "'Times New Roman',serif" ? 'selected' : ''}>Times New Roman</option>
                            <option value="'Palatino Linotype',Palatino,serif" ${_expEffects.fontFamily.includes('Palatino') ? 'selected' : ''}>Palatino (Elegante)</option>
                            <option value="'Book Antiqua',Palatino,serif" ${_expEffects.fontFamily.includes('Book Antiqua') ? 'selected' : ''}>Book Antiqua</option>
                            <option value="Garamond,serif" ${_expEffects.fontFamily.includes('Garamond') ? 'selected' : ''}>Garamond (Editorial)</option>
                            <option value="'Trebuchet MS',sans-serif" ${_expEffects.fontFamily.includes('Trebuchet') ? 'selected' : ''}>Trebuchet (Moderno)</option>
                            <option value="'Arial',sans-serif" ${_expEffects.fontFamily === "'Arial',sans-serif" ? 'selected' : ''}>Arial (Limpio)</option>
                            <option value="'Courier New',monospace" ${_expEffects.fontFamily.includes('Courier') ? 'selected' : ''}>Courier (Máquina)</option>
                            <option value="Impact,fantasy" ${_expEffects.fontFamily.includes('Impact') ? 'selected' : ''}>Impact (Dramático)</option>
                        </select>
                        <div id="exp-font-preview" style="margin-top:8px;padding:6px;background:#0a0908;border-radius:4px;
                             text-align:center;font-size:14px;color:#c8a96e;font-style:italic;
                             font-family:${_expEffects.fontFamily};">
                            El hechicero inmortal...
                        </div>
                    </div>
                </div>

                <!-- ══ SECCIÓN MÚSICA ══ -->
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-audio',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">MÚSICA</span>
                        <span id="sec-audio-arrow" style="font-size:.47rem;color:#555;">▶</span>
                    </div>
                    <div id="sec-audio" style="display:none;padding:11px 14px;">
                        <label style="display:flex;align-items:center;justify-content:center;gap:6px;
                               width:100%;padding:7px;background:none;border:1px dashed #2a2a2a;border-radius:5px;
                               color:#666;font-family:'DM Mono',monospace;font-size:.51rem;cursor:pointer;
                               transition:all .15s;margin-bottom:8px;"
                               onmouseover="this.style.borderColor='#7eb89a';this.style.color='#7eb89a'"
                               onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#666'">
                            📁 Cargar audio local
                            <input type="file" accept="audio/*" style="display:none" onchange="_expAudioAddFromFile(this)" data-default-dir="music">
                        </label>
                        <div id="exp-panel-tracks-list"></div>
                        <div id="exp-audio-preview-controls" style="display:none;margin-top:6px;">
                            <button id="exp-audio-solo-btn"
                                onclick="_expAudioSoloToggle()"
                                style="width:100%;background:#1a1a1a;border:1px solid #3a3a3a;
                                       border-radius:5px;color:#c8a96e;font-family:'DM Mono',monospace;
                                       font-size:.55rem;padding:6px;cursor:pointer;transition:all .15s;"
                                onmouseover="this.style.borderColor='#c8a96e'"
                                onmouseout="this.style.borderColor=document.getElementById('exp-audio-solo-btn').dataset.playing==='1'?'#7eb89a':'#3a3a3a'">
                                🔊 Escuchar preview
                            </button>
                        </div>
                        <div style="border-top:1px solid #1e1e1e;margin:8px 0;"></div>
                        <div style="font-size:10px;color:#666;line-height:1.7;">
                            ✂ Split: dividir en cualquier punto.<br>
                            Arrastrá <span style="color:#888;">◁ ▷</span> en los bordes para fade.<br>
                            Click derecho → menú rápido.
                        </div>
                    </div>
                </div>


                <!-- Seccion AUDIO TTS -->
                <div id="sec-tts-wrap" style="background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;flex-shrink:0;">
                    <div onclick="_expToggleSection('sec-tts',this)"
                         style="display:flex;align-items:center;justify-content:space-between;
                                padding:9px 14px;cursor:pointer;user-select:none;transition:background .15s;"
                         onmouseover="this.style.background='#161616'" onmouseout="this.style.background=''">
                        <span style="font-size:.51rem;color:#c8a96e;letter-spacing:.08em;">AUDIO TTS</span>
                        <span id="sec-tts-arrow" style="font-size:.47rem;color:#555;">▼</span>
                    </div>
                    <div id="sec-tts" style="padding:11px 14px;">
                        <div id="exp-tts-status-row" style="display:flex;align-items:center;gap:7px;margin-bottom:9px;">
                            <div id="exp-tts-dot" style="width:7px;height:7px;border-radius:50%;background:#333;flex-shrink:0;"></div>
                            <span id="exp-tts-status-lbl" style="font-size:11px;color:#666;flex:1;">Sin pre-generar</span>
                            <button id="exp-tts-clear-btn" onclick="_expTtsClear()" title="Descartar"
                                style="display:none;background:none;border:none;color:#555;font-size:.65rem;cursor:pointer;padding:0 2px;"
                                onmouseover="this.style.color='#e07070'" onmouseout="this.style.color='#555'">✕</button>
                        </div>
                        <!-- Volumen TTS -->
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px;">
                            <span style="font-size:10px;color:#666;flex-shrink:0;">Vol</span>
                            <input type="range" id="exp-tts-vol-slider" min="0" max="100" value="80"
                                   style="flex:1;accent-color:#7eb89a;cursor:pointer;"
                                   oninput="
                                       document.getElementById('exp-tts-vol-pct').textContent=this.value+'%';
                                       const tts=_expAudioTracks&&_expAudioTracks.find(t=>t._isTtsTrack);
                                       if(tts){_expAudioSetVol(tts.id,this.value);}
                                   ">
                            <span id="exp-tts-vol-pct" style="font-size:10px;color:#7eb89a;min-width:28px;text-align:right;">80%</span>
                        </div>
                        <div id="exp-tts-progress-wrap" style="display:none;margin-bottom:9px;">
                            <div style="background:#1a1a1a;border-radius:3px;height:3px;overflow:hidden;">
                                <div id="exp-tts-progress-bar" style="height:100%;width:0%;background:#7eb89a;transition:width .3s;"></div>
                            </div>
                            <div id="exp-tts-progress-lbl" style="font-size:10px;color:#666;margin-top:3px;text-align:right;">0%</div>
                        </div>
                        <div style="margin-bottom:9px;">
                            <div style="font-size:10px;color:#777;margin-bottom:4px;">Voz Edge TTS</div>
                            <select id="exp-tts-voice-select"
                                    onchange="if(typeof setEdgeTtsVoice==='function') setEdgeTtsVoice(this.value)"
                                    style="width:100%;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;
                                           color:#e8e0d0;font-family:'DM Mono',monospace;font-size:.49rem;
                                           padding:4px 7px;cursor:pointer;">
                            </select>
                        </div>
                        <button id="exp-tts-gen-btn" onclick="_expTtsPregenerar()"
                            style="width:100%;background:#1a1a1a;border:1px solid #3a3a3a;
                                   border-radius:5px;color:#7eb89a;font-family:'DM Mono',monospace;
                                   font-size:.54rem;padding:7px;cursor:pointer;transition:all .15s;margin-bottom:6px;"
                            onmouseover="if(!this.disabled){this.style.borderColor='#7eb89a'}"
                            onmouseout="if(!this.disabled){this.style.borderColor='#3a3a3a'}">
                            🎙 Pre-generar audio TTS
                        </button>

                        <!-- Botones exportar WAV/MP3 — visibles solo cuando hay buffers listos -->
                        <div id="exp-tts-export-row" style="display:none;gap:5px;margin-bottom:8px;">
                            <button onclick="_expTtsExportarAudio('wav')"
                                style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;
                                       color:#c8a96e;font-family:'DM Mono',monospace;font-size:.5rem;
                                       padding:6px 4px;cursor:pointer;transition:all .15s;"
                                onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.07)'"
                                onmouseout="this.style.borderColor='#2a2a2a';this.style.background='#1a1a1a'">
                                ⬇ WAV
                            </button>
                            <button onclick="_expTtsExportarAudio('mp3')"
                                style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;
                                       color:#c8a96e;font-family:'DM Mono',monospace;font-size:.5rem;
                                       padding:6px 4px;cursor:pointer;transition:all .15s;"
                                onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.07)'"
                                onmouseout="this.style.borderColor='#2a2a2a';this.style.background='#1a1a1a'">
                                ⬇ MP3
                            </button>
                        </div>

                        <div style="font-size:10px;color:#666;line-height:1.7;">
                            Genera el audio XTTS ahora para<br>
                            sincronizar el preview y adelantar<br>
                            trabajo al exportar.
                        </div>
                    </div>
                </div>

            </div><!-- fin right panel -->
        </div><!-- fin body -->

    `;

    document.body.appendChild(m);

    // Inicializar canvas preview
    const canvas = document.getElementById('exp-preview-canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;

    // Inicializar timeline
    _expTimelineInit();

    // Inicializar audio tracks
    _expAudioInit();

    // Render inicial
    _expPreviewFrase = 0;
    _expPreviewRender();

    // Re-renderizar timeline al cambiar tamaño (ej: salir de pantalla completa)
    if (typeof ResizeObserver !== 'undefined') {
        let _resizeTimer = null;
        const _expResizeObs = new ResizeObserver(() => {
            clearTimeout(_resizeTimer);
            _resizeTimer = setTimeout(() => _expApplyZoom(), 80);
        });
        _expResizeObs.observe(m);
        m._resizeObs = _expResizeObs;
    }
}

// ─── ESTADO DEL PLAYER DE PREVIEW ───────────────────────────────────
let _expPreviewFrase = 0;       // frase actualmente visible en el preview
let _expPlayTimer = null;       // setInterval del play (fallback sin TTS buffers)
let _expPlayInterval = 1200;    // ms por frase (fallback sin audio TTS)
let _expPlayLoopId = 0;         // token para cancelar el loop async TTS
let _expTtsDuraciones = null;   // ms por frase, decodificado de _expTtsBuffers
let _expIsPlaying = false;      // true mientras el preview esta reproduciendo

function _expTogglePlay() {
    if (_expIsPlaying) {
        _expPausePlay();
    } else {
        _expStartPlay(true); // true = resume desde donde quedó
    }
}

// Pausa sin resetear posición de audio (para poder reanudar correctamente)
function _expPausePlay() {
    _expIsPlaying = false;
    if (_expPlayTimer) { clearInterval(_expPlayTimer); _expPlayTimer = null; }
    if (typeof _expPlayLoopId !== 'undefined') _expPlayLoopId++;
    const btn = document.getElementById('exp-play-btn');
    if (btn) { btn.textContent = '▶ Play'; btn.style.color = '#c8a96e'; btn.style.borderColor = '#3a3a3a'; }
    _expAudioTracks.forEach(t => {
        if (t.audioEl && !t.audioEl.paused) t.audioEl.pause();
    });
    const soloBtn = document.getElementById('exp-audio-solo-btn');
    if (soloBtn) { soloBtn.dataset.playing = '0'; soloBtn.textContent = '🔊 Escuchar preview'; soloBtn.style.color = '#c8a96e'; soloBtn.style.borderColor = '#3a3a3a'; }
}

function _expStartPlay(isResume) {
    _expIsPlaying = true;
    const btn = document.getElementById('exp-play-btn');
    if (btn) { btn.textContent = '⏸ Pausa'; btn.style.color = '#7eb89a'; btn.style.borderColor = '#7eb89a'; }
    _expAudioPlayStart(isResume);

    // Con buffers TTS pre-generados: loop sincronizado por duración real
    if (typeof _expTtsBuffers !== 'undefined' && _expTtsBuffers && _expTtsBuffers.length === sentences.length) {
        _expStartPlayTtsSync();
        return;
    }

    // Sin buffers: intervalo fijo
    _expPlayTimer = setInterval(() => {
        _expPreviewFrase = (_expPreviewFrase + 1) % sentences.length;
        _expPreviewRender();
        _expTimelineRender();
        _expTimelineRulerRender();
        _expUpdateCounter();
        // Redibujar tracks de audio para mover el cursor
        if (_expAudioTracks.length > 0) {
            document.querySelectorAll('.exp-track-canvas-wrap canvas').forEach((cv, i) => {
                if (_expAudioTracks[i]) _expAudioDrawTrack(cv, _expAudioTracks[i]);
            });
        }
    }, _expPlayInterval);
}

// Loop async sincronizado con duraciones reales del audio TTS
async function _expStartPlayTtsSync() {
    const loopId = ++_expPlayLoopId;
    const total = sentences.length;

    // Decodificar duraciones reales una sola vez (se cachea en _expTtsDuraciones)
    if (!_expTtsDuraciones || _expTtsDuraciones.length !== total) {
        _expTtsDuraciones = new Array(total).fill(EXPORT_SEC_FRASE * 1000);
        try {
            const tmpCtx = new AudioContext();
            for (let i = 0; i < total; i++) {
                if (!_expTtsBuffers[i]) continue;
                try {
                    const dec = await tmpCtx.decodeAudioData(_expTtsBuffers[i].slice(0));
                    _expTtsDuraciones[i] = (dec.duration + 0.15) * 1000;
                } catch (e) { }
            }
            tmpCtx.close();
        } catch (e) { }
    }

    // Loop frase por frase esperando la duracion real de cada una
    let i = _expPreviewFrase;
    while (loopId === _expPlayLoopId && i < total) {
        _expPreviewFrase = i;
        _expPreviewRender();
        _expTimelineRender();
        _expTimelineRulerRender();
        _expUpdateCounter();
        if (_expAudioTracks.length > 0) {
            document.querySelectorAll('.exp-track-canvas-wrap canvas').forEach((cv, idx) => {
                if (_expAudioTracks[idx]) _expAudioDrawTrack(cv, _expAudioTracks[idx]);
            });
        }
        const ms = _expTtsDuraciones[i] || (EXPORT_SEC_FRASE * 1000);
        await new Promise(r => setTimeout(r, ms));
        i++;
    }

    // Al terminar naturalmente: usar _expStopPlay para limpiar todo el estado
    if (loopId === _expPlayLoopId) {
        _expPlayLoopId = 0;
        _expStopPlay();
    }
}

function _expStopPlay() {
    _expIsPlaying = false;
    if (_expPlayTimer) { clearInterval(_expPlayTimer); _expPlayTimer = null; }
    if (typeof _expPlayLoopId !== 'undefined') _expPlayLoopId++; // cancela loop async TTS
    const btn = document.getElementById('exp-play-btn');
    if (btn) { btn.textContent = '▶ Play'; btn.style.color = '#c8a96e'; btn.style.borderColor = '#3a3a3a'; }
    _expAudioPlayStop();
    // Resetear botón solo
    const soloBtn = document.getElementById('exp-audio-solo-btn');
    if (soloBtn) { soloBtn.dataset.playing = '0'; soloBtn.textContent = '🔊 Escuchar preview'; soloBtn.style.color = '#c8a96e'; soloBtn.style.borderColor = '#3a3a3a'; }
}

function _expUpdateCounter() {
    const el = document.getElementById('exp-play-counter');
    if (el) el.textContent = `Frase ${_expPreviewFrase + 1} / ${sentences.length}`;
}

// Calcula el currentTime en segundos dentro del WAV TTS concatenado para una frase dada
function _expTtsGetCurrentTime(fraseIdx) {
    if (!_expTtsDuraciones || !_expTtsDuraciones.length) return fraseIdx * EXPORT_SEC_FRASE;
    let t = 0;
    for (let i = 0; i < fraseIdx && i < _expTtsDuraciones.length; i++) {
        t += (_expTtsDuraciones[i] || (EXPORT_SEC_FRASE * 1000)) / 1000;
    }
    return t;
}

// Duración total del video en segundos (suma de todas las frases)
function _expGetTotalDuration() {
    if (!_expTtsDuraciones || !_expTtsDuraciones.length) {
        return sentences.length * EXPORT_SEC_FRASE;
    }
    return _expTtsDuraciones.reduce((sum, ms) => sum + (ms || EXPORT_SEC_FRASE * 1000), 0) / 1000;
}

// Seek: ir a una frase específica sincronizando audio y video
function _expSeekToFrase(fraseIdx) {
    const wasPlaying = _expIsPlaying;
    if (wasPlaying) _expPausePlay();
    _expPreviewFrase = fraseIdx;
    _expPreviewRender();
    _expTimelineRender();
    _expTimelineRulerRender();
    _expUpdateCounter();

    // Tiempo total acumulado hasta esta frase (en segundos)
    const totalSecsAtFrase = _expTtsGetCurrentTime(fraseIdx);

    _expAudioTracks.forEach(t => {
        if (!t.audioEl) return;
        if (t._isTtsTrack && _expTtsDuraciones && _expTtsDuraciones.length) {
            // Track TTS: posición exacta según la frase
            t.audioEl.currentTime = totalSecsAtFrase;
        } else {
            // Tracks de música: buscar en qué clip NLE estamos según el tiempo de video actual.
            // Cada clip define timeStart/timeEnd (timeline) y sourceStart/sourceEnd (fuente).
            const totalDurSecs = _expGetTotalDuration();
            const videoFrac = totalDurSecs > 0 ? totalSecsAtFrase / totalDurSecs : 0;
            const audioDur = t.audioDuration || t.audioEl.duration || null;
            let found = null;
            for (const clip of (t.clips || [])) {
                if (videoFrac >= clip.timeStart && videoFrac < clip.timeEnd && audioDur) {
                    // Qué fracción dentro del clip estamos
                    const fracInClip = (videoFrac - clip.timeStart) / Math.max(1e-9, clip.timeEnd - clip.timeStart);
                    // Mapear a espacio fuente
                    const sourceFrac = clip.sourceStart + fracInClip * (clip.sourceEnd - clip.sourceStart);
                    found = sourceFrac * audioDur;
                    break;
                }
            }
            if (found === null) {
                t._skipPlay = true;
                if (t.audioEl) t.audioEl.currentTime = 0;
            } else {
                t._skipPlay = false;
                if (t.audioEl) t.audioEl.currentTime = Math.max(0, found);
            }
        }
    });

    if (wasPlaying) _expStartPlay(true);
}

// Reinicia la reproducción desde el principio (frase 0)
function _expRestartPlay() {
    const wasPlaying = _expIsPlaying;
    if (wasPlaying) _expPausePlay();
    _expPreviewFrase = 0;
    _expPreviewRender();
    _expTimelineRender();
    _expTimelineRulerRender();
    _expUpdateCounter();
    _expAudioTracks.forEach(t => {
        if (t.audioEl) t.audioEl.currentTime = 0;
    });
    // Forzar redibujado de cursores en todos los tracks
    _expAudioRenderTracks();
    if (wasPlaying) _expStartPlay(true);
}

// ─── TIMELINE ───────────────────────────────────────────────────────
// Paleta de colores para los segmentos (cíclica)
const _TL_COLORS = [
    '#c8a96e', '#7eb89a', '#8899cc', '#cc8877', '#aa88cc',
    '#88bbaa', '#ccaa55', '#9977bb', '#77aabb', '#cc7788'
];

let _tlDragState = null;  // { divider: int, startX: int, startFrases: [...] }

function _expTimelineInit() {
    const canvas = document.getElementById('exp-timeline-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = 52;

    _expTimelineRender();
    _expTimelineRulerRender();
    _expTimelineRulerRender();

    // Eventos mouse sobre el canvas de imágenes (no el ruler)
    canvas.addEventListener('mousedown', _tlMouseDown);
    canvas.addEventListener('mousemove', _tlMouseMove);
    canvas.addEventListener('mouseup', _tlMouseUp);
    canvas.addEventListener('mouseleave', _tlMouseUp);

    canvas.addEventListener('touchstart', e => _tlMouseDown(_tlTouchToMouse(e)), { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); _tlMouseMove(_tlTouchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchend', _tlMouseUp);
}

// ── Ruler de tiempo con marcador de posición ─────────────────────
// Se dibuja en exp-timeline-ruler (debajo del canvas de imágenes)
// El cursor (triángulo) vive aquí — no interfiere con las miniaturas
function _expTimelineRulerRender() {
    const ruler = document.getElementById('exp-timeline-ruler');
    if (!ruler) return;
    const imgCanvas = document.getElementById('exp-timeline-canvas');
    ruler.width = imgCanvas ? imgCanvas.width : (ruler.getBoundingClientRect().width || 800);
    ruler.height = 16;
    const ctx = ruler.getContext('2d');
    const W = ruler.width, H = ruler.height;
    const total = sentences.length;
    if (total === 0) return;

    ctx.clearRect(0, 0, W, H);

    // Línea base superior
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, W, 1);

    // Duración total estimada
    const totalSecs = (_expTtsDuraciones && _expTtsDuraciones.length === total)
        ? _expTtsDuraciones.reduce((s, ms) => s + (ms || EXPORT_SEC_FRASE * 1000), 0) / 1000
        : total * EXPORT_SEC_FRASE;

    // Paso de ticks: buscamos que haya ~60px entre marcas
    const pxPerFrase = W / total;
    let tickEvery = 1;
    for (const t of [1, 2, 5, 10, 20, 50, 100]) {
        tickEvery = t;
        if (pxPerFrase * t >= 55) break;
    }

    ctx.font = '8px "DM Mono",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let f = 0; f <= total; f += tickEvery) {
        const x = Math.round((f / total) * W);
        const isMajor = (f % (tickEvery * 5) === 0) || tickEvery >= 10;
        ctx.fillStyle = isMajor ? '#383838' : '#252525';
        ctx.fillRect(x, 1, 1, isMajor ? 5 : 3);
        if (isMajor && x < W - 12) {
            const secs = (f / total) * totalSecs;
            const label = secs >= 60
                ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`
                : `${Math.round(secs)}s`;
            ctx.fillStyle = '#383838';
            ctx.fillText(label, x, 6);
        }
    }

    // ── Cursor de posición (triángulo apuntando hacia arriba desde el ruler) ──
    const curX = Math.round(((_expPreviewFrase + 0.5) / total) * W);

    // Línea vertical
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(curX - 1, 0, 2, H);

    // Triángulo en la base del ruler apuntando hacia arriba (hacia el canvas de imágenes)
    ctx.fillStyle = '#ffffffdd';
    ctx.beginPath();
    ctx.moveTo(curX - 5, H);
    ctx.lineTo(curX + 5, H);
    ctx.lineTo(curX, H - 7);
    ctx.closePath();
    ctx.fill();
}

function _tlTouchToMouse(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() };
}

function _expTimelineRender() {
    const canvas = document.getElementById('exp-timeline-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const total = sentences.length;
    if (total === 0 || _expImageRanges.length === 0) return;

    ctx.clearRect(0, 0, W, H);

    const TRACK_Y = 8, TRACK_H = 24;

    // Dibujar segmentos de imágenes
    _expImageRanges.forEach((range, g) => {
        const x1 = Math.round((range.desde / total) * W);
        const x2 = Math.round(((range.hasta + 1) / total) * W);
        const color = _TL_COLORS[g % _TL_COLORS.length];

        // Fondo del segmento
        ctx.fillStyle = color + '28';
        ctx.fillRect(x1, TRACK_Y, x2 - x1, TRACK_H);

        // Borde izquierdo y derecho
        ctx.fillStyle = color + 'aa';
        ctx.fillRect(x1, TRACK_Y, 2, TRACK_H);
        ctx.fillRect(x2 - 2, TRACK_Y, 2, TRACK_H);

        // Miniatura de imagen si está cargada
        const imgItem = _expImagenes[g];
        if (imgItem && imgItem.img && (x2 - x1) > 16) {
            const thumbW = Math.min(x2 - x1 - 4, 36);
            const thumbH = TRACK_H - 2;
            const cx = x1 + 2 + (x2 - x1 - 4 - thumbW) / 2;
            try {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(imgItem.img, cx, TRACK_Y + 1, thumbW, thumbH);
                ctx.globalAlpha = 1.0;
            } catch (e) { }
        }

        // Label del grupo (número de frases)
        const labelX = x1 + (x2 - x1) / 2;
        ctx.fillStyle = color;
        ctx.font = `bold 9px 'DM Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = `${range.desde + 1}–${range.hasta + 1}`;
        if (x2 - x1 > 30) ctx.fillText(label, labelX, TRACK_Y + TRACK_H + 9);

        // Separador arrastrable (solo entre segmentos, no al inicio ni al final)
        if (g < _expImageRanges.length - 1) {
            const sepX = x2;
            ctx.fillStyle = color + 'cc';
            ctx.fillRect(sepX - 3, TRACK_Y - 3, 6, TRACK_H + 6);
            // Asas visuales
            ctx.fillStyle = '#fff3';
            ctx.fillRect(sepX - 1, TRACK_Y + TRACK_H / 2 - 5, 2, 10);
        }
    });

    // El cursor de posición se dibuja en el ruler (exp-timeline-ruler), no aquí
    // para no interferir con las miniaturas de imágenes
}

// Detectar si el click está en un separador arrastrable
function _tlGetDividerAt(x, canvasW) {
    const total = sentences.length;
    const HIT = 8; // px de tolerancia
    for (let g = 0; g < _expImageRanges.length - 1; g++) {
        const sepX = Math.round(((_expImageRanges[g].hasta + 1) / total) * canvasW);
        if (Math.abs(x - sepX) <= HIT) return g;
    }
    return -1;
}

function _tlMouseDown(e) {
    const canvas = document.getElementById('exp-timeline-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const total = sentences.length;

    const divIdx = _tlGetDividerAt(x, canvas.width);
    if (divIdx >= 0) {
        // Arrastrar separador
        _expStopPlay();
        _tlDragState = { divider: divIdx, startX: x };
        canvas.style.cursor = 'col-resize';
    } else {
        // Click → seek a esa frase (sincroniza audio + video)
        const fraseIdx = Math.min(Math.floor((x / canvas.width) * total), total - 1);
        _expSeekToFrase(Math.max(0, fraseIdx));
    }
}

function _tlMouseMove(e) {
    const canvas = document.getElementById('exp-timeline-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const total = sentences.length;

    // Cambiar cursor si está sobre un separador
    if (!_tlDragState) {
        const divIdx = _tlGetDividerAt(x, canvas.width);
        canvas.style.cursor = divIdx >= 0 ? 'col-resize' : 'pointer';
        return;
    }

    // Arrastrando: reasignar rangos
    const g = _tlDragState.divider;
    // Convertir posición x a índice de frase
    let newBoundary = Math.round((x / canvas.width) * total);
    // Límites: mínimo 1 frase por grupo
    const minBoundary = _expImageRanges[g].desde + 1;
    const maxBoundary = _expImageRanges[g + 1].hasta;
    newBoundary = Math.max(minBoundary, Math.min(maxBoundary, newBoundary));

    _expImageRanges[g].hasta = newBoundary - 1;
    _expImageRanges[g + 1].desde = newBoundary;

    _expTimelineRender();
    _expTimelineRulerRender();

    // Actualizar hint con info del rango
    const hint = document.getElementById('exp-timeline-hint');
    if (hint) hint.textContent =
        `Img ${g + 1}: frases ${_expImageRanges[g].desde + 1}–${_expImageRanges[g].hasta + 1}  |  Img ${g + 2}: frases ${_expImageRanges[g + 1].desde + 1}–${_expImageRanges[g + 1].hasta + 1}`;
}

function _tlMouseUp() {
    if (_tlDragState) {
        _tlDragState = null;
        const canvas = document.getElementById('exp-timeline-canvas');
        if (canvas) canvas.style.cursor = 'pointer';
        // Redibujar con estado actualizado
        _expTimelineRender();
        _expTimelineRulerRender();
    }
}

// ─── EFECTOS ────────────────────────────────────────────────────────

// ─── SECCIONES COLAPSABLES ───────────────────────────────────────────
function _expToggleSection(id, header) {
    const body = document.getElementById(id);
    const arrow = document.getElementById(id + '-arrow');
    if (!body) return;
    const open = body.style.display === 'none' || body.style.display === '';
    body.style.display = open ? 'block' : 'none';
    if (arrow) {
        arrow.textContent = open ? '▼' : '▶';
        arrow.style.color = open ? '#c8a96e' : '#555';
    }
    if (header) header.style.borderBottom = open ? '1px solid #1e1e1e' : '';
}

function _expFxChange() {
    const bw = document.getElementById('exp-fx-bw')?.checked ?? false;
    const vig = document.getElementById('exp-fx-vignette')?.checked ?? true;
    const opacity = (document.getElementById('exp-fx-opacity')?.value ?? 58) / 100;
    const brightness = (document.getElementById('exp-fx-brightness')?.value ?? 100) / 100;
    const contrast = (document.getElementById('exp-fx-contrast')?.value ?? 100) / 100;
    const vigInt = (document.getElementById('exp-fx-vigint')?.value ?? 65) / 100;
    const vigSize = (document.getElementById('exp-fx-vigsize')?.value ?? 85) / 100;
    const textOp = (document.getElementById('exp-fx-textopacity')?.value ?? 100) / 100;
    const textColor = document.getElementById('exp-fx-textcolor')?.value ?? '#c8a96e';
    const zoom = (document.getElementById('exp-fx-zoom')?.value ?? 100) / 100;
    const fontFamily = document.getElementById('exp-fx-font')?.value ?? 'Georgia,serif';
    const strokeEnabled = document.getElementById('exp-fx-stroke')?.checked ?? false;
    const strokeColor = document.getElementById('exp-fx-strokecolor')?.value ?? '#000000';
    const strokeWidth = parseInt(document.getElementById('exp-fx-strokewidth')?.value ?? 2);

    // Mostrar/ocultar controles de borde
    const strokeControls = document.getElementById('exp-stroke-controls');
    if (strokeControls) strokeControls.style.display = strokeEnabled ? 'block' : 'none';

    // Actualizar preview de tipografía
    const fontPrev = document.getElementById('exp-font-preview');
    if (fontPrev) { fontPrev.style.fontFamily = fontFamily; }

    _expEffects = {
        grayscale: bw, vignette: vig, imgOpacity: opacity, brightness, contrast,
        vigIntensity: vigInt, vigSize, textColor, textOpacity: textOp, zoom, fontFamily,
        strokeEnabled, strokeColor, strokeWidth
    };

    // Actualizar labels
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('exp-fx-opacity-val', Math.round(opacity * 100) + '%');
    set('exp-fx-brightness-val', brightness.toFixed(2));
    set('exp-fx-contrast-val', contrast.toFixed(2));
    set('exp-fx-vigint-val', Math.round(vigInt * 100) + '%');
    set('exp-fx-vigsize-val', vigSize.toFixed(2));
    set('exp-fx-textopacity-val', Math.round(textOp * 100) + '%');
    set('exp-fx-textcolor-val', textColor);
    set('exp-fx-zoom-val', zoom.toFixed(2) + 'x');
    set('exp-fx-strokecolor-val', strokeColor);
    set('exp-fx-strokewidth-val', strokeWidth + 'px');

    _expPreviewRender();
}

function _expPreviewRender() {
    const canvas = document.getElementById('exp-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Usar la frase activa del player de preview
    const fraseIdx = Math.max(0, Math.min(_expPreviewFrase, sentences.length - 1));
    const grupoIdx = _expGetGrupoParaFrase(fraseIdx);
    const imgItem = _expImagenes[grupoIdx] || _expImagenes[0];

    _expDibujarFrame(ctx, EXPORT_W, EXPORT_H, imgItem?.img || null, fraseIdx,
        sentences.length, sentences, imgItem, _expEffects);

    _expUpdateCounter();
}



async function _expGenerarAudioXTTSWidget(updateFn) {
    const total = sentences.length;
    const buffers = new Array(total).fill(null);
    // Procesar en lotes concurrentes para acelerar la generación de audio.
    // XTTS v2 en CPU puede manejar 3-4 requests paralelos sin saturarse;
    // en GPU suele tolerar hasta 6. Usamos 4 como balance conservador.
    const BATCH = 4;
    let completados = 0;
    for (let base = 0; base < total && !_expCancelled; base += BATCH) {
        const indices = [];
        for (let k = 0; k < BATCH && base + k < total; k++) indices.push(base + k);
        await Promise.all(indices.map(async i => {
            try {
                const textoNorm = (typeof _normalizarTextoTTS === 'function')
                    ? _normalizarTextoTTS(sentences[i])
                    : sentences[i];
                const resp = await fetch(`${TTS_API_URL}/tts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textoNorm, voice: (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : 'es-MX-JorgeNeural') })
                });
                if (resp.ok) buffers[i] = await resp.arrayBuffer();
            } catch (e) { console.warn(`[export] audio frase ${i}:`, e.message); }
            completados++;
            updateFn(10 + completados / total * 45, `🔊 Audio ${completados}/${total}`);
        }));
    }
    return buffers;
}

// ───────────────────────────────────────────────────────────────────
// FASE RENDER
// ───────────────────────────────────────────────────────────────────
async function _expRenderizar(audioBuffers, updateFn) {
    // updateFn viene de _iniciarExportacion (el widget flotante ya está creado)
    // Congelar copia de sentences — evita que la navegación de capítulos
    // cambie el array global mientras el render está en curso
    const _sentences = sentences.slice();
    const total = _sentences.length;

    // ── Calcular duraciones reales ──
    const duraciones = new Array(total).fill(EXPORT_SEC_FRASE);
    if (audioBuffers) {
        const tmpCtx = new AudioContext();
        for (let i = 0; i < total; i++) {
            if (!audioBuffers[i]) continue;
            try {
                const dec = await tmpCtx.decodeAudioData(audioBuffers[i].slice(0));
                duraciones[i] = dec.duration + 0.15;
            } catch (e) { }
        }
        tmpCtx.close();
    }

    // ── Mezclar audio ──
    // Si hay TTS → mezcla normal. Si no hay TTS pero hay tracks de música → también mezclar.
    let audioBlob = null;
    const hasMusicTracks = (_expAudioTracks || []).some(t => !t._isTtsTrack && !t.muted && t.audioUrl);
    if (audioBuffers || hasMusicTracks) {
        try { audioBlob = await _expMezclarAudio(audioBuffers || [], duraciones); }
        catch (e) { console.warn('[export] mezcla audio:', e.message); }
    }

    if (_expCancelled) return;

    // ── Canvas ──
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');

    // ── MediaRecorder ──
    const canvasStream = canvas.captureStream(EXPORT_FPS);
    const tracks = [...canvasStream.getTracks()];

    let audioCtxRec = null;
    let audioSrc = null;
    if (audioBlob) {
        try {
            audioCtxRec = new AudioContext();
            const dest = audioCtxRec.createMediaStreamDestination();
            const arrBuf = await audioBlob.arrayBuffer();
            const decoded = await audioCtxRec.decodeAudioData(arrBuf);
            audioSrc = audioCtxRec.createBufferSource();
            audioSrc.buffer = decoded;
            audioSrc.connect(dest);
            dest.stream.getAudioTracks().forEach(t => tracks.push(t));
        } catch (e) { console.warn('[export] audio stream:', e.message); }
    }

    const combined = new MediaStream(tracks);
    const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };

    // ── Render sincronizado con AudioContext.currentTime como reloj maestro ──
    // audioCtxRec.currentTime es el reloj más preciso disponible — avanza 1:1
    // con el audio reproducido, garantizando sincronía perfecta video/audio.
    // Si no hay audio, se usa performance.now() como fallback.
    const totalDur = duraciones.reduce((a, b) => a + b, 0);
    const pctBase = audioBuffers ? 55 : 10;

    // Pre-calcular duraciones acumuladas para evitar reduce() en cada frame
    const durAcum = [];
    let _acc = 0;
    for (let i = 0; i < total; i++) { _acc += duraciones[i]; durAcum[i] = _acc; }

    await new Promise((resolve) => {
        recorder.start(100);
        const renderStartReal = performance.now();
        if (audioSrc) audioSrc.start(0);

        let sentenceIdx = 0;
        let rafId = null;
        // Capturar el currentTime del AudioContext justo antes de arrancar el audio
        // para usarlo como offset — así virtualTime siempre arranca en 0
        const audioCtxOffset = audioCtxRec ? audioCtxRec.currentTime : 0;

        const tick = () => {
            if (_expCancelled) {
                clearTimeout(rafId);
                recorder.stop();
                resolve();
                return;
            }
            if (sentenceIdx >= total) {
                recorder.stop();
                resolve();
                return;
            }

            // Reloj maestro: tiempo relativo al inicio del audio
            const virtualTime = audioCtxRec
                ? Math.max(0, audioCtxRec.currentTime - audioCtxOffset)
                : (performance.now() - renderStartReal) / 1000;

            // Avanzar índice de frase según el tiempo — nunca retrocede
            while (sentenceIdx < total - 1 && virtualTime >= durAcum[sentenceIdx]) {
                sentenceIdx++;
            }

            // Dibujar frame
            const imgItem = _expImagenes[_expGetGrupoParaFrase(sentenceIdx)];
            _expDibujarFrame(ctx, EXPORT_W, EXPORT_H, imgItem?.img || null, sentenceIdx, total, _sentences, imgItem, _expEffects);

            // Progreso
            const pct = pctBase + (Math.min(virtualTime, totalDur) / totalDur) * (99 - pctBase);
            updateFn(Math.min(pct, 98), `🎬 Frase ${sentenceIdx + 1}/${total}  (${Math.round(virtualTime)}s / ${Math.round(totalDur)}s)`);

            // Terminar cuando el audio llegó al final
            if (virtualTime >= totalDur) {
                recorder.stop();
                resolve();
                return;
            }

            rafId = setTimeout(tick, 1000 / 30); // 30fps, no se pausa con tab oculto
        };

        rafId = setTimeout(tick, 1000 / 30);
    });




    await new Promise(resolve => { recorder.onstop = resolve; setTimeout(resolve, 3000); });
    if (audioCtxRec) audioCtxRec.close();



    if (_expCancelled) {
        mostrarNotificacion('✕ Exportación cancelada');
        _cerrarModalExport();
        return;
    }

    // ── Descarga / Conversión ──
    updateFn(100, '✓ Preparando descarga…');
    const blob = new Blob(chunks, { type: mimeType });
    document.getElementById('exp-float-widget')?.remove();

    // Si convert_mp4.js está cargado → mostrar diálogo WebM vs MP4
    if (typeof _ofrecerDescargaOConversion === 'function') {
        _ofrecerDescargaOConversion(blob, _expFileName);
    } else {
        // Fallback: descarga directa WebM
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${_expFileName}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        mostrarNotificacion('✓ Video exportado correctamente');
    }
}

// ───────────────────────────────────────────────────────────────────
// AUDIO TRACKS DEL PREVIEW — estado, render, eventos
// ───────────────────────────────────────────────────────────────────
let _expAudioTracks = [];        // [{id, name, color, volume, muted, segments, splitHistory, audioBuffer, audioUrl}]
let _expTimelineZoom = 1;       // factor de zoom del timeline (1 = 100%, 4 = 400%)
let _expAudioTrackIdCounter = 0;
let _expAudioSelectedSeg = null; // {trackId, segIdx}
let _expAudioCtxTarget = null;
let _expAudioFadeDrag = null;
let _expAudioMode = 'normal';    // 'normal' | 'split'
let _expAudioExpandedId = null;  // id del track expandido (solo uno a la vez)
let _expAudioExpandedSet = null; // Set de ids expandidos (null = sin inicializar)
let _expAudioKnownIds = null; // Set de ids que ya se han visto (para no re-expandir al colapsar)

function _expAudioInit() {
    // Limpiar al abrir el preview
    // (no reiniciar si ya hay tracks cargados — permite volver atrás)
    _expAudioRenderTracks();
    _expAudioUpdatePanelList();

    // Seccion AUDIO TTS: visibilidad segun servidor disponible
    const ttsWrap = document.getElementById('sec-tts-wrap');
    if (ttsWrap) {
        const xttsOk = (typeof servidorTTSDisponible !== 'undefined') && servidorTTSDisponible;
        ttsWrap.style.display = xttsOk ? '' : 'none';
    }
    // Poblar select de voces Edge TTS copiando del selector global
    const srcSel = document.getElementById('edge-voice-select');
    const dstSel = document.getElementById('exp-tts-voice-select');
    if (srcSel && dstSel && dstSel.options.length === 0) {
        dstSel.innerHTML = srcSel.innerHTML;
        const curVoice = (typeof _edgeTtsVoice !== 'undefined') ? _edgeTtsVoice : '';
        if (curVoice) dstSel.value = curVoice;
    }
    // Restaurar estado visual si ya hay buffers pre-generados
    if (typeof _expTtsActualizarUI === 'function') _expTtsActualizarUI();
    // Invalidar cache de duraciones si el capitulo cambio
    if (typeof _expTtsDuraciones !== 'undefined' && _expTtsDuraciones && _expTtsDuraciones.length !== sentences.length) _expTtsDuraciones = null;
    // Conectar labels de audio a _expAudioLabelClick para abrir en Music
    document.querySelectorAll('input[data-default-dir="music"]').forEach(inp => {
        const lbl = inp.closest('label');
        if (lbl && !lbl._musicPickerAttached) {
            lbl._musicPickerAttached = true;
            _expAudioLabelClick(lbl, inp);
        }
    });
    // Crear tooltip y context menu si no existen
    if (!document.getElementById('exp-fade-tooltip')) {
        const tt = document.createElement('div');
        tt.id = 'exp-fade-tooltip';
        tt.className = 'exp-fade-tooltip';
        document.body.appendChild(tt);
    }
    if (!document.getElementById('exp-ctx-menu')) {
        const cm = document.createElement('div');
        cm.id = 'exp-ctx-menu';
        cm.className = 'exp-ctx-menu';
        cm.innerHTML = `
            <div class="exp-ctx-item" onclick="_expAudioCtxSplit()">✂ Split aquí</div>
            <div class="exp-ctx-sep"></div>
            <div class="exp-ctx-item" onclick="_expAudioCtxFadeIn()">◁ Aplicar fade in (25%)</div>
            <div class="exp-ctx-item" onclick="_expAudioCtxFadeOut()">▷ Aplicar fade out (25%)</div>
            <div class="exp-ctx-sep"></div>
            <div class="exp-ctx-item danger" onclick="_expAudioCtxDelete()">🗑 Eliminar segmento</div>
        `;
        document.body.appendChild(cm);
    }
}


// ─── REPRODUCCIÓN DE AUDIO EN PREVIEW ─────────────────────────────
// Web Audio API context para fade in/out real
let _expWebAudioCtx = null;

function _expAudioPlayStart(isResume) {
    if (!isResume) _expAudioPlayStop();
    const tracks = _expAudioTracks.filter(t => !t.muted && t.audioUrl);
    if (!tracks.length) return;

    // Crear contexto Web Audio (en respuesta directa al click)
    try {
        if (!_expWebAudioCtx || _expWebAudioCtx.state === 'closed') {
            _expWebAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (_expWebAudioCtx.state === 'suspended') {
            _expWebAudioCtx.resume();
        }
    } catch (e) { }

    tracks.forEach(t => {
        try {
            // ¿Es un resume con el elemento ya existente y pausado?
            const isTrackResume = isResume && t.audioEl && t.audioEl.paused;

            // Crear/reutilizar el elemento video
            if (!t.audioEl) {
                t.audioEl = document.createElement('video');
                t.audioEl.src = t.audioUrl;
                t.audioEl.loop = false; // sin loop: el audio termina cuando termina
                t.audioEl.muted = false;
                t.audioEl.playbackRate = t.rate || 1.0;
                t.audioEl.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;';
                document.body.appendChild(t.audioEl);
                // Actualizar audioDuration cuando esté disponible (para el canvas)
                t.audioEl.addEventListener('loadedmetadata', () => {
                    const d = t.audioEl?.duration;
                    if (d && isFinite(d) && d > 0) {
                        t.audioDuration = d;
                        _expAudioRenderTracks();
                    }
                }, { once: true });
            }

            // Conectar al Web Audio API para control de gain (fade)
            if (_expWebAudioCtx && !t.audioSource) {
                try {
                    t.audioSource = _expWebAudioCtx.createMediaElementSource(t.audioEl);
                    t.gainNode = _expWebAudioCtx.createGain();
                    t.audioSource.connect(t.gainNode);
                    t.gainNode.connect(_expWebAudioCtx.destination);
                } catch (e) { /* ya conectado */ }
            }

            // Volumen base
            if (t.gainNode) t.gainNode.gain.value = t.volume / 100;
            else t.audioEl.volume = t.volume / 100;

            // Track TTS: siempre sincronizar al tiempo exacto de la frase actual
            // Tracks de música: sincronizar según offset del track en el video
            if (t._isTtsTrack && _expTtsDuraciones && _expTtsDuraciones.length) {
                t.audioEl.currentTime = _expTtsGetCurrentTime(_expPreviewFrase);
                t._skipPlay = false;
            } else {
                // Calcular tiempo de video actual y posición dentro del audio según offset
                const videoTimeSecs = _expTtsGetCurrentTime(_expPreviewFrase);
                const totalDurSecs = _expGetTotalDuration();
                const dur = t.audioEl.duration; // puede ser NaN si aún no cargó metadata
                const audioDur = (!isNaN(dur) && isFinite(dur) && dur > 0)
                    ? dur : (t.audioDuration || null);

                // NLE: buscar en qué clip estamos según la posición del video
                const videoFrac5 = totalDurSecs > 0 ? videoTimeSecs / totalDurSecs : 0;
                let foundAudioPos = null;
                for (const clip of (t.clips || [])) {
                    if (videoFrac5 >= clip.timeStart && videoFrac5 < clip.timeEnd && audioDur) {
                        const fracInClip = (videoFrac5 - clip.timeStart) / Math.max(1e-9, clip.timeEnd - clip.timeStart);
                        const sourceFrac = clip.sourceStart + fracInClip * (clip.sourceEnd - clip.sourceStart);
                        foundAudioPos = sourceFrac * audioDur;
                        break;
                    }
                }

                if (foundAudioPos === null) {
                    t._skipPlay = true;
                    t.audioEl.currentTime = 0;
                } else {
                    t.audioEl.currentTime = Math.max(0, foundAudioPos);
                    t._skipPlay = false;
                }
            }

            if (t._skipPlay) {
                console.log('[🎵 audio] ⏭ Track fuera de rango:', t.name);
            } else {
                // Resetear gain antes de reproducir — evita que quede en 0
                // si el clip anterior terminó con fade out o fue silenciado
                if (t.gainNode) {
                    t.gainNode.gain.cancelScheduledValues(0);
                    t.gainNode.gain.value = t.muted ? 0 : (t.volume / 100);
                }
                const p = t.audioEl.play();
                if (p) p
                    .then(() => {
                        console.log('[🎵 audio] ✅ Playing:', t.name);
                        _expAudioFadeLoop(t);
                    })
                    .catch(e => console.error('[🎵 audio] ❌', e));
            }
        } catch (e) { console.error('[🎵 audio] ❌', e); }
    });
}

// Loop que aplica fade in/out en tiempo real según posición del audio
function _expAudioFadeLoop(t) {
    if (!t.audioEl || t.audioEl.paused) return;
    if (!t.gainNode) { requestAnimationFrame(() => _expAudioFadeLoop(t)); return; }

    const duration = t.audioEl.duration;
    const current = t.audioEl.currentTime;

    // Calcular fracción en el TIMELINE DEL VIDEO (igual que el sistema de reproducción)
    // para poder comparar con clip.timeStart/timeEnd que están en ese mismo espacio.
    let videoFrac;
    if (!t._isTtsTrack) {
        const totalDurSecs = _expGetTotalDuration();
        const videoTimeSecs = _expTtsGetCurrentTime(_expPreviewFrase);
        if (totalDurSecs > 0) {
            // Si el audio llegó al final, silenciar y limpiar automaciones
            const audioDur = (duration && isFinite(duration)) ? duration : (t.audioDuration || 0);
            if (audioDur > 0 && current >= audioDur - 0.05) {
                if (t.gainNode) {
                    t.gainNode.gain.cancelScheduledValues(0);
                    t.gainNode.gain.value = 0;
                }
                return;
            }
            videoFrac = videoTimeSecs / totalDurSecs;
        } else {
            videoFrac = 0;
        }
    } else {
        videoFrac = current / ((duration && isFinite(duration)) ? duration : 1);
    }

    // Calcular volumen según el clip NLE activo y sus fade in/out
    // clip.timeStart/timeEnd → fracción del video (mismo espacio que videoFrac)
    // clip.fadeIn/fadeOut → fracción de la duración del clip (0-1)
    let fadeMultiplier = 1.0;
    for (const clip of (t.clips || [])) {
        if (videoFrac >= clip.timeStart && videoFrac <= clip.timeEnd) {
            const clipLen = clip.timeEnd - clip.timeStart;
            if (clipLen <= 0) break;
            const posInClip = (videoFrac - clip.timeStart) / clipLen; // 0-1 dentro del clip
            if (clip.fadeIn > 0 && posInClip < clip.fadeIn)
                fadeMultiplier = Math.min(fadeMultiplier, posInClip / clip.fadeIn);
            if (clip.fadeOut > 0 && posInClip > (1 - clip.fadeOut))
                fadeMultiplier = Math.min(fadeMultiplier, (1 - posInClip) / clip.fadeOut);
            break;
        }
    }

    // Aplicar volumen resultante (base × fade × mute)
    const targetGain = t.muted ? 0 : (t.volume / 100) * Math.max(0, Math.min(1, fadeMultiplier));
    try {
        t.gainNode.gain.setTargetAtTime(targetGain, _expWebAudioCtx.currentTime, 0.05);
    } catch (e) {
        t.gainNode.gain.value = targetGain;
    }

    requestAnimationFrame(() => _expAudioFadeLoop(t));
}

function _expAudioPlayStop() {
    _expAudioTracks.forEach(t => {
        if (t.audioEl && !t.audioEl.paused) t.audioEl.pause();
    });
    _expAudioActiveSources = [];
}

// Elementos <audio> activos durante la reproducción
let _expAudioCtx = null;
let _expAudioActiveSources = []; // no usado, mantenido para compatibilidad

function _expAudioGetCtx() {
    if (!_expAudioCtx || _expAudioCtx.state === 'closed') {
        _expAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_expAudioCtx.state === 'suspended') _expAudioCtx.resume();
    return _expAudioCtx;
}

function _expAudioAddTrack(name, color, audioBuffer, audioUrl, isTts) {
    // Modelo NLE: cada clip tiene posición en el TIMELINE (timeStart/timeEnd)
    // y ventana dentro del SOURCE (sourceStart/sourceEnd, ambos 0-1).
    // Un track nuevo arranca con un único clip que ocupa todo el timeline
    // y reproduce el audio completo.
    const track = {
        id: ++_expAudioTrackIdCounter,
        name, color,
        volume: isTts ? 80 : 15,
        muted: false,
        // clips[]: [{id, timeStart, timeEnd, sourceStart, sourceEnd, fadeIn, fadeOut}]
        //   timeStart/timeEnd  → posición en el video (0-1 del total)
        //   sourceStart/sourceEnd → qué fracción del archivo de audio reproduce (0-1)
        clips: [{ id: 1, timeStart: 0, timeEnd: 1, sourceStart: 0, sourceEnd: 1, fadeIn: 0, fadeOut: 0 }],
        _clipIdCounter: 1,
        clipHistory: [],
        audioBuffer: audioBuffer || null,
        audioUrl: audioUrl || null,
        audioEl: null,
        rate: 1.0,
        audioDuration: null,
    };
    _expAudioTracks.push(track);

    // Precargar duración: cuando cargue, corregir timeEnd del clip inicial
    // para que el bloque visual ocupe solo su fracción real del timeline.
    if (audioUrl && !isTts) {
        // Bug de Chrome (abierto desde 2016, sin resolver): audio.duration === Infinity
        // con blob/object URLs porque el browser no recibe Content-Length header.
        // Solución canónica (usada por get-blob-duration, StackOverflow, etc.):
        // setear currentTime = 1e101 fuerza al browser a calcular la duración real.
        // Referencia: https://github.com/evictor/get-blob-duration
        const probe = document.createElement('audio');
        probe.preload = 'metadata';
        probe.src = audioUrl;

        const _applyDuration = (dur) => {
            if (!dur || !isFinite(dur) || dur <= 0) return;
            track.audioDuration = dur;
            // Corregir timeEnd de clips que aún tienen el placeholder (1).
            // Un clip placeholder es el que se creó con timeEnd=1 antes de conocer
            // la duración real. Solo se corrige si el clip cubre desde timeStart=0
            // hasta el final (timeEnd≈1) y no fue movido manualmente.
            const totalDur = _expGetTotalDuration() || 1;
            const audioFrac = Math.min(1, dur / totalDur);
            for (const clip of track.clips) {
                // Solo ajustar clips cuyo timeEnd sea 1 (placeholder inicial)
                // y que abarquen desde su timeStart hasta el final.
                const clipDurFrac = clip.timeEnd - clip.timeStart;
                if (clip.timeEnd >= 0.9999) {
                    // Duración real esperada del clip según fracción del source
                    const sourceFrac = clip.sourceEnd - clip.sourceStart;
                    clip.timeEnd = Math.min(1, clip.timeStart + audioFrac * sourceFrac);
                }
            }
            _expAudioRenderTracks();
        };

        // Timeout de seguridad: si loadedmetadata nunca llega (formato no soportado, etc.)
        const _probeTimeout = setTimeout(() => { probe.src = ''; }, 15000);

        probe.addEventListener('loadedmetadata', () => {
            if (isFinite(probe.duration) && probe.duration > 0) {
                // Duración disponible directamente (WAV, OGG, etc.)
                clearTimeout(_probeTimeout);
                const dur = probe.duration;
                probe.src = '';
                _applyDuration(dur);
            } else {
                // Chrome + MP3 VBR: duration === Infinity → forzar cálculo con seek trick
                probe.currentTime = 1e101;
                probe.ontimeupdate = function () {
                    probe.ontimeupdate = null;
                    clearTimeout(_probeTimeout);
                    const dur = probe.duration;
                    probe.currentTime = 0; // resetear posición
                    probe.src = '';
                    _applyDuration(dur);
                };
            }
        }, { once: true });
    }

    _expAudioRenderTracks();
    _expAudioUpdatePanelList();
    return track.id;
}

function _expAudioAddFromFile(inp) {
    if (!inp.files?.length) return;
    const file = inp.files[0];
    const color = _TL_COLORS[(_expAudioTracks.length + 2) % _TL_COLORS.length];
    const url = URL.createObjectURL(file);
    _expAudioAddTrack(file.name, color, null, url);
    inp.value = '';
}

// Agrega una repetición del track al final como clip independiente en el timeline
function _expAudioLoopTrack(id) {
    const src = _expAudioTracks.find(t => t.id === id);
    if (!src || src._isTtsTrack) return;
    const totalDur = _expGetTotalDuration() || 1;
    const audioDur = src.audioDuration;
    if (!audioDur) { mostrarNotificacion('⚠ Esperando duración del audio…'); return; }

    // NLE puro: el nuevo clip ocupa en el timeline justo después del último clip existente.
    // sourceStart=0 / sourceEnd=1 → reproduce el archivo completo (independiente del original).
    const audioFrac = Math.min(1, audioDur / totalDur);
    const lastEnd = src.clips.reduce((max, c) => Math.max(max, c.timeEnd), 0);
    if (lastEnd >= 1) { mostrarNotificacion('⚠ No hay espacio para más repeticiones'); return; }

    const newStart = lastEnd;
    const newEnd = Math.min(1, newStart + audioFrac);
    src._clipIdCounter = (src._clipIdCounter || 1) + 1;
    src.clips.push({
        id: src._clipIdCounter,
        timeStart: newStart, timeEnd: newEnd,
        sourceStart: 0, sourceEnd: 1,
        fadeIn: 0, fadeOut: 0
    });

    _expAudioRenderTracks();
    _expAudioUpdatePanelList();
    mostrarNotificacion('🔁 Repetición añadida');
}

// Abre el selector de audio en la carpeta Music usando File System Access API
function _expAudioLabelClick(labelEl, inp) {
    if (typeof window.showOpenFilePicker !== 'function') return;
    labelEl.addEventListener('click', async function (e) {
        e.preventDefault();
        try {
            const [fh] = await window.showOpenFilePicker({
                startIn: 'music',
                types: [{
                    description: 'Audio', accept: {
                        'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.opus', '.weba']
                    }
                }],
                multiple: false
            });
            const file = await fh.getFile();
            const dt = new DataTransfer();
            dt.items.add(file);
            inp.files = dt.files;
            inp.dispatchEvent(new Event('change'));
        } catch (err) {
            if (err.name !== 'AbortError') inp.click();
        }
    });
}


function _expAudioRemoveTrack(id) {
    const t = _expAudioTracks.find(t => t.id === id);
    if (t) {
        if (t.audioEl) { t.audioEl.pause(); t.audioEl.src = ''; t.audioEl.remove(); t.audioEl = null; }
        try { if (t.audioSource) t.audioSource.disconnect(); } catch (e) { }
        try { if (t.gainNode) t.gainNode.disconnect(); } catch (e) { }
        t.audioSource = null; t.gainNode = null;
    }
    _expAudioTracks = _expAudioTracks.filter(t => t.id !== id);
    if (_expAudioSelectedSeg?.trackId === id) _expAudioSelectedSeg = null;
    _expAudioRenderTracks();
    _expAudioUpdatePanelList();
}

function _expAudioSetRate(id, delta) {
    const t = _expAudioTracks.find(t => t.id === id);
    if (!t) return;
    t.rate = Math.round(Math.max(0.5, Math.min(2.0, (t.rate || 1.0) + delta)) * 1000) / 1000;
    if (t.audioEl) t.audioEl.playbackRate = t.rate;
    // NO llamar _expAudioRenderTracks — destruiría el DOM y el rateLabel
    // El label se actualiza directamente en el onclick del botón
}

function _expAudioSetVol(id, val) {
    const t = _expAudioTracks.find(t => t.id === id);
    if (t) {
        t.volume = +val;
        // gainNode toma prioridad — el fade loop actualiza el gain en el próximo frame
        if (!t.gainNode && t.audioEl) t.audioEl.volume = val / 100;
        _expAudioRenderTracks();
        _expAudioUpdatePanelList();
    }
}

function _expAudioSetMode(m) {
    _expAudioMode = _expAudioMode === m ? 'normal' : m;
    const btn = document.getElementById('exp-btn-split');
    if (btn) btn.classList.toggle('active', _expAudioMode === 'split');
    document.querySelectorAll('.exp-track-canvas-wrap').forEach(w => {
        w.style.cursor = _expAudioMode === 'split' ? 'crosshair' : 'pointer';
    });
}

function _expAudioDeleteSelected() {
    // handled via context menu
}

function _expAudioUndoSplit() {
    // Undo: fusionar los dos ultimos clips del ultimo track con historial
    for (let i = _expAudioTracks.length - 1; i >= 0; i--) {
        const t = _expAudioTracks[i];
        if (t.clipHistory && t.clipHistory.length > 0) {
            t.clips = t.clipHistory.pop();
            _expAudioSelectedSeg = null; _expAudioRenderTracks(); return;
        }
    }
}

function _expAudioSplitAt(t, frac) {
    // frac: posición en el TIMELINE (0-1 del video total)
    const si = t.clips.findIndex(c => frac > c.timeStart && frac < c.timeEnd);
    if (si < 0) return;
    const orig = t.clips[si];

    // Calcular sourceStart/sourceEnd para cada mitad
    const origSourceLen = orig.sourceEnd - orig.sourceStart;
    const origTimeLen = orig.timeEnd - orig.timeStart;
    // Qué fracción del source corresponde al punto de corte
    const fracInClip = (frac - orig.timeStart) / origTimeLen;
    const sourceSplit = orig.sourceStart + fracInClip * origSourceLen;

    if (!t.clipHistory) t.clipHistory = [];
    t.clipHistory.push(t.clips.map(c => ({ ...c }))); // snapshot undo

    t._clipIdCounter = (t._clipIdCounter || 1) + 1;
    const idB = t._clipIdCounter;

    t.clips.splice(si, 1,
        // Clip izquierdo: misma posición de inicio, termina en el punto de corte
        {
            id: orig.id, timeStart: orig.timeStart, timeEnd: frac,
            sourceStart: orig.sourceStart, sourceEnd: sourceSplit,
            fadeIn: orig.fadeIn, fadeOut: 0
        },
        // Clip derecho: nuevo id, arranca en el punto de corte
        {
            id: idB, timeStart: frac, timeEnd: orig.timeEnd,
            sourceStart: sourceSplit, sourceEnd: orig.sourceEnd,
            fadeIn: 0, fadeOut: orig.fadeOut
        }
    );
    _expAudioMode = 'normal';
    const btn = document.getElementById('exp-btn-split');
    if (btn) btn.classList.remove('active');
    _expAudioRenderTracks();
}

// ─── Render del timeline de tracks ─────────────────────────────────
function _expAudioRenderTracks() {
    const container = document.getElementById('exp-audio-tracks');
    const controlsCol = document.getElementById('exp-tl-controls-col');
    if (!container) return;
    container.innerHTML = '';
    if (controlsCol) controlsCol.innerHTML = '';

    // Garantizar Sets
    if (!_expAudioExpandedSet) _expAudioExpandedSet = new Set();
    if (!_expAudioKnownIds) _expAudioKnownIds = new Set();
    // Solo expandir tracks que nunca se han visto antes (tracks nuevos)
    _expAudioTracks.forEach(t => {
        if (!_expAudioKnownIds.has(t.id)) {
            _expAudioExpandedSet.add(t.id);   // nuevo → expandido por defecto
            _expAudioKnownIds.add(t.id);
        }
    });
    // Limpiar IDs huérfanos (tracks eliminados)
    const _validIds = new Set(_expAudioTracks.map(t => t.id));
    _expAudioExpandedSet.forEach(id => { if (!_validIds.has(id)) _expAudioExpandedSet.delete(id); });
    _expAudioKnownIds.forEach(id => { if (!_validIds.has(id)) _expAudioKnownIds.delete(id); });

    _expAudioTracks.forEach(t => {
        const ROW_H = 54;
        const ROW_COLLAPSED = 18;
        const isExpanded = _expAudioExpandedSet.has(t.id);

        // ── Columna izquierda: controles ────
        const ctrlRow = document.createElement('div');
        ctrlRow.style.cssText = `display:flex;align-items:center;gap:4px;height:${isExpanded ? ROW_H : ROW_COLLAPSED}px;padding:0 6px 0 10px;margin-bottom:4px;box-sizing:border-box;overflow:hidden;transition:height .15s;`;

        // Toggle expand/collapse para este track
        const _toggleTrackExpand = () => {
            if (!_expAudioExpandedSet) _expAudioExpandedSet = new Set();
            if (_expAudioExpandedSet.has(t.id)) _expAudioExpandedSet.delete(t.id);
            else _expAudioExpandedSet.add(t.id);
            // Marcar como conocido para que el render no lo re-expanda
            if (!_expAudioKnownIds) _expAudioKnownIds = new Set();
            _expAudioKnownIds.add(t.id);
            _expAudioRenderTracks();
        };

        if (isExpanded) {
            // Cambiar ctrlRow a flex-column para 2 filas
            ctrlRow.style.flexDirection = 'column';
            ctrlRow.style.alignItems = 'stretch';
            ctrlRow.style.gap = '2px';
            ctrlRow.style.justifyContent = 'center';

            // ── Fila 1: nombre + colapsar + eliminar ─────────────────
            const row1 = document.createElement('div');
            row1.style.cssText = 'display:flex;align-items:center;gap:3px;';

            const dot1 = document.createElement('span');
            dot1.style.cssText = `width:6px;height:6px;border-radius:50%;background:${t.color};flex-shrink:0;`;

            const lbl = document.createElement('div');
            lbl.className = 'exp-track-label';
            lbl.textContent = t.name; lbl.title = t.name;
            lbl.style.cssText = 'flex:1;font-size:10px;color:#aaa;font-family:"DM Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

            const collapseBtn = document.createElement('button');
            collapseBtn.title = 'Colapsar';
            collapseBtn.style.cssText = 'background:none;border:none;color:#c8a96e;font-size:11px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;';
            collapseBtn.textContent = '▼';
            collapseBtn.onmouseover = () => collapseBtn.style.color = '#e0c880';
            collapseBtn.onmouseout = () => collapseBtn.style.color = '#c8a96e';
            collapseBtn.onclick = _toggleTrackExpand;

            const delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:none;border:none;color:#3a3a3a;font-size:12px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;';
            delBtn.textContent = '✕';
            delBtn.onmouseover = () => delBtn.style.color = '#cc6655';
            delBtn.onmouseout = () => delBtn.style.color = '#3a3a3a';
            delBtn.onclick = () => _expAudioRemoveTrack(t.id);

            row1.append(dot1, lbl, collapseBtn, delBtn);

            // ── Fila 2: controles ─────────────────────────────────────
            const row2 = document.createElement('div');
            row2.style.cssText = 'display:flex;align-items:center;gap:3px;';

            const _mkBtn = (txt, title, onclick, color) => {
                const b = document.createElement('button');
                b.textContent = txt; b.title = title;
                b.style.cssText = `background:none;border:1px solid #2a2a2a;border-radius:3px;color:${color || '#888'};font-size:11px;padding:1px 4px;cursor:pointer;transition:all .12s;flex-shrink:0;line-height:1;font-family:"DM Mono",monospace;`;
                b.onmouseover = () => { b.style.borderColor = '#c8a96e'; b.style.color = '#c8a96e'; };
                b.onmouseout = () => { b.style.borderColor = '#2a2a2a'; b.style.color = color || '#888'; };
                b.onclick = onclick; return b;
            };

            const muteBtn = _mkBtn(t.muted ? 'M' : 'M', t.muted ? 'Activar' : 'Silenciar',
                () => { t.muted = !t.muted; _expAudioRenderTracks(); _expAudioUpdatePanelList(); },
                t.muted ? '#cc6655' : '#888');
            muteBtn.style.borderColor = t.muted ? '#cc6655' : '#2a2a2a';

            const volSlider = document.createElement('input');
            volSlider.type = 'range'; volSlider.min = 0; volSlider.max = 100; volSlider.value = t.volume;
            volSlider.style.cssText = 'flex:1;min-width:0;accent-color:#c8a96e;cursor:pointer;height:12px;';
            volSlider.title = `Vol: ${t.volume}%`;
            volSlider.oninput = () => { _expAudioSetVol(t.id, volSlider.value); volSlider.title = `Vol: ${volSlider.value}%`; };

            const volPct = document.createElement('span');
            volPct.style.cssText = 'font-size:10px;color:#666;font-family:"DM Mono",monospace;flex-shrink:0;min-width:26px;text-align:right;';
            volPct.textContent = t.volume + '%';
            volSlider.oninput = () => { _expAudioSetVol(t.id, volSlider.value); volPct.textContent = volSlider.value + '%'; };

            row2.append(muteBtn, volSlider, volPct);

            if (!t._isTtsTrack) {
                // Vol − / +
                const volMinus = _mkBtn('−', 'Vol −1%', () => {
                    _expAudioSetVol(t.id, Math.max(0, t.volume - 1));
                    volSlider.value = t.volume; volPct.textContent = t.volume + '%';
                });
                const volPlus = _mkBtn('+', 'Vol +1%', () => {
                    _expAudioSetVol(t.id, Math.min(100, t.volume + 1));
                    volSlider.value = t.volume; volPct.textContent = t.volume + '%';
                });

                // Tempo
                const rateLabel = document.createElement('span');
                rateLabel.title = 'Velocidad de reproducción';
                rateLabel.style.cssText = 'font-size:10px;color:#666;font-family:"DM Mono",monospace;flex-shrink:0;min-width:38px;text-align:center;';
                rateLabel.textContent = (t.rate || 1).toFixed(3) + '×';

                const rateMinus = _mkBtn('◂', 'Tempo −0.001×', () => {
                    _expAudioSetRate(t.id, -0.001);
                    rateLabel.textContent = (t.rate || 1).toFixed(3) + '×';
                });
                const ratePlus = _mkBtn('▸', 'Tempo +0.001×', () => {
                    _expAudioSetRate(t.id, +0.001);
                    rateLabel.textContent = (t.rate || 1).toFixed(3) + '×';
                });

                const loopBtn = _mkBtn('🔁', 'Duplicar en loop', () => _expAudioLoopTrack(t.id));
                loopBtn.onmouseover = () => { loopBtn.style.borderColor = '#7eb89a'; loopBtn.style.color = '#7eb89a'; };
                loopBtn.onmouseout = () => { loopBtn.style.borderColor = '#2a2a2a'; loopBtn.style.color = '#888'; };

                row2.append(volMinus, volPlus, rateMinus, rateLabel, ratePlus, loopBtn);
            }

            ctrlRow.append(row1, row2);
        } else {
            // Colapsado: barra de color + nombre + flecha ▶ para expandir
            const bar = document.createElement('div');
            bar.style.cssText = `width:100%;height:100%;background:${t.color}44;border-radius:2px;cursor:pointer;display:flex;align-items:center;padding:0 6px;box-sizing:border-box;gap:6px;`;
            bar.title = `${t.name} — click para expandir`;
            const dot = document.createElement('span');
            dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${t.color};flex-shrink:0;`;
            const nm = document.createElement('span');
            nm.style.cssText = 'flex:1;font-size:10px;color:#888;font-family:"DM Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            nm.textContent = t.name;
            const arrow = document.createElement('span');
            arrow.style.cssText = 'font-size:10px;color:#666;flex-shrink:0;';
            arrow.textContent = '▶';
            bar.append(dot, nm, arrow);
            bar.onclick = _toggleTrackExpand;
            ctrlRow.appendChild(bar);
        }

        if (controlsCol) controlsCol.appendChild(ctrlRow);

        // ── Columna derecha: canvas ────
        const canvasRow = document.createElement('div');
        canvasRow.style.cssText = `height:${isExpanded ? ROW_H : ROW_COLLAPSED}px;display:flex;align-items:stretch;margin-bottom:4px;padding-right:10px;box-sizing:border-box;overflow:hidden;transition:height .15s;`;

        const wrap = document.createElement('div');
        wrap.className = 'exp-track-canvas-wrap';
        wrap.style.height = isExpanded ? '50px' : '100%';
        wrap.style.cursor = !isExpanded ? 'pointer' : (_expAudioMode === 'split' ? 'crosshair' : (!t._isTtsTrack ? 'grab' : 'pointer'));
        wrap.title = isExpanded ? '' : `${t.name} — click para expandir`;

        if (!isExpanded) {
            wrap.addEventListener('click', _toggleTrackExpand);
        }

        const cv = document.createElement('canvas');
        cv.height = isExpanded ? 50 : ROW_COLLAPSED;
        cv.dataset.trackId = t.id;
        wrap.appendChild(cv);
        canvasRow.appendChild(wrap);
        container.appendChild(canvasRow);

        requestAnimationFrame(() => {
            const _scrollW = document.getElementById("exp-tl-scroll-wrap");
            cv.width = wrap.clientWidth || (_scrollW ? _scrollW.clientWidth : 0) || 400;
            _expAudioDrawTrack(cv, t);
            if (isExpanded) _expAudioBindTrackEvents(wrap, cv, t);
        });
    });
}

function _expAudioDrawTrack(canvas, t) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);

    // Fondo base
    c.fillStyle = t._isTtsTrack ? '#0a0a0a' : '#101010';
    c.fillRect(0, 0, W, H);

    // Para tracks de música: calcular el ancho real de cada clip en tiempo real.
    // clip.timeEnd puede ser un placeholder (1) si audioDuration aún no cargó.
    // Se usa audioDuration / totalDuration para obtener la fracción proporcional real.
    const totalDur = _expGetTotalDuration() || 1;
    const audioFracPerClip = (!t._isTtsTrack && t.audioDuration)
        ? Math.min(1, t.audioDuration / totalDur)
        : null; // null = usar clip.timeEnd tal cual (TTS o duración desconocida)

    // Si aún no tenemos audioDuration para música, mostrar placeholder
    if (!t._isTtsTrack && !t.audioDuration) {
        c.fillStyle = t.color + '22'; c.fillRect(0, 0, W, H);
        c.fillStyle = t.color + '66';
        c.font = '9px "DM Mono",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('cargando…', W / 2, H / 2);
        const _vt = _expTtsGetCurrentTime(_expPreviewFrase);
        const _cpx = Math.round(Math.max(0, Math.min(1, _vt / totalDur)) * W);
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(_cpx - 1, 0, 2, H);
        return;
    }

    // Cada clip se dibuja en su posición del TIMELINE (timeStart - timeEnd real)
    t.clips.forEach((clip, idx) => {
        const x1 = clip.timeStart * W;
        // Para música: x2 = timeStart + audioFracPerClip (duración real del clip fuente)
        // Para TTS: x2 = clip.timeEnd (gestionado por el sistema de pre-generación)
        const x2 = audioFracPerClip !== null
            ? Math.min(W, (clip.timeStart + audioFracPerClip * (clip.sourceEnd - clip.sourceStart)) * W)
            : clip.timeEnd * W;
        const sw = x2 - x1;
        if (sw < 1) return;

        const isSel = _expAudioSelectedSeg?.trackId === t.id && _expAudioSelectedSeg?.segIdx === idx;

        // Fondo del clip
        if (!t._isTtsTrack) {
            c.fillStyle = '#0a0a0a'; c.fillRect(x1, 0, sw, H);
        }

        function gainAt(n) {
            let g = 1;
            if (clip.fadeIn > 0 && n < clip.fadeIn) g = Math.min(g, n / clip.fadeIn);
            if (clip.fadeOut > 0 && n > (1 - clip.fadeOut)) g = Math.min(g, (1 - n) / clip.fadeOut);
            return Math.max(0, Math.min(1, g));
        }

        // Relleno con envelope
        c.beginPath();
        for (let px = x1; px <= x2; px++) {
            const n = sw > 0 ? (px - x1) / sw : 0;
            const g = gainAt(n);
            const envY = H - g * H;
            if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
        }
        c.lineTo(x2, H); c.lineTo(x1, H); c.closePath();
        c.fillStyle = t.muted ? '#1a1a1a' : (isSel ? t.color + '40' : t.color + '18');
        c.fill();

        if (!t.muted) {
            // Waveform simulada
            c.save();
            c.beginPath();
            for (let px = x1; px <= x2; px++) {
                const n = sw > 0 ? (px - x1) / sw : 0;
                const envY = H - gainAt(n) * H;
                if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
            }
            c.lineTo(x2, H); c.lineTo(x1, H); c.closePath();
            c.clip();

            c.strokeStyle = t.color + (isSel ? 'cc' : '66');
            c.lineWidth = 1; c.beginPath();
            const seed = t.id * 137;
            for (let px = x1; px < x2; px++) {
                const n = (px - x1) / sw;
                const amp = Math.sin(n * 80 + seed) * Math.sin(n * 13 + seed * .3) * Math.cos(n * 5);
                const g = gainAt(n);
                const mid = H - g * H / 2;
                const range = g * (H / 2 - 2);
                const y = mid + amp * range;
                px === x1 ? c.moveTo(px, y) : c.lineTo(px, y);
            }
            c.stroke();
            c.restore();

            // Línea de envelope
            c.beginPath();
            c.strokeStyle = t.color + 'cc';
            c.lineWidth = 1.5;
            for (let px = x1; px <= x2; px++) {
                const n = sw > 0 ? (px - x1) / sw : 0;
                const envY = H - gainAt(n) * H;
                if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
            }
            c.stroke();

            // Handle fade IN
            {
                const fiX = clip.fadeIn > 0 ? x1 + sw * clip.fadeIn : x1;
                c.fillStyle = clip.fadeIn > 0 ? t.color + 'ee' : t.color + '44';
                c.beginPath();
                c.moveTo(fiX - 6, 1); c.lineTo(fiX + 6, 1); c.lineTo(fiX, 10);
                c.closePath(); c.fill();
                if (clip.fadeIn > 0 && sw * clip.fadeIn > 28) {
                    c.fillStyle = t.color + '99';
                    c.font = '8px "DM Mono",monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
                    c.fillText('fade in', x1 + 3, 12);
                }
            }
            // Handle fade OUT
            {
                const foX = clip.fadeOut > 0 ? x2 - sw * clip.fadeOut : x2;
                c.fillStyle = clip.fadeOut > 0 ? t.color + 'ee' : t.color + '44';
                c.beginPath();
                c.moveTo(foX - 6, 1); c.lineTo(foX + 6, 1); c.lineTo(foX, 10);
                c.closePath(); c.fill();
                if (clip.fadeOut > 0 && sw * clip.fadeOut > 28) {
                    c.fillStyle = t.color + '99';
                    c.font = '8px "DM Mono",monospace'; c.textAlign = 'right'; c.textBaseline = 'top';
                    c.fillText('fade out', x2 - 3, 12);
                }
            }

            // Borde izquierdo del clip — trim handle visual
            c.fillStyle = t.color + 'cc'; c.fillRect(x1, 0, 2, H);
            // Handle izquierdo: pequeña pestaña con triángulo
            if (!t._isTtsTrack) {
                c.fillStyle = t.color + 'ff';
                c.fillRect(x1, H * 0.2, 5, H * 0.6);
                c.beginPath();
                c.moveTo(x1 + 5, H * 0.2);
                c.lineTo(x1 + 9, H * 0.5);
                c.lineTo(x1 + 5, H * 0.8);
                c.fill();
                // Handle derecho
                c.fillRect(x2 - 5, H * 0.2, 5, H * 0.6);
                c.beginPath();
                c.moveTo(x2 - 5, H * 0.2);
                c.lineTo(x2 - 9, H * 0.5);
                c.lineTo(x2 - 5, H * 0.8);
                c.fill();
            }
        }

        if (isSel) {
            c.strokeStyle = t.color + 'aa'; c.lineWidth = 1.5;
            c.strokeRect(x1 + 1, 1, sw - 2, H - 2);
        }

        // Separador entre clips (línea punteada)
        if (idx > 0) {
            c.strokeStyle = t.color + '44'; c.lineWidth = 1;
            c.setLineDash([2, 3]);
            c.beginPath(); c.moveTo(x1, 0); c.lineTo(x1, H); c.stroke();
            c.setLineDash([]);
        }
    });

    // Cursor de posición
    const _totalDurCursor = _expGetTotalDuration() || 1;
    const _videoTimeCursor = _expTtsGetCurrentTime(_expPreviewFrase);
    const cursorFrac = _videoTimeCursor / _totalDurCursor;
    const px = Math.round(Math.max(0, Math.min(1, cursorFrac)) * W);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(px - 1, 0, 2, H);
}

// ─── Zoom del timeline ────────────────────────────────────────────────
function _expZoomIn() {
    _expTimelineZoom = Math.min(8, parseFloat((_expTimelineZoom * 1.5).toFixed(2)));
    _expApplyZoom();
}

function _expZoomOut() {
    _expTimelineZoom = Math.max(1, parseFloat((_expTimelineZoom / 1.5).toFixed(2)));
    _expApplyZoom();
}

function _expApplyZoom() {
    const zoom = _expTimelineZoom;
    const lbl = document.getElementById('exp-zoom-label');
    if (lbl) lbl.textContent = zoom === 1 ? '1×' : zoom.toFixed(1) + '×';

    const trackInner = document.getElementById('exp-tl-scroll-inner');
    const imgInner = document.getElementById('exp-img-tl-scroll-inner');
    const scrollWrap = document.getElementById('exp-tl-scroll-wrap');
    const imgScroll = document.getElementById('exp-img-tl-scroll-wrap');

    if (trackInner) trackInner.style.width = (zoom * 100) + '%';
    if (imgInner) imgInner.style.width = (zoom * 100) + '%';

    // Habilitar scroll horizontal solo cuando hay zoom
    if (imgScroll) imgScroll.style.overflowX = zoom > 1 ? 'auto' : 'hidden';

    // Sincronizar scroll entre los dos wrappers (una sola vez)
    if (scrollWrap && imgScroll && !scrollWrap._scrollBound) {
        scrollWrap._scrollBound = true;
        scrollWrap.addEventListener('scroll', () => { imgScroll.scrollLeft = scrollWrap.scrollLeft; });
        imgScroll.addEventListener('scroll', () => { scrollWrap.scrollLeft = imgScroll.scrollLeft; });
    }

    // Re-renderizar todo
    _expAudioRenderTracks();
    _expTimelineInit();
    _expTimelineRender();
    _expTimelineRulerRender();
}

// ─── Eventos de track ───────────────────────────────────────────────
const _EXP_FADE_HIT = 10;
const _EXP_TRIM_HIT = 8; // px de zona de hit para trim handles
let _expAudioOffsetDrag = null; // { trackId, canvasEl, startX, clipIdx, origStart }
let _expAudioTrimDrag = null;   // { trackId, canvasEl, startX, clipIdx, side, origSource, origTimeStart, origTimeEnd }

// Detecta si el cursor está sobre un trim handle (borde izquierdo o derecho del clip)
function _expAudioGetTrimHandle(canvas, t, cxVisual, rectWidth) {
    const W = rectWidth || canvas.getBoundingClientRect().width || canvas.width;
    for (let idx = 0; idx < (t.clips || []).length; idx++) {
        const clip = t.clips[idx];
        const audioFracPerClip = t.audioDuration ? Math.min(1, t.audioDuration / (_expGetTotalDuration() || 1)) : null;
        const x1 = clip.timeStart * W;
        const x2 = audioFracPerClip !== null
            ? Math.min(W, (clip.timeStart + audioFracPerClip * (clip.sourceEnd - clip.sourceStart)) * W)
            : clip.timeEnd * W;
        // Borde izquierdo = trim inicio de source
        if (Math.abs(cxVisual - x1) <= _EXP_TRIM_HIT) return { idx, side: 'left' };
        // Borde derecho = trim fin de source
        if (Math.abs(cxVisual - x2) <= _EXP_TRIM_HIT) return { idx, side: 'right' };
    }
    return null;
}

function _expAudioGetFadeHandle(canvas, t, cxVisual, rectWidth) {
    const W = rectWidth || canvas.getBoundingClientRect().width || canvas.width;
    for (let idx = 0; idx < (t.clips || []).length; idx++) {
        const clip = t.clips[idx];
        const x1 = clip.timeStart * W, x2 = clip.timeEnd * W, sw = x2 - x1;
        const fiHitX = clip.fadeIn > 0 ? (x1 + sw * clip.fadeIn) : x1;
        if (Math.abs(cxVisual - fiHitX) <= _EXP_FADE_HIT && cxVisual <= x1 + sw * 0.5) return { idx, side: 'in' };
        const foHitX = clip.fadeOut > 0 ? (x2 - sw * clip.fadeOut) : x2;
        if (Math.abs(cxVisual - foHitX) <= _EXP_FADE_HIT && cxVisual >= x1 + sw * 0.5) return { idx, side: 'out' };
    }
    return null;
}

function _expAudioBindTrackEvents(wrap, canvas, t) {
    const tooltip = document.getElementById('exp-fade-tooltip');

    wrap.addEventListener('mousedown', e => {
        const rect = wrap.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const fh = _expAudioGetFadeHandle(canvas, t, cx);
        if (fh) {
            const seg = t.clips[fh.idx];
            _expAudioFadeDrag = {
                trackId: t.id, segIdx: fh.idx, side: fh.side, canvasEl: canvas,
                startX: e.clientX, origFade: fh.side === 'in' ? seg.fadeIn : seg.fadeOut
            };
            document.addEventListener('mousemove', _expAudioOnFadeDrag);
            document.addEventListener('mouseup', _expAudioOnFadeDragEnd, { once: true });
            return;
        }
        // Trim handles — borde izquierdo (sourceStart) o derecho (sourceEnd/timeEnd)
        if (!t._isTtsTrack) {
            const th = _expAudioGetTrimHandle(canvas, t, cx);
            if (th) {
                const clip = t.clips[th.idx];
                _expAudioTrimDrag = {
                    trackId: t.id, canvasEl: canvas, startX: e.clientX, clipIdx: th.idx, side: th.side,
                    origSourceStart: clip.sourceStart, origSourceEnd: clip.sourceEnd,
                    origTimeStart: clip.timeStart, origTimeEnd: clip.timeEnd
                };
                wrap.style.cursor = 'col-resize';
                document.addEventListener('mousemove', _expAudioOnTrimDrag);
                document.addEventListener('mouseup', _expAudioOnTrimDragEnd, { once: true });
                return;
            }
        }
        const frac = cx / canvas.width;
        if (_expAudioMode === 'split') { _expAudioSplitAt(t, frac); return; }
        // Para tracks de música (no TTS): detectar en qué clip NLE está el click y arrastrarlo
        if (!t._isTtsTrack) {
            const clipIdx = (t.clips || []).findIndex(c => frac >= c.timeStart && frac <= c.timeEnd);
            if (clipIdx >= 0) {
                const origStart = t.clips[clipIdx].timeStart;
                _expAudioOffsetDrag = { trackId: t.id, canvasEl: canvas, startX: e.clientX, clipIdx, origStart };
                wrap.style.cursor = 'grabbing';
                document.addEventListener('mousemove', _expAudioOnOffsetDrag);
                document.addEventListener('mouseup', _expAudioOnOffsetDragEnd, { once: true });
            }
            return;
        }
        const si = (t.clips || []).findIndex(c => frac >= c.timeStart && frac <= c.timeEnd);
        _expAudioSelectedSeg = si >= 0 ? { trackId: t.id, segIdx: si } : null;
        _expAudioRenderTracks();
    });

    wrap.addEventListener('mousemove', e => {
        const rect = wrap.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const fh = _expAudioGetFadeHandle(canvas, t, cx);
        if (fh) {
            wrap.style.cursor = 'ew-resize';
            const seg = t.clips[fh.idx];
            const pct = Math.round((fh.side === 'in' ? seg.fadeIn : seg.fadeOut) * 100);
            if (tooltip) { tooltip.style.display = 'block'; tooltip.style.left = (e.clientX + 12) + 'px'; tooltip.style.top = (e.clientY - 24) + 'px'; tooltip.textContent = fh.side === 'in' ? `◁ Fade in: ${pct}%` : `▷ Fade out: ${pct}%`; }
        } else if (!t._isTtsTrack && _expAudioGetTrimHandle(canvas, t, cx)) {
            wrap.style.cursor = 'col-resize';
            if (tooltip) tooltip.style.display = 'none';
        } else {
            if (!t._isTtsTrack && _expAudioMode !== 'split') {
                wrap.style.cursor = 'grab';
            } else {
                wrap.style.cursor = _expAudioMode === 'split' ? 'crosshair' : 'pointer';
            }
            if (tooltip) tooltip.style.display = 'none';
        }
    });

    wrap.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none'; });

    wrap.addEventListener('contextmenu', e => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const si = (t.clips || []).findIndex(c => frac >= c.timeStart && frac <= c.timeEnd);
        _expAudioCtxTarget = si >= 0 ? { t, segIdx: si, frac } : null;
        const menu = document.getElementById('exp-ctx-menu');
        if (menu) { menu.style.display = 'block'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; }
        document.addEventListener('click', _expAudioCloseCtxMenu, { once: true });
    });
}

function _expAudioOnOffsetDrag(e) {
    if (!_expAudioOffsetDrag) return;
    const t = _expAudioTracks.find(t => t.id === _expAudioOffsetDrag.trackId); if (!t) return;
    const canvas = _expAudioOffsetDrag.canvasEl;
    const W = canvas.getBoundingClientRect().width || canvas.width;
    const dx = e.clientX - _expAudioOffsetDrag.startX;
    const deltaFrac = dx / W;

    const clipIdx = _expAudioOffsetDrag.clipIdx;
    const clip = t.clips[clipIdx];
    if (!clip) return;

    const clipLen = clip.timeEnd - clip.timeStart;
    const newStart = Math.max(0, Math.min(1 - clipLen, _expAudioOffsetDrag.origStart + deltaFrac));
    clip.timeStart = newStart;
    clip.timeEnd = newStart + clipLen;

    _expAudioDrawTrack(canvas, t);
    const tooltip = document.getElementById('exp-fade-tooltip');
    if (tooltip) {
        const pct = Math.round(newStart * 100);
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 24) + 'px';
        tooltip.textContent = `⟺ Inicio: ${pct}%`;
    }
}


function _expAudioOnOffsetDragEnd(e) {
    if (!_expAudioOffsetDrag) return;
    const tooltip = document.getElementById('exp-fade-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    // Restaurar cursor
    const t = _expAudioTracks.find(t => t.id === _expAudioOffsetDrag.trackId);
    const canvas = _expAudioOffsetDrag.canvasEl;
    if (canvas.parentElement) canvas.parentElement.style.cursor = 'grab';
    _expAudioOffsetDrag = null;
    document.removeEventListener('mousemove', _expAudioOnOffsetDrag);
    // Re-sincronizar audio si está reproduciendo
    if (_expIsPlaying) {
        _expSeekToFrase(_expPreviewFrase);
    }
}

function _expAudioOnTrimDrag(e) {
    if (!_expAudioTrimDrag) return;
    const t = _expAudioTracks.find(t => t.id === _expAudioTrimDrag.trackId); if (!t) return;
    const canvas = _expAudioTrimDrag.canvasEl;
    const W = canvas.getBoundingClientRect().width || canvas.width;
    const totalDur = _expGetTotalDuration() || 1;
    const audioDur = t.audioDuration || 1;
    const dx = e.clientX - _expAudioTrimDrag.startX;
    const deltaFrac = dx / W; // fracción del video total

    const clip = t.clips[_expAudioTrimDrag.clipIdx];
    if (!clip) return;

    const tooltip = document.getElementById('exp-fade-tooltip');

    if (_expAudioTrimDrag.side === 'left') {
        // Trim izquierdo: mueve timeStart y sourceStart juntos
        // deltaFrac en espacio del video → convertir a espacio del source
        const videoToSource = (clip.sourceEnd - _expAudioTrimDrag.origSourceStart) /
            Math.max(1e-9, _expAudioTrimDrag.origTimeEnd - _expAudioTrimDrag.origTimeStart);
        const newTimeStart = Math.max(0, Math.min(_expAudioTrimDrag.origTimeEnd - 0.01,
            _expAudioTrimDrag.origTimeStart + deltaFrac));
        const newSourceStart = Math.max(0, Math.min(clip.sourceEnd - 0.01,
            _expAudioTrimDrag.origSourceStart + deltaFrac * videoToSource));
        clip.timeStart = newTimeStart;
        clip.sourceStart = newSourceStart;
        if (tooltip) {
            const secs = (newSourceStart * audioDur).toFixed(1);
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 24) + 'px';
            tooltip.textContent = `⊢ Inicio: ${secs}s`;
        }
    } else {
        // Trim derecho: mueve timeEnd y sourceEnd juntos
        const videoToSource = (_expAudioTrimDrag.origSourceEnd - clip.sourceStart) /
            Math.max(1e-9, _expAudioTrimDrag.origTimeEnd - _expAudioTrimDrag.origTimeStart);
        const newTimeEnd = Math.min(1, Math.max(_expAudioTrimDrag.origTimeStart + 0.01,
            _expAudioTrimDrag.origTimeEnd + deltaFrac));
        const newSourceEnd = Math.min(1, Math.max(clip.sourceStart + 0.01,
            _expAudioTrimDrag.origSourceEnd + deltaFrac * videoToSource));
        clip.timeEnd = newTimeEnd;
        clip.sourceEnd = newSourceEnd;
        if (tooltip) {
            const secs = (newSourceEnd * audioDur).toFixed(1);
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 24) + 'px';
            tooltip.textContent = `⊣ Fin: ${secs}s`;
        }
    }
    _expAudioDrawTrack(canvas, t);
}

function _expAudioOnTrimDragEnd() {
    if (!_expAudioTrimDrag) return;
    const tooltip = document.getElementById('exp-fade-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    const canvas = _expAudioTrimDrag.canvasEl;
    if (canvas?.parentElement) canvas.parentElement.style.cursor = 'grab';
    _expAudioTrimDrag = null;
    document.removeEventListener('mousemove', _expAudioOnTrimDrag);
    _expAudioRenderTracks();
    if (_expIsPlaying) _expSeekToFrase(_expPreviewFrase);
}

function _expAudioOnFadeDrag(e) {
    if (!_expAudioFadeDrag) return;
    const t = _expAudioTracks.find(t => t.id === _expAudioFadeDrag.trackId); if (!t) return;
    const seg = t.clips[_expAudioFadeDrag.segIdx];
    const W = _expAudioFadeDrag.rectWidth || _expAudioFadeDrag.canvasEl.getBoundingClientRect().width;
    const sw = (seg.timeEnd - seg.timeStart) * W;
    const dx = e.clientX - _expAudioFadeDrag.startX;
    let nf = _expAudioFadeDrag.origFade + (_expAudioFadeDrag.side === 'in' ? dx : -dx) / sw;
    nf = Math.max(0, Math.min(0.95, nf));
    if (_expAudioFadeDrag.side === 'in') seg.fadeIn = nf; else seg.fadeOut = nf;
    _expAudioDrawTrack(_expAudioFadeDrag.canvasEl, t);
    const tooltip = document.getElementById('exp-fade-tooltip');
    if (tooltip) { tooltip.style.display = 'block'; tooltip.style.left = (e.clientX + 12) + 'px'; tooltip.style.top = (e.clientY - 24) + 'px'; tooltip.textContent = _expAudioFadeDrag.side === 'in' ? `◁ Fade in: ${Math.round(nf * 100)}%` : `▷ Fade out: ${Math.round(nf * 100)}%`; }
}

function _expAudioOnFadeDragEnd() {
    _expAudioFadeDrag = null;
    document.removeEventListener('mousemove', _expAudioOnFadeDrag);
    const tooltip = document.getElementById('exp-fade-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

function _expAudioCloseCtxMenu() {
    const menu = document.getElementById('exp-ctx-menu');
    if (menu) menu.style.display = 'none';
}

// ── Fade: pedir porcentaje por input ────────────────────────────────
function _expAudioCtxFadeIn() {
    _expAudioCloseCtxMenu();
    if (!_expAudioCtxTarget) return;
    _expPromptPct('◁ Fade IN — ¿Cuánto % del segmento?', val => {
        _expAudioCtxTarget.t.clips[_expAudioCtxTarget.segIdx].fadeIn = val;
        _expAudioRenderTracks();
    });
}
function _expAudioCtxFadeOut() {
    _expAudioCloseCtxMenu();
    if (!_expAudioCtxTarget) return;
    _expPromptPct('▷ Fade OUT — ¿Cuánto % del segmento?', val => {
        _expAudioCtxTarget.t.clips[_expAudioCtxTarget.segIdx].fadeOut = val;
        _expAudioRenderTracks();
    });
}
function _expPromptPct(label, cb) {
    const old = document.getElementById('exp-pct-prompt');
    if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'exp-pct-prompt';
    d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:1px solid #3a3a3a;border-radius:8px;padding:18px 22px;z-index:100000;font-family:"DM Mono",monospace;color:#e8e0d0;min-width:220px;box-shadow:0 12px 40px rgba(0,0,0,.8);';
    d.innerHTML = `
        <div style="font-size:.52rem;color:#c8a96e;margin-bottom:10px;">${label}</div>
        <div style="display:flex;align-items:center;gap:8px;">
            <input id="exp-pct-input" type="number" min="1" max="95" value="25"
                   style="width:64px;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:4px;
                          color:#e8e0d0;font-family:'DM Mono',monospace;font-size:.6rem;
                          padding:4px 8px;outline:none;text-align:center;">
            <span style="font-size:.5rem;color:#666;">% (1–95)</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
            <button onclick="document.getElementById('exp-pct-prompt').remove()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:4px;color:#555;
                           font-family:'DM Mono',monospace;font-size:.5rem;padding:4px 12px;cursor:pointer;">
                Cancelar
            </button>
            <button id="exp-pct-ok"
                    style="background:#c8a96e;border:none;border-radius:4px;color:#0a0908;
                           font-family:'DM Mono',monospace;font-size:.5rem;font-weight:700;
                           padding:4px 14px;cursor:pointer;">
                Aplicar
            </button>
        </div>`;
    document.body.appendChild(d);
    const inp = document.getElementById('exp-pct-input');
    inp.focus(); inp.select();
    document.getElementById('exp-pct-ok').onclick = () => {
        const v = Math.max(1, Math.min(95, parseInt(inp.value) || 25)) / 100;
        d.remove(); cb(v);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('exp-pct-ok').click(); if (e.key === 'Escape') d.remove(); });
}

// ── Split: marcador arrastrable sobre el canvas ─────────────────────
function _expAudioCtxSplit() {
    _expAudioCloseCtxMenu();
    if (!_expAudioCtxTarget) return;
    const { t, frac } = _expAudioCtxTarget;
    const canvasEl = document.querySelector(`canvas[data-track-id="${t.id}"]`);
    if (!canvasEl) { _expAudioSplitAt(t, frac); return; }
    const wrap = canvasEl.closest('.exp-track-canvas-wrap');
    if (!wrap) { _expAudioSplitAt(t, frac); return; }
    const old = document.getElementById('exp-split-marker');
    if (old) old.remove();
    const marker = document.createElement('div');
    marker.id = 'exp-split-marker';
    marker.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#c8a96e;cursor:ew-resize;z-index:10;pointer-events:auto;';
    marker.style.left = (frac * 100) + '%';
    const tri = document.createElement('div');
    tri.style.cssText = 'position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #c8a96e;';
    marker.appendChild(tri);
    const lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;top:-26px;left:50%;transform:translateX(-50%);background:#c8a96e;color:#0a0908;font-family:"DM Mono",monospace;font-size:.42rem;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap;pointer-events:none;';
    lbl.textContent = '✂ arrastrar · click para cortar';
    marker.appendChild(lbl);
    wrap.style.position = 'relative';
    wrap.appendChild(marker);
    let currentFrac = frac;
    marker.addEventListener('mousedown', e => {
        e.stopPropagation();
        const rect = wrap.getBoundingClientRect();
        const onMove = ev => {
            currentFrac = Math.max(0.01, Math.min(0.99, (ev.clientX - rect.left) / rect.width));
            marker.style.left = (currentFrac * 100) + '%';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onMove), { once: true });
    });
    marker.addEventListener('click', e => { e.stopPropagation(); marker.remove(); _expAudioSplitAt(t, currentFrac); });
    setTimeout(() => {
        const cancel = ev => {
            if (!marker.isConnected) { document.removeEventListener('mousedown', cancel); return; }
            if (!marker.contains(ev.target)) { marker.remove(); document.removeEventListener('mousedown', cancel); }
        };
        document.addEventListener('mousedown', cancel);
    }, 200);
}

// ── Eliminar: listar segmentos y preguntar cuál ─────────────────────
function _expAudioCtxDelete() {
    _expAudioCloseCtxMenu();
    if (!_expAudioCtxTarget) return;
    const t = _expAudioCtxTarget.t;
    const clips = t.clips || [];
    const active = clips.map((c, i) => ({ c, i }));
    if (active.length === 0) return;

    function _removeClip(clipIdx) {
        const clips = t.clips;
        const target = clips[clipIdx];
        const prev = clips[clipIdx - 1];
        const next = clips[clipIdx + 1];
        if (prev && next) {
            const mid = target.timeStart + (target.timeEnd - target.timeStart) / 2;
            prev.timeEnd = mid;
            next.timeStart = mid;
        } else if (prev) {
            prev.timeEnd = target.timeEnd;
        } else if (next) {
            next.timeStart = target.timeStart;
        }
        t.clips.splice(clipIdx, 1);
        _expAudioSelectedSeg = null;
        _expAudioRenderTracks();
    }

    if (active.length === 1) {
        _removeClip(active[0].i);
        return;
    }
    const old = document.getElementById('exp-del-prompt');
    if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'exp-del-prompt';
    d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:1px solid #3a3a3a;border-radius:8px;padding:18px 22px;z-index:100000;font-family:"DM Mono",monospace;color:#e8e0d0;min-width:240px;box-shadow:0 12px 40px rgba(0,0,0,.8);';
    const items = active.map((x, n) => {
        const pct1 = Math.round(x.c.timeStart * 100), pct2 = Math.round(x.c.timeEnd * 100);
        return `<div class="exp-del-item" data-segidx="${x.i}"
            style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:.5rem;color:#888;
                   border:1px solid #1e1e1e;margin-bottom:5px;transition:all .12s;"
            onmouseover="this.style.background='#1a1a1a';this.style.color='#cc6655';this.style.borderColor='#cc6655';"
            onmouseout="this.style.background='';this.style.color='#888';this.style.borderColor='#1e1e1e';">
            Segmento ${n + 1} &nbsp;<span style="color:#444;">(${pct1}% - ${pct2}%)</span>
        </div>`;
    }).join('');
    d.innerHTML = `
        <div style="font-size:.52rem;color:#c8a96e;margin-bottom:12px;">Que segmento eliminar?</div>
        ${items}
        <div style="margin-top:10px;text-align:right;">
            <button onclick="document.getElementById('exp-del-prompt').remove()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:4px;color:#555;
                           font-family:'DM Mono',monospace;font-size:.5rem;padding:4px 12px;cursor:pointer;">
                Cancelar
            </button>
        </div>`;
    document.body.appendChild(d);
    d.querySelectorAll('.exp-del-item').forEach(el => {
        el.addEventListener('mousedown', e => e.stopPropagation());
        el.addEventListener('click', () => {
            d.remove();
            _removeClip(parseInt(el.dataset.segidx));
        });
    });
    // Cerrar al click fuera
    setTimeout(() => {
        const cancel = ev => {
            if (!d.isConnected) { document.removeEventListener('mousedown', cancel); return; }
            if (!d.contains(ev.target)) { d.remove(); document.removeEventListener('mousedown', cancel); }
        };
        document.addEventListener('mousedown', cancel);
    }, 200);
}
function _expAudioSoloToggle() {
    const btn = document.getElementById('exp-audio-solo-btn');
    if (!btn) return;
    const isPlaying = btn.dataset.playing === '1';
    if (isPlaying) {
        _expAudioPlayStop();
        btn.dataset.playing = '0';
        btn.textContent = '🔊 Escuchar preview';
        btn.style.color = '#c8a96e';
        btn.style.borderColor = '#3a3a3a';
    } else {
        _expAudioPlayStart();
        btn.dataset.playing = '1';
        btn.textContent = '⏸ Pausar audio';
        btn.style.color = '#7eb89a';
        btn.style.borderColor = '#7eb89a';
    }
}

function _expAudioUpdatePanelList() {
    const el = document.getElementById('exp-panel-tracks-list'); if (!el) return;
    el.innerHTML = _expAudioTracks.filter(t => !t._isTtsTrack).map(t => `
        <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:5px;
                    padding:6px 9px;display:flex;align-items:center;gap:7px;margin-bottom:5px;">
            <div style="width:7px;height:7px;border-radius:2px;flex-shrink:0;background:${t.color}44;border:1px solid ${t.color}88;"></div>
            <div style="font-size:.46rem;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.name}">${t.name}</div>
            <div style="display:flex;align-items:center;gap:4px;">
                <span style="font-size:.46rem;color:#666;">${t.muted ? '🔇' : '🔊'}</span>
                <input type="range" style="width:50px;accent-color:#c8a96e;" min="0" max="100" value="${t.volume}"
                       oninput="_expAudioSetVol(${t.id},this.value)">
                <span style="font-size:.42rem;color:#555;width:24px;">${t.volume}%</span>
            </div>
            <button onclick="_expAudioRemoveTrack(${t.id})"
                    style="background:none;border:none;color:#3a3a3a;font-size:.6rem;cursor:pointer;padding:2px 4px;line-height:1;"
                    onmouseover="this.style.color='#cc6655'" onmouseout="this.style.color='#3a3a3a'">✕</button>
        </div>`).join('') || '<div style="font-size:.45rem;color:#2e2e2e;text-align:center;padding:5px 0;">Sin tracks</div>';
    // Mostrar botón solo si hay tracks de música (no TTS)
    const ctrl = document.getElementById('exp-audio-preview-controls');
    const hasMusicTracks = _expAudioTracks.some(t => !t._isTtsTrack);
    if (ctrl) ctrl.style.display = hasMusicTracks ? 'block' : 'none';
    // Sincronizar slider de volumen TTS con el valor actual del track
    const ttsT = _expAudioTracks.find(t => t._isTtsTrack);
    const ttsSlider = document.getElementById('exp-tts-vol-slider');
    const ttsPct = document.getElementById('exp-tts-vol-pct');
    if (ttsT && ttsSlider) {
        ttsSlider.value = ttsT.volume;
        if (ttsPct) ttsPct.textContent = ttsT.volume + '%';
    }
}


// ───────────────────────────────────────────────────────────────────
// MEZCLA DE AUDIO (OfflineAudioContext → WAV blob)
// Mezcla TTS + tracks de música usando Web Audio API nativa:
// - Trim via AudioBufferSourceNode.start(when, offset, duration)
// - Fade in/out via GainNode.gain.linearRampToValueAtTime en OfflineAudioContext
// ───────────────────────────────────────────────────────────────────
async function _expMezclarAudio(buffers, duraciones) {
    // Detectar sampleRate del primer buffer TTS disponible
    let sampleRate = 24000;
    const probeCtx = new AudioContext();
    for (let i = 0; i < buffers.length; i++) {
        if (buffers[i]) {
            try { const p = await probeCtx.decodeAudioData(buffers[i].slice(0)); sampleRate = p.sampleRate; break; }
            catch (e) { }
        }
    }
    probeCtx.close();

    const totalSecs = duraciones.reduce((a, b) => a + b, 0);
    const totalSamples = Math.ceil(totalSecs * sampleRate);

    // ── OfflineAudioContext único para toda la mezcla ──
    const offCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

    // ── Paso 1: TTS — schedule cada frase en su offset de tiempo ──
    if (buffers && buffers.length) {
        let ttsOffset = 0;
        for (let i = 0; i < buffers.length; i++) {
            if (buffers[i]) {
                try {
                    const dec = await offCtx.decodeAudioData(buffers[i].slice(0));
                    const src = offCtx.createBufferSource();
                    src.buffer = dec;
                    src.connect(offCtx.destination);
                    src.start(ttsOffset);
                } catch (e) { }
            }
            ttsOffset += duraciones[i];
        }
    }

    // ── Paso 2: tracks de música — trim + fade via AudioParam automation ──
    const musicTracks = (_expAudioTracks || []).filter(t => !t._isTtsTrack && !t.muted && t.audioUrl);
    const decodeCtx = new AudioContext();

    for (const track of musicTracks) {
        let musicBuffer = null;
        try {
            const resp = await fetch(track.audioUrl);
            const arrBuf = await resp.arrayBuffer();
            musicBuffer = await decodeCtx.decodeAudioData(arrBuf);
        } catch (e) {
            console.warn('[export] no se pudo decodificar track:', track.name, e.message);
            continue;
        }

        const audioDur = musicBuffer.duration;
        const volFactor = (track.volume || 100) / 100;

        for (const clip of (track.clips || [])) {
            // Posiciones absolutas en segundos en el timeline del video
            const clipStartSec = clip.timeStart * totalSecs;
            const clipEndSec = clip.timeEnd * totalSecs;
            const clipDurSec = clipEndSec - clipStartSec;
            if (clipDurSec <= 0) continue;

            // Offset y duración dentro del archivo fuente
            const srcStartSec = clip.sourceStart * audioDur;
            const srcEndSec = clip.sourceEnd * audioDur;
            const srcDurSec = Math.min(srcEndSec - srcStartSec, clipDurSec);
            if (srcDurSec <= 0) continue;

            // Resamplear si hace falta (musicBuffer puede tener sampleRate distinto)
            let buf = musicBuffer;
            if (musicBuffer.sampleRate !== sampleRate) {
                const rsCtx = new OfflineAudioContext(1, Math.ceil(audioDur * sampleRate), sampleRate);
                const rsSrc = rsCtx.createBufferSource();
                rsSrc.buffer = musicBuffer;
                rsSrc.connect(rsCtx.destination);
                rsSrc.start(0);
                buf = await rsCtx.startRendering();
            }

            // GainNode para fade + volumen
            const gainNode = offCtx.createGain();
            gainNode.connect(offCtx.destination);

            // Aplicar volumen base
            gainNode.gain.setValueAtTime(volFactor, clipStartSec);

            // Fade in — linearRamp desde 0 hasta volFactor
            if (clip.fadeIn > 0) {
                const fadeInDur = clip.fadeIn * clipDurSec;
                gainNode.gain.setValueAtTime(0, clipStartSec);
                gainNode.gain.linearRampToValueAtTime(volFactor, clipStartSec + fadeInDur);
            }

            // Fade out — linearRamp desde volFactor hasta 0
            if (clip.fadeOut > 0) {
                const fadeOutStart = clipEndSec - clip.fadeOut * clipDurSec;
                gainNode.gain.setValueAtTime(volFactor, fadeOutStart);
                gainNode.gain.linearRampToValueAtTime(0, clipEndSec);
            }

            // AudioBufferSourceNode con trim nativo: start(when, offset, duration)
            const src = offCtx.createBufferSource();
            src.buffer = buf;
            src.connect(gainNode);
            src.start(clipStartSec, srcStartSec, srcDurSec);
        }
    }

    decodeCtx.close();

    const rendered = await offCtx.startRendering();

    // Normalizar picos si hay clipping
    const data = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
    if (peak > 1.0) { const inv = 1 / peak; for (let i = 0; i < data.length; i++) data[i] *= inv; }

    return _audioBufferToWavBlob(rendered);
}

function _audioBufferToWavBlob(ab) {
    const nCh = ab.numberOfChannels;
    const nSamp = ab.length;
    const sr = ab.sampleRate;
    const bps = 2;
    const data = nCh * nSamp * bps;
    const buf = new ArrayBuffer(44 + data);
    const v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + data, true);
    ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * bps, true);
    v.setUint16(32, nCh * bps, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, data, true);
    let o = 44;
    for (let s = 0; s < nSamp; s++) for (let c = 0; c < nCh; c++) {
        const x = Math.max(-1, Math.min(1, ab.getChannelData(c)[s]));
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true); o += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
}

// ───────────────────────────────────────────────────────────────────
// DIBUJAR FRAME — idéntico al visor pero sobre canvas offscreen
// ───────────────────────────────────────────────────────────────────
function _expDibujarFrame(ctx, W, H, img, current, total, _sentencesSnap, imgItem, effects) {
    // effects: objeto _expEffects (usa globales como fallback)
    const fx = effects || _expEffects || {};
    const grayscale = fx.grayscale ?? (typeof _grayscaleActive !== 'undefined' ? _grayscaleActive : false);
    const vignette = fx.vignette ?? (typeof _vignetteEnabled !== 'undefined' ? _vignetteEnabled : true);
    const vigInt = fx.vigIntensity ?? 0.65;
    const vigSize = fx.vigSize ?? 0.85;
    const imgOpacity = fx.imgOpacity ?? 0.58;
    const brightness = fx.brightness ?? 1.0;
    const contrast_v = fx.contrast ?? 1.0;
    const zoom = fx.zoom ?? 1.0;
    const textColor = fx.textColor ?? (typeof _videoTextColor !== 'undefined' ? _videoTextColor : '#c8a96e');
    const textOpacity = fx.textOpacity ?? (typeof _videoTextOpacity !== 'undefined' ? _videoTextOpacity : 1);
    const fontFamily = fx.fontFamily ?? 'Georgia,serif';
    const strokeEnabled = fx.strokeEnabled ?? false;
    const strokeColor = fx.strokeColor ?? '#000000';
    const strokeWidth = fx.strokeWidth ?? 2;
    const offX = imgItem?.offsetX ?? 0;  // % de offset para centrado
    const offY = imgItem?.offsetY ?? 0;

    ctx.fillStyle = '#0a0908';
    ctx.fillRect(0, 0, W, H);

    if (img) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.05, Math.min(1, imgOpacity));
        const ir = img.naturalWidth / img.naturalHeight || 1.78;
        const cr = W / H;
        let sw, sh, sx, sy;
        if (ir > cr) { sh = H * zoom; sw = sh * ir; sx = (W - sw) / 2; sy = (H - sh) / 2; }
        else { sw = W * zoom; sh = sw / ir; sx = (W - sw) / 2; sy = (H - sh) / 2; }
        // Aplicar offset de posición — negado para coincidir con background-position CSS
        // (en CSS background-position mayor % mueve el contenido a la izquierda)
        sx -= (offX / 100) * (sw - W);
        sy -= (offY / 100) * (sh - H);
        // Filtros CSS: brillo, contraste, escala de grises
        let filterStr = `brightness(${brightness}) contrast(${contrast_v})`;
        if (grayscale) filterStr += ' grayscale(1)';
        ctx.filter = filterStr;
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.filter = 'none';
        ctx.restore();
    }

    // Viñeta con intensidad y tamaño configurables
    if (vignette) {
        const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * vigSize);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(0,0,0,${vigInt})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    }

    const _s = _sentencesSnap || sentences;
    if (!_s || total === 0) return;

    const MAX_W = W * 0.78;
    const CX = W / 2;
    const CUR_SZ = (typeof _videoFontSize !== 'undefined') ? _videoFontSize : 36;
    const PREV_SZ = Math.round(CUR_SZ * 0.61);
    const NEXT_SZ = 20;
    const CUR_LH = 52; const PREV_LH = 32; const NEXT_LH = 30; const GAP = 28;

    ctx.font = `italic ${CUR_SZ}px ${fontFamily}`;
    const curL = wrapText(ctx, _s[current] || '', MAX_W);
    ctx.font = `${PREV_SZ}px ${fontFamily}`;
    const prevL = current > 0 ? wrapText(ctx, _s[current - 1], MAX_W) : [];
    ctx.font = `${NEXT_SZ}px ${fontFamily}`;
    const nextL = current < total - 1 ? wrapText(ctx, _s[current + 1], MAX_W) : [];

    const totalH = prevL.length * PREV_LH + (prevL.length ? GAP : 0)
        + curL.length * CUR_LH
        + (nextL.length ? GAP : 0) + nextL.length * NEXT_LH;
    let y = 28 + Math.max(0, (H - 56 - totalH) / 2);

    ctx.globalAlpha = textOpacity;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;

    if (prevL.length) {
        ctx.font = `${PREV_SZ}px ${fontFamily}`;
        ctx.fillStyle = '#5a5248';
        prevL.forEach((l, i) => ctx.fillText(l, CX, y + i * PREV_LH));
        y += prevL.length * PREV_LH + GAP;
    }
    ctx.font = `italic ${CUR_SZ}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    if (strokeEnabled) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth * 2;
        ctx.lineJoin = 'round';
        curL.forEach((l, i) => { ctx.strokeText(l, CX, y + i * CUR_LH); });
    }
    curL.forEach((l, i) => ctx.fillText(l, CX, y + i * CUR_LH));
    y += curL.length * CUR_LH + GAP;

    if (nextL.length) {
        ctx.font = `${NEXT_SZ}px ${fontFamily}`;
        ctx.fillStyle = 'rgba(200,169,110,0.22)';
        nextL.forEach((l, i) => ctx.fillText(l, CX, y + i * NEXT_LH));
    }
    ctx.globalAlpha = 1;

    // Watermark
    ctx.font = '13px "DM Mono",monospace';
    ctx.fillStyle = 'rgba(200,169,110,0.15)';
    ctx.textAlign = 'right';
    ctx.fillText(EXPORT_SITE_TAG, W - 18, H - 14);
}

// ═══════════════════════════════════════
// PANEL AUDIO TTS — Pre-generacion desde preview
// ═══════════════════════════════════════

function _expTtsActualizarUI() {
    const dot = document.getElementById('exp-tts-dot');
    const lbl = document.getElementById('exp-tts-status-lbl');
    const btn = document.getElementById('exp-tts-gen-btn');
    const clrBtn = document.getElementById('exp-tts-clear-btn');
    const progWrap = document.getElementById('exp-tts-progress-wrap');
    const exportRow = document.getElementById('exp-tts-export-row');
    if (!dot) return;
    if (_expTtsBuffers && _expTtsBuffers.length > 0) {
        const conAudio = _expTtsBuffers.filter(b => b != null).length;
        dot.style.background = conAudio === _expTtsBuffers.length ? '#7eb89a' : '#c8a96e';
        lbl.textContent = conAudio + '/' + _expTtsBuffers.length + ' frases listas';
        lbl.style.color = '#7eb89a';
        if (btn) { btn.textContent = 'Regenerar audio TTS'; }
        if (clrBtn) clrBtn.style.display = '';
        if (progWrap) progWrap.style.display = 'none';
        if (exportRow) exportRow.style.display = 'flex';
        _expTtsMode = 'xtts';
    } else {
        dot.style.background = '#333';
        lbl.textContent = 'Sin pre-generar';
        lbl.style.color = '#555';
        if (btn) { btn.textContent = 'Pre-generar audio TTS'; btn.disabled = false; btn.style.opacity = '1'; btn.style.color = '#7eb89a'; btn.style.borderColor = '#3a3a3a'; }
        if (clrBtn) clrBtn.style.display = 'none';
        if (progWrap) progWrap.style.display = 'none';
        if (exportRow) exportRow.style.display = 'none';
    }
}

function _expTtsClear() {
    _expTtsBuffers = null;
    _expTtsDuraciones = null;
    const ttsTrack = _expAudioTracks.find(t => t._isTtsTrack);
    if (ttsTrack) _expAudioRemoveTrack(ttsTrack.id);
    _expTtsActualizarUI();
    mostrarNotificacion('Audio TTS descartado');
}

// ── Exportar audio TTS pre-generado como WAV o MP3 ──────────────────
async function _expTtsExportarAudio(formato = 'wav') {
    if (!_expTtsBuffers || _expTtsBuffers.length === 0) {
        mostrarNotificacion('⚠ No hay audio TTS pre-generado'); return;
    }
    const chapSel = document.getElementById('chapters');
    const chapTxt = chapSel?.options[chapSel?.selectedIndex]?.text || 'capitulo';

    // Obtener nombre legible de la voz — quitar código de idioma (ej: "es-MX-GonzaloNeural" → "Gonzalo")
    const voiceSel = document.getElementById('exp-tts-voice-select');
    const voiceRaw = voiceSel?.value || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
    // Edge TTS: "es-MX-GonzaloNeural" → "Gonzalo" / XTTS: puede ser un nombre directo
    const voiceName = voiceRaw
        ? voiceRaw.replace(/^[a-z]{2}-[A-Z]{2}-/, '').replace('Neural', '').trim()
        : 'TTS';

    const fileName = `${chapTxt.trim()} - ${voiceName}`;
    mostrarNotificacion('⏳ Preparando audio…');
    try {
        const total = _expTtsBuffers.length;
        let duraciones;
        if (_expTtsDuraciones && _expTtsDuraciones.length === total) {
            // Al exportar: quitar el +0.15s de padding que existe solo para el preview playback
            duraciones = _expTtsDuraciones.map(ms => Math.max(0.1, (ms || EXPORT_SEC_FRASE * 1000) / 1000 - 0.15));
        } else {
            duraciones = new Array(total).fill(EXPORT_SEC_FRASE);
            const tmpCtx = new AudioContext();
            for (let i = 0; i < total; i++) {
                if (!_expTtsBuffers[i]) continue;
                // Sin +0.15 — el export no necesita buffer de arranque del <audio> element
                try { const dec = await tmpCtx.decodeAudioData(_expTtsBuffers[i].slice(0)); duraciones[i] = dec.duration; } catch (e) { }
            }
            tmpCtx.close();
        }
        const wavBlob = await _expMezclarAudio(_expTtsBuffers, duraciones);
        if (!wavBlob) throw new Error('Error al mezclar el audio');
        if (formato === 'mp3') {
            if (typeof convertirWAVaMP3 !== 'function') { mostrarNotificacion('⚠ convert_mp3.js no cargado — descargando WAV'); _expTtsDescargarWav(wavBlob, fileName); return; }
            await convertirWAVaMP3(wavBlob, fileName, '192k');
        } else {
            _expTtsDescargarWav(wavBlob, fileName);
        }
    } catch (err) { console.error('[expTtsExportar]', err); mostrarNotificacion('⚠ Error: ' + err.message); }
}

function _expTtsDescargarWav(wavBlob, fileName) {
    const _doFallback = () => {
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileName}.wav`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 8000);
    };
    if (typeof window.showSaveFilePicker === 'function') {
        window.showSaveFilePicker({
            suggestedName: `${fileName}.wav`,
            startIn: 'music',
            types: [{ description: 'Audio WAV', accept: { 'audio/wav': ['.wav'] } }]
        }).then(async fh => {
            const w = await fh.createWritable();
            await w.write(wavBlob); await w.close();
        }).catch(e => { if (e.name !== 'AbortError') _doFallback(); });
    } else { _doFallback(); }
    mostrarNotificacion(`✓ WAV descargado (${(wavBlob.size / 1024 / 1024).toFixed(1)} MB)`);
}

async function _expTtsPregenerar() {
    const btn = document.getElementById('exp-tts-gen-btn');
    const progWrap = document.getElementById('exp-tts-progress-wrap');
    const progBar = document.getElementById('exp-tts-progress-bar');
    const progLbl = document.getElementById('exp-tts-progress-lbl');
    const dot = document.getElementById('exp-tts-dot');
    const lbl = document.getElementById('exp-tts-status-lbl');
    try {
        const hRes = await fetch(TTS_API_URL + '/health', { method: 'GET' });
        if (!hRes.ok) throw new Error('no ok');
    } catch (e) { mostrarNotificacion('Servidor TTS no disponible'); return; }

    const voiceSel = document.getElementById('exp-tts-voice-select');
    if (voiceSel && voiceSel.value && typeof setEdgeTtsVoice === 'function') setEdgeTtsVoice(voiceSel.value);

    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.color = '#555'; }
    if (dot) dot.style.background = '#c8a96e';
    if (lbl) { lbl.style.color = '#c8a96e'; lbl.textContent = 'Generando...'; }
    if (progWrap) progWrap.style.display = '';
    const clrBtn = document.getElementById('exp-tts-clear-btn');
    if (clrBtn) clrBtn.style.display = 'none';

    const updateProg = (pct, label) => {
        if (progBar) progBar.style.width = pct + '%';
        if (progLbl) progLbl.textContent = Math.round(pct) + '%';
        if (lbl) lbl.textContent = label;
    };

    // Resetear flag de cancelacion
    _expCancelled = false;

    window._exportEnCurso = true;
    let buffers = null;
    try { buffers = await _expGenerarAudioXTTSWidget(updateProg); }
    catch (e) { mostrarNotificacion('Error generando audio TTS: ' + e.message); }
    window._exportEnCurso = false;

    const bufferesReales = buffers ? buffers.filter(b => b != null).length : 0;
    if (!buffers || bufferesReales === 0) {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.color = '#7eb89a'; }
        if (lbl) { lbl.textContent = 'Error - reintenta'; lbl.style.color = '#e07070'; }
        if (dot) dot.style.background = '#e07070';
        return;
    }

    _expTtsBuffers = buffers;
    _expTtsDuraciones = null; // forzar re-decodificacion
    _expTtsMode = 'xtts';

    // Calcular duraciones para el track visual y el player
    const total = buffers.length;
    const duraciones = new Array(total).fill(EXPORT_SEC_FRASE);
    try {
        const tmpCtx = new AudioContext();
        for (let i = 0; i < total; i++) {
            if (!buffers[i]) continue;
            try { const dec = await tmpCtx.decodeAudioData(buffers[i].slice(0)); duraciones[i] = dec.duration + 0.15; } catch (e) { }
        }
        tmpCtx.close();
    } catch (e) { }

    // Cachear duraciones en ms para el player
    _expTtsDuraciones = duraciones.map(d => d * 1000);

    // Construir WAV concatenado para el track del timeline
    let trackUrl = null;
    try {
        const sr = 24000, ch = 1;
        const totalSamples = Math.ceil(duraciones.reduce((a, b) => a + b, 0) * sr);
        const offCtx = new OfflineAudioContext(ch, Math.max(totalSamples, 1), sr);
        const tmpCtx2 = new AudioContext();
        let offset = 0;
        for (let i = 0; i < total; i++) {
            if (buffers[i]) {
                try {
                    const dec = await tmpCtx2.decodeAudioData(buffers[i].slice(0));
                    const src = offCtx.createBufferSource();
                    src.buffer = dec;
                    src.connect(offCtx.destination);
                    src.start(offset);
                } catch (e) { }
            }
            offset += duraciones[i];
        }
        tmpCtx2.close();
        const rendered = await offCtx.startRendering();
        trackUrl = URL.createObjectURL(_expTtsAudioBufferToWav(rendered));
    } catch (e) { console.warn('[TTS track] wav error:', e); }

    // Eliminar track TTS previo
    const prev = _expAudioTracks.find(t => t._isTtsTrack);
    if (prev) _expAudioRemoveTrack(prev.id);

    // Agregar nuevo track
    if (trackUrl) {
        const id = _expAudioAddTrack('Voz TTS', '#7eb89a', null, trackUrl, true);
        const t = _expAudioTracks.find(t => t.id === id);
        if (t) {
            t._isTtsTrack = true;
            // Sincronizar volumen con el slider del panel AUDIO TTS
            const volSlider = document.getElementById('exp-tts-vol-slider');
            if (volSlider) t.volume = parseInt(volSlider.value) || 80;
        }
        const ctrl = document.getElementById('exp-audio-preview-controls');
        if (ctrl) ctrl.style.display = '';
    }

    _expTtsActualizarUI();
    mostrarNotificacion('Audio TTS listo: ' + buffers.filter(b => b).length + '/' + total + ' frases');
}

function _expTtsAudioBufferToWav(audioBuffer) {
    const numCh = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = len * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    const ws = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    ws(36, 'data'); view.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
        for (let c = 0; c < numCh; c++) {
            const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]));
            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
        }
    }
    return new Blob([buf], { type: 'audio/wav' });
}