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
let _expFileName = '';       // nombre de archivo congelado al iniciar — no cambia aunque cambie el capítulo

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
};
let _expImagenes = [];   // [{ img: HTMLImageElement|null, url: string, grupo: int }]

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
                padding:28px 30px;width:460px;max-width:95vw;color:#e8e0d0;">
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
    // Actualizar el texto del botón siguiente según el modo
    const btnNext = document.getElementById('exp-btn-next');
    if (btnNext) {
        if (val === 'audioonly') {
            btnNext.textContent = '▶ Exportar solo audio';
            btnNext.onclick = _exportarSoloAudio;
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

    // Pre-cargar sugerencia automática para cada grupo
    for (let g = 0; g < grupos; g++) {
        const desde = g * EXPORT_IMGS_PER;
        const hasta = Math.min(desde + EXPORT_IMGS_PER, total);
        const fragmento = sentences.slice(desde, hasta).join(' ');
        let url = null;
        try {
            if (typeof _promptAKeywords === 'function' && typeof seleccionarImagenAfin === 'function') {
                const kw = _promptAKeywords(fragmento);
                url = seleccionarImagenAfin(kw);
            }
        } catch (e) { }
        if (!url) url = `https://picsum.photos/seed/${g * 13 + 7}/${EXPORT_W}/${EXPORT_H}`;
        _expImagenes.push({ url, img: null, grupo: g, fragmento, offsetX: 0, offsetY: 0 });
        if (btnNext) btnNext.textContent = `⏳ Cargando ${g + 1}/${grupos}…`;
        await new Promise(r => setTimeout(r, 0)); // no bloquear UI
    }

    _renderModalImagenes();
}

function _renderModalImagenes() {
    _quitarModal();
    const grupos = _expImagenes.length;

    const m = document.createElement('div');
    m.id = 'export-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);
        display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;
        font-family:'DM Mono',monospace;padding:24px 12px;`;

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
            <div style="display:flex;gap:8px;align-items:center;">
                <span style="font-size:.5rem;color:#555;margin-right:4px;">Editá la URL o pulsá 🔀 para sugerir otra</span>
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

function _expSugerirOtra(g) {
    let url = null;
    try {
        if (typeof _promptAKeywords === 'function' && typeof seleccionarImagenAfin === 'function') {
            // Resetear _lastShown para forzar imagen diferente
            if (typeof _smartPool !== 'undefined') _smartPool._lastShown = _expImagenes[g].url;
            const kw = _promptAKeywords(_expImagenes[g].fragmento);
            url = seleccionarImagenAfin(kw);
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
// HELPERS MODAL
// ───────────────────────────────────────────────────────────────────
function _quitarModal() {
    const m = document.getElementById('export-modal');
    if (m) m.remove();
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
// EXPORTAR SOLO AUDIO — genera WAV completo del capítulo
// ───────────────────────────────────────────────────────────────────
async function _exportarSoloAudio() {
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

        // Descargar
        _updateWidget(100, '✓ Preparando descarga…');
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${_expFileName}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 8000);

        mostrarNotificacion('✓ Audio exportado correctamente');
        document.getElementById('exp-float-widget')?.remove();

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

    _quitarModal();
    const m = document.createElement('div');
    m.id = 'export-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        overflow:hidden;font-family:'DM Mono',monospace;padding:12px 16px;`;

    m.innerHTML = `
    <div style="width:90%;max-width:1200px;display:flex;flex-direction:column;height:calc(100vh - 24px);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0;">
            <div style="font-size:.62rem;color:#c8a96e;letter-spacing:.1em;">🎨 PREVIEW — EFECTOS DE VIDEO</div>
            <div style="font-size:.5rem;color:#555;">Los efectos se aplican a todo el video</div>
        </div>

        <!-- Layout horizontal: canvas izquierda + controles derecha -->
        <div style="display:flex;gap:14px;flex:1;min-height:0;overflow:hidden;">

        <!-- Canvas preview: ocupa todo el alto disponible manteniendo 16:9 -->
        <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:#000;border-radius:8px;overflow:hidden;">
            <canvas id="exp-preview-canvas" style="max-width:100%;max-height:100%;display:block;"></canvas>
        </div>

        <!-- Panel de controles derecha -->
        <div style="flex:0 0 260px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;">

        <!-- Controles en grid 2 columnas (ahora columna única dentro del panel derecho) -->
        <div style="display:flex;flex-direction:column;gap:10px;">

            <!-- Col izquierda: imagen -->
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;">
                <div style="font-size:.52rem;color:#c8a96e;letter-spacing:.08em;margin-bottom:12px;">IMAGEN</div>

                <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <span style="font-size:.55rem;color:#888;">Blanco y negro</span>
                    <input type="checkbox" id="exp-fx-bw" ${_expEffects.grayscale ? 'checked' : ''}
                           onchange="_expFxChange()" style="accent-color:#c8a96e;width:14px;height:14px;">
                </label>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Opacidad imagen</span>
                        <span id="exp-fx-opacity-val" style="font-size:.52rem;color:#c8a96e;">${Math.round(_expEffects.imgOpacity * 100)}%</span>
                    </div>
                    <input type="range" id="exp-fx-opacity" min="5" max="100" value="${Math.round(_expEffects.imgOpacity * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Brillo</span>
                        <span id="exp-fx-brightness-val" style="font-size:.52rem;color:#c8a96e;">${_expEffects.brightness.toFixed(2)}</span>
                    </div>
                    <input type="range" id="exp-fx-brightness" min="50" max="200" value="${Math.round(_expEffects.brightness * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>

                <div style="margin-bottom:0;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Contraste</span>
                        <span id="exp-fx-contrast-val" style="font-size:.52rem;color:#c8a96e;">${_expEffects.contrast.toFixed(2)}</span>
                    </div>
                    <input type="range" id="exp-fx-contrast" min="50" max="200" value="${Math.round(_expEffects.contrast * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>
            </div>

            <!-- Col derecha: viñeta + texto -->
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;">
                <div style="font-size:.52rem;color:#c8a96e;letter-spacing:.08em;margin-bottom:12px;">VIÑETA & TEXTO</div>

                <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <span style="font-size:.55rem;color:#888;">Viñeta</span>
                    <input type="checkbox" id="exp-fx-vignette" ${_expEffects.vignette ? 'checked' : ''}
                           onchange="_expFxChange()" style="accent-color:#c8a96e;width:14px;height:14px;">
                </label>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Intensidad viñeta</span>
                        <span id="exp-fx-vigint-val" style="font-size:.52rem;color:#c8a96e;">${Math.round(_expEffects.vigIntensity * 100)}%</span>
                    </div>
                    <input type="range" id="exp-fx-vigint" min="0" max="100" value="${Math.round(_expEffects.vigIntensity * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Tamaño viñeta</span>
                        <span id="exp-fx-vigsize-val" style="font-size:.52rem;color:#c8a96e;">${_expEffects.vigSize.toFixed(2)}</span>
                    </div>
                    <input type="range" id="exp-fx-vigsize" min="50" max="120" value="${Math.round(_expEffects.vigSize * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Opacidad texto</span>
                        <span id="exp-fx-textopacity-val" style="font-size:.52rem;color:#c8a96e;">${Math.round(_expEffects.textOpacity * 100)}%</span>
                    </div>
                    <input type="range" id="exp-fx-textopacity" min="10" max="100" value="${Math.round(_expEffects.textOpacity * 100)}"
                           oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
                </div>

                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:.52rem;color:#888;">Color de texto</span>
                        <span id="exp-fx-color-val" style="font-size:.52rem;color:#c8a96e;">${_expEffects.textColor}</span>
                    </div>
                    <input type="color" id="exp-fx-color" value="${_expEffects.textColor}"
                           oninput="_expFxChange()" style="width:100%;height:28px;border:1px solid #2a2a2a;border-radius:4px;background:#0d0d0d;cursor:pointer;">
                </div>
            </div>

            <!-- Zoom -->
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:.52rem;color:#888;">Zoom imagen</span>
                    <span id="exp-fx-zoom-val" style="font-size:.52rem;color:#c8a96e;">${_expEffects.zoom.toFixed(2)}x</span>
                </div>
                <input type="range" id="exp-fx-zoom" min="100" max="200" value="${Math.round(_expEffects.zoom * 100)}"
                       oninput="_expFxChange()" style="width:100%;accent-color:#c8a96e;">
            </div>

            <!-- Tipografía -->
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;">
                <div style="font-size:.52rem;color:#c8a96e;letter-spacing:.08em;margin-bottom:10px;">TIPOGRAFÍA</div>
                <select id="exp-fx-font" onchange="_expFxChange()"
                        style="width:100%;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;
                               color:#e8e0d0;font-size:.55rem;padding:5px 7px;cursor:pointer;
                               font-family:'DM Mono',monospace;accent-color:#c8a96e;">
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
                <!-- Preview de la tipografía -->
                <div id="exp-font-preview" style="margin-top:8px;padding:6px;background:#0a0908;border-radius:4px;
                     text-align:center;font-size:14px;color:#c8a96e;font-style:italic;
                     font-family:${_expEffects.fontFamily};">
                    El hechicero inmortal...
                </div>
            </div>

        </div><!-- fin flex-direction:column controles -->
        </div><!-- fin panel derecha -->
        </div><!-- fin layout horizontal flex:1 -->

        <!-- Botones abajo -->
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;flex-shrink:0;">
            <button onclick="_renderModalImagenes()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-size:.57rem;padding:8px 14px;cursor:pointer;">
                ← Atrás
            </button>
            <button onclick="_cerrarModalExport()"
                    style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                           color:#555;font-size:.57rem;padding:8px 14px;cursor:pointer;">
                Cancelar
            </button>
            <button onclick="_iniciarExportacion()"
                    style="background:#c8a96e;border:none;border-radius:5px;
                           color:#0a0908;font-size:.58rem;font-weight:700;
                           padding:8px 22px;cursor:pointer;">
                ▶ Exportar
            </button>
        </div>
    </div>`; // fin div height:calc(100vh-24px)

    document.body.appendChild(m);

    // Inicializar canvas preview
    const canvas = document.getElementById('exp-preview-canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;

    // Mostrar primera imagen disponible
    _expPreviewRender();
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

    // Actualizar preview de tipografía
    const fontPrev = document.getElementById('exp-font-preview');
    if (fontPrev) { fontPrev.style.fontFamily = fontFamily; }

    _expEffects = {
        grayscale: bw, vignette: vig, imgOpacity: opacity, brightness, contrast,
        vigIntensity: vigInt, vigSize, textColor, textOpacity: textOp, zoom, fontFamily
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

    _expPreviewRender();
}

function _expPreviewRender() {
    const canvas = document.getElementById('exp-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Buscar primera imagen cargada
    const imgItem = _expImagenes.find(i => i.img) || _expImagenes[0];
    // Usar frase del medio del primer grupo
    const midSentence = Math.floor(Math.min(EXPORT_IMGS_PER / 2, sentences.length - 1));

    _expDibujarFrame(ctx, EXPORT_W, EXPORT_H, imgItem?.img || null, midSentence,
        sentences.length, sentences, imgItem, _expEffects);
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
            const imgItem = _expImagenes[Math.floor(sentenceIdx / EXPORT_IMGS_PER)];
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