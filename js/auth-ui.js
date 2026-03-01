// ═══════════════════════════════════════
// AUTH UI — Modal multi-vista + widget de usuario en top bar
// Vistas: login | registro | recuperar contraseña
// Depende de: auth.js
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
    _inyectarModalAuth();
    _inyectarBotonUsuario();
    _inyectarEstilosAuth();

    document.addEventListener('auth:ready', (e) => actualizarAuthUI(e.detail.user));

    if (typeof _authReady !== 'undefined' && _authReady) {
        actualizarAuthUI(typeof _authUser !== 'undefined' ? _authUser : null);
    }
});

// ════════════════════════════════════════
// MODAL — HTML de las tres vistas
// ════════════════════════════════════════

function _inyectarModalAuth() {
    const modal = document.createElement('div');
    modal.id = 'modal-auth';
    modal.className = 'auth-modal-overlay';
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');
    modal.style.display = 'none';

    modal.innerHTML = `
        <div class="auth-modal-box">
            <button class="auth-modal-close" onclick="cerrarModalAuth()" title="Cerrar">✕</button>

            <div class="auth-modal-logo">📚</div>
            <h2 class="auth-modal-title">TotalReader</h2>

            <!-- ── VISTA: LOGIN ── -->
            <div id="auth-vista-login" class="auth-vista" style="display:block">
                <p class="auth-modal-subtitle">Iniciá sesión para guardar tu configuración</p>

                <button class="auth-btn-google" onclick="loginConGoogle()">
                    <svg class="auth-google-icon" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continuar con Google
                </button>

                <div class="auth-or-divider"><span>o</span></div>

                <div class="auth-field">
                    <input id="login-email" class="auth-input" type="email"
                           placeholder="Email" autocomplete="email" />
                </div>
                <div class="auth-field">
                    <input id="login-password" class="auth-input" type="password"
                           placeholder="Contraseña" autocomplete="current-password"
                           onkeydown="if(event.key==='Enter') _submitLogin()" />
                </div>

                <div id="login-error" class="auth-error" style="display:none"></div>

                <button class="auth-btn-primary" id="login-submit-btn" onclick="_submitLogin()">
                    Iniciar sesión
                </button>

                <div class="auth-links">
                    <button class="auth-link-btn" onclick="mostrarVistaAuth('recuperar')">
                        Olvidé mi contraseña
                    </button>
                    <button class="auth-link-btn" onclick="mostrarVistaAuth('registro')">
                        Crear cuenta
                    </button>
                </div>

                <p class="auth-modal-skip">
                    <button class="auth-skip-btn" onclick="cerrarModalAuth()">
                        Continuar sin cuenta →
                    </button>
                </p>
            </div>

            <!-- ── VISTA: REGISTRO ── -->
            <div id="auth-vista-registro" class="auth-vista" style="display:none">
                <p class="auth-modal-subtitle">Creá tu cuenta gratuita</p>

                <div class="auth-field">
                    <input id="reg-nombre" class="auth-input" type="text"
                           placeholder="Nombre (opcional)" autocomplete="name" />
                </div>
                <div class="auth-field">
                    <input id="reg-email" class="auth-input" type="email"
                           placeholder="Email" autocomplete="email" />
                </div>
                <div class="auth-field auth-field--password">
                    <input id="reg-password" class="auth-input" type="password"
                           placeholder="Contraseña (mín. 6 caracteres)"
                           autocomplete="new-password"
                           oninput="_actualizarFuerzaPassword(this.value)"
                           onkeydown="if(event.key==='Enter') _submitRegistro()" />
                    <div id="reg-password-strength" class="auth-password-strength">
                        <div id="reg-strength-bar" class="auth-strength-bar"></div>
                    </div>
                </div>

                <div id="reg-error" class="auth-error" style="display:none"></div>

                <button class="auth-btn-primary" id="reg-submit-btn" onclick="_submitRegistro()">
                    Crear cuenta
                </button>

                <div class="auth-links auth-links--center">
                    <button class="auth-link-btn" onclick="mostrarVistaAuth('login')">
                        ← Ya tengo cuenta
                    </button>
                </div>
            </div>

            <!-- ── VISTA: RECUPERAR CONTRASEÑA ── -->
            <div id="auth-vista-recuperar" class="auth-vista" style="display:none">
                <p class="auth-modal-subtitle">Te enviamos un link para restablecer tu contraseña</p>

                <div class="auth-field">
                    <input id="rec-email" class="auth-input" type="email"
                           placeholder="Tu email"
                           onkeydown="if(event.key==='Enter') _submitRecuperar()" />
                </div>

                <div id="rec-error" class="auth-error" style="display:none"></div>
                <div id="rec-success" class="auth-success" style="display:none">
                    ✓ Revisá tu bandeja de entrada
                </div>

                <button class="auth-btn-primary" id="rec-submit-btn" onclick="_submitRecuperar()">
                    Enviar link
                </button>

                <div class="auth-links auth-links--center">
                    <button class="auth-link-btn" onclick="mostrarVistaAuth('login')">
                        ← Volver al login
                    </button>
                </div>
            </div>

            <p class="auth-modal-note">
                Tus archivos nunca se suben a ningún servidor.
            </p>
        </div>
    `;

    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModalAuth(); });
    // Append to <html> para escapar del body que tiene overflow:hidden + display:flex
    // que crea un stacking context que recorta elementos position:fixed
    document.documentElement.appendChild(modal);
}

