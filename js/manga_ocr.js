// ═══════════════════════════════════════════════════════════════════
// MANGA_OCR.JS — OCR de imágenes manga → texto real → TTS
// ═══════════════════════════════════════════════════════════════════
//
// ESTRATEGIA (sin problemas de timing):
//   · El botón ▶ en index.html llama a _playWrapper() en vez de togglePlayPause()
//   · _playWrapper() se define acá SINCRÓNICAMENTE al cargar el script
//     → siempre existe antes de que el usuario pueda pulsar el botón
//   · Si hay manga sin OCR: corre Tesseract, escribe HTML real en archivosHTML[id],
//     re-renderiza, y llama a iniciarTTS() normal
//   · Si no hay manga o ya tiene texto: delega a togglePlayPause() directamente
//
//   El texto OCR va en archivosHTML[id] con <p> reales para que
//   _getChapterText(), iniciarTTS() y _avanzarSiguienteCapituloAuto()
//   lo encuentren sin ningún otro parche.
// ═══════════════════════════════════════════════════════════════════

// ── Estado (disponible inmediatamente, antes del DOM) ────────────

const _OCR = {
    lang: localStorage.getItem('manga_ocr_lang') || 'spa',
    activado: localStorage.getItem('manga_ocr_activado') === '1',
    enCurso: false,
    worker: null,
    procesados: new Set(),
};

const _OCR_LANGS = {
    spa: 'Español',
    eng: 'English',
    jpn: '日本語',
    chi_sim: '中文 简体',
    por: 'Português',
    fra: 'Français',
    deu: 'Deutsch',
    ita: 'Italiano',
    kor: '한국어',
};

// ─────────────────────────────────────────────────────────────────
// _playWrapper — función llamada por el botón ▶
// Se define SINCRÓNICAMENTE para que exista en cuanto carga el script
// ─────────────────────────────────────────────────────────────────

window._playWrapper = function () {
    // ¿Ya está leyendo? → pause/resume normal
    if (typeof isReading !== 'undefined' && isReading) {
        if (typeof togglePlayPause === 'function') togglePlayPause();
        return;
    }

    // ¿Hay manga activo sin OCR procesado?
    if (_OCR.activado && _hayMangaSinTexto()) {
        _lanzarOCRYLeerTTS();
        return;
    }

    // Caso normal: EPUB, TXT, manga ya con texto OCR, etc.
    if (typeof togglePlayPause === 'function') togglePlayPause();
};

// ¿El capítulo actual es manga y aún no tiene texto real?
function _hayMangaSinTexto() {
    const ruta = _rutaActual();
    if (!ruta || !ruta.startsWith('__manga_')) return false;
    return _esMarcador(ruta);
}

function _rutaActual() {
    const sel = document.getElementById('chapters');
    if (!sel || sel.selectedIndex < 0) return '';
    return sel.options[sel.selectedIndex]?.value || '';
}

function _esMarcador(ruta) {
    const html = (typeof archivosHTML !== 'undefined') ? (archivosHTML[ruta] || '') : '';
    return html.startsWith('<!-- manga:');
}

// ─────────────────────────────────────────────────────────────────
// FLUJO PRINCIPAL: OCR → escribir archivosHTML → TTS
// ─────────────────────────────────────────────────────────────────

