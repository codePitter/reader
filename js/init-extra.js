// ═══════════════════════════════════════════════════════════
// INIT-EXTRA.JS — Lógica de inicialización migrada desde index.html
// Corresponde al dominio de init.js: edición inline de texto
// y handlers DOMContentLoaded de UI interactiva.
// Depende de: ui.js, ui-extra.js (cargados antes)
// Cargar ANTES de init.js
// ═══════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── Parche: redirigir sistema de notificaciones top-right → toast apilable ─
    // main.js usa mostrarNotificacion() que muestra un div #notification fixed
    // en la esquina superior derecha. El nuevo sistema usa #toast-stack (centrado,
    // apilable). Ambos disparaban al mismo tiempo → mensajes duplicados.
    // Solución: sobrescribir las funciones de notificación ANTES de que main.js/init.js
    // las usen, redirigiendo al showToast del sistema nuevo.
    // Si showToast todavía no existe (carga asíncrona), usamos un micro-defer.
    var _notifPatch = function() {
        var _toastFn = function(msg, persist) {
            if (typeof window.showToast === 'function') {
                window.showToast(msg, persist ? 6000 : 3000);
            }
            // Asegurar que el div legacy nunca sea visible
            var el = document.getElementById('notification');
            if (el) { el.classList.remove('show'); }
        };
        window.mostrarNotificacion = function(msg) { _toastFn(msg, false); };
        window.mostrarNotificacionPersistente = function(msg) { _toastFn(msg, true); };
        window.ocultarNotificacionPersistente = function() {
            var el = document.getElementById('notification');
            if (el) { el._persistente = false; el.classList.remove('show'); }
        };
    };
    _notifPatch();  // Ejecutar inmediatamente y también tras DOMContentLoaded
    document.addEventListener('DOMContentLoaded', _notifPatch);

    // ── Acordeón de ajustes (API Keys & Proveedores) ─────────
    // Esta función no estaba definida en ningún módulo JS cargado.
    // Se define aquí porque init-extra.js es el último archivo de UI
    // que carga antes de init.js, garantizando que esté disponible
    // cuando el panel de ajustes se inyecta en el DOM.
    window.toggleAjusteAcc = function (id) {
        var seccion = document.getElementById(id);
        if (!seccion) return;
        var estaAbierta = seccion.classList.contains('open');
        // Cerrar todos los acordeones del mismo contenedor
        var contenedor = seccion.closest('#settings-api-section') || seccion.parentElement;
        if (contenedor) {
            contenedor.querySelectorAll('.ajuste-seccion.open').forEach(function (s) {
                if (s !== seccion) s.classList.remove('open');
            });
        }
        // Toggle del target
        seccion.classList.toggle('open', !estaAbierta);
    };

    // ── Toggle modo Claro / Oscuro ────────────────────────────
    // Alterna entre el tema light y el último tema oscuro activo.
    // Se persiste en localStorage para sobrevivir recargas.
    var _DARK_THEMES = ['ember','mercury','folio','graphite','ghost','crimson','abyss','dark','minimal'];
    var _lastDarkTheme = 'ember';

    window._toggleLightDark = function () {
        var body       = document.body;
        var current    = body.getAttribute('data-theme') || 'ember';
        var icon       = document.getElementById('tb-theme-icon');
        var isLight    = current === 'light';

        if (isLight) {
            // Volver al último tema oscuro
            var saved = (typeof uGet === 'function') ? uGet('last_dark_theme') : null;
            var target = (saved && _DARK_THEMES.indexOf(saved) !== -1) ? saved : _lastDarkTheme;
            body.setAttribute('data-theme', target);
            if (typeof selectTheme === 'function') selectTheme(target);
            if (icon) icon.textContent = '☀';
            if (typeof uSet === 'function') uSet('theme_mode', 'dark');
        } else {
            // Guardar el tema oscuro actual y pasar a light
            _lastDarkTheme = current;
            if (typeof uSet === 'function') {
                uSet('last_dark_theme', current);
                uSet('theme_mode', 'light');
            }
            body.setAttribute('data-theme', 'light');
            if (typeof selectTheme === 'function') selectTheme('light');
            if (icon) icon.textContent = '🌙';
        }
    };

    // Restaurar modo light al cargar si estaba activo
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof uGet === 'function' && uGet('theme_mode') === 'light') {
            var icon = document.getElementById('tb-theme-icon');
            document.body.setAttribute('data-theme', 'light');
            if (icon) icon.textContent = '🌙';
            // No llamar selectTheme aquí — theme.js ya gestiona la persistencia normal
        }
    });

    // ── Editar texto inline en el reading area ────────────────
    var _editandoTexto = false;
    var _textoOriginalAntesDeEdicion = null;

    window._toggleEditarTexto = function () {
        var contenido = document.getElementById('texto-contenido');
        var btn       = document.getElementById('btn-editar-texto');
        if (!contenido) return;

        _editandoTexto = !_editandoTexto;

        if (_editandoTexto) {
            // Limpiar spans TTS para edición limpia — preservar solo texto plano en párrafos
            var parrafos = Array.from(contenido.querySelectorAll('p'));
            if (parrafos.length > 0) {
                _textoOriginalAntesDeEdicion = contenido.innerHTML;
                parrafos.forEach(function (p) { p.innerHTML = p.textContent; });
            } else {
                _textoOriginalAntesDeEdicion = contenido.innerHTML;
                contenido.querySelectorAll('.tts-sentence').forEach(function (s) {
                    s.replaceWith(document.createTextNode(s.textContent));
                });
                contenido.normalize();
            }
            contenido.contentEditable = 'true';
            contenido.style.outline      = '2px solid var(--accent)';
            contenido.style.borderRadius = '4px';
            contenido.style.padding      = '8px';
            contenido.focus();
            if (btn) {
                btn.innerHTML       = '&#10003; Guardar';
                btn.style.color     = 'var(--accent)';
                btn.style.borderColor = 'var(--accent)';
                btn.onmouseover = null;
                btn.onmouseout  = null;
            }
        } else {
            // Desactivar edición
            contenido.contentEditable   = 'false';
            contenido.style.outline      = '';
            contenido.style.borderRadius = '';
            contenido.style.padding      = '';
            if (btn) {
                btn.innerHTML = '&#9999; Editar texto';
                btn.style.color       = '';
                btn.style.borderColor = '';
                btn.onmouseover = function () {
                    this.style.color       = 'var(--accent)';
                    this.style.borderColor = 'var(--accent)';
                };
                btn.onmouseout = function () {
                    this.style.color       = '';
                    this.style.borderColor = '';
                };
            }
            // Actualizar sentences para TTS con el nuevo texto
            if (typeof dividirEnOraciones === 'function' && typeof sentences !== 'undefined') {
                sentences = dividirEnOraciones(contenido.textContent.trim());
            }
            if (typeof actualizarContadores === 'function') actualizarContadores();
            if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✓ Texto actualizado');
        }
    };

    // Esc para salir del modo edición
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _editandoTexto) window._toggleEditarTexto();
    });

    // ── DOMContentLoaded: inicializaciones de UI ──────────────
    document.addEventListener('DOMContentLoaded', function () {

        // 1. Hover sobre sección ajustes sidebar → mostrar contenido
        var section = document.getElementById('ajustes-sidebar-section');
        var content = document.getElementById('ajustes-sidebar-content');
        if (section && content) {
            section.addEventListener('mouseenter', function () {
                content.style.maxHeight = '1000px';
                content.style.opacity   = '1';
            });
            section.addEventListener('mouseleave', function () {
                content.style.maxHeight = '0';
                content.style.opacity   = '0';
            });
        }

        // 2. Observer para actualizar el preview del capítulo activo
        var titleEl = document.getElementById('current-chapter-title');
        if (titleEl && typeof window._actualizarChPreview === 'function') {
            // GUARD: verificar que sea función antes de pasarla al constructor.
            // Pasarla directamente causaba "parameter 1 is not of type 'Function'"
            // si ui-extra.js no había terminado, cortando todo este DOMContentLoaded.
            var obs = new MutationObserver(function () {
                if (typeof window._actualizarChPreview === 'function') {
                    window._actualizarChPreview();
                }
            });
            obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
        }
        if (typeof window._actualizarChPreview === 'function') {
            window._actualizarChPreview();
        }

        // 3. Botón minimizar video — solo stopPropagation en pointerdown para
        //    evitar que el drag handler del header capture el evento.
        //    El click real lo maneja el onclick="minimizeVideoFloat()" del HTML.
        //    NO agregar listener .click aquí: causa doble llamada (onclick + listener)
        //    → _videoMinimized se togglea dos veces → el panel se re-expande solo.
        //    El listener vf.click para restaurar desde burbuja ya está en ui-extra.js;
        //    duplicarlo aquí causaba el mismo problema al hacer click en la esfera.
        var vf = document.getElementById('video-float');
        if (vf) {
            var btnMin = vf.querySelector('.vid-hbtn[title="Minimizar"]');
            if (btnMin) {
                btnMin.addEventListener('pointerdown', function (e) {
                    e.stopPropagation();
                });
            }
        }
    });

})();