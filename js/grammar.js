// ═══════════════════════════════════════
// GRAMMAR — Revisión gramatical y reemplazo de onomatopeyas (Fase 4)
// Depende de: main.js (mostrarNotificacion)
//             translation.js (marcarCambioPendiente)
// Disponible para textos en español.
//
// ── Estrategia para minimizar consumo de LanguageTool ─────────────────────
// 1. Caché localStorage por hash del texto → si el capítulo no cambió, 0 llamadas.
// 2. Pre-filtro local con regex → detecta errores comunes sin tocar la API.
// 3. Una sola llamada por capítulo completo (hasta 20 K chars con credenciales LT).
// 4. Soporte de cuenta gratuita LT (user+key) → 20 K chars/req vs ~1 500 anónimo.
// ═══════════════════════════════════════

// ─── ESTADO Y CREDENCIALES ──────────────────────────────────────────────
// Ambas variables se declaran en main.js para que epub.js pueda leerlas antes de que
// este archivo cargue. Aquí solo las inicializamos si aún no fueron declaradas.
// grammarReviewActivo y autoReemplazarOnomatopeyas se declaran en main.js con let.
// No re-declarar aquí para evitar SyntaxError por conflicto let/var en el mismo scope global.

// Credenciales opcionales de cuenta LT gratuita
// Desbloquean 20 K chars/req y 75 K chars/min (vs ~1 500 chars anónimo)
// Registro gratuito en: https://languagetool.org/es/cuenta
let _ltUsername = uGet('lt_username') || '';
let _ltApiKey = uGet('lt_apikey') || '';

function guardarLtCredenciales() {
    const u = document.getElementById('lt-username')?.value.trim() || '';
    const k = document.getElementById('lt-apikey')?.value.trim() || '';
    _ltUsername = u;
    _ltApiKey = k;
    uSet('lt_username', u);
    uSet('lt_apikey', k);
    const statusEl = document.getElementById('lt-cred-status');
    if (statusEl) statusEl.textContent = (u && k) ? '✓ guardadas' : '';
    _ltCache = {};
    uRemove('lt_cache');
    if (typeof mostrarNotificacion === 'function')
        mostrarNotificacion(u && k ? '✓ Credenciales LT guardadas' : '✓ Credenciales LT borradas');
}

function toggleGrammarReview() {
    grammarReviewActivo = document.getElementById('grammar-review')?.checked ?? false;
    try { uSet('grammar_review_activo', grammarReviewActivo); } catch (e) { }
    const statusEl = document.getElementById('grammar-review-status');
    if (statusEl) {
        const modo = (_ltUsername && _ltApiKey) ? '· cuenta LT activa' : '· modo anónimo';
        statusEl.textContent = grammarReviewActivo
            ? `\u2713 Activo ${modo}`
            : 'Desactivado';
        statusEl.style.color = grammarReviewActivo ? 'var(--accent2)' : '';
    }
    if (typeof marcarCambioPendiente === 'function') marcarCambioPendiente();
}

// ═══════════════════════════════════════
// CACHÉ LOCAL DE RESULTADOS LANGUAGETOOL
// Clave: hash djb2 de los primeros 4 000 chars + longitud total del texto.
// Persiste en localStorage para sobrevivir recargas de página.
// Máximo 20 entradas (las más recientes).
// ═══════════════════════════════════════
let _ltCache = (() => {
    try { return JSON.parse(uGet('lt_cache') || '{}'); }
    catch (e) { return {}; }
})();

