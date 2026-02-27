// ═══════════════════════════════════════
// VIDEO.JS — Visor cinematográfico (extraído del index.html original)
// Incluye: overlay HTML, imágenes IA, controles, música, exportar video
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// GRABACIÓN DE AUDIO (TTS + Música)
// ═══════════════════════════════════════

// mediaRecorder, grabacionChunks, grabando, destinationNode, audioCtxGrab → declarados en tts.js

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
        if (ambientGainNode) ambientGainNode.connect(dest);

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

// ═══════════════════════════════════════
// video / VISTA SPOTIFY
// ═══════════════════════════════════════

let videoAnimFrame = null;
let videoCanvas = null;
let videoCtx = null;
let videoActive = false;

const video_BG = '#0a0908';
const video_TEXT_DIM = '#5a5248';
const video_TEXT = '#e8e0d0';
const video_HIGHLIGHT = '#c8a96e';
const video_SECONDARY = 'rgba(200,169,110,0.3)';

function abrirvideo() {
    const overlay = document.getElementById('video-overlay');
    overlay.classList.add('active');
    videoCanvas = document.getElementById('video-canvas');
    videoCtx = videoCanvas.getContext('2d');
    videoActive = true;
    // Ocultar el panel principal para que no se filtre detrás del overlay
    const mainPanel = document.querySelector('.main-panel');
    if (mainPanel) mainPanel.style.visibility = 'hidden';

    const capitulo = document.getElementById('current-chapter-title').textContent || 'Capítulo';


    // Reiniciar sistema de imágenes IA para el nuevo capítulo
    aiSlotSolicitado = {};
    aiCurrentSlot = -1;
    aiActivePanel = 'a';
    aiSlotActivo = false;
    aiLoadingSlot = null;
    document.getElementById('ai-bg-a').style.opacity = '0';
    document.getElementById('ai-bg-b').style.opacity = '0';
    document.getElementById('ai-bg-overlay').style.background = 'rgba(8,7,6,0)';

    // Activar imágenes IA automáticamente al abrir el visor
    if (!aiImagesEnabled) {
        aiImagesEnabled = true;
        const btn = document.getElementById('btn-toggle-ai-img');
        if (btn) { btn.classList.add('ai-active'); btn.textContent = '🖼 IA ON'; }
    }
    // Siempre reconstruir el slot map (puede haber cambiado de capítulo)
    // NOTA: precalentarPoolPixabay se llama DENTRO de detectarUniverso, después de conocer el universo
    if (aiImagesEnabled) {
        detectarUniverso();
        buildAiSlotMap();
        // Si ya hay sentences cargadas, solicitar inmediatamente; si no, esperar
        const hayTexto = typeof sentences !== 'undefined' && sentences && sentences.length > 0;
        if (hayTexto) {
            setTimeout(() => {
                solicitarImagenParaSlot(0);
                // Solo pre-cargar 1 slot adelante, no 2, para reducir requests
                setTimeout(() => solicitarImagenParaSlot(1), 800);
            }, 30);
        }
    }

    rendervideoFrame();
    _inyectarSidebarToolbar();
    // Aplicar filtro grayscale según estado actual (activo por defecto)
    _aplicarFiltroGrayscale(_grayscaleActive);
    const _bwBtn = document.getElementById('vsb-bw');
    if (_bwBtn) {
        _bwBtn.classList.toggle('vsb-active', _grayscaleActive);
        _bwBtn.title = _grayscaleActive ? 'Volver a color' : 'Escala de grises';
        _bwBtn.textContent = _grayscaleActive ? '🎨' : '⬜';
    }
    // Poblar el índice de capítulos y el título junto al contador
    poblarIndicevideo();
    const capEl = document.getElementById('kp-chapter');
    if (capEl) {
        const titleEl = document.getElementById('current-chapter-title');
        const chapSel = document.getElementById('chapters');
        const selectedText = chapSel?.options[chapSel?.selectedIndex]?.text || '';
        capEl.textContent = (titleEl?.textContent && titleEl.textContent !== 'Ningún capítulo seleccionado')
            ? titleEl.textContent : selectedText;
    }
    _syncAmbientBtn();
    // Sincronizar sliders de volumen con los valores actuales
    setTimeout(() => document.dispatchEvent(new Event('videoOpened')), 100);
}

function cerrarvideo() {
    videoActive = false;
    document.getElementById('video-overlay').classList.remove('active');
    if (videoAnimFrame) cancelAnimationFrame(videoAnimFrame);
    // Restaurar visibilidad del panel principal
    const mainPanel = document.querySelector('.main-panel');
    if (mainPanel) mainPanel.style.visibility = '';
}

// Cerrar modo video con tecla Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && videoActive) {
        cerrarvideo();
    }
});

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// Measures lines height for a text block
function measureTextBlock(ctx, text, maxW, lineH) {
    return wrapText(ctx, text, maxW).length * lineH;
}

