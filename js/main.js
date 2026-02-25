// Variables globales
let archivoEPUB = null;
let archivosHTML = {};
let synth = window.speechSynthesis;
let utterance = null;
let isPaused = false;
let textoActual = '';
let posicionActual = 0;

// Variables TTS
let voices = [];
let isReading = false;
let currentSentenceIndex = 0;
let sentences = [];

// Variables TTS API Local
let usarAPILocal = false;
let servidorTTSDisponible = false;
const TTS_API_URL = 'http://localhost:5000';
let audioActual = null;

// Token de sesión TTS: se incrementa en detenerTTS() para invalidar callbacks onended pendientes
let _ttsSessionToken = 0;

// Diccionario de reemplazos — cargado desde localStorage, sin valores predeterminados
const reemplazosAutomaticos = JSON.parse(localStorage.getItem('reemplazos_custom') || '{}');

// Variable para controlar traducción automática
let traduccionAutomatica = false;

// ═══════════════════════════════════════════════
// CACHE DE PRE-TRADUCCIÓN DEL SIGUIENTE CAPÍTULO
// Traduce en segundo plano mientras se lee el actual
// ═══════════════════════════════════════════════
const _capCache = {};          // ruta → texto traducido y procesado
let _capCacheEnCurso = null;   // ruta que se está pre-traduciendo ahora

// Token de cancelación para el BG: si cambia, el proceso activo se aborta
let _bgCancelToken = 0;

async function _preTradducirCapitulo(ruta) {
    if (!ruta || !archivosHTML[ruta]) return;
    if (_capCache[ruta]) return;                 // ya en cache, nada que hacer

    // Cancelar cualquier BG anterior e iniciar uno nuevo
    _bgCancelToken++;
    const miToken = _bgCancelToken;
    _capCacheEnCurso = ruta;

    const nombre = ruta.split('/').pop();

    // Capturar estado AL INICIO para validación posterior
    const estadoTraduccion = traduccionAutomatica;
    const estadoHumanizador = ttsHumanizerActivo && !!claudeApiKey;

    // Si no hay nada que hacer en BG, salir
    if (!estadoTraduccion && !estadoHumanizador) {
        _capCacheEnCurso = null;
        return;
    }

    console.log(`📦 [BG] Iniciando pre-proceso: ${nombre} (trad:${estadoTraduccion} opt:${estadoHumanizador})`);

    try {
        // Extraer texto del HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(archivosHTML[ruta], 'text/html');
        const body = doc.body.cloneNode(true);
        body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
        body.querySelectorAll('a[href*="index_split"]').forEach(el => {
            const parent = el.parentElement;
            if (parent && parent.tagName === 'P') parent.remove();
        });

        let texto = '';
        const _BLOQUES_BG = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'LI']);
        body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote, li').forEach(el => {
            if (Array.from(el.children).some(c => _BLOQUES_BG.has(c.tagName))) return;
            const t = (el.textContent || '').trim();
            if (t.length > 0) {
                texto += (el.tagName.startsWith('H') ? '\n\n' + t + '\n\n' : t + '\n\n');
            }
        });
        texto = texto.replace(/\n\n\n+/g, '\n\n').trim();
        if (texto.length < 50) return;

        // Abortar si fue cancelado
        if (miToken !== _bgCancelToken) { console.log(`[BG] Cancelado: ${nombre}`); return; }

        _traduccionEnBackground = true;
        try {
            // Fase 1+2: Traducción y revisión
            if (estadoTraduccion) {
                console.log(`📦 [BG] Traduciendo: ${nombre}`);
                texto = await traducirTexto(texto);
                if (miToken !== _bgCancelToken) return;
            }

            // Fase 3: Optimización con IA
            if (estadoHumanizador) {
                console.log(`✨ [BG] Optimizando: ${nombre}`);
                texto = await naturalizarTextoParaTTS(texto);
                if (miToken !== _bgCancelToken) return;
            }
        } finally {
            _traduccionEnBackground = false;
        }

        texto = aplicarReemplazosAutomaticos(texto);
        _capCache[ruta] = { texto, traducida: estadoTraduccion, humanizada: estadoHumanizador };
        console.log(`✅ [BG] Cache listo: ${nombre} (trad:${estadoTraduccion} opt:${estadoHumanizador})`);

    } catch (e) {
        console.warn(`[BG] Pre-procesamiento falló para ${nombre}:`, e);
    } finally {
        if (miToken === _bgCancelToken) _capCacheEnCurso = null;
    }
}

function _getSiguienteRuta(rutaActual) {
    const sel = document.getElementById('chapters');
    if (!sel) return null;
    const opts = Array.from(sel.options).filter(o => !o.disabled && o.value);
    const idx = opts.findIndex(o => o.value === rutaActual);
    return idx >= 0 && idx < opts.length - 1 ? opts[idx + 1].value : null;
}

// Limpiar entradas viejas del cache (mantener solo los 3 más recientes)
function _limpiarCache(rutaActual) {
    const keys = Object.keys(_capCache);
    if (keys.length > 3) {
        keys.filter(k => k !== rutaActual).slice(0, keys.length - 3)
            .forEach(k => delete _capCache[k]);
    }
}

// ======================
// FUNCIONES TTS
// ======================

// Verificar si el servidor TTS local está disponible
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

