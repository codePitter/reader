// ═══════════════════════════════════════════════════════════════════
// COMIC_LOADER.JS — Carga de archivos, ZIP/CBZ, blobs
// Depende de: comic_reader.js (S, mountChapters, showLoader, updateLoadProgress)
//             comic_ui.js (notify)
// Carga ANTES de comic_reader.js y comic_ui.js
// ═══════════════════════════════════════════════════════════════════

// ─── HELPERS ────────────────────────────────────────────────────────

function isImage(name) {
    return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(name);
}

function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function releaseBlobs() {
    S.blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) { } });
    S.blobUrls = [];
}

// ─── SETUP INPUTS ───────────────────────────────────────────────────

function setupFileInputs() {
    document.getElementById('file-input').addEventListener('change', e => loadFiles(e.target.files));
    document.getElementById('dir-input').addEventListener('change',  e => loadFiles(e.target.files));
    document.getElementById('zip-input').addEventListener('change',  e => loadZip(e.target.files[0]));
}

function openFiles() { document.getElementById('file-input').click(); }
function openDir()   { document.getElementById('dir-input').click(); }
function openZip()   { document.getElementById('zip-input').click(); }

// ─── CARGAR IMÁGENES SUELTAS / CARPETA ──────────────────────────────

async function loadFiles(fileList) {
    if (!fileList || !fileList.length) return;

    const imgs = Array.from(fileList).filter(f => isImage(f.name));
    if (!imgs.length) { notify('⚠ No se encontraron imágenes'); return; }

    showLoader(true);
    releaseBlobs();

    // Agrupar por carpeta → capítulos
    const groups = {};
    imgs.forEach(f => {
        const parts = (f.webkitRelativePath || f.name).split('/');
        const folder = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '— Sin título';
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(f);
    });

    const sortedGroups = Object.entries(groups).sort(([a], [b]) => naturalSort(a, b));
    const chapters = [];

    for (let i = 0; i < sortedGroups.length; i++) {
        const [title, files] = sortedGroups[i];
        const sorted = files.sort((a, b) => naturalSort(
            a.webkitRelativePath || a.name,
            b.webkitRelativePath || b.name
        ));
        const pages = sorted.map(f => {
            const url = URL.createObjectURL(f);
            S.blobUrls.push(url);
            return { url, name: f.name };
        });
        chapters.push({ id: 'ch_' + i, title, pages });
        updateLoadProgress(
            Math.round((i + 1) / sortedGroups.length * 100),
            `Procesando capítulo ${i + 1}…`
        );
    }

    const nombre = imgs[0]?.webkitRelativePath?.split('/')[0] || 'Manga';
    await mountChapters(chapters, nombre);
    showLoader(false);
}

// ─── CARGAR ZIP / CBZ ───────────────────────────────────────────────

async function loadZip(file) {
    if (!file) return;

    if (typeof JSZip === 'undefined') {
        notify('❌ JSZip no disponible');
        return;
    }

    showLoader(true);
    releaseBlobs();

    try {
        const data = await file.arrayBuffer();
        const zip  = await JSZip.loadAsync(data);

        const entries = Object.values(zip.files)
            .filter(f => !f.dir && isImage(f.name))
            .sort((a, b) => naturalSort(a.name, b.name));

        if (!entries.length) {
            notify('⚠ ZIP sin imágenes');
            showLoader(false);
            return;
        }

        // Agrupar por carpeta
        const groups = {};
        entries.forEach(f => {
            const parts  = f.name.split('/');
            const folder = parts.length > 2  ? parts.slice(0, -1).join(' / ')
                         : parts.length === 2 ? parts[0]
                         : '— Sin capítulo —';
            if (!groups[folder]) groups[folder] = [];
            groups[folder].push(f);
        });

        const sortedGroups = Object.entries(groups).sort(([a], [b]) => naturalSort(a, b));
        const chapters = [];

        const MIME = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
            bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
        };

        for (let i = 0; i < sortedGroups.length; i++) {
            const [title, files] = sortedGroups[i];
            updateLoadProgress(
                Math.round(i / sortedGroups.length * 100),
                `Extrayendo ${title}…`
            );

            const pages = [];
            for (const f of files) {
                const blob  = await f.async('blob');
                const ext   = f.name.split('.').pop().toLowerCase();
                const typed = new Blob([blob], { type: MIME[ext] || 'image/jpeg' });
                const url   = URL.createObjectURL(typed);
                S.blobUrls.push(url);
                pages.push({ url, name: f.name.split('/').pop() });
            }

            if (pages.length) chapters.push({ id: 'ch_' + i, title, pages });
        }

        const nombre = file.name.replace(/\.(zip|cbz|cbr)$/i, '');
        await mountChapters(chapters, nombre);

    } catch (err) {
        console.error('[comic_loader] ZIP error:', err);
        notify('❌ Error al leer el ZIP: ' + err.message);
    }

    showLoader(false);
}

// ─── DRAG & DROP ────────────────────────────────────────────────────

function setupDrop() {
    document.addEventListener('dragover', e => {
        e.preventDefault();
        document.body.classList.add('drag-over');
    });

    document.addEventListener('dragleave', e => {
        if (!e.relatedTarget || !document.body.contains(e.relatedTarget))
            document.body.classList.remove('drag-over');
    });

    document.addEventListener('drop', async e => {
        e.preventDefault();
        document.body.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (!files.length) return;

        const zips = Array.from(files).filter(f => /\.(zip|cbz|cbr)$/i.test(f.name));
        if (zips.length)  { loadZip(zips[0]); return; }

        const imgs = Array.from(files).filter(f => isImage(f.name));
        if (imgs.length)  { loadFiles(files); return; }

        notify('⚠ Formato no soportado');
    });
}

console.log('[comic_loader.js] ✓ listo');