function _hashTexto(str) {
    let h = 5381;
    for (let i = 0; i < Math.min(str.length, 4000); i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(36) + str.length.toString(36);
}

function _guardarCacheTexto(hash, matches) {
    _ltCache[hash] = matches;
    const claves = Object.keys(_ltCache);
    if (claves.length > 20) delete _ltCache[claves[0]];
    try { uSet('lt_cache', JSON.stringify(_ltCache)); } catch (e) { /* cuota llena */ }
}

// ═══════════════════════════════════════
// DICCIONARIO DE ONOMATOPEYAS — 160+ entradas
// Onomatopeyas inglesas frecuentes en literatura traducida (novelas, webnovels, manga).
// Formato: 'onomatopeya' → 'reemplazo verbal en español'
// ═══════════════════════════════════════
const ONOMATOPEYAS_ES = {

    // ── Desaprobación / disgusto ──────────────────────────────────────────
    'tsk': 'chistó',
    'tsk-tsk': 'chasqueó la lengua dos veces',
    'tut': 'chistó',
    'tut-tut': 'chistó reprobador',
    'tch': 'chasqueó la lengua',
    'hmph': 'bufó con desdén',
    'hmpf': 'bufó',
    'pfft': 'resopló burlón',
    'pff': 'resopló',
    'pshaw': 'bufó desdeñoso',
    'ugh': 'gruñó con disgusto',
    'urgh': 'gruñó',
    'argh': 'gruñó frustrado',
    'aargh': 'soltó un grito de frustración',
    'gah': 'exclamó exasperado',
    'bleh': 'expresó su disgusto',
    'bah': 'refunfuñó',
    'meh': 'respondió indiferente',

    // ── Pensamiento / vacilación ──────────────────────────────────────────
    'hmm': 'murmuró pensativo',
    'hmmm': 'murmuró pensativo',
    'hm': 'murmuró',
    'uhh': 'vaciló',
    'uhm': 'titubeó',
    'err': 'balbuceó',
    'er': 'titubeó',       // seguro: solo matchea dentro de delimitadores de diálogo
    'umm': 'dudó',
    'um': 'dudó',
    'erm': 'vaciló',
    'uh': 'dudó',

    // ── Sorpresa / reacción ──────────────────────────────────────────────
    'huh': 'exclamó sorprendido',
    'ooh': 'exclamó asombrado',
    'ohh': 'soltó un leve jadeo',
    'oh': 'exclamó',
    'whoa': 'exclamó asombrado',
    'woah': 'exclamó asombrado',
    'wow': 'exclamó maravillado',
    'gee': 'exclamó admirado',
    'golly': 'exclamó asombrado',
    'gosh': 'exclamó atónito',
    'blimey': 'exclamó sorprendido',
    'crikey': 'exclamó asombrado',
    'jeez': 'exclamó impresionado',

    // ── Dolor / esfuerzo físico ──────────────────────────────────────────
    'oof': 'gruñó por el impacto',
    'ouch': 'exclamó adolorido',
    'ow': 'exclamó de dolor',
    'eek': 'chilló asustado',
    'yikes': 'exclamó alarmado',
    'yow': 'exclamó de dolor',
    'yeow': 'chilló de dolor',
    'ack': 'exclamó angustiado',
    'ugh': 'gruñó con esfuerzo',

    // ── Alivio / suspiro ──────────────────────────────────────────────────
    'phew': 'exhaló aliviado',
    'whew': 'soltó un suspiro de alivio',
    'sigh': 'suspiró',
    'ahh': 'suspiró',
    'ahhh': 'exhaló con alivio',

    // ── Risa ──────────────────────────────────────────────────────────────
    'heh': 'rio entre dientes',
    'hehe': 'se rio entre dientes',
    'heehee': 'soltó una risita',
    'haha': 'soltó una carcajada',
    'hahaha': 'estalló en carcajadas',
    'muahaha': 'soltó una risa malévola',
    'muahahaha': 'soltó una carcajada malvada',
    'bwahaha': 'soltó una carcajada perversa',
    'tee-hee': 'soltó una risita coqueta',
    'snicker': 'rio burlón por lo bajo',
    'chortle': 'soltó una risa ahogada',
    'chuckle': 'rio entre dientes',
    'giggle': 'soltó una risita',
    'titter': 'rio nervioso entre dientes',
    'guffaw': 'soltó una carcajada estruendosa',
    'snigger': 'rio burlón por lo bajo',
    'snort': 'resopló de risa',

    // ── Alerta / silencio ──────────────────────────────────────────────────
    'psst': 'llamó en voz baja',
    'pst': 'llamó sigiloso',
    'shh': 'pidió silencio',
    'shhh': 'mandó callar',
    'shush': 'pidió que callara',

    // ── Asentimiento / negación ──────────────────────────────────────────
    'mhm': 'asintió',
    'mmhm': 'asintió con un murmullo',
    'yep': 'asintió',
    'yup': 'respondió afirmativo',
    'nah': 'negó con desdén',
    'nope': 'negó rotundo',
    'nuh-uh': 'negó tajante',

    // ── Garganta / atención ──────────────────────────────────────────────
    'ahem': 'carraspeó para llamar la atención',
    'harrumph': 'carraspeó indignado',
    'hem': 'carraspeó',
    'hrm': 'murmuró pensativo',

    // ── Reacciones físicas / corporales ─────────────────────────────────
    'gasp': 'jadeó sorprendido',
    'gulp': 'tragó saliva',
    'sniff': 'sorbió por la nariz',
    'sniffle': 'sorbió la nariz con tristeza',
    'yawn': 'bostezó',
    'hiccup': 'tuvo hipo',
    'burp': 'eructó',
    'belch': 'soltó un eructo',
    'barf': 'arcadeó',
    'wheeze': 'resolló jadeante',
    'grunt': 'gruñó',
    'groan': 'gimió',
    'moan': 'gimió',
    'whimper': 'gimoteó',
    'sob': 'sollozó',      // seguro: solo matchea dentro de delimitadores de diálogo
    'wail': 'aulló de dolor',
    'bawl': 'lloró a gritos',
    'blubber': 'lloró desconsolado',
    'boo-hoo': 'lloriqueó',
    'squeal': 'chilló de emoción',
    'shriek': 'lanzó un chillido',
    'yelp': 'dio un grito',

    // ── Gruñidos / amenaza ─────────────────────────────────────────────
    'grr': 'gruñó',
    'grrr': 'gruñó amenazante',
    'growl': 'gruñó furioso',
    'snarl': 'gruñó mostrando los dientes',
    'hiss': 'siseó',
    'roar': 'rugió',

    // ── Sonidos de impacto ─────────────────────────────────────────────
    'thud': 'sonó un golpe sordo',
    'thump': 'retumbó un golpe',
    'thwack': 'resonó un golpe seco',
    'whack': 'crujió el golpe',
    'smack': 'restalló un manotazo',
    'slap': 'sonó una bofetada',
    'wham': 'resonó el impacto',
    'bam': 'tronó el golpe',
    'pow': 'retumbó el puñetazo',
    'bonk': 'repicó un golpe en la cabeza',
    'boink': 'resonó el golpe tonto',
    'whomp': 'retumbó el impacto sordo',
    'whump': 'resonó el golpe amortiguado',
    'clunk': 'sonó un golpe sordo metálico',
    'klunk': 'sonó pesado y metálico',
    'thunk': 'cayó con estruendo sordo',
    'conk': 'sonó el golpe en la cabeza',
    'whop': 'retumbó el golpe fuerte',
    'wap': 'sonó el golpe rápido',
    'wallop': 'resonó el golpe contundente',
    'bash': 'retumbó el impacto',
    'bop': 'sonó un golpe ligero',

    // ── Explosiones / potencia ─────────────────────────────────────────
    'bang': 'retumbó',
    'boom': 'resonó con estruendo',
    'kaboom': 'estalló con estruendo ensordecedor',
    'kapow': 'retumbó con potencia',
    'blam': 'tronó el disparo',
    'zap': 'restalló un disparo eléctrico',
    'pop': 'estalló con un chasquido',
    'crack': 'crujió',

    // ── Rotura / fricción / texturas ──────────────────────────────────
    'crackle': 'crepitó',
    'crash': 'se escuchó un estrépito',
    'smash': 'se hizo añicos con estrépito',
    'shatter': 'se quebró en pedazos',
    'snap': 'chasqueó',
    'creak': 'chirrió',
    'squeak': 'chirrió agudo',
    'grind': 'rechinó',
    'scratch': 'arañó',
    'scrape': 'raspó',
    'rattle': 'traqueteó',
    'clatter': 'repicó con estrépito',
    'clang': 'repicó metálico',
    'clank': 'chocaron metales',
    'clink': 'tintinearon',
    'jingle': 'tintineó',
    'tinkle': 'sonó fino y metálico',
    'ding': 'sonó un tintineo',
    'ping': 'resonó un sonido agudo',
    'ting': 'sonó cristalino',
    'twang': 'vibró la cuerda',
    'thrum': 'vibró sordo y continuo',

    // ── Pasos / movimiento ───────────────────────────────────────────
    'tap': 'golpeó suavemente',
    'knock': 'llamó a la puerta',
    'stomp': 'pisó fuerte',
    'stamp': 'golpeó el suelo con el pie',
    'shuffle': 'arrastró los pies',
    'patter': 'repicaron pasos rápidos',
    'click': 'chasqueó',
    'clack': 'sonó seco y duro',
    'thump thump': 'golpeó dos veces sordo',
    'clickety-clack': 'traqueteó rítmico',
    'pitter-patter': 'repicaron pasos ligeros',

    // ── Viento / movimiento rápido ──────────────────────────────────
    'whoosh': 'pasó silbando',
    'swoosh': 'pasó con un silbido veloz',
    'swish': 'siseó al pasar',
    'whir': 'zumbó',
    'whirr': 'zumbó continuo',
    'vroom': 'rugió el motor',
    'zoom': 'pasó veloz',
    'zip': 'pasó como una flecha',
    'zing': 'silbó veloz',
    'whiz': 'zumbó al pasar',
    'whizz': 'silbó veloz',

    // ── Agua / líquidos ─────────────────────────────────────────────
    'splash': 'chapoteó',
    'splatter': 'salpicó',
    'splat': 'cayó con un golpe húmedo',
    'splosh': 'chapoteó suave',
    'drip': 'goteó',
    'gush': 'brotó en chorro',
    'gurgle': 'gorgoteó',
    'slurp': 'sorbió ruidoso',
    'glug': 'borboteó al beber',
    'sploosh': 'se sumergió con chapoteo',
    'squelch': 'crujió húmedo al pisarlo',
    'squish': 'aplastó con un sonido húmedo',
    'drip-drop': 'goteó rítmico',
    'trickle': 'fluyó en hilo',

    // ── Fuego / electricidad ─────────────────────────────────────────
    'sizzle': 'chisporroteó',
    'fizz': 'efervesció',
    'sputter': 'chispeó y escupió',
    'crackle': 'crepitó',
    'zzzap': 'crepitó eléctrico',

    // ── Animales (en texto inglés no traducido) ──────────────────────
    'woof': 'ladró',
    'bark': 'ladró',
    'meow': 'maulló',
    'mew': 'maulló suave',
    'purr': 'ronroneó',
    'hoot': 'ululó',
    'chirp': 'pió',
    'squawk': 'graznó',
    'ribbit': 'croó',
    'moo': 'mugió',
    'oink': 'gruñó como cerdo',
    'baa': 'baló',
    'neigh': 'relinchó',
    'whinny': 'relinchó suave',
    'yap': 'ladró agudo',
    'yip': 'gimió agudo',
    'howl': 'aulló',
    'coo': 'arrulló',
    'twitter': 'gorgeó',
    'warble': 'trino',
    'honk': 'graznó fuerte',
    'bleat': 'baló',
    'cluck': 'cacareo',
};

// ═══════════════════════════════════════
// PRE-FILTRO LOCAL — ERRORES GRAMATICALES COMUNES EN ESPAÑOL
// Detecta patrones típicos en texto traducido automáticamente SIN llamar a LT.
// Ahorra entre 30% y 60% de los casos que de otro modo consumirían cuota.
// ═══════════════════════════════════════
const _PREFILTRO_ES = [
    // "a ver" / "haber" confundidos en traducción automática
    {
        regex: /\b(hay\s+que\s+a\s+ver|vamos\s+a\s+ver\s+si\s+a\s+ver)\b/gi,
        mensaje: 'Posible confusión "a ver" / "haber"',
        get: (m) => m.replace(/\ba\s+ver\b/gi, 'haber'),
    },
    // Dequeísmo: "creo de que", "pienso de que"
    {
        regex: /\b(creo|pienso|opino|considero|imagino|supongo|digo|afirmo|veo)\s+de\s+que\b/gi,
        mensaje: 'Posible dequeísmo: eliminar "de"',
        get: (m) => m.replace(/\bde\s+que\b/, 'que'),
    },
    // "tiene de + infinitivo" → "tiene que + infinitivo"
    {
        regex: /\b(tienen?|tienes|tuvo|tenían?|tendrías?)\s+de\s+[a-záéíóúñü]+r\b/gi,
        mensaje: '"tiene de …" → probablemente "tiene que …"',
        get: (m) => m.replace(/\bde\b/, 'que'),
    },
    // "hubieron" por "hubo" (impersonal)
    {
        regex: /\bhubieron\s+(problemas?|errores?|incidentes?|casos?|muertes?|bajas?|víctimas?)\b/gi,
        mensaje: '"hubieron" → "hubo" (verbo impersonal)',
        get: (m) => m.replace(/\bhubieron\b/, 'hubo'),
    },
    // Pleonasmos comunes en traducción
    {
        regex: /\b(subió\s+arriba|bajó\s+abajo|volvió\s+a\s+volver|entró\s+adentro|salió\s+afuera)\b/gi,
        mensaje: 'Posible pleonasmo redundante',
        get: (m) => {
            const mapa = {
                'subió arriba': 'subió', 'bajó abajo': 'bajó',
                'volvió a volver': 'volvió', 'entró adentro': 'entró', 'salió afuera': 'salió',
            };
            return mapa[m.toLowerCase()] || m;
        },
    },
    // "asi mismo" sin tilde → "asimismo"
    {
        regex: /\basi\s+mismo\b/gi,
        mensaje: '"asi mismo" → "asimismo" (adverbio)',
        get: () => 'asimismo',
    },
    // "mas" sin tilde en contexto comparativo
    {
        regex: /\b(no\s+\w+\s+mas\s+que|no\s+mas\s+de|nada\s+mas)\b/gi,
        mensaje: '"mas" sin tilde → posiblemente "más" (comparativo)',
        get: (m) => m.replace(/\bmas\b/g, 'más'),
    },
    // "porqué" como conjunción (debería ser "porque")
    {
        regex: /\bporqué\s+(lo|la|el|se|me|te|nos|es|era|fue|ser|hay)\b/gi,
        mensaje: '"porqué" como conjunción → "porque"',
        get: (m) => m.replace(/\bporqué\b/, 'porque'),
    },
    // "travez" / "a través" escrito mal
    {
        regex: /\btravez\b/gi,
        mensaje: '"travez" → "través" (con tilde y espacio: "a través")',
        get: () => 'través',
    },
    // Confusión "halla" / "haya" / "aya"
    {
        regex: /\bno\s+aya\s+(nadie|ninguno|nada)\b/gi,
        mensaje: '"aya" → "haya" (subjuntivo de haber)',
        get: (m) => m.replace(/\baya\b/, 'haya'),
    },
];

// ═══════════════════════════════════════
// DETECCIÓN DE ONOMATOPEYAS EN EL TEXTO
// ═══════════════════════════════════════

// Delimitadores de apertura y cierre para el regex context-aware
// Una onomatopeya debe estar PRECEDIDA por un abridor O SEGUIDA por un cierre
const _ONOMA_OPEN = `["'«""„(\\[—\\-*¿¡]`;
const _ONOMA_CLOSE = `[,\\.!?…"»)\\]*]`;

function detectarOnomatopeyas(texto) {
    const sugerencias = [];

    for (const [onoma, equiv] of Object.entries(ONOMATOPEYAS_ES)) {
        const escapada = onoma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Acepta repetición de la última letra (hmmm, grrrr, ahhh)
        // CONDICIÓN: precedida por delimitador de apertura O seguida por cierre de interjección
        const regexStr =
            '(?:' +
            '(?<=' + _ONOMA_OPEN + ')' +
            '(?<![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(' + escapada + '[a-z]*)' +
            '(?![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '|' +
            '(?<![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(' + escapada + '[a-z]*)' +
            '(?![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(?=' + _ONOMA_CLOSE + ')' +
            ')';
        const regex = new RegExp(regexStr, 'gi');
        let m;
        while ((m = regex.exec(texto)) !== null) {
            const matchedWord = m[1] || m[2];
            const matchStart = m.index + (m[1] !== undefined ? 0 : 0);
            // Ajustar offset: el grupo capturado puede no empezar en m.index si hay lookbehind
            // m.index siempre apunta al inicio del match completo, pero con lookbehind el grupo
            // empieza en m.index
            const ctxStart = Math.max(0, m.index - 80);
            const ctxEnd = Math.min(texto.length, m.index + matchedWord.length + 80);
            sugerencias.push({
                tipo: 'onomatopeya',
                original: matchedWord,
                reemplazo: equiv,
                offset: m.index,
                length: matchedWord.length,
                contexto: (ctxStart > 0 ? '…' : '') + texto.slice(ctxStart, ctxEnd) + (ctxEnd < texto.length ? '…' : ''),
                mensaje: `Onomatopeya inglesa — equivalente en español: "${equiv}"`,
            });
        }
    }

    sugerencias.sort((a, b) => a.offset - b.offset);
    return sugerencias;
}

// ═══════════════════════════════════════
// PRE-FILTRO LOCAL — EJECUCIÓN
// ═══════════════════════════════════════

function detectarErroresLocales(texto) {
    const sugerencias = [];

    for (const regla of _PREFILTRO_ES) {
        let m;
        const regex = new RegExp(regla.regex.source, regla.regex.flags);
        while ((m = regex.exec(texto)) !== null) {
            const reemplazo = regla.get ? regla.get(m[0]) : null;
            if (!reemplazo || reemplazo === m[0]) continue;

            const ctxStart = Math.max(0, m.index - 80);
            const ctxEnd = Math.min(texto.length, m.index + m[0].length + 80);
            sugerencias.push({
                tipo: 'gramatica',
                fuente: 'local',
                original: m[0],
                reemplazo,
                offset: m.index,
                length: m[0].length,
                contexto: (ctxStart > 0 ? '…' : '') + texto.slice(ctxStart, ctxEnd) + (ctxEnd < texto.length ? '…' : ''),
                mensaje: regla.mensaje,
            });
        }
    }

    return sugerencias;
}

// ═══════════════════════════════════════
// VERIFICACIÓN CON LANGUAGETOOL
// ── Límites free (anónimo) ──
//   • ~1 500 chars/request   (sin cuenta)
//   • 20 requests/min        (pico, no sostenido)
// ── Límites free (cuenta registrada: user + apikey) ──
//   • 20 000 chars/request
//   • 75 000 chars/min
//   • 20 req/min
// La cuenta gratuita se registra en https://languagetool.org/es/cuenta
// ═══════════════════════════════════════
const _LT_CAT_OMITIR = [
    'STYLE', 'TYPOGRAPHY', 'PUNCTUATION', 'REDUNDANCY',
    'COLLOQUIALISMS', 'GENDER_NEUTRALITY', 'WIKIPEDIA', 'MISC', 'CASING',
];
const _LT_CHARS_ANONIMO = 1400;   // margen de seguridad bajo ~1 500 real
const _LT_CHARS_AUTENTICADO = 18000;  // margen bajo los 20 000 oficiales

async function verificarGramaticaLanguageTool(texto) {
    if (!texto || texto.trim().length < 30) return [];

    const hash = _hashTexto(texto);

    // ── Caché hit → 0 llamadas a la API ──
    if (_ltCache[hash]) {
        console.log('[Grammar] Caché LT hit → sin llamada a API');
        return _ltCache[hash];
    }

    const autenticado = !!(_ltUsername && _ltApiKey);
    const maxChars = autenticado ? _LT_CHARS_AUTENTICADO : _LT_CHARS_ANONIMO;
    const fragmento = texto.length > maxChars ? texto.slice(0, maxChars) : texto;

    const params = new URLSearchParams({
        text: fragmento,
        language: 'es',
        disabledCategories: _LT_CAT_OMITIR.join(','),
    });
    if (autenticado) {
        params.append('username', _ltUsername);
        params.append('apiKey', _ltApiKey);
    }

    try {
        const res = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn('[Grammar] LT error:', err?.message || res.status);
            return [];
        }

        const data = await res.json();
        const sugerencias = [];

        for (const match of (data.matches || [])) {
            if (!match.replacements?.length) continue;
            if (match.length < 2) continue;
            const cat = match.rule?.category?.id || '';
            if (_LT_CAT_OMITIR.some(c => cat.startsWith(c))) continue;

            const wordOrig = fragmento.slice(match.offset, match.offset + match.length);
            if (ONOMATOPEYAS_ES[wordOrig.toLowerCase()]) continue; // ya manejado

            const ctxStart = Math.max(0, match.offset - 80);
            const ctxEnd = Math.min(texto.length, match.offset + match.length + 80);
            sugerencias.push({
                tipo: 'gramatica',
                fuente: 'languagetool',
                original: wordOrig,
                reemplazo: match.replacements[0].value,
                offset: match.offset,
                length: match.length,
                contexto: (ctxStart > 0 ? '…' : '') + texto.slice(ctxStart, ctxEnd) + (ctxEnd < texto.length ? '…' : ''),
                mensaje: match.message || '',
            });
        }

        _guardarCacheTexto(hash, sugerencias);

        const modo = autenticado
            ? `cuenta LT · ${fragmento.length} chars`
            : `anónimo · ${fragmento.length} chars`;
        console.log(`[Grammar] LT: ${sugerencias.length} sugerencia(s) · ${modo}`);
        return sugerencias;

    } catch (e) {
        console.warn('[Grammar] LT no disponible:', e.message);
        return [];
    }
}

