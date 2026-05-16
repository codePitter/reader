// ═══════════════════════════════════════════════════════════
// VOICE ROLES — Voces por personaje / narrador para Edge TTS
// Depende de: tts.js (carga DESPUÉS de tts.js y translation.js)
//
// Integración activa (monkey-patch):
//   · generarAudioLocal  → acepta { voice } explícito
//   · _preFetchOracion   → pre-descarga con la voz correcta
//   · leerOracionLocal   → reproduce con la voz del índice
//
// Detección automática de personajes:
//   · Heurísticas locales al cargar cada capítulo
//   · Claude Haiku en background si hay claudeApiKey
// ═══════════════════════════════════════════════════════════

// ─── ESTADO ───
// { narrador: 'voz', dialogo: 'voz', 'NombrePersonaje': 'voz', ... }
let _voiceRoles = {};

// Índice precalculado: sentences[i] → voiceId
// Se recalcula al cargar capítulo (recalcularSentenceVoiceIndex)
let _sentenceVoiceIndex = [];

// Flag para evitar análisis IA concurrentes
let _vrAnalizandoIA = false;

// ─── PERSISTENCIA ───
function _vrKey() {
    return `voice_roles__${(typeof _epubFilename !== 'undefined' && _epubFilename) ? _epubFilename : '__default__'}`;
}

function guardarVoiceRoles() {
    uSet(_vrKey(), JSON.stringify(_voiceRoles));
}

function cargarVoiceRoles() {
    const raw = uGet(_vrKey());
    if (raw) {
        try { _voiceRoles = JSON.parse(raw); } catch { _voiceRoles = {}; }
    } else {
        // Defaults: narrador = voz activa del selector (o Gonzalo),
        // dialogo genérico = Salomé, con slots de género separados
        const vozActiva = (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '') || 'es-CO-GonzaloNeural';
        _voiceRoles = {
            narrador: vozActiva,
            dialogo: 'es-CO-SalomeNeural',   // diálogo sin género detectado → femenino por default
            dialogo_f: 'es-CO-SalomeNeural',   // diálogo de personaje femenino detectado
            dialogo_m: 'es-MX-JorgeNeural',    // diálogo de personaje masculino detectado
        };
    }
    renderizarUIVoiceRoles();
}

// ─── DETECCIÓN DE ROL POR ORACIÓN ───

/**
 * Pool de voces adicionales para personajes extra (más de 2 en diálogo).
 * Rota entre MX y ES para dar variedad sin repetir Gonzalo/Salomé.
 */
const _VR_POOL_EXTRA = [
    'es-MX-DaliaNeural',
    'es-ES-AlvaroNeural',
    'es-ES-ElviraNeural',
    'es-MX-JorgeNeural',
    'es-ES-XimenaNeural',
];

