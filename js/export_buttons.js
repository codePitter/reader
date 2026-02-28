// ═══════════════════════════════════════════════════════════════════
// EXPORT_BUTTONS.JS — Botones "Exportar video" y "Exportar audio"
// del top-bar principal (index.html)
//
// Depende de:
//   · export_video.js  (_pasarASeleccionImagenes, _abrirModalSoloAudio,
//                       _expCancelled, _expImagenes)
//   · tts.js           (sentences, dividirEnOraciones)
//   · main.js          (mostrarNotificacion)
//   · epub.js          (llama a _exportBtns_habilitar() tras cargar capítulo)
//
// Debe cargarse DESPUÉS de export_video.js y ANTES de init.js
// ═══════════════════════════════════════════════════════════════════

// ─── API PÚBLICA ────────────────────────────────────────────────────

/**
 * Habilita ambos botones de exportación.
 * Llamado desde epub.js una vez que el capítulo termina de cargarse.
 */
function _exportBtns_habilitar() {
    ['btn-export-video', 'btn-export-audio'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
    });
}

/**
 * Deshabilita ambos botones de exportación.
 * Útil para resetear el estado cuando no hay contenido.
 */
function _exportBtns_deshabilitar() {
    ['btn-export-video', 'btn-export-audio'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = true;
    });
}

// ─── EXPORTAR VIDEO ─────────────────────────────────────────────────

/**
 * Salta directamente al paso 2 (selección de thumbnails).
 * Si sentences está vacío lo reconstruye desde el texto visible.
 */
function exportarVideoDirecto() {
    const contenido = document.getElementById('texto-contenido');
    if (!contenido || !contenido.textContent.trim()) {
        mostrarNotificacion('⚠ Carga un capítulo primero');
        return;
    }

    // Reconstruir sentences si es necesario (ej: capítulo cargado sin reproducir)
    if (typeof sentences !== 'undefined' && sentences.length === 0) {
        if (typeof dividirEnOraciones === 'function') {
            sentences = dividirEnOraciones(contenido.textContent.trim());
        }
    }

    if (typeof sentences === 'undefined' || sentences.length === 0) {
        mostrarNotificacion('⚠ No hay oraciones cargadas — reproduce el capítulo primero');
        return;
    }

    // ── Pausar reproducción antes de abrir el modal ──
    if (typeof isReading !== 'undefined' && isReading) {
        if (typeof pausarTTS === 'function') pausarTTS();
    }

    // ── Pausar música ambiental ──
    if (typeof freesoundAudio !== 'undefined' && freesoundAudio && !freesoundAudio.paused) {
        freesoundAudio.pause();
    }

    // Delegar a exportarVideo() que abre el modal desde el paso 1 (config TTS + imágenes)
    if (typeof exportarVideo === 'function') {
        exportarVideo();
    } else {
        mostrarNotificacion('⚠ Módulo export_video.js no disponible');
    }
}

// ─── EXPORTAR AUDIO ─────────────────────────────────────────────────

/**
 * Abre el modal de exportación de audio (WAV / MP3 con calidades).
 * Reutiliza _abrirModalSoloAudio() de export_video.js.
 */
function abrirModalExportarAudio() {
    const contenido = document.getElementById('texto-contenido');
    if (!contenido || !contenido.textContent.trim()) {
        mostrarNotificacion('⚠ Carga un capítulo primero');
        return;
    }

    if (typeof _abrirModalSoloAudio === 'function') {
        _abrirModalSoloAudio();
    } else {
        mostrarNotificacion('⚠ Módulo export_video.js no disponible');
    }
}