async function _lanzarOCRYLeerTTS() {
    if (_OCR.enCurso) return;

    const ruta = _rutaActual();
    if (!ruta) return;

    const paginas = (window._MANGA?.paginas || []).filter(p => p.id === ruta);
    if (!paginas.length) {
        mostrarNotificacion('⚠ No hay imágenes para procesar');
        return;
    }

    _OCR.enCurso = true;
    _abrirModalOCR(paginas.length);

    try {
        await _cargarTesseract();
        if (!_OCR.enCurso) return;

        const textoOCR = await _procesarImagenesOCR(paginas);
        if (!_OCR.enCurso) return;

        if (!textoOCR.trim()) {
            mostrarNotificacion('⚠ No se detectó texto en las imágenes');
            _cerrarModalOCR();
            _OCR.enCurso = false;
            return;
        }

        // *** Escribir HTML real en archivosHTML ***
        // A partir de aquí, todas las funciones (iniciarTTS, _getChapterText, etc.)
        // ven texto normal como si fuera un capítulo de EPUB
        archivosHTML[ruta] = _construirHTML(textoOCR, paginas);
        _OCR.procesados.add(ruta);

        // Re-renderizar el contenedor con el texto (no las imágenes)
        const contenedor = document.getElementById('texto-contenido');
        if (contenedor) {
            contenedor.innerHTML = archivosHTML[ruta];
            contenedor.style.padding = '';
            contenedor.style.background = '';
            contenedor.scrollTop = 0;
        }

        if (typeof actualizarEstadisticas === 'function') actualizarEstadisticas();

        _actualizarModalOCR(100, '✓ Texto listo');
        _cerrarModalOCR();
        _actualizarBotónOCRUI();

        // Lanzar TTS sobre el texto recién inyectado
        setTimeout(() => {
            mostrarNotificacion('🔊 Leyendo OCR...');
            // Llamar iniciarTTS directamente — ahora contenedor.textContent tiene texto real
            if (typeof iniciarTTS === 'function') iniciarTTS();
        }, 150);

    } catch (err) {
        console.error('[OCR]', err);
        const isNet = err.message.includes('Tesseract') || err.message.includes('CDN') ||
            err.message.includes('internet') || err.message.includes('offline') ||
            err.message.includes('setup_ocr');
        _actualizarModalOCR(0, isNet
            ? '❌ Sin internet — ejecuta setup_ocr.bat para instalar offline'
            : '❌ ' + err.message);
        const btn = document.getElementById('ocr-cancel-btn');
        if (btn) { btn.textContent = 'Cerrar'; btn.style.color = '#c8a96e'; btn.style.borderColor = '#c8a96e'; }
        mostrarNotificacion('❌ OCR: ' + (isNet ? 'ejecuta setup_ocr.bat' : err.message));
    } finally {
        _OCR.enCurso = false;
    }
}

// ─────────────────────────────────────────────────────────────────
// CONSTRUIR HTML FINAL CON MINIATURAS + PÁRRAFOS
// ─────────────────────────────────────────────────────────────────

function _construirHTML(texto, paginas) {
    let html = '';

    // Panel de miniaturas colapsable (encima del texto)
    if (paginas.length) {
        html += `<div class="ocr-images-panel">
<div class="ocr-images-toggle" onclick="this.parentElement.classList.toggle('open')">
🖼 ${paginas.length} imagen${paginas.length > 1 ? 'es' : ''} — clic para ver/ocultar
<span class="ocr-toggle-arrow">▶</span>
</div>
<div class="ocr-images-grid">
${paginas.map((p, i) =>
            `<img src="${p.url}" alt="Pág ${i + 1}" class="ocr-thumb"
          onclick="_ocrLightbox('${p.url}')"
          title="Página ${i + 1} — clic para ampliar">`
        ).join('\n')}
</div>
</div>`;
    }

    // Párrafos reales — estos son los que lee el TTS
    texto.split(/\n\n+/)
        .map(p => p.replace(/\n/g, ' ').trim())
        .filter(p => p.length > 0)
        .forEach(p => { html += `<p>${_esc(p)}</p>\n`; });

    return html;
}

function _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────
// CARGA DE TESSERACT.JS
// ─────────────────────────────────────────────────────────────────