// Cargar voces disponibles
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
            btnPlay.disabled = true;
            btnPause.disabled = false;
            btnResume.disabled = true;
            btnStop.disabled = false;
            break;
        case 'pausado':
            statusEl.textContent = '⏸️ En pausa';
            statusEl.className = 'tts-status';
            btnPlay.disabled = true;
            btnPause.disabled = true;
            btnResume.disabled = false;
            btnStop.disabled = false;
            break;
        case 'detenido':
            statusEl.textContent = '⏹️ Detenido';
            statusEl.className = 'tts-status';
            btnPlay.disabled = false;
            btnPause.disabled = true;
            btnResume.disabled = true;
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
    utterance.volume = parseFloat(document.getElementById('volume-control').value) / 100;

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

    oraciones.forEach((oracion, i) => {
        const texto = oracion.trim();
        if (!texto) return;
        const idx = html.indexOf(texto);
        if (idx === -1) return;
        html = html.slice(0, idx)
            + `<span class="tts-sentence" id="tts-s-${i}">${texto}</span>`
            + html.slice(idx + texto.length);
    });

    contenedor.innerHTML = html;
}

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
// Solo actúa si estamos en modo video (videoActive) y hay capítulo siguiente en cache o disponible
async function _avanzarSiguienteCapituloAuto() {
    const sel = document.getElementById('chapters');
    if (!sel) { mostrarNotificacion('✓ Lectura finalizada'); return; }

    const opts = Array.from(sel.options).filter(o => !o.disabled && o.value);
    // Capturar el valor ACTUAL del selector en este momento (antes de cualquier await)
    // para evitar que una navegación paralela cambie sel.value y calcule el índice mal
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

// ======================
// FUNCIONES GENERALES
// ======================

// ======================
// HUMANIZADOR TTS CON CLAUDE
// Post-procesa el texto traducido para que suene más natural al ser leído por TTS
// Soporta múltiples proveedores de IA con su propia API key
// ======================

let ttsHumanizerActivo = false;
let claudeApiKey = localStorage.getItem('claude_api_key') || '';  // clave del proveedor activo

// Configuración de proveedores de IA
const HUMANIZER_PROVIDERS = {
    perplexity: {
        name: 'Perplexity AI',
        url: 'https://api.perplexity.ai/chat/completions',
        model: 'sonar',
        keyPrefix: 'pplx-',
        keyHint: 'pplx-...',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => ({
            model: 'sonar',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        }),
        extract: (data) => data.choices?.[0]?.message?.content?.trim()
    },
    openai: {
        name: 'OpenAI',
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        keyPrefix: 'sk-',
        keyHint: 'sk-...',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => ({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        }),
        extract: (data) => data.choices?.[0]?.message?.content?.trim()
    },
    anthropic: {
        name: 'Anthropic (Claude)',
        url: 'https://api.anthropic.com/v1/messages',
        model: 'claude-haiku-4-5-20251001',
        keyPrefix: 'sk-ant-',
        keyHint: 'sk-ant-...',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        }),
        body: (prompt) => ({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        }),
        extract: (data) => data.content?.[0]?.text?.trim()
    },
    gemini: {
        name: 'Google Gemini',
        url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        model: 'gemini-2.0-flash',
        keyPrefix: 'AIza',
        keyHint: 'AIza...',
        headers: () => ({ 'Content-Type': 'application/json' }),
        body: (prompt) => ({
            contents: [{ parts: [{ text: prompt }] }]
        }),
        extract: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    },
    groq: {
        name: 'Groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
        keyPrefix: 'gsk_',
        keyHint: 'gsk_...',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => ({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        }),
        extract: (data) => data.choices?.[0]?.message?.content?.trim()
    },
    openrouter: {
        name: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'auto',
        keyPrefix: 'sk-or-',
        keyHint: 'sk-or-...',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'EPUB Reader TTS'
        }),
        body: (prompt) => ({
            model: 'mistralai/mistral-small',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        }),
        extract: (data) => data.choices?.[0]?.message?.content?.trim()
    }
};

let humanizerProvider = localStorage.getItem('humanizer_provider') || 'perplexity';

function cambiarProveedorHumanizer(provId) {
    humanizerProvider = provId;
    localStorage.setItem('humanizer_provider', provId);
    // Cargar la key guardada para este proveedor
    const savedKey = localStorage.getItem(`humanizer_key_${provId}`) || '';
    claudeApiKey = savedKey;
    const statusEl = document.getElementById('claude-key-status');
    const infoEl = document.getElementById('humanizer-info');
    const prov = HUMANIZER_PROVIDERS[provId];
    if (statusEl) statusEl.textContent = savedKey ? '✓ guardada' : '';
    if (infoEl) infoEl.textContent = savedKey
        ? `${prov.name} · ${prov.model} · listo`
        : `Necesita API key de ${prov.name} · ${prov.keyHint}`;
}

function guardarClaudeApiKey() {
    const key = document.getElementById('claude-api-key').value.trim();
    if (!key) { document.getElementById('claude-key-status').textContent = '⚠ vacía'; return; }
    claudeApiKey = key;
    localStorage.setItem('claude_api_key', key);  // compatibilidad
    localStorage.setItem(`humanizer_key_${humanizerProvider}`, key);
    document.getElementById('claude-api-key').value = '';
    document.getElementById('claude-key-status').textContent = '✓ guardada';
    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    document.getElementById('humanizer-info').textContent = `${prov.name} · ${prov.model} · listo`;
    if (ttsHumanizerActivo) {
        document.getElementById('humanizer-status').textContent = `✓ activo · ${prov.name}`;
    }
    setTimeout(() => { document.getElementById('claude-key-status').textContent = ''; }, 2000);
}

function toggleTTSHumanizer() {
    ttsHumanizerActivo = document.getElementById('tts-humanizer').checked;
    const panel = document.getElementById('claude-key-panel');
    const status = document.getElementById('humanizer-status');
    panel.style.display = ttsHumanizerActivo ? 'block' : 'none';
    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    if (ttsHumanizerActivo) {
        claudeApiKey = localStorage.getItem(`humanizer_key_${humanizerProvider}`) || claudeApiKey;
        status.textContent = claudeApiKey ? `⏳ activo · ${prov.name} (pendiente)` : `⚠ necesita API key`;
        if (claudeApiKey) document.getElementById('claude-key-status').textContent = '✓ guardada';
        const sel = document.getElementById('humanizer-provider');
        if (sel) sel.value = humanizerProvider;
    } else {
        status.textContent = 'Desactivado';
    }
    // Marcar como pendiente para que requiera Aplicar
    marcarCambioPendiente();
}

// Inicializar al cargar
(function initHumanizer() {
    humanizerProvider = localStorage.getItem('humanizer_provider') || 'perplexity';
    claudeApiKey = localStorage.getItem(`humanizer_key_${humanizerProvider}`)
        || localStorage.getItem('claude_api_key') || '';
    setTimeout(() => {
        const sel = document.getElementById('humanizer-provider');
        if (sel) sel.value = humanizerProvider;
        if (claudeApiKey) {
            const el = document.getElementById('claude-key-status');
            if (el) el.textContent = '✓ guardada';
        }
    }, 500);
})();

// Divide texto en bloques de ~2500 chars cortando en párrafos
function _dividirEnBloques(texto, maxChars = 2500) {
    const parrafos = texto.split(/\n\n+/);
    const bloques = [];
    let actual = '';
    for (const p of parrafos) {
        if ((actual + '\n\n' + p).length > maxChars && actual.length > 0) {
            bloques.push(actual.trim());
            actual = p;
        } else {
            actual += (actual ? '\n\n' : '') + p;
        }
    }
    if (actual.trim()) bloques.push(actual.trim());
    return bloques;
}

