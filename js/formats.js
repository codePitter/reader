// ═══════════════════════════════════════════════════════════════════
// FORMATS — Carga de eBooks en múltiples formatos
// Depende de: main.js (archivosHTML, mostrarNotificacion)
//             epub.js (cargarCapitulo)
// Formatos soportados:
//   .epub   → manejado por epub.js (no duplicado aquí)
//   .txt    → split por capítulos o bloques de texto
//   .html   → HTML único como capítulo único
//   .pdf    → PDF.js (CDN) — extrae texto página a página
//   .fb2    → XML FictionBook 2 — capítulos por <section>
//   .fb3    → FictionBook 3 (ZIP con XML interno)
//   .cbz    → Comic Book ZIP — imágenes secuenciales
//   .cbr    → Comic Book RAR — imágenes (requiere unrar.js CDN)
//   .docx   → Word — extrae texto con mammoth.js (CDN)
//   .rtf    → Rich Text Format — extrae texto limpio
//   .odt    → OpenDocument Text (ZIP con content.xml)
//   .mobi   → MOBI/PRC — extracción básica de texto
//   .azw3   → Kindle Format 8 — extrae HTML interno (KF8) o texto
// ═══════════════════════════════════════════════════════════════════

// ── CDN dinámico: cargar librería solo cuando se necesita ──
const _cdnLoaded = {};
async function _loadScript(id, src) {
    if (_cdnLoaded[id]) return;
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) { _cdnLoaded[id] = true; resolve(); return; }
        const s = document.createElement('script');
        s.id = id; s.src = src;
        s.onload = () => { _cdnLoaded[id] = true; resolve(); };
        s.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
        document.head.appendChild(s);
    });
}

// ── Extensión del archivo ──
function _ext(filename) {
    return filename.split('.').pop().toLowerCase();
}

// ── Poblar selector de capítulos a partir de un array [{title, html}] ──
function _poblarSelector(capitulos, fileName) {
    const selector = document.getElementById('chapters');
    selector.innerHTML = '';
    capitulos.forEach((cap, i) => {
        const opt = document.createElement('option');
        opt.value = cap.id || `__fmt_cap_${i}`;
        opt.textContent = cap.title || `Capítulo ${i + 1}`;
        selector.appendChild(opt);
    });

    // Guardar contenido en archivosHTML (misma estructura que epub.js)
    capitulos.forEach(cap => {
        archivosHTML[cap.id || `__fmt_cap_${capitulos.indexOf(cap)}`] = cap.html;
    });

    window._cargandoProgramaticamente = true;
    selector.selectedIndex = 0;
    window._cargandoProgramaticamente = false;

    document.getElementById('chapter-selector').style.display = 'block';
    document.getElementById('file-name').textContent =
        `${fileName} (${capitulos.length} ${capitulos.length === 1 ? 'sección' : 'capítulos'})`;

    mostrarNotificacion(`✓ Archivo cargado: ${capitulos.length} sección(es)`);
    if (capitulos.length > 0) {
        cargarCapitulo(selector.options[0].value);
    }
}