// Caracteres que dividirEnOraciones() strips del inicio de cada oración.
// Los recuperamos mirando el texto original.
const _VR_DIALOG_CHARS = /^[""\u201C\u00AB\u2018—–\-]/;
const _VR_THOUGHT_CHARS = /^['\u2018\u2019]/;

/**
 * Detecta si un fragmento de texto describe a un personaje femenino.
 */
function _vrEsFemenino(texto) {
    if (!texto) return null;
    const t = texto.toLowerCase();
    const fem = [
        /\b(la|una|ella|esta|aquella)\s+\w/,
        /\b(cazadora|guerrera|chica|joven|mujer|señora|dama|reina|princesa|heroína|actriz)\b/,
        /\bparada\b|\bvestida\b|\berguida\b|\bsorprendida\b|\bcansada\b|\bsonriendo\b/,
    ];
    const masc = [
        /\b(el|un|él|este|aquel)\s+\w/,
        /\b(cazador|guerrero|chico|hombre|señor|rey|príncipe|héroe|actor)\b/,
        /\bparado\b|\bvestido\b|\berguido\b|\bsorprendido\b|\bcansado\b/,
    ];
    const scoreF = fem.filter(r => r.test(t)).length;
    const scoreM = masc.filter(r => r.test(t)).length;
    if (scoreF > scoreM) return true;
    if (scoreM > scoreF) return false;
    return null;
}

/**
 * Retorna la clave de _voiceRoles para una oración dada.
 *
 * BUG FIX: dividirEnOraciones() strips "—'« del inicio de cada oración.
 * Recibimos textoOriginal+posicion para recuperar el marcador real que
 * precedía a la oración antes del strip.
 *
 * Prioridad:
 * 1. Comilla simple tipográfica antes/en la oración → pensamiento → narrador
 * 2. Atribución directa en la oración: "dijo/respondió Nombre"
 * 3. Nombre al inicio con verbo: "Nombre dijo/preguntó..."
 * 4. "Nombre:" / "[Nombre]" al inicio
 * 5. Atribución en oración anterior: "La voz de X", "X sonrió:", "X dijo"
 * 6. Género morfológico en oración anterior → dialogo_f / dialogo_m
 * 7. Marcador de diálogo detectado (recuperado del texto original) → dialogo
 * 8. Narrador
 *
 * @param {string}  texto        - Oración actual (posiblemente sin marcador inicial)
 * @param {string}  [anterior]   - Oración anterior para contexto
 * @param {string}  [textoOrig]  - Texto completo original del capítulo
 * @param {number}  [posOrig]    - Posición de esta oración en textoOrig
 */
function _detectarRolOracion(texto, anterior, textoOrig, posOrig) {
    const t = texto.trim();
    const a = (anterior || '').trim();

    // ── Recuperar marcador original stripped por dividirEnOraciones ──
    let marcadorPrevio = '';
    if (textoOrig && posOrig !== undefined && posOrig > 0) {
        // Mirar hasta 4 chars antes de donde empieza la oración en el texto original
        const ventana = textoOrig.slice(Math.max(0, posOrig - 4), posOrig);
        const m = ventana.match(/(["\u201C\u00AB\u2018\u2019'—–])\s*$/);
        if (m) marcadorPrevio = m[1];
    }

    // ── 1. Pensamiento interno ──
    // Comilla simple tipográfica como marcador o al inicio del texto stripped
    const esPensamiento =
        marcadorPrevio === '\u2018' || marcadorPrevio === "'" ||
        _VR_THOUGHT_CHARS.test(t);
    if (esPensamiento) return 'narrador';

    const personajes = Object.keys(_voiceRoles).filter(
        k => !['narrador', 'dialogo', 'dialogo_f', 'dialogo_m'].includes(k)
    );

    // ── 2. Atribución directa en la oración actual ──
    if (personajes.length > 0) {
        const pAtrib = /(?:dijo|respondió|exclamó|preguntó|murmuró|gritó|susurró|añadió|continuó|repuso|interrumpió|llamó)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)/;
        const mAtrib = t.match(pAtrib);
        if (mAtrib && _voiceRoles[mAtrib[1]]) return mAtrib[1];

        // ── 3. "Nombre dijo/respondió" al inicio ──
        const pNV = /^([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,})\s+(?:dijo|respondió|exclamó|preguntó|murmuró|gritó|susurró)\b/;
        const mNV = t.match(pNV);
        if (mNV && _voiceRoles[mNV[1]]) return mNV[1];

        // ── 4. "Nombre:" / "[Nombre]" ──
        const pLabel = /^(?:\[)?([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,})(?:\]|:)\s/;
        const mLabel = t.match(pLabel);
        if (mLabel && _voiceRoles[mLabel[1]]) return mLabel[1];
    }

    // Determinar si es diálogo por marcador recuperado o por texto actual
    const esDialogoMarcado =
        marcadorPrevio && _VR_DIALOG_CHARS.test(marcadorPrevio) ||
        _VR_DIALOG_CHARS.test(t);

    // ── 5. Contexto de oración anterior ──
    if (a && personajes.length > 0) {
        // "La voz de X resonó/llegó/dijo"
        const pVozDe = /[Ll]a voz de ([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)\b/;
        const mVD = a.match(pVozDe);
        if (mVD && _voiceRoles[mVD[1]]) return mVD[1];

        // Solo aplicar contexto narrativo si esta oración es diálogo
        if (esDialogoMarcado) {
            // "X sonrió/avanzó/parpadeó/se giró..."
            const pAccion = /\b([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,})\s+(?:sonrió|avanzó|se giró|parpadeó|asintió|negó|se acercó|suspiró|frunció|levantó|señaló|exclamó|interrumpió)\b/;
            const mAcc = a.match(pAccion);
            if (mAcc && _voiceRoles[mAcc[1]]) return mAcc[1];

            // "X dijo/preguntó..." en la oración anterior
            const pAtribA = /(?:dijo|respondió|exclamó|preguntó|murmuró|gritó|susurró|añadió|repuso)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)/;
            const mAtribA = a.match(pAtribA);
            if (mAtribA && _voiceRoles[mAtribA[1]]) return mAtribA[1];
        }
    }

    // ── 6. Género morfológico del contexto anterior ──
    if (esDialogoMarcado && a) {
        const genero = _vrEsFemenino(a);
        if (genero === true && _voiceRoles['dialogo_f']) return 'dialogo_f';
        if (genero === false && _voiceRoles['dialogo_m']) return 'dialogo_m';
    }

    // ── 7. Diálogo genérico ──
    if (esDialogoMarcado) return 'dialogo';

    // ── 8. Narrador ──
    return 'narrador';
}

/**
 * Retorna el voiceId para una oración. Fallback: _edgeTtsVoice global.
 */
function getVozParaOracion(texto, anterior) {
    const rol = _detectarRolOracion(texto, anterior);
    return _voiceRoles[rol] || _voiceRoles['dialogo'] || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
}

/**
 * Retorna el voiceId desde el índice precalculado.
 */
function getVozParaIndice(index) {
    return _sentenceVoiceIndex[index]
        || _voiceRoles['narrador']
        || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
}

/**
 * Recalcula el índice usando el texto original completo para recuperar
 * los marcadores de diálogo que dividirEnOraciones() stripeó.
 *
 * Esta es la versión CORRECTA. Se llama desde el patch de envolverOracionesEnSpans,
 * que tiene acceso al textoOriginal ANTES de que innerHTML sea modificado.
 *
 * @param {string[]} oraciones    - sentences[] recién calculado
 * @param {string}   textoOriginal - textContent del contenedor ANTES del innerHTML mod
 */
function _recalcularConTextoOriginal(oraciones, textoOriginal) {
    if (!oraciones || !oraciones.length) return;

    // Construir un mapa: oración → posición en textoOriginal
    // Buscamos de forma incremental para manejar frases repetidas
    let cursor = 0;
    const posiciones = oraciones.map(oracion => {
        const idx = textoOriginal.indexOf(oracion, cursor);
        if (idx !== -1) cursor = idx + oracion.length;
        return idx; // -1 si no se encontró
    });

    _sentenceVoiceIndex = oraciones.map((oracion, i) => {
        const pos = posiciones[i];
        const anterior = i > 0 ? oraciones[i - 1] : '';
        const rol = _detectarRolOracion(oracion, anterior, textoOriginal, pos);
        return _voiceRoles[rol] || _voiceRoles['dialogo'] || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
    });

    // Debug: mostrar distribución de voces en consola
    const dist = {};
    _sentenceVoiceIndex.forEach(v => { dist[v] = (dist[v] || 0) + 1; });
    console.log('[VoiceRoles] Índice recalculado:', _sentenceVoiceIndex.length, 'oraciones |', dist);
}

/**
 * Fallback: recalcula sin texto original (menos preciso).
 * Se usa cuando sentences[] ya está listo pero no tenemos textoOriginal.
 */
function recalcularSentenceVoiceIndex() {
    if (typeof sentences === 'undefined' || !sentences.length) return;

    // Intentar obtener el texto original del DOM como fallback
    const contenedor = document.getElementById('texto-contenido');
    const textoOrig = contenedor ? contenedor.textContent : '';

    if (textoOrig) {
        _recalcularConTextoOriginal(sentences, textoOrig);
    } else {
        // Sin texto original: detección sin recuperación de marcadores
        _sentenceVoiceIndex = sentences.map((s, i) => {
            const anterior = i > 0 ? sentences[i - 1] : '';
            const rol = _detectarRolOracion(s, anterior);
            return _voiceRoles[rol] || _voiceRoles['dialogo'] || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
        });
    }
}

// ─── DETECCIÓN AUTOMÁTICA DE PERSONAJES ───

/**
 * Heurísticas locales: escanea el texto renderizado y agrega
 * personajes nuevos con sus voces rotadas.
 * Rápido, sin red, sin IA. Se ejecuta siempre al cargar capítulo.
 */
function _aplicarHeuristicasPersonajes() {
    const contenedor = document.getElementById('texto-contenido');
    if (!contenedor) return;
    const texto = contenedor.textContent || '';
    if (texto.length < 80) return;

    const conteo = new Map();   // nombre → { count, genero }
    const SLOTS_BASE = new Set(['narrador', 'dialogo', 'dialogo_f', 'dialogo_m']);

    // "dijo/exclamó/... Nombre"
    const p1 = /(?:dijo|preguntó|exclamó|respondió|murmuró|susurró|gritó|comentó|añadió|continuó|repuso)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,18})/g;
    // "Nombre dijo/preguntó/..."
    const p2 = /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,18})\s+(?:dijo|preguntó|exclamó|respondió|murmuró|susurró|gritó)\b/g;
    // "La voz de Nombre"
    const p3 = /[Ll]a voz de ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,18})/g;
    // "Nombre —" al inicio de línea
    const p4 = /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,18})[:\s]*—/gm;
    // "Nombre sonrió/avanzó..." (acción narrativa)
    const p5 = /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,18})\s+(?:sonrió|avanzó|parpadeó|asintió|negó|suspiró|frunció)\b/g;

    [p1, p2, p3, p4, p5].forEach(pat => {
        let m; pat.lastIndex = 0;
        while ((m = pat.exec(texto)) !== null) {
            const n = m[1].trim();
            if (_vrEsNombreValido(n)) {
                const entry = conteo.get(n) || { count: 0, genero: null };
                entry.count++;
                conteo.set(n, entry);
            }
        }
    });

    // Detectar género por contexto: buscar artículos/adjetivos cerca del nombre
    conteo.forEach((entry, nombre) => {
        // Buscar ~60 chars antes del nombre en el texto
        const idx = texto.indexOf(nombre);
        if (idx > 0) {
            const ctx = texto.slice(Math.max(0, idx - 80), idx + nombre.length + 60);
            const gen = _vrEsFemenino(ctx);
            if (gen !== null) entry.genero = gen;
        }
    });

    if (conteo.size === 0) return;

    const voces = _vrGetVoces();
    const yaExisten = new Set(Object.keys(_voiceRoles));

    // Personajes nuevos, ordenados por frecuencia, máx 8
    let extraIdx = 0;
    Array.from(conteo.entries())
        .filter(([n]) => !yaExisten.has(n))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, Math.max(0, 8 - (yaExisten.size - SLOTS_BASE.size)))
        .forEach(([nombre, { genero }]) => {
            let voz;
            // Asignar voz base según género detectado
            if (genero === true && _voiceRoles['dialogo_f']) {
                // Femenino: usar dialogo_f como base, luego rotar pool
                voz = extraIdx === 0
                    ? _voiceRoles['dialogo_f']
                    : _VR_POOL_EXTRA.filter(v => v.includes('Neural') && !v.includes('Jorge') && !v.includes('Gonzalo'))[extraIdx % 3] || _voiceRoles['dialogo_f'];
            } else if (genero === false && _voiceRoles['dialogo_m']) {
                voz = extraIdx === 0
                    ? _voiceRoles['dialogo_m']
                    : _VR_POOL_EXTRA.filter(v => v.includes('Neural') && !v.includes('Dalia') && !v.includes('Salome'))[extraIdx % 2] || _voiceRoles['dialogo_m'];
            } else {
                // Género desconocido: rotar pool extra
                voz = _VR_POOL_EXTRA[extraIdx % _VR_POOL_EXTRA.length] || _voiceRoles['dialogo'] || '';
            }
            _voiceRoles[nombre] = voz;
            extraIdx++;
        });

    guardarVoiceRoles();
    console.log('[VoiceRoles] Heurísticas detectaron:', Array.from(conteo.keys()));
}

