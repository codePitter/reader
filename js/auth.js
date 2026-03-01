// ═══════════════════════════════════════
// AUTH — Autenticación con Supabase + Google OAuth + Email/Password
// Opcional: la app funciona sin cuenta
// Depende de: main.js (mostrarNotificacion)
// Debe cargarse ANTES de auth-ui.js
// ═══════════════════════════════════════

// ─── CONFIGURACIÓN ───
const SUPABASE_URL = 'https://hpofcnhjhopnuiolkzzx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwb2ZjbmhqaG9wbnVpb2xrenp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjkzOTcsImV4cCI6MjA4Nzk0NTM5N30.EgIFEVJ_Mc373yYhIz-tFH8Ee83RgKPN0ByUtLVbgxw';

// ─── ESTADO GLOBAL DE AUTH ───
let _supabase = null;
let _authUser = null;
let _authReady = false;

// ─── INICIALIZACIÓN ───
(function initSupabase() {
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
        console.warn('[auth.js] SDK de Supabase no encontrado.');
        _authReady = true;
        return;
    }

    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    _supabase.auth.onAuthStateChange((event, session) => {
        const prevUser = _authUser;
        _authUser = session?.user ?? null;

        if (!_authReady) {
            _authReady = true;
            document.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: _authUser } }));
        }

        // SIGNED_IN dispara también al re-enfocar la pestaña (bug conocido de Supabase).
        // Solo actuar si el user.id cambió de verdad.
        if (event === 'SIGNED_IN' && _authUser?.id !== prevUser?.id) {
            document.dispatchEvent(new CustomEvent('auth:signin', { detail: { user: _authUser } }));
            _onSignIn(_authUser);
        }

        if (event === 'SIGNED_OUT') {
            document.dispatchEvent(new CustomEvent('auth:signout'));
            _onSignOut();
        }

        if (typeof actualizarAuthUI === 'function') actualizarAuthUI(_authUser);
    });

    _supabase.auth.getSession().then(({ data: { session } }) => {
        if (!_authReady) {
            _authUser = session?.user ?? null;
            _authReady = true;
            document.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: _authUser } }));
            if (typeof actualizarAuthUI === 'function') actualizarAuthUI(_authUser);
        }
    });
})();

// ─── LOGIN CON GOOGLE ───
async function loginConGoogle() {
    if (!_supabase) { mostrarNotificacion('⚠ Supabase no configurado'); return; }

    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.href,
            queryParams: { access_type: 'offline', prompt: 'consent' }
        }
    });

    if (error) {
        console.error('[auth.js] Error Google OAuth:', error);
        mostrarNotificacion('✕ Error al conectar con Google');
    }
}

// ─── LOGIN CON EMAIL/PASSWORD ───
async function loginConEmail(email, password) {
    if (!_supabase) { mostrarNotificacion('⚠ Supabase no configurado'); return { error: true }; }

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

    if (error) {
        console.error('[auth.js] Error login email:', error);
        return { error: _traducirErrorAuth(error.message) };
    }

    return { data };
}

// ─── REGISTRO CON EMAIL/PASSWORD ───
async function registrarConEmail(email, password, nombre) {
    if (!_supabase) { mostrarNotificacion('⚠ Supabase no configurado'); return { error: true }; }

    const { data, error } = await _supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: nombre || '',
                name: nombre || '',
            }
        }
    });

    if (error) {
        console.error('[auth.js] Error registro:', error);
        return { error: _traducirErrorAuth(error.message) };
    }

    // needsConfirm = true cuando Supabase requiere verificar el email antes de dar sesión
    const needsConfirm = data?.user && !data.session;
    return { data, needsConfirm };
}

// ─── RECUPERAR CONTRASEÑA ───
async function recuperarContrasena(email) {
    if (!_supabase) { mostrarNotificacion('⚠ Supabase no configurado'); return { error: true }; }

    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname + '?reset=true',
    });

    if (error) {
        console.error('[auth.js] Error reset password:', error);
        return { error: _traducirErrorAuth(error.message) };
    }

    return { ok: true };
}

// ─── LOGOUT ───
async function cerrarSesion() {
    if (!_supabase) return;
    const { error } = await _supabase.auth.signOut();
    if (error) {
        console.error('[auth.js] Error logout:', error);
        mostrarNotificacion('✕ Error al cerrar sesión');
    }
}

// ─── GETTERS PÚBLICOS ───
function getAuthUser() { return _authUser; }
function estaAutenticado() { return _authUser !== null; }
function getUserId() { return _authUser?.id ?? 'anonymous'; }

function getUserDisplayName() {
    if (!_authUser) return null;
    return _authUser.user_metadata?.full_name
        || _authUser.user_metadata?.name
        || _authUser.email?.split('@')[0]
        || 'Usuario';
}

function getUserAvatarUrl() {
    if (!_authUser) return null;
    return _authUser.user_metadata?.avatar_url
        || _authUser.user_metadata?.picture
        || null;
}

// ─── CONFIGURACIONES POR USUARIO (localStorage prefijado) ───
function userSetItem(key, value) {
    localStorage.setItem(`user_${getUserId()}_${key}`, value);
}

function userGetItem(key, fallback = null) {
    const value = localStorage.getItem(`user_${getUserId()}_${key}`);
    if (value !== null) return value;
    return localStorage.getItem(key) ?? fallback;
}

function userRemoveItem(key) {
    localStorage.removeItem(`user_${getUserId()}_${key}`);
}

// ─── CALLBACKS INTERNOS ───
function _onSignIn(user) {
    if (typeof cerrarModalAuth === 'function') cerrarModalAuth();
    mostrarNotificacion(`✓ Bienvenido, ${getUserDisplayName()}`);
}

function _onSignOut() {
    if (typeof cerrarModalAuth === 'function') cerrarModalAuth();
    mostrarNotificacion('✓ Sesión cerrada');
}

// ─── TRADUCCIÓN DE ERRORES ───
function _traducirErrorAuth(msg) {
    if (!msg) return 'Error desconocido';
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
        return 'Email o contraseña incorrectos';
    if (m.includes('email not confirmed'))
        return 'Confirmá tu email antes de iniciar sesión';
    if (m.includes('user already registered') || m.includes('already been registered'))
        return 'Ya existe una cuenta con ese email';
    if (m.includes('password should be at least'))
        return 'La contraseña debe tener al menos 6 caracteres';
    if (m.includes('unable to validate email'))
        return 'Email inválido';
    if (m.includes('rate limit'))
        return 'Demasiados intentos, esperá unos minutos';
    if (m.includes('network') || m.includes('fetch'))
        return 'Error de conexión, revisá tu internet';
    return msg;
}

// ─── EXPORTS GLOBALES ───
window.loginConGoogle = loginConGoogle;
window.loginConEmail = loginConEmail;
window.registrarConEmail = registrarConEmail;
window.recuperarContrasena = recuperarContrasena;
window.cerrarSesion = cerrarSesion;
window.getAuthUser = getAuthUser;
window.estaAutenticado = estaAutenticado;
window.getUserId = getUserId;
window.getUserDisplayName = getUserDisplayName;
window.getUserAvatarUrl = getUserAvatarUrl;
window.userSetItem = userSetItem;
window.userGetItem = userGetItem;
window.userRemoveItem = userRemoveItem;