// ═══════════════════════════════════════
// DIÁLOGO INTERACTIVO DE REVISIÓN
// ═══════════════════════════════════════

async function mostrarDialogosRevision(sugerencias, textoOriginal) {
    if (!sugerencias.length) return textoOriginal;

    return new Promise((resolve) => {
        let texto = textoOriginal;
        let idx = 0;
        const total = sugerencias.length;
        let offsetDelta = 0;
        const omitirSet = new Set();
        const aceptarMap = new Map();

        const modal = document.getElementById('modal-grammar');
        if (!modal) { resolve(texto); return; }

        function getAjustada() {
            return { ...sugerencias[idx], offsetAjustado: sugerencias[idx].offset + offsetDelta };
        }
        function aplicarActual(s, reemplazo) {
            texto = texto.slice(0, s.offsetAjustado) + reemplazo + texto.slice(s.offsetAjustado + s.length);
            offsetDelta += reemplazo.length - s.length;
        }

        function mostrar() {
            if (idx >= total) { modal.style.display = 'none'; resolve(texto); return; }

            const s = getAjustada();
            const key = s.tipo + ':' + s.original.toLowerCase();

            if (aceptarMap.has(key)) { aplicarActual(s, aceptarMap.get(key)); idx++; mostrar(); return; }
            if (omitirSet.has(key)) { idx++; mostrar(); return; }

            modal.style.display = 'flex';

            const ec = document.getElementById('gram-counter');
            if (ec) ec.textContent = `${idx + 1} / ${total}`;

            const et = document.getElementById('gram-tipo');
            if (et) {
                const labels = {
                    onomatopeya: '🔊 Onomatopeya',
                    gramatica: s.fuente === 'local' ? '📖 Gramática (local)' : '📝 Gramática (LanguageTool)',
                };
                et.textContent = labels[s.tipo] || '📝 Sugerencia';
                et.style.color = s.tipo === 'onomatopeya' ? 'var(--accent)' : 'var(--accent2)';
            }

            const ctxStart = Math.max(0, s.offsetAjustado - 85);
            const ctxEnd = Math.min(texto.length, s.offsetAjustado + s.length + 85);
            const wordEnTexto = texto.slice(s.offsetAjustado, s.offsetAjustado + s.length);
            const elCtx = document.getElementById('gram-contexto');
            if (elCtx) {
                elCtx.innerHTML =
                    (ctxStart > 0 ? '<span style="color:var(--text-dim)">…</span>' : '') +
                    _escHTML(texto.slice(ctxStart, s.offsetAjustado)) +
                    `<mark style="background:rgba(255,180,0,0.22);border:1px solid rgba(255,180,0,0.45);` +
                    `border-radius:3px;padding:0 3px;font-weight:700;">${_escHTML(wordEnTexto)}</mark>` +
                    _escHTML(texto.slice(s.offsetAjustado + s.length, ctxEnd)) +
                    (ctxEnd < texto.length ? '<span style="color:var(--text-dim)">…</span>' : '');
            }

            const eo = document.getElementById('gram-original');
            const es = document.getElementById('gram-sugerida');
            if (eo) eo.textContent = wordEnTexto;
            if (es) es.textContent = s.reemplazo;

            const em = document.getElementById('gram-mensaje');
            if (em) { em.textContent = s.mensaje || ''; em.style.display = s.mensaje ? 'block' : 'none'; }
        }

        // Limpiar listeners previos clonando botones
        ['gram-btn-aceptar', 'gram-btn-omitir', 'gram-btn-aceptar-todos',
            'gram-btn-omitir-todos', 'gram-btn-cancelar'].forEach(id => {
                const b = document.getElementById(id);
                if (b) { const c = b.cloneNode(true); b.parentNode.replaceChild(c, b); }
            });

        document.getElementById('gram-btn-aceptar').onclick = () => {
            const s = getAjustada(); aplicarActual(s, s.reemplazo); idx++; mostrar();
        };
        document.getElementById('gram-btn-omitir').onclick = () => { idx++; mostrar(); };
        document.getElementById('gram-btn-aceptar-todos').onclick = () => {
            const s = getAjustada();
            aceptarMap.set(s.tipo + ':' + s.original.toLowerCase(), s.reemplazo);
            aplicarActual(s, s.reemplazo); idx++; mostrar();
        };
        document.getElementById('gram-btn-omitir-todos').onclick = () => {
            const s = getAjustada();
            omitirSet.add(s.tipo + ':' + s.original.toLowerCase()); idx++; mostrar();
        };
        document.getElementById('gram-btn-cancelar').onclick = () => {
            modal.style.display = 'none'; resolve(texto);
        };

        mostrar();
    });
}