// ════════════════════════════════════════
// NAVEGACIÓN ENTRE VISTAS
// ════════════════════════════════════════

window.mostrarVistaAuth = function (vista) {
    // Asegurar que el modal esté montado en el DOM antes de manipular vistas
    ['login', 'registro', 'recuperar'].forEach(v => {
        const el = document.getElementById('auth-vista-' + v);
        if (el) el.style.display = v === vista ? 'block' : 'none';
    });
    // Limpiar errores y estados al cambiar vista
    ['login-error', 'reg-error', 'rec-error', 'rec-success'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
    // Focus en el primer input
    const focusMap = { login: 'login-email', registro: 'reg-email', recuperar: 'rec-email' };
    setTimeout(() => {
        const el = document.getElementById(focusMap[vista]);
        if (el) el.focus();
    }, 50);
};

// ════════════════════════════════════════
// SUBMIT HANDLERS
// ════════════════════════════════════════

window._submitLogin = async function () {
    const email = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit-btn');

    // Validaciones básicas
    if (!email || !password) {
        _mostrarErrorAuth('login-error', 'Completá email y contraseña');
        return;
    }
    if (!_validarEmail(email)) {
        _mostrarErrorAuth('login-error', 'Email inválido');
        return;
    }

    _setLoadingBtn(btn, true, 'Iniciando sesión...');
    if (errorEl) errorEl.style.display = 'none';

    const result = await loginConEmail(email, password);

    _setLoadingBtn(btn, false, 'Iniciar sesión');

    if (result.error) {
        _mostrarErrorAuth('login-error', result.error);
    }
    // Si ok, onAuthStateChange cierra el modal automáticamente
};

window._submitRegistro = async function () {
    const nombre = document.getElementById('reg-nombre')?.value?.trim();
    const email = document.getElementById('reg-email')?.value?.trim();
    const password = document.getElementById('reg-password')?.value;
    const btn = document.getElementById('reg-submit-btn');

    if (!email) { _mostrarErrorAuth('reg-error', 'Ingresá tu email'); return; }
    if (!_validarEmail(email)) { _mostrarErrorAuth('reg-error', 'Email inválido'); return; }
    if (!password || password.length < 6) {
        _mostrarErrorAuth('reg-error', 'La contraseña debe tener al menos 6 caracteres');
        return;
    }

    _setLoadingBtn(btn, true, 'Creando cuenta...');
    const errorEl = document.getElementById('reg-error');
    if (errorEl) errorEl.style.display = 'none';

    const result = await registrarConEmail(email, password, nombre);

    _setLoadingBtn(btn, false, 'Crear cuenta');

    if (result.error) {
        _mostrarErrorAuth('reg-error', result.error);
        return;
    }

    if (result.needsConfirm) {
        // Supabase requiere confirmar el email
        _mostrarErrorAuth('reg-error', '✓ Revisá tu email para confirmar tu cuenta', true);
    }
    // Si hay sesión directa, onAuthStateChange lo maneja
};

window._submitRecuperar = async function () {
    const email = document.getElementById('rec-email')?.value?.trim();
    const btn = document.getElementById('rec-submit-btn');
    const succEl = document.getElementById('rec-success');

    if (!email) { _mostrarErrorAuth('rec-error', 'Ingresá tu email'); return; }
    if (!_validarEmail(email)) { _mostrarErrorAuth('rec-error', 'Email inválido'); return; }

    _setLoadingBtn(btn, true, 'Enviando...');
    const errorEl = document.getElementById('rec-error');
    if (errorEl) errorEl.style.display = 'none';
    if (succEl) succEl.style.display = 'none';

    const result = await recuperarContrasena(email);

    _setLoadingBtn(btn, false, 'Enviar link');

    if (result.error) {
        _mostrarErrorAuth('rec-error', result.error);
    } else {
        if (succEl) { succEl.style.display = 'block'; }
        btn.disabled = true;
        setTimeout(() => { btn.disabled = false; }, 60000); // evitar spam
    }
};

// ════════════════════════════════════════
// BOTÓN DE USUARIO EN TOP BAR
// ════════════════════════════════════════

function _inyectarBotonUsuario() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'auth-user-widget';
    wrapper.className = 'auth-user-widget';

    wrapper.innerHTML = `
        <button id="auth-user-btn" class="auth-user-btn"
                onclick="_toggleAuthMenu()" title="Cuenta de usuario">
            <span id="auth-user-avatar-wrap">
                <span id="auth-user-initials" class="auth-initials"></span>
                <img id="auth-user-avatar" class="auth-avatar" src="" alt="" style="display:none" />
            </span>
            <span id="auth-user-name" class="auth-user-name"></span>
        </button>

        <div id="auth-user-menu" class="auth-user-menu" style="display:none">
            <div id="auth-menu-info" class="auth-menu-info" style="display:none">
                <span id="auth-menu-displayname" class="auth-menu-displayname"></span>
                <span id="auth-menu-email" class="auth-menu-email"></span>
            </div>
            <div class="auth-menu-divider"></div>
            <button class="auth-menu-item auth-menu-item--danger" onclick="cerrarSesion()">
                Cerrar sesión
            </button>
        </div>
    `;

    const h1 = topBar.querySelector('h1');
    if (h1 && h1.nextSibling) {
        topBar.insertBefore(wrapper, h1.nextSibling);
    } else {
        topBar.appendChild(wrapper);
    }

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            const menu = document.getElementById('auth-user-menu');
            if (menu) menu.style.display = 'none';
        }
    });
}

