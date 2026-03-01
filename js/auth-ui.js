// ═══════════════════════════════════════
// AUTH UI — Modal de login y widget de usuario en top bar
// Depende de: auth.js (loginConGoogle, cerrarSesion, etc.)
// Debe cargarse DESPUÉS de auth.js
// ═══════════════════════════════════════

// ─── INYECCIÓN DE HTML ───
// Se inyecta al cargar el DOM para no modificar index.html manualmente
// (solo requiere agregar el <script> al final de index.html)

document.addEventListener('DOMContentLoaded', function () {
    _inyectarModalAuth();
    _inyectarBotonUsuario();
    _inyectarEstilosAuth();

    // Escuchar evento de auth listo para actualizar UI inicial
    document.addEventListener('auth:ready', (e) => {
        actualizarAuthUI(e.detail.user);
    });

    // Si auth ya estaba listo antes de que este listener se registrara,
    // actualizar igualmente (race condition segura)
    if (typeof _authReady !== 'undefined' && _authReady) {
        actualizarAuthUI(typeof _authUser !== 'undefined' ? _authUser : null);
    }
});

// ─── MODAL DE LOGIN ───

function _inyectarModalAuth() {
    const modal = document.createElement('div');
    modal.id = 'modal-auth';
    modal.className = 'auth-modal-overlay';
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Iniciar sesión');
    modal.style.display = 'none';

    modal.innerHTML = `
        <div class="auth-modal-box">
            <button class="auth-modal-close" onclick="cerrarModalAuth()" title="Cerrar">✕</button>

            <div class="auth-modal-logo">📚</div>
            <h2 class="auth-modal-title">TotalReader</h2>
            <p class="auth-modal-subtitle">Guardá tu configuración y accedé desde cualquier dispositivo</p>

            <div class="auth-modal-divider"></div>

            <button class="auth-btn-google" onclick="loginConGoogle()">
                <svg class="auth-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar con Google
            </button>

            <p class="auth-modal-skip">
                <button class="auth-skip-btn" onclick="cerrarModalAuth()">
                    Continuar sin cuenta →
                </button>
            </p>

            <p class="auth-modal-note">
                Tus archivos nunca se suben a ningún servidor.<br>
                Solo se guarda tu configuración.
            </p>
        </div>
    `;

    // Cerrar al hacer clic en el overlay (fuera del box)
    modal.addEventListener('click', function (e) {
        if (e.target === modal) cerrarModalAuth();
    });

    document.body.appendChild(modal);
}

// ─── BOTÓN DE USUARIO EN TOP BAR ───

function _inyectarBotonUsuario() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'auth-user-widget';
    wrapper.className = 'auth-user-widget';

    wrapper.innerHTML = `
        <button
            id="auth-user-btn"
            class="auth-user-btn"
            onclick="_toggleAuthMenu()"
            title="Cuenta de usuario"
        >
            <span id="auth-user-avatar-wrap">
                <span id="auth-user-initials" class="auth-initials"></span>
                <img id="auth-user-avatar" class="auth-avatar" src="" alt="" style="display:none" />
            </span>
            <span id="auth-user-name" class="auth-user-name"></span>
        </button>

        <div id="auth-user-menu" class="auth-user-menu" style="display:none">
            <div id="auth-menu-info" class="auth-menu-info" style="display:none">
                <span id="auth-menu-email" class="auth-menu-email"></span>
            </div>
            <div class="auth-menu-divider"></div>
            <button class="auth-menu-item auth-menu-item--danger" onclick="cerrarSesion()">
                Cerrar sesión
            </button>
        </div>
    `;

    // Insertar al inicio de la top bar, después del h1
    const h1 = topBar.querySelector('h1');
    if (h1 && h1.nextSibling) {
        topBar.insertBefore(wrapper, h1.nextSibling);
    } else {
        topBar.appendChild(wrapper);
    }

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', function (e) {
        if (!wrapper.contains(e.target)) {
            const menu = document.getElementById('auth-user-menu');
            if (menu) menu.style.display = 'none';
        }
    });
}

// ─── ESTILOS ───

