// ═══════════════════════════════════════════════════════════════════
// COMIC_UI.JS — Sidebar, miniaturas, panel de ajustes,
//               notificaciones, overlay de carga
// Depende de: comic_reader.js (S, loadChapter)
// Carga DESPUÉS de comic_reader.js
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════

function renderSidebar() {
    const list = document.getElementById('chapter-list');
    list.innerHTML = '';

    S.chapters.forEach((ch, i) => {
        const item = document.createElement('div');
        item.className  = 'ch-item' + (i === S.currentChapter ? ' active' : '');
        item.dataset.idx = i;
        item.innerHTML  = `
            <span class="ch-item-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="ch-item-label" title="${escH(ch.title)}">${escH(ch.title)}</span>
            <span class="ch-item-count">${ch.pages.length}p</span>
        `;
        item.addEventListener('click', () => loadChapter(i));
        list.appendChild(item);
    });
}

function updateSidebarActive() {
    document.querySelectorAll('.ch-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.idx) === S.currentChapter);
    });
    const active = document.querySelector('.ch-item.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function filterChapters(q) {
    q = q.toLowerCase().trim();
    document.querySelectorAll('.ch-item').forEach(el => {
        const label = el.querySelector('.ch-item-label')?.textContent.toLowerCase() || '';
        el.style.display = (!q || label.includes(q)) ? '' : 'none';
    });
}

function updateStats() {
    const elCh  = document.getElementById('stat-chapters');
    const elPg  = document.getElementById('stat-pages');
    const elCur = document.getElementById('stat-cur');
    if (elCh)  elCh.textContent  = S.chapters.length;
    if (elPg)  elPg.textContent  = S.totalPages;
    if (elCur) elCur.textContent = S.currentChapter >= 0
        ? `${S.currentChapter + 1} / ${S.chapters.length}` : '—';
}

function toggleSidebar() {
    const sb  = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle-btn');
    S.sidebarOpen = !S.sidebarOpen;
    sb.classList.toggle('collapsed', !S.sidebarOpen);
    btn.classList.toggle('active', S.sidebarOpen);
    localStorage.setItem('mg_sidebar', S.sidebarOpen);
}

// ═══════════════════════════════════════════════════════
// MINIATURAS
// ═══════════════════════════════════════════════════════

function buildThumbnails() {
    const strip = document.getElementById('thumb-strip');
    strip.innerHTML = '';

    S.chapters.forEach((ch, i) => {
        if (!ch.pages.length) return;

        const thumb = document.createElement('div');
        thumb.className  = 'thumb' + (i === S.currentChapter ? ' active' : '');
        thumb.dataset.idx = i;

        const img    = document.createElement('img');
        img.src      = ch.pages[0].url;
        img.alt      = ch.title;
        img.loading  = 'lazy';
        img.title    = ch.title;

        thumb.appendChild(img);
        thumb.addEventListener('click', () => loadChapter(i));
        strip.appendChild(thumb);
    });
}

function syncThumbs() {
    document.querySelectorAll('.thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.idx) === S.currentChapter);
    });
    const active = document.querySelector('.thumb.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function toggleThumbs() {
    S.thumbsOpen = !S.thumbsOpen;
    document.getElementById('thumb-strip').classList.toggle('open', S.thumbsOpen);
    document.getElementById('thumb-toggle-btn').classList.toggle('active', S.thumbsOpen);
}

// ═══════════════════════════════════════════════════════
// PANEL DE AJUSTES
// ═══════════════════════════════════════════════════════

function toggleSettings() {
    S.settingsOpen = !S.settingsOpen;
    document.getElementById('settings-panel').classList.toggle('open', S.settingsOpen);
    document.getElementById('settings-toggle-btn').classList.toggle('active', S.settingsOpen);
}

// ═══════════════════════════════════════════════════════
// OVERLAY DE CARGA
// ═══════════════════════════════════════════════════════

function showLoader(show) {
    const overlay = document.getElementById('loading-overlay');
    const wrap    = document.getElementById('load-progress-wrap');
    overlay.classList.toggle('show', show);
    wrap.classList.toggle('show', show);
    if (!show) {
        document.getElementById('load-progress-bar').style.width = '0%';
        document.getElementById('load-progress-label').textContent = 'Cargando…';
    }
}

function updateLoadProgress(pct, label) {
    const bar = document.getElementById('load-progress-bar');
    const lbl = document.getElementById('load-progress-label');
    if (bar) bar.style.width    = pct + '%';
    if (lbl) lbl.textContent    = label;
}

// ═══════════════════════════════════════════════════════
// NOTIFICACIONES
// ═══════════════════════════════════════════════════════

let _notifTimer = null;

function notify(msg) {
    const el = document.getElementById('notif');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_notifTimer);
    _notifTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function escH(s) {
    return String(s)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;');
}

console.log('[comic_ui.js] ✓ listo');