/**
 * Análisis IA con Claude Haiku: refina la lista en background.
 * No bloquea TTS ni render. Solo corre si hay claudeApiKey.
 */
async function _analizarPersonajesConIA() {
    if (_vrAnalizandoIA) return;

    const claudeKey = (typeof claudeApiKey !== 'undefined' && claudeApiKey)
        ? claudeApiKey
        : uGet('claude_api_key');
    if (!claudeKey) {
        const total = Object.keys(_voiceRoles).filter(k => k !== 'narrador' && k !== 'dialogo').length;
        _vrSetStatus(total > 0 ? 'done' : 'warning',
            total > 0 ? `✓ ${total} personaje${total > 1 ? 's' : ''} (heurística)` : 'Solo narrador / diálogo');
        return;
    }

    _vrAnalizandoIA = true;
    _vrSetStatus('analyzing', '⏳ Detectando personajes con IA...');

    const contenedor = document.getElementById('texto-contenido');
    if (!contenedor) { _vrAnalizandoIA = false; return; }

    const texto = contenedor.textContent || '';
    const muestra = texto.slice(0, 2000) + '\n[...]\n' +
        texto.slice(Math.floor(texto.length / 2), Math.floor(texto.length / 2) + 1000);

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': claudeKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                messages: [{
                    role: 'user',
                    content:
                        'De este fragmento de novela, extrae los nombres propios de los personajes ' +
                        'que tienen diálogo directo o son protagonistas. Máximo 8 nombres. ' +
                        'Responde SOLO con un array JSON de strings. Ejemplo: ["Ana","Carlos"]\n\n' +
                        muestra,
                }],
            }),
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const raw = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
        const nombres = JSON.parse(raw);

        if (Array.isArray(nombres) && nombres.length > 0) {
            const voces = _vrGetVoces();
            let voiceOffset = Object.keys(_voiceRoles).length;
            let nuevos = 0;

            nombres.forEach(nombre => {
                const n = (typeof nombre === 'string') ? nombre.trim() : '';
                if (n.length >= 2 && !(n in _voiceRoles)) {
                    const idx = voiceOffset % Math.max(voces.length, 1);
                    _voiceRoles[n] = voces[idx]?.value || _voiceRoles['dialogo'] || '';
                    voiceOffset++;
                    nuevos++;
                }
            });

            if (nuevos > 0) {
                guardarVoiceRoles();
                recalcularSentenceVoiceIndex();
                renderizarUIVoiceRoles();
                console.log('[VoiceRoles] IA agregó', nuevos, 'personajes nuevos');
            }
        }

        const total = Object.keys(_voiceRoles).filter(k => k !== 'narrador' && k !== 'dialogo').length;
        _vrSetStatus('done',
            total > 0
                ? `✓ ${total} personaje${total > 1 ? 's' : ''} detectados`
                : 'Solo narrador / diálogo activos');

    } catch (e) {
        console.warn('[VoiceRoles] Error IA:', e.message);
        const total = Object.keys(_voiceRoles).filter(k => k !== 'narrador' && k !== 'dialogo').length;
        _vrSetStatus(total > 0 ? 'done' : 'warning',
            total > 0
                ? `✓ ${total} personaje${total > 1 ? 's' : ''} (heurística)`
                : 'Solo narrador / diálogo activos');
    } finally {
        _vrAnalizandoIA = false;
    }
}

