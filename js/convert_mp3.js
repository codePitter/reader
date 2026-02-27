// ═══════════════════════════════════════════════════════════════════
// CONVERT_MP3.JS — Conversión WAV → MP3 en el navegador
// Reutiliza la infraestructura de FFmpeg.wasm de convert_mp4.js
// Debe cargarse DESPUÉS de convert_mp4.js (comparte _cargarFFmpeg)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// CONVERSIÓN PRINCIPAL WAV → MP3
// ═══════════════════════════════════════════════════════════════════

async function convertirWAVaMP3(wavBlob, nombreArchivo, bitrate = '192k') {
    console.log('[MP3] ══ convertirWAVaMP3() llamado ══');
    console.log('[MP3] wavBlob size:', wavBlob?.size, '— nombre:', nombreArchivo, '— bitrate:', bitrate);

    if (!wavBlob) { mostrarNotificacion('⚠ No hay audio para convertir'); return; }

    _mp3Cancelled = false;
    _abrirModalMP3(nombreArchivo, bitrate);

    try {
        _actualizarBarraMP3(0, '⏳ Preparando…');

        // Reutilizar _cargarFFmpeg de convert_mp4.js
        if (typeof _cargarFFmpeg !== 'function') {
            throw new Error('convert_mp4.js no cargado — _cargarFFmpeg no disponible');
        }

        console.log('[MP3] cargando FFmpeg...');
        const ffmpeg = await _cargarFFmpeg();
        console.log('[MP3] FFmpeg listo');
        if (_mp3Cancelled) return;

        // Escribir WAV en FS virtual
        _actualizarBarraMP3(68, '📥 Leyendo audio…');
        const inputData = new Uint8Array(await wavBlob.arrayBuffer());
        console.log('[MP3] WAV tamaño:', inputData.byteLength, 'bytes');

        await ffmpeg.writeFile('input.wav', inputData);
        console.log('[MP3] ✓ writeFile input.wav');
        if (_mp3Cancelled) return;

        // Convertir a MP3 con libmp3lame
        _actualizarBarraMP3(70, `🔄 Convirtiendo a MP3 (${bitrate})…`);
        console.log('[MP3] exec ffmpeg WAV→MP3, bitrate:', bitrate);

        // Registrar progreso
        const _prevProgress = ffmpeg._handlers?.progress;
        ffmpeg.on('progress', ({ progress }) => {
            if (typeof progress === 'number' && progress > 0) {
                const pct = Math.round(70 + progress * 26);
                _actualizarBarraMP3(pct, `🔄 Convirtiendo… ${pct}%`);
            }
        });

        await ffmpeg.exec([
            '-i', 'input.wav',
            '-c:a', 'libmp3lame',
            '-b:a', bitrate,
            '-q:a', '0',          // máxima calidad VBR interna
            '-id3v2_version', '3',
            'output.mp3'
        ]);
        console.log('[MP3] ✓ exec completado');

        if (_mp3Cancelled) return;

        // Leer resultado
        _actualizarBarraMP3(96, '📦 Empaquetando…');
        const outputData = await ffmpeg.readFile('output.mp3');
        console.log('[MP3] output.mp3 tamaño:', outputData.byteLength, 'bytes');

        const mp3Blob = new Blob([outputData.buffer], { type: 'audio/mpeg' });

        // Limpiar FS
        try { await ffmpeg.deleteFile('input.wav'); } catch (_) { }
        try { await ffmpeg.deleteFile('output.mp3'); } catch (_) { }

        // Descarga
        _actualizarBarraMP3(100, '✓ ¡Listo!');
        const url = URL.createObjectURL(mp3Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo || 'audio'}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 15000);

        // Mostrar tamaño final
        const sizeMB = (mp3Blob.size / 1024 / 1024).toFixed(1);
        const wavMB  = (wavBlob.size  / 1024 / 1024).toFixed(1);
        console.log(`[MP3] ✓ MP3 listo — ${sizeMB} MB (WAV era ${wavMB} MB)`);

        setTimeout(() => _cerrarModalMP3(), 2000);
        mostrarNotificacion(`✓ MP3 descargado (${sizeMB} MB)`);

    } catch (err) {
        console.error('[MP3] ✗ ERROR:', err);
        if (!_mp3Cancelled) {
            _actualizarBarraMP3(0, `❌ Error: ${err.message}`);
            const btn = document.getElementById('mp3-cancel-btn');
            if (btn) {
                btn.textContent = 'Cerrar';
                btn.style.color = '#c8a96e';
                btn.style.borderColor = '#c8a96e';
            }
            mostrarNotificacion('❌ No se pudo convertir a MP3');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════════════════════════

let _mp3Cancelled = false;

// ═══════════════════════════════════════════════════════════════════
// MODAL DE PROGRESO
// ═══════════════════════════════════════════════════════════════════

function _abrirModalMP3(nombreArchivo, bitrate) {
    _cerrarModalMP3();
    const m = document.createElement('div');
    m.id = 'convert-mp3-modal';
    m.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);
        display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;`;

    m.innerHTML = `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;
                    padding:26px 30px;width:460px;max-width:92vw;">

            <div style="font-size:.6rem;color:#c8a96e;letter-spacing:.12em;margin-bottom:6px;">
                🎵 CONVIRTIENDO A MP3
            </div>
            <div style="font-size:.49rem;color:#555;margin-bottom:4px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${nombreArchivo || 'audio'}.mp3
            </div>
            <div style="font-size:.44rem;color:#3a3a3a;margin-bottom:16px;">
                Bitrate: ${bitrate} · libmp3lame
            </div>

            <div style="background:#1a1a1a;border-radius:4px;height:5px;overflow:hidden;margin-bottom:5px;">
                <div id="mp3-bar"
                     style="height:100%;width:0%;background:#c8a96e;
                            transition:width .35s ease;border-radius:4px;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
                <span id="mp3-label" style="font-size:.51rem;color:#888;">Iniciando…</span>
                <span id="mp3-pct"   style="font-size:.51rem;color:#c8a96e;">0%</span>
            </div>

            <details style="margin-bottom:14px;">
                <summary style="font-size:.46rem;color:#444;cursor:pointer;
                                user-select:none;list-style:none;">
                    ▶ Log técnico
                </summary>
                <div id="mp3-log"
                     style="margin-top:6px;background:#0a0a0a;border:1px solid #1a1a1a;
                            border-radius:4px;padding:7px;height:60px;overflow-y:auto;
                            font-size:.41rem;color:#444;line-height:1.5;word-break:break-all;">
                </div>
            </details>

            <div style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);
                        border-radius:6px;padding:9px 12px;font-size:.46rem;color:#555;
                        margin-bottom:16px;line-height:1.7;">
                ℹ Usa el mismo motor FFmpeg.wasm que la conversión de video.<br>
                Los archivos <b style="color:#666;">nunca salen de tu dispositivo</b>.
            </div>

            <div style="text-align:right;">
                <button id="mp3-cancel-btn" onclick="_cancelarMP3()"
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

function _cerrarModalMP3() {
    document.getElementById('convert-mp3-modal')?.remove();
}

function _cancelarMP3() {
    _mp3Cancelled = true;
    // Terminar instancia FFmpeg si está activa (la comparte con MP4)
    if (typeof _ffmpegInstance !== 'undefined' && _ffmpegInstance) {
        try { _ffmpegInstance.terminate(); } catch (_) { }
        // Resetear estado compartido de convert_mp4.js
        if (typeof _ffmpegLoaded !== 'undefined') {
            window._ffmpegInstance = null;
            window._ffmpegLoaded = false;
        }
    }
    _cerrarModalMP3();
    mostrarNotificacion('✕ Conversión MP3 cancelada');
}

function _actualizarBarraMP3(pct, label) {
    const bar   = document.getElementById('mp3-bar');
    const lbl   = document.getElementById('mp3-label');
    const pctEl = document.getElementById('mp3-pct');
    const log   = document.getElementById('mp3-log');
    if (bar)   bar.style.width = pct + '%';
    if (lbl)   lbl.textContent = label || '';
    if (pctEl) pctEl.textContent = pct + '%';
    // También loguear mensajes que no sean numéricos
    if (log && label && !label.match(/^\d+%/)) {
        const line = document.createElement('div');
        line.textContent = label;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    }
}
