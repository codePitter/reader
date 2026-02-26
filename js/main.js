// ═══════════════════════════════════════
// MAIN — Variables globales y configuración
// Punto de entrada: define el estado compartido por todos los módulos
// Orden de carga: main.js → epub.js → translation.js → player.js → tts.js → video.js → ui.js
// ═══════════════════════════════════════

// ─── EPUB ───
let archivoEPUB = null;
let archivosHTML = {};

// ─── TTS BROWSER ───
let synth = window.speechSynthesis;
let utterance = null;
let isPaused = false;
let voices = [];
let isReading = false;
let currentSentenceIndex = 0;
let sentences = [];

// ─── TTS API LOCAL (XTTS v2) ───
let usarAPILocal = false;
let servidorTTSDisponible = false;
const TTS_API_URL = 'http://localhost:5000';
let audioActual = null;

// Token de sesión TTS: se incrementa en detenerTTS() para invalidar callbacks onended pendientes
let _ttsSessionToken = 0;

// ─── REEMPLAZOS ───
// Cargado desde localStorage al inicio; ui.js lo persiste al modificar
const reemplazosAutomaticos = JSON.parse(localStorage.getItem('reemplazos_custom') || '{}');

// ─── TRADUCCIÓN ───
let traduccionAutomatica = false;

// ─── CACHE DE PRE-TRADUCCIÓN ───
// ruta → { texto, traducida, humanizada }  (siguiente capítulo procesado en background)
const _capCache = {};
let _capCacheEnCurso = null;   // ruta que se está pre-traduciendo ahora
let _bgCancelToken = 0;        // si cambia, el proceso BG activo se aborta

// ─── CONFIG PENDIENTE ───
// Los toggles NO aplican inmediatamente; se acumulan hasta presionar "Aplicar"
let _configPendiente = false;

// ─── UNIVERSOS NARRATIVOS ───
// aiDetectedUniverse: seteado por player.js cuando la IA identifica el universo del libro
// UNIVERSE_CONFIG: define el comportamiento de música ambiental por universo
let aiDetectedUniverse = null;

const UNIVERSE_CONFIG = {
    fantasy_epic: {
        ambient: {
            label: 'Fantasy Épico',
            genreBoost: { fantasy: 2, adventure: 1 },
            freesoundQueries: ['epic fantasy orchestral', 'fantasy adventure music', 'medieval epic']
        }
    },
    cultivation: {
        ambient: {
            label: 'Cultivation / Xianxia',
            genreBoost: { fantasy: 2, action: 1 },
            freesoundQueries: ['chinese traditional meditation', 'wuxia ambient', 'cultivation music']
        }
    },
    sci_fi: {
        ambient: {
            label: 'Sci-Fi',
            genreBoost: { suspense: 1, action: 1 },
            freesoundQueries: ['sci-fi ambient space', 'futuristic atmosphere', 'space exploration music']
        }
    },
    romance: {
        ambient: {
            label: 'Romance',
            genreBoost: { romance: 2, drama: 1 },
            freesoundQueries: ['romantic piano ambient', 'soft romance music', 'love story instrumental']
        }
    },
    thriller: {
        ambient: {
            label: 'Thriller / Misterio',
            genreBoost: { mystery: 2, suspense: 2 },
            freesoundQueries: ['dark thriller ambient', 'suspense music', 'mystery atmosphere']
        }
    },
    horror: {
        ambient: {
            label: 'Horror',
            genreBoost: { horror: 3, suspense: 1 },
            freesoundQueries: ['horror dark ambient', 'scary atmosphere drone', 'creepy tension music']
        }
    },
    adventure: {
        ambient: {
            label: 'Aventura',
            genreBoost: { adventure: 2, action: 1 },
            freesoundQueries: ['adventure epic journey', 'exploration cinematic', 'heroic adventure theme']
        }
    },
    drama: {
        ambient: {
            label: 'Drama',
            genreBoost: { drama: 3 },
            freesoundQueries: ['emotional piano ambient', 'cinematic sad orchestral', 'dramatic film score']
        }
    }
};

