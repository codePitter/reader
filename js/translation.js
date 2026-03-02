// ═══════════════════════════════════════
// TRANSLATION — Traducción automática, humanizador IA, cache de capítulos
// Depende de: main.js (reemplazosAutomaticos, _capCache, _bgCancelToken,
//                      traduccionAutomatica, mostrarNotificacion, actualizarEstadisticas)
// ═══════════════════════════════════════

// ─── IDIOMA DESTINO ───
const _browserLang = (navigator.language || navigator.userLanguage || 'es').split('-')[0].toLowerCase();

const _langNames = {
    es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano',
    ja: '日本語', ko: '한국어', zh: '中文', ru: 'Русский', ar: 'العربية',
    pl: 'Polski', nl: 'Nederlands', sv: 'Svenska', tr: 'Türkçe', uk: 'Українська',
    hi: 'हिन्दी', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia'
};

// Constantes base (idioma del navegador)
const TRANSLATION_TARGET_LANG = _browserLang;
const TRANSLATION_TARGET_NAME = _langNames[_browserLang] || _browserLang.toUpperCase();

// ── Getter dinámico: devuelve el override del usuario si existe, si no el del navegador ──
// Todas las funciones de traducción deben usar _getLang() en vez de TRANSLATION_TARGET_LANG
// para respetar el selector de idioma de ui.js
function _getLang() {
    return window._traduccionLangOverride || TRANSLATION_TARGET_LANG;
}
function _getLangName() {
    const lang = _getLang();
    return _langNames[lang] || lang.toUpperCase();
}

// Actualizar hint en UI al cargar
document.addEventListener('DOMContentLoaded', () => {
    const hint = document.getElementById('traduccion-lang-hint');
    if (hint) hint.textContent = `→ ${TRANSLATION_TARGET_NAME} (${TRANSLATION_TARGET_LANG})`;
    // Sincronizar el selector de idioma con el idioma detectado
    const sel = document.getElementById('translation-lang-select');
    if (sel && sel.value !== TRANSLATION_TARGET_LANG) sel.value = TRANSLATION_TARGET_LANG;
});

// ─── TTS HUMANIZADOR IA ───
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
    localStorage.setItem('claude_api_key', key);  // compatibilidad legacy
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

