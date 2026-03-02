// ═══════════════════════════════════════════════════════════════
// USTORAGE — Capa de abstracción de localStorage por usuario
//
// Todas las claves de configuración se guardan con prefijo:
//   user_{userId}_{key}   → usuario autenticado
//   guest_{key}           → sin sesión (compatibilidad total con estado actual)
//
// API pública:
//   uGet(key)             → equivale a localStorage.getItem(key)
//   uSet(key, val)        → equivale a localStorage.setItem(key, val)
//   uRemove(key)          → equivale a localStorage.removeItem(key)
//   uKey(rawKey)          → devuelve la clave prefijada (para iterar, startsWith, etc.)
//   uSetUser(id)          → llamar al iniciar sesión; migra claves guest → user
//   uClearUser()          → llamar al cerrar sesión; vuelve al prefijo guest
//
// Migración a la nube (futuro):
//   Reemplazar uGet/uSet/uRemove con llamadas a Supabase sin tocar el resto del código.
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Estado interno ──
    let _currentPrefix = 'guest';

    // Claves que NO se prefijan — son del sistema (Supabase, OAuth, etc.)
    // o son lo suficientemente globales para no pertenecer a ningún usuario.
    const _GLOBAL_KEYS = new Set([
        // (vacío por ahora — todas las claves de la app se prefijan)
    ]);

    // ── Helpers ──
    function _prefix(key) {
        if (_GLOBAL_KEYS.has(key)) return key;
        return `${_currentPrefix}_${key}`;
    }

    // ── API pública ──

    window.uGet = function (key) {
        const prefixed = _prefix(key);
        const val = localStorage.getItem(prefixed);
        // Fallback: si no existe con prefijo, buscar la clave legacy sin prefijo
        // (migración silenciosa: primera vez que un guest accede a una clave ya existente)
        if (val === null && _currentPrefix === 'guest') {
            const legacy = localStorage.getItem(key);
            if (legacy !== null) {
                // Migrar al formato prefijado automáticamente
                localStorage.setItem(prefixed, legacy);
                localStorage.removeItem(key);
                console.log(`[uStorage] Migrado legacy → ${prefixed}`);
            }
            return legacy;
        }
        return val;
    };

    window.uSet = function (key, val) {
        localStorage.setItem(_prefix(key), val);
    };

    window.uRemove = function (key) {
        localStorage.removeItem(_prefix(key));
        // Limpiar también la clave legacy si aún existe
        localStorage.removeItem(key);
    };

    // Devuelve la clave prefijada — útil para startsWith en iteraciones
    window.uKey = function (key) {
        return _prefix(key);
    };

    // ── Gestión de sesión ──

    // Llamar al iniciar sesión con el ID de Supabase
    window.uSetUser = function (userId) {
        if (!userId) return;
        const newPrefix = `user_${userId}`;
        if (_currentPrefix === newPrefix) return;

        // Migrar claves del guest al nuevo usuario (si el guest tenía datos)
        const guestPrefix = 'guest_';
        const toMigrate = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(guestPrefix)) toMigrate.push(k);
        }
        toMigrate.forEach(k => {
            const userKey = newPrefix + '_' + k.slice(guestPrefix.length);
            // Solo migrar si el usuario no tiene ya un valor propio
            if (localStorage.getItem(userKey) === null) {
                localStorage.setItem(userKey, localStorage.getItem(k));
                console.log(`[uStorage] Migrado guest → ${userKey}`);
            }
            localStorage.removeItem(k);
        });

        _currentPrefix = newPrefix;
        console.log(`[uStorage] Usuario activo: ${userId}`);
    };

    // Llamar al cerrar sesión
    window.uClearUser = function () {
        _currentPrefix = 'guest';
        console.log('[uStorage] Sesión cerrada — prefijo: guest');
    };

    // Devuelve el prefijo activo (para debug o iteraciones externas)
    window.uGetPrefix = function () {
        return _currentPrefix;
    };

    console.log('[uStorage] Inicializado — prefijo activo:', _currentPrefix);
})();