function drawvideoScene(ctx, W, H, current, total) {
    ctx.globalAlpha = (typeof _videoTextOpacity !== 'undefined') ? _videoTextOpacity : 1;
    // Background: sólido si no hay imágenes IA, transparente si las hay (esperando o mostrando)
    if (aiImagesEnabled) {
        ctx.clearRect(0, 0, W, H);
        if (aiSlotActivo) {
            // Overlay de viñeta leve sobre la imagen CSS
            ctx.fillStyle = 'rgba(8,7,6,0.35)';
            ctx.fillRect(0, 0, W, H);
        }
    } else {
        ctx.fillStyle = video_BG;
        ctx.fillRect(0, 0, W, H);
    }

    // Vignette (togglable)
    if (typeof _vignetteEnabled === 'undefined' || _vignetteEnabled) {
        const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
    }

    // Header eliminado del canvas — título y contador se muestran bajo la barra de progreso exterior

    if (!sentences || total === 0) {
        ctx.fillStyle = video_TEXT_DIM;
        ctx.font = 'italic 26px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.fillText('Inicia la reproducción para ver el video', W / 2, H / 2);
        return;
    }

    const MAX_W = W * 0.78;
    const CX = W / 2;

    // ── Layout dinámico: calcular alturas reales antes de dibujar ──
    const CUR_SIZE = (typeof _videoFontSize !== 'undefined') ? _videoFontSize : 36;
    const PREV_SIZE = Math.round(CUR_SIZE * 0.61);
    const NEXT_SIZE = 20;
    const PREV_LH = 32;
    const CUR_LH = 52;
    const NEXT_LH = 30;
    const GAP = 28; // espacio entre bloques
    const FONT = (typeof _videoFontFamily !== 'undefined') ? _videoFontFamily : 'Georgia,serif';

    // ─── helper: dibujar texto con borde opcional ───
    function drawStrokedText(text, x, y, isCurrent) {
        const sType = (typeof _textStrokeType !== 'undefined') ? _textStrokeType : 'solid';
        const sWidth = (typeof _textStrokeWidth !== 'undefined') ? _textStrokeWidth : 1;
        if (sType !== 'none' && sWidth > 0) {
            ctx.save();
            ctx.lineWidth = sWidth * 2;
            ctx.lineJoin = 'round';
            if (sType === 'gradient') {
                const c1 = (typeof _textStrokeColor1 !== 'undefined') ? _textStrokeColor1 : '#000000';
                const c2 = (typeof _textStrokeColor2 !== 'undefined') ? _textStrokeColor2 : '#1a0a00';
                const grd = ctx.createLinearGradient(x - MAX_W / 2, y - CUR_SIZE, x + MAX_W / 2, y);
                grd.addColorStop(0, c1);
                grd.addColorStop(1, c2);
                ctx.strokeStyle = grd;
            } else {
                ctx.strokeStyle = (typeof _textStrokeColor1 !== 'undefined') ? _textStrokeColor1 : '#000000';
            }
            ctx.strokeText(text, x, y);
            ctx.restore();
        }
        ctx.fillText(text, x, y);
    }

    ctx.font = `italic ${CUR_SIZE}px ${FONT}`;
    const curLines = wrapText(ctx, sentences[current] || '', MAX_W);
    const curBlockH = curLines.length * CUR_LH;

    ctx.font = `${PREV_SIZE}px ${FONT}`;
    const prevLines = current > 0 ? wrapText(ctx, sentences[current - 1], MAX_W) : [];
    const prevBlockH = prevLines.length * PREV_LH;

    ctx.font = `${NEXT_SIZE}px ${FONT}`;
    const nextLines = current < total - 1 ? wrapText(ctx, sentences[current + 1], MAX_W) : [];
    const nextBlockH = nextLines.length * NEXT_LH;

    // Área usable: todo el canvas (sin header ni footer en canvas)
    const USABLE_TOP = 28;
    const USABLE_BOT = H - 28;
    const USABLE_H = USABLE_BOT - USABLE_TOP;

    const totalH = prevBlockH + (prevLines.length ? GAP : 0)
        + curBlockH
        + (nextLines.length ? GAP : 0)
        + nextBlockH;

    // Start Y so the whole layout is vertically centered
    let startY = USABLE_TOP + (USABLE_H - totalH) / 2;
    startY = Math.max(startY, USABLE_TOP + 10);

    let drawY = startY;

    // Draw previous (dim, above)
    if (prevLines.length) {
        ctx.font = `${PREV_SIZE}px ${FONT}`;
        ctx.fillStyle = video_TEXT_DIM;
        ctx.textAlign = 'center';
        prevLines.forEach((l, i) => {
            drawStrokedText(l, CX, drawY + i * PREV_LH, false);
        });
        drawY += prevBlockH + GAP;
    }

    // Draw current — sin glow, color mutable
    ctx.font = `italic ${CUR_SIZE}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    ctx.fillStyle = (typeof _videoTextColor !== 'undefined') ? _videoTextColor : video_HIGHLIGHT;
    curLines.forEach((l, i) => {
        drawStrokedText(l, CX, drawY + i * CUR_LH, true);
    });
    drawY += curBlockH + GAP;

    // Draw next (very dim, below)
    if (nextLines.length) {
        ctx.font = `${NEXT_SIZE}px ${FONT}`;
        ctx.fillStyle = 'rgba(200,169,110,0.22)';
        ctx.textAlign = 'center';
        nextLines.forEach((l, i) => {
            drawStrokedText(l, CX, drawY + i * NEXT_LH, false);
        });
    }

    ctx.globalAlpha = 1.0;

    // Indicador de carga de imagen IA
    if (aiImagesEnabled && aiLoadingSlot !== null) {
        ctx.font = '11px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(126,184,154,0.45)';
        ctx.fillText('✦ generando imagen con IA...', W - 18, H - 16);
    }
}

function rendervideoFrame() {
    if (!videoActive) return;
    const W = videoCanvas.offsetWidth || window.innerWidth;
    const H = videoCanvas.offsetHeight || window.innerHeight;
    if (videoCanvas.width !== W || videoCanvas.height !== H) {
        videoCanvas.width = W;
        videoCanvas.height = H;
    }
    drawvideoScene(videoCtx, W, H, currentSentenceIndex, sentences.length);
    videoAnimFrame = requestAnimationFrame(rendervideoFrame);
}

// ═══════════════════════════════════════
// SISTEMA DE IMÁGENES IA — Claude + Pollinations.AI (model=flux)
// ═══════════════════════════════════════

let aiImagesEnabled = false;
let aiSlotActivo = false;
let aiLoadingSlot = null;
let aiCurrentSlot = -1;
let aiActivePanel = 'a';

// Cambiar imagen cada ~1400 chars acumulados (≈ 8-12 párrafos de novela web)
const AI_CHARS_PER_IMAGE = 1400;
let aiSlotSolicitado = {};
let aiSentenceToSlot = [];   // idx oración → número de slot

// Construir el mapa de slots basado en acumulación de chars reales
function buildAiSlotMap() {
    aiSentenceToSlot = [];
    if (!sentences || sentences.length === 0) return;
    let slot = 0, chars = 0;
    for (let i = 0; i < sentences.length; i++) {
        aiSentenceToSlot[i] = slot;
        chars += sentences[i].length;
        if (chars >= AI_CHARS_PER_IMAGE) { slot++; chars = 0; }
    }
}

function getSlotForSentence(idx) {
    return (aiSentenceToSlot && aiSentenceToSlot[idx] !== undefined)
        ? aiSentenceToSlot[idx]
        : Math.floor(idx / 12);
}

// Fragmento de texto para un slot — incluye TODO el bloque del slot sin recortar
function extraerFragmentoParaSlot(slot) {
    if (!sentences || sentences.length === 0) return '';
    const idxs = aiSentenceToSlot
        .map((s, i) => s === slot ? i : -1)
        .filter(i => i >= 0);
    if (idxs.length === 0) return sentences.slice(0, 15).join(' ');
    // Sin recorte de contexto previo — el bloque ya es suficientemente amplio
    const start = idxs[0];
    const end = idxs[idxs.length - 1] + 1;
    return sentences.slice(start, end).join(' ');
}

// aiDetectedUniverse → declarado en main.js

const AI_UNIVERSES = {
    'shadow slave': 'Shadow Slave webnovel',
    'esclavo de las sombras': 'Shadow Slave webnovel',
    'forgotten shore': 'Shadow Slave webnovel',
    'guiltythree': 'Shadow Slave webnovel',
};

// Estilos base por universo detectado
const AI_UNIVERSE_STYLES = {
    'Shadow Slave webnovel':
        'photorealistic dark fantasy, cinematic lighting, sharp focus, detailed stone and shadow environments, nightmarish eldritch corruption on physical surfaces, golden divine light cutting through darkness, realistic materials (worn stone, dark water, cracked obsidian), 8k render, no text no watermark',
};

const AI_DEFAULT_STYLE = 'photorealistic cinematic scene, detailed environment, dramatic lighting, sharp focus, 8k, no text no watermark, no abstract art';

function detectarUniverso() {
    const fuentes = [
        document.getElementById('file-name')?.textContent || '',
        document.getElementById('current-chapter-title')?.textContent || '',
        (sentences || []).slice(0, 30).join(' ')
    ].join(' ').toLowerCase();

    aiDetectedUniverse = null;
    for (const [key, val] of Object.entries(AI_UNIVERSES)) {
        if (fuentes.includes(key)) {
            aiDetectedUniverse = val;
            console.log(`📚 Universo detectado: ${val}`);
            mostrarNotificacion(`📚 Universo: ${val}`);
            // notificarUniversoDetectado es async: si el universo no tiene queries estáticas,
            // espera a que Claude las genere ANTES de cargar el pool.
            // precalentarPoolPixabay y refrescarSmartPool se invocan al final de
            // notificarUniversoDetectado, una vez que las queries ya están listas.
            if (typeof notificarUniversoDetectado === 'function') {
                notificarUniversoDetectado(val);
            }

            // La música también se inicia desde notificarUniversoDetectado,
            // después de que Claude haya generado las freesoundQueries del universo.
            break;
        }
    }
    // Si no se detectó universo, no cargar pool con _default — esperar a que el usuario
    // seleccione un capítulo con universo reconocible o lo cargue manualmente
    if (!aiDetectedUniverse) {
        console.log('📚 Sin universo reconocido — pool de imágenes no se precalienta');
    }
}

function getStyleTag() {
    if (aiDetectedUniverse && AI_UNIVERSE_STYLES[aiDetectedUniverse]) {
        return AI_UNIVERSE_STYLES[aiDetectedUniverse];
    }
    return AI_DEFAULT_STYLE;
}

function toggleAIImages() {
    aiImagesEnabled = !aiImagesEnabled;
    const btn = document.getElementById('btn-toggle-ai-img');
    if (aiImagesEnabled) {
        btn.classList.add('ai-active');
        btn.textContent = '🖼 IA ON';
        detectarUniverso();
        buildAiSlotMap();
        mostrarNotificacion('🖼 Imágenes IA activadas');
        aiSlotSolicitado = {};
        aiCurrentSlot = -1;
        aiActivePanel = 'a';
        const slot = getSlotForSentence(typeof currentSentenceIndex !== 'undefined' ? currentSentenceIndex : 0);
        solicitarImagenParaSlot(slot);
        // Pre-cargar solo 1 slot adelante (no 2) para reducir requests en APIs con límites
        setTimeout(() => solicitarImagenParaSlot(slot + 1), 1200);
    } else {
        btn.classList.remove('ai-active');
        btn.textContent = '🖼 IA Imágenes';
        document.getElementById('ai-bg-a').style.opacity = '0';
        document.getElementById('ai-bg-b').style.opacity = '0';
        document.getElementById('ai-bg-overlay').style.background = 'rgba(8,7,6,0)';
        aiSlotActivo = false;
        mostrarNotificacion('Imágenes IA desactivadas');
    }
}

// ── Cache de prompts ──
const aiPromptCache = {};

// ══════════════════════════════════════════════════════════
// ANÁLISIS DE ESCENA: un solo pase sobre el fragmento
// Devuelve { tipo, prompt } sin duplicar lógica de detección
// ══════════════════════════════════════════════════════════

// Tabla de escenarios: cada entrada tiene keywords, descripción y tipo
const SCENE_TABLE = [
    { tipo: 'lab', kw: /laboratorio|lab\b|experiment|científico|scientist|monitor|cable|specimen/, desc: 'underground science laboratory with metal tables, blinking monitors, tangled cables, concrete walls, harsh fluorescent overhead light' },
    { tipo: 'hospital', kw: /hospital|enfermería|nurse|médico|doctor|clínica|clinic|corridor|fluorescent/, desc: 'hospital corridor with white tiled floor, rows of empty beds behind glass, sterile pale light from ceiling strips' },
    { tipo: 'dungeon', kw: /prisión|celda|prison|jail|dungeon|calabozo|shackle|iron bar|grating/, desc: 'stone dungeon cell with iron-bar door, straw on the floor, single torch on damp wall, dripping water' },
    { tipo: 'mansion', kw: /mansión|manor|palacio|palace|salón|hall|marble|chandelier|mahogany/, desc: 'grand manor hall with marble floor, high painted ceiling, dusty chandeliers, tall arched windows letting in grey light' },
    { tipo: 'forest', kw: /bosque|selva|forest|jungle|árbol|tree|canopy|gnarled|roots|undergrowth/, desc: 'dense ancient forest floor covered in moss and roots, shafts of green light filtering through a high forest canopy' },
    { tipo: 'city', kw: /ciudad|city|calle|street|edificio|building|urbano|neon|asphalt|dystopian/, desc: 'rain-soaked city street at night, puddles reflecting neon signs, towering concrete buildings with lit windows' },
    { tipo: 'castle', kw: /castillo|fortress|torre|tower|muralla|castle|battlement|rampart|raven/, desc: 'castle ramparts at dusk, crumbling stone battlements, iron gate, orange sky behind distant mountains' },
    { tipo: 'cave', kw: /cueva|cave|cavern|túnel|tunnel|underground|stalactite|bioluminescent/, desc: 'vast underground cavern with stalactites, glowing blue fungi on wet stone walls, shallow dark water on the floor' },
    { tipo: 'desert', kw: /desierto|wasteland|arena|sand|desert|cracked earth|scorched|blood-red sky/, desc: 'cracked desert plain under a blood-orange sky, bleached ruins half-buried in sand, no vegetation' },
    { tipo: 'ocean', kw: /mar|ocean|sea|costa|coast|playa|beach|puerto|cliff|wave|storm surge/, desc: 'rocky ocean coastline during a storm, huge waves crashing on black cliffs, dark overcast sky, sea spray' },
    { tipo: 'mountain', kw: /montaña|mountain|cumbre|peak|cliff|acantilado|ridge|glacier/, desc: 'high mountain ridge shrouded in cloud, jagged grey rock face, snow patches, sheer drop into fog below' },
    { tipo: 'temple', kw: /templo|temple|shrine|sanctuario|altar|pillar|carved stone|relic/, desc: 'ancient stone temple interior, moss on carved columns, dusty sunlight beams through a collapsed ceiling, stone altar ahead' },
    { tipo: 'market', kw: /mercado|market|plaza|tavern|taberna|inn|stalls|cobblestone/, desc: 'medieval cobblestone market square with wooden stalls, torches on iron poles, people gathered in wool cloaks' },
    { tipo: 'space', kw: /nave|spaceship|space\b|cosmos|espacio|galaxy|nebula|starship|orbit/, desc: 'interior of a derelict spaceship, exposed wiring on metal walls, emergency red lighting, stars visible through cracked viewport' },
    { tipo: 'room', kw: /habitación|cuarto|room|bedroom|dormitorio|estudio|candle|wooden table/, desc: 'small stone room with a wooden table, candlelight casting warm shadows, simple bed against the wall, low ceiling' },
];

// Modificadores de acción (se añaden al escenario si coinciden)
const ACTION_MODS = [
    { kw: /batalla|combate|fight|battle|lucha|clash|guerra|war/, mod: 'aftermath of a battle, broken weapons on the ground, smoke rising, torn banners' },
    { kw: /huir|escape|chase|perseguir|run|correr|flee/, mod: 'desperate flight through the scene, motion blur, urgency' },
    { kw: /ritual|ceremony|spell|hechizo|magia|magic|invocation/, mod: 'ritual circle on the floor glowing faintly, candles arranged in a pattern' },
    { kw: /muerte|death|dead|matar|kill|sangre|blood|corpse/, mod: 'ominous stillness, dark stain on the ground, scattered broken objects' },
    { kw: /silencio|quiet|alone|soledad|lonely|empty|abandoned/, mod: 'a lone figure standing still in the far distance' },
    { kw: /mid-battle|chaos|explosion|fire|burning/, mod: 'mid-battle chaos, smoke and dust in the air, figures clashing' },
];

// Modificadores de luz/hora
const LIGHT_MODS = [
    { kw: /amanecer|dawn|sunrise|alba/, mod: 'early morning, cold pale blue and gold light on the horizon' },
    { kw: /atardecer|sunset|dusk|crepúsculo/, mod: 'late afternoon, deep amber and orange light, long shadows' },
    { kw: /noche|night|midnight|medianoche|oscuridad|darkness/, mod: 'night scene, moonlight casting silver shadows, deep dark sky' },
    { kw: /lluvia|rain|storm|tormenta|thunder|trueno/, mod: 'heavy rain, water running on all surfaces, lightning flash in background' },
    { kw: /fuego|fire|llama|flame|antorcha|torch|brazier/, mod: 'warm firelight from below, orange and red flickering on walls and faces' },
    { kw: /harsh|midday|sun|sol|verano|summer|heat|calor/, mod: 'harsh midday sun, oppressive silence, deep black shadows' },
    { kw: /dim|weak|fading|pale|débil|tenue|faint/, mod: 'dim atmospheric light, fog between surfaces, muted tones' },
];

// Análisis unificado: devuelve { tipo, prompt }
// ══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN POR UNIVERSO
// Escenarios, personajes y modificadores específicos de cada obra
// ══════════════════════════════════════════════════════════════════

Object.assign(UNIVERSE_CONFIG, {
    'Shadow Slave webnovel': {
        // ── Música ambiente específica del universo ──
        ambient: {
            // Género base (debe existir en GENRE_GENERATORS y GENRE_LABELS)
            defaultGenre: 'horror',
            // Queries de Freesound ordenadas por prioridad — muy específicas al universo
            freesoundQueries: [
                'dark eldritch ambient drone',
                'nightmare horror dark atmosphere',
                'dark fantasy shadow ambient',
                'psychological horror tension drone',
                'eldritch cosmic horror music',
                'dark void ambient soundscape',
                'corrupted dark fantasy music',
                'oppressive dark orchestral tension',
            ],
            // Bonus de score por género cuando este universo está activo
            // (se suma al análisis de texto para orientar la detección)
            genreBoost: {
                horror: 8,
                suspense: 4,
                mystery: 3,
                action: 2,
            },
            // Label que se muestra en la UI
            label: '🌑 Shadow Slave',
        },
        // Sobrescribir SCENE_TABLE con locaciones propias del universo
        sceneOverrides: [
            { kw: /forgotten shore|primera orilla|ribera olvidada/i, desc: 'the Forgotten Shore, black sand beach under a crimson sky, twisted dark spires rising from the water, eldritch fog rolling in from the sea' },
            { kw: /dream realm|reino de los sueños|sueño\b/i, desc: 'the Dream Realm, impossible architecture of shifting obsidian and pale stone, gravity-defying ruins floating in black void, faint golden cracks of divine light' },
            { kw: /nightmare creature|pesadilla|dream fiend|corrupted|corrupto/i, desc: 'nightmare-corrupted landscape, black ichor spreading across stone surfaces, twisted skeletal structures, sickly green bioluminescence in the darkness' },
            { kw: /memory shard|memory palace|recuerdo|memoria/i, desc: 'a crystalline memory shard environment, fragmented reality, translucent golden planes suspended in void, echoes of a past moment frozen in amber light' },
            { kw: /saint\b|great saint|sovereign|soberano/i, desc: 'monumental battlefield of shattered stone and divine golden light, scale beyond human comprehension, massive silhouettes of Saints clashing in the distance' },
            { kw: /city of nameless|ciudad sin nombre|nameless city/i, desc: 'the City of the Nameless, ancient ruined metropolis swallowed by the Dream Realm, crumbling towers covered in dark vines, pale sky above' },
            { kw: /cave|caverna|underground|ruins|ruin|dungeon|corredor|corridor/i, desc: 'Dream Realm ruins corridor, cracked obsidian floor, pale stone walls with black corruption spreading through the cracks, ancient ornate carvings barely visible' },
            { kw: /forest|bosque|wood|árbol/i, desc: 'twisted Dream Realm forest, gnarled black trees with crystalline bark, oppressive silence, pale shafts of light filtering through a dark canopy' },
            { kw: /arena|combat|colosseum|arena|battle|lucha|fight/i, desc: 'eldritch battle arena, cracked stone floor stained with dark ichor, walls carved with ancient runes, corrupted sky above visible through broken ceiling' },
        ],
        // Descriptores de personaje específicos del universo
        characterDescs: {
            fighting: 'a lone warrior in tattered dark clothes, Aspect power emanating as shadowy tendrils, facing a massive Nightmare Creature, dramatic low-angle shot',
            fleeing: 'a survivor running through nightmare ruins, shadow-step trail behind them, corrupted creatures pursuing in the darkness',
            kneeling: 'a figure kneeling before an eldritch altar, surrounded by spreading black corruption, faint golden rune-light on the stone floor',
            sitting: 'a battle-worn figure resting against a crumbling wall, dark coat, blood on the ground, exhausted but alert',
            observing: 'a lone figure standing at the edge of a cliff overlooking a vast corrupted landscape, hood drawn, wind pulling at dark clothes',
            talking: 'two cloaked figures facing each other in tense conversation among Dream Realm ruins, faces partially obscured',
            default: 'a lone figure in dark worn clothes standing in the scene, viewed from behind, shadow Aspect power swirling faintly around them',
        },
        // Señales de personaje propias del universo para reforzar la detección
        extraCharacterSignals: [
            /\b(sunny|saint|naia|effie|cassie|nephis|mongrel|echo|aspect|nightmare creature|shadow|darkness)\b/i,
        ],
    },
});

// ══════════════════════════════════════════════════════════════════
// ANÁLISIS DE ESCENA CON DETECCIÓN DE PERSONAJES
// Decide si el prompt debe enfocar el personaje o el paisaje/entorno
// ══════════════════════════════════════════════════════════════════

// Indicadores de que el texto es mayormente DESCRIPCIÓN DE ENTORNO
const LANDSCAPE_SIGNALS = [
    /the (sky|horizon|sun|moon|stars|clouds|mist|fog|wind|rain|storm|snow|landscape|terrain|ruins|forest|ocean|mountain|desert|canyon|valley|plain|wasteland)/i,
    /el (cielo|horizonte|sol|luna|niebla|viento|lluvia|tormenta|paisaje|terreno|bosque|océano|montaña|desierto|ruinas)/i,
    /sprawling|stretching|extending|vast|endless|silent|desolate|abandoned|empty|ancient|crumbling|overgrown/i,
    /the (air|atmosphere|silence|darkness|light|shadows|glow|warmth|cold|heat|smoke|dust) (was|were|hung|filled|covered|spread|drifted)/i,
    /(rose|fell|swept|rolled|drifted|spread|loomed|towered|stretched) (across|over|through|into|beneath|above)/i,
];

// Indicadores de PRESENCIA DE PERSONAJE con acción o emoción
const CHARACTER_SIGNALS = [
    /\b(he|she|they|i|sunny|saint|naia|effie|cassie|nephis|mongrel)\b.{0,40}(said|thought|felt|looked|turned|walked|ran|stood|stared|smiled|frowned|clenched|grabbed|moved|spoke|whispered|shouted|realized|noticed|saw|heard|knew|wanted|tried|reached|pulled|pushed|held|wore|carried)/i,
    /\b[A-Z][a-z]{2,12}\b.{0,30}(said|thought|felt|looked|turned|walked|stood|stared|smiled|frowned|spoke|whispered|realized|noticed|saw|heard)/,
    /\b(his|her|their|its)\b.{0,25}(eyes|face|hands|voice|heart|breath|chest|mind|expression|gaze|lips|fists|shoulders|body)/i,
    /"[^"]{10,}"/,
    /[''][^'']{10,}['']/,
];

function detectarPersonajes(t) {
    const matches = t.match(/\b[A-Z][a-z]{2,13}\b/g) || [];
    const stopWords = new Set(['The', 'A', 'An', 'In', 'On', 'At', 'To', 'He', 'She', 'They', 'It', 'We', 'I', 'His', 'Her', 'Their', 'Its', 'This', 'That', 'These', 'Those', 'Then', 'When', 'Where', 'What', 'How', 'But', 'And', 'Or', 'If', 'As', 'By', 'For', 'Of', 'With', 'From', 'Into', 'Through', 'During', 'Before', 'After', 'Above', 'Below', 'Between', 'Out', 'Off', 'Up', 'Down', 'New', 'Old', 'First', 'Last', 'One', 'Two', 'All', 'Some', 'Any', 'No', 'Not', 'So', 'Yet', 'Still', 'Also', 'Even', 'Just', 'Now', 'Then', 'Here', 'There']);
    const freq = {};
    for (const m of matches) {
        if (!stopWords.has(m)) freq[m] = (freq[m] || 0) + 1;
    }
    return Object.entries(freq).filter(([, c]) => c >= 2).map(([n]) => n);
}

function analizarEscena(fragmento) {
    const t = fragmento;
    const tl = t.toLowerCase();
    const styleTag = getStyleTag();

    // ── Configuración del universo activo (si lo hay) ──
    const univConfig = aiDetectedUniverse ? UNIVERSE_CONFIG[aiDetectedUniverse] : null;

    // ── 1. Detectar escenario: primero intentar overrides del universo ──
    let escenaDesc = 'vast open landscape under dramatic sky, crumbled stone ruins in the middle distance, sparse dead trees, desolate';
    let tipoDetectado = 'default';

    if (univConfig?.sceneOverrides) {
        for (const ovr of univConfig.sceneOverrides) {
            if (ovr.kw.test(t)) {
                escenaDesc = ovr.desc;
                tipoDetectado = 'default'; // paleta procedimental genérica para universos custom
                break;
            }
        }
    }
    // Si ningún override del universo coincidió, usar SCENE_TABLE genérica
    if (tipoDetectado === 'default' && escenaDesc.includes('vast open landscape')) {
        for (const scene of SCENE_TABLE) {
            if (scene.kw.test(tl)) {
                escenaDesc = scene.desc;
                tipoDetectado = scene.tipo;
                break;
            }
        }
    }

    // ── 2. Scoring personaje vs entorno ──
    let landscapeScore = 0;
    let characterScore = 0;

    for (const sig of LANDSCAPE_SIGNALS) if (sig.test(t)) landscapeScore++;
    for (const sig of CHARACTER_SIGNALS) if (sig.test(t)) characterScore += 2;

    // Señales extra del universo
    if (univConfig?.extraCharacterSignals) {
        for (const sig of univConfig.extraCharacterSignals) if (sig.test(t)) characterScore += 2;
    }

    const personajes = detectarPersonajes(t);
    characterScore += Math.min(personajes.length, 3);

    const focusoPersonaje = characterScore >= landscapeScore;

    // ── 3. Descriptor del sujeto: universo-aware primero, genérico después ──
    let sujetoDesc = '';
    if (focusoPersonaje) {
        const charDescs = univConfig?.characterDescs;

        if (/fight|battle|combat|attack|lucha|combate|ataque|clash|defend|mid-battle/i.test(t)) {
            sujetoDesc = charDescs?.fighting || 'a lone warrior figure in the foreground, battle-worn armor, weapon raised, dramatic stance';
        } else if (/run|flee|chase|escape|corr|huir|perseguir/i.test(t)) {
            sujetoDesc = charDescs?.fleeing || 'a running figure in motion blur, silhouetted against the scene, urgency and speed';
        } else if (/kneel|bow|pray|ritual|arrodill|rezar/i.test(t)) {
            sujetoDesc = charDescs?.kneeling || 'a kneeling figure in the center, head bowed, surrounded by the scene';
        } else if (/sit|rest|lean|sentad|descansar|apoyad/i.test(t)) {
            sujetoDesc = charDescs?.sitting || 'a seated figure resting, exhausted posture, cloak or hood, contemplative';
        } else if (/look|stare|observe|mirar|observar|contempl/i.test(t)) {
            sujetoDesc = charDescs?.observing || 'a standing figure viewed from behind, looking into the distance, hood or cloak';
        } else if (/speak|talk|said|whisper|hablar|dijo|susurr/i.test(t)) {
            sujetoDesc = charDescs?.talking || 'two figures facing each other in conversation, partially silhouetted';
        } else {
            sujetoDesc = charDescs?.default || 'a lone figure standing in the scene, viewed from behind, partially silhouetted';
        }

        if (personajes.length > 0) {
            console.log(`🧍 Personajes detectados: ${personajes.slice(0, 3).join(', ')}`);
        }
    }

    // ── 4. Modificadores de acción y luz ──
    let actionMod = '';
    for (const a of ACTION_MODS) { if (a.kw.test(tl)) { actionMod = a.mod; break; } }

    let lightMod = 'overcast daylight, soft diffused shadows, cool grey tones';
    for (const l of LIGHT_MODS) { if (l.kw.test(tl)) { lightMod = l.mod; break; } }

    // ── 5. Ensamblar ──
    const parts = [escenaDesc];
    if (sujetoDesc) parts.push(sujetoDesc);
    if (actionMod) parts.push(actionMod);
    parts.push(lightMod);
    parts.push(styleTag);

    const universoLabel = aiDetectedUniverse ? ` [${aiDetectedUniverse}]` : '';
    console.log(`🎬 Escena: ${tipoDetectado}${universoLabel} | Foco: ${focusoPersonaje ? '🧍 personaje' : '🌄 entorno'} | L:${landscapeScore} C:${characterScore}`);

    return { tipo: tipoDetectado, prompt: parts.join(', '), focusoPersonaje, personajes };
}

// Genera el prompt visual — intenta text.pollinations.ai (LLM gratis),
// con fallback inmediato al análisis local si la red falla
async function generarPromptConClaude(fragmento) {
    const cacheKey = fragmento.slice(0, 100);
    if (aiPromptCache[cacheKey]) return aiPromptCache[cacheKey];

    const styleTag = getStyleTag();
    const universeHint = aiDetectedUniverse
        ? `From webnovel "${aiDetectedUniverse}", match its visual style.`
        : '';

    const systemPrompt = `You are a cinematic scene prompt writer for AI image generation. ${universeHint} Given a fiction passage (about 10 paragraphs), write ONE English image generation prompt (max 80 words). Rules: (1) If the passage focuses on a character's actions, emotions or dialogue — place that character as the MAIN SUBJECT in the foreground (silhouette or role-description, no names), with the environment behind them. (2) If the passage is mostly environmental description with little character action — describe the environment as the main subject, with at most a tiny distant figure. (3) Always include: specific location details (floor, walls, sky), lighting direction and time of day. (4) Use PHOTOREALISTIC cinematic style, NOT abstract. End with: "${styleTag}". Output ONLY the prompt, no preamble.`;

    const pasaje = fragmento.slice(0, 350).replace(/"/g, "'");

    function esRespuestaInvalida(txt) {
        return !txt || txt.length < 20 ||
            txt.includes('IMPORTANT NOTICE') || txt.includes('deprecated') ||
            txt.includes('DEPRECATED') || txt.toUpperCase().includes('NOTICE');
    }

    // Intentar con Pollinations text API (LLM libre, timeout agresivo)
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: pasaje }
                ],
                private: true,
                seed: Math.floor(Math.random() * 9999)
            }),
            signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) {
            const data = await res.json();
            let prompt = (data?.choices?.[0]?.message?.content || '').trim().split('\n')[0].trim();
            if (!esRespuestaInvalida(prompt)) {
                aiPromptCache[cacheKey] = prompt;
                console.log('Prompt (Pollinations/mistral):', prompt.slice(0, 80));
                // Actualizar pool Pixabay con las keywords del nuevo prompt
                if (typeof actualizarPoolPixabayConPrompt === 'function') actualizarPoolPixabayConPrompt(prompt);
                return prompt;
            }
        }
    } catch (e) { /* red bloqueada o timeout — usar análisis local */ }

    // Fallback: análisis local semántico (instantáneo)
    const { prompt: promptLocal } = analizarEscena(fragmento);
    aiPromptCache[cacheKey] = promptLocal;
    console.log('Prompt (local):', promptLocal.slice(0, 80));
    // Actualizar pool Pixabay con el prompt local
    if (typeof actualizarPoolPixabayConPrompt === 'function') actualizarPoolPixabayConPrompt(promptLocal);
    return promptLocal;
}

