// ═══════════════════════════════════════════════════════════════════
// COMIC_READER.JS — Estado, renderizado de capítulos, navegación,
//                   teclado, progreso
// Depende de: comic_ui.js (notify, renderSidebar, updateStats,
//                          updateSidebarActive, syncThumbs,
//                          buildThumbnails, showLoader,
//                          updateLoadProgress)
// Se carga DESPUÉS de comic_loader.js y comic_ui.js
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL (compartido con loader y ui)
// ═══════════════════════════════════════════════════════

const S = {
    chapters:      [],      // [{id, title, pages:[{url, name}]}]
    currentChapter: -1,
    fitMode:    localStorage.getItem('mg_fit')      || 'fit-width',
    readDir:    localStorage.getItem('mg_dir')      || 'ltr',
    gap:    parseInt(localStorage.getItem('mg_gap') || '2'),
    bgColor:    localStorage.getItem('mg_bg')       || '#050505',
    clickNav:   localStorage.getItem('mg_clicknav') !== 'false',
    sidebarOpen: localStorage.getItem('mg_sidebar') !== 'false',
    thumbsOpen:  false,
    settingsOpen: false,
    blobUrls:    [],
    totalPages:  0,
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    applyFit(S.fitMode, false);
    applyDir(S.readDir, false);
    applyGap(S.gap, false);
    applyBg(S.bgColor, false);

    if (!S.sidebarOpen) {
        document.getElementById('sidebar').classList.add('collapsed');
        document.getElementById('sidebar-toggle-btn').classList.remove('active');
    }

    updateProgress();
    setupDrop();       // comic_loader.js
    setupKeyboard();
    setupFileInputs(); // comic_loader.js
    updateDirectionButtons();
});

// ═══════════════════════════════════════════════════════
// MONTAR CAPÍTULOS (llamado por comic_loader.js)
// ═══════════════════════════════════════════════════════

async function mountChapters(chapters, name) {
    S.chapters   = chapters;
    S.totalPages = chapters.reduce((s, c) => s + c.pages.length, 0);

    renderSidebar();
    updateStats();

    const titleEl = document.getElementById('topbar-title');
    titleEl.textContent = name;
    titleEl.title       = name;

    document.getElementById('drop-zone').style.display       = 'none';
    document.getElementById('pages-container').style.display = 'flex';

    if (chapters.length > 0) await loadChapter(0);

    buildThumbnails();
    notify(`✓ ${name} — ${chapters.length} cap., ${S.totalPages} págs.`);
}

// ═══════════════════════════════════════════════════════
// RENDERIZADO DE CAPÍTULO
// ═══════════════════════════════════════════════════════

async function loadChapter(idx) {
    if (idx < 0 || idx >= S.chapters.length) return;
    S.currentChapter = idx;

    const ch        = S.chapters[idx];
    const container = document.getElementById('pages-container');
    const scrollArea = document.getElementById('scroll-area');

    container.innerHTML   = '';
    container.style.gap     = S.gap + 'px';
    container.style.padding = S.gap + 'px 0';
    scrollArea.scrollTop  = 0;

    ch.pages.forEach((page, i) => {
        const wrap = document.createElement('div');
        wrap.className          = 'page-wrapper';
        wrap.dataset.pageIndex  = i;

        const img      = document.createElement('img');
        img.src         = page.url;
        img.alt         = `Página ${i + 1}`;
        img.loading     = i < 3 ? 'eager' : 'lazy';
        img.decoding    = 'async';

        if (S.clickNav) {
            img.style.cursor = 'pointer';
            img.addEventListener('click', e => handlePageClick(e, img));
        }

        img.addEventListener('error', () => {
            img.style.minHeight  = '120px';
            img.style.background = 'var(--bg2)';
            img.style.border     = '2px dashed var(--border2)';
        });

        const badge         = document.createElement('div');
        badge.className     = 'page-num-overlay';
        badge.textContent   = i + 1;

        wrap.appendChild(img);
        wrap.appendChild(badge);
        container.appendChild(wrap);
    });

    updateSidebarActive();
    updateNavButtons();
    updateProgress();
    updatePageInfo();
    updateStats();

    // Precargar primer imagen del siguiente capítulo
    if (idx + 1 < S.chapters.length) {
        const next = S.chapters[idx + 1];
        if (next.pages.length) {
            const pre = new Image();
            pre.src   = next.pages[0].url;
        }
    }

    syncThumbs();
}

// ─── Click en zona izquierda / derecha de imagen ──────────────────

function handlePageClick(e, img) {
    const rect  = img.getBoundingClientRect();
    const pct   = (e.clientX - rect.left) / rect.width;
    const isRTL = S.readDir === 'rtl';

    if (pct < 0.3)      { isRTL ? nextChapter() : prevChapter(); }
    else if (pct > 0.7) { isRTL ? prevChapter() : nextChapter(); }
    // zona central → sin acción
}

// ═══════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════

function prevChapter() {
    if (S.currentChapter > 0) loadChapter(S.currentChapter - 1);
}

function nextChapter() {
    if (S.currentChapter < S.chapters.length - 1) loadChapter(S.currentChapter + 1);
}

function jumpToChapter(idx) {
    idx = parseInt(idx);
    if (isNaN(idx)) return;
    loadChapter(Math.max(0, Math.min(idx, S.chapters.length - 1)));
}

function scrollPage(dir) {
    const area = document.getElementById('scroll-area');
    area.scrollBy({ top: dir * area.clientHeight * 0.9, behavior: 'smooth' });
}

// ─── Progreso ─────────────────────────────────────────────────────

