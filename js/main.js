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

// Diccionario de reemplazos automáticos
const reemplazosAutomaticos = {
    'Sunny': 'Solano',
    'Nephis': 'Ardila',
    'Cassie': 'Salvia',
    'Jet': 'Yaz Azul',
    'Rain': 'Lluvia',
    'Orilla Olvidada': 'Costa Olvidada',
    'Orilla olvidada': 'Costa Olvidada',
    'orilla olvidada': 'costa olvidada'
};

// Variable para controlar traducción automática
let traduccionAutomatica = false;

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

    audioActual.onended = function () {
        URL.revokeObjectURL(audioUrl);
        if (isReading && !isPaused) {
            leerOracionLocal(index + 1);
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
    return texto.match(/[^.!?]+[.!?]+/g) || [texto];
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
}

function resaltarOracion(index) {
    // Quitar resaltado anterior
    document.querySelectorAll('.tts-sentence').forEach(el => el.classList.remove('tts-active'));

    const span = document.getElementById(`tts-s-${index}`);
    if (span) {
        span.classList.add('tts-active');
        // Scroll suave para que siempre sea visible
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    utterance = new SpeechSynthesisUtterance(sentences[index]);

    // Configurar parámetros
    const voiceIndex = document.getElementById('voice-select').value;
    if (voices[voiceIndex]) {
        utterance.voice = voices[voiceIndex];
    }
    utterance.rate = parseFloat(document.getElementById('rate-control').value);
    utterance.pitch = parseFloat(document.getElementById('pitch-control').value);
    utterance.volume = parseFloat(document.getElementById('volume-control').value) / 100;

    utterance.onend = function () {
        if (isReading && !isPaused) {
            leerOracion(index + 1);
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
        alert('No hay texto para leer');
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

    // Usar API local si está disponible
    if (servidorTTSDisponible) {
        mostrarNotificacion('🎤 Usando TTS Local (XTTS v2)');
        leerOracionLocal(0);
    } else {
        mostrarNotificacion('🔊 Usando TTS del navegador');
        leerOracion(0);
    }
}

// Envuelve cada oración en un span usando indexOf (sin regex) para evitar errores con chars especiales
function envolverOracionesEnSpans(contenedor, oraciones) {
    // Limpiar spans anteriores
    contenedor.querySelectorAll('.tts-sentence').forEach(span => {
        span.replaceWith(document.createTextNode(span.textContent));
    });
    contenedor.normalize();

    let html = contenedor.innerHTML;

    // Reemplazar cada oración usando indexOf en lugar de regex
    oraciones.forEach((oracion, i) => {
        const texto = oracion.trim();
        if (!texto) return;
        const idx = html.indexOf(texto);
        if (idx === -1) return;
        const span = `<span class="tts-sentence" id="tts-s-${i}">${texto}</span>`;
        html = html.slice(0, idx) + span + html.slice(idx + texto.length);
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

// ======================
// FUNCIONES GENERALES
// ======================

// Función para aplicar reemplazos automáticos
function aplicarReemplazosAutomaticos(texto) {
    let textoModificado = texto;
    for (const [buscar, reemplazar] of Object.entries(reemplazosAutomaticos)) {
        const regex = new RegExp(buscar, 'g');
        textoModificado = textoModificado.replace(regex, reemplazar);
    }
    return textoModificado;
}

// Barra de progreso para traducción
function actualizarProgresoTraduccion(actual, total) {
    const pct = Math.round((actual / total) * 100);
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('tts-status-label');
    const pctEl = document.getElementById('tts-percent');
    if (fill) fill.style.width = pct + '%';
    if (label) label.innerHTML = `<span style="color:var(--accent2)">⟳</span> Traduciendo...`;
    if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.display = 'inline'; }
}

function finalizarProgresoTraduccion() {
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('tts-status-label');
    const pctEl = document.getElementById('tts-percent');
    if (fill) { fill.style.width = '100%'; setTimeout(() => { fill.style.width = '0%'; }, 1000); }
    if (label) label.textContent = '⏹ Sin reproducción';
    if (pctEl) { pctEl.textContent = '100%'; setTimeout(() => { pctEl.style.display = 'none'; }, 1200); }
    mostrarNotificacion('✓ Traducción completada');
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

        // Pausa entre párrafos para no saturar la API
        if (i < parrafos.length - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    finalizarProgresoTraduccion();
    return traducidos.join('\n\n');
}

// Divide un texto largo en fragmentos sin cortar palabras a mitad
function dividirEnSubfragmentos(texto, maxChars) {
    const fragmentos = [];
    const oraciones = texto.match(/[^.!?]+[.!?]+/g) || [texto];
    let actual = '';

    for (const oracion of oraciones) {
        if ((actual + ' ' + oracion).trim().length > maxChars && actual.length > 0) {
            fragmentos.push(actual.trim());
            actual = oracion;
        } else {
            actual += (actual ? ' ' : '') + oracion;
        }
    }

    if (actual.trim()) fragmentos.push(actual.trim());
    return fragmentos;
}

async function traducirFragmento(fragmento) {
    if (!fragmento || !fragmento.trim()) return fragmento;

    // Intentar primero con Google Translate (API no oficial, sin key)
    try {
        const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(fragmento)}`;
        const response = await fetch(gtUrl);
        if (response.ok) {
            const data = await response.json();
            // La respuesta es un array anidado: [[["traduccion","original",...],...],...]
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
    } catch (e) {
        console.warn('Google Translate falló, intentando MyMemory...', e.message);
    }

    // Fallback: MyMemory API
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(fragmento)}&langpair=en|es`;
        const response = await fetch(url);
        if (!response.ok) return fragmento;

        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const resultado = data.responseData.translatedText;
            if (resultado === resultado.toUpperCase() && fragmento !== fragmento.toUpperCase()) {
                return fragmento;
            }
            return resultado;
        }
        if (data.responseStatus === 429 || (data.responseDetails && data.responseDetails.includes('DAILY'))) {
            mostrarNotificacion('⚠️ Límite diario de traducción alcanzado');
        }
        return fragmento;
    } catch (error) {
        console.error('Error en traducción:', error);
        return fragmento;
    }
}

// Toggle de traducción automática
function toggleAutoTranslate() {
    traduccionAutomatica = document.getElementById('auto-translate').checked;
    const statusElement = document.getElementById('translation-status');

    if (traduccionAutomatica) {
        statusElement.textContent = '✓ Traducción automática activada (EN → ES)';
        statusElement.className = 'translation-status active';

        // Recargar el capítulo actual con traducción
        const selector = document.getElementById('chapters');
        if (selector.value) {
            cargarCapitulo(selector.value);
        }
    } else {
        statusElement.textContent = 'Traducción desactivada';
        statusElement.className = 'translation-status';

        // Recargar el capítulo actual sin traducción
        const selector = document.getElementById('chapters');
        if (selector.value) {
            cargarCapitulo(selector.value);
        }
    }
}

// Traducir texto actual
async function traducirTextoActual() {
    const textoActual = document.getElementById('texto-contenido').textContent;

    if (!textoActual || textoActual.trim().length === 0 ||
        textoActual === 'Aquí aparecerá el contenido del capítulo seleccionado...') {
        alert('No hay texto para traducir');
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
            document.getElementById('texto-contenido').textContent = textoFinal;
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
        alert('Por favor selecciona un archivo EPUB válido');
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

        selector.selectedIndex = 0;

        document.getElementById('chapter-selector').style.display = 'block';
        document.getElementById('file-name').textContent = `${file.name} (${archivosOrdenados.length} capítulos)`;
        mostrarNotificacion('✓ EPUB cargado correctamente');

        if (archivosOrdenados.length > 0) {
            cargarCapitulo(archivosOrdenados[0]);
        }

    } catch (error) {
        console.error('Error al cargar EPUB:', error);
        document.getElementById('file-name').textContent = 'Error al cargar';
        alert('Error al cargar el archivo EPUB: ' + error.message);
    }
});

// Cargar capítulo seleccionado
async function cargarCapitulo(ruta) {
    if (!ruta || !archivosHTML[ruta]) return;

    // Detener TTS si está activo
    detenerTTS();

    try {
        const contenidoHTML = archivosHTML[ruta];
        const parser = new DOMParser();
        const doc = parser.parseFromString(contenidoHTML, 'text/html');

        const body = doc.body.cloneNode(true);

        body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());

        body.querySelectorAll('a[href*="index_split"]').forEach(el => {
            const parent = el.parentElement;
            if (parent && parent.tagName === 'P') {
                parent.remove();
            }
        });

        const parrafos = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div');
        let textoCompleto = '';

        parrafos.forEach(elemento => {
            const texto = elemento.innerText.trim();
            if (texto.length > 0) {
                if (elemento.tagName.startsWith('H')) {
                    textoCompleto += '\n\n' + texto + '\n\n';
                } else {
                    textoCompleto += texto + '\n\n';
                }
            }
        });

        textoCompleto = textoCompleto
            .replace(/\n\n\n+/g, '\n\n')
            .trim();

        // Traducir automáticamente si está activado
        if (traduccionAutomatica) {
            document.getElementById('texto-contenido').textContent = '⏳ Traduciendo capítulo, por favor espera...';
            document.getElementById('tts-status').textContent = 'Traduciendo...';
            textoCompleto = await traducirTexto(textoCompleto);
            document.getElementById('tts-status').textContent = 'Detenido';
        }

        textoCompleto = aplicarReemplazosAutomaticos(textoCompleto);

        document.getElementById('texto-contenido').textContent = textoCompleto;

        actualizarEstadisticas();

        mostrarNotificacion(traduccionAutomatica ? '✓ Capítulo cargado y traducido' : 'Capítulo cargado correctamente');

        // ELIMINADO: Auto-scroll a la sección de contenido

    } catch (error) {
        console.error('Error al cargar capítulo:', error);
        alert('Error al cargar el capítulo: ' + error.message);
    }
}

// Evento de cambio en el selector de capítulos
document.getElementById('chapters').addEventListener('change', function (e) {
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
    const buscar = document.getElementById('palabra-buscar').value;
    const reemplazar = document.getElementById('palabra-reemplazar').value;

    if (!buscar) {
        alert('Por favor ingresa una palabra para buscar');
        return;
    }

    const elemento = document.getElementById('texto-contenido');
    const regex = new RegExp(buscar, 'gi');
    const textoOriginal = elemento.textContent;
    const ocurrencias = (textoOriginal.match(regex) || []).length;

    if (ocurrencias === 0) {
        alert(`No se encontró la palabra "${buscar}"`);
        return;
    }

    elemento.textContent = textoOriginal.replace(regex, reemplazar);
    actualizarEstadisticas();
    mostrarNotificacion(`${ocurrencias} ocurrencia(s) reemplazada(s)`);

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

    document.getElementById('texto-contenido').textContent = textoFinal;

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