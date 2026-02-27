// ═══════════════════════════════════════════════════════════════════
// EXPORT_VIDEO.JS — Exportación offscreen silenciosa
// Flujo: Modal config → Selección de imágenes → Pre-gen audio → Render → Descarga
// Depende de: video.js, images.js, tts.js, main.js
// ═══════════════════════════════════════════════════════════════════

const EXPORT_SITE_TAG = 'reader.com';
const EXPORT_FPS = 30;
const EXPORT_W = 1280;
const EXPORT_H = 720;
const EXPORT_IMGS_PER = 10;    // frases por grupo de imagen
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
            <span>🖼 Grupos: <b style="color:#e8e0d0">${grupos}</b></span> &nbsp;·&nbsp;
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
        #exp-bottombar {
            flex-shrink: 0;
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            align-items: center;
            padding: 9px 14px;
            border-top: 1px solid #1e1e1e;
            background: #0a0908;
        }
        #exp-tl-toolbar {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-bottom: 1px solid #1e1e1e;
        }
        #exp-audio-tracks { padding: 5px 10px 0; }
        .exp-track-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
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
        .exp-track-canvas-wrap {
            flex: 1;
            min-width: 0;
            position: relative;
            height: 34px;
            border-radius: 3px;
            background: #0a0a0a;
            border: 1px solid #1e1e1e;
            cursor: pointer;
            overflow: visible;
        }
        .exp-track-canvas-wrap canvas { display:block; width:100%; height:100%; }
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
        .exp-add-track-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            width: 100%;
            padding: 4px 10px;
            background: none;
            border: 1px dashed #272727;
            border-radius: 4px;
            color: #333;
            font-family: 'DM Mono', monospace;
            font-size: .46rem;
            cursor: pointer;
            transition: all .15s;
        }
        .exp-add-track-btn:hover { border-color: #7eb89a; color: #7eb89a; }
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
            <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.1em;">🎨 PREVIEW — EFECTOS DE VIDEO</div>
            <div style="font-size:.47rem;color:#444;">Los efectos se aplican a todo el video</div>
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
                    <span id="exp-play-counter" style="font-size:.5rem;color:#555;">Frase 1 / ${sentences.length}</span>
                    <div style="flex:1;"></div>
                    <span style="font-size:.43rem;color:#2a2a2a;">Arrastrá los bordes del timeline para reasignar imágenes</span>
                </div>

                <div id="exp-timeline-wrap">
                    <div id="exp-tl-toolbar">
                        <span style="font-size:.43rem;color:#444;letter-spacing:.07em;text-transform:uppercase;flex:1;">Timeline</span>
                        <button class="exp-tl-btn" id="exp-btn-split" onclick="_expAudioSetMode('split')" title="Click en un track para dividirlo">✂ Split</button>
                        <button class="exp-tl-btn danger" onclick="_expAudioDeleteSelected()" title="Eliminar segmento seleccionado">🗑 Eliminar</button>
                        <button class="exp-tl-btn" onclick="_expAudioUndoSplit()">↩ Deshacer</button>
                    </div>

                    <div id="exp-audio-tracks"></div>

                    <div style="padding:4px 10px 5px;">
                        <label class="exp-add-track-btn">
                            + Agregar track de audio
                            <input type="file" accept="audio/*" style="display:none" onchange="_expAudioAddFromFile(this)" data-default-dir="music">
                        </label>
                    </div>

                    <div class="exp-img-tl-wrap">
                        <div style="font-size:.42rem;color:#444;letter-spacing:.07em;margin-bottom:3px;text-transform:uppercase;">Imágenes</div>
                        <div class="exp-img-tl-inner">
                            <canvas id="exp-timeline-canvas" height="50"
                                    style="width:100%;display:block;cursor:pointer;"></canvas>
                        </div>
                        <div id="exp-timeline-hint" style="font-size:.41rem;color:#2a2a2a;margin-top:2px;text-align:right;">
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
                        <div style="font-size:.44rem;color:#333;line-height:1.7;">
                            ✂ Split: dividir en cualquier punto.<br>
                            Arrastrá <span style="color:#555;">◁ ▷</span> en los bordes para fade.<br>
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
                            <span id="exp-tts-status-lbl" style="font-size:.48rem;color:#555;flex:1;">Sin pre-generar</span>
                            <button id="exp-tts-clear-btn" onclick="_expTtsClear()" title="Descartar"
                                style="display:none;background:none;border:none;color:#555;font-size:.65rem;cursor:pointer;padding:0 2px;"
                                onmouseover="this.style.color='#e07070'" onmouseout="this.style.color='#555'">✕</button>
                        </div>
                        <div id="exp-tts-progress-wrap" style="display:none;margin-bottom:9px;">
                            <div style="background:#1a1a1a;border-radius:3px;height:3px;overflow:hidden;">
                                <div id="exp-tts-progress-bar" style="height:100%;width:0%;background:#7eb89a;transition:width .3s;"></div>
                            </div>
                            <div id="exp-tts-progress-lbl" style="font-size:.43rem;color:#555;margin-top:3px;text-align:right;">0%</div>
                        </div>
                        <div style="margin-bottom:9px;">
                            <div style="font-size:.44rem;color:#444;margin-bottom:4px;">Voz Edge TTS</div>
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
                        <div style="font-size:.43rem;color:#333;line-height:1.7;">
                            Genera el audio XTTS ahora para<br>
                            sincronizar el preview y adelantar<br>
                            trabajo al exportar.
                        </div>
                    </div>
                </div>

            </div><!-- fin right panel -->
        </div><!-- fin body -->

        <div id="exp-bottombar">
            <button onclick="_expStopPlay();_renderModalImagenes()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-family:'DM Mono',monospace;font-size:.56rem;
                           padding:7px 16px;cursor:pointer;transition:all .15s;"
                    onmouseover="this.style.borderColor='#555';this.style.color='#e8e0d0'"
                    onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">
                ← Atrás
            </button>
            <button onclick="_expStopPlay();_cerrarModalExport()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-family:'DM Mono',monospace;font-size:.56rem;
                           padding:7px 16px;cursor:pointer;transition:all .15s;"
                    onmouseover="this.style.borderColor='#555';this.style.color='#e8e0d0'"
                    onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">
                Cancelar
            </button>
            <button onclick="_expStopPlay();_iniciarExportacion()"
                    style="background:#c8a96e;border:none;border-radius:5px;
                           color:#0a0908;font-family:'DM Mono',monospace;font-size:.57rem;
                           font-weight:700;padding:7px 22px;cursor:pointer;transition:opacity .15s;"
                    onmouseover="this.style.opacity='.88'"
                    onmouseout="this.style.opacity='1'">
                ▶ Exportar
            </button>
        </div>
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
        const _expResizeObs = new ResizeObserver(() => {
            _expTimelineInit();
            _expTimelineRender();
            document.querySelectorAll('.exp-track-canvas-wrap canvas').forEach((cv, i) => {
                if (_expAudioTracks[i]) _expAudioDrawTrack(cv, _expAudioTracks[i]);
            });
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
    if (!_expTtsDuraciones || !_expTtsDuraciones.length) return 0;
    let t = 0;
    for (let i = 0; i < fraseIdx && i < _expTtsDuraciones.length; i++) {
        t += (_expTtsDuraciones[i] || (EXPORT_SEC_FRASE * 1000)) / 1000;
    }
    return t;
}

// Seek: ir a una frase específica sincronizando audio y video
function _expSeekToFrase(fraseIdx) {
    const wasPlaying = _expIsPlaying;
    if (wasPlaying) _expPausePlay();
    _expPreviewFrase = fraseIdx;
    _expPreviewRender();
    _expTimelineRender();
    _expUpdateCounter();
    // Sincronizar track TTS al tiempo exacto de esa frase
    _expAudioTracks.forEach(t => {
        if (!t.audioEl) return;
        if (t._isTtsTrack && _expTtsDuraciones && _expTtsDuraciones.length) {
            t.audioEl.currentTime = _expTtsGetCurrentTime(fraseIdx);
        }
        // Otros tracks (música) mantienen posición independiente
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
    _expUpdateCounter();
    _expAudioTracks.forEach(t => {
        if (t.audioEl) t.audioEl.currentTime = 0;
    });
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

    // Ajustar tamaño físico al ancho real del elemento
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = 52;

    _expTimelineRender();

    // Eventos mouse
    canvas.addEventListener('mousedown', _tlMouseDown);
    canvas.addEventListener('mousemove', _tlMouseMove);
    canvas.addEventListener('mouseup', _tlMouseUp);
    canvas.addEventListener('mouseleave', _tlMouseUp);

    // Touch support
    canvas.addEventListener('touchstart', e => _tlMouseDown(_tlTouchToMouse(e)), { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); _tlMouseMove(_tlTouchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchend', _tlMouseUp);
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

    // Línea de posición actual (frase activa)
    const curX = Math.round(((_expPreviewFrase + 0.5) / total) * W);
    ctx.fillStyle = '#ffffff99';
    ctx.fillRect(curX - 1, TRACK_Y - 4, 2, TRACK_H + 8);

    // Triángulo indicador arriba
    ctx.fillStyle = '#ffffffcc';
    ctx.beginPath();
    ctx.moveTo(curX - 5, TRACK_Y - 4);
    ctx.lineTo(curX + 5, TRACK_Y - 4);
    ctx.lineTo(curX, TRACK_Y + 1);
    ctx.fill();
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
    const textColor = document.getElementById('exp-fx-color')?.value ?? '#c8a96e';
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
    set('exp-fx-color-val', textColor);
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
                const resp = await fetch(`${TTS_API_URL}/tts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sentences[i], voice: (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : 'es-MX-JorgeNeural') })
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
    let audioBlob = null;
    if (audioBuffers) {
        try { audioBlob = await _expMezclarAudio(audioBuffers, duraciones); }
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
let _expAudioTrackIdCounter = 0;
let _expAudioSelectedSeg = null; // {trackId, segIdx}
let _expAudioCtxTarget = null;
let _expAudioFadeDrag = null;
let _expAudioMode = 'normal';    // 'normal' | 'split'

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
                t.audioEl.loop = true;
                t.audioEl.muted = false;
                t.audioEl.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;';
                document.body.appendChild(t.audioEl);
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
            // Otros tracks: solo resetear si NO es resume (evita desincronización)
            if (t._isTtsTrack && _expTtsDuraciones && _expTtsDuraciones.length) {
                t.audioEl.currentTime = _expTtsGetCurrentTime(_expPreviewFrase);
            } else if (!isTrackResume) {
                t.audioEl.currentTime = 0;
            }
            const p = t.audioEl.play();
            if (p) p
                .then(() => {
                    console.log('[🎵 audio] ✅ Playing:', t.name);
                    // Iniciar loop de fade
                    _expAudioFadeLoop(t);
                })
                .catch(e => console.error('[🎵 audio] ❌', e));
        } catch (e) { console.error('[🎵 audio] ❌', e); }
    });
}

// Loop que aplica fade in/out en tiempo real según posición del audio
function _expAudioFadeLoop(t) {
    if (!t.audioEl || t.audioEl.paused) return;
    if (!t.gainNode) { requestAnimationFrame(() => _expAudioFadeLoop(t)); return; }

    const duration = t.audioEl.duration || 1;
    const current = t.audioEl.currentTime;
    const frac = current / duration; // posición 0–1 dentro del audio

    // Calcular volumen según segmentos con fade in/out
    let fadeMultiplier = 1.0;
    for (const seg of t.segments) {
        if (seg.deleted) continue;
        if (frac >= seg.from && frac <= seg.to) {
            const segLen = seg.to - seg.from;
            if (segLen <= 0) break;
            const posInSeg = (frac - seg.from) / segLen; // 0–1 dentro del segmento

            // Fade in: al inicio del segmento
            if (seg.fadeIn > 0 && posInSeg < seg.fadeIn) {
                fadeMultiplier = Math.min(fadeMultiplier, posInSeg / seg.fadeIn);
            }
            // Fade out: al final del segmento
            if (seg.fadeOut > 0 && posInSeg > (1 - seg.fadeOut)) {
                fadeMultiplier = Math.min(fadeMultiplier, (1 - posInSeg) / seg.fadeOut);
            }
            // Segmento eliminado
            if (seg.deleted) fadeMultiplier = 0;
            break;
        }
        // Si estamos en una zona de segmento deleted, silenciar
        if (frac >= seg.from && frac <= seg.to && seg.deleted) {
            fadeMultiplier = 0; break;
        }
    }

    // Aplicar volumen resultante (base × fade)
    const targetGain = (t.volume / 100) * Math.max(0, Math.min(1, fadeMultiplier));
    // Suavizar con pequeño ramp para evitar clicks
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

function _expAudioAddTrack(name, color, audioBuffer, audioUrl) {
    const track = {
        id: ++_expAudioTrackIdCounter,
        name, color,
        volume: 80, muted: false,
        segments: [{ from: 0, to: 1, deleted: false, fadeIn: 0, fadeOut: 0 }],
        splitHistory: [],
        audioBuffer: audioBuffer || null,  // no usado, compatibilidad
        audioUrl: audioUrl || null,
        audioEl: null,  // HTMLAudioElement — se crea al reproducir
    };
    _expAudioTracks.push(track);
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
    if (!_expAudioSelectedSeg) return;
    const t = _expAudioTracks.find(t => t.id === _expAudioSelectedSeg.trackId);
    if (t) { t.segments[_expAudioSelectedSeg.segIdx].deleted = true; _expAudioSelectedSeg = null; _expAudioRenderTracks(); }
}

function _expAudioUndoSplit() {
    for (let i = _expAudioTracks.length - 1; i >= 0; i--) {
        const t = _expAudioTracks[i];
        if (t.splitHistory.length > 0) {
            const last = t.splitHistory.pop();
            t.segments.splice(last.segIdx, 2, last.orig);
            _expAudioSelectedSeg = null; _expAudioRenderTracks(); return;
        }
    }
}

function _expAudioSplitAt(t, frac) {
    const si = t.segments.findIndex(s => !s.deleted && frac >= s.from && frac <= s.to);
    if (si < 0) return;
    const orig = t.segments[si];
    t.splitHistory.push({ segIdx: si, orig: { ...orig } });
    t.segments.splice(si, 1,
        { from: orig.from, to: frac, deleted: false, fadeIn: orig.fadeIn, fadeOut: 0 },
        { from: frac, to: orig.to, deleted: false, fadeIn: 0, fadeOut: orig.fadeOut }
    );
    _expAudioMode = 'normal';
    const btn = document.getElementById('exp-btn-split');
    if (btn) btn.classList.remove('active');
    _expAudioRenderTracks();
}

// ─── Render del timeline de tracks ─────────────────────────────────
function _expAudioRenderTracks() {
    const container = document.getElementById('exp-audio-tracks');
    if (!container) return;
    container.innerHTML = '';
    _expAudioTracks.forEach(t => {
        const row = document.createElement('div');
        row.className = 'exp-track-row';

        const lbl = document.createElement('div');
        lbl.className = 'exp-track-label';
        lbl.textContent = t.name; lbl.title = t.name;

        const wrap = document.createElement('div');
        wrap.className = 'exp-track-canvas-wrap';
        wrap.style.cursor = _expAudioMode === 'split' ? 'crosshair' : 'pointer';

        const cv = document.createElement('canvas');
        cv.height = 34;
        wrap.appendChild(cv);

        const volSlider = document.createElement('input');
        volSlider.type = 'range'; volSlider.min = 0; volSlider.max = 100; volSlider.value = t.volume;
        volSlider.style.cssText = 'width:52px;accent-color:#c8a96e;';
        volSlider.oninput = () => _expAudioSetVol(t.id, volSlider.value);

        const muteBtn = document.createElement('button');
        muteBtn.style.cssText = `background:none;border:1px solid ${t.muted ? '#cc6655' : '#2a2a2a'};border-radius:3px;
            color:${t.muted ? '#cc6655' : '#666'};font-size:.41rem;padding:2px 5px;cursor:pointer;transition:all .12s;font-family:'DM Mono',monospace;`;
        muteBtn.textContent = 'M';
        muteBtn.onclick = () => { t.muted = !t.muted; _expAudioRenderTracks(); _expAudioUpdatePanelList(); };

        const delBtn = document.createElement('button');
        delBtn.style.cssText = 'background:none;border:none;color:#3a3a3a;font-size:.6rem;cursor:pointer;padding:2px 4px;transition:color .12s;line-height:1;';
        delBtn.textContent = '✕';
        delBtn.onmouseover = () => delBtn.style.color = '#cc6655';
        delBtn.onmouseout = () => delBtn.style.color = '#3a3a3a';
        delBtn.onclick = () => _expAudioRemoveTrack(t.id);

        row.append(lbl, wrap, volSlider, muteBtn, delBtn);
        container.appendChild(row);

        requestAnimationFrame(() => {
            cv.width = wrap.clientWidth || 400;
            _expAudioDrawTrack(cv, t);
            _expAudioBindTrackEvents(wrap, cv, t);
        });
    });
}

function _expAudioDrawTrack(canvas, t) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, W, H);

    t.segments.forEach((seg, idx) => {
        if (seg.deleted) return;
        const x1 = seg.from * W, x2 = seg.to * W, sw = x2 - x1;
        if (sw < 1) return;
        const isSel = _expAudioSelectedSeg?.trackId === t.id && _expAudioSelectedSeg?.segIdx === idx;

        // ── Calcular envelope de volumen para cada pixel del segmento ──────
        // gainAt(relPos 0-1) devuelve multiplicador 0-1
        function gainAt(n) {
            let g = 1;
            if (seg.fadeIn > 0 && n < seg.fadeIn) g = Math.min(g, n / seg.fadeIn);
            if (seg.fadeOut > 0 && n > (1 - seg.fadeOut)) g = Math.min(g, (1 - n) / seg.fadeOut);
            return Math.max(0, Math.min(1, g));
        }

        // ── Relleno del segmento usando el envelope como altura ────────────
        c.beginPath();
        // Trazar la curva superior del envelope (de izquierda a derecha)
        for (let px = x1; px <= x2; px++) {
            const n = sw > 0 ? (px - x1) / sw : 0;
            const g = gainAt(n);
            const envY = H - g * H; // g=1 → tope, g=0 → fondo
            if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
        }
        // Cerrar por abajo
        c.lineTo(x2, H); c.lineTo(x1, H); c.closePath();
        c.fillStyle = t.muted ? '#1a1a1a' : (isSel ? t.color + '40' : t.color + '18');
        c.fill();

        if (!t.muted) {
            // ── Waveform simulada, recortada al envelope ────────────────────
            c.save();
            // Clip al área del envelope
            c.beginPath();
            for (let px = x1; px <= x2; px++) {
                const n = sw > 0 ? (px - x1) / sw : 0;
                const g = gainAt(n);
                const envY = H - g * H;
                if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
            }
            c.lineTo(x2, H); c.lineTo(x1, H); c.closePath();
            c.clip();

            // Dibujar waveform dentro del clip
            c.strokeStyle = t.color + (isSel ? 'cc' : '66');
            c.lineWidth = 1; c.beginPath();
            const seed = t.id * 137;
            for (let px = x1; px < x2; px++) {
                const n = (px - x1) / sw;
                const amp = Math.sin(n * 80 + seed) * Math.sin(n * 13 + seed * .3) * Math.cos(n * 5);
                const g = gainAt(n);
                const mid = H - g * H / 2;          // centro vertical del envelope en este punto
                const range = g * (H / 2 - 2);       // amplitud proporcional al gain
                const y = mid + amp * range;
                px === x1 ? c.moveTo(px, y) : c.lineTo(px, y);
            }
            c.stroke();
            c.restore();

            // ── Línea de envelope (la línea visible de volumen) ─────────────
            c.beginPath();
            c.strokeStyle = t.color + 'cc';
            c.lineWidth = 1.5;
            for (let px = x1; px <= x2; px++) {
                const n = sw > 0 ? (px - x1) / sw : 0;
                const g = gainAt(n);
                const envY = H - g * H;
                if (px === x1) c.moveTo(px, envY); else c.lineTo(px, envY);
            }
            c.stroke();

            // ── Handles de fade (triángulos arrastrables) ──────────────────
            if (seg.fadeIn > 0) {
                const fiX = x1 + sw * seg.fadeIn;
                const fiY = 0; // tope del fade in
                c.fillStyle = t.color + 'ee';
                c.beginPath();
                c.moveTo(fiX - 6, 1); c.lineTo(fiX + 6, 1); c.lineTo(fiX, 10);
                c.closePath(); c.fill();
                if (sw * seg.fadeIn > 28) {
                    c.fillStyle = t.color + '99';
                    c.font = '8px "DM Mono",monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
                    c.fillText('fade in', x1 + 3, 12);
                }
            }
            if (seg.fadeOut > 0) {
                const foX = x2 - sw * seg.fadeOut;
                c.fillStyle = t.color + 'ee';
                c.beginPath();
                c.moveTo(foX - 6, 1); c.lineTo(foX + 6, 1); c.lineTo(foX, 10);
                c.closePath(); c.fill();
                if (sw * seg.fadeOut > 28) {
                    c.fillStyle = t.color + '99';
                    c.font = '8px "DM Mono",monospace'; c.textAlign = 'right'; c.textBaseline = 'top';
                    c.fillText('fade out', x2 - 3, 12);
                }
            }

            // Borde izquierdo del segmento
            c.fillStyle = t.color + 'cc'; c.fillRect(x1, 0, 2, H);
        }

        if (isSel) {
            c.strokeStyle = t.color + 'aa'; c.lineWidth = 1.5;
            c.strokeRect(x1 + 1, 1, sw - 2, H - 2);
        }
    });

    // ── Cursor de posición ──────────────────────────────────────────────
    let cursorFrac = _expPreviewFrase / Math.max(1, sentences.length);
    const _activeAudio = _expAudioTracks.find(tr => tr.id === t.id && tr.audioEl && !tr.audioEl.paused);
    if (_activeAudio && _activeAudio.audioEl.duration) {
        cursorFrac = (_activeAudio.audioEl.currentTime % _activeAudio.audioEl.duration) / _activeAudio.audioEl.duration;
    }
    const px = Math.round(cursorFrac * W);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(px - 1, 0, 2, H);
}

// ─── Eventos de track ───────────────────────────────────────────────
const _EXP_FADE_HIT = 10;

function _expAudioGetFadeHandle(canvas, t, cx) {
    const W = canvas.width;
    for (let idx = 0; idx < t.segments.length; idx++) {
        const seg = t.segments[idx]; if (seg.deleted) continue;
        const x1 = seg.from * W, x2 = seg.to * W, sw = x2 - x1;
        if (seg.fadeIn > 0 && Math.abs(cx - (x1 + sw * seg.fadeIn)) <= _EXP_FADE_HIT) return { idx, side: 'in' };
        if (seg.fadeOut > 0 && Math.abs(cx - (x2 - sw * seg.fadeOut)) <= _EXP_FADE_HIT) return { idx, side: 'out' };
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
            const seg = t.segments[fh.idx];
            _expAudioFadeDrag = {
                trackId: t.id, segIdx: fh.idx, side: fh.side, canvasEl: canvas,
                startX: e.clientX, origFade: fh.side === 'in' ? seg.fadeIn : seg.fadeOut
            };
            document.addEventListener('mousemove', _expAudioOnFadeDrag);
            document.addEventListener('mouseup', _expAudioOnFadeDragEnd, { once: true });
            return;
        }
        const frac = cx / canvas.width;
        if (_expAudioMode === 'split') { _expAudioSplitAt(t, frac); return; }
        const si = t.segments.findIndex(s => !s.deleted && frac >= s.from && frac <= s.to);
        _expAudioSelectedSeg = si >= 0 ? { trackId: t.id, segIdx: si } : null;
        _expAudioRenderTracks();
    });

    wrap.addEventListener('mousemove', e => {
        const rect = wrap.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const fh = _expAudioGetFadeHandle(canvas, t, cx);
        if (fh) {
            wrap.style.cursor = 'ew-resize';
            const seg = t.segments[fh.idx];
            const pct = Math.round((fh.side === 'in' ? seg.fadeIn : seg.fadeOut) * 100);
            if (tooltip) { tooltip.style.display = 'block'; tooltip.style.left = (e.clientX + 12) + 'px'; tooltip.style.top = (e.clientY - 24) + 'px'; tooltip.textContent = fh.side === 'in' ? `◁ Fade in: ${pct}%` : `▷ Fade out: ${pct}%`; }
        } else {
            wrap.style.cursor = _expAudioMode === 'split' ? 'crosshair' : 'pointer';
            if (tooltip) tooltip.style.display = 'none';
        }
    });

    wrap.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none'; });

    wrap.addEventListener('contextmenu', e => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const si = t.segments.findIndex(s => !s.deleted && frac >= s.from && frac <= s.to);
        _expAudioCtxTarget = si >= 0 ? { t, segIdx: si, frac } : null;
        const menu = document.getElementById('exp-ctx-menu');
        if (menu) { menu.style.display = 'block'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; }
        document.addEventListener('click', _expAudioCloseCtxMenu, { once: true });
    });
}

function _expAudioOnFadeDrag(e) {
    if (!_expAudioFadeDrag) return;
    const t = _expAudioTracks.find(t => t.id === _expAudioFadeDrag.trackId); if (!t) return;
    const seg = t.segments[_expAudioFadeDrag.segIdx];
    const W = _expAudioFadeDrag.canvasEl.width, sw = (seg.to - seg.from) * W;
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
function _expAudioCtxSplit() { if (_expAudioCtxTarget) _expAudioSplitAt(_expAudioCtxTarget.t, _expAudioCtxTarget.frac); _expAudioCloseCtxMenu(); }
function _expAudioCtxDelete() { if (_expAudioCtxTarget) { _expAudioCtxTarget.t.segments[_expAudioCtxTarget.segIdx].deleted = true; _expAudioSelectedSeg = null; _expAudioRenderTracks(); } _expAudioCloseCtxMenu(); }
function _expAudioCtxFadeIn() { if (_expAudioCtxTarget) { _expAudioCtxTarget.t.segments[_expAudioCtxTarget.segIdx].fadeIn = 0.25; _expAudioRenderTracks(); } _expAudioCloseCtxMenu(); }
function _expAudioCtxFadeOut() { if (_expAudioCtxTarget) { _expAudioCtxTarget.t.segments[_expAudioCtxTarget.segIdx].fadeOut = 0.25; _expAudioRenderTracks(); } _expAudioCloseCtxMenu(); }

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
    el.innerHTML = _expAudioTracks.map(t => `
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
    // Mostrar botón solo si hay tracks
    const ctrl = document.getElementById('exp-audio-preview-controls');
    if (ctrl) ctrl.style.display = _expAudioTracks.length ? 'block' : 'none';
}


// ───────────────────────────────────────────────────────────────────
// MEZCLA DE AUDIO (OfflineAudioContext → WAV blob)
// ───────────────────────────────────────────────────────────────────
async function _expMezclarAudio(buffers, duraciones) {
    const sampleRate = 22050;
    const totalSamples = Math.ceil(duraciones.reduce((a, b) => a + b, 0) * sampleRate);
    const offCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
    let offset = 0;
    for (let i = 0; i < buffers.length; i++) {
        if (buffers[i]) {
            try {
                const dec = await offCtx.decodeAudioData(buffers[i].slice(0));
                const src = offCtx.createBufferSource();
                src.buffer = dec;
                src.connect(offCtx.destination);
                src.start(offset);
            } catch (e) { }
        }
        offset += duraciones[i];
    }
    const rendered = await offCtx.startRendering();
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
    if (!dot) return;
    if (_expTtsBuffers && _expTtsBuffers.length > 0) {
        const conAudio = _expTtsBuffers.filter(b => b != null).length;
        dot.style.background = conAudio === _expTtsBuffers.length ? '#7eb89a' : '#c8a96e';
        lbl.textContent = conAudio + '/' + _expTtsBuffers.length + ' frases listas';
        lbl.style.color = '#7eb89a';
        if (btn) { btn.textContent = 'Regenerar audio TTS'; }
        if (clrBtn) clrBtn.style.display = '';
        if (progWrap) progWrap.style.display = 'none';
        _expTtsMode = 'xtts';
    } else {
        dot.style.background = '#333';
        lbl.textContent = 'Sin pre-generar';
        lbl.style.color = '#555';
        if (btn) { btn.textContent = 'Pre-generar audio TTS'; btn.disabled = false; btn.style.opacity = '1'; btn.style.color = '#7eb89a'; btn.style.borderColor = '#3a3a3a'; }
        if (clrBtn) clrBtn.style.display = 'none';
        if (progWrap) progWrap.style.display = 'none';
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
        const id = _expAudioAddTrack('Voz TTS', '#7eb89a', null, trackUrl);
        const t = _expAudioTracks.find(t => t.id === id);
        if (t) t._isTtsTrack = true;
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