// ─── UI — PANEL DE CONFIGURACIÓN ───

function renderizarUIVoiceRoles() {
    const panel = document.getElementById('voice-roles-panel');
    if (!panel) return;

    panel.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'vr-header';
    header.innerHTML = `
        <span class="vr-title">🎭 Voice Roles</span>
        <button class="vr-btn-reanalyze" onclick="vrReanalizar()" title="Reanalizar">↻</button>`;
    panel.appendChild(header);

    // Status
    const status = document.createElement('div');
    status.id = 'vr-status';
    status.className = 'vr-status done';
    const nPers = Object.keys(_voiceRoles).filter(
        k => !['narrador', 'dialogo', 'dialogo_f', 'dialogo_m'].includes(k)
    ).length;
    status.textContent = nPers > 0
        ? `✓ ${nPers} personaje${nPers > 1 ? 's' : ''} + roles base`
        : 'Roles base activos';
    panel.appendChild(status);

    // ── Sección BASE ──
    const secBase = document.createElement('div');
    secBase.className = 'vr-section-label';
    secBase.textContent = 'Base';
    panel.appendChild(secBase);

    // Slots base fijos (no eliminables)
    const SLOTS_BASE = [
        { key: 'narrador', label: '📖 Narrador' },
        { key: 'dialogo_f', label: '💬 Diálogo ♀' },
        { key: 'dialogo_m', label: '💬 Diálogo ♂' },
        { key: 'dialogo', label: '💬 Diálogo ?' },
    ];
    SLOTS_BASE.forEach(({ key, label }) => {
        if (_voiceRoles[key] !== undefined) {
            panel.appendChild(_vrCrearFila(key, _voiceRoles[key], false, label));
        }
    });

    // ── Sección PERSONAJES ──
    const personajes = Object.keys(_voiceRoles).filter(
        k => !['narrador', 'dialogo', 'dialogo_f', 'dialogo_m'].includes(k)
    );
    if (personajes.length > 0) {
        const secPers = document.createElement('div');
        secPers.className = 'vr-section-label';
        secPers.textContent = 'Personajes';
        panel.appendChild(secPers);
        personajes.forEach(nombre => panel.appendChild(_vrCrearFila(nombre, _voiceRoles[nombre], true)));
    }

    // Botón agregar
    const btnAdd = document.createElement('button');
    btnAdd.className = 'vr-btn-add';
    btnAdd.textContent = '+ agregar personaje';
    btnAdd.onclick = () => _vrAgregarPersonaje();
    panel.appendChild(btnAdd);
}