const HUMANIZER_PROMPT_TEMPLATE = (bloque) =>
    `SOLO devuelve la versión TTS optimizada del texto. NADA más: sin introducciones, sin "Cambios realizados", sin listas, sin explicaciones, sin citas [1], sin resúmenes. Mantén 100% el contenido original exacto (palabras, trama, diálogos). Solo ajusta puntuación/gramática para TTS natural:
- Puntos (.) para pausas cortas; comas (,) respiraciones; guiones (—) diálogos/incisos.
- Elimina *, #, /, [], (), ... excesivos. Números a palabras (ej: [1579/6000] → mil quinientos setenta y nueve de seis mil).
- Divide oraciones largas; usa contracciones; varía ritmos.
- Diálogos con — sin comillas.
Texto:
${bloque}`;

// Limpieza local de símbolos problemáticos para TTS — se aplica SIEMPRE,
// independientemente del naturalizado IA, como primera y última línea de defensa
function _sanitizarParaTTS(texto) {
    return texto
        // Títulos markdown: **texto** → texto (sin asteriscos)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Almohadillas de encabezado
        .replace(/^#{1,6}\s+/gm, '')
        // Comillas dobles en diálogos → guión largo
        .replace(/"([^"]+)"/g, '—$1')
        // Comillas tipográficas dobles → guión largo
        .replace(/\u201C([^\u201D]+)\u201D/g, '—$1')
        // Comillas simples tipográficas que abren frase → coma o nada
        .replace(/\u2018([^\u2019]+)\u2019/g, '$1')
        // Barras y pipes sueltos problemáticos
        .replace(/ \| /g, ', ')
        // Guiones bajos (énfasis markdown)
        .replace(/_([^_]+)_/g, '$1')
        // Múltiples asteriscos sueltos
        .replace(/\*+/g, '')
        // Espacios dobles
        .replace(/  +/g, ' ')
        // Líneas vacías múltiples → doble salto
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Llama al proveedor de IA seleccionado para naturalizar un bloque
async function _naturalizarBloque(bloque) {
    // Siempre sanitizar localmente primero (quita asteriscos, comillas, etc.)
    const bloqueClean = _sanitizarParaTTS(bloque);
    if (!claudeApiKey) return bloqueClean;  // sin key: al menos devolver sanitizado

    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    if (!prov) return bloqueClean;

    try {
        const prompt = HUMANIZER_PROMPT_TEMPLATE(bloqueClean);
        const urlFn = typeof prov.url === 'function' ? prov.url(claudeApiKey) : prov.url;

        const res = await fetch(urlFn, {
            method: 'POST',
            headers: prov.headers(claudeApiKey),
            body: JSON.stringify(prov.body(prompt))
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn(`${prov.name} error:`, err?.error?.message || res.status);
            return bloqueClean;  // fallback: al menos devolver sanitizado
        }
        const data = await res.json();
        const resultado = prov.extract(data) || bloqueClean;
        // Sanitizar también el resultado por si la IA introdujo markdown
        return _sanitizarParaTTS(resultado);
    } catch (e) {
        console.warn('Humanizador falló:', e.message);
        return bloqueClean;
    }
}

// Humaniza el texto completo dividiendo en bloques y procesando en paralelo (máx 3 a la vez)
async function naturalizarTextoParaTTS(texto, onProgreso) {
    if (!ttsHumanizerActivo || !claudeApiKey || !texto) return texto;

    const bloques = _dividirEnBloques(texto);
    const total = bloques.length;
    const resultados = new Array(total);
    let procesados = 0;

    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    console.log(`✨ Naturalizando ${total} bloque(s) con ${claudeApiKey ? (prov?.name || humanizerProvider) : 'sanitizador local'}...`);

    // Procesar en lotes de 3 para no saturar la API
    const LOTE = 3;
    for (let i = 0; i < total; i += LOTE) {
        const lote = bloques.slice(i, i + LOTE);
        const promesas = lote.map((b, j) =>
            _naturalizarBloque(b).then(r => {
                resultados[i + j] = r;
                procesados++;
                if (onProgreso) onProgreso(procesados, total);
            })
        );
        await Promise.all(promesas);
    }

    return resultados.join('\n\n');
}

// Función para aplicar reemplazos automáticos
// Limpieza silenciosa de referencias a URLs/dominios
function limpiarURLs(texto) {
    // Captura cualquier texto (sin espacios) seguido de ".com", ".net", ".org", etc.
    // con o sin espacio/caracter antes del punto, y cualquier path o query que siga
    return texto.replace(/\S*\s*\.\s*(?:com|net|org|io|co|ar|es|edu|gov|info|biz|tv|me|app)\b[^\s]*/gi, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function aplicarReemplazosAutomaticos(texto) {
    let textoModificado = texto;
    for (const [buscar, reemplazar] of Object.entries(reemplazosAutomaticos)) {
        try {
            // Usar 'gi' para que matchee independientemente de mayúsculas/minúsculas
            const regex = new RegExp(buscar, 'gi');
            textoModificado = textoModificado.replace(regex, (match) => {
                // Preservar capitalización: si el match empieza con mayúscula, capitalizar el reemplazo
                if (match.charAt(0) === match.charAt(0).toUpperCase() && match.charAt(0) !== match.charAt(0).toLowerCase()) {
                    return reemplazar.charAt(0).toUpperCase() + reemplazar.slice(1);
                }
                // Si el match es todo mayúsculas, poner el reemplazo todo en mayúsculas
                if (match === match.toUpperCase()) {
                    return reemplazar.toUpperCase();
                }
                return reemplazar;
            });
        } catch (e) { /* regex inválida, saltar */ }
    }
    return textoModificado;
}

// Renderiza texto plano en el contenedor usando <p> por cada párrafo
// Usa innerHTML en lugar de textContent para respetar los saltos de párrafo
function renderizarTextoEnContenedor(el, texto) {
    if (!el || !texto) return;
    el.textContent = texto.trim();
}

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// Barra de progreso para traducción
// _traduccionEnBackground: si true, no actualizar UI (pre-traducción silenciosa)
let _traduccionEnBackground = false;

function actualizarProgresoTraduccion(actual, total) {
    if (_traduccionEnBackground) return; // silencioso en background

    // Si cargarCapitulo sobrescribió la función para controlar la escala, usar esa
    if (typeof window._overrideActualizarProgreso === 'function') {
        window._overrideActualizarProgreso(actual, total);
        return;
    }

    const pct = Math.round((actual / total) * 100);
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('tts-status-label');
    const pctEl = document.getElementById('tts-percent');
    if (fill) fill.style.width = pct + '%';
    if (label) label.innerHTML = `<span style="color:var(--accent2)">⟳</span> Traduciendo...`;
    if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.display = 'inline'; }

    // Mostrar progreso en el overlay del video
    const kWrap = document.getElementById('video-translation-progress');
    const kFill = document.getElementById('ktl-fill');
    const kPct = document.getElementById('ktl-pct');
    if (kWrap) kWrap.style.display = 'flex';
    if (kFill) kFill.style.width = pct + '%';
    if (kPct) kPct.textContent = pct + '%';
}

function finalizarProgresoTraduccion() {
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('tts-status-label');
    const pctEl = document.getElementById('tts-percent');
    if (fill) { fill.style.width = '100%'; setTimeout(() => { fill.style.width = '0%'; }, 1000); }
    if (label) label.textContent = '⏹ Sin reproducción';
    if (pctEl) { pctEl.textContent = '100%'; setTimeout(() => { pctEl.style.display = 'none'; }, 1200); }

    // Ocultar overlay de video
    const kWrap = document.getElementById('video-translation-progress');
    const kFill = document.getElementById('ktl-fill');
    if (kFill) kFill.style.width = '100%';
    if (kWrap) setTimeout(() => { kWrap.style.display = 'none'; }, 1200);
}

function mostrarProgresoRevision(msg) {
    var label = document.getElementById('tts-status-label');
    var fill = document.getElementById('progress-fill');
    var pctEl = document.getElementById('tts-percent');
    if (fill) fill.style.width = '100%';
    if (label) label.innerHTML = '<span style="color:var(--accent)">\uD83D\uDD0D</span> ' + msg;
    if (pctEl) { pctEl.textContent = ''; pctEl.style.display = 'none'; }
}

function esParrafoEnIngles(texto) {
    if (!texto || texto.trim().length < 15) return false;
    var marcadores = /\b(the|and|with|that|this|from|they|their|there|were|have|been|would|could|should|which|when|then|than|what|said|into|your|will|about|after|before|while|through|where|being|those|these|just|also|such|each|some|only|over|under|like|even|back|take|make|come|know|think|look|well|much|more|him|her|his|was|not|but|for|are)\b/gi;
    var palabras = texto.trim().split(/\s+/).filter(function (w) { return w.length > 2; });
    if (palabras.length < 4) return false;
    var hits = (texto.match(marcadores) || []).length;
    return (hits / palabras.length) > 0.15;
}

async function revisarYRetraducirTexto(texto) {
    if (!_traduccionEnBackground) mostrarProgresoRevision('Revisando traducción...');
    var parrafos = texto.split(/\n\n+/);
    var sinTraducir = 0;
    for (var i = 0; i < parrafos.length; i++) {
        var p = parrafos[i].trim();
        if (!p) continue;
        if (esParrafoEnIngles(p)) {
            sinTraducir++;
            if (!_traduccionEnBackground) mostrarProgresoRevision('Corrigiendo ' + sinTraducir + ' fragmento(s) sin traducir...');
            try {
                var ret = await traducirFragmento(p);
                if (ret && ret !== p && !esParrafoEnIngles(ret)) parrafos[i] = ret;
            } catch (e) { }
            await new Promise(function (r) { setTimeout(r, 200); });
        }
    }
    var msg = sinTraducir === 0
        ? 'Revisión completa ✓'
        : 'Revisión completa ✓ — ' + sinTraducir + ' fragmento(s) corregido(s)';
    if (!_traduccionEnBackground) {
        mostrarProgresoRevision(msg);
        await new Promise(function (r) { setTimeout(r, 1500); });
    }
    return parrafos.join('\n\n');
}


// Traducir texto usando MyMemory API (párrafo a párrafo)
async function traducirTexto(texto) {
    if (!texto || texto.trim().length === 0) return texto;

    // Separar en párrafos preservando estructura
    const parrafos = texto.split(/\n\n+/);
    const traducidos = [];
    const total = parrafos.filter(p => p.trim()).length;
    let contador = 0;

    for (let i = 0; i < parrafos.length; i++) {
        const parrafo = parrafos[i].trim();

        if (!parrafo) {
            traducidos.push('');
            continue;
        }

        contador++;
        actualizarProgresoTraduccion(contador, total);

        // Si el párrafo supera 490 chars, dividirlo en sub-fragmentos
        if (parrafo.length > 490) {
            const subFragmentos = dividirEnSubfragmentos(parrafo, 490);
            const subTraducidos = [];
            for (const sub of subFragmentos) {
                const t = await traducirFragmento(sub);
                subTraducidos.push(t);
                await new Promise(r => setTimeout(r, 250));
            }
            traducidos.push(subTraducidos.join(' '));
        } else {
            const t = await traducirFragmento(parrafo);
            traducidos.push(t);
        }

        // Pausa entre párrafos para no saturar la API (reducida para mayor velocidad)
        if (i < parrafos.length - 1) {
            await new Promise(r => setTimeout(r, 150));
        }
    }

    finalizarProgresoTraduccion();
    var textoFinal = traducidos.join('\n\n');

    // Paso de revisión: retraducir fragmentos que quedaron en inglés
    // En background esta revisión es silenciosa (no actualiza UI)
    textoFinal = await revisarYRetraducirTexto(textoFinal);

    // En background: retornar sin notificaciones ni auto-play
    if (_traduccionEnBackground) return textoFinal;

    mostrarNotificacion('✓ Traducción completada');
    // El auto-play y la continuación los gestiona cargarCapitulo() centralmente

    return textoFinal;
}

// Divide un texto largo en fragmentos sin cortar palabras a mitad
function dividirEnSubfragmentos(texto, maxChars) {
    const fragmentos = [];
    // Capturar oraciones con puntuación Y el resto sin puntuación al final
    const oraciones = texto.match(/[^.!?]+[.!?]+/g) || [];
    const ultimoIdx = oraciones.join('').length;
    const resto = texto.slice(ultimoIdx).trim();
    if (resto) oraciones.push(resto);

    // Si no se encontró ninguna oración, dividir por palabras
    if (oraciones.length === 0) {
        const palabras = texto.split(' ');
        let actual = '';
        for (const palabra of palabras) {
            if ((actual + ' ' + palabra).trim().length > maxChars && actual.length > 0) {
                fragmentos.push(actual.trim());
                actual = palabra;
            } else {
                actual += (actual ? ' ' : '') + palabra;
            }
        }
        if (actual.trim()) fragmentos.push(actual.trim());
        return fragmentos;
    }

    let actual = '';
    for (const oracion of oraciones) {
        // Si una sola oración ya supera el límite, dividirla por palabras
        if (oracion.length > maxChars) {
            if (actual.trim()) { fragmentos.push(actual.trim()); actual = ''; }
            const palabras = oracion.split(' ');
            let subActual = '';
            for (const palabra of palabras) {
                if ((subActual + ' ' + palabra).trim().length > maxChars && subActual.length > 0) {
                    fragmentos.push(subActual.trim());
                    subActual = palabra;
                } else {
                    subActual += (subActual ? ' ' : '') + palabra;
                }
            }
            if (subActual.trim()) fragmentos.push(subActual.trim());
        } else if ((actual + ' ' + oracion).trim().length > maxChars && actual.length > 0) {
            fragmentos.push(actual.trim());
            actual = oracion;
        } else {
            actual += (actual ? ' ' : '') + oracion;
        }
    }

    if (actual.trim()) fragmentos.push(actual.trim());
    return fragmentos;
}

async function traducirFragmento(fragmento, intentos = 3) {
    if (!fragmento || !fragmento.trim()) return fragmento;

    // Intentar primero con Google Translate (API no oficial, sin key)
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(fragmento)}`;
            const response = await fetch(gtUrl);
            if (response.ok) {
                const data = await response.json();
                if (data && data[0]) {
                    const traduccion = data[0]
                        .filter(item => item && item[0])
                        .map(item => item[0])
                        .join('');
                    if (traduccion && traduccion.trim()) {
                        return traduccion;
                    }
                }
            }
            break; // respuesta ok pero vacía, salir del loop
        } catch (e) {
            if (intento < intentos) {
                await new Promise(r => setTimeout(r, 400 * intento));
            } else {
                console.warn('Google Translate falló tras varios intentos, usando MyMemory...', e.message);
            }
        }
    }

    // Fallback: MyMemory API (con reintentos)
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(fragmento)}&langpair=en|es`;
            const response = await fetch(url);
            if (!response.ok) {
                if (intento < intentos) { await new Promise(r => setTimeout(r, 400 * intento)); continue; }
                return fragmento;
            }

            const data = await response.json();
            if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                const resultado = data.responseData.translatedText;
                // Solo descartar si es TODO mayúsculas Y tiene más de 3 palabras (señal real de error de API)
                const palabras = resultado.trim().split(/\s+/);
                if (palabras.length > 3 && resultado === resultado.toUpperCase() && fragmento !== fragmento.toUpperCase()) {
                    if (intento < intentos) { await new Promise(r => setTimeout(r, 500)); continue; }
                    return fragmento;
                }
                return resultado;
            }
            if (data.responseStatus === 429 || (data.responseDetails && data.responseDetails.includes('DAILY'))) {
                mostrarNotificacion('⚠️ Límite diario de traducción alcanzado');
                return fragmento;
            }
            if (intento < intentos) { await new Promise(r => setTimeout(r, 400 * intento)); continue; }
            return fragmento;
        } catch (error) {
            if (intento < intentos) {
                await new Promise(r => setTimeout(r, 400 * intento));
            } else {
                console.error('Error en traducción tras varios intentos:', error);
                return fragmento;
            }
        }
    }
    return fragmento;
}

