// ═══════════════════════════════════════════════════════════════════
// CONVERT_MP4.JS — Conversión WebM → MP4 en el navegador
// Usa FFmpeg.wasm 0.12 single-thread (sin SharedArrayBuffer)
// toBlobURL convierte CDN → blob:// del mismo origen → resuelve
// el error de worker.js "not found" que ocurre con UMD + CDN externo
// ═══════════════════════════════════════════════════════════════════

let _ffmpegInstance = null;
let _ffmpegLoaded = false;
let _convertCancelled = false;
let _mp4Quality = 'alta'; // 'remux' | 'alta' | 'media' | 'rapida'

// CRF por calidad: menor = mejor calidad, mayor tiempo
const _MP4_QUALITY_OPTS = {
    remux: { label: 'Remux (sin pérdida)', crf: null, preset: null, desc: 'Instantáneo · idéntico al WebM · puede fallar' },
    alta: { label: 'Alta (CRF 18)', crf: '18', preset: 'slow', desc: 'Mejor calidad · más lento' },
    media: { label: 'Media (CRF 23)', crf: '23', preset: 'medium', desc: 'Equilibrio calidad/tamaño' },
    rapida: { label: 'Rápida (CRF 28)', crf: '28', preset: 'ultrafast', desc: 'Más rápido · menor calidad' },
};

// Versiones fijadas — NO cambiar sin probar
const _FF_VER = '0.12.10';
const _CORE_VER = '0.12.6';   // @ffmpeg/core single-thread (NO -mt, no SharedArrayBuffer)
const _UTIL_VER = '0.12.1';

// ═══════════════════════════════════════════════════════════════════
// HELPERS DE CARGA
// ═══════════════════════════════════════════════════════════════════

function _loadScript(url) {
    return new Promise((resolve, reject) => {
        const name = url.split('/').pop();
        if (document.querySelector(`script[data-ff="${url}"]`)) {
            console.log(`[MP4] script ya cargado: ${name}`);
            resolve(); return;
        }
        console.log(`[MP4] cargando script: ${name}`);
        const s = document.createElement('script');
        s.src = url;
        s.dataset.ff = url;
        s.onload = () => { console.log(`[MP4] ✓ script cargado: ${name}`); resolve(); };
        s.onerror = () => { console.error(`[MP4] ✗ falló script: ${name}`); reject(new Error(`No se pudo cargar: ${name}`)); };
        document.head.appendChild(s);
    });
}

async function _toBlobURL(url, mimeType) {
    const name = url.split('/').pop();
    console.log(`[MP4] _toBlobURL fetch: ${name}`);
    _actualizarLogConvert(`⬇ ${name}`);
    const resp = await fetch(url);
    console.log(`[MP4] _toBlobURL status=${resp.status} size=${resp.headers.get('content-length')} bytes: ${name}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${name}`);
    const buf = await resp.arrayBuffer();
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mimeType }));
    console.log(`[MP4] ✓ blobURL: ${name} → ${blobUrl.slice(0, 50)}`);
    return blobUrl;
}

// ═══════════════════════════════════════════════════════════════════
// CARGA LAZY DE FFMPEG.WASM
// ═══════════════════════════════════════════════════════════════════