// ── Escapar HTML básico ──
function _escHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Texto plano → HTML simple ──
function _txtToHtml(texto) {
    const parrafos = texto.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
    return parrafos.map(p => `<p>${_escHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

// ══════════════════════════════════════════
// PARSERS POR FORMATO
// ══════════════════════════════════════════

// ── TXT ──────────────────────────────────
// Detecta capítulos por encabezados comunes; si no hay, parte cada N palabras
async function parseTXT(arrayBuffer) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const texto = decoder.decode(arrayBuffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Patrones de encabezado de capítulo
    const CAP_RE = /^(?:(?:CHAPTER|CAPÍTULO|CAPITULO|CAP\.?|CH\.?|PARTE?|PART)\s*[\d\w]+|#{1,3}\s.+|\d{1,3}[\.\)]\s+\S.{0,60})$/im;
    const lineas = texto.split('\n');
    const cortes = [];

    lineas.forEach((linea, idx) => {
        if (CAP_RE.test(linea.trim()) && linea.trim().length > 0) {
            cortes.push(idx);
        }
    });

    if (cortes.length >= 2) {
        // Hay estructura de capítulos detectada
        const caps = [];
        cortes.forEach((inicio, ci) => {
            const fin = cortes[ci + 1] ?? lineas.length;
            const bloque = lineas.slice(inicio, fin).join('\n').trim();
            if (bloque.length < 20) return;
            caps.push({
                id: `__txt_${ci}`,
                title: lineas[inicio].trim().slice(0, 80) || `Capítulo ${ci + 1}`,
                html: _txtToHtml(bloque)
            });
        });
        if (caps.length > 0) return caps;
    }

    // Sin estructura: dividir cada ~3000 palabras
    const palabras = texto.split(/\s+/);
    const CHUNK = 3000;
    const caps = [];
    for (let i = 0; i < palabras.length; i += CHUNK) {
        const bloque = palabras.slice(i, i + CHUNK).join(' ');
        const num = caps.length + 1;
        caps.push({
            id: `__txt_${num}`,
            title: `Sección ${num}`,
            html: _txtToHtml(bloque)
        });
    }
    return caps.length > 0 ? caps : [{ id: '__txt_0', title: 'Texto', html: _txtToHtml(texto) }];
}

// ── HTML / HTM ────────────────────────────
async function parseHTML(arrayBuffer) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const html = decoder.decode(arrayBuffer);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const titulo = doc.querySelector('title')?.textContent?.trim() || 'Documento';
    return [{ id: '__html_0', title: titulo, html }];
}

// ── FB2 (FictionBook 2 — XML) ──────────────
async function parseFB2(arrayBuffer) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let xml = decoder.decode(arrayBuffer);

    // Algunos FB2 vienen con BOM
    xml = xml.replace(/^\uFEFF/, '');

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
        // Intentar como text/html como fallback
        const doc2 = new DOMParser().parseFromString(xml, 'text/html');
        return [{ id: '__fb2_0', title: 'Documento FB2', html: doc2.body.innerHTML }];
    }

    const sections = doc.querySelectorAll('body > section, body section');
    const caps = [];

    sections.forEach((sec, i) => {
        const titleEl = sec.querySelector(':scope > title');
        const titulo = titleEl?.textContent?.trim().slice(0, 80) || `Sección ${i + 1}`;

        // Convertir elementos FB2 a HTML legible
        let html = '';
        sec.childNodes.forEach(node => {
            if (node.nodeName === 'title') {
                html += `<h2>${_escHtml(node.textContent || '')}</h2>`;
            } else if (node.nodeName === 'p') {
                html += `<p>${_escHtml(node.textContent || '')}</p>`;
            } else if (node.nodeName === 'empty-line') {
                html += '<br>';
            } else if (node.nodeName === 'subtitle') {
                html += `<h3>${_escHtml(node.textContent || '')}</h3>`;
            } else if (node.nodeName === 'poem') {
                html += `<blockquote>${_escHtml(node.textContent || '')}</blockquote>`;
            }
        });

        if (html.trim().length > 0) {
            caps.push({ id: `__fb2_${i}`, title: titulo, html });
        }
    });

    if (caps.length === 0) {
        // FB2 sin secciones — tratar como texto plano
        const body = doc.querySelector('body');
        const texto = body?.textContent || xml;
        return [{ id: '__fb2_0', title: 'Documento FB2', html: _txtToHtml(texto) }];
    }
    return caps;
}

// ── FB3 (FictionBook 3 — ZIP con XML interno) ──
async function parseFB3(arrayBuffer) {
    await _loadScript('jszip-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await JSZip.loadAsync(arrayBuffer);
    // FB3 tiene un body.xml o similar
    let xmlContent = null;
    zip.forEach((path, file) => {
        if (path.match(/body\.xml$/i) || path.match(/\.fb3$/i) || path.match(/^[^/]+\.xml$/i)) {
            if (!xmlContent) xmlContent = file.async('text');
        }
    });
    if (!xmlContent) throw new Error('No se encontró contenido XML en FB3');
    const xml = await xmlContent;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const sections = doc.querySelectorAll('section');
    if (sections.length > 0) {
        const caps = [];
        sections.forEach((sec, i) => {
            const titulo = sec.querySelector('title')?.textContent?.trim().slice(0, 80) || `Sección ${i + 1}`;
            caps.push({ id: `__fb3_${i}`, title: titulo, html: _txtToHtml(sec.textContent || '') });
        });
        return caps;
    }
    return [{ id: '__fb3_0', title: 'Documento FB3', html: _txtToHtml(doc.body?.textContent || xml) }];
}

// ── PDF ───────────────────────────────────
async function parsePDF(arrayBuffer) {
    // Cargar PDF.js desde CDN
    await _loadScript('pdfjs-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');

    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) throw new Error('PDF.js no disponible');

    // Worker
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    // Agrupar páginas en capítulos de ~10 páginas
    const PAGES_PER_CAP = 10;
    const caps = [];

    for (let startPage = 1; startPage <= totalPages; startPage += PAGES_PER_CAP) {
        const endPage = Math.min(startPage + PAGES_PER_CAP - 1, totalPages);
        let html = '';

        for (let p = startPage; p <= endPage; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            html += `<p><em style="color:var(--text-dim);font-size:0.65rem">— Página ${p} —</em></p>`;
            html += _txtToHtml(pageText);
        }

        const capNum = Math.ceil(startPage / PAGES_PER_CAP);
        const label = totalPages <= PAGES_PER_CAP
            ? 'Documento'
            : `Páginas ${startPage}–${endPage}`;

        caps.push({ id: `__pdf_${capNum}`, title: label, html });
    }

    return caps.length > 0 ? caps : [{ id: '__pdf_0', title: 'Documento PDF', html: '<p>No se pudo extraer texto del PDF.</p>' }];
}

// ── DOCX ──────────────────────────────────
async function parseDOCX(arrayBuffer) {
    await _loadScript('mammoth-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');

    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    if (!html || html.trim().length === 0) {
        throw new Error('No se pudo extraer texto del DOCX');
    }

    // Dividir por encabezados h1/h2 para crear capítulos
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = doc.querySelectorAll('h1, h2');

    if (headings.length < 2) {
        // Sin estructura: documento único
        return [{ id: '__docx_0', title: 'Documento', html }];
    }

    const caps = [];
    headings.forEach((h, i) => {
        const titulo = h.textContent.trim().slice(0, 80);
        let capHtml = h.outerHTML;
        let sibling = h.nextElementSibling;
        while (sibling && !['H1', 'H2'].includes(sibling.tagName)) {
            capHtml += sibling.outerHTML;
            sibling = sibling.nextElementSibling;
        }
        if (capHtml.length > 30) {
            caps.push({ id: `__docx_${i}`, title: titulo || `Sección ${i + 1}`, html: capHtml });
        }
    });

    return caps.length > 0 ? caps : [{ id: '__docx_0', title: 'Documento', html }];
}

// ── RTF ───────────────────────────────────
async function parseRTF(arrayBuffer) {
    const decoder = new TextDecoder('latin1', { fatal: false });
    const rtf = decoder.decode(arrayBuffer);

    // Parser RTF básico: eliminar control words y extraer texto
    let texto = rtf
        .replace(/\\([a-z]+)(-?\d*) ?/gi, (m, cmd) => {
            if (cmd === 'par' || cmd === 'line') return '\n';
            if (cmd === 'tab') return '\t';
            return '';
        })
        .replace(/[{}]/g, '')
        .replace(/\\\*/g, '')
        .replace(/\\[^a-z]/gi, '')
        .replace(/\\'([0-9a-f]{2})/gi, (m, hex) => {
            try { return decodeURIComponent('%' + hex); } catch { return ''; }
        })
        .replace(/\r?\n\r?\n+/g, '\n\n')
        .trim();

    // Dividir por capítulos si los hay
    return parseTXT(new TextEncoder().encode(texto).buffer);
}

// ── ODT (OpenDocument Text) ───────────────
async function parseODT(arrayBuffer) {
    await _loadScript('jszip-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('No se encontró content.xml en el ODT');

    const xml = await contentFile.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // Extraer párrafos y encabezados
    const elements = doc.querySelectorAll('text|p, text|h');
    let texto = '';
    elements.forEach(el => {
        const t = el.textContent.trim();
        if (t) texto += t + '\n\n';
    });

    return parseTXT(new TextEncoder().encode(texto).buffer);
}

// ── MOBI / PRC — delega a parseAZW3 (misma estructura PalmDB) ────
async function parseMOBI(arrayBuffer) {
    return parseAZW3(arrayBuffer);
}

// ── AZW3 / KF8 / MOBI ─────────────────────────────────────────────
// Usa foliate-js (la librería de referencia open source) para HuffCDIC.
// foliate-js es el motor detrás del lector GNOME Foliate y es la única
// implementación JS correcta del decompressor HuffCDIC de Amazon.
//
// Estrategia:
//   1. Importar mobi.js de foliate-js vía jsDelivr (ES module dinámico)
//   2. Usar su API para extraer secciones/texto
//   3. Convertir al formato {id, title, html} que usa este lector
//   4. Si el CDN falla → fallback a extracción directa de texto legible

async function parseAZW3(arrayBuffer) {
    // ── Verificar DRM antes de intentar cualquier cosa ────────────
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length > 0x60) {
        const dv = new DataView(arrayBuffer);
        const numRec = dv.getUint16(0x4C, false);
        if (numRec > 0) {
            const rec0off = dv.getUint32(0x4E, false);
            if (rec0off + 14 < bytes.length) {
                const rec0dv = new DataView(arrayBuffer, rec0off);
                const enc = rec0dv.getUint16(12, false);
                if (enc !== 0) throw new Error(
                    'Este archivo tiene DRM de Amazon y no puede leerse.\n' +
                    'Usá Calibre + DeDRM plugin para eliminarlo primero.'
                );
            }
        }
    }

    // ── Intentar con foliate-js (HuffCDIC real) ───────────────────
    try {
        const MOBI_CDN = 'https://cdn.jsdelivr.net/npm/foliate-js@1.0.1/mobi.js';
        const { MOBI } = await import(MOBI_CDN);

        const file = new File([arrayBuffer], 'book.mobi');
        const book = await new MOBI(file).init();

        // Iterar secciones del libro
        const caps = [];
        const count = book.sections?.length ?? 0;

        for (let i = 0; i < count; i++) {
            try {
                const section = await book.sections[i].load?.();
                if (!section) continue;

                // section puede ser un HTMLDocument o un string
                let html = '';
                if (typeof section === 'string') {
                    html = section;
                } else if (section?.documentElement) {
                    // HTMLDocument: serializar body
                    const body = section.querySelector('body, Body');
                    html = body ? body.innerHTML : section.documentElement.innerHTML;
                }

                // Limpiar markup Kindle
                html = html
                    .replace(/<mbp:pagebreak[^>]*\/?>/gi, '')
                    .replace(/<mbp:[^>]+>/gi, '')
                    .replace(/filepos\s*=\s*["']?\d+["']?/gi, '')
                    .trim();

                const texto = html.replace(/<[^>]+>/g, '').trim();
                if (texto.length < 20) continue;

                // Título: primer heading o "Sección N"
                const tmpDoc = new DOMParser().parseFromString(html, 'text/html');
                const titulo = tmpDoc.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 80)
                    || (book.metadata?.title ? `${book.metadata.title} — ${i + 1}` : `Sección ${i + 1}`);

                caps.push({ id: `__mobi_${i}`, title: titulo, html });
            } catch (secErr) {
                console.warn(`[mobi] sección ${i} falló:`, secErr.message);
            }
        }

        if (caps.length > 0) {
            console.log(`[mobi] ✓ foliate-js: ${caps.length} secciones`);
            return caps;
        }
        throw new Error('foliate-js no extrajo contenido');

    } catch (foliateErr) {
        console.warn('[mobi] foliate-js falló:', foliateErr.message, '— usando fallback');
        return _parseMobiFallback(arrayBuffer);
    }
}

// ── Fallback: extracción directa sin foliate-js ────────────────────
// Funciona para MOBI con compresión LZ77 (la más común en archivos viejos)
// Para HuffCDIC muestra mensaje claro indicando que hay que convertir.
function _parseMobiFallback(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);

    try {
        const numRec = dv.getUint16(0x4C, false);
        const offs = [];
        for (let i = 0; i <= numRec; i++)
            offs.push(i < numRec ? dv.getUint32(0x4E + i * 8, false) : bytes.length);

        const getRec = i => bytes.slice(offs[i], Math.min(offs[i + 1], bytes.length));
        const rec0 = getRec(0);
        const r0v = new DataView(rec0.buffer, rec0.byteOffset, rec0.byteLength);
        const comp = r0v.getUint16(0, false);
        const nTxt = r0v.getUint16(8, false);
        const enc = rec0.length > 32 ? (new DataView(rec0.buffer, rec0.byteOffset + 28)).getUint32(0, false) : 65001;
        const decode = enc === 1252 ? new TextDecoder('windows-1252', { fatal: false }) : new TextDecoder('utf-8', { fatal: false });

        if (comp === 17480) throw new Error('HuffCDIC');

        const lz77 = (data) => {
            const out = []; let i = 0;
            while (i < data.length) {
                const c = data[i++];
                if (!c) out.push(0);
                else if (c <= 8) for (let j = 0; j < c && i < data.length; j++) out.push(data[i++]);
                else if (c <= 127) out.push(c);
                else if (c <= 191) {
                    const n = data[i++]; const dist = ((c & 63) << 5) | (n >> 3); const len = (n & 7) + 3;
                    const s = out.length - dist;
                    for (let j = 0; j < len; j++) out.push(s + j >= 0 && s + j < out.length ? out[s + j] : 32);
                } else { out.push(32); out.push(c ^ 128); }
            }
            return new Uint8Array(out);
        };

        let html = '';
        for (let r = 0; r < Math.min(nTxt, 600); r++) {
            const rec = getRec(1 + r);
            const trail = rec[rec.length - 1] & 3;
            const usable = trail ? rec.slice(0, rec.length - trail - 1) : rec;
            html += decode.decode(comp === 2 ? lz77(usable) : usable);
        }

        if (!html.trim()) throw new Error('vacío');

        html = html
            .replace(/<mbp:pagebreak[^>]*\/?>/gi, '\n<!-- pb -->\n')
            .replace(/<mbp:[^>]+>/gi, '')
            .replace(/<guide[\s\S]*?<\/guide>/gi, '')
            .replace(/filepos\s*=\s*["']?\d+["']?/gi, '');

        return _mobiHtmlToChapters(html);

    } catch (e) {
        if (e.message === 'HuffCDIC') {
            throw new Error(
                'Este archivo usa compresión HuffCDIC de Amazon y el CDN de foliate-js no está disponible.\n\n' +
                '✅ Solución: convertí el archivo a EPUB con Calibre (gratuito):\n' +
                '   calibre-ebook.com → Agregar libro → Convertir → formato EPUB'
            );
        }
        throw new Error('No se pudo extraer texto del archivo MOBI/AZW3.');
    }
}

// ── Convertir HTML MOBI a array de capítulos ──────────────────────
function _mobiHtmlToChapters(htmlRaw) {
    if (!/<(?:p|div|body|h[1-6])\b/i.test(htmlRaw))
        return parseTXT(new TextEncoder().encode(htmlRaw).buffer);

    const doc = new DOMParser().parseFromString(htmlRaw, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'));
    if (headings.length >= 2) {
        const caps = [];
        headings.forEach((h, i) => {
            const titulo = h.textContent.trim().slice(0, 80) || `Capítulo ${i + 1}`;
            let html = h.outerHTML, sib = h.nextElementSibling, lim = 0;
            while (sib && lim++ < 400 && !sib.matches('h1,h2,h3')) {
                html += sib.outerHTML; sib = sib.nextElementSibling;
            }
            if (html.replace(/<[^>]+>/g, '').trim().length > 20)
                caps.push({ id: `__mobi_${i}`, title: titulo, html });
        });
        if (caps.length) return caps;
    }

    const partes = htmlRaw.split(/<!-- pb -->/i);
    if (partes.length >= 3) {
        const caps = partes.map((p, i) => {
            const d = new DOMParser().parseFromString(p, 'text/html');
            const txt = d.body?.textContent?.trim() || '';
            if (txt.length < 30) return null;
            const t = d.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 80) || `Sección ${i + 1}`;
            return { id: `__mobi_${i}`, title: t, html: d.body.innerHTML };
        }).filter(Boolean);
        if (caps.length) return caps;
    }

    const texto = doc.body?.textContent?.trim() || '';
    if (texto.length < 50) throw new Error('El archivo no contiene texto extraíble.');
    return parseTXT(new TextEncoder().encode(texto).buffer);
}


async function parseCBZ(arrayBuffer) {
    await _loadScript('jszip-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await JSZip.loadAsync(arrayBuffer);

    const imagenes = [];
    zip.forEach((path, file) => {
        if (path.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i) && !path.includes('__MACOSX')) {
            imagenes.push({ path, file });
        }
    });

    imagenes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

    if (imagenes.length === 0) throw new Error('No se encontraron imágenes en el CBZ');

    // Agrupar páginas de ~10 en 10 como capítulos
    const PAGES_PER_CAP = 10;
    const caps = [];

    for (let i = 0; i < imagenes.length; i += PAGES_PER_CAP) {
        const grupo = imagenes.slice(i, i + PAGES_PER_CAP);
        const htmlParts = await Promise.all(grupo.map(async ({ path, file }) => {
            const blob = await file.async('blob');
            const url = URL.createObjectURL(blob);
            const pageNum = imagenes.indexOf({ path, file }) !== -1
                ? imagenes.findIndex(img => img.path === path) + 1
                : i + grupo.indexOf({ path, file }) + 1;
            return `<div style="text-align:center;margin:12px 0;">
                <img src="${url}" alt="Página ${pageNum}" 
                     style="max-width:100%;max-height:90vh;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.4);">
                <div style="color:var(--text-dim);font-size:0.6rem;margin-top:4px;">${path.split('/').pop()}</div>
            </div>`;
        }));

        const capNum = Math.floor(i / PAGES_PER_CAP) + 1;
        const label = imagenes.length <= PAGES_PER_CAP
            ? 'Cómic'
            : `Páginas ${i + 1}–${Math.min(i + PAGES_PER_CAP, imagenes.length)}`;

        caps.push({ id: `__cbz_${capNum}`, title: label, html: htmlParts.join('\n') });
    }

    return caps;
}

// ── CBR (Comic Book RAR) ──────────────────
// RAR requiere una librería especial; notificar al usuario si no está disponible
async function parseCBR(arrayBuffer) {
    // Intentar con libarchive.js si está disponible
    if (typeof window.Archive !== 'undefined') {
        // libarchive.js API
        const archive = await window.Archive.open(new File([arrayBuffer], 'book.cbr'));
        const entries = await archive.extractFiles();
        const imagenes = Object.entries(entries)
            .filter(([name]) => name.match(/\.(jpg|jpeg|png|gif|webp)$/i))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

        if (imagenes.length === 0) throw new Error('No se encontraron imágenes en el CBR');

        const PAGES_PER_CAP = 10;
        const caps = [];
        for (let i = 0; i < imagenes.length; i += PAGES_PER_CAP) {
            const grupo = imagenes.slice(i, i + PAGES_PER_CAP);
            const htmlParts = grupo.map(([name, data]) => {
                const blob = new Blob([data]);
                const url = URL.createObjectURL(blob);
                return `<div style="text-align:center;margin:12px 0;">
                    <img src="${url}" alt="${name}"
                         style="max-width:100%;max-height:90vh;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.4);">
                </div>`;
            });
            const capNum = Math.floor(i / PAGES_PER_CAP) + 1;
            caps.push({
                id: `__cbr_${capNum}`,
                title: imagenes.length <= PAGES_PER_CAP ? 'Cómic' : `Páginas ${i + 1}–${Math.min(i + PAGES_PER_CAP, imagenes.length)}`,
                html: htmlParts.join('\n')
            });
        }
        return caps;
    }

    // Sin soporte RAR — sugerir conversión
    throw new Error(
        'Los archivos CBR (RAR) requieren conversión previa.\n' +
        'Sugerencia: renombralo a .cbz si el contenido es ZIP, ' +
        'o usa una herramienta como Calibre para convertirlo.'
    );
}

// ══════════════════════════════════════════
// DISPATCHER PRINCIPAL
// ══════════════════════════════════════════

const FORMAT_PARSERS = {
    txt: parseTXT,
    html: parseHTML,
    htm: parseHTML,
    pdf: parsePDF,
    fb2: parseFB2,
    fb3: parseFB3,
    docx: parseDOCX,
    rtf: parseRTF,
    odt: parseODT,
    mobi: parseMOBI,
    prc: parseMOBI,
    azw3: parseAZW3,
    azw: parseAZW3,
    cbz: parseCBZ,
    cbr: parseCBR,
};

const FORMAT_LABELS = {
    txt: 'Texto plano (.txt)',
    html: 'HTML (.html/.htm)',
    htm: 'HTML (.html/.htm)',
    pdf: 'PDF (.pdf)',
    fb2: 'FictionBook 2 (.fb2)',
    fb3: 'FictionBook 3 (.fb3)',
    docx: 'Word (.docx)',
    rtf: 'Rich Text (.rtf)',
    odt: 'OpenDocument (.odt)',
    mobi: 'MOBI (.mobi)',
    prc: 'MOBI/PRC (.prc)',
    azw3: 'Kindle KF8 (.azw3)',
    azw: 'Kindle (.azw)',
    cbz: 'Comic ZIP (.cbz)',
    cbr: 'Comic RAR (.cbr)',
    epub: 'EPUB (.epub)',
};

async function cargarFormatoAlternativo(file) {
    const ext = _ext(file.name);

    if (ext === 'epub') {
        // Delegar a epub.js disparando el evento change artificialmente
        const input = document.getElementById('epub-file');
        if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
        return;
    }

    const parser = FORMAT_PARSERS[ext];
    if (!parser) {
        mostrarNotificacion(`⚠ Formato .${ext} no soportado`);
        return;
    }

    try {
        document.getElementById('file-name').textContent = `Cargando ${FORMAT_LABELS[ext] || ext}...`;

        // Limpiar estado anterior
        if (typeof detenerTTS === 'function') detenerTTS();
        Object.keys(archivosHTML).forEach(k => delete archivosHTML[k]);

        const arrayBuffer = await file.arrayBuffer();
        const capitulos = await parser(arrayBuffer);

        if (!capitulos || capitulos.length === 0) {
            throw new Error('No se encontró contenido en el archivo');
        }

        _poblarSelector(capitulos, file.name);

    } catch (err) {
        console.error(`[formats] Error cargando ${ext}:`, err);
        document.getElementById('file-name').textContent = 'Error al cargar';
        mostrarNotificacion(`⚠ ${err.message || 'Error al cargar el archivo'}`);
    }
}

// ══════════════════════════════════════════
// EXTENSIÓN DEL INPUT EXISTENTE
// ══════════════════════════════════════════
// Escucha el mismo input #epub-file y desvía formatos no-EPUB antes de que
// los maneje el listener de epub.js. Se registra en la fase de captura
// para tener prioridad.

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('epub-file');
    if (!input) return;

    // Ampliar el atributo accept para mostrar todos los formatos en el diálogo
    const allExts = Object.keys(FORMAT_PARSERS).map(e => `.${e}`).join(',');
    input.setAttribute('accept', `.epub,${allExts}`);

    // Capturar el evento antes de que lo maneje epub.js
    input.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const ext = _ext(file.name);
        if (ext !== 'epub') {
            e.stopImmediatePropagation(); // evitar que epub.js lo intente procesar
            await cargarFormatoAlternativo(file);
            // Resetear input para permitir cargar el mismo archivo dos veces
            this.value = '';
        }
        // Si es epub, epub.js lo maneja normalmente
    }, true); // true = fase de captura (ejecuta antes que epub.js)
});

// ══════════════════════════════════════════
// SOPORTE DE DRAG & DROP (opcional)
// Se activa si hay un elemento #drop-zone en el HTML
// ══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone') || document.body;

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', e => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-active');
        }
    });

    dropZone.addEventListener('drop', async e => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const ext = _ext(file.name);
        if (!FORMAT_PARSERS[ext] && ext !== 'epub') {
            mostrarNotificacion(`⚠ Formato .${ext} no soportado. Formatos aceptados: epub, ${Object.keys(FORMAT_PARSERS).join(', ')}`);
            return;
        }
        await cargarFormatoAlternativo(file);
    });
});

// ══════════════════════════════════════════
// EXPORTAR PARA USO EXTERNO (opcional)
// ══════════════════════════════════════════
window.cargarFormatoAlternativo = cargarFormatoAlternativo;
window.FORMAT_PARSERS = FORMAT_PARSERS;
window.FORMAT_LABELS = FORMAT_LABELS;