// construirPromptDirecto queda como alias para compatibilidad
function construirPromptDirecto(fragmento, styleTag) {
    return analizarEscena(fragmento).prompt;
}

// URL de Pollinations — movida al bloque de proveedores de imágenes arriba

// ═══════════════════════════════════════
// GENERADOR DE FONDOS PROCEDURAL (Canvas 2D)
// Sin APIs externas — 100% local, instantáneo
// ═══════════════════════════════════════

// Paletas de colores por tipo de escena (derivadas del prompt construido localmente)
const SCENE_PALETTES = {
    forest: { sky: ['#0a0f0a', '#0d1a0e', '#081208'], mid: ['#1a2e1a', '#0f2010'], fog: '#1a2a1a', stars: false },
    city: { sky: ['#050810', '#080c18', '#060a14'], mid: ['#0a1020', '#151c2e'], fog: '#0d1525', stars: true, neon: true },
    dungeon: { sky: ['#080608', '#100a08', '#0a0608'], mid: ['#1a1008', '#120c06'], fog: '#100808', stars: false },
    desert: { sky: ['#1a0a04', '#200c06', '#180a04'], mid: ['#2a1008', '#1e0c06'], fog: '#200a06', stars: false },
    ocean: { sky: ['#040810', '#06101a', '#040c16'], mid: ['#081428', '#0a1830'], fog: '#060e1e', stars: true },
    castle: { sky: ['#08060c', '#100810', '#0c060a'], mid: ['#180a18', '#140810'], fog: '#0e060c', stars: true },
    cave: { sky: ['#040408', '#060610', '#040408'], mid: ['#080820', '#060618'], fog: '#040412', stars: false, glow: true },
    temple: { sky: ['#0a0806', '#120e08', '#0e0a04'], mid: ['#1e160a', '#180e06'], fog: '#140c06', stars: false },
    space: { sky: ['#020206', '#04040c', '#020208'], mid: ['#06040e', '#080614'], fog: '#040410', stars: true, nebula: true },
    hospital: { sky: ['#080c0a', '#0a100c', '#060a08'], mid: ['#0e1410', '#0c120e'], fog: '#0a1008', stars: false },
    mansion: { sky: ['#080608', '#0e0a0c', '#0a0808'], mid: ['#160e12', '#120c10'], fog: '#100a0e', stars: false },
    default: { sky: ['#060608', '#080810', '#060608'], mid: ['#0c0c14', '#0a0a10'], fog: '#080810', stars: true },
};

