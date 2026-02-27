// ═══════════════════════════════════════════════════════════════════
// MANGA.JS — Lector de manga / cómic desde carpeta de imágenes o ZIP
// ═══════════════════════════════════════════════════════════════════
//
// Formatos soportados:
//   · Carpeta de imágenes   → múltiples JPG/PNG/WebP/AVIF via <input webkitdirectory>
//   · ZIP de imágenes       → archivo .zip con fotos dentro (cualquier sub-carpeta)
//   · Selección múltiple    → múltiples archivos JPG/PNG sueltos
//
// Cómo se integra:
//   · Guarda marcadores en archivosHTML[id] igual que epub.js
//   · Intercepta window.cargarCapitulo() para que los capítulos __manga_*
//     rendericen las imágenes directamente en #texto-contenido,
//     sin pasar por el pipeline de texto/TTS de epub.js
//   · El resto del sistema (selector, chip, navegación con teclado) sin cambios
//
// Dependencias:
//   · main.js  (archivosHTML, mostrarNotificacion)
//   · epub.js  (cargarCapitulo — se parchea en DOMContentLoaded)
//   · JSZip    (CDN — se carga solo si se abre un ZIP)
//
// Para activar, agregar en index.html DESPUÉS de formats.js:
//   <script src="js/manga.js"></script>
// ═══════════════════════════════════════════════════════════════════

// ── Estado ───────────────────────────────────────────────────────

const _MANGA = {
    blobUrls: [],
    groupMode: parseInt(localStorage.getItem('manga_group_mode') || '1'),
    readDir: localStorage.getItem('manga_read_dir') || 'rtl',
    fitMode: localStorage.getItem('manga_fit_mode') || 'fit-width',
    nombre: '',
    paginas: [],   // [{id, capIndex, pageInGroup, url, title}]
    paginaActual: 0,
};

// ─────────────────────────────────────────────────────────────────
// INTERCEPTOR DE cargarCapitulo
// Se instala en DOMContentLoaded, después de que epub.js ya registró la suya.
// Para capítulos normales delega al original sin cambio alguno.
// ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const _original = window.cargarCapitulo || (() => { });

        window.cargarCapitulo = async function (ruta, _cancelToken) {
            if (typeof ruta === 'string' && ruta.startsWith('__manga_')) {
                await _renderizarCapituloManga(ruta);
                return;
            }
            return _original(ruta, _cancelToken);
        };

        console.log('[manga.js] ✓ cargarCapitulo interceptado');
    }, 0);
});

// ─────────────────────────────────────────────────────────────────
// RENDERIZADO DE CAPÍTULO MANGA
// ─────────────────────────────────────────────────────────────────