// ─── HUMANIZADOR IA ───

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
// independientemente del humanizador IA, como primera y última línea de defensa
function _sanitizarParaTTS(texto) {
    return texto
        // ── Markdown / negrita / cursiva ──
        .replace(/\*\*([^*]+)\*\*/g, '$1')           // **negrita** → texto
        .replace(/\*([^*]+)\*/g, '$1')               // *cursiva* → texto
        .replace(/^#{1,6}\s+/gm, '')                 // ## encabezados markdown
        .replace(/_([^_]+)_/g, '$1')                 // _énfasis_ markdown

        // ── Comillas → guión de diálogo ──
        .replace(/"([^"]+)"/g, '—$1')               // "diálogo" → —diálogo
        .replace(/\u201C([^\u201D]+)\u201D/g, '—$1') // "diálogo" tipográfico
        .replace(/\u2018([^\u2019]+)\u2019/g, '$1')  // 'comillas simples'
        .replace(/\u00AB([^\u00BB]+)\u00BB/g, '—$1') // «guillemets» → —diálogo

        // ── Comillas sueltas sin par (las que quedaron después del paso anterior) ──
        .replace(/[\u201C\u201D\u201E\u201F]/g, '')  // " " „ ‟ tipográficas sueltas
        .replace(/[\u2018\u2019\u201A\u201B]/g, '')  // ' ' ‚ ‛ simples sueltas
        .replace(/[\u00AB\u00BB\u2039\u203A]/g, '') // « » ‹ › guillemets sueltos
        .replace(/(?<![\w\d])"(?![\w\d])/g, '')      // " recto solo (no dentro de palabra)

        // ── Corchetes: stats [1200/6000] → "1200 de 6000", notas [1] → vacío ──
        .replace(/\[(\d+)\]/g, '')
        .replace(/\[(\d[\d,]*)\s*\/\s*(\d[\d,]*)\]/g, ' $1 de $2 ')
        .replace(/\[([^\]]{1,60})\]/g, '$1')
        .replace(/\[([^\]]{61,})\]/g, '')

        // ── Paréntesis cortos → conservar sin paréntesis, largos → eliminar ──
        .replace(/\(([^)]{1,80})\)/g, (m, c) => /^[A-Z]{2,}$/.test(c.trim()) ? '' : `, ${c},`)
        .replace(/\([^)]{81,}\)/g, '')

        // ── Símbolos sueltos problemáticos para TTS ──
        .replace(/\*+/g, '')                          // asteriscos sueltos
        .replace(/#{1,6}/g, '')                       // # sueltos
        .replace(/[`´¨~^]/g, '')                      // backticks y diacríticos especiales
        .replace(/\u2026/g, '... ')                   // … → tres puntos
        .replace(/—{2,}/g, '—')                       // —— múltiples → uno
        .replace(/-{3,}/g, '—')                       // --- → guión largo
        .replace(/\/{2,}/g, ' ')                      // // → espacio
        .replace(/\\+/g, ' ')                         // \ → espacio
        .replace(/ \| /g, ', ')                       // pipe espaciado → coma
        .replace(/\|/g, ' ')                          // pipe suelto → espacio
        .replace(/<[^>]+>/g, '')                      // tags HTML residuales
        .replace(/&[a-z]+;/gi, ' ')                   // entidades HTML

        // ── Espaciado y saltos ──
        .replace(/  +/g, ' ')
        // ── Eliminar líneas que son solo símbolos/comillas (sin texto real) ──
        .replace(/^[^\p{L}\p{N}\n]{0,3}$/gmu, '')    // líneas vacías o solo símbolos
        .replace(/\n{3,}/g, '\n\n')                    // colapsar vacíos generados
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Llama al proveedor de IA seleccionado para naturalizar un bloque
// Con retry exponencial: hasta 3 intentos, espera 2s → 4s → 8s en caso de 429
async function _naturalizarBloque(bloque, _intento = 0) {
    const bloqueClean = _sanitizarParaTTS(bloque);
    if (!claudeApiKey) return bloqueClean;

    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    if (!prov) return bloqueClean;

    const MAX_REINTENTOS = 3;
    const DELAY_BASE_MS = 2000; // 2s, 4s, 8s

    try {
        const prompt = HUMANIZER_PROMPT_TEMPLATE(bloqueClean);
        const urlFn = typeof prov.url === 'function' ? prov.url(claudeApiKey) : prov.url;

        const res = await fetch(urlFn, {
            method: 'POST',
            headers: prov.headers(claudeApiKey),
            body: JSON.stringify(prov.body(prompt))
        });

        // ── Rate limit (429) → retry con backoff exponencial ──
        if (res.status === 429) {
            if (_intento < MAX_REINTENTOS) {
                const espera = DELAY_BASE_MS * Math.pow(2, _intento);
                console.warn(`[Humanizador] ${prov.name} 429 Rate Limit — reintento ${_intento + 1}/${MAX_REINTENTOS} en ${espera / 1000}s...`);
                // Mostrar aviso en la barra de progreso si existe
                const mpbLabel = document.getElementById('mpb-label');
                if (mpbLabel) mpbLabel.textContent = `⏳ Rate limit ${prov.name} — esperando ${espera / 1000}s...`;
                await new Promise(r => setTimeout(r, espera));
                return _naturalizarBloque(bloque, _intento + 1);
            }
            console.warn(`[Humanizador] ${prov.name} 429 tras ${MAX_REINTENTOS} reintentos — saltando bloque`);
            return bloqueClean;
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn(`${prov.name} error:`, err?.error?.message || res.status);
            return bloqueClean;
        }

        const data = await res.json();
        const resultado = prov.extract(data) || bloqueClean;
        return _sanitizarParaTTS(resultado);
    } catch (e) {
        console.warn('Humanizador falló:', e.message);
        return bloqueClean;
    }
}

// Humaniza el texto completo dividiendo en bloques y procesando en lotes de 3 paralelos
async function naturalizarTextoParaTTS(texto, onProgreso) {
    if (!ttsHumanizerActivo || !claudeApiKey || !texto) return texto;

    const bloques = _dividirEnBloques(texto);
    const total = bloques.length;
    const resultados = new Array(total);
    let procesados = 0;

    const prov = HUMANIZER_PROVIDERS[humanizerProvider];
    console.log(`✨ Naturalizando ${total} bloque(s) con ${claudeApiKey ? (prov?.name || humanizerProvider) : 'sanitizador local'}...`);

    // OpenRouter tiene rate limit bajo en el plan free → procesar de a 1 (secuencial)
    // Otros proveedores toleran hasta 3 en paralelo
    const LOTE = humanizerProvider === 'openrouter' ? 1 : 3;
    const DELAY_ENTRE_LOTES = humanizerProvider === 'openrouter' ? 800 : 0; // ms entre lotes

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
        // Pequeña pausa entre lotes para OpenRouter
        if (DELAY_ENTRE_LOTES > 0 && i + LOTE < total) {
            await new Promise(r => setTimeout(r, DELAY_ENTRE_LOTES));
        }
    }

    return resultados.join('\n\n');
}

// ─── UTILIDADES DE TEXTO ───

// Limpieza silenciosa de referencias a URLs/dominios
function limpiarURLs(texto) {
    return texto
        .replace(/\S*\s*\.\s*(?:com|net|org|io|co|ar|es|edu|gov|info|biz|tv|me|app)\b[^\s]*/gi, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function aplicarReemplazosAutomaticos(texto) {
    let textoModificado = texto;
    for (const [buscar, reemplazar] of Object.entries(reemplazosAutomaticos)) {
        try {
            // Escapar caracteres especiales de regex para que literales como "***" funcionen
            const buscarEscapado = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(buscarEscapado, 'gi');
            textoModificado = textoModificado.replace(regex, (match) => {
                // Si reemplazar es vacío, devolver vacío directamente (sin lógica de capitalización)
                if (!reemplazar) return '';
                if (match.charAt(0) === match.charAt(0).toUpperCase() && match.charAt(0) !== match.charAt(0).toLowerCase()) {
                    return reemplazar.charAt(0).toUpperCase() + reemplazar.slice(1);
                }
                if (match === match.toUpperCase()) return reemplazar.toUpperCase();
                return reemplazar;
            });
        } catch (e) { /* regex inválida, saltar */ }
    }
    return textoModificado;
}

// Renderiza texto plano en el contenedor usando textContent (seguro contra XSS)
function renderizarTextoEnContenedor(el, texto) {
    if (!el || !texto) return;
    el.textContent = texto.trim();
}

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── BARRAS DE PROGRESO ───

// _traduccionEnBackground: si true, no actualizar UI (pre-traducción silenciosa)
let _traduccionEnBackground = false;

function actualizarProgresoTraduccion(actual, total) {
    if (_traduccionEnBackground) return;

    // cargarCapitulo() puede sobrescribir esta función para controlar la escala de fases
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
    // tts-percent eliminado — el % se muestra en mpb-pct

    // Overlay del modo video
    const kWrap = document.getElementById('video-translation-progress');
    const kFill = document.getElementById('ktl-fill');
    const kPct = document.getElementById('ktl-pct');
    // if (kWrap) kWrap.style.display = 'flex'; // no mostrar overlay de video durante traducción
    if (kFill) kFill.style.width = pct + '%';
    if (kPct) kPct.textContent = pct + '%';
}

function finalizarProgresoTraduccion() {
    if (_traduccionEnBackground) return; // BG silencioso — no tocar la UI
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('tts-status-label');
    const pctEl = document.getElementById('tts-percent');
    if (fill) { fill.style.width = '100%'; setTimeout(() => { fill.style.width = '0%'; }, 1000); }
    if (label) label.textContent = '⏹ Sin reproducción';
    // tts-percent eliminado

    const kWrap = document.getElementById('video-translation-progress');
    const kFill = document.getElementById('ktl-fill');
    if (kFill) kFill.style.width = '100%';
    if (kWrap) setTimeout(() => { kWrap.style.display = 'none'; }, 1200);
}

function mostrarProgresoRevision(msg) {
    if (_traduccionEnBackground) return; // BG silencioso — no tocar la UI
    const label = document.getElementById('tts-status-label');
    const fill = document.getElementById('progress-fill');
    const pctEl = document.getElementById('tts-percent');
    if (fill) fill.style.width = '100%';
    if (label) label.innerHTML = '<span style="color:var(--accent)">🔍</span> ' + msg;
    // tts-percent eliminado
}

// ─── DETECCIÓN DE INGLÉS ───

function esParrafoEnIngles(texto) {
    if (!texto || texto.trim().length < 15) return false;
    const marcadores = /\b(the|and|with|that|this|from|they|their|there|were|have|been|would|could|should|which|when|then|than|what|said|into|your|will|about|after|before|while|through|where|being|those|these|just|also|such|each|some|only|over|under|like|even|back|take|make|come|know|think|look|well|much|more|him|her|his|was|not|but|for|are)\b/gi;
    const palabras = texto.trim().split(/\s+/).filter(w => w.length > 2);
    if (palabras.length < 4) return false;
    const hits = (texto.match(marcadores) || []).length;
    return (hits / palabras.length) > 0.15;
}

async function revisarYRetraducirTexto(texto) {
    if (!_traduccionEnBackground) mostrarProgresoRevision('Revisando traducción...');
    const parrafos = texto.split(/\n\n+/);
    let sinTraducir = 0;
    for (let i = 0; i < parrafos.length; i++) {
        const p = parrafos[i].trim();
        if (!p) continue;
        if (esParrafoEnIngles(p)) {
            sinTraducir++;
            if (!_traduccionEnBackground) mostrarProgresoRevision(`Corrigiendo ${sinTraducir} fragmento(s) sin traducir...`);
            try {
                const ret = await traducirFragmento(p);
                if (ret && ret !== p && !esParrafoEnIngles(ret)) parrafos[i] = ret;
            } catch (e) { /* silencioso */ }
            await new Promise(r => setTimeout(r, 200));
        }
    }
    const msg = sinTraducir === 0
        ? 'Revisión completa ✓'
        : `Revisión completa ✓ — ${sinTraducir} fragmento(s) corregido(s)`;
    if (!_traduccionEnBackground) {
        mostrarProgresoRevision(msg);
        await new Promise(r => setTimeout(r, 1500));
    }
    return parrafos.join('\n\n');
}

// ─── MOTOR DE TRADUCCIÓN ───

async function traducirTexto(texto) {
    if (!texto || texto.trim().length === 0) return texto;

    const parrafos = texto.split(/\n\n+/);
    const traducidos = [];
    const total = parrafos.filter(p => p.trim()).length;
    let contador = 0;

    for (let i = 0; i < parrafos.length; i++) {
        const parrafo = parrafos[i].trim();
        if (!parrafo) { traducidos.push(''); continue; }

        contador++;
        actualizarProgresoTraduccion(contador, total);

        if (parrafo.length > 490) {
            const subFragmentos = dividirEnSubfragmentos(parrafo, 490);
            const subTraducidos = [];
            for (const sub of subFragmentos) {
                subTraducidos.push(await traducirFragmento(sub));
                await new Promise(r => setTimeout(r, 250));
            }
            traducidos.push(subTraducidos.join(' '));
        } else {
            traducidos.push(await traducirFragmento(parrafo));
        }

        if (i < parrafos.length - 1) {
            await new Promise(r => setTimeout(r, 150));
        }
    }

    finalizarProgresoTraduccion();
    let textoFinal = traducidos.join('\n\n');

    // En background: revisión integrada aquí
    // En foreground: cargarCapitulo() maneja la revisión (fase 2) explícitamente
    if (_traduccionEnBackground) {
        textoFinal = await revisarYRetraducirTexto(textoFinal);
    }

    return textoFinal;
}

// Divide un texto largo en fragmentos ≤ maxChars sin cortar palabras
function dividirEnSubfragmentos(texto, maxChars) {
    const fragmentos = [];
    const oraciones = texto.match(/[^.!?]+[.!?]+/g) || [];
    const ultimoIdx = oraciones.join('').length;
    const resto = texto.slice(ultimoIdx).trim();
    if (resto) oraciones.push(resto);

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

    // ── Proteger palabras en español dentro del texto inglés ──────────────────
    // Cuando el original (EN) ya tiene palabras en español (ej: "gruñó", "mugió",
    // "siseó", "tronó"), Google Translate detecta idioma mixto y puede traducir
    // frases enteras como si fueran español→español, generando errores como
    // "was" → "titubeó". La solución: enmascarar esas palabras con placeholders
    // antes de enviar, y restaurarlas después de recibir la traducción.
    const _placeholders = [];
    const _fragmentoProtegido = fragmento.replace(
        /\b([a-záéíóúüñ]+[óéáíú][a-záéíóúüñ]*|[a-záéíóúüñ]*[áéíóú][a-záéíóúüñ]+)\b/g,
        (match) => {
            // Solo proteger palabras con tilde (claramente españolas) que no sean
            // también palabras inglesas comunes
            const inglesComun = new Set(['a', 'an', 'to', 'no', 'so', 'do', 'go', 'be',
                'me', 'he', 'we', 'us', 'or', 'on', 'in', 'is', 'it', 'if', 'as',
                'at', 'by', 'up', 'of', 'my', 'ok']);
            if (inglesComun.has(match.toLowerCase())) return match;
            const idx = _placeholders.length;
            _placeholders.push(match);
            return `ZXPLACEHOLDER${idx}ZX`;
        }
    );

    // Usar el idioma dinámico (respeta override del selector de ui.js)
    const tl = _getLang();

    // Helper: restaurar placeholders en el texto traducido
    const _restaurar = (t) => _placeholders.length === 0 ? t :
        t.replace(/ZXPLACEHOLDER(\d+)ZX/g, (_, i) => _placeholders[+i] ?? _);

    // Intentar primero con Google Translate (API no oficial, sin key)
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${tl}&dt=t&q=${encodeURIComponent(_fragmentoProtegido)}`;
            const response = await fetch(gtUrl);
            if (response.ok) {
                const data = await response.json();
                if (data && data[0]) {
                    const traduccion = data[0]
                        .filter(item => item && item[0])
                        .map(item => item[0])
                        .join('');
                    if (traduccion && traduccion.trim()) return _restaurar(traduccion);
                }
            }
            break; // respuesta ok pero vacía
        } catch (e) {
            if (intento < intentos) {
                await new Promise(r => setTimeout(r, 400 * intento));
            } else {
                console.warn('Google Translate falló tras varios intentos, usando MyMemory...', e.message);
            }
        }
    }

    // Fallback: MyMemory API
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(_fragmentoProtegido)}&langpair=en|${tl}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (intento < intentos) { await new Promise(r => setTimeout(r, 400 * intento)); continue; }
                return fragmento;
            }
            const data = await response.json();
            if (data.responseStatus === 200 && data.responseData?.translatedText) {
                const resultado = data.responseData.translatedText;
                const palabras = resultado.trim().split(/\s+/);
                // Descartar si todo mayúsculas y más de 3 palabras (señal de error de API)
                if (palabras.length > 3 && resultado === resultado.toUpperCase() && fragmento !== fragmento.toUpperCase()) {
                    if (intento < intentos) { await new Promise(r => setTimeout(r, 500)); continue; }
                    return fragmento;
                }
                return _restaurar(resultado);
            }
            if (data.responseStatus === 429 || data.responseDetails?.includes('DAILY')) {
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

// ─── TRADUCCIÓN MANUAL DEL TEXTO VISIBLE ───

async function traducirTextoActual() {
    const textoActual = document.getElementById('texto-contenido').textContent;

    if (!textoActual || textoActual.trim().length === 0 ||
        textoActual === 'Aquí aparecerá el contenido del capítulo seleccionado...') {
        mostrarNotificacion('⚠ No hay texto para traducir');
        return;
    }

    const palabras = textoActual.trim().split(/\s+/).length;
    if (palabras > 1000) {
        const ok = confirm(
            `Este texto tiene ${palabras} palabras. La traducción puede tardar varios minutos.\n\n¿Deseas continuar?`
        );
        if (!ok) return;
    }

    const botonTraducir = document.querySelector('[onclick="traducirTextoActual()"]');
    if (botonTraducir) { botonTraducir.disabled = true; botonTraducir.textContent = 'Traduciendo...'; }

    try {
        const textoTraducido = await traducirTexto(textoActual);
        if (textoTraducido && textoTraducido !== textoActual) {
            const textoFinal = aplicarReemplazosAutomaticos(textoTraducido);
            renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoFinal);
            actualizarEstadisticas();
            mostrarNotificacion(`✓ Texto traducido al ${_getLangName()}`);
        }
    } finally {
        if (botonTraducir) { botonTraducir.disabled = false; botonTraducir.textContent = 'Traducir Texto Actual'; }
    }
}