// detectarTipoEscena: ahora usa analizarEscena para no duplicar lógica
// Mapeo de tipo interno → clave de SCENE_PALETTES
const _TIPO_TO_PALETTE = {
    lab: 'hospital',   // laboratorio → misma paleta fría que hospital
    hospital: 'hospital',
    dungeon: 'dungeon',
    mansion: 'mansion',
    forest: 'forest',
    city: 'city',
    castle: 'castle',
    cave: 'cave',
    desert: 'desert',
    ocean: 'ocean',
    mountain: 'default',
    temple: 'temple',
    market: 'mansion',    // mercado medieval → misma calidez que mansión
    space: 'space',
    room: 'dungeon',    // habitación oscura → similar a dungeon
    default: 'default',
};

function detectarTipoEscena(prompt) {
    // El prompt ya fue generado por analizarEscena; re-analizarlo es redundante.
    // Detectamos desde las palabras clave del propio prompt de canvas.
    const t = prompt.toLowerCase();
    for (const scene of SCENE_TABLE) {
        if (scene.kw.test(t)) return _TIPO_TO_PALETTE[scene.tipo] || 'default';
    }
    return 'default';
}

// Dibuja el fondo procedural en el div usando un canvas temporal
// tipoOPrompt: puede ser el tipo string ('forest','city',...) o el prompt completo como fallback
function dibujarFondoProcedural(slot, tipoOPrompt, promptCompleto) {
    if (!aiImagesEnabled) return;

    // Si se pasa tipo directamente (desde solicitarImagenParaSlot), usarlo.
    // Si se pasa solo un prompt string (legacy), re-detectar.
    let tipo, paletteKey;
    if (typeof promptCompleto === 'string') {
        // llamada nueva: dibujarFondoProcedural(slot, tipo, prompt)
        tipo = tipoOPrompt;
        paletteKey = _TIPO_TO_PALETTE[tipo] || tipo;
    } else {
        // llamada legacy: dibujarFondoProcedural(slot, prompt)
        tipo = detectarTipoEscena(tipoOPrompt);
        paletteKey = tipo;
        promptCompleto = tipoOPrompt;
    }

    const pal = SCENE_PALETTES[paletteKey] || SCENE_PALETTES.default;
    const seed = slot * 113 + 7;
    const rng = (n => { let s = seed + n; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }; })(0);

    // Crear canvas offscreen
    const W = 1280, H = 720;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    // — Gradiente de cielo —
    const skyGrad = c.createLinearGradient(0, 0, 0, H * 0.65);
    skyGrad.addColorStop(0, pal.sky[0]);
    skyGrad.addColorStop(0.5, pal.sky[1]);
    skyGrad.addColorStop(1, pal.sky[2] || pal.sky[1]);
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, H);

    // — Estrellas —
    if (pal.stars) {
        for (let i = 0; i < 180; i++) {
            const x = rng() * W, y = rng() * H * 0.6;
            const r = rng() * 1.2 + 0.3;
            const alpha = rng() * 0.7 + 0.3;
            c.beginPath();
            c.arc(x, y, r, 0, Math.PI * 2);
            c.fillStyle = `rgba(255,245,230,${alpha})`;
            c.fill();
        }
    }

    // — Nebulosa (espacio) —
    if (pal.nebula) {
        for (let i = 0; i < 3; i++) {
            const nx = rng() * W, ny = rng() * H * 0.5;
            const nr = 80 + rng() * 120;
            const colors = ['rgba(80,40,120,', 'rgba(40,60,120,', 'rgba(100,30,80,'];
            const ng = c.createRadialGradient(nx, ny, 0, nx, ny, nr);
            ng.addColorStop(0, colors[i % 3] + '0.18)');
            ng.addColorStop(1, colors[i % 3] + '0)');
            c.fillStyle = ng;
            c.fillRect(0, 0, W, H);
        }
    }

    // — Luces de neón (ciudad) —
    if (pal.neon) {
        const neonColors = ['rgba(0,200,255,', 'rgba(255,50,150,', 'rgba(80,255,180,', 'rgba(255,180,0,'];
        for (let i = 0; i < 5; i++) {
            const nx = rng() * W, ny = H * 0.4 + rng() * H * 0.3;
            const nr = 30 + rng() * 60;
            const col = neonColors[Math.floor(rng() * neonColors.length)];
            const ng = c.createRadialGradient(nx, ny, 0, nx, ny, nr);
            ng.addColorStop(0, col + '0.12)');
            ng.addColorStop(1, col + '0)');
            c.fillStyle = ng;
            c.fillRect(0, 0, W, H);
        }
    }

    // — Brillo bioluminiscente (cueva) —
    if (pal.glow) {
        for (let i = 0; i < 8; i++) {
            const gx = rng() * W, gy = H * 0.3 + rng() * H * 0.5;
            const gr = 15 + rng() * 40;
            const glowColors = ['rgba(80,180,255,', 'rgba(100,255,200,', 'rgba(160,100,255,'];
            const col = glowColors[Math.floor(rng() * glowColors.length)];
            const gg = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
            gg.addColorStop(0, col + '0.25)');
            gg.addColorStop(1, col + '0)');
            c.fillStyle = gg;
            c.fillRect(0, 0, W, H);
        }
    }

    // — Siluetas de fondo (elementos medios) —
    const numShapes = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < numShapes; i++) {
        const x = (i / numShapes) * W + (rng() - 0.5) * (W / numShapes);
        const baseH = H * (0.3 + rng() * 0.3);
        const w = W / numShapes * (0.6 + rng() * 0.8);
        const col = pal.mid[Math.floor(rng() * pal.mid.length)];

        if (tipo === 'forest') {
            // Árboles
            c.fillStyle = col;
            c.beginPath();
            c.moveTo(x, H);
            c.lineTo(x - w * 0.5, baseH);
            c.lineTo(x - w * 0.25, baseH + H * 0.08);
            c.lineTo(x - w * 0.45, baseH - H * 0.1);
            c.lineTo(x, baseH - H * 0.18);
            c.lineTo(x + w * 0.45, baseH - H * 0.1);
            c.lineTo(x + w * 0.25, baseH + H * 0.08);
            c.lineTo(x + w * 0.5, baseH);
            c.closePath();
            c.fill();
        } else if (tipo === 'city') {
            // Rascacielos
            const bW = w * 0.5 + rng() * w * 0.4;
            const bH = baseH + rng() * H * 0.2;
            c.fillStyle = col;
            c.fillRect(x - bW / 2, bH, bW, H - bH);
            // Ventanas
            c.fillStyle = rng() > 0.7 ? 'rgba(255,220,100,0.15)' : 'rgba(100,180,255,0.08)';
            for (let wy = bH + 8; wy < H - 10; wy += 14) {
                for (let wx = x - bW / 2 + 5; wx < x + bW / 2 - 5; wx += 10) {
                    if (rng() > 0.4) c.fillRect(wx, wy, 5, 7);
                }
            }
        } else if (tipo === 'castle' || tipo === 'mansion') {
            // Torres
            const tW = w * 0.4;
            c.fillStyle = col;
            c.fillRect(x - tW / 2, baseH, tW, H - baseH);
            // Almenas
            for (let m = x - tW / 2; m < x + tW / 2; m += tW / 3) {
                c.fillRect(m, baseH - H * 0.05, tW / 4, H * 0.05);
            }
        } else {
            // Forma genérica: colina/roca
            c.fillStyle = col;
            c.beginPath();
            c.moveTo(x - w * 0.7, H);
            c.quadraticCurveTo(x, baseH, x + w * 0.7, H);
            c.closePath();
            c.fill();
        }
    }

    // — Niebla / bruma en el suelo —
    const fogGrad = c.createLinearGradient(0, H * 0.65, 0, H);
    fogGrad.addColorStop(0, pal.fog + '00');
    fogGrad.addColorStop(0.4, pal.fog + 'aa');
    fogGrad.addColorStop(1, pal.fog + 'ff');
    c.fillStyle = fogGrad;
    c.fillRect(0, H * 0.55, W, H * 0.45);

    // — Viñeta dramática en los bordes —
    const vig = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);

    // Convertir a data URL y mostrar como fondo
    const dataUrl = cv.toDataURL('image/jpeg', 0.88);
    mostrarImagenEnPanel(slot, dataUrl);
    console.log(`🎨 Fondo procedural generado — slot ${slot} (${tipo})`);
}

// ═══════════════════════════════════════
// PROVEEDORES DE IMÁGENES IA
// ═══════════════════════════════════════
// Forzar pixabay como default — limpiar providers de IA guardados previamente.
const _webProviders = new Set(['pixabay', 'pexels', 'picsum', 'unsplash', 'procedural']);
const _savedImgProvider = localStorage.getItem('img_provider');
if (_savedImgProvider && !_webProviders.has(_savedImgProvider)) {
    localStorage.removeItem('img_provider');
}
let imageProvider = (_savedImgProvider && _webProviders.has(_savedImgProvider))
    ? _savedImgProvider
    : 'picsum';
let stabilityApiKey = localStorage.getItem('stability_api_key') || '';
let stabilityModel = localStorage.getItem('stability_model') || 'sd3.5-medium';
let puterModel = localStorage.getItem('puter_model') || 'gpt-image-1.5';

// Inicializar UI al cargar
(function initImageProviderUI() {
    const radio = document.getElementById('prov-' + imageProvider);
    if (radio) radio.checked = true;
    const modelSel = document.getElementById('stability-model');
    if (modelSel) modelSel.value = stabilityModel;
    const puterModelSel = document.getElementById('puter-model');
    if (puterModelSel) puterModelSel.value = puterModel;
    if (stabilityApiKey) {
        const st = document.getElementById('stability-key-status');
        if (st) st.textContent = '✓ guardada';
    }
    _updateProviderPanels(imageProvider);
})();

function toggleImagenIAPanel() {
    const body = document.getElementById('imagen-ia-body');
    const arrow = document.getElementById('img-ia-arrow');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    if (arrow) arrow.textContent = open ? '▼' : '▶';
}

function _updateProviderPanels(prov) {
    document.getElementById('puter-panel').style.display = prov === 'puter' ? 'block' : 'none';
    document.getElementById('stability-panel').style.display = prov === 'stability' ? 'block' : 'none';
    document.getElementById('pollinations-panel').style.display = prov === 'pollinations' ? 'block' : 'none';
    document.getElementById('procedural-panel').style.display = prov === 'procedural' ? 'block' : 'none';
    const pixabayPanelEl = document.getElementById('pixabay-video-panel');
    if (pixabayPanelEl) pixabayPanelEl.style.display = prov === 'pixabay' ? 'block' : 'none';
    const picsumPanelEl = document.getElementById('picsum-panel');
    if (picsumPanelEl) picsumPanelEl.style.display = prov === 'picsum' ? 'block' : 'none';
    const unsplashPanelEl = document.getElementById('unsplash-panel');
    if (unsplashPanelEl) unsplashPanelEl.style.display = prov === 'unsplash' ? 'block' : 'none';
}

function setImageProvider(prov) {
    imageProvider = prov;
    localStorage.setItem('img_provider', prov);
    _updateProviderPanels(prov);
    // Invalidar slots cargados para que se regeneren con el nuevo proveedor
    if (aiImagesEnabled) {
        aiSlotSolicitado = {};
        aiCurrentSlot = -1;
        const slot = getSlotForSentence(typeof currentSentenceIndex !== 'undefined' ? currentSentenceIndex : 0);
        solicitarImagenParaSlot(slot);
    }
    mostrarNotificacion(`🖼 Proveedor: ${prov}`);
}

