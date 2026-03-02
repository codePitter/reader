// ═══════════════════════════════════════
// TTS — Motor completo: browser SpeechSynthesis + API local XTTS v2 + grabación
// Depende de: main.js (sentences, currentSentenceIndex, isReading, etc.)
//             player.js (ambientGainNode, getAudioCtx)
// ═══════════════════════════════════════

// ─── MOTOR TTS — API LOCAL (edge-tts) ───
// URL del servidor — se lee desde xtts-status.js en tiempo real.
// Usar siempre _getTTSApiURL() (nunca hardcodear localhost:PUERTO).
function _getTTSApiURL() {
    return typeof xttsGetURL === 'function'
        ? xttsGetURL()
        : `http://localhost:${typeof uGet === 'function' ? (parseInt(uGet('tts_server_port')) || 5000) : 5000}`;
}

// Voz Edge TTS activa — se puede cambiar desde la UI
let _edgeTtsVoice = uGet('edge_tts_voice') || 'es-MX-JorgeNeural';

// ─── TOGGLE: usar servidor local para reproducción en vivo ───
// Cuando está activo, leerOracionLocal() se usa en lugar de SpeechSynthesis
// Se persiste en localStorage para recordar la preferencia del usuario
let _usarServidorLive = uGet('tts_servidor_live') === 'true';

function toggleServidorLive() {
    _usarServidorLive = !_usarServidorLive;
    uSet('tts_servidor_live', _usarServidorLive ? 'true' : 'false');
    _sincronizarBtnServidorLive();

    if (_usarServidorLive) {
        // Verificar que el servidor esté disponible al activar
        verificarServidorTTS().then(ok => {
            if (!ok) {
                _usarServidorLive = false;
                uSet('tts_servidor_live', 'false');
                _sincronizarBtnServidorLive();
                mostrarNotificacion(`⚠ Servidor TTS no disponible en ${_getTTSApiURL()}`);
            } else {
                mostrarNotificacion('✓ TTS Local activado para reproducción en vivo');
            }
        });
    } else {
        mostrarNotificacion('🔊 TTS del navegador activado');
        // Si estaba reproduciendo con el servidor, detener y relanzar con browser synth
        if (isReading && audioActual) {
            const idx = currentSentenceIndex;
            detenerTTS();
            // Pequeño delay para limpiar estado
            setTimeout(() => {
                isReading = true;
                isPaused = false;
                envolverOracionesEnSpans(document.getElementById('texto-contenido'), sentences);
                actualizarEstadoTTS('reproduciendo');
                leerOracion(idx);
            }, 100);
        }
    }

    // Si estaba reproduciendo con browser synth, relanzar con el servidor
    if (_usarServidorLive && isReading && !audioActual && synth.speaking) {
        const idx = currentSentenceIndex;
        synth.cancel();
        setTimeout(() => {
            leerOracionLocal(idx);
        }, 100);
    }
}

// Sincroniza el estado visual del botón toggle en la barra TTS
function _sincronizarBtnServidorLive() {
    const btn = document.getElementById('btn-tts-servidor-live');
    const voiceSelect = document.getElementById('voice-select');
    const edgeSelect = document.getElementById('edge-voice-select');
    if (!btn) return;

    if (_usarServidorLive) {
        btn.classList.add('active');
        btn.title = 'Usando servidor local (Edge TTS) — clic para volver al navegador';
        // Mostrar selector de voz Edge, ocultar el del navegador
        if (edgeSelect) edgeSelect.style.display = '';
        if (voiceSelect) voiceSelect.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.title = 'Usar servidor TTS local (Edge TTS) para reproducción en vivo';
        // Mostrar selector del navegador, ocultar Edge
        if (edgeSelect) edgeSelect.style.display = 'none';
        if (voiceSelect) voiceSelect.style.display = '';
    }
}

function setEdgeTtsVoice(voice) {
    _edgeTtsVoice = voice;
    uSet('edge_tts_voice', voice);
    const sel = document.getElementById('edge-voice-select');
    if (sel && sel.value !== voice) sel.value = voice;
    // Sincronizar también el select del modal de exportación si está abierto
    const selExp = document.getElementById('exp-voice-select');
    if (selExp && selExp.value !== voice) selExp.value = voice;
    mostrarNotificacion('✓ Voz: ' + voice.split('-').slice(2).join('-'));
}