// ═══════════════════════════════════════
// UTILIDADES GLOBALES
// Definidas aquí porque main.js carga primero y todos los módulos las necesitan
// ═══════════════════════════════════════

function mostrarNotificacion(mensaje) {
    const notif = document.getElementById('notification');
    if (!notif) return;
    notif.textContent = mensaje;
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 3000);
}

function actualizarEstadisticas() {
    const el = document.getElementById('texto-contenido');
    if (!el) return;
    const texto = el.textContent;
    const palabras = texto.trim().split(/\s+/).filter(p => p.length > 0).length;
    const contP = document.getElementById('contador-palabras');
    const contC = document.getElementById('contador-caracteres');
    const contPa = document.getElementById('contador-parrafos');
    if (contP) contP.textContent = palabras;
    if (contC) contC.textContent = texto.length;
    if (contPa) contPa.textContent = texto.split(/\n\n+/).filter(p => p.trim().length > 0).length;
}

// ═══════════════════════════════════════
// CONFIG PENDIENTE
// ═══════════════════════════════════════

function marcarCambioPendiente() {
    _configPendiente = true;
    const row = document.getElementById('aplicar-row');
    if (row) row.style.display = 'block';

    // auto-play-row: visible solo si la traducción está activa
    const traducChecked = document.getElementById('auto-translate')?.checked;
    const apRow = document.getElementById('auto-play-row');
    if (apRow) apRow.style.display = traducChecked ? 'flex' : 'none';

    // Mostrar estado "pendiente" en el indicador de traducción
    const statusEl = document.getElementById('translation-status');
    if (statusEl) {
        // TRANSLATION_TARGET_NAME viene de translation.js (carga después, pero
        // esta función solo se invoca desde UI por lo que ya está disponible)
        const langName = (typeof TRANSLATION_TARGET_NAME !== 'undefined')
            ? TRANSLATION_TARGET_NAME
            : 'idioma detectado';
        statusEl.textContent = traducChecked
            ? `⏳ Traducción activada → ${langName} (pendiente)`
            : '⏳ Traducción desactivada (pendiente)';
        statusEl.className = 'translation-status';
    }
}

async function aplicarConfiguracion() {
    const btn = document.getElementById('btn-aplicar');
    const hint = document.getElementById('aplicar-hint');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

    const nuevoTraducir = document.getElementById('auto-translate').checked;
    traduccionAutomatica = nuevoTraducir;

    // Actualizar indicador de traducción
    const statusEl = document.getElementById('translation-status');
    if (statusEl) {
        const langName = (typeof TRANSLATION_TARGET_NAME !== 'undefined')
            ? TRANSLATION_TARGET_NAME : 'idioma detectado';
        statusEl.textContent = nuevoTraducir
            ? `✓ Traducción automática activada (EN → ${langName})`
            : 'Traducción desactivada';
        statusEl.className = nuevoTraducir ? 'translation-status active' : 'translation-status';
    }

    // Actualizar indicador del humanizador
    const humStatus = document.getElementById('humanizer-status');
    if (humStatus && typeof HUMANIZER_PROVIDERS !== 'undefined') {
        const prov = HUMANIZER_PROVIDERS[humanizerProvider];
        humStatus.textContent = ttsHumanizerActivo
            ? (claudeApiKey ? `✓ activo · ${prov?.name}` : '⚠ necesita API key')
            : 'Desactivado';
    }

    // Invalidar cache del capítulo actual y recargarlo con la nueva configuración
    const selector = document.getElementById('chapters');
    if (selector && selector.value) {
        delete _capCache[selector.value];
        await cargarCapitulo(selector.value);
    }

    _configPendiente = false;
    const row = document.getElementById('aplicar-row');
    if (row) row.style.display = 'none';
    if (btn) { btn.disabled = false; btn.textContent = '✓ Aplicar'; }
    if (hint) hint.textContent = 'Cambios pendientes — recarga el capítulo actual';
}

// Alias — el checkbox #auto-translate llama a esta función vía onchange
function toggleAutoTranslate() {
    marcarCambioPendiente();
}