async function _cargarFFmpeg() {
    if (_ffmpegLoaded && _ffmpegInstance) {
        console.log('[MP4] FFmpeg ya estaba cargado, reutilizando instancia');
        return _ffmpegInstance;
    }

    console.log('[MP4] ── INICIO carga FFmpeg.wasm ──');

    // SOLUCIÓN DEFINITIVA (issue #580, autor LostBeard — ffmpegwasm/ffmpeg.wasm):
    // El UMD bundle de @ffmpeg/ffmpeg tiene hardcodeado:
    //   new Worker(new URL(e.p + e.u(814), e.b), { type: void 0 })
    // Esto falla porque construye la URL del worker relativa a e.b (la URL base
    // del script ffmpeg.js), que desde CDN cross-origin no puede ser usada como
    // Worker origin en localhost.
    //
    // Fix: descargar ffmpeg.js como texto, patchear esa línea para que use
    // r.workerLoadURL en lugar de construir la URL, y cargarlo como blob.
    // Luego pasar workerLoadURL con el blob del worker chunk (814.ffmpeg.js).

    // 1 — Descargar y patchear ffmpeg.js
    _actualizarBarraConvert(2, '⬇ Cargando FFmpeg.wasm…');
    _actualizarLogConvert('⬇ ffmpeg.js (patching worker URL)');
    const ffmpegJsURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${_FF_VER}/dist/umd/ffmpeg.js`;
    const ffmpegResp = await fetch(ffmpegJsURL);
    if (!ffmpegResp.ok) throw new Error(`HTTP ${ffmpegResp.status}: ffmpeg.js`);
    let ffmpegJs = await ffmpegResp.text();

    // El patch reemplaza la construcción hardcodeada del worker URL con r.workerLoadURL
    // que es la propiedad que pasamos en las opciones de load()
    const beforePatch = ffmpegJs.length;
    ffmpegJs = ffmpegJs.replace(
        'new URL(e.p+e.u(814),e.b)',
        'r.workerLoadURL'
    );
    // Variante alternativa con espacios (según versión del bundle)
    if (ffmpegJs.length === beforePatch) {
        ffmpegJs = ffmpegJs.replace(
            'new URL(e.p + e.u(814), e.b)',
            'r.workerLoadURL'
        );
    }
    const patched = ffmpegJs.length !== beforePatch || ffmpegJs.includes('r.workerLoadURL');
    console.log('[MP4] ffmpeg.js patch worker URL:', patched ? '✓' : '⚠ patrón no encontrado');

    const ffmpegBlobURL = URL.createObjectURL(new Blob([ffmpegJs], { type: 'text/javascript' }));
    console.log('[MP4] ffmpeg.js blob URL listo');

    // 2 — Importar el blob de ffmpeg.js como módulo dinámico
    _actualizarBarraConvert(8, '⬇ Importando FFmpeg patched…');
    await import(ffmpegBlobURL);
    console.log('[MP4] paso 1 ✓ — FFmpegWASM:', typeof window.FFmpegWASM);

    // También cargar util si no está
    if (!window.FFmpegUtil) {
        await _loadScript(`https://cdn.jsdelivr.net/npm/@ffmpeg/util@${_UTIL_VER}/dist/umd/index.js`);
    }

    const FFmpegWASM = window.FFmpegWASM;
    if (!FFmpegWASM?.FFmpeg) throw new Error('FFmpegWASM no disponible en window tras import');
    const { FFmpeg } = FFmpegWASM;

    // 3 — Descargar worker chunk (814.ffmpeg.js) como blob same-origin
    _actualizarBarraConvert(12, '⬇ worker chunk…');
    _actualizarLogConvert('⬇ 814.ffmpeg.js');
    const workerLoadURL = await _toBlobURL(
        `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${_FF_VER}/dist/umd/814.ffmpeg.js`,
        'text/javascript'
    );
    console.log('[MP4] workerLoadURL blob listo:', workerLoadURL.slice(0, 60));

    // 4 — Descargar core + wasm como blobs
    const base = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${_CORE_VER}/dist/umd`;

    _actualizarBarraConvert(18, '⬇ ffmpeg-core.js (~25 MB)…');
    _actualizarLogConvert('⬇ ffmpeg-core.js');
    const coreURL = await _toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
    console.log('[MP4] coreURL blob listo');

    _actualizarBarraConvert(50, '⬇ ffmpeg-core.wasm…');
    _actualizarLogConvert('⬇ ffmpeg-core.wasm');
    const wasmURL = await _toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
    console.log('[MP4] wasmURL blob listo');

    // 5 — Instancia + eventos
    _actualizarBarraConvert(58, '⚙ Creando instancia FFmpeg…');
    console.log('[MP4] paso 5: creando instancia FFmpeg...');
    const ffmpeg = new FFmpeg();
    console.log('[MP4] instancia creada');

    ffmpeg.on('log', ({ message }) => {
        if (message) { console.log('[FFMPEG LOG]', message); _actualizarLogConvert(message); }
    });

    ffmpeg.on('progress', ({ progress, time }) => {
        if (typeof progress === 'number' && progress > 0) {
            const pct = Math.round(65 + progress * 31);
            _actualizarBarraConvert(pct, `🔄 Convirtiendo… ${pct}%`);
        }
    });

    // 6 — Load con workerLoadURL (la clave del fix)
    // workerLoadURL es leído por el código patched en lugar de construir la URL del worker
    const loadOpts = { workerLoadURL, coreURL, wasmURL };
    console.log('[MP4] paso 6: ffmpeg.load() con opts:', {
        workerLoadURL: workerLoadURL.slice(0, 60),
        coreURL: coreURL.slice(0, 60),
        wasmURL: wasmURL.slice(0, 60),
    });
    _actualizarBarraConvert(62, '⚙ Compilando WASM…');

    await ffmpeg.load(loadOpts);
    console.log('[MP4] ✓ ffmpeg.load() completado');

    _ffmpegInstance = ffmpeg;
    _ffmpegLoaded = true;
    return ffmpeg;
}
// ═══════════════════════════════════════════════════════════════════
// CONVERSIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

async function convertirWebMaMP4(webmBlob, nombreArchivo) {
    console.log('[MP4] ══ convertirWebMaMP4() llamado ══');
    console.log('[MP4] webmBlob:', webmBlob, '— size:', webmBlob?.size, 'bytes');
    console.log('[MP4] nombreArchivo:', nombreArchivo);

    if (!webmBlob) { mostrarNotificacion('⚠ No hay archivo para convertir'); return; }

    _convertCancelled = false;
    _abrirModalConvert(nombreArchivo);

    try {
        _actualizarBarraConvert(0, '⏳ Preparando…');

        console.log('[MP4] llamando _cargarFFmpeg()...');
        const ffmpeg = await _cargarFFmpeg();
        console.log('[MP4] _cargarFFmpeg() completado:', ffmpeg);
        if (_convertCancelled) { console.log('[MP4] cancelado tras cargar ffmpeg'); return; }

        // Escribir WebM en FS virtual
        _actualizarBarraConvert(67, '📥 Leyendo archivo…');
        console.log('[MP4] convirtiendo blob a Uint8Array...');
        const inputData = new Uint8Array(await webmBlob.arrayBuffer());
        console.log('[MP4] Uint8Array listo, tamaño:', inputData.byteLength, 'bytes');

        console.log('[MP4] ffmpeg.writeFile("input.webm")...');
        await ffmpeg.writeFile('input.webm', inputData);
        console.log('[MP4] ✓ writeFile completado');
        if (_convertCancelled) { console.log('[MP4] cancelado tras writeFile'); return; }

        // Convertir según calidad elegida
        _actualizarBarraConvert(68, '🔄 Convirtiendo…');
        let ok = false;
        const qOpts = _MP4_QUALITY_OPTS[_mp4Quality] || _MP4_QUALITY_OPTS['alta'];
        console.log(`[MP4] calidad elegida: ${_mp4Quality}`, qOpts);

        // Intento remux (siempre primero si calidad=remux, o como fallback rápido)
        if (_mp4Quality === 'remux' || _mp4Quality === 'alta') {
            console.log('[MP4] intentando remux -c:v copy...');
            _actualizarBarraConvert(68, '🔄 Remux rápido…');
            try {
                await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output.mp4']);
                ok = true;
                console.log('[MP4] ✓ remux exitoso');
            } catch (e) {
                console.warn('[MP4] ✗ remux falló (continuando con re-encode):', e.message);
            }
        }

        // Re-encode con libx264 si es necesario o fue solicitado
        if (!ok && !_convertCancelled) {
            const crf = qOpts.crf || '18';
            const preset = qOpts.preset || 'slow';
            console.log(`[MP4] re-encode libx264 — crf=${crf} preset=${preset}`);
            _actualizarBarraConvert(69, `🔄 Encodando (CRF ${crf}, ${preset})…`);
            await ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264',
                '-preset', preset,
                '-crf', crf,
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-pix_fmt', 'yuv420p',
                'output.mp4'
            ]);
            ok = true;
            console.log('[MP4] ✓ re-encode exitoso');
        }

        if (_convertCancelled) { console.log('[MP4] cancelado tras exec'); return; }

        // Leer resultado
        _actualizarBarraConvert(96, '📦 Empaquetando…');
        console.log('[MP4] ffmpeg.readFile("output.mp4")...');
        const outputData = await ffmpeg.readFile('output.mp4');
        console.log('[MP4] ✓ readFile — tamaño output:', outputData.byteLength, 'bytes');

        const mp4Blob = new Blob([outputData.buffer], { type: 'video/mp4' });
        console.log('[MP4] mp4Blob creado:', mp4Blob.size, 'bytes');

        // Limpiar
        try { await ffmpeg.deleteFile('input.webm'); } catch (_) { }
        try { await ffmpeg.deleteFile('output.mp4'); } catch (_) { }

        // Descarga
        _actualizarBarraConvert(100, '✓ ¡Listo!');
        console.log('[MP4] ✓ iniciando descarga del MP4...');
        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo || 'video'}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 15000);

        setTimeout(() => _cerrarModalConvert(), 2000);
        mostrarNotificacion('✓ MP4 descargado correctamente');
        console.log('[MP4] ══ CONVERSIÓN COMPLETADA ══');

    } catch (err) {
        console.error('[MP4] ✗ ERROR en convertirWebMaMP4:', err);
        console.error('[MP4] stack:', err.stack);
        if (!_convertCancelled) {
            _actualizarBarraConvert(0, `❌ Error: ${err.message}`);
            const btn = document.getElementById('cvt-cancel-btn');
            if (btn) { btn.textContent = 'Cerrar'; btn.style.color = '#c8a96e'; btn.style.borderColor = '#c8a96e'; }
            mostrarNotificacion('❌ No se pudo convertir a MP4');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// MODAL DE PROGRESO
// ═══════════════════════════════════════════════════════════════════

function _abrirModalConvert(nombreArchivo) {
    _cerrarModalConvert();
    const m = document.createElement('div');
    m.id = 'convert-mp4-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);
        display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;`;

    m.innerHTML = `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;
                    padding:26px 30px;width:480px;max-width:92vw;">

            <div style="font-size:.6rem;color:#c8a96e;letter-spacing:.12em;margin-bottom:6px;">
                🎬 CONVIRTIENDO A MP4
            </div>
            <div style="font-size:.49rem;color:#555;margin-bottom:18px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${nombreArchivo || 'video'}.mp4
            </div>

            <div style="background:#1a1a1a;border-radius:4px;height:5px;overflow:hidden;margin-bottom:5px;">
                <div id="cvt-bar"
                     style="height:100%;width:0%;background:#c8a96e;
                            transition:width .35s ease;border-radius:4px;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
                <span id="cvt-label" style="font-size:.51rem;color:#888;">Iniciando…</span>
                <span id="cvt-pct"   style="font-size:.51rem;color:#c8a96e;">0%</span>
            </div>

            <details style="margin-bottom:14px;">
                <summary style="font-size:.46rem;color:#444;cursor:pointer;
                                user-select:none;list-style:none;">
                    ▶ Log técnico
                </summary>
                <div id="cvt-log"
                     style="margin-top:6px;background:#0a0a0a;border:1px solid #1a1a1a;
                            border-radius:4px;padding:7px;height:72px;overflow-y:auto;
                            font-size:.41rem;color:#444;line-height:1.5;word-break:break-all;">
                </div>
            </details>

            <div style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);
                        border-radius:6px;padding:9px 12px;font-size:.46rem;color:#555;
                        margin-bottom:16px;line-height:1.7;">
                ℹ Primera vez: descarga ~25 MB de FFmpeg.wasm (queda en caché del browser).<br>
                Los archivos <b style="color:#666;">nunca salen de tu dispositivo</b>.
            </div>

            <div style="text-align:right;">
                <button id="cvt-cancel-btn" onclick="_cancelarConvert()"
                        style="background:none;border:1px solid #2a2a2a;border-radius:5px;
                               color:#555;font-size:.53rem;padding:7px 16px;cursor:pointer;
                               transition:all .15s;"
                        onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e'"
                        onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">
                    ✕ Cancelar
                </button>
            </div>
        </div>`;

    document.body.appendChild(m);
}

