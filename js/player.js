// ─── AMBIENT MUSIC ENGINE — Web Audio API Procedural Generation ───
// Genera música ambiental 100% en el navegador sin URLs externas

// ─── AMBIENT MUSIC ENGINE — Web Audio API Procedural Generation ───
// Genera música ambiental 100% en el navegador sin URLs externas

let ambientCtx = null;
let ambientNodes = [];
let ambientPlaying = false;
let ambientGenre = null;
let ambientGainNode = null;
let ambientVolume = 0.15;

function getAudioCtx() {
    if (!ambientCtx) ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
    return ambientCtx;
}

// ── Generadores por género ──
const GENRE_GENERATORS = {

    mystery: (ctx, gain) => {
        // Notas oscuras lentas + reverb simulado
        const notes = [130.81, 155.56, 174.61, 196.00, 220.00];
        const nodes = [];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.value = 0;
            osc.connect(g); g.connect(gain);
            osc.start();
            // Pulsa cada nota con tiempo diferente
            const interval = setInterval(() => {
                const now = ctx.currentTime;
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.08, now + 0.3);
                g.gain.linearRampToValueAtTime(0, now + 2.5);
            }, 3000 + i * 700);
            nodes.push({ osc, interval });
        });
        // Rumble bajo
        const rumble = ctx.createOscillator();
        const rg = ctx.createGain();
        rumble.type = 'sine'; rumble.frequency.value = 55;
        rg.gain.value = 0.04;
        rumble.connect(rg); rg.connect(gain); rumble.start();
        nodes.push({ osc: rumble });
        return nodes;
    },

    suspense: (ctx, gain) => {
        const nodes = [];
        // Tremolo tense string simulation
        [220, 233, 246].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            const g = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = freq;
            lfo.type = 'sine'; lfo.frequency.value = 6 + i;
            lfoGain.gain.value = 0.03;
            g.gain.value = 0.04;
            lfo.connect(lfoGain); lfoGain.connect(g.gain);
            osc.connect(g); g.connect(gain);
            osc.start(); lfo.start();
            nodes.push({ osc }, { osc: lfo });
        });
        // Heartbeat-like bass
        const bass = ctx.createOscillator();
        const bg = ctx.createGain();
        bass.type = 'sine'; bass.frequency.value = 80;
        bg.gain.value = 0;
        bass.connect(bg); bg.connect(gain); bass.start();
        const beat = setInterval(() => {
            const now = ctx.currentTime;
            bg.gain.setValueAtTime(0, now);
            bg.gain.linearRampToValueAtTime(0.12, now + 0.05);
            bg.gain.linearRampToValueAtTime(0, now + 0.3);
            bg.gain.setValueAtTime(0, now + 0.5);
            bg.gain.linearRampToValueAtTime(0.08, now + 0.55);
            bg.gain.linearRampToValueAtTime(0, now + 0.8);
        }, 1800);
        nodes.push({ osc: bass, interval: beat });
        return nodes;
    },

    drama: (ctx, gain) => {
        const nodes = [];
        // Slow cinematic pads
        [[261.63, 0.06], [329.63, 0.04], [392.00, 0.03], [493.88, 0.025]].forEach(([freq, vol]) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.value = vol;
            osc.connect(g); g.connect(gain); osc.start();
            nodes.push({ osc });
        });
        // Slow filter sweep
        const noise = ctx.createOscillator();
        const ng = ctx.createGain();
        noise.type = 'triangle'; noise.frequency.value = 110;
        ng.gain.value = 0.05;
        noise.connect(ng); ng.connect(gain); noise.start();
        nodes.push({ osc: noise });
        return nodes;
    },

    action: (ctx, gain) => {
        const nodes = [];
        // Aggressive rhythm + brass-like hits
        const bassOsc = ctx.createOscillator();
        const bg = ctx.createGain();
        bassOsc.type = 'square'; bassOsc.frequency.value = 110;
        bg.gain.value = 0;
        bassOsc.connect(bg); bg.connect(gain); bassOsc.start();
        let beat = 0;
        const rhythm = [1, 0, 1, 0, 1, 1, 0, 1];
        const interval = setInterval(() => {
            if (rhythm[beat % rhythm.length]) {
                const now = ctx.currentTime;
                bg.gain.setValueAtTime(0.1, now);
                bg.gain.linearRampToValueAtTime(0, now + 0.15);
            }
            beat++;
        }, 200);
        nodes.push({ osc: bassOsc, interval });
        // High tension strings
        [440, 554, 659].forEach(freq => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = freq;
            g.gain.value = 0.025;
            o.connect(g); g.connect(gain); o.start();
            nodes.push({ osc: o });
        });
        return nodes;
    },

    fantasy: (ctx, gain) => {
        const nodes = [];
        // Magical harp-like arpeggios
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
        let noteIdx = 0;
        const playNote = () => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = scale[noteIdx % scale.length];
            g.gain.value = 0;
            osc.connect(g); g.connect(gain); osc.start();
            const now = ctx.currentTime;
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(0.07, now + 0.05);
            g.gain.linearRampToValueAtTime(0, now + 1.2);
            setTimeout(() => osc.stop(), 1500);
            noteIdx++;
        };
        const interval = setInterval(playNote, 400);
        nodes.push({ interval });
        // Pad underneath
        const pad = ctx.createOscillator();
        const pg = ctx.createGain();
        pad.type = 'sine'; pad.frequency.value = 130.81;
        pg.gain.value = 0.03;
        pad.connect(pg); pg.connect(gain); pad.start();
        nodes.push({ osc: pad });
        return nodes;
    },

    romance: (ctx, gain) => {
        const nodes = [];
        // Warm, slow piano-like notes
        const melody = [261.63, 329.63, 392.00, 329.63, 261.63, 293.66, 349.23, 293.66];
        let idx = 0;
        const interval = setInterval(() => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = melody[idx % melody.length];
            g.gain.value = 0;
            osc.connect(g); g.connect(gain); osc.start();
            const now = ctx.currentTime;
            g.gain.linearRampToValueAtTime(0.08, now + 0.1);
            g.gain.linearRampToValueAtTime(0, now + 1.8);
            setTimeout(() => osc.stop(), 2000);
            // Armonía
            const osc2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            osc2.type = 'sine'; osc2.frequency.value = melody[idx % melody.length] * 1.5;
            g2.gain.value = 0;
            osc2.connect(g2); g2.connect(gain); osc2.start();
            g2.gain.linearRampToValueAtTime(0.04, now + 0.15);
            g2.gain.linearRampToValueAtTime(0, now + 1.5);
            setTimeout(() => osc2.stop(), 1800);
            idx++;
        }, 800);
        nodes.push({ interval });
        return nodes;
    },

    lofi: (ctx, gain) => {
        const nodes = [];
        // Lo-fi: muffled chords + vinyl crackle simulation
        const chords = [[261.63, 329.63, 392.00], [246.94, 311.13, 369.99], [220.00, 277.18, 329.63]];
        let ci = 0;
        const interval = setInterval(() => {
            chords[ci % chords.length].forEach(freq => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass'; filter.frequency.value = 800; // Muffled
                osc.type = 'triangle'; osc.frequency.value = freq;
                g.gain.value = 0;
                osc.connect(filter); filter.connect(g); g.connect(gain); osc.start();
                const now = ctx.currentTime;
                g.gain.linearRampToValueAtTime(0.05, now + 0.1);
                g.gain.linearRampToValueAtTime(0.04, now + 1.5);
                g.gain.linearRampToValueAtTime(0, now + 2);
                setTimeout(() => osc.stop(), 2200);
            });
            ci++;
        }, 2000);
        nodes.push({ interval });
        // Rain-like noise
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.015;
        const src = ctx.createBufferSource();
        src.buffer = buffer; src.loop = true;
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass'; nf.frequency.value = 2000;
        src.connect(nf); nf.connect(gain); src.start();
        nodes.push({ src });
        return nodes;
    },

    nature: (ctx, gain) => {
        const nodes = [];
        // Wind + birds simulation
        // Wind: filtered noise
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const wind = ctx.createBufferSource();
        wind.buffer = buffer; wind.loop = true;
        const wf = ctx.createBiquadFilter();
        wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.5;
        const wg = ctx.createGain(); wg.gain.value = 0.08;
        wind.connect(wf); wf.connect(wg); wg.connect(gain); wind.start();
        nodes.push({ src: wind });
        // Bird chirps
        const chirp = () => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(2000 + Math.random() * 1000, ctx.currentTime);
            o.frequency.linearRampToValueAtTime(2800 + Math.random() * 800, ctx.currentTime + 0.1);
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.02);
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
            o.connect(g); g.connect(gain); o.start();
            setTimeout(() => o.stop(), 200);
        };
        const interval = setInterval(() => {
            chirp();
            if (Math.random() > 0.5) setTimeout(chirp, 150);
        }, 1500 + Math.random() * 3000);
        nodes.push({ interval });
        return nodes;
    },

    horror: (ctx, gain) => {
        const nodes = [];
        // Deep drone oscilante + pulso irregular de bajo
        const drone = ctx.createOscillator();
        const dg = ctx.createGain();
        drone.type = 'sawtooth'; drone.frequency.value = 60;
        dg.gain.value = 0.06;
        drone.connect(dg); dg.connect(gain); drone.start();
        nodes.push({ osc: drone });
        // Segundo drone ligeramente desafinado para efecto de batido
        const drone2 = ctx.createOscillator();
        const dg2 = ctx.createGain();
        drone2.type = 'sine'; drone2.frequency.value = 62.5;
        dg2.gain.value = 0.04;
        drone2.connect(dg2); dg2.connect(gain); drone2.start();
        nodes.push({ osc: drone2 });
        // Golpes graves irregulares
        const thudOsc = ctx.createOscillator();
        const tg = ctx.createGain();
        thudOsc.type = 'sine'; thudOsc.frequency.value = 40;
        tg.gain.value = 0;
        thudOsc.connect(tg); tg.connect(gain); thudOsc.start();
        const thud = setInterval(() => {
            if (Math.random() > 0.4) {
                const now = ctx.currentTime;
                tg.gain.setValueAtTime(0, now);
                tg.gain.linearRampToValueAtTime(0.18, now + 0.04);
                tg.gain.linearRampToValueAtTime(0, now + 0.6);
            }
        }, 1200 + Math.random() * 2000);
        nodes.push({ osc: thudOsc, interval: thud });
        // Chirrido agudo esporádico
        const shriek = setInterval(() => {
            if (Math.random() > 0.7) {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine'; o.frequency.value = 900 + Math.random() * 600;
                g.gain.value = 0;
                o.connect(g); g.connect(gain); o.start();
                const now = ctx.currentTime;
                g.gain.linearRampToValueAtTime(0.03, now + 0.1);
                g.gain.linearRampToValueAtTime(0, now + 1.5);
                setTimeout(() => { try { o.stop(); } catch (e) { } }, 1700);
            }
        }, 4000 + Math.random() * 3000);
        nodes.push({ interval: shriek });
        return nodes;
    },

    adventure: (ctx, gain) => {
        const nodes = [];
        // Fanfarria heroica en corcheas con pad de fondo
        const heroScale = [261.63, 329.63, 392.00, 523.25, 659.25, 523.25, 440.00, 392.00];
        let noteIdx = 0;
        const melody = setInterval(() => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = heroScale[noteIdx % heroScale.length] * (noteIdx % 16 < 8 ? 1 : 0.5);
            g.gain.value = 0;
            osc.connect(g); g.connect(gain); osc.start();
            const now = ctx.currentTime;
            g.gain.linearRampToValueAtTime(0.06, now + 0.02);
            g.gain.linearRampToValueAtTime(0, now + 0.35);
            setTimeout(() => { try { osc.stop(); } catch (e) { } }, 450);
            noteIdx++;
        }, 380);
        nodes.push({ interval: melody });
        // Bombo épico en tiempos fuertes
        const kick = ctx.createOscillator();
        const kg = ctx.createGain();
        kick.type = 'sine'; kick.frequency.value = 80;
        kg.gain.value = 0;
        kick.connect(kg); kg.connect(gain); kick.start();
        const beat = setInterval(() => {
            const now = ctx.currentTime;
            kg.gain.setValueAtTime(0.15, now);
            kg.gain.linearRampToValueAtTime(0, now + 0.25);
        }, 760);
        nodes.push({ osc: kick, interval: beat });
        // Pad de fondo para profundidad
        [130.81, 196.00].forEach(freq => {
            const p = ctx.createOscillator();
            const pg = ctx.createGain();
            p.type = 'sine'; p.frequency.value = freq;
            pg.gain.value = 0.03;
            p.connect(pg); pg.connect(gain); p.start();
            nodes.push({ osc: p });
        });
        return nodes;
    }
};