async function _cargarTesseract() {
    if (window.Tesseract) return;

    // manga_ocr.js vive en js/ → la carpeta tesseract/ está en la raíz (un nivel arriba)
    const SOURCES = [
        '../tesseract/tesseract.min.js',  // LOCAL (creada por setup_ocr.bat)
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js',
        'https://unpkg.com/tesseract.js@5.0.4/dist/tesseract.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js',
    ];

    if (document.getElementById('tesseract-cdn')) {
        _actualizarModalOCR(8, 'Esperando Tesseract.js...');
        await new Promise((resolve, reject) => {
            const t = setInterval(() => { if (window.Tesseract) { clearInterval(t); resolve(); } }, 200);
            setTimeout(() => { clearInterval(t); reject(new Error('Timeout esperando Tesseract')); }, 30000);
        });
        return;
    }

    for (let i = 0; i < SOURCES.length; i++) {
        const src = SOURCES[i];
        const isLocal = !src.startsWith('http');
        _actualizarModalOCR(8 + i * 3, isLocal
            ? 'Buscando Tesseract.js local...'
            : `Descargando Tesseract.js (intento ${i}/${SOURCES.length - 1})...`);
        try {
            await new Promise((resolve, reject) => {
                document.getElementById('tesseract-cdn')?.remove();
                const s = document.createElement('script');
                s.id = 'tesseract-cdn';
                s.src = src;
                s.onload = () => {
                    const t = setInterval(() => {
                        if (window.Tesseract) { clearInterval(t); resolve(); }
                    }, 100);
                    setTimeout(() => { clearInterval(t); reject(new Error('Timeout')); }, 10000);
                };
                s.onerror = () => reject(new Error(isLocal ? 'no encontrado' : 'CDN inaccesible'));
                document.head.appendChild(s);
            });
            console.log('[OCR] ✓ Tesseract.js desde:', src);
            return;
        } catch (err) {
            console.warn('[OCR] falló:', src, '-', err.message);
        }
    }

    throw new Error(
        'Tesseract.js no disponible. ' +
        'Ejecuta setup_ocr.bat desde la raíz del proyecto para instalar offline.'
    );
}

// ─────────────────────────────────────────────────────────────────
// OCR DE IMÁGENES
// ─────────────────────────────────────────────────────────────────

async function _procesarImagenesOCR(paginas) {
    const langName = _OCR_LANGS[_OCR.lang] || _OCR.lang;
    _actualizarModalOCR(12, `Cargando modelo: ${langName}...`);

    if (!window.Tesseract) {
        throw new Error('Tesseract.js no disponible');
    }

    if (!_OCR.worker) {
        const _scriptSrc = document.getElementById('tesseract-cdn')?.src || '';
        const _esLocal = _scriptSrc.includes('/tesseract/tesseract.min.js');

        // URLs absolutas — el WebWorker las necesita así (no acepta rutas relativas)
        // corePath = directorio con los 4 archivos wasm (sin / al final, según doc oficial)
        // langPath = directorio con los .traineddata.gz (sin / al final)
        const _base = window.location.origin + '/tesseract';
        const _workerOpts = _esLocal
            ? {
                workerPath: _base + '/worker.min.js',
                corePath: _base,
                langPath: _base + '/lang',
                workerBlobURL: false,
                gzip: true,
                logger: () => { }
            }
            : { logger: () => { } };

        _OCR.worker = await Tesseract.createWorker(_OCR.lang, 1, _workerOpts);
        // Parámetros para mejorar reconocimiento en texto estilizado / manga
        await _OCR.worker.setParameters({
            tessedit_pageseg_mode: '3',      // PSM 3: segmentación automática completa
            tessedit_ocr_engine_mode: '1',   // OEM 1: LSTM solamente (más preciso)
            preserve_interword_spaces: '1',
        });
        console.log('[OCR] worker listo — idioma:', _OCR.lang, _esLocal ? '(LOCAL)' : '(CDN)');
    }

    const total = paginas.length;
    let texto = '';

    for (let i = 0; i < total; i++) {
        if (!_OCR.enCurso) break;
        const pct = 15 + Math.round(((i + 1) / total) * 80);
        _actualizarModalOCR(pct, `Imagen ${i + 1} / ${total}…`);

        try {
            const imgUrl = await _preprocesarImagen(paginas[i].url);
            const { data } = await _OCR.worker.recognize(imgUrl);
            const linea = data.text.trim();
            if (linea.length > 1) texto += (texto ? '\n\n' : '') + linea;
        } catch (e) {
            console.warn('[OCR] imagen', i + 1, ':', e.message);
        }
    }

    _actualizarModalOCR(97, 'Limpiando texto...');
    return _limpiar(texto);
}