function _cerrarModalConvert() {
    document.getElementById('convert-mp4-modal')?.remove();
}

function _cancelarConvert() {
    _convertCancelled = true;
    if (_ffmpegInstance) {
        try { _ffmpegInstance.terminate(); } catch (_) { }
        _ffmpegInstance = null;
        _ffmpegLoaded = false;
    }
    _cerrarModalConvert();
    mostrarNotificacion('✕ Conversión cancelada');
}

function _actualizarBarraConvert(pct, label) {
    const bar = document.getElementById('cvt-bar');
    const lbl = document.getElementById('cvt-label');
    const pctEl = document.getElementById('cvt-pct');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = label || '';
    if (pctEl) pctEl.textContent = pct + '%';
}

function _actualizarLogConvert(msg) {
    const log = document.getElementById('cvt-log');
    if (!log || !msg) return;
    const line = document.createElement('div');
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════
// DIÁLOGO DE ELECCIÓN — WebM o MP4
// Llamado desde export_video.js al finalizar la exportación
// ═══════════════════════════════════════════════════════════════════

function _ofrecerDescargaOConversion(webmBlob, nombreArchivo) {
    console.log('[MP4] _ofrecerDescargaOConversion() llamado');
    console.log('[MP4] blob size:', webmBlob?.size, '— nombre:', nombreArchivo);
    document.getElementById('export-modal')?.remove();
    document.getElementById('exp-float-widget')?.remove();

    const m = document.createElement('div');
    m.id = 'convert-choice-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);
        display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;`;

    const sizeMB = (webmBlob.size / 1024 / 1024).toFixed(1);

    m.innerHTML = `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;
                    padding:26px 30px;width:400px;max-width:92vw;">

            <div style="font-size:.6rem;color:#c8a96e;letter-spacing:.12em;margin-bottom:6px;">
                ✓ EXPORTACIÓN COMPLETADA
            </div>
            <div style="font-size:.49rem;color:#555;margin-bottom:20px;">
                ${nombreArchivo || 'video'} · ${sizeMB} MB
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">

                <button id="cvt-btn-webm"
                        style="display:flex;align-items:center;gap:12px;background:#0d0d0d;
                               border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;
                               cursor:pointer;text-align:left;width:100%;transition:border-color .15s;"
                        onmouseover="this.style.borderColor='#555'"
                        onmouseout="this.style.borderColor='#2a2a2a'">
                    <span style="font-size:1.25rem;flex-shrink:0;">📹</span>
                    <div>
                        <div style="font-size:.57rem;color:#e8e0d0;font-weight:700;
                                    font-family:'DM Mono',monospace;">Descargar WebM</div>
                        <div style="font-size:.46rem;color:#555;margin-top:2px;">
                            Descarga inmediata · Compatible Chrome, Firefox, VLC
                        </div>
                    </div>
                </button>

                <div style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.2);
                            border-radius:8px;padding:12px 14px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <span style="font-size:1.25rem;flex-shrink:0;">🎬</span>
                        <div>
                            <div style="font-size:.57rem;color:#c8a96e;font-weight:700;
                                        font-family:'DM Mono',monospace;">Convertir a MP4</div>
                            <div style="font-size:.46rem;color:#666;margin-top:1px;">
                                Compatible universal · primer uso descarga ~25 MB
                            </div>
                        </div>
                    </div>

                    <!-- Selector de calidad -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">
                        <button class="cvt-q-btn" data-q="remux"
                                style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;
                                       padding:6px 8px;cursor:pointer;text-align:left;transition:all .15s;">
                            <div style="font-size:.5rem;color:#aaa;font-family:'DM Mono',monospace;font-weight:700;">Remux</div>
                            <div style="font-size:.41rem;color:#555;margin-top:1px;">Sin pérdida · rápido</div>
                        </button>
                        <button class="cvt-q-btn" data-q="alta"
                                style="background:#0d0d0d;border:1px solid #c8a96e;border-radius:6px;
                                       padding:6px 8px;cursor:pointer;text-align:left;transition:all .15s;">
                            <div style="font-size:.5rem;color:#c8a96e;font-family:'DM Mono',monospace;font-weight:700;">Alta · CRF 18</div>
                            <div style="font-size:.41rem;color:#666;margin-top:1px;">Mejor calidad</div>
                        </button>
                        <button class="cvt-q-btn" data-q="media"
                                style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;
                                       padding:6px 8px;cursor:pointer;text-align:left;transition:all .15s;">
                            <div style="font-size:.5rem;color:#aaa;font-family:'DM Mono',monospace;font-weight:700;">Media · CRF 23</div>
                            <div style="font-size:.41rem;color:#555;margin-top:1px;">Equilibrio</div>
                        </button>
                        <button class="cvt-q-btn" data-q="rapida"
                                style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;
                                       padding:6px 8px;cursor:pointer;text-align:left;transition:all .15s;">
                            <div style="font-size:.5rem;color:#aaa;font-family:'DM Mono',monospace;font-weight:700;">Rápida · CRF 28</div>
                            <div style="font-size:.41rem;color:#555;margin-top:1px;">Menor tamaño</div>
                        </button>
                    </div>

                    <button id="cvt-btn-mp4"
                            style="width:100%;background:rgba(200,169,110,.15);
                                   border:1px solid rgba(200,169,110,.5);border-radius:6px;
                                   color:#c8a96e;font-family:'DM Mono',monospace;font-size:.53rem;
                                   font-weight:700;padding:8px 0;cursor:pointer;
                                   transition:all .15s;letter-spacing:.04em;"
                            onmouseover="this.style.background='rgba(200,169,110,.25)'"
                            onmouseout="this.style.background='rgba(200,169,110,.15)'">
                        Convertir →
                    </button>
                </div>

            </div>

            <div style="text-align:right;">
                <button onclick="document.getElementById('convert-choice-modal').remove()"
                        style="background:none;border:none;color:#3a3a3a;font-size:.49rem;
                               cursor:pointer;font-family:'DM Mono',monospace;padding:3px 6px;">
                    Cerrar
                </button>
            </div>
        </div>`;

    document.body.appendChild(m);

    document.getElementById('cvt-btn-webm').onclick = () => {
        console.log('[MP4] usuario eligió: WEBM');
        m.remove();
        const url = URL.createObjectURL(webmBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo || 'video'}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        mostrarNotificacion('✓ Video WebM descargado');
    };

    // Inicializar selector de calidad
    const _qBtns = m.querySelectorAll('.cvt-q-btn');
    function _selectQ(q) {
        _mp4Quality = q;
        _qBtns.forEach(b => {
            const active = b.dataset.q === q;
            b.style.borderColor = active ? '#c8a96e' : '#2a2a2a';
            b.querySelector('div').style.color = active ? '#c8a96e' : (b.dataset.q === 'alta' ? '#aaa' : '#aaa');
        });
    }
    _qBtns.forEach(b => b.addEventListener('click', () => _selectQ(b.dataset.q)));
    _selectQ(_mp4Quality); // marcar default

    document.getElementById('cvt-btn-mp4').onclick = () => {
        console.log('[MP4] usuario eligió: MP4 calidad=' + _mp4Quality + ' → convertirWebMaMP4()');
        m.remove();
        convertirWebMaMP4(webmBlob, nombreArchivo);
    };
}