function _vrCrearFila(nombre, vozActual, eliminable, labelOverride) {
    const fila = document.createElement('div');
    fila.className = 'vr-row';

    const label = document.createElement('span');
    label.className = 'vr-label';
    label.title = nombre;
    const displayName = labelOverride || (nombre.charAt(0).toUpperCase() + nombre.slice(1));
    label.textContent = displayName;
    fila.appendChild(label);

    const select = document.createElement('select');
    select.className = 'vr-select';
    _vrPoblarSelect(select, vozActual);
    select.onchange = () => {
        _voiceRoles[nombre] = select.value;
        guardarVoiceRoles();
        recalcularSentenceVoiceIndex();
        if (typeof mostrarNotificacion === 'function')
            mostrarNotificacion(`✓ "${nombre}" → ${select.value.split('-').slice(2).join('-')}`);
    };
    fila.appendChild(select);

    const btnTest = document.createElement('button');
    btnTest.className = 'vr-btn-test';
    btnTest.title = 'Escuchar muestra';
    btnTest.textContent = '▶';
    btnTest.onclick = () => _vrProbarVoz(nombre, select.value);
    fila.appendChild(btnTest);

    if (eliminable) {
        const btnDel = document.createElement('button');
        btnDel.className = 'vr-btn-del';
        btnDel.title = 'Eliminar';
        btnDel.textContent = '✕';
        btnDel.onclick = () => {
            delete _voiceRoles[nombre];
            guardarVoiceRoles();
            recalcularSentenceVoiceIndex();
            renderizarUIVoiceRoles();
        };
        fila.appendChild(btnDel);
    }

    return fila;
}