async function _renderizarCapituloManga(ruta) {
    const contenedor = document.getElementById('texto-contenido');
    if (!contenedor) return;

    if (typeof detenerTTS === 'function') detenerTTS();

    const grupo = _MANGA.paginas.filter(p => p.id === ruta);
    if (!grupo.length) {
        console.warn('[manga] No hay páginas para ruta:', ruta);
        return;
    }

    // Limpiar y preparar el contenedor
    contenedor.innerHTML = '';
    contenedor.style.padding = '0';
    contenedor.style.background = '#0a0a0a';

    const wrap = document.createElement('div');
    wrap.className = 'manga-chapter-wrap';
    wrap.style.cssText = [
        'direction:' + _MANGA.readDir,
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'gap:2px',
        'width:100%',
        'background:#0a0a0a',
    ].join(';');

    grupo.forEach((pag, i) => {
        const img = document.createElement('img');
        img.src = pag.url;
        img.alt = 'Página ' + (pag.pageInGroup + 1);
        img.className = 'manga-page-img';
        img.loading = i === 0 ? 'eager' : 'lazy';
        img.decoding = 'async';

        if (_MANGA.fitMode === 'fit-width') {
            img.style.cssText = 'max-width:100%;width:100%;height:auto;display:block;cursor:pointer;user-select:none;-webkit-user-drag:none;';
        } else if (_MANGA.fitMode === 'fit-height') {
            img.style.cssText = 'max-height:92vh;width:auto;display:block;margin:0 auto;cursor:pointer;user-select:none;-webkit-user-drag:none;';
        } else {
            img.style.cssText = 'display:block;margin:0 auto;cursor:pointer;user-select:none;-webkit-user-drag:none;';
        }

        img.addEventListener('click', (e) => _mangaClickNavegar(e, img));
        img.addEventListener('error', () => {
            img.style.cssText += ';border:2px dashed #c8a96e;min-height:80px;';
        });

        wrap.appendChild(img);
    });

    // Hint al pie — solo visual, sin textContent para que el TTS no lo lea
    const hint = document.createElement('div');
    hint.setAttribute('aria-hidden', 'true');
    hint.dataset.hintText = grupo[0].title;
    hint.style.cssText = 'font-family:"DM Mono",monospace;font-size:.5rem;color:#333;text-align:center;padding:10px 0 24px;width:100%;pointer-events:none;';
    // Usar ::before con content CSS en vez de textContent (no entra en textContent del DOM)
    hint.style.setProperty('--hint-label', JSON.stringify('— ' + grupo[0].title + ' —'));
    hint.className = 'manga-page-hint';
    wrap.appendChild(hint);

    contenedor.appendChild(wrap);
    contenedor.scrollTop = 0;

    // Índice de página actual
    const firstIdx = _MANGA.paginas.findIndex(p => p.id === ruta && p.pageInGroup === 0);
    if (firstIdx >= 0) _MANGA.paginaActual = firstIdx;

    // Actualizar títulos en el UI
    const selector = document.getElementById('chapters');
    const titulo = selector?.options[selector.selectedIndex]?.textContent || grupo[0].title;

    const headerTitle = document.getElementById('current-chapter-title');
    if (headerTitle) headerTitle.textContent = titulo;

    const capEl = document.getElementById('kp-chapter');
    if (capEl) capEl.textContent = titulo;

    // Estadísticas adaptadas a manga
    const contP = document.getElementById('contador-palabras');
    const contC = document.getElementById('contador-caracteres');
    const contPa = document.getElementById('contador-parrafos');
    if (contP) contP.textContent = '—';
    if (contC) contC.textContent = grupo.length + ' img' + (grupo.length > 1 ? 's' : '');
    if (contPa) contPa.textContent = _MANGA.paginas.filter(p => p.id === ruta).length;

    mostrarNotificacion('📖 ' + titulo);

    // Pre-cargar siguiente capítulo en background
    const sigRuta = _getSiguienteMangaRuta(ruta);
    if (sigRuta) {
        const sig = _MANGA.paginas.find(p => p.id === sigRuta);
        if (sig) { const pre = new Image(); pre.src = sig.url; }
    }
}

function _getSiguienteMangaRuta(rutaActual) {
    const selector = document.getElementById('chapters');
    if (!selector) return null;
    const opts = Array.from(selector.options);
    const idx = opts.findIndex(o => o.value === rutaActual);
    return (idx >= 0 && idx < opts.length - 1) ? opts[idx + 1].value : null;
}

// ─────────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA PÚBLICO
// ─────────────────────────────────────────────────────────────────

function abrirLectorManga() {
    _crearModalManga();
}

async function cargarMangaDesdeFiles(files, nombreOverride) {
    if (!files || !files.length) return;
    const imgs = Array.from(files).filter(_esImagen).sort(_ordenarArchivos);
    if (!imgs.length) { mostrarNotificacion('⚠ No se encontraron imágenes'); return; }
    await _procesarImagenes(imgs, nombreOverride || 'Manga');
}

// ─────────────────────────────────────────────────────────────────
// MODAL DE CARGA
// ─────────────────────────────────────────────────────────────────