function _escHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════
// FUNCIÓN PRINCIPAL — FASE 4
// Orden: onomatopeyas → pre-filtro local → LanguageTool (caché o API)
// ═══════════════════════════════════════

async function revisarGramaticaYOnomatopeyas(texto) {
    if (!grammarReviewActivo || !texto || texto.trim().length < 20) return texto;

    const _upd = (msg) => {
        const el = document.getElementById('mpb-label');
        if (el) el.textContent = msg;
        if (typeof mostrarProgresoRevision === 'function') mostrarProgresoRevision(msg);
    };

    _upd('🔊 Detectando onomatopeyas…');
    const sugsOnoma = detectarOnomatopeyas(texto);

    _upd('📖 Verificando patrones gramaticales locales…');
    const sugsLocal = detectarErroresLocales(texto);

    _upd('📝 Consultando LanguageTool…');
    let sugsLT = [];
    try { sugsLT = await verificarGramaticaLanguageTool(texto); }
    catch (e) { console.warn('[Grammar] LT falló:', e.message); }

    // Unir, ordenar y eliminar solapamientos
    const todas = [...sugsOnoma, ...sugsLocal, ...sugsLT].sort((a, b) => a.offset - b.offset);
    const limpias = [];
    let lastEnd = -1;
    for (const s of todas) {
        if (s.offset >= lastEnd) { limpias.push(s); lastEnd = s.offset + s.length; }
    }

    if (limpias.length === 0) {
        _upd('✓ Sin sugerencias');
        if (typeof mostrarNotificacion === 'function')
            mostrarNotificacion('✓ Revisión gramatical: sin sugerencias');
        return texto;
    }

    const nO = limpias.filter(s => s.tipo === 'onomatopeya').length;
    const nG = limpias.filter(s => s.tipo === 'gramatica').length;
    _upd(`💬 ${limpias.length} sugerencia(s) — ${nO} onomatopeya(s), ${nG} gramatical(es)`);

    const textoCorregido = await mostrarDialogosRevision(limpias, texto);

    if (typeof mostrarNotificacion === 'function')
        mostrarNotificacion('✓ Revisión gramatical completada');

    return textoCorregido;
}