const GENRE_LABELS = {
    mystery: 'Misterio oscuro', suspense: 'Suspenso tenso', drama: 'Drama cinematográfico',
    action: 'Acción intensa', fantasy: 'Fantasía mágica', romance: 'Romance suave',
    lofi: 'Lo-Fi + lluvia', nature: 'Naturaleza y viento',
    horror: 'Horror oscuro', adventure: 'Aventura épica'
};

// ── Freesound API key management ──
let freesoundApiKey = localStorage.getItem('freesound_api_key') || 'JCXLtKvEpLo3DJTYy3pRIXEcEWMTLRWK3UEcJ5iD';

function guardarApiKey() {
    const key = document.getElementById('freesound-api-key').value.trim();
    if (key) {
        freesoundApiKey = key;
        localStorage.setItem('freesound_api_key', key);
        document.getElementById('key-status').textContent = '✓ guardada';
        document.getElementById('freesound-api-key').value = '';
        setTimeout(() => document.getElementById('key-status').textContent = '', 2000);
    }
}

// Show key status on load
window.addEventListener('DOMContentLoaded', () => {
    const keyStatusEl = document.getElementById('key-status');
    if (freesoundApiKey && keyStatusEl) {
        keyStatusEl.textContent = '✓ configurada';
    }
});