function updateProgress() {
    const fill  = document.getElementById('subnav-progress-fill');
    const thumb = document.getElementById('subnav-progress-thumb');
    if (!S.chapters.length) {
        fill.style.width  = '0%';
        thumb.style.left  = '0%';
        return;
    }
    const pct = S.chapters.length > 1
        ? (S.currentChapter / (S.chapters.length - 1)) * 100 : 0;
    fill.style.width  = pct + '%';
    thumb.style.left  = pct + '%';
}

function seekProgress(e) {
    if (!S.chapters.length) return;
    const bar  = document.getElementById('subnav-progress');
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    loadChapter(Math.round(pct * (S.chapters.length - 1)));
}

function updateNavButtons() {
    document.getElementById('btn-prev').disabled      = S.currentChapter <= 0;
    document.getElementById('btn-next').disabled      = S.currentChapter >= S.chapters.length - 1;
    document.getElementById('btn-prev-page').disabled = S.chapters.length === 0;
    document.getElementById('btn-next-page').disabled = S.chapters.length === 0;

    const inp = document.getElementById('page-jump-input');
    inp.value = S.currentChapter + 1;
    inp.max   = S.chapters.length;
    document.getElementById('page-jump-total').textContent = '/ ' + S.chapters.length;
}

function updatePageInfo() {
    const el = document.getElementById('topbar-page-info');
    if (S.currentChapter < 0 || !S.chapters.length) {
        el.textContent = '—';
        return;
    }
    const ch = S.chapters[S.currentChapter];
    el.textContent = `Cap. ${S.currentChapter + 1} / ${S.chapters.length} · ${ch.pages.length} págs.`;
}

// ═══════════════════════════════════════════════════════
// CONFIGURACIÓN (fit, dir, gap, bg, clickNav)
// ═══════════════════════════════════════════════════════

function setFit(mode)  { applyFit(mode, true); }
function setDir(dir)   { applyDir(dir, true); }
function setGap(val)   { applyGap(parseInt(val), true); }
function setBg(color)  { applyBg(color, true); }

function applyFit(mode, save) {
    ['fit-width', 'fit-height', 'fit-original', 'fit-double']
        .forEach(m => document.body.classList.remove(m));
    document.body.classList.add(mode);
    S.fitMode = mode;
    if (save) localStorage.setItem('mg_fit', mode);

    // Actualizar botones del panel
    ['fit-width-btn', 'fit-height-btn', 'fit-original-btn', 'fit-double-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', id === mode + '-btn');
    });
}

function applyDir(dir, save) {
    S.readDir = dir;
    document.body.classList.toggle('dir-rtl', dir === 'rtl');
    const cont = document.getElementById('pages-container');
    if (cont) cont.style.direction = dir;
    if (save) localStorage.setItem('mg_dir', dir);
    updateDirectionButtons();
}

function updateDirectionButtons() {
    const rtlBtn = document.getElementById('dir-rtl-btn');
    const ltrBtn = document.getElementById('dir-ltr-btn');
    if (rtlBtn) rtlBtn.classList.toggle('active', S.readDir === 'rtl');
    if (ltrBtn) ltrBtn.classList.toggle('active', S.readDir === 'ltr');
}

function applyGap(val, save) {
    S.gap = val;
    const valEl = document.getElementById('gap-val');
    const slider = document.getElementById('gap-slider');
    if (valEl)  valEl.textContent = val + 'px';
    if (slider) slider.value = val;
    const cont = document.getElementById('pages-container');
    if (cont) {
        cont.style.gap     = val + 'px';
        cont.style.padding = val + 'px 0';
    }
    if (save) localStorage.setItem('mg_gap', val);
}

function applyBg(color, save) {
    S.bgColor = color;
    const area = document.getElementById('scroll-area');
    if (area) area.style.background = color;
    if (save) localStorage.setItem('mg_bg', color);
}

function setClickNav(on) {
    S.clickNav = on;
    localStorage.setItem('mg_clicknav', on);
    const onBtn  = document.getElementById('click-nav-on');
    const offBtn = document.getElementById('click-nav-off');
    if (onBtn)  onBtn.classList.toggle('active', on);
    if (offBtn) offBtn.classList.toggle('active', !on);
    // Rerenderizar capítulo actual para aplicar/quitar listeners
    if (S.currentChapter >= 0) loadChapter(S.currentChapter);
}

// ═══════════════════════════════════════════════════════
// FULLSCREEN
// ═══════════════════════════════════════════════════════

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        document.body.classList.add('fullscreen');
    } else {
        document.exitFullscreen().catch(() => {});
        document.body.classList.remove('fullscreen');
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('fullscreen');
});

// ═══════════════════════════════════════════════════════
// TECLADO
// ═══════════════════════════════════════════════════════

function setupKeyboard() {
    document.addEventListener('keydown', e => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        const isRTL = S.readDir === 'rtl';

        switch (e.key) {
            case 'ArrowRight':
            case 'PageDown':
                e.preventDefault();
                isRTL ? prevChapter() : nextChapter();
                break;
            case 'ArrowLeft':
            case 'PageUp':
                e.preventDefault();
                isRTL ? nextChapter() : prevChapter();
                break;
            case 'ArrowDown':
            case ' ':
                e.preventDefault();
                scrollPage(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                scrollPage(-1);
                break;
            case 'Home':
                e.preventDefault();
                loadChapter(0);
                break;
            case 'End':
                e.preventDefault();
                loadChapter(S.chapters.length - 1);
                break;
            case 'f': case 'F':
                toggleFullscreen();
                break;
            case 's': case 'S':
                toggleSidebar();
                break;
            case 't': case 'T':
                toggleThumbs();
                break;
            case 'p': case 'P':
                toggleSettings();
                break;
            case '+': case '=':
                setFit(S.fitMode === 'fit-width' ? 'fit-original' : 'fit-width');
                break;
        }
    });
}

console.log('[comic_reader.js] ✓ listo');
