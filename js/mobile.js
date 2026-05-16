/**
 * mobile.js — Comportamiento móvil para TotalReader
 * Solo activo en pantallas ≤ 600px.
 * No modifica ninguna variable global existente.
 */

(function () {
  'use strict';

  const BREAKPOINT = 600;

  function isMobile() {
    return window.innerWidth <= BREAKPOINT;
  }

  /* ── Backdrop ──────────────────────────────────────────── */

  function crearBackdrop() {
    if (document.getElementById('mobile-backdrop')) return;
    const bd = document.createElement('div');
    bd.className = 'mobile-backdrop';
    bd.id = 'mobile-backdrop';
    bd.addEventListener('click', cerrarSidebar);
    document.querySelector('.app').appendChild(bd);
  }

  /* ── Abrir / Cerrar sidebar como bottom sheet ───────────── */

  function abrirSidebar() {
    if (!isMobile()) return;
    const app = document.querySelector('.app');
    app.classList.add('mobile-sidebar-open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarSidebar() {
    const app = document.querySelector('.app');
    app.classList.remove('mobile-sidebar-open');
    document.body.style.overflow = '';
  }

  function toggleSidebar() {
    const app = document.querySelector('.app');
    if (app.classList.contains('mobile-sidebar-open')) {
      cerrarSidebar();
    } else {
      abrirSidebar();
    }
  }

  /* ── Interceptar el toggle del rail en mobile ───────────── */
  // La función original toggleSidebarPanel() hace width:0/auto en desktop.
  // En mobile la reemplazamos.

  function patchearToggle() {
    const btnToggle = document.getElementById('ic-toggle-sidebar');
    if (!btnToggle) return;

    // Clonar para quitar el onclick original
    const clon = btnToggle.cloneNode(true);
    clon.addEventListener('click', function (e) {
      if (isMobile()) {
        e.stopPropagation();
        toggleSidebar();
      } else {
        // En desktop dejar la función original
        if (typeof toggleSidebarPanel === 'function') toggleSidebarPanel();
      }
    });
    btnToggle.parentNode.replaceChild(clon, btnToggle);

    // También los íconos del rail abren el sidebar en mobile
    const railIcons = document.querySelectorAll('.rail .ic:not(#ic-toggle-sidebar)');
    railIcons.forEach(function (ic) {
      ic.addEventListener('click', function () {
        if (!isMobile()) return;
        // Si el sidebar no está abierto, abrirlo
        const app = document.querySelector('.app');
        if (!app.classList.contains('mobile-sidebar-open')) {
          abrirSidebar();
        }
      }, true); // capture: true para que corra antes que los handlers originales
    });
  }

  /* ── Swipe up para abrir, swipe down para cerrar ────────── */

  (function configurarSwipe() {
    let startY = 0;
    let startX = 0;
    const UMBRAL = 60; // px mínimos para activar

    document.addEventListener('touchstart', function (e) {
      if (!isMobile()) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!isMobile()) return;
      const endY = e.changedTouches[0].clientY;
      const endX = e.changedTouches[0].clientX;
      const deltaY = endY - startY;
      const deltaX = Math.abs(endX - startX);

      // Solo swipes predominantemente verticales
      if (deltaX > 60) return;

      const app = document.querySelector('.app');
      const sidebarAbierto = app.classList.contains('mobile-sidebar-open');

      // Swipe hacia arriba desde zona baja de la pantalla → abrir
      if (!sidebarAbierto && deltaY < -UMBRAL && startY > window.innerHeight * 0.7) {
        abrirSidebar();
        return;
      }

      // Swipe hacia abajo sobre el sidebar → cerrar
      if (sidebarAbierto && deltaY > UMBRAL) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.contains(e.target)) {
          // Solo cerrar si el sidebar no tiene scroll pendiente
          if (sidebar.scrollTop <= 0) {
            cerrarSidebar();
          }
        }
      }
    }, { passive: true });
  })();

  /* ── Cerrar con tecla Escape ─────────────────────────── */

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isMobile()) cerrarSidebar();
  });

  /* ── Scroll del sidebar: swipe-to-dismiss cuando está en tope ── */

  function configurarScrollSnap() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    let touchStartY = 0;
    sidebar.addEventListener('touchstart', function (e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    sidebar.addEventListener('touchmove', function (e) {
      if (!isMobile()) return;
      const deltaY = e.touches[0].clientY - touchStartY;
      // Si el sidebar está en tope y se arrastra hacia abajo, cerrar
      if (sidebar.scrollTop === 0 && deltaY > 0) {
        e.preventDefault(); // evita bounce del browser
      }
    }, { passive: false });
  }

  /* ── Ajustar al rotar pantalla ──────────────────────────── */

  window.addEventListener('resize', function () {
    if (!isMobile()) {
      cerrarSidebar();
    }
  });

  /* ── Init ────────────────────────────────────────────────── */

  function init() {
    crearBackdrop();
    patchearToggle();
    configurarScrollSnap();

    // Marcar body para debugging y posibles estilos extra
    if (isMobile()) document.documentElement.classList.add('is-mobile');

    // Asegurar que en mobile el sidebar empiece cerrado
    if (isMobile()) {
      cerrarSidebar();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