function _crearModalManga() {
    document.getElementById('manga-modal-root')?.remove();

    const hayManga = _MANGA.paginas.length > 0;
    const modal = document.createElement('div');
    modal.id = 'manga-modal-root';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;font-family:"DM Mono",monospace;';

    modal.innerHTML = `
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:28px 32px;width:500px;max-width:94vw;position:relative;">

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
            <span style="font-size:1.5rem;">📖</span>
            <div>
                <div style="font-size:.75rem;color:#c8a96e;letter-spacing:.1em;font-weight:600;">LECTOR DE MANGA</div>
                <div style="font-size:.52rem;color:#555;margin-top:2px;">JPG · PNG · WebP · ZIP de imágenes</div>
            </div>
            <button onclick="document.getElementById('manga-modal-root').remove()"
                    style="margin-left:auto;background:none;border:none;color:#555;font-size:1.1rem;cursor:pointer;padding:4px;"
                    onmouseover="this.style.color='#c8a96e'" onmouseout="this.style.color='#555'">✕</button>
        </div>

        ${hayManga ? `
        <div style="background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.15);border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">🎌</span>
            <div style="min-width:0;flex:1;">
                <div style="font-size:.65rem;color:#c8a96e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_MANGA.nombre}</div>
                <div style="font-size:.54rem;color:#555;margin-top:2px;">${_MANGA.paginas.length} páginas cargadas</div>
            </div>
            <button onclick="document.getElementById('manga-modal-root').remove()"
                    style="background:#c8a96e;border:none;border-radius:6px;color:#0a0a0a;font-family:'DM Mono',monospace;font-size:.58rem;font-weight:700;padding:6px 12px;cursor:pointer;">
                Continuar
            </button>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">
            <label for="manga-input-dir" style="cursor:pointer;">
                <div style="border:1px solid #2a2a2a;border-radius:8px;padding:14px 10px;text-align:center;transition:all .15s;background:#0d0d0d;"
                     onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.05)'"
                     onmouseout="this.style.borderColor='#2a2a2a';this.style.background='#0d0d0d'">
                    <div style="font-size:1.5rem;margin-bottom:6px;">📁</div>
                    <div style="font-size:.6rem;color:#c8a96e;margin-bottom:3px;">Carpeta</div>
                    <div style="font-size:.5rem;color:#555;line-height:1.4;">Selecciona la carpeta con las imágenes</div>
                </div>
                <input type="file" id="manga-input-dir" webkitdirectory directory multiple accept="image/*" style="display:none" onchange="_mangaDesdeInput(this,'dir')">
            </label>
            <label for="manga-input-files" style="cursor:pointer;">
                <div style="border:1px solid #2a2a2a;border-radius:8px;padding:14px 10px;text-align:center;transition:all .15s;background:#0d0d0d;"
                     onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.05)'"
                     onmouseout="this.style.borderColor='#2a2a2a';this.style.background='#0d0d0d'">
                    <div style="font-size:1.5rem;margin-bottom:6px;">🖼</div>
                    <div style="font-size:.6rem;color:#c8a96e;margin-bottom:3px;">Imágenes</div>
                    <div style="font-size:.5rem;color:#555;line-height:1.4;">Múltiples JPG / PNG sueltos</div>
                </div>
                <input type="file" id="manga-input-files" multiple accept="image/*" style="display:none" onchange="_mangaDesdeInput(this,'files')">
            </label>
            <label for="manga-input-zip" style="cursor:pointer;">
                <div style="border:1px solid #2a2a2a;border-radius:8px;padding:14px 10px;text-align:center;transition:all .15s;background:#0d0d0d;"
                     onmouseover="this.style.borderColor='#c8a96e';this.style.background='rgba(200,169,110,.05)'"
                     onmouseout="this.style.borderColor='#2a2a2a';this.style.background='#0d0d0d'">
                    <div style="font-size:1.5rem;margin-bottom:6px;">🗜</div>
                    <div style="font-size:.6rem;color:#c8a96e;margin-bottom:3px;">ZIP</div>
                    <div style="font-size:.5rem;color:#555;line-height:1.4;">Archivo .zip con las imágenes dentro</div>
                </div>
                <input type="file" id="manga-input-zip" accept=".zip,application/zip" style="display:none" onchange="_mangaDesdeInput(this,'zip')">
            </label>
        </div>

        <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
            <div style="font-size:.58rem;color:#c8a96e;letter-spacing:.08em;margin-bottom:10px;">⚙ CONFIGURACIÓN DEL VISOR</div>

            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <span style="font-size:.58rem;color:#888;min-width:110px;">Págs por capítulo</span>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${[1, 2, 4, 8, 20].map(n => `
                    <button onclick="_mangaSetGroup(${n},this)" id="manga-grp-${n}"
                            style="background:${_MANGA.groupMode === n ? '#c8a96e' : 'none'};border:1px solid ${_MANGA.groupMode === n ? '#c8a96e' : '#2a2a2a'};border-radius:4px;color:${_MANGA.groupMode === n ? '#0a0a0a' : '#666'};font-family:'DM Mono',monospace;font-size:.55rem;padding:3px 8px;cursor:pointer;">${n}</button>`).join('')}
                </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <span style="font-size:.58rem;color:#888;min-width:110px;">Dirección</span>
                <div style="display:flex;gap:4px;">
                    <button onclick="_mangaSetDir('rtl',this)" id="manga-dir-rtl"
                            style="background:${_MANGA.readDir === 'rtl' ? '#c8a96e' : 'none'};border:1px solid ${_MANGA.readDir === 'rtl' ? '#c8a96e' : '#2a2a2a'};border-radius:4px;color:${_MANGA.readDir === 'rtl' ? '#0a0a0a' : '#666'};font-family:'DM Mono',monospace;font-size:.55rem;padding:3px 8px;cursor:pointer;">← RTL (Manga JP)</button>
                    <button onclick="_mangaSetDir('ltr',this)" id="manga-dir-ltr"
                            style="background:${_MANGA.readDir === 'ltr' ? '#c8a96e' : 'none'};border:1px solid ${_MANGA.readDir === 'ltr' ? '#c8a96e' : '#2a2a2a'};border-radius:4px;color:${_MANGA.readDir === 'ltr' ? '#0a0a0a' : '#666'};font-family:'DM Mono',monospace;font-size:.55rem;padding:3px 8px;cursor:pointer;">→ LTR (Cómic)</button>
                </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:.58rem;color:#888;min-width:110px;">Ajuste imagen</span>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${[['fit-width', 'Ancho completo'], ['fit-height', 'Alto pantalla'], ['original', 'Original']].map(([v, l]) => `
                    <button onclick="_mangaSetFit('${v}',this)" id="manga-fit-${v}"
                            style="background:${_MANGA.fitMode === v ? '#c8a96e' : 'none'};border:1px solid ${_MANGA.fitMode === v ? '#c8a96e' : '#2a2a2a'};border-radius:4px;color:${_MANGA.fitMode === v ? '#0a0a0a' : '#666'};font-family:'DM Mono',monospace;font-size:.55rem;padding:3px 8px;cursor:pointer;">${l}</button>`).join('')}
                </div>
            </div>
        </div>

        <div style="font-size:.48rem;color:#333;line-height:1.6;text-align:center;">
            Las imágenes se leen localmente — nunca salen de tu dispositivo 🔒<br>
            Navegación: ← → teclado · click en borde izquierdo/derecho de cada imagen
        </div>

        <div id="manga-load-progress" style="display:none;margin-top:14px;">
            <div style="background:#1a1a1a;border-radius:4px;height:4px;overflow:hidden;margin-bottom:5px;">
                <div id="manga-prog-bar" style="height:100%;width:0%;background:#c8a96e;transition:width .3s;border-radius:4px;"></div>
            </div>
            <div id="manga-prog-label" style="font-size:.5rem;color:#666;text-align:center;">Preparando...</div>
        </div>
    </div>`;

    document.body.appendChild(modal);

    const onKey = (e) => {
        if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

// ─ helpers de configuración ─

window._mangaSetGroup = function (n, btn) {
    _MANGA.groupMode = n;
    localStorage.setItem('manga_group_mode', n);
    document.querySelectorAll('[id^="manga-grp-"]').forEach(b => {
        const a = b === btn;
        b.style.background = a ? '#c8a96e' : 'none';
        b.style.borderColor = a ? '#c8a96e' : '#2a2a2a';
        b.style.color = a ? '#0a0a0a' : '#666';
    });
};

window._mangaSetDir = function (dir, btn) {
    _MANGA.readDir = dir;
    localStorage.setItem('manga_read_dir', dir);
    ['rtl', 'ltr'].forEach(d => {
        const b = document.getElementById('manga-dir-' + d);
        if (!b) return;
        const a = d === dir;
        b.style.background = a ? '#c8a96e' : 'none';
        b.style.borderColor = a ? '#c8a96e' : '#2a2a2a';
        b.style.color = a ? '#0a0a0a' : '#666';
    });
};

window._mangaSetFit = function (mode, btn) {
    _MANGA.fitMode = mode;
    localStorage.setItem('manga_fit_mode', mode);
    ['fit-width', 'fit-height', 'original'].forEach(m => {
        const b = document.getElementById('manga-fit-' + m);
        if (!b) return;
        const a = m === mode;
        b.style.background = a ? '#c8a96e' : 'none';
        b.style.borderColor = a ? '#c8a96e' : '#2a2a2a';
        b.style.color = a ? '#0a0a0a' : '#666';
    });
};

window._mangaDesdeInput = async function (input, tipo) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const progWrap = document.getElementById('manga-load-progress');
    if (progWrap) progWrap.style.display = 'block';
    _mangaProgreso(5, 'Leyendo archivos...');

    let nombre = 'Manga';
    try {
        if (tipo === 'zip') {
            nombre = files[0].name.replace(/\.zip$/i, '');
            await _cargarMangaZip(files[0]);
        } else {
            if (tipo === 'dir' && files[0].webkitRelativePath)
                nombre = files[0].webkitRelativePath.split('/')[0];
            const imgs = files.filter(_esImagen).sort(_ordenarArchivos);
            if (!imgs.length) { mostrarNotificacion('⚠ No se encontraron imágenes'); return; }
            await _procesarImagenes(imgs, nombre);
        }
        document.getElementById('manga-modal-root')?.remove();
    } catch (err) {
        console.error('[manga]', err);
        mostrarNotificacion('❌ Error: ' + err.message);
        _mangaProgreso(0, '❌ ' + err.message);
    } finally {
        input.value = '';
    }
};