// Lista de voces Edge TTS — agrupadas por idioma
const EDGE_TTS_VOICES = [
    { value: 'es-MX-JorgeNeural', label: 'Jorge (MX) ♂' },
    { value: 'es-MX-DaliaNeural', label: 'Dalia (MX) ♀' },
    { value: 'es-ES-AlvaroNeural', label: 'Álvaro (ES) ♂' },
    { value: 'es-ES-ElviraNeural', label: 'Elvira (ES) ♀' },
    { value: 'es-AR-TomasNeural', label: 'Tomás (AR) ♂' },
    { value: 'es-AR-ElenaNeural', label: 'Elena (AR) ♀' },
    { value: 'es-CO-GonzaloNeural', label: 'Gonzalo (CO) ♂' },
    { value: 'es-CO-SalomeNeural', label: 'Salomé (CO) ♀' },
    { value: 'es-CL-CatalinaNeural', label: 'Catalina (CL) ♀' },
    { value: 'es-CL-LorenzoNeural', label: 'Lorenzo (CL) ♂' },
    { value: 'en-US-GuyNeural', label: 'Guy (EN-US) ♂' },
    { value: 'en-US-JennyNeural', label: 'Jenny (EN-US) ♀' },
    { value: 'en-GB-RyanNeural', label: 'Ryan (EN-GB) ♂' },
    { value: 'en-GB-SoniaNeural', label: 'Sonia (EN-GB) ♀' },
];

function _vrPoblarSelect(selectEl, valorActual) {
    selectEl.innerHTML = '';

    // Preferir voces dinámicas del selector Edge TTS del DOM
    const sel = document.getElementById('edge-voice-select');
    const vozesDOM = sel
        ? Array.from(sel.options).filter(o => o.value && !o.disabled).map(o => ({ value: o.value, label: o.text }))
        : [];
    const lista = vozesDOM.length > 0 ? vozesDOM : EDGE_TTS_VOICES;

    const grEs = document.createElement('optgroup'); grEs.label = 'Español';
    const grEn = document.createElement('optgroup'); grEn.label = 'English';
    const grOt = document.createElement('optgroup'); grOt.label = 'Otras';

    lista.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value; opt.textContent = v.label;
        if (v.value === valorActual) opt.selected = true;
        if (v.value.startsWith('es-')) grEs.appendChild(opt);
        else if (v.value.startsWith('en-')) grEn.appendChild(opt);
        else grOt.appendChild(opt);
    });

    if (grEs.childElementCount) selectEl.appendChild(grEs);
    if (grEn.childElementCount) selectEl.appendChild(grEn);
    if (grOt.childElementCount) selectEl.appendChild(grOt);

    // Si la voz actual no está en ningún grupo, agregarla al tope
    const existe = lista.some(v => v.value === valorActual);
    if (!existe && valorActual) {
        const opt = document.createElement('option');
        opt.value = valorActual; opt.textContent = valorActual + ' (actual)'; opt.selected = true;
        selectEl.insertBefore(opt, selectEl.firstChild);
    }
}

function _vrAgregarPersonaje() {
    const nombre = prompt('Nombre del personaje (tal como aparece en el texto):');
    if (!nombre?.trim()) return;
    const n = nombre.trim();
    if (_voiceRoles[n]) {
        if (typeof mostrarNotificacion === 'function') mostrarNotificacion(`"${n}" ya está configurado`);
        return;
    }
    const voces = _vrGetVoces();
    const idx = Object.keys(_voiceRoles).length % Math.max(voces.length, 1);
    _voiceRoles[n] = voces[idx]?.value || _voiceRoles['dialogo'] || '';
    guardarVoiceRoles();
    recalcularSentenceVoiceIndex();
    renderizarUIVoiceRoles();
    if (typeof mostrarNotificacion === 'function') mostrarNotificacion(`✓ Personaje "${n}" agregado`);
}