// ════════════════════════════════════════
// ACTUALIZAR UI SEGÚN ESTADO DE AUTH
// ════════════════════════════════════════

function actualizarAuthUI(user) {
    const btn = document.getElementById('auth-user-btn');
    const nameEl = document.getElementById('auth-user-name');
    const initialsEl = document.getElementById('auth-user-initials');
    const avatarEl = document.getElementById('auth-user-avatar');
    const menuInfo = document.getElementById('auth-menu-info');
    const menuName = document.getElementById('auth-menu-displayname');
    const emailEl = document.getElementById('auth-menu-email');

    if (!btn) return;

    if (user) {
        const name = getUserDisplayName();
        const avatarUrl = getUserAvatarUrl();

        btn.classList.remove('auth-user-btn--guest');
        btn.title = name;
        btn.onclick = _toggleAuthMenu;

        if (nameEl) nameEl.textContent = name;

        if (avatarUrl && avatarEl) {
            avatarEl.src = avatarUrl;
            avatarEl.style.display = 'block';
            if (initialsEl) initialsEl.style.display = 'none';
        } else {
            if (avatarEl) avatarEl.style.display = 'none';
            if (initialsEl) {
                initialsEl.style.display = 'flex';
                initialsEl.textContent = _getInitials(name);
            }
        }

        if (menuInfo) menuInfo.style.display = 'block';
        if (menuName) menuName.textContent = name;
        if (emailEl) emailEl.textContent = user.email || '';

    } else {
        btn.classList.add('auth-user-btn--guest');
        btn.title = 'Iniciar sesión';
        btn.onclick = function () { abrirModalAuth('login'); };

        if (nameEl) nameEl.textContent = 'Iniciar sesión';
        if (avatarEl) avatarEl.style.display = 'none';
        if (initialsEl) { initialsEl.style.display = 'flex'; initialsEl.textContent = '?'; }
        if (menuInfo) menuInfo.style.display = 'none';
    }
}