// ─────────────────────────────────────────────────────────────────
// CARGA DESDE ZIP
// ─────────────────────────────────────────────────────────────────

async function _cargarMangaZip(zipFile) {
    if (typeof JSZip === 'undefined') {
        _mangaProgreso(10, 'Cargando JSZip...');
        await new Promise((resolve, reject) => {
            if (document.getElementById('jszip-cdn')) { resolve(); return; }
            const s = document.createElement('script');
            s.id = 'jszip-cdn';
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('No se pudo cargar JSZip'));
            document.head.appendChild(s);
        });
    }

    _mangaProgreso(20, 'Descomprimiendo ZIP...');
    const arrayBuffer = await zipFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const imagePaths = [];
    zip.forEach((path, file) => {
        if (!file.dir && _esImagenPath(path)) imagePaths.push({ path, file });
    });
    if (!imagePaths.length) throw new Error('El ZIP no contiene imágenes');

    imagePaths.sort((a, b) => _ordenarStrings(a.path, b.path));
    _mangaProgreso(30, `${imagePaths.length} imágenes encontradas...`);

    const fakeFiles = [];
    for (let i = 0; i < imagePaths.length; i++) {
        const { path, file } = imagePaths[i];
        if (i % 20 === 0) _mangaProgreso(30 + Math.round((i / imagePaths.length) * 40), `Extrayendo ${i + 1}/${imagePaths.length}...`);
        const blob = await file.async('blob');
        const f = new File([blob], path, { type: _mimeDesdeExtension(path) });
        f._displayName = path.split('/').pop();
        fakeFiles.push(f);
    }

    await _procesarImagenes(fakeFiles, zipFile.name.replace(/\.zip$/i, ''), 70);
}