// Toggle de traducción automática
// ── CONFIG PENDIENTE — los toggles NO aplican inmediatamente ──
// Los cambios se acumulan y solo se ejecutan al presionar "Aplicar"
let _configPendiente = false;

function marcarCambioPendiente() {
    _configPendiente = true;
    const row = document.getElementById('aplicar-row');
    if (row) row.style.display = 'block';

    // Mostrar/ocultar auto-play-row según estado del checkbox de traducción
    const traducChecked = document.getElementById('auto-translate').checked;
    const apRow = document.getElementById('auto-play-row');
    if (apRow) apRow.style.display = traducChecked ? 'flex' : 'none';

    // Actualizar translation-status con estado "pendiente"
    const statusEl = document.getElementById('translation-status');
    if (statusEl) {
        statusEl.textContent = traducChecked
            ? '⏳ Traducción activada (pendiente de aplicar)'
            : '⏳ Traducción desactivada (pendiente de aplicar)';
        statusEl.className = 'translation-status';
    }
}

async function aplicarConfiguracion() {
    const btn = document.getElementById('btn-aplicar');
    const hint = document.getElementById('aplicar-hint');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

    // Leer estado real de los checkboxes
    const nuevoTraducir = document.getElementById('auto-translate').checked;

    // Aplicar traducción
    traduccionAutomatica = nuevoTraducir;
    const statusEl = document.getElementById('translation-status');
    if (statusEl) {
        statusEl.textContent = nuevoTraducir
            ? '✓ Traducción automática activada (EN → ES)'
            : 'Traducción desactivada';
        statusEl.className = nuevoTraducir ? 'translation-status active' : 'translation-status';
    }

    // Actualizar status del humanizador
    const humStatus = document.getElementById('humanizer-status');
    if (humStatus) {
        const prov = HUMANIZER_PROVIDERS[humanizerProvider];
        humStatus.textContent = ttsHumanizerActivo
            ? (claudeApiKey ? `✓ activo · ${prov?.name}` : '⚠ necesita API key')
            : 'Desactivado';
    }

    // Invalidar cache para que recargue con la nueva configuración
    const selector = document.getElementById('chapters');
    if (selector && selector.value) {
        // Limpiar cache del capítulo actual para forzar reprocesado
        if (typeof _capCache !== 'undefined') delete _capCache[selector.value];
        await cargarCapitulo(selector.value);
    }

    // Ocultar botón
    _configPendiente = false;
    const row = document.getElementById('aplicar-row');
    if (row) row.style.display = 'none';
    if (btn) { btn.disabled = false; btn.textContent = '✓ Aplicar'; }
    if (hint) hint.textContent = 'Cambios pendientes — recarga el capítulo actual';
}