function _inyectarEstilosAuth() {
    const style = document.createElement('style');
    style.id = 'auth-styles';
    style.textContent = `
        /* ── MODAL OVERLAY ── */
        .auth-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(10, 9, 8, 0.82);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            display: flex;
            align-items: center;
            justify-content: center;
            animation: authFadeIn 0.2s ease;
        }

        @keyframes authFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        /* ── MODAL BOX ── */
        .auth-modal-box {
            position: relative;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 40px 36px 32px;
            width: 100%;
            max-width: 380px;
            text-align: center;
            box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,169,110,0.06);
            animation: authSlideUp 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes authSlideUp {
            from { transform: translateY(16px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        .auth-modal-close {
            position: absolute;
            top: 14px;
            right: 16px;
            background: none;
            border: none;
            color: var(--text-dim);
            font-size: 0.9rem;
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            transition: color 0.15s;
            font-family: 'DM Mono', monospace;
        }
        .auth-modal-close:hover { color: var(--text); }

        .auth-modal-logo {
            font-size: 2.4rem;
            line-height: 1;
            margin-bottom: 10px;
        }

        .auth-modal-title {
            font-family: 'Lora', serif;
            font-size: 1.35rem;
            font-weight: 600;
            color: var(--accent);
            margin: 0 0 8px;
            letter-spacing: -0.01em;
        }

        .auth-modal-subtitle {
            font-size: 0.7rem;
            color: var(--text-muted);
            margin: 0 0 22px;
            line-height: 1.5;
            font-family: 'DM Mono', monospace;
        }

        .auth-modal-divider {
            height: 1px;
            background: var(--border);
            margin: 0 0 22px;
        }

        /* ── BOTÓN GOOGLE ── */
        .auth-btn-google {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 11px 16px;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-family: 'DM Mono', monospace;
            font-size: 0.72rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .auth-btn-google:hover {
            border-color: var(--accent);
            background: rgba(200,169,110,0.07);
            transform: translateY(-1px);
        }
        .auth-btn-google:active { transform: translateY(0); }

        .auth-google-icon {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        /* ── SKIP ── */
        .auth-modal-skip {
            margin: 16px 0 0;
        }
        .auth-skip-btn {
            background: none;
            border: none;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            font-size: 0.62rem;
            cursor: pointer;
            letter-spacing: 0.03em;
            transition: color 0.15s;
            padding: 4px 0;
        }
        .auth-skip-btn:hover { color: var(--text-muted); }

        .auth-modal-note {
            margin: 20px 0 0;
            font-size: 0.59rem;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            line-height: 1.6;
            padding-top: 16px;
            border-top: 1px solid var(--border);
        }

        /* ── WIDGET DE USUARIO EN TOP BAR ── */
        .auth-user-widget {
            position: relative;
            margin-left: 4px;
        }

        .auth-user-btn {
            display: flex;
            align-items: center;
            gap: 7px;
            background: none;
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 4px 10px 4px 5px;
            color: var(--text-muted);
            font-family: 'DM Mono', monospace;
            font-size: 0.62rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
            height: 28px;
            white-space: nowrap;
        }
        .auth-user-btn:hover {
            border-color: var(--accent);
            color: var(--accent);
            background: rgba(200,169,110,0.06);
        }

        /* Avatar / iniciales */
        .auth-initials {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--accent);
            color: var(--bg);
            font-size: 0.55rem;
            font-weight: 700;
            font-family: 'DM Mono', monospace;
            letter-spacing: 0;
            flex-shrink: 0;
        }
        .auth-avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
        }

        /* ── MENÚ DESPLEGABLE DE USUARIO ── */
        .auth-user-menu {
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            min-width: 180px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            overflow: hidden;
            animation: authFadeIn 0.15s ease;
            z-index: 1000;
        }

        .auth-menu-info {
            padding: 10px 14px 8px;
        }
        .auth-menu-email {
            display: block;
            font-size: 0.6rem;
            color: var(--text-dim);
            font-family: 'DM Mono', monospace;
            word-break: break-all;
        }
        .auth-menu-divider {
            height: 1px;
            background: var(--border);
        }
        .auth-menu-item {
            display: block;
            width: 100%;
            padding: 9px 14px;
            background: none;
            border: none;
            text-align: left;
            font-family: 'DM Mono', monospace;
            font-size: 0.63rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
            color: var(--text-muted);
        }
        .auth-menu-item:hover { background: var(--surface2); color: var(--text); }
        .auth-menu-item--danger:hover { color: #e07070; }

        /* ── ESTADO: SIN SESIÓN (botón login) ── */
        .auth-user-btn--guest .auth-initials {
            background: var(--surface2);
            color: var(--text-dim);
            border: 1px solid var(--border);
        }
    `;
    document.head.appendChild(style);
}

// ─── ACTUALIZAR UI SEGÚN ESTADO DE AUTH ───

function actualizarAuthUI(user) {
    const btn = document.getElementById('auth-user-btn');
    const nameEl = document.getElementById('auth-user-name');
    const initialsEl = document.getElementById('auth-user-initials');
    const avatarEl = document.getElementById('auth-user-avatar');
    const menuInfo = document.getElementById('auth-menu-info');
    const emailEl = document.getElementById('auth-menu-email');

    if (!btn) return;

    if (user) {
        // ── Autenticado ──
        const name = getUserDisplayName();
        const avatarUrl = getUserAvatarUrl();
        const initials = _getInitials(name);

        btn.classList.remove('auth-user-btn--guest');
        btn.title = name;

        if (nameEl) nameEl.textContent = name;

        // Avatar o iniciales
        if (avatarUrl && avatarEl) {
            avatarEl.src = avatarUrl;
            avatarEl.style.display = 'block';
            if (initialsEl) initialsEl.style.display = 'none';
        } else {
            if (avatarEl) avatarEl.style.display = 'none';
            if (initialsEl) {
                initialsEl.style.display = 'flex';
                initialsEl.textContent = initials;
            }
        }

        // Email en el menú
        if (menuInfo) menuInfo.style.display = 'block';
        if (emailEl) emailEl.textContent = user.email || '';

    } else {
        // ── No autenticado (modo anónimo) ──
        btn.classList.add('auth-user-btn--guest');
        btn.title = 'Iniciar sesión';
        btn.onclick = abrirModalAuth;

        if (nameEl) nameEl.textContent = 'Iniciar sesión';
        if (avatarEl) avatarEl.style.display = 'none';
        if (initialsEl) {
            initialsEl.style.display = 'flex';
            initialsEl.textContent = '?';
        }
        if (menuInfo) menuInfo.style.display = 'none';
    }
}

// ─── TOGGLE MENÚ DE USUARIO ───

window._toggleAuthMenu = function () {
    const menu = document.getElementById('auth-user-menu');
    if (!menu) return;

    const user = typeof getAuthUser === 'function' ? getAuthUser() : null;

    if (!user) {
        // Sin sesión: abrir modal en lugar del menú
        abrirModalAuth();
        return;
    }

    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
};

// ─── ABRIR / CERRAR MODAL ───

window.abrirModalAuth = function () {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

window.cerrarModalAuth = function () {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
};

// ─── UTILIDADES ───

function _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Exponer para uso desde auth.js
window.actualizarAuthUI = actualizarAuthUI;