// ─────────────────────────────────────────────────────────────────
// PREPROCESADO DE IMAGEN — mejora OCR en fondos oscuros / texto claro
// Convierte la imagen a escala de grises, detecta si el fondo es
// oscuro (texto claro sobre fondo oscuro) e invierte si es necesario,
// luego aplica umbralización para obtener texto negro sobre blanco.
// ─────────────────────────────────────────────────────────────────
async function _preprocesarImagen(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // Escalar si la imagen es muy pequeña — Tesseract funciona mejor >= 300dpi equiv.
                const escala = Math.max(1, Math.min(3, 1200 / Math.max(img.width, img.height)));
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                const ctx = canvas.getContext('2d');

                // Fondo blanco antes de dibujar (transparencias → blanco)
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imageData.data;
                const total = d.length / 4;

                // Calcular luminosidad media de la imagen
                let sumaLum = 0;
                for (let i = 0; i < d.length; i += 4) {
                    sumaLum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                }
                const lumMedia = sumaLum / total;
                const fondoOscuro = lumMedia < 128; // imagen mayormente oscura → texto claro

                // Convertir a escala de grises con umbralización
                // Si fondo oscuro: invertir primero (texto claro → texto oscuro)
                const umbral = 128;
                for (let i = 0; i < d.length; i += 4) {
                    let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    if (fondoOscuro) lum = 255 - lum; // invertir
                    const bin = lum > umbral ? 255 : 0; // binarizar
                    d[i] = d[i + 1] = d[i + 2] = bin;
                    d[i + 3] = 255;
                }
                ctx.putImageData(imageData, 0, 0);

                // Ligero blur + re-sharpen para reducir ruido en texto estilizado
                ctx.filter = 'blur(0.5px)';
                ctx.drawImage(canvas, 0, 0);
                ctx.filter = 'none';

                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                // Si falla el preprocesado, usar imagen original
                resolve(url);
            }
        };
        img.onerror = () => resolve(url); // fallback a original
        img.src = url;
    });
}