// ── Freesound multi-query system con subtonos ──
// Múltiples queries por género para mejor variedad y precisión
const FREESOUND_QUERIES = {
    mystery: ['dark mystery ambient', 'noir detective atmosphere', 'eerie suspense drone', 'dark cinematic tension'],
    suspense: ['suspense thriller tension', 'psychological horror ambient', 'heartbeat tense atmosphere', 'chase scene cinematic'],
    drama: ['emotional piano ambient', 'cinematic sad orchestral', 'melancholy strings atmosphere', 'dramatic film score'],
    action: ['epic battle cinematic', 'intense action orchestral', 'war drums epic', 'adrenaline cinematic score'],
    fantasy: ['magical fantasy ambient', 'ethereal fantasy soundscape', 'enchanted forest music', 'epic fantasy orchestral'],
    romance: ['romantic piano soft', 'love theme gentle strings', 'tender romantic ambient', 'soft acoustic romance'],
    lofi: ['lofi hip hop chill', 'study music ambient beats', 'chill lofi background', 'jazzy lofi instrumental'],
    nature: ['forest nature ambient', 'rain birds peaceful', 'ocean waves relaxing', 'meditation nature sounds'],
    horror: ['horror dark ambient', 'scary atmosphere drone', 'creepy tension music', 'dark horror soundscape'],
    adventure: ['adventure epic journey', 'exploration cinematic', 'heroic adventure theme', 'discovery orchestral'],
};

