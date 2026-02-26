// ═══════════════════════════════════════
// TTS — Motor completo: browser SpeechSynthesis + API local XTTS v2 + grabación
// Depende de: main.js (sentences, currentSentenceIndex, isReading, etc.)
//             player.js (ambientGainNode, getAudioCtx)
// ═══════════════════════════════════════

// ─── MOTOR TTS — API LOCAL (XTTS v2) ───
async function verificarServidorTTS() {
    try {
        const response = await fetch(`${TTS_API_URL}/health`, {
            method: 'GET',
            timeout: 2000
        });

        if (response.ok) {
            const data = await response.json();
            servidorTTSDisponible = true;
            console.log('✅ Servidor TTS local disponible:', data);
            mostrarNotificacion('🎤 TTS Local (XTTS v2) disponible');
            return true;
        }
    } catch (error) {
        servidorTTSDisponible = false;
        console.log('ℹ️ Servidor TTS local no disponible, usando TTS del navegador');
    }
    return false;
}

// Generar audio usando la API local
async function generarAudioLocal(texto) {
    try {
        const response = await fetch(`${TTS_API_URL}/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: texto,
                language: 'es'
            })
        });

        if (!response.ok) {
            throw new Error('Error en la respuesta del servidor TTS');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        return audioUrl;
    } catch (error) {
        console.error('Error al generar audio local:', error);
        mostrarNotificacion('⚠️ Error en TTS local, usando TTS del navegador');
        servidorTTSDisponible = false;
        return null;
    }
}

// Reproducir audio con la API local
async function leerOracionLocal(index) {
    if (index >= sentences.length) {
        detenerTTS();
        mostrarNotificacion('Lectura completada');
        return;
    }

    currentSentenceIndex = index;
    actualizarProgreso();
    if (typeof actualizarSlideAI === 'function') actualizarSlideAI(index);

    const texto = sentences[index];
    mostrarNotificacion(`Generando audio ${index + 1}/${sentences.length}...`);

    const audioUrl = await generarAudioLocal(texto);

    if (!audioUrl) {
        // Fallback al TTS del navegador
        leerOracion(index);
        return;
    }

    audioActual = new Audio(audioUrl);

    // Aplicar configuración de volumen
    audioActual.volume = parseFloat(document.getElementById('volume-control').value) / 100;

    // Capturar el token de sesión actual: si detenerTTS() se llama antes de que este
    // callback dispare, el token habrá cambiado y el onended no hará nada (evita race condition)
    const miSesionTTS = _ttsSessionToken;
    audioActual.onended = function () {
        URL.revokeObjectURL(audioUrl);
        // Verificar que la sesión TTS sigue siendo la misma (no se llamó detenerTTS() entretanto)
        if (miSesionTTS !== _ttsSessionToken) return;
        if (isReading && !isPaused) {
            const next = index + 1;
            if (next >= sentences.length) {
                detenerTTS();
                _avanzarSiguienteCapituloAuto();
            } else {
                leerOracionLocal(next);
            }
        }
    };

    audioActual.onerror = function (e) {
        console.error('Error al reproducir audio:', e);
        URL.revokeObjectURL(audioUrl);
        // Fallback al TTS del navegador
        leerOracion(index);
    };

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
    if (defaultVoice) {
        voiceSelect.value = voices.indexOf(defaultVoice);
    }
}

// Inicializar voces
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = cargarVoces;
}
cargarVoces();

// Controles de TTS
document.getElementById('rate-control').addEventListener('input', function (e) {
    document.getElementById('rate-value').textContent = e.target.value;
});

document.getElementById('pitch-control').addEventListener('input', function (e) {
    document.getElementById('pitch-value').textContent = e.target.value;
});

document.getElementById('volume-control').addEventListener('input', function (e) {
    document.getElementById('volume-value').textContent = e.target.value;
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

    // Limpiar: quitar espacios y comillas sueltas al inicio (preservar — de diálogo)
    return todasLasOraciones
        .map(o => o.trim().replace(/^[\s\u2018\u2019\u201C\u201D\u00AB\u00BB\'\u2013-]+/, '').trimStart())
        .filter(o => o.length > 0);
}

// ─── TTS ENGINE — estado, progreso, highlight ───
function actualizarEstadoTTS(estado) {
    const statusEl = document.getElementById('tts-status');
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');
    const btnStop = document.getElementById('btn-stop');

    switch (estado) {
        case 'reproduciendo':
            statusEl.textContent = '🔊 Reproduciendo...';
            statusEl.className = 'tts-status speaking';
            btnPlay.disabled = false;
            btnPlay.textContent = '⏸';
            btnStop.disabled = false;
            break;
        case 'pausado':
            statusEl.textContent = '⏸️ En pausa';
            statusEl.className = 'tts-status';
            btnPlay.disabled = false;
            btnPlay.textContent = '▶';
            btnStop.disabled = false;
            break;
        case 'detenido':
            statusEl.textContent = '⏹️ Detenido';
            statusEl.className = 'tts-status';
            btnPlay.disabled = false;
            btnPlay.textContent = '▶';
            btnStop.disabled = true;
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
    if (index >= sentences.length) {
        detenerTTS();
        mostrarNotificacion('Lectura completada');
        return;
    }

    currentSentenceIndex = index;
    actualizarProgreso();
    resaltarOracion(index);
    if (typeof actualizarSlideAI === 'function') actualizarSlideAI(index);

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

function iniciarTTS() {
    const contenido = document.getElementById('texto-contenido');
    const texto = contenido.textContent.trim();

    if (!texto || texto === 'Aquí aparecerá el contenido del capítulo seleccionado...') {
        mostrarNotificacion('⚠ No hay texto para leer');
        return;
    }

    // Detener cualquier lectura anterior
    detenerTTS();

    sentences = dividirEnOraciones(texto);
    currentSentenceIndex = 0;
    isReading = true;
    isPaused = false;

    // Envolver cada oración en un <span> para poder resaltarla
    envolverOracionesEnSpans(contenido, sentences);

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

    // Usar API local si está disponible
    if (servidorTTSDisponible) {
        mostrarNotificacion('🎤 Usando TTS Local (XTTS v2)');
        leerOracionLocal(0);
    } else {
        mostrarNotificacion('🔊 Usando TTS del navegador');
        leerOracion(0);
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
    if (servidorTTSDisponible && audioActual) {
        // Pausar audio local
        if (!audioActual.paused) {
            audioActual.pause();
            isPaused = true;
            actualizarEstadoTTS('pausado');
            mostrarNotificacion('Lectura pausada');
        }
    } else if (synth.speaking && !synth.paused) {
        // Pausar TTS del navegador
        synth.pause();
        isPaused = true;
        actualizarEstadoTTS('pausado');
        mostrarNotificacion('Lectura pausada');
    }
}

function reanudarTTS() {
    if (servidorTTSDisponible && audioActual) {
        if (audioActual.paused) {
            audioActual.play();
            isPaused = false;
            actualizarEstadoTTS('reproduciendo');
        }
    } else {
        // Chrome tiene un bug con synth.resume() — relanzar desde la oración actual
        // Guardar índice ANTES de cancel() porque cancel() puede disparar onend
        const indiceActual = currentSentenceIndex;
        isPaused = false;
        isReading = true;
        synth.cancel();
        // Pequeño delay para que Chrome procese el cancel antes de hablar
        setTimeout(() => {
            currentSentenceIndex = indiceActual;
            actualizarEstadoTTS('reproduciendo');
            leerOracion(indiceActual);
        }, 150);
    }
}

function detenerTTS() {
    // Invalidar cualquier onended pendiente antes de detener
    _ttsSessionToken++;

    // Detener audio local si existe
    if (audioActual) {
        audioActual.pause();
        audioActual.currentTime = 0;
        audioActual = null;
    }

    // Detener TTS del navegador
    synth.cancel();

    isReading = false;
    isPaused = false;
    currentSentenceIndex = 0;
    actualizarEstadoTTS('detenido');
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

    const siguienteRuta = opts[idx + 1].value;

    // Solo avanzar automáticamente si estamos en modo video
    const enModoVideo = typeof videoActive !== 'undefined' && videoActive;
    if (!enModoVideo) {
        mostrarNotificacion('✓ Capítulo finalizado');
        return;
    }

    mostrarNotificacion('▶ Cargando siguiente capítulo...');

    // Actualizar el selector
    window._cargandoProgramaticamente = true;
    sel.value = siguienteRuta;
    window._cargandoProgramaticamente = false;

    // Actualizar título e índice en el visor
    const optSig = opts[idx + 1];
    if (optSig) {
        const titleEl = document.getElementById('current-chapter-title');
        if (titleEl) titleEl.textContent = optSig.textContent;
        const capEl = document.getElementById('kp-chapter');
        if (capEl) capEl.textContent = optSig.textContent;
    }
    if (typeof actualizarIndicevideo === 'function') actualizarIndicevideo();

    // Cargar y reproducir — marcar como navegación intencional para auto-play
    window._navegacionIntencionada = true;
    await cargarCapitulo(siguienteRuta);
}


// ═══════════════════════════════════════
// GRABACIÓN DE AUDIO (TTS + Música)
// ═══════════════════════════════════════

// GRABACIÓN DE AUDIO (TTS + Música)
// ═══════════════════════════════════════

let mediaRecorder = null;
let grabacionChunks = [];
let grabando = false;
let destinationNode = null;
let audioCtxGrab = null;

async function toggleGrabacion() {
    if (grabando) {
        detenerGrabacion();
    } else {
        iniciarGrabacion();
    }
}

async function iniciarGrabacion() {
    try {
        // Crear AudioContext compartido para mezclar TTS + música
        audioCtxGrab = getAudioCtx();

        const dest = audioCtxGrab.createMediaStreamDestination();
        destinationNode = dest;

        // Conectar música ambiental al stream de grabación
        // Guard: ambientGainNode puede ser null si player.js no cargó o no hay música activa
        if (typeof ambientGainNode !== 'undefined' && ambientGainNode) {
            ambientGainNode.connect(dest);
        }

        // Para TTS del navegador necesitamos capturar el audio del sistema
        // Usamos un approach mixto: capturamos pantalla con audio del sistema
        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: false,
                audio: { systemAudio: 'include' }
            });
            // Mezclar con la música del AudioContext
            const sysSource = audioCtxGrab.createMediaStreamSource(stream);
            sysSource.connect(dest);
        } catch (e) {
            // Fallback: solo audio del AudioContext (música sin TTS si no hay permiso)
            stream = dest.stream;
            mostrarNotificacion('⚠ Solo se grabará la música (permite audio del sistema para incluir voz)');
        }

        // Combinar streams
        const tracks = [...dest.stream.getTracks()];
        if (stream && stream.getAudioTracks) {
            stream.getAudioTracks().forEach(t => tracks.push(t));
        }
        const combinedStream = new MediaStream(tracks);

        grabacionChunks = [];
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) grabacionChunks.push(e.data); };
        mediaRecorder.onstop = descargarAudio;
        mediaRecorder.start(100);

        grabando = true;
        const btn = document.getElementById('btn-rec-audio');
        btn.classList.add('recording');
        btn.querySelector('#rec-dot').textContent = '⏹';
        btn.childNodes[1].textContent = ' Detener grabación';
        mostrarNotificacion('🔴 Grabando...');

    } catch (e) {
        console.error('Error al iniciar grabación:', e);
        mostrarNotificacion('⚠ Error al iniciar grabación');
    }
}

function detenerGrabacion() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    grabando = false;
    const btn = document.getElementById('btn-rec-audio');
    btn.classList.remove('recording');
    btn.querySelector('#rec-dot').textContent = '⏺';
    btn.childNodes[1].textContent = ' Grabar audio';
    mostrarNotificacion('💾 Procesando audio...');
}

function descargarAudio() {
    const blob = new Blob(grabacionChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const capitulo = document.getElementById('current-chapter-title').textContent || 'lectura';
    a.download = `${capitulo.replace(/[^a-zA-Z0-9]/g, '_')}_audio.webm`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion('✓ Audio descargado');
}