// ─────────────────────────────────────────────────────────────────
// PROCESAMIENTO CENTRAL
// ─────────────────────────────────────────────────────────────────

async function _procesarImagenes(files, nombre, startPct = 30) {
    // Liberar blob URLs previas
    _MANGA.blobUrls.forEach(u => URL.revokeObjectURL(u));
    _MANGA.blobUrls = [];
    _MANGA.paginas = [];
    _MANGA.nombre = nombre;

    // Limpiar entradas manga anteriores
    Object.keys(archivosHTML).forEach(k => {
        if (k.startsWith('__manga_')) delete archivosHTML[k];
    });

    const total = files.length;
    const grupo = Math.max(1, parseInt(_MANGA.groupMode) || 1);
    const capitulos = [];

    _mangaProgreso(startPct, `Preparando ${total} imágenes...`);

    // Crear Blob URLs
    const urls = [];
    for (let i = 0; i < total; i++) {
        urls.push(URL.createObjectURL(files[i]));
        _MANGA.blobUrls.push(urls[urls.length - 1]);
        if (i % 30 === 0) _mangaProgreso(startPct + Math.round(((i + 1) / total) * (88 - startPct)), `Procesando ${i + 1}/${total}...`);
    }

    // Agrupar en capítulos
    for (let g = 0; g < Math.ceil(total / grupo); g++) {
        const inicio = g * grupo;
        const fin = Math.min(inicio + grupo, total);
        const id = '__manga_' + String(g).padStart(5, '0');

        let titulo;
        if (grupo === 1) {
            titulo = (files[inicio]._displayName || files[inicio].name)
                .replace(/\.[^.]+$/, '')
                .replace(/^.*[/\\]/, '');
            if (titulo.length > 60) titulo = titulo.slice(-60);
        } else {
            titulo = 'Páginas ' + (inicio + 1) + '–' + fin;
        }

        // Marcador mínimo en archivosHTML (necesario para que cargarCapitulo lo encuentre)
        archivosHTML[id] = '<!-- manga:' + id + ' -->';

        capitulos.push({ id, title: titulo });

        for (let p = inicio; p < fin; p++) {
            _MANGA.paginas.push({ id, capIndex: g, pageInGroup: p - inicio, url: urls[p], title: titulo });
        }
    }

    _mangaProgreso(95, 'Construyendo índice...');

    // Poblar selector de capítulos
    const selector = document.getElementById('chapters');
    if (!selector) { console.error('[manga] No se encontró #chapters'); return; }
    selector.innerHTML = '';
    capitulos.forEach(cap => {
        const opt = document.createElement('option');
        opt.value = cap.id;
        opt.textContent = cap.title;
        selector.appendChild(opt);
    });

    // Sidebar
    const fileNameEl = document.getElementById('file-name');
    if (fileNameEl) fileNameEl.textContent = nombre + ' (' + total + ' págs · ' + capitulos.length + ' cap.)';

    const chapterSel = document.getElementById('chapter-selector');
    if (chapterSel) chapterSel.style.display = 'block';

    // Indicador en top-bar
    const indicator = document.getElementById('manga-mode-indicator');
    if (indicator) indicator.classList.add('active');

    // Status en sidebar
    const sidebarStatus = document.getElementById('manga-sidebar-status');
    if (sidebarStatus) { sidebarStatus.style.display = 'block'; sidebarStatus.textContent = '✓ ' + nombre + ' · ' + total + ' págs'; }

    // Habilitar botones de exportación
    if (typeof _exportBtns_habilitar === 'function') _exportBtns_habilitar();

    _MANGA.paginaActual = 0;
    _mangaProgreso(100, '¡Listo!');

    // Seleccionar primera opción ANTES de colapsar — colapsarSelectorCapitulos
    // lee selectedIndex para mostrar el texto en el chip
    selector.selectedIndex = 0;

    setTimeout(() => {
        window.cargarCapitulo(capitulos[0].id);
        if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
        _activarNavegacionManga();
        mostrarNotificacion('✓ ' + nombre + ' — ' + total + ' páginas');
    }, 200);
}