async function _vrProbarVoz(nombre, voz) {
    const frases = {
        narrador: 'El sol comenzaba a ocultarse en el horizonte.',
        dialogo: '—Espera, no te vayas todavía.',
    };
    const texto = frases[nombre] || `Soy ${nombre} y esta es mi voz.`;
    if (typeof mostrarNotificacion === 'function')
        mostrarNotificacion(`▶ Probando: ${voz.split('-').slice(2).join('-')}`);

    try {
        const response = await fetch(`${_getTTSApiURL()}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: texto, voice: voz }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const volEl = document.getElementById('volume-control');
        audio.volume = parseFloat(volEl?.value || 80) / 100;
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
    } catch (e) {
        console.error('[VoiceRoles] Error al probar voz:', e);
        if (typeof mostrarNotificacion === 'function')
            mostrarNotificacion('⚠ No se pudo conectar al servidor TTS');
    }
}

/** Fuerza redetección completa del capítulo actual. */
window.vrReanalizar = function () {
    if (_vrAnalizandoIA) return;
    // Borrar solo personajes detectados automáticamente;
    // conservar los 4 slots base tal como los configuró el usuario.
    const BASE = new Set(['narrador', 'dialogo', 'dialogo_f', 'dialogo_m']);
    Object.keys(_voiceRoles)
        .filter(k => !BASE.has(k))
        .forEach(k => delete _voiceRoles[k]);
    guardarVoiceRoles();
    _aplicarHeuristicasPersonajes();
    recalcularSentenceVoiceIndex();
    renderizarUIVoiceRoles();
    _analizarPersonajesConIA();
};

// ─── HELPERS INTERNOS ───

function _vrGetVoces() {
    const sel = document.getElementById('edge-voice-select');
    if (sel) {
        const lista = Array.from(sel.options).filter(o => o.value && !o.disabled);
        if (lista.length) return lista.map(o => ({ value: o.value, label: o.text }));
    }
    return EDGE_TTS_VOICES;
}

function _vrEsNombreValido(nombre) {
    const BLACKLIST = new Set([
        'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Él', 'Ella', 'Su', 'Sus', 'Me', 'Se', 'Le', 'Lo',
        'No', 'Sí', 'Ya', 'Yo', 'Tu', 'Mi', 'Muy', 'Más', 'Pero', 'Por', 'Para', 'Con', 'Sin',
        'Que', 'Del', 'Al', 'The', 'He', 'She', 'It', 'We', 'They', 'You', 'And', 'But', 'For',
        'De', 'A', 'En', 'Y', 'O', 'E', 'U', 'Si', 'Fue', 'Era', 'Había', 'Ser', 'Tener',
    ]);
    return (
        !BLACKLIST.has(nombre) &&
        nombre.length >= 3 && nombre.length <= 20 &&
        /^[A-ZÁÉÍÓÚÑ]/.test(nombre)
    );
}

function _vrSetStatus(cls, texto) {
    const el = document.getElementById('vr-status');
    if (!el) return;
    el.className = 'vr-status ' + cls;
    el.textContent = texto;
}

// ─── MONKEY-PATCH DE TTS.JS ───
// Reemplaza funciones clave de tts.js para inyectar la voz correcta.
// Retro-compatible: si no se pasa voice, usa _edgeTtsVoice.

// ── PATCH 1: envolverOracionesEnSpans ──────────────────────────────────────
// FIX BUG TIMING + STRIPPING:
//   Se llama en iniciarTTS() JUSTO DESPUÉS de sentences = dividirEnOraciones().
//   En ese momento contenedor.textContent AÚN tiene el texto original con
//   los marcadores de diálogo ("  —  '  «) que dividirEnOraciones() stripeó.
//   Capturamos textoOriginal ANTES de que innerHTML sea modificado, y
//   usamos _recalcularConTextoOriginal() que recupera esos marcadores.
const _envolverOracionesOriginal = typeof envolverOracionesEnSpans === 'function'
    ? envolverOracionesEnSpans : null;

// Usar window.X = function() en lugar de function X() para evitar hoisting:
// con function declaration, JS eleva la declaración antes de que se ejecute
// la línea const _envolverOracionesOriginal = ..., haciendo que capture
// esta misma función (recursión infinita). Con window assignment no hay hoisting.
window.envolverOracionesEnSpans = function envolverOracionesEnSpans(contenedor, oraciones) {
    // ① Capturar texto original ANTES de que innerHTML sea modificado
    const textoOriginal = contenedor ? (contenedor.textContent || '') : '';

    // ② Llamar la función original (modifica innerHTML)
    if (_envolverOracionesOriginal) _envolverOracionesOriginal(contenedor, oraciones);

    // ③ Recalcular índice de voces con texto original + sentences[] ya listo
    //    Esto resuelve AMBOS bugs: timing y stripping.
    _recalcularConTextoOriginal(oraciones, textoOriginal);
}

// ── PATCH 2: generarAudioLocal ─────────────────────────────────────────────
const _generarAudioLocalOriginal = typeof generarAudioLocal === 'function' ? generarAudioLocal : null;

async function generarAudioLocal(texto, { silencioso = false, voice = null } = {}) {
    // Si Azure está activo, delegar completamente a ese motor (ignora voice-roles)
    if (typeof _usarAzure !== 'undefined' && _usarAzure) {
        return typeof generarAudioAzure === 'function'
            ? generarAudioAzure(texto, { silencioso })
            : null;
    }
    try {
        const textoNorm = typeof _normalizarTextoTTS === 'function' ? _normalizarTextoTTS(texto) : texto;
        const vozFinal = voice || (typeof _edgeTtsVoice !== 'undefined' ? _edgeTtsVoice : '');
        const response = await fetch(`${_getTTSApiURL()}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoNorm, voice: vozFinal }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);
    } catch (error) {
        console.error('[TTS] Error al generar audio local:', error);
        if (!silencioso && typeof mostrarNotificacion === 'function')
            mostrarNotificacion('⚠️ Error puntual en TTS local');
        return null;
    }
}