function _limpiar(t) {
    return t
        .split('\n')
        .filter(l => l.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 || l.trim() === '')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

// ─────────────────────────────────────────────────────────────────
// MODAL DE PROGRESO
// ─────────────────────────────────────────────────────────────────

function _abrirModalOCR(total) {
    document.getElementById('manga-ocr-modal')?.remove();
    const m = document.createElement('div');
    m.id = 'manga-ocr-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;font-family:"DM Mono",monospace;';
    m.innerHTML = `
<div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:26px 30px;width:400px;max-width:92vw;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
        <span style="font-size:1.3rem;">🔍</span>
        <div>
            <div style="font-size:.72rem;color:#c8a96e;letter-spacing:.08em;font-weight:600;">RECONOCIMIENTO DE TEXTO (OCR)</div>
            <div style="font-size:.5rem;color:#555;margin-top:2px;">${_OCR_LANGS[_OCR.lang] || _OCR.lang} · ${total} imagen${total > 1 ? 'es' : ''}</div>
        </div>
    </div>
    <div style="background:#1a1a1a;border-radius:4px;height:6px;overflow:hidden;margin-bottom:6px;">
        <div id="ocr-prog-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#c8a96e,#e8c98e);transition:width .4s;border-radius:4px;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
        <span id="ocr-prog-label" style="font-size:.52rem;color:#777;">Iniciando...</span>
        <span id="ocr-prog-pct"   style="font-size:.52rem;color:#c8a96e;">0%</span>
    </div>
    <div style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);border-radius:6px;padding:8px 12px;font-size:.46rem;color:#555;margin-bottom:16px;line-height:1.7;">
        ℹ Corre localmente — sin servidores.<br>
        El modelo de idioma (~5–12 MB) se cachea automáticamente.
    </div>
    <div style="text-align:right;">
        <button onclick="_cancelarOCR()"
                style="background:none;border:1px solid #2a2a2a;border-radius:5px;color:#555;
                       font-family:'DM Mono',monospace;font-size:.53rem;padding:7px 16px;cursor:pointer;"
                onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e'"
                onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555'">✕ Cancelar</button>
    </div>
</div>`;
    document.body.appendChild(m);
}

function _actualizarModalOCR(pct, label) {
    const bar = document.getElementById('ocr-prog-bar');
    const lbl = document.getElementById('ocr-prog-label');
    const pctEl = document.getElementById('ocr-prog-pct');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = label || '';
    if (pctEl) pctEl.textContent = pct + '%';
}

function _cerrarModalOCR() {
    document.getElementById('manga-ocr-modal')?.remove();
}

window._cancelarOCR = function () {
    _OCR.enCurso = false;
    if (_OCR.worker) { _OCR.worker.terminate().catch(() => { }); _OCR.worker = null; }
    _cerrarModalOCR();
    mostrarNotificacion('✕ OCR cancelado');
};

// ─────────────────────────────────────────────────────────────────
// MODAL DE CONFIGURACIÓN OCR
// ─────────────────────────────────────────────────────────────────

function abrirConfigOCR() {
    document.getElementById('ocr-config-modal')?.remove();

    const ruta = _rutaActual();
    const esManga = ruta.startsWith('__manga_');
    const tieneOCR = esManga && !_esMarcador(ruta);
    const palabras = tieneOCR
        ? new DOMParser().parseFromString(archivosHTML[ruta], 'text/html').body.textContent
            .trim().split(/\s+/).filter(w => w).length
        : 0;

    const m = document.createElement('div');
    m.id = 'ocr-config-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:99992;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;font-family:"DM Mono",monospace;';
    m.innerHTML = `
<div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:26px 30px;width:430px;max-width:92vw;">

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
        <span style="font-size:1.3rem;">🔍</span>
        <div style="flex:1;">
            <div style="font-size:.72rem;color:#c8a96e;letter-spacing:.08em;font-weight:600;">OCR — LEER TEXTO EN IMÁGENES</div>
            <div style="font-size:.5rem;color:#555;margin-top:2px;">Tesseract.js · reconocimiento local sin servidores</div>
        </div>
        <button onclick="document.getElementById('ocr-config-modal').remove()"
                style="background:none;border:none;color:#555;font-size:1.1rem;cursor:pointer;"
                onmouseover="this.style.color='#c8a96e'" onmouseout="this.style.color='#555'">✕</button>
    </div>

    <!-- Toggle activar -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1e1e1e;">
        <div>
            <div style="font-size:.65rem;color:#aaa;">Activar OCR al pulsar ▶</div>
            <div style="font-size:.5rem;color:#555;margin-top:2px;">Extrae texto de las imágenes antes de leer</div>
        </div>
        <label class="toggle" style="flex-shrink:0;margin-left:16px;">
            <input type="checkbox" ${_OCR.activado ? 'checked' : ''} onchange="_ocrToggle(this.checked)">
            <span class="toggle-slider"></span>
        </label>
    </div>

    <!-- Idioma -->
    <div style="margin-bottom:14px;">
        <div style="font-size:.58rem;color:#888;margin-bottom:6px;">Idioma del texto en las imágenes</div>
        <select onchange="_ocrSetLang(this.value)"
                style="width:100%;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;
                       color:#aaa;font-family:'DM Mono',monospace;font-size:.62rem;padding:7px 10px;outline:none;cursor:pointer;">
            ${Object.entries(_OCR_LANGS).map(([code, name]) =>
        `<option value="${code}" ${_OCR.lang === code ? 'selected' : ''}>${name}</option>`
    ).join('')}
        </select>
        <div style="font-size:.47rem;color:#444;margin-top:4px;">
            El modelo (~5–12 MB) se descarga una sola vez y queda cacheado en el navegador.
        </div>
    </div>

    <!-- Estado del capítulo actual -->
    <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:.58rem;color:#888;margin-bottom:6px;">Capítulo actual</div>
        ${!esManga
            ? `<div style="font-size:.58rem;color:#555;">— Abre un manga primero —</div>`
            : tieneOCR
                ? `<div style="font-size:.6rem;color:#6abf69;margin-bottom:8px;">✓ OCR procesado · ~${palabras} palabras</div>
               <div style="display:flex;gap:6px;">
                   <button onclick="_ocrEditarEnEditor('${ruta}')"
                           style="flex:1;background:none;border:1px solid #2a2a2a;border-radius:5px;color:#888;font-family:'DM Mono',monospace;font-size:.55rem;padding:6px 0;cursor:pointer;"
                           onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e'"
                           onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#888'">✏ Editar texto</button>
                   <button onclick="_ocrReset('${ruta}')"
                           style="flex:1;background:none;border:1px solid #2a2a2a;border-radius:5px;color:#888;font-family:'DM Mono',monospace;font-size:.55rem;padding:6px 0;cursor:pointer;"
                           onmouseover="this.style.borderColor='#c8a96e';this.style.color='#c8a96e'"
                           onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#888'">🔄 Re-procesar</button>
               </div>`
                : `<div style="font-size:.58rem;color:#555;margin-bottom:8px;">Sin OCR — mostrando imágenes</div>
               <button onclick="document.getElementById('ocr-config-modal').remove();_ocrToggle(true);_lanzarOCRYLeerTTS()"
                       style="width:100%;background:#c8a96e;border:none;border-radius:6px;color:#0a0a0a;
                              font-family:'DM Mono',monospace;font-size:.62rem;font-weight:700;padding:8px 0;cursor:pointer;">
                   🔍 Leer texto ahora
               </button>`
        }
    </div>

    <div style="font-size:.47rem;color:#333;line-height:1.7;">
        Para manga japonés vertical usar <strong style="color:#444;">日本語</strong>.<br>
        El texto extraído puede editarse con ✏ Editar texto antes de leer.
    </div>
</div>`;

    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

// helpers del modal de config
window._ocrToggle = function (val) {
    _OCR.activado = val;
    localStorage.setItem('manga_ocr_activado', val ? '1' : '0');
    _actualizarBotónOCRUI();
    mostrarNotificacion(val ? '✓ OCR activado — pulsa ▶ para leer' : 'OCR desactivado');
};

window._ocrSetLang = function (lang) {
    _OCR.lang = lang;
    localStorage.setItem('manga_ocr_lang', lang);
    if (_OCR.worker) { _OCR.worker.terminate().catch(() => { }); _OCR.worker = null; }
    mostrarNotificacion('✓ Idioma OCR: ' + (_OCR_LANGS[lang] || lang));
};

window._ocrReset = function (ruta) {
    archivosHTML[ruta] = `<!-- manga:${ruta} -->`;
    _OCR.procesados.delete(ruta);
    document.getElementById('ocr-config-modal')?.remove();
    if (typeof _renderizarCapituloManga === 'function') _renderizarCapituloManga(ruta);
    mostrarNotificacion('✓ Reseteado — pulsa ▶ para re-procesar');
};

window._ocrEditarEnEditor = function (ruta) {
    const txt = new DOMParser().parseFromString(archivosHTML[ruta], 'text/html').body.textContent.trim();
    const ed = document.getElementById('editor-texto');
    if (ed) {
        ed.value = txt;
        document.getElementById('ocr-config-modal')?.remove();
        if (typeof toggleEditor === 'function') {
            const p = document.getElementById('editor-panel');
            if (p && p.style.display === 'none') toggleEditor();
        }
        mostrarNotificacion('✓ Texto OCR en el editor');
    }
};

// ─────────────────────────────────────────────────────────────────
// LIGHTBOX DE IMÁGENES
// ─────────────────────────────────────────────────────────────────

window._ocrLightbox = function (url) {
    const ex = document.getElementById('ocr-lightbox');
    if (ex) { ex.remove(); return; }
    const lb = document.createElement('div');
    lb.id = 'ocr-lightbox';
    lb.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.96);display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    lb.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:4px;">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); }
    });
};