// ════════════════════════════════════════
// TOGGLE MENÚ / ABRIR-CERRAR MODAL
// ════════════════════════════════════════

window._toggleAuthMenu = function () {
    const menu = document.getElementById('auth-user-menu');
    if (!menu) return;
    if (!getAuthUser()) { abrirModalAuth(); return; }
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
};

window.abrirModalAuth = function (vista = 'login') {
    const modal = document.getElementById('modal-auth');
    if (!modal) return;
    // Forzar reflow para que las animaciones se reinicien correctamente
    modal.style.display = 'none';
    modal.offsetHeight; // trigger reflow
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    mostrarVistaAuth(vista);
};

window.cerrarModalAuth = function () {
    const modal = document.getElementById('modal-auth');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    // Resetear siempre a vista login para próxima apertura
    ['login', 'registro', 'recuperar'].forEach(v => {
        const el = document.getElementById('auth-vista-' + v);
        if (el) el.style.display = v === 'login' ? 'block' : 'none';
    });
    // Limpiar errores
    ['login-error', 'reg-error', 'rec-error', 'rec-success'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
};

// ════════════════════════════════════════
// FUERZA DE CONTRASEÑA
// ════════════════════════════════════════

window._actualizarFuerzaPassword = function (val) {
    const bar = document.getElementById('reg-strength-bar');
    if (!bar) return;
    const score = _calcularFuerzaPassword(val);
    const colores = ['#e07070', '#e0a870', '#c8a96e', '#7eb89a'];
    const pct = [25, 50, 75, 100];
    bar.style.width = val.length ? pct[score] + '%' : '0%';
    bar.style.background = val.length ? colores[score] : 'transparent';
};

function _calcularFuerzaPassword(p) {
    let s = 0;
    if (p.length >= 6) s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 3);
}

// ════════════════════════════════════════
// UTILIDADES INTERNAS
// ════════════════════════════════════════

function _mostrarErrorAuth(elementId, msg, isSuccess = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = isSuccess ? 'auth-success' : 'auth-error';
}

function _setLoadingBtn(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = text;
    btn.style.opacity = loading ? '0.7' : '1';
}

function _validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ════════════════════════════════════════
// ESTILOS
// ════════════════════════════════════════