const _preFetchOracionOriginal = typeof _preFetchOracion === 'function' ? _preFetchOracion : null;
// ── PATCH 3: _preFetchOracion ──────────────────────────────────────────────
function _preFetchOracion(index) {
    if (index < 0 || index >= sentences.length) return;
    if (_ttsAudioCache.has(index)) return;
    if (typeof _expCancelled !== 'undefined' && window._exportEnCurso) return;

    const voz = getVozParaIndice(index);
    const promise = generarAudioLocal(sentences[index], { silencioso: true, voice: voz }).catch(() => null);
    _ttsAudioCache.set(index, promise);
}

const _leerOracionLocalOriginal = typeof leerOracionLocal === 'function' ? leerOracionLocal : null;
// ── PATCH 4: leerOracionLocal ──────────────────────────────────────────────
async function leerOracionLocal(index, audioUrlPreGenerada) {
    const miSesionTTS = _ttsSessionToken;

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

    if (isReading && !isPaused) actualizarEstadoTTS('reproduciendo');

    // Pre-fetch de las 2 siguientes con sus voces correctas
    _preFetchOracion(index + 1);
    _preFetchOracion(index + 2);

    // Obtener audio: pre-generado → cache → generar ahora
    let audioUrl = audioUrlPreGenerada ?? null;
    if (!audioUrl) {
        if (_ttsAudioCache.has(index)) {
            audioUrl = await _ttsAudioCache.get(index);
        } else {
            mostrarNotificacion(`Generando audio ${index + 1}/${sentences.length}...`);
            const voz = getVozParaIndice(index);
            const promise = generarAudioLocal(sentences[index], { silencioso: false, voice: voz }).catch(() => null);
            _ttsAudioCache.set(index, promise);
            audioUrl = await _ttsAudioCache.get(index);
        }
    }
    _ttsAudioCache.delete(index);

    if (miSesionTTS !== _ttsSessionToken) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        return;
    }

    if (!audioUrl) {
        console.warn(`[XTTS] Sin audio para oración ${index + 1} — saltando`);
        if (isReading && !isPaused) {
            const next = index + 1;
            if (next >= sentences.length) { detenerTTS(); _avanzarSiguienteCapituloAuto(); }
            else { leerOracionLocal(next); }
        }
        return;
    }

    audioActual = new Audio(audioUrl);
    _ttsCurrentUrl = audioUrl;

    if (typeof _rec_connectAudioElement === 'function') _rec_connectAudioElement(audioActual);

    audioActual.volume = parseFloat(document.getElementById('volume-control').value) / 100;

    audioActual.onended = async function () {
        _ttsCurrentUrl = null;
        URL.revokeObjectURL(audioUrl);
        if (miSesionTTS !== _ttsSessionToken) return;
        if (isReading && !isPaused) {
            const next = index + 1;
            if (next >= sentences.length) {
                detenerTTS();
                _avanzarSiguienteCapituloAuto();
            } else {
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
        if (miSesionTTS !== _ttsSessionToken) return;
        console.error('[XTTS] Error al reproducir audio:', e);
        if (typeof _usarServidorLive !== 'undefined' && _usarServidorLive &&
            typeof servidorTTSDisponible !== 'undefined' && servidorTTSDisponible) {
            if (isReading && !isPaused) {
                const next = index + 1;
                if (next >= sentences.length) { detenerTTS(); _avanzarSiguienteCapituloAuto(); }
                else { leerOracionLocal(next); }
            }
            return;
        }
        leerOracion(index);
    };

    if (isPaused || miSesionTTS !== _ttsSessionToken) {
        if (isPaused) actualizarEstadoTTS('pausado');
        return;
    }

    audioActual.play();
    actualizarEstadoTTS('reproduciendo');
}

// ─── HOOKS DE CICLO DE VIDA (llamados desde epub.js) ───

/**
 * Hook A — epub.js lo llama justo después de asignar _epubFilename.
 * Carga los roles guardados para el libro y resetea el flag de IA.
 */
function voiceRolesOnEpubLoad() {
    _vrAnalizandoIA = false;
    cargarVoiceRoles();
    console.log('[VoiceRoles] EPUB cargado:', typeof _epubFilename !== 'undefined' ? _epubFilename : '?');
}

/**
 * Hook B — epub.js lo llama después de renderizarTextoEnContenedor().
 * Aplica heurísticas de personajes y lanza IA en background.
 *
 * NOTA: ya NO llama recalcularSentenceVoiceIndex() aquí porque sentences[]
 * todavía está vacío en este momento. El recálculo correcto ocurre en el
 * patch de envolverOracionesEnSpans(), que se ejecuta dentro de iniciarTTS()
 * justo después de sentences = dividirEnOraciones(texto).
 */
function voiceRolesOnCapituloListo(ruta) {
    _vrSetStatus('analyzing', '⏳ Detectando personajes...');
    _aplicarHeuristicasPersonajes();
    renderizarUIVoiceRoles();
    _analizarPersonajesConIA(); // background, no await
}

// ─── INICIALIZACIÓN ───
document.addEventListener('DOMContentLoaded', () => {
    cargarVoiceRoles();
    renderizarUIVoiceRoles();
});