// ─────────────────────────────────────────────────────────────────
// BOTÓN 🔍 OCR EN TOP-BAR
// ─────────────────────────────────────────────────────────────────

function _actualizarBotónOCRUI() {
    const btn = document.getElementById('btn-ocr-manga');
    if (!btn) return;
    btn.style.borderColor = _OCR.activado ? '#c8a96e' : '';
    btn.style.color = _OCR.activado ? '#c8a96e' : '';
    btn.title = _OCR.activado
        ? `OCR ACTIVO · ${_OCR_LANGS[_OCR.lang]} — clic para configurar`
        : 'OCR desactivado — clic para configurar';
}

document.addEventListener('DOMContentLoaded', () => {
    const btnManga = document.getElementById('btn-manga');
    if (!btnManga) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-ocr-manga';
    btn.className = 'rec-btn';
    btn.style.marginBottom = '0';
    btn.textContent = '🔍 OCR';
    btn.addEventListener('click', abrirConfigOCR);
    btnManga.insertAdjacentElement('afterend', btn);
    _actualizarBotónOCRUI();
});

// ─────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────

(function () {
    if (document.getElementById('manga-ocr-styles')) return;
    const s = document.createElement('style');
    s.id = 'manga-ocr-styles';
    s.textContent = `
        .ocr-images-panel {
            margin-bottom: 20px;
            border: 1px solid var(--border, #2a2a2a);
            border-radius: 8px;
            overflow: hidden;
        }
        .ocr-images-toggle {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 14px;
            font-family: 'DM Mono', monospace; font-size: .58rem;
            color: var(--text-dim, #666); cursor: pointer; user-select: none;
            transition: color .15s;
        }
        .ocr-images-toggle:hover { color: #c8a96e; }
        .ocr-toggle-arrow { margin-left: auto; transition: transform .2s; }
        .ocr-images-panel.open .ocr-toggle-arrow { transform: rotate(90deg); }
        .ocr-images-grid {
            display: none; flex-wrap: wrap; gap: 6px;
            padding: 10px 14px 14px; background: #0a0a0a;
        }
        .ocr-images-panel.open .ocr-images-grid { display: flex; }
        .ocr-thumb {
            height: 110px; width: auto; cursor: zoom-in;
            border-radius: 4px; border: 1px solid #222;
            transition: border-color .15s, transform .15s;
            object-fit: contain; background: #000;
        }
        .ocr-thumb:hover { border-color: #c8a96e; transform: scale(1.05); }
        #btn-ocr-manga { transition: border-color .15s, color .15s; }
    `;
    document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────

window.abrirConfigOCR = abrirConfigOCR;
window._lanzarOCRYLeerTTS = _lanzarOCRYLeerTTS;
window._OCR = _OCR;

console.log('[manga_ocr.js] ✓ _playWrapper lista — OCR',
    _OCR.activado ? 'ACTIVO' : 'inactivo', '· lang:', _OCR.lang);