function toggleAutoTranslate() {
    // Solo marca como pendiente — NO recarga inmediatamente
    marcarCambioPendiente();
}

// Traducir texto actual
async function traducirTextoActual() {
    const textoActual = document.getElementById('texto-contenido').textContent;

    if (!textoActual || textoActual.trim().length === 0 ||
        textoActual === 'Aquí aparecerá el contenido del capítulo seleccionado...') {
        mostrarNotificacion('⚠ No hay texto para traducir');
        return;
    }

    // Advertir si el texto es muy largo
    const palabras = textoActual.trim().split(/\s+/).length;
    if (palabras > 1000) {
        const confirmacion = confirm(
            `Este texto tiene ${palabras} palabras. La traducción puede tardar varios minutos.\n\n` +
            `¿Deseas continuar?`
        );
        if (!confirmacion) {
            return;
        }
    }

    // Deshabilitar el botón durante la traducción
    const botonTraducir = document.querySelector('[onclick="traducirTextoActual()"]');
    if (botonTraducir) {
        botonTraducir.disabled = true;
        botonTraducir.textContent = 'Traduciendo...';
    }

    try {
        const textoTraducido = await traducirTexto(textoActual);

        if (textoTraducido && textoTraducido !== textoActual) {
            const textoFinal = aplicarReemplazosAutomaticos(textoTraducido);
            renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoFinal);
            actualizarEstadisticas();
            mostrarNotificacion('✓ Texto traducido al español');
        }
    } finally {
        if (botonTraducir) {
            botonTraducir.disabled = false;
            botonTraducir.textContent = 'Traducir Texto Actual';
        }
    }
}