// Análisis avanzado: detecta tono, intensidad y subtono del texto
// Si hay universo detectado, aplica boost de géneros específicos
function analizarTextoDetallado(texto) {
    const lower = texto.toLowerCase().slice(0, 3000);
    const words = lower.split(/\s+/);
    const totalWords = words.length;

    // Función helper: cuenta ocurrencias por 1000 palabras (normalizado)
    const freq = (lista) => lista.reduce((s, w) => s + (lower.split(w).length - 1), 0) / totalWords * 1000;

    const scores = {
        mystery: freq(['misterio', 'enigma', 'sombra', 'oscuro', 'secreto', 'oculto', 'extraño', 'cadáver', 'crimen', 'investigar', 'pista', 'detecti', 'desapareció', 'cuerpo', 'asesino', 'veneno', 'conspiración']),
        suspense: freq(['tensión', 'peligro', 'trampa', 'amenaza', 'miedo', 'terror', 'acecho', 'perseguir', 'escapar', 'corazón', 'aceleró', 'tiempo', 'demasiado tarde', 'pistola', 'arma', 'disparó', 'huir', 'atrapado']),
        drama: freq(['llanto', 'lágrimas', 'dolor', 'sufrir', 'perder', 'traición', 'soledad', 'sacrificio', 'promesa', 'herida', 'culpa', 'perdón', 'familia', 'ruptura', 'pérdida', 'luto', 'desesperanza', 'fracasó']),
        action: freq(['combate', 'batalla', 'golpe', 'atacar', 'disparar', 'explotar', 'luchar', 'espada', 'victoria', 'enemigo', 'guerrero', 'sangre', 'herido', 'correr', 'saltar', 'velocidad', 'patada', 'puño', 'chocó']),
        fantasy: freq(['magia', 'hechizo', 'dragón', 'reino', 'elfo', 'mago', 'destino', 'profecía', 'criatura', 'portal', 'artefacto', 'encantamiento', 'espíritu', 'runa', 'hada', 'brujo', 'varita', 'conjuro', 'poción']),
        romance: freq(['amor', 'beso', 'mirada', 'suave', 'sentir', 'latir', 'ternura', 'abrazo', 'sonrisa', 'deseo', 'piel', 'suspirar', 'juntos', 'enamorar', 'cariño', 'corazón', 'acarició', 'besó', 'amaba']),
        lofi: freq(['estudiar', 'aprender', 'libro', 'notas', 'lección', 'conocimiento', 'teoría', 'análisis', 'investigación', 'datos', 'concepto', 'comprender', 'fórmula', 'clase', 'universidad', 'examen', 'trabajo']),
        nature: freq(['bosque', 'árbol', 'río', 'montaña', 'viento', 'lluvia', 'animal', 'campo', 'flor', 'tierra', 'cielo', 'amanecer', 'naturaleza', 'verde', 'agua', 'pájaro', 'mar', 'playa', 'selva', 'tormenta']),
        horror: freq(['horror', 'aterrador', 'monstruo', 'demonio', 'sangre', 'muerte', 'oscuridad', 'grito', 'pesadilla', 'fantasma', 'sombra', 'aparición', 'terror', 'carne', 'víscera', 'mutilado', 'cadáver', 'pudrir']),
        adventure: freq(['aventura', 'explorar', 'viaje', 'camino', 'destino', 'mapa', 'tesoro', 'expedición', 'descubrir', 'horizonte', 'navegar', 'peligro', 'misión', 'héroe', 'guardia', 'fortaleza', 'territorio']),
    };

    // ── Boost del universo detectado ──
    if (aiDetectedUniverse) {
        const univConfig = UNIVERSE_CONFIG[aiDetectedUniverse];
        const boost = univConfig?.ambient?.genreBoost;
        if (boost) {
            for (const [genre, val] of Object.entries(boost)) {
                if (scores[genre] !== undefined) scores[genre] += val;
            }
            console.log(`🎵 Boost de universo "${aiDetectedUniverse}" aplicado:`, JSON.stringify(boost));
        }
    }

    // Detectar intensidad general del texto
    const intensityWords = freq(['!', 'muy', 'enorme', 'increíble', 'absolutamente', 'completamente', 'jamás', 'nunca', 'siempre', 'desesperado', 'urgente']);
    const intensity = Math.min(intensityWords / 5, 1); // 0-1

    // Detectar ritmo (oraciones cortas = acción/suspenso, largas = drama/romance)
    const avgSentenceLen = lower.split(/[.!?]+/).filter(s => s.trim()).reduce((s, o) => s + o.split(' ').length, 0) / Math.max(lower.split(/[.!?]+/).length, 1);
    const isPaced = avgSentenceLen < 12; // oraciones cortas = más urgente

    // Ganador
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const winner = sorted[0][0];
    const runnerUp = sorted[1][0];
    const confidence = sorted[0][1] > 0 ? Math.min(sorted[0][1] / (sorted[1][1] + 0.1), 3) : 0;

    return { genre: winner, secondary: runnerUp, confidence, intensity, isPaced, scores };
}