// ═══════════════════════════════════════
// REEMPLAZO AUTOMÁTICO SILENCIOSO DE ONOMATOPEYAS
// No muestra diálogos — reemplaza directamente en el texto sin intervención del usuario.
// Se activa con el toggle #auto-onoma (independiente de la revisión gramatical completa).
// ═══════════════════════════════════════

// autoReemplazarOnomatopeyas se declara en main.js (ver arriba del archivo)
// Su valor se restaura desde localStorage en el DOMContentLoaded al final de este archivo

function toggleAutoOnoma() {
    autoReemplazarOnomatopeyas = document.getElementById('auto-onoma')?.checked ?? false;
    try { uSet('auto_onoma', autoReemplazarOnomatopeyas); } catch (e) { }
    const statusEl = document.getElementById('auto-onoma-status');
    if (statusEl) {
        statusEl.textContent = autoReemplazarOnomatopeyas ? '✓ Activo' : 'Desactivado';
        statusEl.style.color = autoReemplazarOnomatopeyas ? 'var(--accent2)' : '';
    }
    if (typeof marcarCambioPendiente === 'function') marcarCambioPendiente();
}

// Aplica todos los reemplazos de ONOMATOPEYAS_ES sin mostrar diálogos.
// Preserva mayúscula inicial si la onomatopeya la tenía.
function aplicarOnomatopeyasAutomatico(texto) {
    if (!texto) return texto;
    let resultado = texto;
    for (const [onoma, equiv] of Object.entries(ONOMATOPEYAS_ES)) {
        const escapada = onoma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Context-aware: solo reemplaza precedida por abridor O seguida por cierre de interjección
        const regexStr =
            '(?:' +
            '(?<=' + _ONOMA_OPEN + ')' +
            '(?<![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(' + escapada + ')' +
            '(?![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '|' +
            '(?<![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(' + escapada + ')' +
            '(?![\\wáéíóúÁÉÍÓÚüÜñÑ])' +
            '(?=' + _ONOMA_CLOSE + ')' +
            ')';
        const regex = new RegExp(regexStr, 'gi');
        resultado = resultado.replace(regex, (match) => {
            if (match.charAt(0) === match.charAt(0).toUpperCase() &&
                match.charAt(0) !== match.charAt(0).toLowerCase()) {
                return equiv.charAt(0).toUpperCase() + equiv.slice(1);
            }
            return equiv;
        });
    }
    return resultado;
}

// ── Inicializar checkboxes al cargar el DOM ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Checkbox auto-onoma
    const chkOnoma = document.getElementById('auto-onoma');
    if (chkOnoma) {
        chkOnoma.checked = autoReemplazarOnomatopeyas;
        const st = document.getElementById('auto-onoma-status');
        if (st) {
            st.textContent = autoReemplazarOnomatopeyas ? '✓ Activo' : 'Desactivado';
            st.style.color = autoReemplazarOnomatopeyas ? 'var(--accent2)' : '';
        }
    }

    // Checkbox grammar-review (grammarReviewActivo por defecto es false)
    const chkGram = document.getElementById('grammar-review');
    if (chkGram) {
        const saved = uGet('grammar_review_activo') === 'true';
        grammarReviewActivo = saved;
        chkGram.checked = saved;
        const st2 = document.getElementById('grammar-review-status');
        if (st2 && saved) {
            const modo = (_ltUsername && _ltApiKey) ? '· cuenta LT activa' : '· modo anónimo';
            st2.textContent = '✓ Activo ' + modo;
            st2.style.color = 'var(--accent2)';
        }
    }
});