// ─── CACHE DE PRE-TRADUCCIÓN (siguiente/anterior capítulo en background) ───

async function _preTradducirCapitulo(ruta, direccion = 'siguiente') {
    if (!ruta || !archivosHTML[ruta]) return;
    if (_capCache[ruta]) return; // ya en cache

    _bgCancelToken++;
    const miToken = _bgCancelToken;
    _capCacheEnCurso = ruta;

    const nombre = ruta.split('/').pop();
    const dir = direccion === 'anterior' ? '⏮ [BG·ANT]' : '⏭ [BG·SIG]';
    const estadoTraduccion = traduccionAutomatica;
    const estadoHumanizador = ttsHumanizerActivo && !!claudeApiKey;
    const estadoGramatica = typeof grammarReviewActivo !== 'undefined' && grammarReviewActivo;
    const estadoOnoma = typeof autoReemplazarOnomatopeyas !== 'undefined' && autoReemplazarOnomatopeyas;

    if (!estadoTraduccion && !estadoHumanizador) {
        _capCacheEnCurso = null;
        return;
    }

    const fasesActivas = [
        estadoTraduccion ? '📦 trad' : '○ trad',
        estadoHumanizador ? '✨ opt' : '○ opt',
        '🧹 sanitiz',
        estadoOnoma ? '💬 onoma' : '○ onoma',
        estadoGramatica ? '📝 gram' : '○ gram',
    ].join(' · ');

    console.log(`${dir} Iniciando pre-proceso: ${nombre}\n       Fases: ${fasesActivas}`);

    try {
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
            if (t.length > 0) texto += (el.tagName.startsWith('H') ? '\n\n' + t + '\n\n' : t + '\n\n');
        });
        texto = texto.replace(/\n\n\n+/g, '\n\n').trim();
        if (texto.length < 50) return;

        if (miToken !== _bgCancelToken) { console.log(`${dir} Cancelado: ${nombre}`); return; }

        _traduccionEnBackground = true;
        try {
            if (estadoTraduccion) {
                console.log(`${dir} 📦 Traduciendo: ${nombre}`);
                texto = await traducirTexto(texto);
                if (miToken !== _bgCancelToken) return;
            }
            if (estadoHumanizador) {
                console.log(`${dir} ✨ Optimizando: ${nombre}`);
                texto = await naturalizarTextoParaTTS(texto);
                if (miToken !== _bgCancelToken) return;
            }
            console.log(`${dir} 🧹 Sanitizando: ${nombre}`);
            texto = _sanitizarParaTTS(texto);

            // Gramática ANTES de onomatopeyas — LT no debe corregir los reemplazos
            if (estadoGramatica) {
                console.log(`${dir} 📝 Gramática: ${nombre}`);
                if (typeof revisarGramatica === 'function') {
                    texto = await revisarGramatica(texto);
                }
            } else {
                console.log(`${dir} ○ Gramática: desactivado`);
            }

            // Onomatopeyas AL FINAL — sobre el texto ya traducido y revisado,
            // para no interferir con la detección de idioma ni con LT
            if (estadoOnoma) {
                console.log(`${dir} 💬 Onomatopeyas: ${nombre}`);
                if (typeof aplicarOnomatopeyasAutomatico === 'function') {
                    texto = aplicarOnomatopeyasAutomatico(texto);
                }
            } else {
                console.log(`${dir} ○ Onomatopeyas: desactivado`);
            }
        } finally {
            _traduccionEnBackground = false;
        }

        texto = aplicarReemplazosAutomaticos(texto);
        _capCache[ruta] = { texto, traducida: estadoTraduccion, humanizada: estadoHumanizador };
        console.log(`${dir} ✅ Cache listo: ${nombre}\n       trad:${estadoTraduccion} · opt:${estadoHumanizador} · onoma:${estadoOnoma} · gram:${estadoGramatica}`);

    } catch (e) {
        console.warn(`${dir} Pre-procesamiento falló para ${nombre}:`, e);
    } finally {
        if (miToken === _bgCancelToken) _capCacheEnCurso = null;
        if (miToken === _bgCancelToken && typeof window._aplicarNavBtnState === 'function') {
            const btnId = direccion === 'anterior' ? 'btn-cap-anterior' : 'btn-cap-siguiente';
            const stateKey = direccion === 'anterior' ? 'anterior' : 'siguiente';
            if (window._navBtnState) window._navBtnState[stateKey] = true;
            window._aplicarNavBtnState(btnId, true);
        }
    }
}

function _getSiguienteRuta(rutaActual) {
    const sel = document.getElementById('chapters');
    if (!sel) return null;
    const opts = Array.from(sel.options).filter(o => !o.disabled && o.value);
    const idx = opts.findIndex(o => o.value === rutaActual);
    return idx >= 0 && idx < opts.length - 1 ? opts[idx + 1].value : null;
}

function _getAnteriorRuta(rutaActual) {
    const sel = document.getElementById('chapters');
    if (!sel) return null;
    const opts = Array.from(sel.options).filter(o => !o.disabled && o.value);
    const idx = opts.findIndex(o => o.value === rutaActual);
    return idx > 0 ? opts[idx - 1].value : null;
}

// Mantener solo las 4 entradas más recientes en cache (actual + siguiente + anterior + margen)
function _limpiarCache(rutaActual) {
    const keys = Object.keys(_capCache);
    if (keys.length > 4) {
        keys.filter(k => k !== rutaActual).slice(0, keys.length - 4)
            .forEach(k => delete _capCache[k]);
    }
}