// ======================
// CARGA DE ARCHIVOS EPUB
// ======================

// Cargar archivo EPUB
document.getElementById('epub-file').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.epub')) {
        mostrarNotificacion('⚠ Selecciona un archivo EPUB válido');
        return;
    }

    try {
        document.getElementById('file-name').textContent = 'Cargando...';
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        archivosHTML = {};
        const promesas = [];

        zip.forEach((rutaRelativa, archivo) => {
            if (rutaRelativa.match(/\.(html|xhtml)$/i) && !rutaRelativa.includes('nav.xhtml')) {
                promesas.push(
                    archivo.async('text').then(contenido => {
                        archivosHTML[rutaRelativa] = contenido;
                    })
                );
            }
        });

        await Promise.all(promesas);

        // Ordenar numéricamente extrayendo todos los números del nombre de archivo
        const archivosOrdenados = Object.keys(archivosHTML).sort((a, b) => {
            // Extraer secuencia de números del path completo para comparar
            const numA = a.match(/\d+/g);
            const numB = b.match(/\d+/g);
            if (numA && numB) {
                // Comparar de mayor a menor grupo numérico significativo
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    const nA = parseInt(numA[i] || 0);
                    const nB = parseInt(numB[i] || 0);
                    if (nA !== nB) return nA - nB;
                }
            }
            return a.localeCompare(b);
        });

        if (archivosOrdenados.length === 0) {
            throw new Error('No se encontraron capítulos en el EPUB');
        }

        const selector = document.getElementById('chapters');
        selector.innerHTML = '';

        archivosOrdenados.forEach((ruta, index) => {
            const option = document.createElement('option');
            option.value = ruta;

            const parser = new DOMParser();
            const doc = parser.parseFromString(archivosHTML[ruta], 'text/html');

            // Método mejorado para extraer el título del capítulo
            let titulo = null;

            // 1. Intentar obtener de <title>
            const titleElement = doc.querySelector('title');
            if (titleElement && titleElement.textContent.trim()) {
                titulo = titleElement.textContent.trim();
            }

            // 2. Intentar obtener del primer h1, h2 o h3
            if (!titulo) {
                const heading = doc.querySelector('h1, h2, h3');
                if (heading && heading.textContent.trim()) {
                    titulo = heading.textContent.trim();
                }
            }

            // 3. Buscar en el body cualquier texto que parezca un título
            if (!titulo) {
                const firstP = doc.querySelector('p');
                if (firstP && firstP.textContent.trim().length < 100) {
                    titulo = firstP.textContent.trim();
                }
            }

            // 4. Extraer del nombre del archivo si contiene información útil
            if (!titulo) {
                const nombreArchivo = ruta.split('/').pop().replace(/\.(html|xhtml)$/i, '');
                const match = nombreArchivo.match(/(\d+)|chapter|cap|ch/i);
                if (match) {
                    titulo = nombreArchivo.replace(/_/g, ' ').replace(/-/g, ' ');
                }
            }

            // 5. Usar número de capítulo como último recurso
            if (!titulo) {
                titulo = `Capítulo ${index + 1}`;
            }

            // Limpiar y formatear el título
            titulo = titulo
                .replace(/^\s*chapter\s*/i, 'Capítulo ')
                .replace(/^\s*cap\s*/i, 'Capítulo ')
                .replace(/^\s*ch\s*/i, 'Capítulo ')
                .trim();

            // Agregar número si no lo tiene
            if (!/\d/.test(titulo)) {
                option.textContent = `${index + 1}. ${titulo}`;
            } else {
                option.textContent = titulo;
            }

            selector.appendChild(option);
        });

        window._cargandoProgramaticamente = true;
        selector.selectedIndex = 0;
        window._cargandoProgramaticamente = false;

        document.getElementById('chapter-selector').style.display = 'block';
        document.getElementById('file-name').textContent = `${file.name} (${archivosOrdenados.length} capítulos)`;
        mostrarNotificacion('✓ EPUB cargado correctamente');

        if (archivosOrdenados.length > 0) {
            cargarCapitulo(archivosOrdenados[0]);
        }

    } catch (error) {
        console.error('Error al cargar EPUB:', error);
        document.getElementById('file-name').textContent = 'Error al cargar';
        mostrarNotificacion('⚠ Error al cargar EPUB: ' + error.message);
    }
});