function _inyectarEstilosAuth() {
    const style = document.createElement('style');
    style.id = 'auth-styles';
    style.textContent = `
        /* ── OVERLAY ── */
        .auth-modal-overlay {
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(10,9,8,0.82);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;

        }
        @keyframes authFadeIn { from { opacity:0; } to { opacity:1; } }

        /* ── BOX ── */
        .auth-modal-box {
            position: relative;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 36px 32px 28px;
            width: 100%; max-width: 380px;
            text-align: center;
            box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,169,110,0.06);
            max-height: 92vh; overflow-y: auto;
        }
        @keyframes authSlideUp {
            from { transform: translateY(16px); opacity:0; }
            to   { transform: translateY(0);    opacity:1; }
        }

        .auth-modal-close {
            position: absolute; top: 12px; right: 14px;
            background: none; border: none; color: var(--text-dim);
            font-size: 0.9rem; cursor: pointer; padding: 4px 6px;
            border-radius: 4px; transition: color 0.15s;
            font-family: 'DM Mono', monospace;
        }
        .auth-modal-close:hover { color: var(--text); }

        .auth-modal-logo { font-size: 2.2rem; line-height: 1; margin-bottom: 8px; }

        .auth-modal-title {
            font-family: 'Lora', serif; font-size: 1.3rem; font-weight: 600;
            color: var(--accent); margin: 0 0 4px; letter-spacing: -0.01em;
        }

        .auth-modal-subtitle {
            font-size: 0.67rem; color: var(--text-muted);
            margin: 0 0 18px; line-height: 1.5;
            font-family: 'DM Mono', monospace;
        }

        /* ── VISTAS ── */
        .auth-vista { text-align: left; }

        /* ── BOTÓN GOOGLE ── */
        .auth-btn-google {
            display: flex; align-items: center; justify-content: center;
            gap: 10px; width: 100%; padding: 10px 16px;
            background: var(--surface2); border: 1px solid var(--border);
            border-radius: 8px; color: var(--text);
            font-family: 'DM Mono', monospace; font-size: 0.7rem;
            font-weight: 600; letter-spacing: 0.03em;
            cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.1s;
            margin-bottom: 4px;
        }
        .auth-btn-google:hover {
            border-color: var(--accent); background: rgba(200,169,110,0.07);
            transform: translateY(-1px);
        }
        .auth-btn-google:active { transform: translateY(0); }
        .auth-google-icon { width: 17px; height: 17px; flex-shrink: 0; }

        /* ── DIVISOR OR ── */
        .auth-or-divider {
            display: flex; align-items: center; gap: 10px;
            margin: 14px 0; color: var(--text-dim);
            font-family: 'DM Mono', monospace; font-size: 0.6rem;
        }
        .auth-or-divider::before, .auth-or-divider::after {
            content: ''; flex: 1; height: 1px; background: var(--border);
        }

        /* ── INPUTS ── */
        .auth-field { margin-bottom: 8px; }
        .auth-field--password { margin-bottom: 4px; }

        .auth-input {
            width: 100%; padding: 9px 12px;
            background: var(--surface2); border: 1px solid var(--border);
            border-radius: 7px; color: var(--text);
            font-family: 'DM Mono', monospace; font-size: 0.68rem;
            transition: border-color 0.15s; box-sizing: border-box;
            outline: none;
        }
        .auth-input:focus { border-color: var(--accent); }
        .auth-input::placeholder { color: var(--text-dim); }

        /* ── BARRA DE FUERZA DE CONTRASEÑA ── */
        .auth-password-strength {
            height: 3px; background: var(--border);
            border-radius: 2px; margin: 4px 0 8px; overflow: hidden;
        }
        .auth-strength-bar {
            height: 100%; width: 0;
            border-radius: 2px; transition: width 0.3s, background 0.3s;
        }

        /* ── BOTÓN PRINCIPAL ── */
        .auth-btn-primary {
            width: 100%; padding: 10px;
            background: var(--accent); border: none; border-radius: 8px;
            color: var(--bg); font-family: 'DM Mono', monospace;
            font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em;
            cursor: pointer; transition: opacity 0.15s, transform 0.1s;
            margin-top: 4px;
        }
        .auth-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .auth-btn-primary:active { transform: translateY(0); }
        .auth-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        /* ── MENSAJES ── */
        .auth-error {
            font-size: 0.63rem; color: #e07070;
            font-family: 'DM Mono', monospace;
            background: rgba(224,112,112,0.08);
            border: 1px solid rgba(224,112,112,0.2);
            border-radius: 6px; padding: 7px 10px;
            margin-bottom: 8px; line-height: 1.4;
        }
        .auth-success {
            font-size: 0.63rem; color: var(--accent2);
            font-family: 'DM Mono', monospace;
            background: rgba(126,184,154,0.08);
            border: 1px solid rgba(126,184,154,0.2);
            border-radius: 6px; padding: 7px 10px;
            margin-bottom: 8px;
        }

        /* ── LINKS ── */
        .auth-links {
            display: flex; justify-content: space-between;
            margin-top: 12px; padding-top: 10px;
            border-top: 1px solid var(--border);
        }
        .auth-links--center { justify-content: center; }
        .auth-link-btn {
            background: none; border: none; color: var(--text-dim);
            font-family: 'DM Mono', monospace; font-size: 0.61rem;
            cursor: pointer; letter-spacing: 0.02em;
            transition: color 0.15s; padding: 2px 0;
        }
        .auth-link-btn:hover { color: var(--accent); }

        /* ── SKIP ── */
        .auth-modal-skip { margin: 10px 0 0; text-align: center; }
        .auth-skip-btn {
            background: none; border: none; color: var(--text-dim);
            font-family: 'DM Mono', monospace; font-size: 0.61rem;
            cursor: pointer; transition: color 0.15s; padding: 4px 0;
        }
        .auth-skip-btn:hover { color: var(--text-muted); }

        .auth-modal-note {
            margin: 16px 0 0; font-size: 0.57rem; color: var(--text-dim);
            font-family: 'DM Mono', monospace; line-height: 1.6;
            padding-top: 14px; border-top: 1px solid var(--border);
            text-align: center;
        }

        /* ── WIDGET TOP BAR ── */
        .auth-user-widget { position: relative; margin-left: 4px; }

        .auth-user-btn {
            display: flex; align-items: center; gap: 7px;
            background: none; border: 1px solid var(--border);
            border-radius: 20px; padding: 4px 10px 4px 5px;
            color: var(--text-muted); font-family: 'DM Mono', monospace;
            font-size: 0.62rem; font-weight: 600; letter-spacing: 0.03em;
            cursor: pointer; height: 28px; white-space: nowrap;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .auth-user-btn:hover {
            border-color: var(--accent); color: var(--accent);
            background: rgba(200,169,110,0.06);
        }

        .auth-initials {
            display: flex; align-items: center; justify-content: center;
            width: 20px; height: 20px; border-radius: 50%;
            background: var(--accent); color: var(--bg);
            font-size: 0.55rem; font-weight: 700;
            font-family: 'DM Mono', monospace; flex-shrink: 0;
        }
        .auth-avatar {
            width: 20px; height: 20px; border-radius: 50%;
            object-fit: cover; flex-shrink: 0;
        }
        .auth-user-btn--guest .auth-initials {
            background: var(--surface2); color: var(--text-dim);
            border: 1px solid var(--border);
        }

        /* ── MENÚ DESPLEGABLE ── */
        .auth-user-menu {
            position: absolute; top: calc(100% + 6px); right: 0;
            background: var(--surface); border: 1px solid var(--border);
            border-radius: 8px; min-width: 190px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            overflow: hidden; animation: authFadeIn 0.15s ease; z-index: 1000;
        }
        .auth-menu-info { padding: 10px 14px 8px; }
        .auth-menu-displayname {
            display: block; font-size: 0.68rem; color: var(--text);
            font-family: 'DM Mono', monospace; font-weight: 600;
            margin-bottom: 2px;
        }
        .auth-menu-email {
            display: block; font-size: 0.59rem; color: var(--text-dim);
            font-family: 'DM Mono', monospace; word-break: break-all;
        }
        .auth-menu-divider { height: 1px; background: var(--border); }
        .auth-menu-item {
            display: block; width: 100%; padding: 9px 14px;
            background: none; border: none; text-align: left;
            font-family: 'DM Mono', monospace; font-size: 0.63rem;
            font-weight: 600; letter-spacing: 0.03em; cursor: pointer;
            transition: background 0.12s, color 0.12s; color: var(--text-muted);
        }
        .auth-menu-item:hover { background: var(--surface2); color: var(--text); }
        .auth-menu-item--danger:hover { color: #e07070; }
    `;
    document.head.appendChild(style);
}

window.actualizarAuthUI = actualizarAuthUI;