function guardarStabilityKey() {
    const key = document.getElementById('stability-api-key').value.trim();
    if (!key) { document.getElementById('stability-key-status').textContent = '⚠ vacía'; return; }
    stabilityApiKey = key;
    localStorage.setItem('stability_api_key', key);
    document.getElementById('stability-api-key').value = '';
    document.getElementById('stability-key-status').textContent = '✓ guardada';
    setTimeout(() => { document.getElementById('stability-key-status').textContent = ''; }, 2000);
}

// Genera imagen con Stability AI SD3 API
async function generarImagenStability(prompt, seed) {
    if (!stabilityApiKey) return null;
    const modelo = stabilityModel || 'sd3.5-medium';

    // Elegir endpoint según modelo
    let endpoint;
    if (modelo === 'core') {
        endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/core';
    } else if (modelo === 'ultra') {
        endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
    } else {
        endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
    }

    const body = new FormData();
    body.append('prompt', prompt.slice(0, 10000));
    body.append('output_format', 'jpeg');
    body.append('seed', String(seed % 4294967295));
    body.append('aspect_ratio', '16:9'); // formato correcto con ":"
    // Para SD3/SD3.5 hay que especificar el modelo y el modo
    if (modelo !== 'core' && modelo !== 'ultra') {
        body.append('model', modelo);
        body.append('mode', 'text-to-image');
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${stabilityApiKey}`,
                'accept': 'image/*'
            },
            body
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const errMsg = JSON.stringify(err?.errors || err?.message || err?.name || res.statusText);
            console.warn(`Stability AI error ${res.status}:`, errMsg);
            return null;
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn('Stability AI falló:', e.message);
        return null;
    }
}

// Genera imagen con Pollinations.AI (Flux) — gratis, sin key
function pollinationsUrl(prompt, seed) {
    const encoded = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1280&height=720&seed=${seed}&nologo=true&enhance=true&private=true`;
}

// Genera imagen con Puter.js — gratis, sin API key (usuario paga con cuenta Puter)
async function generarImagenPuter(prompt) {
    if (typeof puter === 'undefined' || !puter.ai?.txt2img) {
        console.warn('Puter.js no disponible');
        return null;
    }
    try {
        const modelo = puterModel || 'gpt-image-1.5';
        console.log(`🎨 Puter.js generando con ${modelo}...`);
        // Detectar proveedor por nombre de modelo
        const opts = { model: modelo };
        if (modelo.startsWith('grok')) opts.provider = 'xai';
        else if (modelo.startsWith('gemini') || modelo.startsWith('google/')) opts.provider = 'gemini';
        else if (modelo.startsWith('dall-e') || modelo.startsWith('gpt-image')) opts.provider = 'openai-image-generation';
        const imgEl = await puter.ai.txt2img(prompt, opts);
        if (!imgEl || !imgEl.src) return null;
        return imgEl.src; // data URL
    } catch (e) {
        console.warn('Puter.js falló:', e.message || e);
        return null;
    }
}

async function cargarImagenConFallback(prompt, seed, slot) {
    const statusTxt = document.getElementById('img-ia-status-txt');

    if (imageProvider === 'procedural') {
        dibujarFondoProcedural(slot, prompt);
        return;
    }

    // ── Puter.js ──
    if (imageProvider === 'puter') {
        if (statusTxt) statusTxt.textContent = `🎨 Puter.js generando slot ${slot}...`;
        if (aiLoadingSlot === null) aiLoadingSlot = slot;
        const url = await generarImagenPuter(prompt);
        if (url) {
            mostrarImagenEnPanel(slot, url);
            aiLoadingSlot = null;
            if (statusTxt) statusTxt.textContent = `✓ Puter.js · ${puterModel.split('/').pop()} · slot ${slot}`;
            return;
        }
        console.warn('Puter.js falló → procedural');
        dibujarFondoProcedural(slot, prompt);
        if (aiLoadingSlot === slot) aiLoadingSlot = null;
        if (statusTxt) statusTxt.textContent = `⚠ Puter.js falló → procedural`;
        return;
    }

    // ── Stability AI ──
    if (imageProvider === 'stability' && stabilityApiKey) {
        if (statusTxt) statusTxt.textContent = `🔄 Stability AI generando slot ${slot}...`;
        if (aiLoadingSlot === null) aiLoadingSlot = slot;
        const url = await generarImagenStability(prompt, seed);
        if (url) {
            mostrarImagenEnPanel(slot, url);
            aiLoadingSlot = null;
            if (statusTxt) statusTxt.textContent = `✓ Stability AI · slot ${slot}`;
            return;
        }
        console.warn('Stability falló → Pollinations fallback');
        if (statusTxt) statusTxt.textContent = `⚠ Stability falló → Pollinations slot ${slot}`;
    }

    // ── Pollinations (o fallback) ──
    if (statusTxt) statusTxt.textContent = `⏳ Pollinations slot ${slot}...`;
    if (aiLoadingSlot === null) aiLoadingSlot = slot;
    const url = pollinationsUrl(prompt, seed);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = setTimeout(() => {
        console.warn(`Pollinations timeout slot ${slot} → procedural`);
        dibujarFondoProcedural(slot, prompt);
        if (aiLoadingSlot === slot) aiLoadingSlot = null;
        if (statusTxt) statusTxt.textContent = `⏱ Timeout → procedural slot ${slot}`;
    }, 20000);
    img.onload = () => {
        clearTimeout(timeoutId);
        mostrarImagenEnPanel(slot, url);
        if (aiLoadingSlot === slot) aiLoadingSlot = null;
        if (statusTxt) statusTxt.textContent = `✓ Pollinations · slot ${slot}`;
    };
    img.onerror = () => {
        clearTimeout(timeoutId);
        dibujarFondoProcedural(slot, prompt);
        if (aiLoadingSlot === slot) aiLoadingSlot = null;
        if (statusTxt) statusTxt.textContent = `⚠ Error → procedural slot ${slot}`;
    };
    img.src = url;
}

async function solicitarImagenParaSlot(slot) {
    if (slot < 0 || aiSlotSolicitado[slot]) return;
    aiSlotSolicitado[slot] = true;
    if (aiLoadingSlot === null) aiLoadingSlot = slot;

    const fragmento = extraerFragmentoParaSlot(slot);
    if (!fragmento) { if (aiLoadingSlot === slot) aiLoadingSlot = null; return; }

    console.log(`🧠 Analizando escena — slot ${slot}`);
    const seed = slot * 113 + 7;

    // ── PASO 1: mostrar fondo procedural INMEDIATAMENTE (sin esperar nada) ──
    const { tipo, prompt } = analizarEscena(fragmento);
    console.log(`Prompt (local): ${prompt.slice(0, 80)}`);
    dibujarFondoProcedural(slot, tipo, prompt);
    if (aiLoadingSlot === slot) aiLoadingSlot = null;

    // ── PASO 2: si hay proveedor real, intentarlo en background y reemplazar si funciona ──
    if (imageProvider === 'procedural') return; // solo procedural, listo

    // Pixabay / Pexels / Picsum (imágenes web reales — no IA generativa)
    if (imageProvider === 'pixabay' || imageProvider === 'pexels') {
        if (typeof buscarYAplicarFondoPixabay === 'function') {
            buscarYAplicarFondoPixabay(slot, fragmento);
        }
        return;
    }

    // Picsum / Unsplash — cargar imagen real y reemplazar el procedural
    if (imageProvider === 'picsum' || imageProvider === 'unsplash') {
        if (typeof buscarYAplicarFondoPixabay === 'function') {
            buscarYAplicarFondoPixabay(slot, fragmento);
        }
        return;
    }

    const statusTxt = document.getElementById('img-ia-status-txt');

    // Puter.js
    if (imageProvider === 'puter') {
        if (statusTxt) statusTxt.textContent = `🎨 Puter.js mejorando slot ${slot}...`;
        const url = await generarImagenPuter(prompt);
        if (url && aiImagesEnabled) {
            aiSlotSolicitado[slot] = false; // permitir re-mostrar
            mostrarImagenEnPanel(slot, url);
            if (statusTxt) statusTxt.textContent = `✓ Puter.js · ${puterModel.split('/').pop()}`;
        }
        return;
    }

    // Stability AI
    if (imageProvider === 'stability' && stabilityApiKey) {
        if (statusTxt) statusTxt.textContent = `🔄 Stability AI mejorando slot ${slot}...`;
        const url = await generarImagenStability(prompt, seed);
        if (url && aiImagesEnabled) {
            aiSlotSolicitado[slot] = false;
            mostrarImagenEnPanel(slot, url);
            if (statusTxt) statusTxt.textContent = `✓ Stability AI · slot ${slot}`;
        }
        return;
    }

    // Pollinations (imagen real desde red)
    if (statusTxt) statusTxt.textContent = `⏳ Pollinations slot ${slot}...`;
    const polUrl = pollinationsUrl(prompt, seed);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = setTimeout(() => {
        if (statusTxt) statusTxt.textContent = `⏱ Timeout → procedural slot ${slot}`;
    }, 20000);
    img.onload = () => {
        clearTimeout(timeoutId);
        if (aiImagesEnabled) {
            aiSlotSolicitado[slot] = false;
            mostrarImagenEnPanel(slot, polUrl);
            if (statusTxt) statusTxt.textContent = `✓ Pollinations · slot ${slot}`;
        }
    };
    img.onerror = () => {
        clearTimeout(timeoutId);
        if (statusTxt) statusTxt.textContent = `⚠ Pollinations falló → procedural slot ${slot}`;
        // ya se mostró el procedural en paso 1, nada más que hacer
    };
    img.src = polUrl;
}

function mostrarImagenEnPanel(slot, url) {
    // Para slot === -1 (imágenes web/Pixabay) siempre mostrar, sin requerir aiImagesEnabled
    if (slot !== -1 && !aiImagesEnabled) return;
    if (!url) return;

    const panelAct = aiActivePanel === 'a' ? 'ai-bg-a' : 'ai-bg-b';
    const panelPrev = aiActivePanel === 'a' ? 'ai-bg-b' : 'ai-bg-a';
    const divAct = document.getElementById(panelAct);
    const divPrev = document.getElementById(panelPrev);
    if (!divAct || !divPrev) return;

    divAct.style.backgroundImage = `url("${url}")`;
    divAct.style.opacity = '1';
    divPrev.style.opacity = '0';
    document.getElementById('ai-bg-overlay').style.background = 'rgba(8,7,6,0.48)';
    aiActivePanel = aiActivePanel === 'a' ? 'b' : 'a';
    aiCurrentSlot = slot;
    aiSlotActivo = true;
}

// Se llama en cada cambio de oración desde main.js
function actualizarSlideAI(sentenceIdx) {
    if (!aiImagesEnabled) return;

    const slotActual = getSlotForSentence(sentenceIdx);
    solicitarImagenParaSlot(slotActual);

    // Pre-cargar el siguiente slot solo si el proveedor es lento (no procedural)
    // Solo 1 slot adelante para no saturar APIs con rate limits
    if (imageProvider !== 'procedural') {
        setTimeout(() => solicitarImagenParaSlot(slotActual + 1), 3000);
    }
}

// ═══════════════════════════════════════
// CONTROLES DE MODO VIDEO (play/pause + nav capítulos)
// ═══════════════════════════════════════

function videoTogglePlay() {
    const btn = document.getElementById('kbtn-playpause');
    if (!isReading || isPaused) {
        // Si nunca se inició o está pausado → iniciar/reanudar
        if (!isReading) {
            iniciarTTS();
        } else {
            reanudarTTS();
            // Reanudar audio ambiental si estaba sonando antes de la pausa
            if (typeof freesoundAudio !== 'undefined' && freesoundAudio && freesoundAudio.paused) {
                freesoundAudio.play().catch(() => { });
            }
        }
        btn.innerHTML = '⏸'; // pausa
        btn.classList.remove('paused');
    } else {
        pausarTTS();
        // Pausar también el audio ambiental
        if (typeof freesoundAudio !== 'undefined' && freesoundAudio && !freesoundAudio.paused) {
            freesoundAudio.pause();
        }
        btn.innerHTML = '&#9654;'; // play
        btn.classList.add('paused');
    }
}

// Sincronizar el ícono del botón cuando el TTS se detiene/pausa desde afuera
const _origDetenerTTS = window.detenerTTS;
window.detenerTTS = function () {
    if (typeof _origDetenerTTS === 'function') _origDetenerTTS();
    const btn = document.getElementById('kbtn-playpause');
    if (btn) { btn.innerHTML = '&#9654;'; btn.classList.remove('paused'); }
};

function _getChapterOptions() {
    return Array.from(document.getElementById('chapters').options)
        .filter(o => !o.disabled && o.value);
}

// Obtiene el texto real de un capítulo (sin cargarlo en pantalla)
async function _getChapterText(ruta) {
    if (!ruta || typeof archivosHTML === 'undefined' || !archivosHTML[ruta]) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(archivosHTML[ruta], 'text/html');
        const body = doc.body.cloneNode(true);
        body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
        let texto = '';
        body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div').forEach(el => {
            const t = el.innerText ? el.innerText.trim() : '';
            if (t.length > 0) texto += t + ' ';
        });
        return texto.trim();
    } catch { return ''; }
}