let freesoundTrackUrl = null;
let freesoundAudio = null;
let _lastFreesoundResults = {};  // cache por género

async function buscarEnFreesound(genre, subtono) {
    if (!freesoundApiKey) return null;

    // ── Queries del universo tienen prioridad si hay uno detectado ──
    let queries;
    const univAmbient = aiDetectedUniverse ? UNIVERSE_CONFIG[aiDetectedUniverse]?.ambient : null;
    if (univAmbient?.freesoundQueries?.length) {
        queries = univAmbient.freesoundQueries;
        console.log(`🎵 Usando queries de universo "${aiDetectedUniverse}"`);
    } else {
        queries = FREESOUND_QUERIES[genre] || FREESOUND_QUERIES['mystery'];
    }

    const queryStr = queries[Math.floor(Math.random() * queries.length)];

    // Cache por clave compuesta (universo + género)
    const cacheKey = univAmbient ? `__universe__${aiDetectedUniverse}` : genre;
    if (_lastFreesoundResults[cacheKey] && _lastFreesoundResults[cacheKey].length > 1) {
        const pool = _lastFreesoundResults[cacheKey];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return pick;
    }

    const query = encodeURIComponent(queryStr);
    const url = `https://freesound.org/apiv2/search/text/?query=${query}&filter=duration:[60 TO 360]&fields=name,previews,duration,avg_rating&page_size=20&sort=rating_desc&token=${freesoundApiKey}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 401) document.getElementById('key-status').textContent = '✗ key inválida';
            return null;
        }
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const good = data.results
                .filter(t => t.avg_rating >= 3 || data.results.indexOf(t) < 8)
                .map(t => ({ url: t.previews['preview-hq-mp3'], name: t.name, duration: t.duration }));
            _lastFreesoundResults[cacheKey] = good;
            return good[Math.floor(Math.random() * good.length)];
        }
    } catch (e) { console.warn('Freesound error:', e); }
    return null;
}

function toggleAmbientPanel() {
    const player = document.getElementById('ambient-player');
    const arrow = document.getElementById('ambient-arrow');
    const isCollapsed = player.classList.contains('collapsed');
    player.classList.toggle('collapsed');
    // Efecto bandeja DVD: la flecha indica dirección de la bandeja
    // ▶ = cerrado (bandeja adentro, click para expulsar), ◀ = abierto (bandeja afuera, click para retraer)
    arrow.textContent = isCollapsed ? '◀' : '▶';
}

async function selectGenre(genre) {
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    // Guard: géneros internos (horror, adventure) no tienen botón en el DOM
    const genreBtn = document.getElementById('genre-' + genre);
    if (genreBtn) genreBtn.classList.add('active');
    ambientGenre = genre;
    stopAmbient();
    document.getElementById('ambient-track-name').textContent = '⏳ Cargando...';
    document.getElementById('ambient-track-genre').textContent = freesoundApiKey ? 'buscando en Freesound...' : 'generador local';
    // Clear cache for this genre so we get a fresh random track
    delete _lastFreesoundResults[genre];
    await playAmbient(genre);
}

async function playAmbient(genre) {
    const g = genre || ambientGenre;

    // Try Freesound first if key is available
    if (freesoundApiKey) {
        const track = await buscarEnFreesound(g, null);
        if (track) {
            freesoundAudio = new Audio(track.url);
            freesoundAudio.loop = true;
            freesoundAudio.volume = ambientVolume;
            freesoundAudio.crossOrigin = 'anonymous';
            freesoundAudio.play().then(() => {
                ambientPlaying = true;
                document.getElementById('ambient-play-btn').textContent = '⏸';
                document.getElementById('ambient-eq').classList.add('playing');
                document.getElementById('ambient-track-name').textContent = track.name;
                document.getElementById('ambient-track-genre').textContent = '♪ Freesound CC0';
                document.getElementById('ambient-player').classList.add('ambient-playing');
            }).catch(() => playAmbientLocal(g));
            return;
        }
    }
    // Fallback: procedural
    playAmbientLocal(g);
}

function playAmbientLocal(genre) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    ambientGainNode = ctx.createGain();
    ambientGainNode.gain.value = ambientVolume;
    ambientGainNode.connect(ctx.destination);
    const generator = GENRE_GENERATORS[genre || ambientGenre];
    if (!generator) return;
    ambientNodes = generator(ctx, ambientGainNode);
    ambientPlaying = true;
    document.getElementById('ambient-play-btn').textContent = '⏸';
    document.getElementById('ambient-eq').classList.add('playing');
    document.getElementById('ambient-track-name').textContent = GENRE_LABELS[genre];
    document.getElementById('ambient-track-genre').textContent = '♪ generado localmente';
    document.getElementById('ambient-player').classList.add('ambient-playing');
}

function stopAmbient() {
    // Stop Freesound audio
    if (freesoundAudio) {
        freesoundAudio.pause();
        freesoundAudio.src = '';
        freesoundAudio = null;
    }
    // Stop procedural nodes
    ambientNodes.forEach(n => {
        try { if (n.osc) n.osc.stop(); } catch (e) { }
        try { if (n.src) n.src.stop(); } catch (e) { }
        if (n.interval) clearInterval(n.interval);
    });
    ambientNodes = [];
    if (ambientGainNode) {
        try { ambientGainNode.disconnect(); } catch (e) { }
        ambientGainNode = null;
    }
    ambientPlaying = false;
    document.getElementById('ambient-play-btn').textContent = '▶';
    document.getElementById('ambient-eq').classList.remove('playing');
    document.getElementById('ambient-player').classList.remove('ambient-playing');
}

function toggleAmbientPlay() {
    if (!ambientGenre) {
        document.getElementById('ambient-track-name').textContent = '← Elige un género primero';
        return;
    }
    if (ambientPlaying) {
        // Pausar sin destruir el audio actual
        if (freesoundAudio && !freesoundAudio.paused) freesoundAudio.pause();
        ambientPlaying = false;
        const playBtn = document.getElementById('ambient-play-btn');
        if (playBtn) playBtn.textContent = '▶';
        document.getElementById('ambient-player').classList.remove('ambient-playing');
    } else {
        // Reanudar el audio existente; solo cargar uno nuevo si no hay nada
        if (freesoundAudio && freesoundAudio.src) {
            freesoundAudio.play().catch(() => { });
            ambientPlaying = true;
            const playBtn = document.getElementById('ambient-play-btn');
            if (playBtn) playBtn.textContent = '⏸';
            document.getElementById('ambient-player').classList.add('ambient-playing');
        } else {
            playAmbient(ambientGenre);
        }
    }
}

async function siguienteTrack() {
    if (!ambientGenre) return;
    stopAmbient();

    // La caché puede estar bajo la key del universo o del género — limpiar la correcta
    const cacheKey = (typeof aiDetectedUniverse !== 'undefined' && aiDetectedUniverse)
        ? `__universe__${aiDetectedUniverse}`
        : ambientGenre;

    if (_lastFreesoundResults[cacheKey]) {
        _lastFreesoundResults[cacheKey].shift();
        if (_lastFreesoundResults[cacheKey].length === 0) {
            delete _lastFreesoundResults[cacheKey];
        }
    }
    document.getElementById('ambient-track-name').textContent = '⏳ Cargando siguiente...';
    await playAmbient(ambientGenre);
}

function setAmbientVolume(val) {
    ambientVolume = val / 100;
    document.getElementById('ambient-vol-val').textContent = val + '%';
    if (ambientGainNode) ambientGainNode.gain.value = ambientVolume;
    if (freesoundAudio) freesoundAudio.volume = ambientVolume;
}

// detectarGeneroLocal reemplazado por analizarTextoDetallado arriba

async function detectarGeneroConIA() {
    const texto = document.getElementById('texto-contenido').textContent.trim();
    if (!texto || texto.length < 100) {
        document.getElementById('ambient-track-name').textContent = 'Carga un capítulo primero';
        return;
    }

    const btn = document.getElementById('btn-detect-genre');
    btn.textContent = '⏳ Analizando...';
    btn.disabled = true;

    // Análisis local rico
    const analysis = analizarTextoDetallado(texto);
    const { genre, secondary, confidence, intensity, isPaced, scores } = analysis;

    // Mostrar top 3 en consola para debug
    const top3 = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log('🎵 Análisis de texto:', top3.map(([g, s]) => `${g}:${s.toFixed(2)}`).join(', '), '| intensidad:', intensity.toFixed(2), '| ritmo:', isPaced ? 'rápido' : 'lento');

    // Seleccionar género con subtono
    await selectGenreWithAnalysis(genre, secondary, confidence, intensity, isPaced);

    btn.textContent = '✨ Detectar género del texto';
    btn.disabled = false;
}

async function selectGenreWithAnalysis(genre, secondary, confidence, intensity, isPaced) {
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    // Guard: horror y adventure son géneros internos sin botón en el DOM
    const btn = document.getElementById('genre-' + genre);
    if (btn) btn.classList.add('active');
    ambientGenre = genre;
    stopAmbient();

    const confLabel = confidence > 2 ? 'muy claro' : confidence > 1 ? 'probable' : 'leve';
    const rhythmLabel = isPaced ? 'ritmo rápido' : 'ritmo pausado';
    document.getElementById('ambient-track-name').textContent = '⏳ Buscando en Freesound...';

    // Mostrar label del universo si está activo
    const univLabel = aiDetectedUniverse
        ? UNIVERSE_CONFIG[aiDetectedUniverse]?.ambient?.label || aiDetectedUniverse
        : null;
    const genreDisplay = univLabel
        ? `${univLabel} · ${GENRE_LABELS[genre]} · ${confLabel}`
        : `${GENRE_LABELS[genre]} · ${confLabel} · ${rhythmLabel}`;
    document.getElementById('ambient-track-genre').textContent = genreDisplay;

    await playAmbient(genre);
}

// ─── POLYFILLS ───
// roundRect polyfill for browsers that don't support it
// roundRect polyfill for browsers that don't support it
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        this.closePath();
        return this;
    };
}