async function verificarServidorTTS() {
    try {
        const response = await fetch(`${_getTTSApiURL()}/health`, {
            method: 'GET',
            timeout: 2000
        });

        if (response.ok) {
            const data = await response.json();
            servidorTTSDisponible = true;
            console.log('✅ Servidor TTS local disponible:', data);
            mostrarNotificacion('🎤 TTS Local (' + (data.engine || 'edge-tts') + ') disponible — actívalo con 🖥');
            // Sincronizar el botón toggle sin forzar activación automática
            _sincronizarBtnServidorLive();
            return true;
        }
    } catch (error) {
        servidorTTSDisponible = false;
        console.log('ℹ️ Servidor TTS local no disponible, usando TTS del navegador');
    }
    return false;
}

// Normaliza el texto antes de enviarlo al TTS para evitar artefactos de audio.
// Las interjecciones cortas como "uh", "oh", "ah" se renderizan mal en Edge TTS
// porque son tokens raros de baja frecuencia — se expanden a formas equivalentes.
function _normalizarTextoTTS(texto) {
    if (!texto) return texto;
    return texto
        // Interjecciones sueltas (con o sin puntuación alrededor) → forma expandida
        // Priorizar coincidencias de palabra completa (límite \b)
        .replace(/\buh[,\.\!\?]*/gi, 'eh')
        .replace(/\buhh+[,\.\!\?]*/gi, 'eh')
        .replace(/\buhm+[,\.\!\?]*/gi, 'em')
        .replace(/\bumm+[,\.\!\?]*/gi, 'em')
        .replace(/\bhmm+[,\.\!\?]*/gi, 'mm')
        .replace(/\bhm[,\.\!\?]*/gi, 'mm')
        // "oh" solo cuando está aislado o como exclamación (no dentro de palabras)
        .replace(/(?<![a-záéíóúüñA-ZÁÉÍÓÚÜÑ])oh[,\.\!\?]*(?![a-záéíóúüñA-ZÁÉÍÓÚÜÑ])/g, 'o')
        // Guion largo al inicio (diálogo) seguido de interjección
        .replace(/^[\u2013\u2014\-]\s*uh\b/i, '— eh')
        .replace(/^[\u2013\u2014\-]\s*oh\b/i, '— o')
        // Limpiar espacios dobles que puedan haber quedado
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// Generar audio usando la API local.
// IMPORTANTE: NO modifica servidorTTSDisponible — los errores transitorios
// (timeout, frase vacía, red momentánea) no deben apagar el motor globalmente.
// Solo verificarServidorTTS() puede cambiar ese flag.
async function generarAudioLocal(texto, { silencioso = false } = {}) {
    try {
        const textoNorm = _normalizarTextoTTS(texto);
        const response = await fetch(`${_getTTSApiURL()}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoNorm, voice: _edgeTtsVoice })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);
    } catch (error) {
        console.error('[TTS] Error al generar audio local:', error);
        if (!silencioso) mostrarNotificacion('⚠️ Error puntual en TTS local');
        // NO se desactiva servidorTTSDisponible — puede ser error transitorio
        return null;
    }
}

// ─── PRE-FETCH CACHE ───
// Mapa index → Promise<audioUrl|null> para oraciones pre-generadas en background.
// Se limpia al detener/iniciar TTS para liberar URLs de objeto.
const _ttsAudioCache = new Map();
// URL de objeto del audio que está sonando ahora — para poder revocarla en detenerTTS()
let _ttsCurrentUrl = null;

function _preFetchOracion(index) {
    if (index < 0 || index >= sentences.length) return;
    if (_ttsAudioCache.has(index)) return;
    // No pre-fetch mientras hay una exportación en curso (el servidor está ocupado)
    if (typeof _expCancelled !== 'undefined' && window._exportEnCurso) return;
    const promise = generarAudioLocal(sentences[index], { silencioso: true }).catch(() => null);
    _ttsAudioCache.set(index, promise);
}

async function _limpiarTTSCache() {
    for (const [, promise] of _ttsAudioCache) {
        const url = await promise.catch(() => null);
        if (url) URL.revokeObjectURL(url);
    }
    _ttsAudioCache.clear();
}

// Reproducir audio con la API local — con pre-fetch lookahead de 2 oraciones
async function leerOracionLocal(index, audioUrlPreGenerada) {
    // ── Token de sesión: capturado PRIMERO, antes de cualquier await ──
    // Cada seek/stop incrementa _ttsSessionToken. Después de cada await verificamos
    // si la sesión sigue vigente — si no, esta instancia es zombie y debe abortarse.
    const miSesionTTS = _ttsSessionToken;

    // ── Guardia de exclusión mutua ──
    if (synth.speaking || synth.pending) synth.cancel();

    if (index >= sentences.length) {
        detenerTTS();
        mostrarNotificacion('Lectura completada');
        return;
    }

    currentSentenceIndex = index;
    actualizarProgreso();
    resaltarOracion(index);
    if (typeof actualizarSlideAI === 'function') actualizarSlideAI(index);
    if (typeof smartRotCheck === 'function') smartRotCheck(index);

    // Actualizar botón a ⏸ ANTES del primer await para feedback visual inmediato
    if (isReading && !isPaused) actualizarEstadoTTS('reproduciendo');

    // Arrancar pre-fetch de las 2 siguientes oraciones inmediatamente
    _preFetchOracion(index + 1);
    _preFetchOracion(index + 2);

    // Obtener audio: usar el pre-generado si viene, sacar de cache, o generar ahora
    let audioUrl = audioUrlPreGenerada ?? null;
    if (!audioUrl) {
        if (_ttsAudioCache.has(index)) {
            audioUrl = await _ttsAudioCache.get(index);
        } else {
            mostrarNotificacion(`Generando audio ${index + 1}/${sentences.length}...`);
            _preFetchOracion(index);
            audioUrl = await _ttsAudioCache.get(index);
        }
    }
    _ttsAudioCache.delete(index);

    // ── CHECK 1: ¿Sigue siendo nuestra sesión? ──
    // Si el usuario hizo seek/stop durante el await de generación, esta instancia
    // es zombie — el audio generado es basura, lo revocamos y abortamos silenciosamente.
    if (miSesionTTS !== _ttsSessionToken) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        return;
    }

    if (!audioUrl) {
        console.warn(`[XTTS] Sin audio para oración ${index + 1} — saltando`);
        if (isReading && !isPaused) {
            const next = index + 1;
            if (next >= sentences.length) {
                detenerTTS();
                _avanzarSiguienteCapituloAuto();
            } else {
                leerOracionLocal(next);
            }
        }
        return;
    }

    audioActual = new Audio(audioUrl);
    _ttsCurrentUrl = audioUrl;

    if (typeof _rec_connectAudioElement === 'function') {
        _rec_connectAudioElement(audioActual);
    }

    audioActual.volume = parseFloat(document.getElementById('volume-control').value) / 100;

    audioActual.onended = async function () {
        _ttsCurrentUrl = null;
        URL.revokeObjectURL(audioUrl);
        // Sesión inválida → esta instancia fue reemplazada por seek, ignorar
        if (miSesionTTS !== _ttsSessionToken) return;
        if (isReading && !isPaused) {
            const next = index + 1;
            if (next >= sentences.length) {
                detenerTTS();
                _avanzarSiguienteCapituloAuto();
            } else {
                // Avanzar índice visual ANTES del await (canvas a 60fps)
                currentSentenceIndex = next;
                actualizarProgreso();
                resaltarOracion(next);
                if (typeof actualizarSlideAI === 'function') actualizarSlideAI(next);
                if (typeof smartRotCheck === 'function') smartRotCheck(next);

                let nextUrl = null;
                if (_ttsAudioCache.has(next)) {
                    nextUrl = await _ttsAudioCache.get(next);
                    _ttsAudioCache.delete(next);
                }
                leerOracionLocal(next, nextUrl);
            }
        }
    };

    audioActual.onerror = function (e) {
        _ttsCurrentUrl = null;
        URL.revokeObjectURL(audioUrl);
        // ── Sesión inválida: blob ya fue revocado por un seek → ignorar silenciosamente ──
        // Este es el caso de los ERR_FILE_NOT_FOUND tras un seek: el blob fue revocado
        // por detenerTTSSinEstado() y el <audio> intenta cargarlo → falla → onerror.
        // Sin este guard, onerror spawnaría leerOracionLocal() sobre la nueva sesión → 2 TTS.
        if (miSesionTTS !== _ttsSessionToken) return;
        console.error('[XTTS] Error al reproducir audio:', e);
        if (_usarServidorLive && servidorTTSDisponible) {
            console.warn(`[XTTS] Error en oración ${index + 1} — saltando oración`);
            if (isReading && !isPaused) {
                const next = index + 1;
                if (next >= sentences.length) {
                    detenerTTS();
                    _avanzarSiguienteCapituloAuto();
                } else {
                    leerOracionLocal(next);
                }
            }
            return;
        }
        leerOracion(index);
    };

    // ── Guard final: si el usuario pausó durante la generación, no reproducir ──
    if (isPaused || miSesionTTS !== _ttsSessionToken) {
        if (isPaused) actualizarEstadoTTS('pausado');
        return;
    }

    audioActual.play();
    actualizarEstadoTTS('reproduciendo');
}

// ─── VOCES Y CONTROLES ───
function cargarVoces() {
    voices = synth.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.innerHTML = '';

    // Filtrar voces en español primero
    const vocesEspanol = voices.filter(v => v.lang.startsWith('es'));
    const otrasVoces = voices.filter(v => !v.lang.startsWith('es'));

    if (vocesEspanol.length > 0) {
        const optgroupEs = document.createElement('optgroup');
        optgroupEs.label = 'Español';
        vocesEspanol.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.textContent = `${voice.name} (${voice.lang})`;
            optgroupEs.appendChild(option);
        });
        voiceSelect.appendChild(optgroupEs);
    }

    if (otrasVoces.length > 0) {
        const optgroupOtros = document.createElement('optgroup');
        optgroupOtros.label = 'Otros idiomas';
        otrasVoces.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.textContent = `${voice.name} (${voice.lang})`;
            optgroupOtros.appendChild(option);
        });
        voiceSelect.appendChild(optgroupOtros);
    }

    // Seleccionar Google español es-ES por defecto, si no existe la primera voz en español
    const googleEsES = vocesEspanol.find(v =>
        v.name.toLowerCase().includes('google') && v.lang === 'es-ES'
    );
    const defaultVoice = googleEsES || vocesEspanol.find(v => v.lang === 'es-ES') || vocesEspanol[0];

    // Restaurar voz guardada si existe; si no, usar el default
    const savedVoiceIdx = uGet('tts_voice_idx');
    if (savedVoiceIdx !== null && voiceSelect.querySelector(`option[value="${savedVoiceIdx}"]`)) {
        voiceSelect.value = savedVoiceIdx;
    } else if (defaultVoice) {
        voiceSelect.value = voices.indexOf(defaultVoice);
    }
}

// Inicializar voces
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = cargarVoces;
}
cargarVoces();

// Sincronizar el estado del botón toggle al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    _sincronizarBtnServidorLive();
    // Restaurar voz Edge TTS en el selector
    const edgeSel = document.getElementById('edge-voice-select');
    if (edgeSel && _edgeTtsVoice) edgeSel.value = _edgeTtsVoice;
});

// Controles de TTS — actualizar display Y persistir en uStorage
document.getElementById('rate-control').addEventListener('input', function (e) {
    document.getElementById('rate-value').textContent = e.target.value;
    uSet('tts_rate', e.target.value);
});

document.getElementById('pitch-control').addEventListener('input', function (e) {
    document.getElementById('pitch-value').textContent = e.target.value;
    uSet('tts_pitch', e.target.value);
});

document.getElementById('volume-control').addEventListener('input', function (e) {
    document.getElementById('volume-value').textContent = e.target.value;
    uSet('tts_volume', e.target.value);
});

// Persistir voz del navegador al cambiar
document.getElementById('voice-select').addEventListener('change', function (e) {
    uSet('tts_voice_idx', e.target.value);
});

function dividirEnOraciones(texto) {
    // Dividir primero por párrafos para nunca cruzar su límite con una oración
    const parrafos = texto.split(/\n\n+/).filter(p => p.trim().length > 0);
    const todasLasOraciones = [];

    parrafos.forEach(parrafo => {
        const conPuntuacion = parrafo.match(/[^.!?]+[.!?]+/g) || [];
        const ultimoCaracter = conPuntuacion.join('').length;
        const resto = parrafo.slice(ultimoCaracter).trim();
        if (resto.length > 0) conPuntuacion.push(resto);
        const oraciones = conPuntuacion.length > 0 ? conPuntuacion : [parrafo];
        oraciones.forEach(o => todasLasOraciones.push(o));
    });

    // Limpiar: quitar espacios y TODOS los tipos de comillas sueltas al inicio y final
    const limpias = todasLasOraciones
        .map(o => o.trim()
            // Quitar comillas y símbolos al INICIO (incluyendo " recto U+0022 y todas las tipográficas)
            .replace(/^[\s\u0022\u2018\u2019\u201C\u201D\u00AB\u00BB\'\u2013\u2014\-]+/, '')
            // Quitar comillas y símbolos al FINAL también
            .replace(/[\s\u0022\u2018\u2019\u201C\u201D\u00AB\u00BB\u2013]+$/, '')
            .trimStart()
        )
        // Descartar oraciones que son solo símbolos o tienen menos de 2 caracteres reales
        .filter(o => {
            if (o.length === 0) return false;
            // Eliminar si el contenido real (letras/dígitos) es menor a 2 caracteres
            const soloTexto = o.replace(/[^\p{L}\p{N}]/gu, '');
            return soloTexto.length >= 2;
        });

    // ── Fusionar fragmentos de palabra partida ──
    // Si una "oración" empieza en minúscula y tiene ≤3 palabras, es casi seguro
    // la cola de una palabra partida por un span inline (onomatopeyas, traducción, etc.)
    // Ejemplo: "retiraran." + "an." → "retiraran." (se descarta "an." fusionándola hacia atrás)
    const fusionadas = [];
    for (let i = 0; i < limpias.length; i++) {
        const o = limpias[i];
        const primeraLetra = o.match(/\p{L}/u)?.[0] ?? '';
        const palabras = o.split(/\s+/).filter(Boolean);
        const esFragmento = primeraLetra && primeraLetra === primeraLetra.toLowerCase()
            && palabras.length <= 3;
        if (esFragmento && fusionadas.length > 0) {
            // Pegar el fragmento al final de la oración anterior sin espacio
            // (es continuación de una palabra: "retiraran" + "an." → "retiraran" con "an." descartado)
            // Nota: NO concatenar — simplemente descartar el fragmento, ya que la oración anterior
            // ya tiene el texto correcto (el fragmento es duplicado del final de la palabra)
            console.warn(`[TTS] Fragmento descartado: "${o}" (continuación de "${fusionadas[fusionadas.length - 1].slice(-20)}")`);
        } else {
            fusionadas.push(o);
        }
    }

    return fusionadas;
}

// ─── TTS ENGINE — estado, progreso, highlight ───
function actualizarEstadoTTS(estado) {
    const statusEl = document.getElementById('tts-status');
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');
    const btnStop = document.getElementById('btn-stop');
    const kBtn = document.getElementById('kbtn-playpause');

    switch (estado) {
        case 'reproduciendo':
            statusEl.textContent = '🔊 Reproduciendo...';
            statusEl.className = 'tts-status speaking';
            btnPlay.disabled = false;
            btnPlay.textContent = '⏸';
            btnStop.disabled = false;
            if (kBtn) { kBtn.innerHTML = '⏸'; kBtn.classList.remove('paused'); }
            break;
        case 'pausado':
            statusEl.textContent = '⏸️ En pausa';
            statusEl.className = 'tts-status';
            btnPlay.disabled = false;
            btnPlay.textContent = '▶';
            btnStop.disabled = false;
            if (kBtn) { kBtn.innerHTML = '&#9654;'; kBtn.classList.add('paused'); }
            break;
        case 'detenido':
            statusEl.textContent = '⏹️ Detenido';
            statusEl.className = 'tts-status';
            btnPlay.disabled = false;
            btnPlay.textContent = '▶';
            btnStop.disabled = true;
            if (kBtn) { kBtn.innerHTML = '&#9654;'; kBtn.classList.remove('paused'); }
            break;
    }
}

function actualizarProgreso() {
    if (sentences.length === 0) return;
    const progreso = ((currentSentenceIndex + 1) / sentences.length) * 100;
    document.getElementById('progress-fill').style.width = progreso + '%';

    // Actualizar barra del video
    const kFill = document.getElementById('video-progress-fill');
    const kCurrent = document.getElementById('kp-current');
    if (kFill) kFill.style.width = progreso + '%';
    if (kCurrent) kCurrent.textContent = `Frase ${currentSentenceIndex + 1} / ${sentences.length}`;
}

function resaltarOracion(index) {
    // Quitar resaltado anterior
    document.querySelectorAll('.tts-sentence').forEach(el => el.classList.remove('tts-active'));

    const span = document.getElementById(`tts-s-${index}`);
    if (span) {
        span.classList.add('tts-active');
        // Scroll suave solo si el video overlay NO está activo (si lo está, el reading-area está oculto)
        if (typeof videoActive === 'undefined' || !videoActive) {
            span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// ─── TTS ENGINE — leerOracion, iniciarTTS, envolver spans ───
function leerOracion(index) {
    // ── Guardia de exclusión mutua ──
    // Si XTTS está activo y disponible, este motor no debe dispararse.
    // Silenciamos el browser synth por si quedó algo colgado y abortamos.
    if (_usarServidorLive && servidorTTSDisponible) {
        if (synth.speaking || synth.pending) synth.cancel();
        return;
    }
    // Aunque XTTS no esté activo, si hay audio local sonando, silenciarlo
    if (typeof audioActual !== 'undefined' && audioActual && !audioActual.paused) {
        audioActual.pause();
        audioActual.currentTime = 0;
    }

    if (index >= sentences.length) {
        detenerTTS();
        mostrarNotificacion('Lectura completada');
        return;
    }

    currentSentenceIndex = index;
    actualizarProgreso();
    resaltarOracion(index);
    if (typeof actualizarSlideAI === 'function') actualizarSlideAI(index);
    // ── Smart image rotation every N sentences ──
    if (typeof smartRotCheck === 'function') smartRotCheck(index);

    utterance = new SpeechSynthesisUtterance(sentences[index]);

    // Configurar parámetros
    const voiceIndex = document.getElementById('voice-select').value;
    if (voices[voiceIndex]) {
        utterance.voice = voices[voiceIndex];
    }
    utterance.rate = parseFloat(document.getElementById('rate-control').value);
    utterance.pitch = parseFloat(document.getElementById('pitch-control').value);
    utterance.volume = (typeof window._masterVolume !== 'undefined') ? window._masterVolume : parseFloat(document.getElementById('volume-control').value) / 100;

    const miSesionBrowser = _ttsSessionToken;
    utterance.onend = function () {
        if (miSesionBrowser !== _ttsSessionToken) return;
        if (!isReading || isPaused) return;
        const next = index + 1;
        if (next >= sentences.length) {
            // Fin del capítulo — intentar avanzar automáticamente al siguiente
            detenerTTS();
            _avanzarSiguienteCapituloAuto();
        } else {
            leerOracion(next);
        }
    };

    utterance.onerror = function (event) {
        // Ignorar error 'interrupted' — ocurre normalmente al pausar/reanudar
        if (event.error === 'interrupted') return;
        console.error('Error en TTS:', event);
        mostrarNotificacion('Error en la reproducción');
    };

    synth.speak(utterance);
}


// ── Botón unificado ▶/⏸ ──
function togglePlayPause() {
    if (!isReading) iniciarTTS();
    else if (isPaused) reanudarTTS();
    else pausarTTS();
}

// fraseInicial: índice de la oración desde la que arrancar (0 = principio).
// Usado por progress.js (restaurar progreso) y bookmarks.js (ir a marcador).
function iniciarTTS(fraseInicial = 0) {
    const contenido = document.getElementById('texto-contenido');
    const texto = contenido.textContent.trim();

    if (!texto || texto === 'Aquí aparecerá el contenido del capítulo seleccionado...') {
        mostrarNotificacion('⚠ No hay texto para leer');
        return;
    }

    // Detener cualquier lectura anterior
    detenerTTS();

    sentences = dividirEnOraciones(texto);

    // Clampear fraseInicial al rango válido para evitar índices fuera de bounds
    const _inicio = (Number.isInteger(fraseInicial) && fraseInicial > 0 && fraseInicial < sentences.length)
        ? fraseInicial
        : 0;

    currentSentenceIndex = _inicio;
    isReading = true;
    isPaused = false;
    // ── Activar rotación inteligente de imágenes ──
    if (typeof iniciarSmartRot === 'function') iniciarSmartRot();

    // Envolver cada oración en un <span> para poder resaltarla
    envolverOracionesEnSpans(contenido, sentences);

    // Si arrancamos desde una frase distinta a la 0, hacer scroll hasta ella
    if (_inicio > 0) {
        setTimeout(() => {
            const span = document.getElementById(`tts-s-${_inicio}`);
            if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
    }

    actualizarEstadoTTS('reproduciendo');

    // Reconstruir el mapa de slots IA AHORA que sentences ya está poblado
    // (debe hacerse antes de abrirvideo() para que solicitarImagenParaSlot tenga datos reales)
    if (typeof buildAiSlotMap === 'function') buildAiSlotMap();

    // Detectar género con IA — cancelar cualquier análisis pendiente anterior
    if (typeof detectarGeneroConIA === 'function') {
        // Cancelar timer previo si existe
        if (window._genreDetectTimer) { clearTimeout(window._genreDetectTimer); window._genreDetectTimer = null; }
        const yaEnModoVideo = typeof videoActive !== 'undefined' && videoActive;
        if (yaEnModoVideo) {
            // Delay suave: la música actual sigue sonando unos segundos, luego cambia
            window._genreDetectTimer = setTimeout(() => {
                window._genreDetectTimer = null;
                detectarGeneroConIA();
            }, 3000);
        } else {
            detectarGeneroConIA();
        }
    }
    if (typeof abrirvideo === 'function') {
        abrirvideo();
    }

    // Elegir motor según el toggle _usarServidorLive.
    // Si el servidor local está activado Y disponible → Edge TTS en vivo.
    // En caso contrario → SpeechSynthesis del navegador (comportamiento original).
    if (_usarServidorLive && servidorTTSDisponible) {
        mostrarNotificacion('🖥 Reproduciendo con TTS Local...');
        leerOracionLocal(_inicio);
    } else {
        if (_usarServidorLive && !servidorTTSDisponible) {
            mostrarNotificacion('⚠ Servidor no disponible, usando navegador');
        } else {
            mostrarNotificacion('🔊 Reproduciendo...');
        }
        leerOracion(_inicio);
    }
}

// Envuelve cada oración en un <span> para resaltarla durante el TTS
function envolverOracionesEnSpans(contenedor, oraciones) {
    // Limpiar spans anteriores preservando texto
    contenedor.querySelectorAll('.tts-sentence').forEach(span => {
        span.replaceWith(document.createTextNode(span.textContent));
    });
    contenedor.normalize();

    let html = contenedor.innerHTML;
    // Cursor: buscar siempre DESPUÉS de la última inserción para evitar
    // encontrar el mismo texto dentro de un span ya creado (evita duplicación)
    let cursor = 0;

    oraciones.forEach((oracion, i) => {
        const texto = oracion.trim();
        if (!texto) return;
        const idx = html.indexOf(texto, cursor);
        if (idx === -1) return;
        const spanStr = `<span class="tts-sentence" id="tts-s-${i}">${texto}</span>`;
        html = html.slice(0, idx) + spanStr + html.slice(idx + texto.length);
        // Avanzar cursor al final del span recién insertado
        cursor = idx + spanStr.length;
    });

    contenedor.innerHTML = html;
}

// ─── TTS ENGINE — pausa, reanuda, detiene, auto-siguiente capítulo ───
function pausarTTS() {
    // Pausar motor XTTS/Edge (audioActual) si está activo
    if (typeof audioActual !== 'undefined' && audioActual && !audioActual.paused) {
        audioActual.pause();
        isPaused = true;
        actualizarEstadoTTS('pausado');
        mostrarNotificacion('Lectura pausada');
        return;
    }
    // Pausar browser synth
    if (synth.speaking && !synth.paused) {
        synth.pause();
        isPaused = true;
        actualizarEstadoTTS('pausado');
        mostrarNotificacion('Lectura pausada');
    }
}

function reanudarTTS() {
    const indiceActual = currentSentenceIndex;
    isPaused = false;
    isReading = true;
    // Reanudar motor XTTS/Edge: el audioActual sigue siendo válido, solo resumirlo
    if (typeof audioActual !== 'undefined' && audioActual && audioActual.paused && audioActual.src) {
        actualizarEstadoTTS('reproduciendo');
        audioActual.play();
        return;
    }
    // Chrome tiene un bug con synth.resume() — relanzar desde la oración actual
    synth.cancel();
    setTimeout(() => {
        currentSentenceIndex = indiceActual;
        actualizarEstadoTTS('reproduciendo');
        // Usar el motor correcto según configuración activa (igual que iniciarTTS)
        if (typeof _usarServidorLive !== 'undefined' && _usarServidorLive &&
            typeof servidorTTSDisponible !== 'undefined' && servidorTTSDisponible) {
            leerOracionLocal(indiceActual);
        } else {
            leerOracion(indiceActual);
        }
    }, 150);
}

// Detiene el audio activo sin tocar isReading/isPaused/currentSentenceIndex ni la UI.
// Usado por seek — el llamador restaura el estado y llama actualizarEstadoTTS él mismo.
function detenerTTSSinEstado() {
    _ttsSessionToken++;
    _limpiarTTSCache();
    if (audioActual) {
        audioActual.pause();
        audioActual.src = '';
        audioActual.load();
        audioActual = null;
    }
    if (_ttsCurrentUrl) {
        URL.revokeObjectURL(_ttsCurrentUrl);
        _ttsCurrentUrl = null;
    }
    synth.cancel();
    if (typeof detenerSmartRot === 'function') detenerSmartRot();
}

function detenerTTS() {
    // Invalidar cualquier onended pendiente antes de detener
    _ttsSessionToken++;

    // Limpiar cache de pre-fetch (libera URLs de objeto pendientes en background)
    _limpiarTTSCache();

    // Detener audio local si existe
    if (audioActual) {
        audioActual.pause();
        audioActual.currentTime = 0;
        // Limpiar src ANTES de nullear para que el navegador no siga intentando
        // cargar el blob URL después de que sea revocado (evita ERR_FILE_NOT_FOUND)
        audioActual.src = '';
        audioActual.load();
        audioActual = null;
    }
    // Revocar la URL del audio que estaba sonando (si onended no lo hizo ya)
    if (_ttsCurrentUrl) {
        URL.revokeObjectURL(_ttsCurrentUrl);
        _ttsCurrentUrl = null;
    }

    // Detener TTS del navegador
    synth.cancel();

    isReading = false;
    isPaused = false;
    currentSentenceIndex = 0;
    actualizarEstadoTTS('detenido');
    // ── Detener rotación inteligente de imágenes ──
    if (typeof detenerSmartRot === 'function') detenerSmartRot();
    if (typeof limpiarReaderBg === 'function') limpiarReaderBg();
    document.getElementById('progress-fill').style.width = '0%';
    // Quitar resaltado
    document.querySelectorAll('.tts-sentence').forEach(el => el.classList.remove('tts-active'));
}

// Avanza automáticamente al siguiente capítulo al terminar el actual
// Solo actúa si estamos en modo video (videoActive) y el toggle "auto-next-chapter" está activado
async function _avanzarSiguienteCapituloAuto() {
    // Respetar el toggle de ajustes
    const toggleEl = document.getElementById('auto-next-chapter');
    if (toggleEl && !toggleEl.checked) {
        mostrarNotificacion('✓ Capítulo finalizado');
        return;
    }

    const sel = document.getElementById('chapters');
    if (!sel) { mostrarNotificacion('✓ Lectura finalizada'); return; }

    const opts = Array.from(sel.options).filter(o => !o.disabled && o.value);
    const rutaCapituloActual = sel.value;
    const idx = opts.findIndex(o => o.value === rutaCapituloActual);
    if (idx < 0 || idx >= opts.length - 1) {
        mostrarNotificacion('✓ Lectura completada');
        return;
    }

    // Solo avanzar automáticamente si estamos en modo video
    const enModoVideo = typeof videoActive !== 'undefined' && videoActive;
    if (!enModoVideo) {
        mostrarNotificacion('✓ Capítulo finalizado');
        return;
    }

    // Buscar el siguiente capítulo con contenido textual real (saltear vacíos)
    let siguienteIdx = idx + 1;
    let siguienteRuta = null;
    while (siguienteIdx < opts.length) {
        const ruta = opts[siguienteIdx].value;
        // Verificar si el capítulo tiene texto real
        let tieneContenido = false;
        if (typeof archivosHTML !== 'undefined' && archivosHTML[ruta]) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(archivosHTML[ruta], 'text/html');
                const cuerpo = doc.body.cloneNode(true);
                cuerpo.querySelectorAll('script,style,nav,header,footer').forEach(e => e.remove());
                const textoRaw = cuerpo.textContent.trim();
                tieneContenido = textoRaw.length > 80; // más de 80 chars = capítulo real
            } catch (e) { tieneContenido = true; } // si hay error, intentar de todos modos
        } else {
            tieneContenido = true; // no podemos verificar, asumir que tiene contenido
        }
        if (tieneContenido) {
            siguienteRuta = ruta;
            break;
        }
        console.log(`[autoNext] Capítulo vacío saltado: ${opts[siguienteIdx].text}`);
        siguienteIdx++;
    }

    if (!siguienteRuta) {
        mostrarNotificacion('✓ Lectura completada');
        return;
    }

    mostrarNotificacion('▶ Cargando siguiente capítulo...');

    // Actualizar el selector
    window._cargandoProgramaticamente = true;
    sel.value = siguienteRuta;
    window._cargandoProgramaticamente = false;

    // Actualizar título en header, visor, chip del selector colapsado e índice
    const optSig = opts[siguienteIdx];
    if (optSig) {
        const label = optSig.textContent.trim();
        const titleEl = document.getElementById('current-chapter-title');
        if (titleEl) titleEl.textContent = label;
        const capEl = document.getElementById('kp-chapter');
        if (capEl) capEl.textContent = label;
        // Actualizar el chip del selector colapsado
        const chipText = document.getElementById('chapter-active-chip-text');
        if (chipText) chipText.textContent = label;
    }
    if (typeof actualizarIndicevideo === 'function') actualizarIndicevideo();

    // Cargar y reproducir — marcar como navegación intencional para auto-play
    window._navegacionIntencionada = true;
    await cargarCapitulo(siguienteRuta);
}