async function videoNavegar(direccion) {
    const sel = document.getElementById('chapters');
    const opts = _getChapterOptions();
    let idx = opts.findIndex(o => o.value === sel.value);
    if (idx === -1) return;

    const MAX_SKIP = 20;
    let intentos = 0;

    while (intentos < MAX_SKIP) {
        idx += direccion;
        if (idx < 0) { mostrarNotificacion('Ya estás en el primer capítulo'); return; }
        if (idx >= opts.length) { mostrarNotificacion('Ya estás en el último capítulo'); return; }

        const texto = await _getChapterText(opts[idx].value);
        if (texto.length > 30) break;
        console.log(`Capítulo sin texto: ${opts[idx].text}, saltando...`);
        intentos++;
    }

    if (intentos >= MAX_SKIP) { mostrarNotificacion('No se encontró capítulo con contenido'); return; }

    // Actualizar selector
    if (typeof _cargandoProgramaticamente !== 'undefined') window._cargandoProgramaticamente = true;
    sel.value = opts[idx].value;
    window._cargandoProgramaticamente = false;

    // Actualizar título en el visor inmediatamente
    const optSel = opts[idx];
    if (optSel) {
        const titleEl = document.getElementById('current-chapter-title');
        if (titleEl) titleEl.textContent = optSel.textContent;
        const capEl = document.getElementById('kp-chapter');
        if (capEl) capEl.textContent = optSel.textContent;
    }

    detenerTTS();
    actualizarIndicevideo();
    window._navegacionIntencionada = true;
    // Limpiar cache de slots Pixabay al cambiar de capítulo
    if (typeof limpiarCachePixabaySlots === 'function') limpiarCachePixabaySlots();
    await cargarCapitulo(opts[idx].value);
}

function videoCapituloAnterior() { videoNavegar(-1); }
function videoCapituloSiguiente() { videoNavegar(1); }

// ═══════════════════════════════════════
// PANEL DE ÍNDICE DE CAPÍTULOS EN MODO VIDEO
// ═══════════════════════════════════════

function togglevideoIndex() {
    const panel = document.getElementById('video-index-panel');
    const btn = document.getElementById('btn-toggle-index');
    panel.classList.toggle('open');
    btn.style.color = panel.classList.contains('open') ? 'var(--accent)' : '';
}

function poblarIndicevideo() {
    const lista = document.getElementById('video-index-list');
    if (!lista) return;
    const opts = _getChapterOptions();
    lista.innerHTML = '';
    opts.forEach((opt, i) => {
        const item = document.createElement('div');
        item.className = 'video-index-item';
        item.dataset.value = opt.value;
        item.textContent = opt.text || `Capítulo ${i + 1}`;
        item.title = opt.text;
        const _doCargar = () => {
            window._cargandoProgramaticamente = true;
            document.getElementById('chapters').value = opt.value;
            window._cargandoProgramaticamente = false;
            detenerTTS();
            actualizarIndicevideo();
            const hayProcesamiento = (typeof traduccionAutomatica !== 'undefined' && traduccionAutomatica)
                || (typeof ttsHumanizerActivo !== 'undefined' && ttsHumanizerActivo);
            if (hayProcesamiento) {
                const row = document.getElementById('aplicar-row');
                const hint = document.getElementById('aplicar-hint');
                if (row) row.style.display = 'block';
                if (hint) hint.textContent = 'Nuevo capítulo — presiona Aplicar para procesar';
                if (typeof _configPendiente !== 'undefined') window._configPendiente = true;
            }
            cargarCapitulo(opt.value);
        };
        item.onclick = _doCargar;
        item.ondblclick = () => {
            _doCargar();
            // Colapsar el panel con doble click
            const panel = document.getElementById('video-index-panel');
            const btn = document.getElementById('btn-toggle-index');
            if (panel) panel.classList.remove('open');
            if (btn) btn.style.color = '';
        };
        lista.appendChild(item);
    });
    actualizarIndicevideo();
}

function actualizarIndicevideo() {
    const sel = document.getElementById('chapters');
    if (!sel) return;
    document.querySelectorAll('.video-index-item').forEach(item => {
        item.classList.toggle('active', item.dataset.value === sel.value);
    });
    // Scroll al item activo
    const active = document.querySelector('.video-index-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function filtrarIndicevideo(q) {
    const lower = q.toLowerCase();
    document.querySelectorAll('.video-index-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(lower) ? '' : 'none';
    });
}

// Poblar índice cuando se carguen los capítulos y al abrir el modo video
const _chaptersObserverIdx = new MutationObserver(() => poblarIndicevideo());
_chaptersObserverIdx.observe(document.getElementById('chapters'), { childList: true });

// Hook: actualizar item activo cuando cambia el selector de capítulos
document.getElementById('chapters').addEventListener('change', () => actualizarIndicevideo());


// ═══════════════════════════════════════
// CONTROLES DE MÚSICA DESDE MODO VIDEO
// ═══════════════════════════════════════

const GENRE_ORDER = ['mystery', 'suspense', 'drama', 'action', 'fantasy', 'romance', 'lofi', 'nature'];

function _genreIdx() {
    return ambientGenre ? GENRE_ORDER.indexOf(ambientGenre) : -1;
}

async function videoMusicaSiguiente() {
    const idx = _genreIdx();
    const next = GENRE_ORDER[(idx + 1) % GENRE_ORDER.length];
    await selectGenre(next);
    _actualizarMusicLabel();
}

async function videoMusicaPrev() {
    const idx = _genreIdx();
    const prev = GENRE_ORDER[(idx - 1 + GENRE_ORDER.length) % GENRE_ORDER.length];
    await selectGenre(prev);
    _actualizarMusicLabel();
}

function videoToggleAmbient() {
    if (typeof toggleAmbientPlay === 'function') toggleAmbientPlay();
    _syncAmbientBtn();
}

function _syncAmbientBtn() {
    const btn = document.getElementById('kbtn-ambient-playpause');
    if (!btn) return;
    // ambientPlaying viene del scope de audio ambiental
    const playing = typeof ambientPlaying !== 'undefined' ? ambientPlaying : true;
    btn.innerHTML = playing ? '⏸' : '&#9654;';
    btn.title = playing ? 'Pausar música' : 'Reproducir música';
}

function _actualizarMusicLabel() {
    const trackName = document.getElementById('ambient-track-name');
    const trackGenre = document.getElementById('ambient-track-genre');
    const trackText = trackName ? trackName.textContent : (ambientGenre || '♪');
    const genreText = trackGenre ? trackGenre.textContent : '';

    // Label corto en el botón
    const lbl = document.getElementById('video-music-label');
    if (lbl) lbl.textContent = trackText;

    // Labels completos en el popup
    const lblFull = document.getElementById('video-music-label-full');
    if (lblFull) lblFull.textContent = trackText;
    const lblGenre = document.getElementById('video-music-genre-label');
    if (lblGenre) lblGenre.textContent = genreText;

    _syncAmbientBtn();
}

// Sincronizar label de música cuando cambia el track
const _origAmbientTrackName = Object.getOwnPropertyDescriptor(Element.prototype, 'textContent');
setInterval(_actualizarMusicLabel, 2000); // sync pasivo cada 2s

// ═══════════════════════════════════════
// BUSCADOR DE CAPÍTULOS
// ═══════════════════════════════════════

// Guardar todas las opciones originales una vez cargado el EPUB
let _todasLasOpciones = [];

// Observer para capturar las opciones cuando se populan
const _chaptersObserver = new MutationObserver(() => {
    const opts = _getChapterOptions();
    if (opts.length > 0) _todasLasOpciones = opts.map(o => ({ value: o.value, text: o.textContent }));
});
_chaptersObserver.observe(document.getElementById('chapters'), { childList: true });