// ─────────────────────────────────────────────────────────────────
// NAVEGACIÓN
// ─────────────────────────────────────────────────────────────────

function _irAPaginaManga(idx) {
    if (!_MANGA.paginas.length) return;
    idx = Math.max(0, Math.min(idx, _MANGA.paginas.length - 1));
    _MANGA.paginaActual = idx;
    const { id } = _MANGA.paginas[idx];
    const selector = document.getElementById('chapters');
    if (selector) {
        selector.value = id;
        window.cargarCapitulo(id);
        if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
    }
}

function _mangaSiguiente() {
    const selector = document.getElementById('chapters');
    if (!selector) return;
    const idx = selector.selectedIndex;
    if (idx < selector.options.length - 1) {
        selector.selectedIndex = idx + 1;
        const ruta = selector.options[idx + 1].value;
        window.cargarCapitulo(ruta);
        if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
    }
}

function _mangaAnterior() {
    const selector = document.getElementById('chapters');
    if (!selector) return;
    const idx = selector.selectedIndex;
    if (idx > 0) {
        selector.selectedIndex = idx - 1;
        const ruta = selector.options[idx - 1].value;
        window.cargarCapitulo(ruta);
        if (typeof colapsarSelectorCapitulos === 'function') colapsarSelectorCapitulos();
    }
}

