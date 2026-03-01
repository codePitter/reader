// ═══════════════════════════════════════
// AUTH — Autenticación con Supabase + Google OAuth
// Opcional: la app funciona sin cuenta
// Depende de: main.js (mostrarNotificacion)
// Debe cargarse ANTES de auth-ui.js
// ═══════════════════════════════════════

// ─── CONFIGURACIÓN ───
// Reemplazá estos valores con los de tu proyecto en Supabase
// (Settings → API → Project URL y anon key)
const SUPABASE_URL = 'https://hpofcnhjhopnuiolkzzx.supabase.co';         // ej: https://xyzxyz.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwb2ZjbmhqaG9wbnVpb2xrenp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjkzOTcsImV4cCI6MjA4Nzk0NTM5N30.EgIFEVJ_Mc373yYhIz-tFH8Ee83RgKPN0ByUtLVbgxw'; // clave pública (anon/public)

// ─── ESTADO GLOBAL DE AUTH ───
let _supabase = null;       // cliente Supabase inicializado
let _authUser = null;       // usuario actual (null = no autenticado / modo anónimo)
let _authReady = false;     // true después de que se resolvió la sesión inicial

// ─── INICIALIZACIÓN ───
(function initSupabase() {
    // Verificar que el SDK de Supabase esté cargado
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
        console.warn('[auth.js] SDK de Supabase no encontrado. Revisa que el script esté incluido en index.html.');
        _authReady = true; // la app continúa en modo sin cuenta
        return;
    }

    if (SUPABASE_URL === 'TU_SUPABASE_URL') {
        console.warn('[auth.js] Supabase no configurado. Agrega SUPABASE_URL y SUPABASE_ANON_KEY en auth.js.');
        _authReady = true;
        return;
    }

    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Escuchar cambios de sesión (login, logout, token refresh)
    _supabase.auth.onAuthStateChange((event, session) => {
        const prevUser = _authUser;
        _authUser = session?.user ?? null;

        if (!_authReady) {
            // Primera resolución: la app puede terminar de inicializarse
            _authReady = true;
            document.dispatchEvent(new CustomEvent('auth:ready', { detail: { user: _authUser } }));
        }

        if (event === 'SIGNED_IN' && !prevUser) {
            document.dispatchEvent(new CustomEvent('auth:signin', { detail: { user: _authUser } }));
            _onSignIn(_authUser);
        }

        if (event === 'SIGNED_OUT') {
            document.dispatchEvent(new CustomEvent('auth:signout'));
            _onSignOut();
        }

        // Actualizar UI en cualquier cambio
        if (typeof actualizarAuthUI === 'function') actualizarAuthUI(_authUser);
    });

    // Recuperar sesión existente al cargar la página
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
    if (!_supabase) {
        mostrarNotificacion('⚠ Supabase no configurado');
        return;
    }

    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.href,  // vuelve a la misma página
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            }
        }
    });

    if (error) {
        console.error('[auth.js] Error al iniciar login con Google:', error);
        mostrarNotificacion('✕ Error al conectar con Google');
    }
    // Si no hay error, el navegador redirige a Google automáticamente
}

// ─── LOGOUT ───
async function cerrarSesion() {
    if (!_supabase) return;

    const { error } = await _supabase.auth.signOut();
    if (error) {
        console.error('[auth.js] Error al cerrar sesión:', error);
        mostrarNotificacion('✕ Error al cerrar sesión');
    }
    // onAuthStateChange dispara 'SIGNED_OUT' y actualiza la UI
}

// ─── GETTERS PÚBLICOS ───

/** Devuelve el usuario actual o null si no está autenticado */
function getAuthUser() {
    return _authUser;
}

/** Devuelve true si hay una sesión activa */
function estaAutenticado() {
    return _authUser !== null;
}

/** Devuelve el ID único del usuario (para prefixar localStorage) */
function getUserId() {
    return _authUser?.id ?? 'anonymous';
}

/** Devuelve el nombre para mostrar del usuario */
function getUserDisplayName() {
    if (!_authUser) return null;
    return _authUser.user_metadata?.full_name
        || _authUser.user_metadata?.name
        || _authUser.email?.split('@')[0]
        || 'Usuario';
}

/** Devuelve la URL del avatar del usuario */
function getUserAvatarUrl() {
    if (!_authUser) return null;
    return _authUser.user_metadata?.avatar_url
        || _authUser.user_metadata?.picture
        || null;
}

// ─── CONFIGURACIONES POR USUARIO ───
// localStorage con prefijo por userID para aislar configuraciones entre usuarios

/**
 * Guarda un valor en localStorage prefijado por el usuario actual.
 * Si no está autenticado, usa el prefijo 'anonymous'.
 */
function userSetItem(key, value) {
    const uid = getUserId();
    localStorage.setItem(`user_${uid}_${key}`, value);
}

/**
 * Lee un valor de localStorage prefijado por el usuario actual.
 * Fallback: intenta leer la clave sin prefijo (datos previos sin cuenta).
 */
function userGetItem(key, fallback = null) {
    const uid = getUserId();
    const value = localStorage.getItem(`user_${uid}_${key}`);
    if (value !== null) return value;
    // Compatibilidad: leer claves antiguas sin prefijo
    return localStorage.getItem(key) ?? fallback;
}

/**
 * Elimina un valor de localStorage del usuario actual.
 */
function userRemoveItem(key) {
    const uid = getUserId();
    localStorage.removeItem(`user_${uid}_${key}`);
}

// ─── CALLBACKS INTERNOS ───

function _onSignIn(user) {
    const name = getUserDisplayName();
    mostrarNotificacion(`✓ Bienvenido, ${name}`);

    // Cerrar el modal de auth si estaba abierto
    if (typeof cerrarModalAuth === 'function') cerrarModalAuth();
}

function _onSignOut() {
    mostrarNotificacion('✓ Sesión cerrada');
}

// ─── EXPORT (compatibilidad con módulos y acceso global) ───
// Todas las funciones ya están en el scope global por ser un script clásico.
// Se exponen explícitamente para mayor claridad.
window.loginConGoogle   = loginConGoogle;
window.cerrarSesion     = cerrarSesion;
window.getAuthUser      = getAuthUser;
window.estaAutenticado  = estaAutenticado;
window.getUserId        = getUserId;
window.getUserDisplayName = getUserDisplayName;
window.getUserAvatarUrl = getUserAvatarUrl;
window.userSetItem      = userSetItem;
window.userGetItem      = userGetItem;
window.userRemoveItem   = userRemoveItem;