function filtrarCapitulos(query) {
    const sel = document.getElementById('chapters');
    const q = query.trim().toLowerCase();

    // Si no hay snapshot aún, tomarlo ahora (antes de tocar el DOM)
    if (_todasLasOpciones.length === 0) {
        _todasLasOpciones = _getChapterOptions().map(o => ({ value: o.value, text: o.textContent }));
    }

    const valorActual = sel.value;
    // Desconectar observer ANTES de modificar el select para que no sobreescriba el snapshot
    _chaptersObserver.disconnect();
    window._cargandoProgramaticamente = true;
    sel.innerHTML = '';

    const filtradas = q
        ? _todasLasOpciones.filter(o => o.text.toLowerCase().includes(q))
        : _todasLasOpciones;

    if (filtradas.length === 0) {
        const empty = document.createElement('option');
        empty.disabled = true;
        empty.textContent = '— sin resultados —';
        sel.appendChild(empty);
    } else {
        filtradas.forEach(({ value, text }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            if (value === valorActual) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    window._cargandoProgramaticamente = false;
    // Reconectar observer después de reconstruir
    _chaptersObserver.observe(document.getElementById('chapters'), { childList: true });
}

// ═══════════════════════════════════════
// PANTALLA COMPLETA
// ═══════════════════════════════════════
function toggleFullscreen() {
    const btn = document.getElementById('btn-fullscreen');
    if (!document.fullscreenElement) {
        // Fullscreen en documentElement para evitar congelamiento del navegador
        document.documentElement.requestFullscreen().then(() => {
            btn.innerHTML = '&#x29C9;';
            btn.title = 'Salir de pantalla completa';
        }).catch(e => console.warn('Fullscreen error:', e.message));
    } else {
        document.exitFullscreen().catch(() => { });
    }
}
document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;
    if (!document.fullscreenElement) {
        btn.textContent = '⛶';
        btn.title = 'Pantalla completa';
    }
});

// ═══════════════════════════════════════
// VOLUMEN TTS INDEPENDIENTE
// ═══════════════════════════════════════
function setTTSVolume(val) {
    const v = parseFloat(val) / 100;
    document.querySelectorAll('audio, video').forEach(el => { try { el.volume = v; } catch (e) { } });
    if (typeof utterance !== 'undefined' && utterance) utterance.volume = v;
    if (typeof audioActual !== 'undefined' && audioActual) audioActual.volume = v;
    window._masterVolume = v;
    const mainVol = document.getElementById('volume-control');
    if (mainVol) mainVol.value = val;
    const lbl = document.getElementById('volume-value');
    if (lbl) lbl.textContent = val;
}
// Sincronizar sliders al abrir el modo video
document.addEventListener('videoOpened', () => {
    const vol = document.getElementById('volume-control');
    if (vol) {
        const v = vol.value;
        const ttsSlider = document.getElementById('kol-tts-vol');
        const ttsPct = document.getElementById('kol-tts-pct');
        if (ttsSlider) ttsSlider.value = v;
        if (ttsPct) ttsPct.textContent = v + '%';
    }
    const ambVol = document.getElementById('ambient-volume');
    if (ambVol) {
        const av = ambVol.value;
        const musicSlider = document.getElementById('kol-music-vol');
        const musicPct = document.getElementById('kol-music-pct');
        if (musicSlider) musicSlider.value = av;
        if (musicPct) musicPct.textContent = av + '%';
    }
});

// ═══════════════════════════════════════
// AUTO-SIGUIENTE PISTA DE MÚSICA
// ═══════════════════════════════════════
let _nextTrackPreloaded = null;  // { url, name, duration } pre-cargado
let _preloadingNext = false;

// Pre-carga silenciosa de la siguiente pista mientras suena la actual
async function _preloadNextTrack() {
    if (_preloadingNext || _nextTrackPreloaded) return;
    _preloadingNext = true;
    try {
        const g = (typeof ambientGenre !== 'undefined') ? ambientGenre : 'mystery';
        const univAmbient = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
            ? UNIVERSE_CONFIG?.[aiDetectedUniverse]?.ambient : null;
        const cacheKey = univAmbient ? `__universe__${aiDetectedUniverse}` : g;
        // Usar el pool existente si tiene ≥2 entradas, sino pedir más al servidor
        if (_lastFreesoundResults[cacheKey] && _lastFreesoundResults[cacheKey].length >= 2) {
            _nextTrackPreloaded = _lastFreesoundResults[cacheKey][1];
            console.log('🎵 Siguiente pista pre-cargada (cache):', _nextTrackPreloaded.name);
        } else {
            // Fetch en background — no bloquea
            const track = await buscarEnFreesound(g, null);
            if (track) {
                _nextTrackPreloaded = track;
                // Pre-cargar el audio en buffer del browser
                const preAudio = new Audio(track.url);
                preAudio.preload = 'auto';
                console.log('🎵 Siguiente pista pre-cargada (fetch):', track.name);
            }
        }
    } catch (e) { console.warn('Pre-carga música falló:', e); }
    _preloadingNext = false;
}

async function _onTrackEnded() {
    console.log('🎵 Pista terminada — cargando siguiente...');
    if (typeof ambientGenre !== 'undefined' && ambientGenre) {
        // Si ya tenemos la siguiente pre-cargada, inyectarla directo en el cache
        if (_nextTrackPreloaded) {
            const g = ambientGenre;
            const cacheKey = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
                ? `__universe__${aiDetectedUniverse}` : g;
            // Poner la pre-cargada al frente del pool
            if (!_lastFreesoundResults[cacheKey]) _lastFreesoundResults[cacheKey] = [];
            _lastFreesoundResults[cacheKey].unshift(_nextTrackPreloaded);
            _nextTrackPreloaded = null;
            console.log('🎵 Usando pista pre-cargada — sin latencia');
        }
        await siguienteTrack();
    }
}

// Vigilar freesoundAudio para enganchar eventos 'ended' y pre-carga
let _lastHookedAudio = null;
let _preloadTimer = null;
setInterval(() => {
    if (typeof freesoundAudio !== 'undefined' && freesoundAudio && freesoundAudio !== _lastHookedAudio) {
        _lastHookedAudio = freesoundAudio;
        freesoundAudio.loop = false;  // Desactivar loop para que dispare 'ended'
        freesoundAudio.addEventListener('ended', _onTrackEnded);
        _nextTrackPreloaded = null;   // Resetear pre-carga para la nueva pista
        _preloadingNext = false;
        console.log('🎵 Auto-next enganchado al track actual');

        // Pre-cargar la siguiente pista cuando queden ~30s de la actual
        if (_preloadTimer) clearInterval(_preloadTimer);
        _preloadTimer = setInterval(() => {
            if (!freesoundAudio || freesoundAudio.paused) return;
            const restante = freesoundAudio.duration - freesoundAudio.currentTime;
            if (!isNaN(restante) && restante < 30 && !_nextTrackPreloaded && !_preloadingNext) {
                console.log(`🎵 Pre-cargando siguiente (${Math.round(restante)}s restantes)...`);
                _preloadNextTrack();
            }
        }, 5000);
    }
}, 1000);


// BARRA DE PROGRESO TIPO YOUTUBE EN video
// ═══════════════════════════════════════════════════════

// Actualizar barra de progreso del video
function updatevideoProgress() {
    if (typeof sentences === 'undefined' || sentences.length === 0) return;
    const total = sentences.length;
    const current = (typeof currentSentenceIndex !== 'undefined') ? currentSentenceIndex : 0;
    const pct = ((current + 1) / total) * 100;

    document.getElementById('video-progress-fill').style.width = pct + '%';
    document.getElementById('kp-current').textContent = `Frase ${current + 1} / ${total}`;
    // Actualizar título de capítulo junto al contador
    const capEl = document.getElementById('kp-chapter');
    if (capEl) {
        const titulo = document.getElementById('current-chapter-title')?.textContent || '';
        capEl.textContent = titulo;
    }
}

// Hover: mostrar/ocultar thumb
function videoProgressHover(entering) {
    const track = document.getElementById('video-progress-track');
    if (!entering) {
        document.getElementById('video-seek-tooltip').classList.remove('visible');
    }
}

// Mouse move: mostrar tooltip con preview del texto
function videoProgressMouseMove(e) {
    if (typeof sentences === 'undefined' || sentences.length === 0) return;

    const track = document.getElementById('video-progress-track');
    const tooltip = document.getElementById('video-seek-tooltip');
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.floor(pct * sentences.length);
    const clampedIdx = Math.min(idx, sentences.length - 1);

    // Truncar texto del tooltip
    let preview = sentences[clampedIdx] || '';
    if (preview.length > 120) preview = preview.slice(0, 117) + '...';

    tooltip.textContent = `[${clampedIdx + 1}/${sentences.length}]\n${preview}`;
    tooltip.classList.add('visible');

    // Posicionar el tooltip horizontalmente siguiendo el cursor
    const trackRelX = e.clientX - rect.left;
    const tooltipHalf = 110; // aproximado a la mitad del max-width
    let left = trackRelX;
    // Evitar que salga por los bordes
    left = Math.max(tooltipHalf, Math.min(rect.width - tooltipHalf, left));
    tooltip.style.left = left + 'px';
}

// Click en la barra: hacer seek a esa posición
function videoProgressSeek(e) {
    if (typeof sentences === 'undefined' || sentences.length === 0) return;

    const track = document.getElementById('video-progress-track');
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(Math.floor(pct * sentences.length), sentences.length - 1);

    document.getElementById('video-seek-tooltip').classList.remove('visible');

    // Llamar la función de seek existente del TTS
    if (typeof detenerTTSSinEstado === 'function') {
        detenerTTSSinEstado();
    } else if (typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.cancel();
    }
    if (typeof leerOracion === 'function') {
        leerOracion(idx);
    }
}

// Seek desde la barra de progreso del panel lateral (implementación)
function seekTTS(e) {
    if (typeof sentences === 'undefined' || sentences.length === 0) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(Math.floor(pct * sentences.length), sentences.length - 1);
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    if (typeof leerOracion === 'function') leerOracion(idx);
}

// Hook: sobreescribir actualizarProgreso para también actualizar la barra del video
const _origActualizarProgreso = typeof actualizarProgreso === 'function' ? actualizarProgreso : null;
window.actualizarProgreso = function () {
    if (_origActualizarProgreso) _origActualizarProgreso();
    updatevideoProgress();
};

// ═══════════════════════════════════════════════════════
// BARRA DE PROGRESO DE TRADUCCIÓN → solo en overlay video
// ═══════════════════════════════════════════════════════

// Observar cambios en el texto-contenido para detectar el mensaje de "Traduciendo"
// y redirigir al overlay del video (el reading-area ya no tiene barra propia)
let _tcObserverActivo = true;
const _tcObserver = new MutationObserver(() => {
    if (!_tcObserverActivo) return;
    const tc = document.getElementById('texto-contenido');
    if (!tc) return;
    const txt = tc.textContent.trim();
    // Solo actuar si el texto es ÚNICAMENTE el mensaje de traducción (no el texto final)
    if (txt === 'Traduciendo capítulo...' || (txt.startsWith('Traduciendo') && txt.length < 50)) {
        _tcObserverActivo = false;
        tc.innerHTML = '';
        _tcObserverActivo = true;
        const kWrap = document.getElementById('video-translation-progress');
        if (kWrap) kWrap.style.display = 'flex';
    }
});
const _tcEl = document.getElementById('texto-contenido');
if (_tcEl) _tcObserver.observe(_tcEl, { childList: true, subtree: true, characterData: true });


// ═══════════════════════════════════════════════════════
// SUBIR ELEMENTO DE MÚSICA CUANDO HAY BARRA DE PROCESAMIENTO
// ═══════════════════════════════════════════════════════
(function () {
    const processingBar = document.getElementById('main-processing-bar');
    const ambientPlayer = document.getElementById('ambient-player');
    const progressWrap = document.querySelector('.progress-wrap');
    if (!processingBar) return;

    const observer = new MutationObserver(() => {
        const visible = processingBar.style.display !== 'none' && processingBar.style.display !== '';
        if (ambientPlayer) ambientPlayer.classList.toggle('processing-raised', visible);
        if (progressWrap) progressWrap.classList.toggle('processing-hidden', visible);
    });
    observer.observe(processingBar, { attributes: true, attributeFilter: ['style'] });
})();

(function () {
    var _t = null;

    function _overlayVisible() {
        var o = document.getElementById('video-overlay');
        return !!(o && o.classList.contains('active'));
    }

    function hideControls() {
        var bar = document.querySelector('.video-bar');
        var wrap = document.getElementById('video-progress-wrap');
        if (bar) { bar.style.opacity = '0'; bar.style.pointerEvents = 'none'; }
        if (wrap) { wrap.style.opacity = '0.3'; wrap.style.pointerEvents = ''; }
    }

    function showControls() {
        var bar = document.querySelector('.video-bar');
        var wrap = document.getElementById('video-progress-wrap');
        if (bar) { bar.style.opacity = '1'; bar.style.pointerEvents = ''; }
        if (wrap) { wrap.style.opacity = '1'; wrap.style.pointerEvents = ''; }
        if (_t) clearTimeout(_t);
        // Siempre ocultar tras 3s si el overlay está activo — sin chequear si está reproduciendo
        _t = setTimeout(function () {
            if (_overlayVisible()) hideControls();
        }, 3000);
    }

    window.videoControlsShow = showControls;

    // Cualquier movimiento de mouse en el documento muestra los controles
    document.addEventListener('mousemove', function () {
        if (_overlayVisible()) showControls();
    });

    // Cualquier click también resetea el timer
    document.addEventListener('click', function () {
        if (_overlayVisible()) showControls();
    }, true);
})();


// ─── MUTE MÚSICA AMBIENTAL ───
let _ambientMuted = false;
let _ambientVolBeforeMute = null;

function toggleAmbientMute() {
    const btn = document.getElementById('kbtn-ambient-mute');
    if (_ambientMuted) {
        // Restaurar volumen
        const vol = _ambientVolBeforeMute !== null ? _ambientVolBeforeMute : 15;
        setAmbientVolume(vol);
        const sliders = [document.getElementById('ambient-volume'), document.getElementById('kol-music-vol')];
        sliders.forEach(s => { if (s) s.value = vol; });
        const pct = document.getElementById('kol-music-pct');
        const val = document.getElementById('ambient-vol-val');
        if (pct) pct.textContent = vol + '%';
        if (val) val.textContent = vol + '%';
        _ambientMuted = false;
        if (btn) btn.textContent = '🔊';
    } else {
        // Guardar volumen actual y silenciar
        const slider = document.getElementById('kol-music-vol');
        _ambientVolBeforeMute = slider ? parseInt(slider.value) : 15;
        setAmbientVolume(0);
        _ambientMuted = true;
        if (btn) btn.textContent = '🔇';
    }
}

// ─── MODAL DE REEMPLAZOS ───
function abrirModalReemplazos() {
    const datos = JSON.parse(localStorage.getItem('reemplazos_custom') || '{}');
    const body = document.getElementById('modal-reemplazos-body');
    const modal = document.getElementById('modal-reemplazos');
    if (Object.keys(datos).length === 0) {
        body.innerHTML = '<div class="modal-empty">No hay reemplazos guardados.</div>';
    } else {
        body.innerHTML = Object.entries(datos).map(([k, v]) =>
            `<div class="modal-row">
                                                            <span class="from">${k}</span>
                                                            <span class="arrow">→</span>
                                                            <span class="to">${v}</span>
                                                            <button class="del-btn" onclick="eliminarReemplazo(${JSON.stringify(k)})" title="Eliminar">✕</button>
                                                        </div>`
        ).join('');
    }
    modal.classList.add('open');
}

function cerrarModalReemplazos() {
    document.getElementById('modal-reemplazos').classList.remove('open');
}

function eliminarReemplazo(clave) {
    const datos = JSON.parse(localStorage.getItem('reemplazos_custom') || '{}');
    delete datos[clave];
    localStorage.setItem('reemplazos_custom', JSON.stringify(datos));
    if (typeof reemplazosAutomaticos !== 'undefined') delete reemplazosAutomaticos[clave];
    // Invalidar cache BG para que el próximo capítulo se re-procese sin este reemplazo
    if (typeof _capCache !== 'undefined') Object.keys(_capCache).forEach(k => delete _capCache[k]);
    actualizarBotonLimpiarReemplazos();
    abrirModalReemplazos(); // refrescar
}

// Cerrar modal al hacer click fuera
document.getElementById('modal-reemplazos').addEventListener('click', function (e) {
    if (e.target === this) cerrarModalReemplazos();
});

// Exponer para usar desde el sidebar
window.abrirModalReemplazos = abrirModalReemplazos;
// ═══════════════════════════════════════════════════════════
// CLICK EN CANVAS → PAUSA / CONTINUAR
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('video-canvas');
    if (canvas) {
        canvas.addEventListener('click', (e) => {
            // Ignorar clicks que vienen de la toolbar lateral
            if (e.target.closest && e.target.closest('#vsb-wrapper')) return;
            if (typeof videoTogglePlay === 'function') videoTogglePlay();
        });
    }
});

// ═══════════════════════════════════════════════════════════
// VARIABLES DE PRESENTACIÓN MUTABLES
// ═══════════════════════════════════════════════════════════
let _videoTextColor = '#c8a96e';
let _videoTextOpacity = 1.0;
let _videoFontSize = 36;
let _videoFontFamily = 'Georgia,serif';
let _grayscaleActive = true;
let _vignetteEnabled = true;
let _sidebarOpen = false;

// ─── BORDE DE TEXTO ───
// type: 'none' | 'solid' | 'gradient'
let _textStrokeType = 'solid';
let _textStrokeWidth = 1;        // px (0 = sin borde)
let _textStrokeColor1 = '#000000'; // color sólido o color inicio gradiente
let _textStrokeColor2 = '#1a0a00'; // color fin gradiente