window._mangaClickNavegar = function (event, img) {
    const rect = img.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    const rtl = _MANGA.readDir === 'rtl';

    if (pct < 0.3) { rtl ? _mangaAnterior() : _mangaSiguiente(); }
    else if (pct > 0.7) { rtl ? _mangaSiguiente() : _mangaAnterior(); }
    // zona central: sin acción
};

function _activarNavegacionManga() {
    if (window._mangaKeyHandler) document.removeEventListener('keydown', window._mangaKeyHandler);

    window._mangaKeyHandler = function (e) {
        if (!_MANGA.paginas.length) return;
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
            e.preventDefault();
            _MANGA.readDir === 'rtl' ? _mangaAnterior() : _mangaSiguiente();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            _MANGA.readDir === 'rtl' ? _mangaSiguiente() : _mangaAnterior();
        } else if (e.key === 'Home') { e.preventDefault(); _irAPaginaManga(0); }
        else if (e.key === 'End') { e.preventDefault(); _irAPaginaManga(_MANGA.paginas.length - 1); }
    };
    document.addEventListener('keydown', window._mangaKeyHandler);
}

// ─────────────────────────────────────────────────────────────────
// DROP DE IMÁGENES
// ─────────────────────────────────────────────────────────────────

function _mangaIntentarDropImagen(files) {
    if (!files || !files.length) return false;
    const imgs = Array.from(files).filter(_esImagen);
    if (imgs.length < 2) return false;
    cargarMangaDesdeFiles(files, 'Manga');
    return true;
}

// ─────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────

function _esImagen(file) {
    return file && (/\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(file.name) || (file.type && file.type.startsWith('image/')));
}

function _esImagenPath(path) {
    return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(path);
}

function _mimeDesdeExtension(path) {
    const ext = path.split('.').pop().toLowerCase();
    return {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
        avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff'
    }[ext] || 'image/jpeg';
}

function _ordenarArchivos(a, b) {
    return _ordenarStrings(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name);
}

function _ordenarStrings(a, b) {
    const chunk = /(\d+)|(\D+)/g;
    const partsA = a.match(chunk) || [], partsB = b.match(chunk) || [];
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const pa = partsA[i] || '', pb = partsB[i] || '';
        const na = parseInt(pa, 10), nb = parseInt(pb, 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        const cmp = pa.localeCompare(pb);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

function _mangaProgreso(pct, label) {
    const bar = document.getElementById('manga-prog-bar');
    const lbl = document.getElementById('manga-prog-label');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = label || '';
}

// ─────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────

(function _inyectarEstilosManga() {
    if (document.getElementById('manga-styles')) return;
    const style = document.createElement('style');
    style.id = 'manga-styles';
    style.textContent = `
        /* Quitar padding del reading area cuando hay manga */
        #texto-contenido:has(.manga-chapter-wrap) {
            padding: 0 !important;
            background: #0a0a0a !important;
            max-width: unset !important;
        }

        .manga-chapter-wrap {
            width: 100%;
            background: #0a0a0a;
        }

        .manga-page-img {
            display: block;
            transition: opacity .1s;
            -webkit-user-drag: none;
        }
        .manga-page-img:active { opacity: .85; }

        /* Hint al pie: solo visual via CSS, NO entra en textContent */
        .manga-page-hint::before {
            content: var(--hint-label, '');
            font-family: 'DM Mono', monospace;
            font-size: .5rem;
            color: #333;
        }

        /* Indicador MANGA en top-bar */
        #manga-mode-indicator {
            font-size: .55rem;
            color: #c8a96e;
            font-family: 'DM Mono', monospace;
            letter-spacing: .06em;
            padding: 3px 8px;
            border: 1px solid rgba(200,169,110,.3);
            border-radius: 4px;
            display: none;
            white-space: nowrap;
            flex-shrink: 0;
        }
        #manga-mode-indicator.active { display: inline-block; }
    `;
    document.head.appendChild(style);
})();

// ─────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────

window.abrirLectorManga = abrirLectorManga;
window.cargarMangaDesdeFiles = cargarMangaDesdeFiles;
window._mangaIntentarDropImagen = _mangaIntentarDropImagen;
window._irAPaginaManga = _irAPaginaManga;
window._MANGA = _MANGA;

console.log('[manga.js] ✓ Módulo listo — abrirLectorManga() disponible');