// Cargar capítulo seleccionado
async function cargarCapitulo(ruta) {
    if (!ruta || !archivosHTML[ruta]) return;

    // Detener TTS si está activo
    detenerTTS();

    // Cancelar cualquier BG en curso (el nuevo capítulo necesita su propio BG luego)
    _bgCancelToken++;

    try {
        let textoCompleto;

        // ── Usar cache si está disponible y el estado coincide ──
        const estadoHumanizador = ttsHumanizerActivo && !!claudeApiKey;
        const entrada = _capCache[ruta];
        if (entrada && entrada.traducida === traduccionAutomatica && entrada.humanizada === estadoHumanizador) {
            console.log(`⚡ Cargando desde cache: ${ruta.split('/').pop()}`);
            // Re-aplicar reemplazos al cargar desde cache: pueden haber cambiado desde que se cacheó
            textoCompleto = aplicarReemplazosAutomaticos(entrada.texto);
            delete _capCache[ruta];
        } else {
            // Cache inválido o no existe — procesar ahora
            if (entrada) {
                console.log(`♻ Cache invalidado: ${ruta.split('/').pop()}`);
                delete _capCache[ruta];
            }

            // Extraer texto del HTML
            const contenidoHTML = archivosHTML[ruta];
            const parser = new DOMParser();
            const doc = parser.parseFromString(contenidoHTML, 'text/html');
            const body = doc.body.cloneNode(true);

            body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
            body.querySelectorAll('a[href*="index_split"]').forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.tagName === 'P') parent.remove();
            });

            const BLOQUES = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'LI']);
            const parrafos = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote, li');
            textoCompleto = '';
            parrafos.forEach(elemento => {
                // Saltar si tiene hijos que también son elementos de bloque (evita duplicación)
                const tieneHijoBloque = Array.from(elemento.children).some(c => BLOQUES.has(c.tagName));
                if (tieneHijoBloque) return;
                const texto = (elemento.textContent || '').trim();
                if (texto.length > 0) {
                    textoCompleto += (elemento.tagName.startsWith('H') ? '\n\n' + texto + '\n\n' : texto + '\n\n');
                }
            });
            textoCompleto = textoCompleto.replace(/\n\n\n+/g, '\n\n').trim();

            // ─── Barra de progreso unificada: 3 fases ───
            // Fase 1 (0-60%): Traducción párrafo a párrafo
            // Fase 2 (60-75%): Revisión
            // Fase 3 (75-100%): Optimización IA
            const _mostrarBarraFase = (fase, pctFase, label) => {
                if (_traduccionEnBackground) return;
                let pctGlobal;
                if (fase === 1) pctGlobal = Math.round(pctFase * 0.60);          // 0-60%
                else if (fase === 2) pctGlobal = Math.round(60 + pctFase * 0.15); // 60-75%
                else pctGlobal = Math.round(75 + pctFase * 0.25);                 // 75-100%

                const labelTexto = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

                // ── Barra del reading area (main) ──
                const mpbWrap = document.getElementById('main-processing-bar');
                const mpbFill = document.getElementById('mpb-fill');
                const mpbPct = document.getElementById('mpb-pct');
                const mpbLabel = document.getElementById('mpb-label');
                const mpbF1 = document.getElementById('mpb-f1');
                const mpbF2 = document.getElementById('mpb-f2');
                const mpbF3 = document.getElementById('mpb-f3');
                if (mpbWrap) mpbWrap.style.display = 'flex';
                if (mpbFill) mpbFill.style.width = pctGlobal + '%';
                if (mpbPct) mpbPct.textContent = pctGlobal + '%';
                if (mpbLabel) mpbLabel.textContent = labelTexto;
                if (mpbF1) mpbF1.style.color = fase >= 2 ? 'var(--text-muted)' : 'var(--accent2)';
                if (mpbF2) mpbF2.style.color = fase === 2 ? 'var(--accent2)' : (fase > 2 ? 'var(--text-muted)' : 'var(--text-dim)');
                if (mpbF3) mpbF3.style.color = fase === 3 ? 'var(--accent2)' : 'var(--text-dim)';

                // ── Barra antigua (progress-fill + tts-status-label) ──
                const fill = document.getElementById('progress-fill');
                const label2 = document.getElementById('tts-status-label');
                const pctEl = document.getElementById('tts-percent');
                if (fill) fill.style.width = pctGlobal + '%';
                if (pctEl) { pctEl.textContent = pctGlobal + '%'; pctEl.style.display = 'inline'; }
                if (label2) label2.innerHTML = label;

                // ── Overlay del modo video (video) ──
                const kWrap = document.getElementById('video-translation-progress');
                const kFill = document.getElementById('ktl-fill');
                const kPct = document.getElementById('ktl-pct');
                const kLabel = document.getElementById('ktl-label');
                const kF1 = document.getElementById('ktl-f1');
                const kF2 = document.getElementById('ktl-f2');
                const kF3 = document.getElementById('ktl-f3');
                if (kWrap) kWrap.style.display = 'flex';
                if (kFill) kFill.style.width = pctGlobal + '%';
                if (kPct) kPct.textContent = pctGlobal + '%';
                if (kLabel) kLabel.textContent = labelTexto;
                if (kF1) kF1.style.color = fase >= 2 ? 'var(--text-muted)' : 'var(--accent2)';
                if (kF2) kF2.style.color = fase === 2 ? 'var(--accent2)' : (fase > 2 ? 'var(--text-muted)' : 'var(--text-dim)');
                if (kF3) kF3.style.color = fase === 3 ? 'var(--accent2)' : 'var(--text-dim)';
            };

            if (traduccionAutomatica) {
                document.getElementById('texto-contenido').innerHTML = '';
                document.getElementById('tts-status').textContent = 'Traduciendo...';

                // Sobrescribir actualizarProgresoTraduccion para usar escala de fase 1
                const _origActualizar = window._overrideActualizarProgreso;
                window._overrideActualizarProgreso = (actual, total) => {
                    _mostrarBarraFase(1, (actual / total) * 100, `<span style="color:var(--accent2)">⟳</span> Traduciendo... ${actual}/${total}`);
                };

                textoCompleto = await traducirTexto(textoCompleto);

                window._overrideActualizarProgreso = null;
                document.getElementById('tts-status').textContent = 'Detenido';

                // Fase 2: Revisión (ya ocurre dentro de traducirTexto → revisarYRetraducirTexto)
                // Actualizar barra a zona de revisión
                _mostrarBarraFase(2, 50, `<span style="color:var(--accent)">🔍</span> Revisando traducción...`);
                await new Promise(r => setTimeout(r, 200)); // pequeña pausa visual
            }

            // Fase 2.5: Limpieza silenciosa de URLs (entre revisión y optimización)
            textoCompleto = limpiarURLs(textoCompleto);

            // Fase 3: Optimización IA
            if (ttsHumanizerActivo && claudeApiKey) {
                document.getElementById('tts-status').textContent = '✨ Optimizando...';
                textoCompleto = await naturalizarTextoParaTTS(textoCompleto, (hecho, total) => {
                    _mostrarBarraFase(3, (hecho / total) * 100, `<span style="color:var(--accent)">✨</span> Optimizando con IA... ${hecho}/${total}`);
                });
                document.getElementById('tts-status').textContent = 'Detenido';
            }

            // Completar barra y ocultarla
            _mostrarBarraFase(3, 100, '✓ Listo');
            setTimeout(() => {
                // Ocultar barra del video
                const kWrap = document.getElementById('video-translation-progress');
                if (kWrap) kWrap.style.display = 'none';
                // Ocultar barra del main
                const mpbWrap = document.getElementById('main-processing-bar');
                if (mpbWrap) mpbWrap.style.display = 'none';
                // Resetear progress-fill antiguo
                const fill = document.getElementById('progress-fill');
                const pctEl = document.getElementById('tts-percent');
                if (fill) setTimeout(() => { fill.style.width = '0%'; }, 400);
                if (pctEl) setTimeout(() => { pctEl.style.display = 'none'; }, 400);
            }, 800);

            textoCompleto = aplicarReemplazosAutomaticos(textoCompleto);
        }

        renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoCompleto);
        actualizarEstadisticas();

        // Actualizar título de capítulo en el visor modo video
        const capEl = document.getElementById('kp-chapter');
        const tituloActual = document.getElementById('current-chapter-title')?.textContent || '';
        if (capEl) capEl.textContent = tituloActual;

        mostrarNotificacion(traduccionAutomatica ? '✓ Capítulo listo' : '✓ Capítulo cargado');

        // ── Determinar si iniciar TTS automáticamente ──
        const eraNavegacionIntencionada = !!window._navegacionIntencionada;
        window._navegacionIntencionada = false;

        const autoPlayCheckbox = document.getElementById('auto-play-after-translate');
        const debeAutoPlay = autoPlayCheckbox && autoPlayCheckbox.checked
            && (traduccionAutomatica || (ttsHumanizerActivo && claudeApiKey));

        if (eraNavegacionIntencionada && typeof videoActive !== 'undefined' && videoActive) {
            setTimeout(() => { iniciarTTS(); }, 200);
        } else if (debeAutoPlay && !eraNavegacionIntencionada) {
            setTimeout(() => { iniciarTTS(); }, 400);
        }

        // ── Pre-procesar el siguiente capítulo en background ──
        // Capturar el token actual: si el usuario navega antes de los 5s, el callback no hará nada
        _limpiarCache(ruta);
        const siguiente = _getSiguienteRuta(ruta);
        if (siguiente) {
            const tokenAlProgramar = _bgCancelToken;
            setTimeout(() => {
                // Solo arrancar el BG si el usuario no navegó desde que programamos esto
                if (_bgCancelToken === tokenAlProgramar) {
                    _preTradducirCapitulo(siguiente);
                }
            }, 5000);
        }

    } catch (error) {
        console.error('Error al cargar capítulo:', error);
        mostrarNotificacion('⚠ Error al cargar el capítulo: ' + error.message);
    }
}