// ═══════════════════════════════════════════════════════════
// TOOLBAR LATERAL — CONTROLES DE PRESENTACIÓN
// ═══════════════════════════════════════════════════════════
const _textColorPresets = [
    { hex: '#c8a96e', label: 'Dorado' },
    { hex: '#e8e0d0', label: 'Crema' },
    { hex: '#ffffff', label: 'Blanco' },
    { hex: '#7eb89a', label: 'Menta' },
    { hex: '#a8c4e0', label: 'Azul' },
    { hex: '#e0a8c0', label: 'Rosa' },
    { hex: '#d4d4d4', label: 'Gris' },
    { hex: '#f4c77a', label: 'Ámbar' },
];
let _colorPickerOpen = false;

function toggleImageGrayscale() {
    _grayscaleActive = !_grayscaleActive;
    _aplicarFiltroGrayscale(_grayscaleActive);
    const btn = document.getElementById('vsb-bw');
    if (btn) {
        btn.classList.toggle('vsb-active', _grayscaleActive);
        btn.title = _grayscaleActive ? 'Volver a color' : 'Escala de grises';
        btn.textContent = _grayscaleActive ? '🎨' : '⬜';
    }
}

function _aplicarFiltroGrayscale(activo) {
    const filtro = activo ? 'grayscale(1) brightness(0.82) contrast(1.12)' : '';
    ['ai-bg-a', 'ai-bg-b', 'reader-bg-a', 'reader-bg-b'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.filter = filtro;
    });
}

function _openColorPicker() {
    _colorPickerOpen = !_colorPickerOpen;
    const panel = document.getElementById('vsb-color-panel');
    if (panel) panel.style.display = _colorPickerOpen ? 'flex' : 'none';
}

function _setTextColor(hex) {
    _videoTextColor = hex;
    const swatch = document.getElementById('vsb-color-swatch');
    if (swatch) swatch.style.background = hex;
    _colorPickerOpen = false;
    const panel = document.getElementById('vsb-color-panel');
    if (panel) panel.style.display = 'none';
}

function _changeFontSize(delta) {
    _videoFontSize = Math.max(18, Math.min(72, _videoFontSize + delta));
    const lbl = document.getElementById('vsb-size-lbl');
    if (lbl) lbl.textContent = _videoFontSize;
}

function _setFontFamily(val) {
    _videoFontFamily = val;
    const prev = document.getElementById('vsb-font-preview');
    if (prev) prev.style.fontFamily = val;
}

function _setStrokeType(type) {
    _textStrokeType = type;
    const panel = document.getElementById('vsb-stroke-colors');
    if (panel) panel.style.display = (type === 'none') ? 'none' : 'flex';
    const gradRow = document.getElementById('vsb-stroke-grad-row');
    if (gradRow) gradRow.style.display = (type === 'gradient') ? 'flex' : 'none';
    // update button states
    ['none', 'solid', 'gradient'].forEach(t => {
        const b = document.getElementById(`vsb-stroke-${t}`);
        if (b) b.classList.toggle('vsb-active', t === type);
    });
}

function _setStrokeWidth(val) {
    _textStrokeWidth = parseFloat(val);
    const lbl = document.getElementById('vsb-stroke-w-lbl');
    if (lbl) lbl.textContent = val + 'px';
}

function _setStrokeColor1(hex) { _textStrokeColor1 = hex; }
function _setStrokeColor2(hex) { _textStrokeColor2 = hex; }

function _changeTextOpacity(val) {
    _videoTextOpacity = parseFloat(val);
    const lbl = document.getElementById('vsb-opacity-lbl');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
}

function _toggleVignette() {
    _vignetteEnabled = !_vignetteEnabled;
    const btn = document.getElementById('vsb-vignette');
    if (btn) btn.classList.toggle('vsb-active', _vignetteEnabled);
}

function _toggleSidebarPanel() {
    _sidebarOpen = !_sidebarOpen;
    const panel = document.getElementById('vsb-panel');
    const tab = document.querySelector('.vsb-tab');
    if (panel) panel.classList.toggle('vsb-panel-open', _sidebarOpen);
    if (tab) tab.classList.toggle('vsb-tab-active', _sidebarOpen);
}

function _inyectarSidebarToolbar() {
    if (document.getElementById('video-sidebar-toolbar')) return;

    const colorSwatches = _textColorPresets.map(c =>
        `<div class="vsb-swatch" style="background:${c.hex}" title="${c.label}" onclick="_setTextColor('${c.hex}')"></div>`
    ).join('');

    const wrapper = document.createElement('div');
    wrapper.id = 'video-sidebar-toolbar';
    wrapper.innerHTML = `
        <div class="vsb-tab" onclick="_toggleSidebarPanel()" title="Herramientas">
            <span class="vsb-tab-line"></span>
            <span class="vsb-tab-line"></span>
            <span class="vsb-tab-line"></span>
        </div>
        <div id="vsb-panel" class="vsb-panel">
            <div class="vsb-body">

                <!-- IMAGEN -->
                <div class="vsb-section-label">Imagen</div>
                <div class="vsb-btn-row">
                    <button id="vsb-bw" class="vsb-btn" onclick="toggleImageGrayscale()" title="Escala de grises">B&W</button>
                    <button id="vsb-vignette" class="vsb-btn vsb-active" onclick="_toggleVignette()" title="Viñeta">◉</button>
                </div>

                <!-- TEXTO -->
                <div class="vsb-section-label">Texto</div>

                <!-- Color -->
                <div class="vsb-color-row">
                    <button class="vsb-color-btn" onclick="_openColorPicker()" title="Color del texto">
                        <span id="vsb-color-swatch" class="vsb-color-swatch" style="background:#c8a96e"></span>
                    </button>
                    <span class="vsb-micro-lbl">Color</span>
                </div>
                <div id="vsb-color-panel" class="vsb-color-panel" style="display:none">
                    ${colorSwatches}
                    <input type="color" value="#c8a96e" oninput="_setTextColor(this.value)" title="Personalizado" class="vsb-color-custom">
                </div>

                <!-- Tamaño -->
                <div class="vsb-size-row">
                    <button class="vsb-mini-btn" onclick="_changeFontSize(-2)">−</button>
                    <span id="vsb-size-lbl" class="vsb-mini-lbl" style="flex:1;text-align:center;">36</span>
                    <button class="vsb-mini-btn" onclick="_changeFontSize(2)">+</button>
                    <span class="vsb-micro-lbl">px</span>
                </div>

                <!-- Opacidad -->
                <div class="vsb-range-row">
                    <span class="vsb-micro-lbl">Opac.</span>
                    <input type="range" min="0.2" max="1" step="0.05" value="1"
                           oninput="_changeTextOpacity(this.value)" class="vsb-range">
                    <span id="vsb-opacity-lbl" class="vsb-range-lbl">100%</span>
                </div>

                <!-- TIPOGRAFÍA -->
                <div class="vsb-section-label">Tipografía</div>
                <select class="vsb-select" onchange="_setFontFamily(this.value)" title="Fuente del texto">
                    <option value="Georgia,serif">Georgia (Clásica)</option>
                    <option value="'Times New Roman',serif">Times New Roman</option>
                    <option value="'Palatino Linotype',Palatino,serif">Palatino</option>
                    <option value="Garamond,serif">Garamond</option>
                    <option value="'Trebuchet MS',sans-serif">Trebuchet</option>
                    <option value="'Arial',sans-serif">Arial</option>
                    <option value="'Courier New',monospace">Courier New</option>
                    <option value="Impact,fantasy">Impact</option>
                </select>
                <div id="vsb-font-preview" class="vsb-font-preview">El hechicero...</div>

                <!-- BORDE TEXTO -->
                <div class="vsb-section-label">Borde texto</div>
                <div class="vsb-stroke-type-row">
                    <button id="vsb-stroke-none" class="vsb-mini-btn" onclick="_setStrokeType('none')" title="Sin borde" style="flex:1">✕</button>
                    <button id="vsb-stroke-solid" class="vsb-mini-btn vsb-active" onclick="_setStrokeType('solid')" title="Sólido" style="flex:1">▣</button>
                    <button id="vsb-stroke-gradient" class="vsb-mini-btn" onclick="_setStrokeType('gradient')" title="Degradado" style="flex:1">▦</button>
                </div>
                <div id="vsb-stroke-colors" class="vsb-stroke-colors-row">
                    <input type="color" value="#000000" oninput="_setStrokeColor1(this.value)" title="Color borde" class="vsb-color-tiny">
                    <div id="vsb-stroke-grad-row" style="display:none;align-items:center;gap:4px;display:flex;">
                        <span class="vsb-micro-lbl">→</span>
                        <input type="color" value="#1a0a00" oninput="_setStrokeColor2(this.value)" title="Color fin" class="vsb-color-tiny">
                    </div>
                </div>
                <div class="vsb-range-row">
                    <span class="vsb-micro-lbl">Ancho</span>
                    <input type="range" min="0" max="6" step="0.5" value="1"
                           oninput="_setStrokeWidth(this.value)" class="vsb-range">
                    <span id="vsb-stroke-w-lbl" class="vsb-range-lbl">1px</span>
                </div>

                <div class="vsb-divider"></div>

                <!-- REPRODUCCIÓN -->
                <div class="vsb-section-label">Reproducción</div>
                <div class="vsb-playback-row">
                    <button class="vsb-btn" onclick="videoCapituloAnterior()" title="Cap. anterior">⏮</button>
                    <button class="vsb-btn" onclick="videoTogglePlay()" title="Pausa / Continuar">⏯</button>
                    <button class="vsb-btn" onclick="videoCapituloSiguiente()" title="Cap. siguiente">⏭</button>
                </div>

            </div>
        </div>
    `;
    document.getElementById('video-overlay').appendChild(wrapper);
}
// ═══════════════════════════════════════
// EXPORTAR VIDEO — captura canvas + audio → WebM
// ═══════════════════════════════════════

let _exportMediaRecorder = null;
let _exportChunks = [];
let _exportCancelled = false;

async function exportarVideo() {
    if (_exportMediaRecorder && _exportMediaRecorder.state !== 'inactive') {
        mostrarNotificacion('⚠ Ya hay una exportación en curso');
        return;
    }

    const canvas = document.getElementById('video-canvas');
    if (!canvas) {
        mostrarNotificacion('⚠ Canvas no disponible');
        return;
    }

    if (!videoActive) {
        mostrarNotificacion('⚠ Abre el visor cinematográfico antes de exportar');
        return;
    }

    _exportCancelled = false;
    _exportChunks = [];

    // Capturar stream del canvas a 30 fps
    let canvasStream;
    try {
        canvasStream = canvas.captureStream(30);
    } catch (e) {
        mostrarNotificacion('⚠ Tu navegador no soporta captureStream');
        return;
    }

    // Añadir audio del AudioContext (música ambiental)
    const tracks = [...canvasStream.getTracks()];
    try {
        const ctx = (typeof getAudioCtx === 'function') ? getAudioCtx() : null;
        if (ctx) {
            const dest = ctx.createMediaStreamDestination();
            if (typeof ambientGainNode !== 'undefined' && ambientGainNode) {
                ambientGainNode.connect(dest);
            }
            dest.stream.getAudioTracks().forEach(t => tracks.push(t));
        }
    } catch (e) {
        console.warn('Audio no disponible para exportación:', e);
    }

    const combinedStream = new MediaStream(tracks);

    // Seleccionar mimeType compatible con el navegador
    const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    try {
        _exportMediaRecorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: 4_000_000
        });
    } catch (e) {
        mostrarNotificacion('⚠ Error al crear el grabador de video');
        console.error(e);
        return;
    }

    _exportMediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) _exportChunks.push(e.data);
    };

    _exportMediaRecorder.onstop = () => {
        if (_exportCancelled) {
            _exportChunks = [];
            mostrarNotificacion('✕ Exportación cancelada');
            _actualizarBotonesExport(false);
            return;
        }
        const blob = new Blob(_exportChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const titulo = document.getElementById('current-chapter-title')?.textContent || 'lectura';
        a.download = `${titulo.replace(/[^a-zA-Z0-9]/g, '_')}_video.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        mostrarNotificacion('✓ Video exportado');
        _actualizarBotonesExport(false);
    };

    _exportMediaRecorder.start(200);
    _actualizarBotonesExport(true);
    mostrarNotificacion('🔴 Grabando video… pulsa "⏹ Detener" para guardar');
}

function cancelarExportacion() {
    if (!_exportMediaRecorder || _exportMediaRecorder.state === 'inactive') {
        mostrarNotificacion('No hay exportación en curso');
        return;
    }
    _exportCancelled = true;
    _exportMediaRecorder.stop();
}

function detenerExportacion() {
    if (!_exportMediaRecorder || _exportMediaRecorder.state === 'inactive') return;
    _exportCancelled = false;
    _exportMediaRecorder.stop();
}

function _actualizarBotonesExport(grabando) {
    const btnExport = document.getElementById('btn-export-video');
    const btnCancel = document.getElementById('btn-cancel-export');
    if (btnExport) {
        btnExport.innerHTML = grabando ? '⏹ Detener' : '&#11015; Video';
        btnExport.onclick = grabando ? detenerExportacion : exportarVideo;
    }
    if (btnCancel) btnCancel.style.display = grabando ? 'inline-block' : 'none';
}