// Evento de cambio en el selector de capítulos
// Solo responde a cambios hechos por el usuario (no navegación programática)
window._cargandoProgramaticamente = false;
document.getElementById('chapters').addEventListener('change', function (e) {
    if (window._cargandoProgramaticamente) return;
    // Al cambiar de capítulo manualmente, siempre mostrar botón Aplicar
    // para que el usuario pueda re-procesar con la configuración actual
    if (typeof traduccionAutomatica !== 'undefined' || typeof ttsHumanizerActivo !== 'undefined') {
        const hayProcesamiento = (typeof traduccionAutomatica !== 'undefined' && traduccionAutomatica)
            || (typeof ttsHumanizerActivo !== 'undefined' && ttsHumanizerActivo);
        if (hayProcesamiento) {
            const row = document.getElementById('aplicar-row');
            const hint = document.getElementById('aplicar-hint');
            if (row) row.style.display = 'block';
            if (hint) hint.textContent = 'Nuevo capítulo — presiona Aplicar para procesar';
            _configPendiente = true;
        }
    }
    cargarCapitulo(e.target.value);
});

// ======================
// EDITOR Y REEMPLAZOS
// ======================

// Actualizar estadísticas
function actualizarEstadisticas() {
    const texto = document.getElementById('texto-contenido').textContent;
    const palabras = texto.trim().split(/\s+/).filter(p => p.length > 0).length;
    const caracteres = texto.length;
    const parrafos = texto.split(/\n\n+/).filter(p => p.trim().length > 0).length;

    document.getElementById('contador-palabras').textContent = palabras;
    document.getElementById('contador-caracteres').textContent = caracteres;
    document.getElementById('contador-parrafos').textContent = parrafos;
}

// Reemplazar palabra
function reemplazarPalabra() {
    const buscar = document.getElementById('palabra-buscar').value.trim();
    const reemplazar = document.getElementById('palabra-reemplazar').value.trim();

    if (!buscar) {
        mostrarNotificacion('⚠ Ingresa una palabra para buscar');
        return;
    }

    const elemento = document.getElementById('texto-contenido');
    let regex;
    try { regex = new RegExp(buscar, 'gi'); } catch (e) { regex = new RegExp(buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
    const textoOriginal = elemento.textContent;
    const ocurrencias = (textoOriginal.match(regex) || []).length;

    if (ocurrencias === 0) {
        alert(`No se encontró la palabra "${buscar}"`);
        return;
    }

    elemento.textContent = textoOriginal.replace(regex, reemplazar);
    actualizarEstadisticas();
    mostrarNotificacion(`${ocurrencias} ocurrencia(s) reemplazada(s)`);

    // Guardar en localStorage y en el diccionario activo
    reemplazosAutomaticos[buscar] = reemplazar;
    localStorage.setItem('reemplazos_custom', JSON.stringify(reemplazosAutomaticos));
    if (typeof actualizarBotonLimpiarReemplazos === 'function') actualizarBotonLimpiarReemplazos();
    // Invalidar cache BG: el texto cacheado no tiene este nuevo reemplazo aplicado
    Object.keys(_capCache).forEach(k => delete _capCache[k]);

    document.getElementById('palabra-buscar').value = '';
    document.getElementById('palabra-reemplazar').value = '';
}

// Aplicar texto del editor
async function aplicarTexto() {
    const textoEditor = document.getElementById('editor-texto').value;
    if (!textoEditor.trim()) {
        alert('El editor está vacío');
        return;
    }

    let textoFinal = textoEditor;

    // No traducir automáticamente
    textoFinal = aplicarReemplazosAutomaticos(textoFinal);

    renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoFinal);

    actualizarEstadisticas();

    mostrarNotificacion('Texto aplicado correctamente');
}

// Limpiar editor
function limpiarEditor() {
    document.getElementById('editor-texto').value = '';
}

// Copiar texto
function copiarTexto() {
    const texto = document.getElementById('texto-contenido').textContent;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('✓ Texto copiado al portapapeles');
    });
}

// Mostrar notificación
function mostrarNotificacion(mensaje) {
    const notif = document.getElementById('notification');
    notif.textContent = mensaje;
    notif.classList.add('show');
    setTimeout(() => {
        notif.classList.remove('show');
    }, 3000);
}

// Tecla Enter para reemplazar
document.getElementById('palabra-reemplazar').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        reemplazarPalabra();
    }
});

// Inicializar estadísticas
actualizarEstadisticas();

// Verificar servidor TTS local al cargar la página
verificarServidorTTS();