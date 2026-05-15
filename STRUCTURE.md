# Project Structure — Reader

Generated: 2026-03-03 (updated)

This document lists the project's top-level files and notable changes.

- `/.git/`
- `/.gitignore`
- `/.vs/`
- `biblioteca.sql` — local DB dump used by the app
- `comic_reader.html`
- `css/`
  - `components.css` — small reusable components
  - `layout.css` — layout and UI rules (recent edits: added standard `appearance` and `-moz-appearance` to range controls)
  - `theme-dark.css` — theme variables (dark)
  - `theme-minimal.css` — minimal theme variables
  - `themes.css` — theme helper rules
- `env/` — virtual environment (Python)
  - `Include/`
  - `Lib/`
  - `pyvenv.cfg`
  - `Scripts/`
- `index.html` — main web UI (Ajustes modal contains theme selector)
- `js/` — client-side logic
- `js/` — client-side logic (current on-disk files)
  - `auth-ui.js`
  - `auth.js`
  - `biblioteca.js`
  - `bookmarks.js`
  - `convert_mp3.js`
  - `convert_mp4.js`
  - `epub.js`
  - `export_buttons.js`
  - `export_video.js`
  - `formats.js`
  - `grammar.js`
  - `images.js`
  - `init-extra.js`
  - `init.js`
  - `library.js`
  - `main.js`
  - `player.js`
  - `progress.js`
  - `settings-bridge.js`
  - `theme.js` — theme switching/persistence logic
  - `translation.js`
  - `tts.js` — TTS UI integration
  - `ui-extra.js`
  - `ui.js`
  - `ustorage.js` — lightweight localStorage wrapper
  - `video.js`
  - `voice-roles.js`
  - `xtts-status.js`
  
  Note: the following JS files mentioned in earlier scans are not present on-disk and were removed or renamed:
  - `comic_loader.js`, `comic_reader.js`, `comic_ui.js`
  - `manga.js`, `manga_ocr.js`
- `MIGRATION.md`
- `reader-themes.html`
- `README.md`
- `requirements.txt`
- `setup_ocr.bat`
- `style.css` — main stylesheet (note: user has reverted some edits to this file in the past; verify before overwriting)
- `TECHNICAL.md`
- `tesseract/`
  - `lang/`
  - `main`
  - multiple `tesseract-core-*.wasm(.js)` files and `tesseract.min.js`, `worker.min.js`
- `test_xtts.py`
- `tts_api_server.py`
- `tts_server_tray.py`
- `venv/`

Notes & recent changes:
- `css/layout.css` was edited to add vendor-compatible `appearance` rules for `input[type="range"]` and related slider thumbs to silence editor diagnostics and improve cross-browser rendering.
- `style.css` was previously backed up/modified during theme work; the user later undid edits — confirm on-disk before major changes.
- A theme selector UI and `js/theme.js` are present; theme files live under `css/`.
- **2026-03-03 — batch 1** (`js/ui-extra.js` + `style.css`):
  - `minimizeVideoFloat()` added: restores float snapped to bottom-right of `#text-area-wrap` with 35 px margin.
  - `MutationObserver` on `#btn-play` auto-collapses sidebar when TTS starts from any trigger.
  - `mousemove` on `#text-area-wrap` shows reading controls (`.rc-mouse-active`) and hides 2.5 s after mouse stops.
  - Global `keydown`: spacebar → `togglePlayPause()` (ignored when focus is on form elements).
  - CSS: added `.reading-controls.rc-mouse-active { opacity: 1; }`.
- **2026-03-03 — batch 2** (`js/progress.js`):
  - Resume modal now has a "Cancelar" (✕) button → `fallbackCargar()`.
  - "Continuar" sets `window._noAutoVideo = true` (600 ms) to block auto-open of cinematic video mode.
- **2026-03-05 — batch 20** (`index.html` · `js/init-extra.js` · `style.css`) — Headers sidebar no colapsan + colores #lg-body:

  ### Problemas corregidos
  1. **Headers internos colapsaban el sidebar**: los `onclick` de `sb-section-hdr` llamaban a `_sbRailToggle()` que contiene lógica de colapso del sidebar. Al hacer click en un header con el mismo `icId` que `_activeSbRailId`, colapsaba el sidebar en vez de solo cerrar la sección.
  2. **Texto oscuro en `#lg-body` / `#sb-mis-libros-slot-inner`**: contenido inyectado por `biblioteca.js` con colores legacy que no respondían a los tokens del tema.

  ### Cambios en `js/init-extra.js`
  - Nueva función `window._sbSectionToggle(icId, sectionId)`: solo abre/cierra la sección. Si ya está abierta → `classList.remove('open')` + limpia tracking. Si está cerrada → `_sbOpenSection()`. **Nunca colapsa el sidebar.**
  - `_sbRailToggle()` sin cambios — sigue siendo el handler del rail (colapsa en 2do clic).

  ### Cambios en `index.html`
  - `sb-section-mis-libros` hdr onclick: `_sbRailToggle` → `_sbSectionToggle`
  - `sb-section-capitulos` hdr onclick: `_sbRailToggle` → `_sbSectionToggle`
  - `sb-section-marcadores` hdr onclick: `_sbRailToggle` → `_sbSectionToggle`
  - `#ch-active-preview` onclick: `_sbRailToggle` → `_sbSectionToggle`

  ### Cambios en `style.css`
  - Nuevo bloque CSS para `#lg-body`, `#sb-mis-libros-slot-inner` y sus hijos: normaliza `color` a `--nav-chrome`, hover a `--nav-hover`, títulos a `--text-primary`, inputs a tokens del tema.

  **Funciones nuevas:**
  | Función | Comportamiento |
  |---|---|
  | `window._sbSectionToggle(icId, sectionId)` | Toggle de sección sin colapsar sidebar |

- **2026-03-04 — batch 18** (`index.html` · `style.css` · `js/init-extra.js`) — Alineación ícono rail↔sidebar + búsqueda funcional:

  ### Problemas corregidos
  1. **Íconos no coincidían** entre rail y sección del sidebar:
     - "Mis libros" icon: `📚` → `<span class="material-symbols-outlined">newsstand</span>` (igual que rail `ic-biblioteca`)
     - "Capítulos" icon: `≡` → `☰` (igual que rail `ic-chapters`)
  2. **Desincronización `_activeSbRailId`**: los `onclick` de section headers usaban `this.closest('.sb-section').classList.toggle('open')` → no notificaban al sistema de tracking. Secciones con rail button ahora usan `_sbRailToggle(icId, sectionId)` en el header.
  3. **`ic-buscar` roto**: mezclaba `_sbRailToggle` + `abrirBuscador`, causando que el segundo clic colapsara el sidebar antes de que la búsqueda pudiera activarse. Reemplazado por `_sbBuscarToggle()` dedicada.

  ### Cambios en `index.html`
  - `sb-section-mis-libros` hdr onclick: → `_sbRailToggle('ic-biblioteca','sb-section-mis-libros')`
  - `sb-section-capitulos` hdr onclick: → `_sbRailToggle('ic-chapters','sb-section-capitulos')`
  - `ic-buscar` onclick: → `_sbBuscarToggle()`
  - `ic-marcadores` onclick: removida llamada a `abrirMarcadores` (marcadores viven dentro de `sb-section-capitulos` que ya se abre)

  ### Cambios en `style.css`
  - `.sb-section-ico .material-symbols-outlined`: nueva regla, `font-size: 16px`, `color: inherit`

  ### Cambios en `js/init-extra.js`
  - `window._sbBuscarToggle()`: abre sidebar si colapsado + sección capítulos + foco en `#chapter-search` con 80ms delay; segundo clic colapsa.
  - `_sbFocusSearch()`: helper que enfoca `#chapter-search` o llama `abrirBuscador()` como fallback.
  - `_sbOpenSection()`: acepta tercer parámetro `icId`; calcula scrollTop tal que el header de la sección quede alineado verticalmente con el centro del ícono del rail.
  - `_sbRailToggle()`: pasa `icId` a `_sbOpenSection()` para scroll alineado.

- **2026-03-04 — batch 17** (`style.css` · `index.html` · `js/init-extra.js`) — Alineación visual sidebar↔rail + toggle de sidebar desde botones del rail:

  ### `style.css`
  - `.sb-section-hdr`: rediseñado con `padding: 0 10px 0 0` y `min-height: 34px` (altura igual al área de toque del rail icon).
  - `.sb-section-ico`: nuevo modelo — `width: 42px; height: 34px; display: flex; align-items/justify-content: center` — el slot del icono tiene ancho fijo equivalente al rail (48px sidebar border + borde = alineación óptica con `.ic`).
  - Colores por defecto reducidos a `var(--text-dim)` para que el sidebar sea discreto cuando está colapsado y solo resalte cuando la sección está abierta.
  - Eliminados los bloques `:has()` de batch 16 (`sb-section:has(.pill.on)`, `config-row:has(.pill.on)`) — estados activo/inactivo de features removidos per request.
  - `.sb-section.open > .sb-section-hdr .sb-section-ico`: color `var(--accent)` en estado abierto.
  - `.sb-section.open > .sb-section-hdr .sb-section-title`: color `var(--text-muted)`.

  ### `index.html`
  - Removida clase `.on` de `#ic-chapters`.
  - Añadido `id="ic-buscar"` e `id="ic-marcadores"` a los botones del rail que no tenían ID.
  - `onclick` de ic-biblioteca, ic-buscar, ic-chapters, ic-marcadores: reemplazados por `_sbRailToggle(icId, sectionId)`.
  - `ch-active-preview` onclick: cambiado de `toggleChapterList()` → `_sbRailToggle('ic-chapters','sb-section-capitulos')`.

  ### `js/init-extra.js`
  - Añadidas funciones `window._sbRailToggle(icId, sectionId)`, `_sbOpenSection(sectionId, collapseOthers)`, `_sbSyncToggleIcon(isCollapsed)`.
  - Lógica: sidebar colapsado + click → expandir + abrir sección; mismo botón con sidebar abierto → colapsar; botón diferente → cambiar sección.
  - IIFE de patch en `ic-toggle-sidebar.onclick` para limpiar `_activeSbRailId` cuando el botón dedicado colapsa el sidebar y proveer fallback si `toggleSidebarPanel` no existe.
  - Variable módulo `_activeSbRailId` trackea qué botón del rail "abrió" el sidebar.

  **Clases/IDs nuevos:**
  | Elemento | Cambio |
  |---|---|
  | `#ic-buscar` | ID añadido al rail button Buscar |
  | `#ic-marcadores` | ID añadido al rail button Marcadores |
  | `window._sbRailToggle` | nueva función global |
  | `_activeSbRailId` | variable de módulo en init-extra.js |

- **2026-03-04 — batch 16** (`style.css` · `index.html`) — Rediseño visual del sidebar: jerarquía, estados activo/inactivo y coherencia rail↔secciones:

  ### Mejoras en `style.css`
  - `.sb-section-hdr`: añadida `border-left: 2px solid transparent` + transición. La barra izquierda se activa en estado abierto o con features activas.
  - `.sb-section.open > .sb-section-hdr`: `border-left-color: var(--accent-dim)` + `sb-section-title` más legible.
  - `.sb-section:has(.pill.on) > .sb-section-hdr .sb-section-ico`: icono en `var(--accent)` cuando hay features activas en la sección — CSS puro sin JS.
  - `.sb-section:has(.pill.on):not(.open) > .sb-section-hdr`: borde izquierdo prominente (`var(--accent)`) cuando la sección está colapsada pero tiene features ON, para indicar actividad sin expandirla.
  - `.config-row:has(.pill.on)`: fondo `var(--accent-glow)` + `config-label` más brillante cuando la feature está activa.
  - `.sb-tts-engine-btn.active`: añadido `box-shadow: inset 0 0 0 1px var(--accent-dim)` para mayor énfasis.
  - `.pill`: aumentado a 30×14 px + `border: 1px solid var(--border)`. Estado ON: `border-color: var(--accent-dim)` + thumb con `box-shadow`.
  - `.ic.on::after`: cambiado `background: none` → `background: var(--accent)` (indicador visual de icono activo en el rail).
  - `.sb-section`: añadido `position: relative` para futuros pseudo-elementos.
  - `.sb-section-title`: aumentado de `0.44rem` a `0.46rem`.
  - `.sb-section-ico`, `.sb-section-arrow`: añadidas transiciones de color.

  ### Mejoras en `index.html`
  - `sb-section-hdr` de cada sección: añadidos IDs (`sb-hdr-mis-libros`, `sb-hdr-libro`, `sb-hdr-capitulos`, `sb-hdr-tts`, `sb-hdr-config`) para targeting desde JS.
  - Icono de "Capítulos": cambiado de `≡` → `☰` para mejor legibilidad a tamaño pequeño.
  - Sin cambios a scripts inline; toda la lógica permanece en los archivos JS.

  **Clases CSS nuevas/modificadas:**
  | Selector | Cambio |
  |---|---|
  | `.sb-section` | + `position: relative` |
  | `.sb-section-hdr` | + `border-left: 2px solid transparent`, transición |
  | `.sb-section.open > .sb-section-hdr` | `border-left-color: var(--accent-dim)` |
  | `.sb-section:has(.pill.on) > .sb-section-hdr .sb-section-ico` | `color: var(--accent)` |
  | `.sb-section:has(.pill.on):not(.open) > .sb-section-hdr` | `border-left-color: var(--accent)` |
  | `.config-row:has(.pill.on)` | `background: var(--accent-glow)` |
  | `.config-row:has(.pill.on) .config-label` | `color: var(--text-primary)` |
  | `.ic.on::after` | `background: var(--accent)` (antes `none`) |
  | `.pill` | 30×14px, border, thumb con box-shadow |
  | `.sb-tts-engine-btn.active` | + `box-shadow: inset` |

- **2026-03-04 — batch 15** (`js/tts.js` · `js/init.js` · `js/settings-bridge.js` · `index.html` · `style.css`) — Fix almacenamiento con sesión + secciones colapsables en sidebar y modal de ajustes:

  ### Bug 1 — Toasts redundantes en auth:ready (almacenamiento)
  - `init.js auth:ready` llamaba `toggleServidorLive()` para restaurar el estado TTS local → disparaba `verificarServidorTTS()` + toast "✓ TTS Local activado" en cada recarga si el usuario lo tenía activo
  - `_restaurarVoces()` llamaba `setEdgeTtsVoice()` → mostraba "✓ Voz: XNeural" en cada recarga
  - Fix: `tts.js` expone `window._applyStoredTTSPrefs()` — restaura `_edgeTtsVoice` y `_usarServidorLive` desde uStorage + llama `_sincronizarBtnServidorLive()` sin toasts ni verificación de servidor
  - `init.js` auth:ready usa `_applyStoredTTSPrefs()` en lugar de `toggleServidorLive()`
  - `init.js _restaurarVoces()`: actualiza los selects de voz directamente (sin `setEdgeTtsVoice`, sin toast)

  ### Bug 2 — Proveedores no aplicados a módulos en auth:ready
  - `_syncProviderSelects()` actualizaba el DOM de los selects pero NO llamaba las funciones de módulo (`cambiarProveedorHumanizer`, `cambiarProveedorTraduccion`, etc.)
  - Las variables internas de módulo quedaban en defaults hasta que el usuario abría el settings panel
  - Fix: `settings-bridge.js auth:ready` agrega un `setTimeout(0)` que llama `cambiarProveedorHumanizer/Universo/Traduccion/Musica` con el valor guardado, y `_activarProv` para el proveedor de imágenes del popup video

  ### Feature — Secciones colapsables en sidebar izquierdo
  - `index.html` sidebar: el contenido de `sb-head` (libro activo) y la lista de capítulos ahora están envueltos en `.sb-section.open#sb-section-libro` y `.sb-section.sb-section-xl.open#sb-section-capitulos` respectivamente
  - Ambas secciones arrancan abiertas (`class="sb-section open"`)
  - `style.css`: añadida regla `.sb-section.sb-section-xl.open .sb-section-body { max-height: 60vh }` para secciones con contenido de altura variable

  ### Feature — Secciones colapsables en modal de ajustes (panel derecho)
  - `index.html` settings-panel: cada sección ("Tema visual", "TTS & Audio", "Lectura", "API Keys & Proveedores", "Reemplazos automáticos") envuelta en `.sp-section` con `.sp-section-hdr` / `.sp-section-body`
  - "Tema visual" y "TTS & Audio" arrancan abiertas; las demás cerradas
  - `style.css`: añadidas clases `.sp-section`, `.sp-section-hdr`, `.sp-section-title`, `.sp-section-arrow`, `.sp-section-body`, `.sp-section-body-inner` con el mismo patrón de animación que `.sb-section`
  - Los `settings-section-label` originales (con línea horizontal) se eliminaron de esas secciones y se reemplazaron por los headers `.sp-section-hdr`

  **Clases CSS nuevas:**
  | Clase | Descripción |
  |---|---|
  | `.sp-section` | Sección colapsable del settings panel |
  | `.sp-section.open` | Estado expandido |
  | `.sp-section-hdr` | Cabecera clicable con cursor:pointer |
  | `.sp-section-title` | Label en DM Mono uppercase accent |
  | `.sp-section-arrow` | Chevron que rota 90° al abrir |
  | `.sp-section-body` | Cuerpo con max-height 0 → 1200px |
  | `.sp-section-body-inner` | Padding-bottom interno |
  | `.sb-section.sb-section-xl` | Override max-height 60vh para secciones altas |

- **2026-03-04 — batch 14** (`js/settings-bridge.js` · `js/init.js` · `js/auth-ui.js` · `index.html`) — Análisis quirúrgico definitivo del sistema de persistencia + menú de sesión en rail icon:

  ### Diagnóstico raíz (post análisis de ustorage.js)

  Con `ustorage.js` confirmado, el fallo es **estructural por timing de prefijo**:

  ```
  Página carga
  ├─ _currentPrefix = 'guest'
  ├─ DOMContentLoaded (todos los módulos)
  │   ├─ settings-bridge: uGet('tts_rate') → busca 'guest_tts_rate' → NULL (datos en 'user_XXXX_tts_rate')
  │   ├─ settings-bridge: syncSelect('universe_provider') → NULL → select queda en default
  │   └─ todos los selects y sliders quedan en valores HTML default
  ├─ Supabase resuelve sesión
  │   └─ auth.js: uSetUser(id) → migra guest_ → user_XXXX_, cambia prefijo
  └─ auth:ready dispara
      ├─ init.js: _restaurarToggles() → ahora sí uGet('tts_rate') = 'user_XXXX_tts_rate' ✓
      └─ NADIE llamaba _syncProviderSelects ni _sincronizarInputsApiKeys → selects siguen en default ✗
  ```

  **Bugs concretos corregidos en batch 14:**

  **Bug A — Clave humanizer: mismatch HTML vs _PILL_MAP vs init.js** (el más grave)
  - HTML: `togglePillRow(el, 'tts_humanizer_activo', cb)` → guarda como `user_XXXX_tts_humanizer_activo`
  - `_PILL_MAP` y `init.js _PREFS_TOGGLES` usaban `toggle_tts_humanizer` → lectura siempre NULL
  - Además: batch 13 cambió `_PILL_MAP` sin cambiar el HTML → pill dejó de funcionar visualmente
  - Fix: **index.html** cambiado a `toggle_tts_humanizer`, `_PILL_MAP` ya tenía la clave correcta

  **Bug B — DOMContentLoaded no tiene datos de usuarios autenticados**
  - Los datos están bajo `user_XXXX_` pero DOMContentLoaded corre con prefijo `guest`
  - Fix: `settings-bridge.js` ahora expone `window._syncProviderSelects()` y la llama en un nuevo listener `auth:ready`, que corre DESPUÉS de que `uSetUser()` haya cambiado el prefijo

  **Bug C — `openSettings()` nunca llamaba `_sincronizarInputsApiKeys()`**
  - Los provider selects (`ajustes-humanizer-provider`, etc.) viven en `#settings-panel`
  - `_sincronizarInputsApiKeys()` (ui.js) los rellena con uGet() pero solo la llamaba `abrirAjustes()` (modal obsoleto con `display:none !important`)
  - Fix: `settings-bridge.js` añade `MutationObserver` sobre `#settings-panel` → cuando recibe clase `open` llama `_sincronizarInputsApiKeys()` + `_syncProviderSelects()` + `_syncSettingsPanelSliders()`

  **Bug D — sb-tts-sliders (visibles) no se sincronizan tras auth:ready**
  - `init.js _restaurarToggles()` actualiza `#rate-control` (control oculto) ✓
  - Pero los `.sb-tts-slider` del sidebar son elementos independientes sin binding inverso
  - Fix: `init.js auth:ready` añade `setTimeout(0)` que sincroniza `sbSliders[0/1]` con `rate-control/pitch-control` incluyendo los `.sb-tts-val` labels

  **Feature: Menú de sesión en rail icon**
  - `auth-ui.js _actualizarRailCuenta(user)` ahora cambia el `onclick` de `#ic-cuenta` según estado
  - Si hay sesión activa: `onclick = _toggleCuentaRailMenu()`
  - Si no hay sesión: `onclick = abrirModalAuth()`
  - Función `_ensureCuentaRailMenu(user)`: inyecta `#ic-cuenta-menu` con nombre, email y botón "Cerrar sesión"
  - Menú posicionado con `getBoundingClientRect()` a la derecha del rail icon, `position: fixed`, z-index 20000
  - CSS inyectado dinámicamente via `_injectCuentaMenuCSS()` con animación `icMenuFade`
  - `window._cuentaRailClick` expuesta como global para el `onclick` de index.html

  **Tabla de claves canónicas (post batch 14):**
  | Preferencia | Clave uStorage | Módulo que guarda | Módulo que lee |
  |---|---|---|---|
  | Humanizer pill | `toggle_tts_humanizer` | settings-bridge / init.js | init.js, settings-bridge |
  | Proveedor universo | `universe_provider` | settings-bridge | ui.js |
  | Proveedor traducción | `translation_provider` | settings-bridge | ui.js |
  | Proveedor imágenes IA | `img_provider` | settings-bridge | ui.js |
  | TTS rate | `tts_rate` | tts.js + settings-bridge | init.js + settings-bridge |
  | TTS pitch | `tts_pitch` | tts.js + settings-bridge | init.js + settings-bridge |
  | TTS volume | `tts_volume` | tts.js + settings-bridge | init.js + settings-bridge |

- **2026-03-04 — batch 13** (`js/settings-bridge.js` · `js/init.js`) — Análisis completo del sistema de guardado/carga de preferencias + corrección de bugs críticos:

  ### Análisis del sistema de persistencia

  #### Arquitectura real (post-análisis)
  El sistema usa `ustorage.js` como wrapper de `localStorage` con prefijo `uid_<userId>_` cuando hay sesión Supabase activa, y prefijo `local_` en modo anónimo. Las preferencias se guardan inmediatamente (no hay botón "Guardar global"), excepto las que pasan por `applySettings()` del panel.

  Hay **tres capas** de UI que leen/escriben preferencias, a menudo con claves distintas para el mismo dato:
  - `tts.js` — guarda via listeners de `input` en `rate-control`, `pitch-control`, `volume-control`, `voice-select`, `edge-voice-select`
  - `init.js` — restaura en `_restaurarToggles()` / `_restaurarVoces()`, escucha `auth:ready`
  - `settings-bridge.js` — guarda via `togglePillRow()` y `cambiarProveedor*Ajustes()`, sincroniza pills en `syncSidebarPills()`

  #### Bugs encontrados y corregidos

  **Bug crítico A — Mismatch de clave: Humanizer pill**
  - `settings-bridge.js` `_PILL_MAP` guardaba con clave `tts_humanizer_activo`
  - `init.js` `_PREFS_TOGGLES` y `_restaurarToggles()` leían `toggle_tts_humanizer`
  - Resultado: el estado del pill humanizador nunca se restauraba tras recargar
  - Fix: `_PILL_MAP` cambiado a `toggle_tts_humanizer` para coincidir con `init.js`

  **Bug crítico B — Mismatch de claves: Proveedores (3 claves)**
  | `settings-bridge.js` guardaba | `ui.js _sincronizarInputsApiKeys` leía | Estado |
  |---|---|---|
  | `universo_provider` | `universe_provider` | ❌ nunca restauraba |
  | `traduccion_provider` | `translation_provider` | ❌ nunca restauraba |
  | `imgia_provider` | `img_provider` | ❌ nunca restauraba |
  - Fix: `settings-bridge.js` actualizado a las claves canónicas que lee `ui.js`
  - `syncSelect()` en DOMContentLoaded también corregido con las mismas claves

  **Bug C — Sidebar sliders (sb-tts-slider) no reflejan valores restaurados**
  - `ui-extra.js` DOMContentLoaded se registra ANTES que `init.js` y copia los sliders ocultos (aún en default 1.0)
  - Luego `init.js` restaura los sliders ocultos (`rate-control`, `pitch-control`) desde uStorage, pero los sliders visibles del sidebar ya fueron copiados con el valor incorrecto
  - Fix en `init.js` `_restaurarToggles()`: añadido `setTimeout(0)` que sincroniza `sb-tts-slider[0]` (rate) y `sb-tts-slider[1]` (pitch) + sus labels `.sb-tts-val` después del restore

  **Bug D — Settings panel sp-* sliders siempre muestran defaults al abrir**
  - Los sliders del settings panel (`sp-rate`, `sp-pitch`, `sp-vol`, `sp-edge-voice`) siempre aparecen con valor 1.0 / defaults cuando el panel se abre
  - `_sincronizarInputsApiKeys()` (llamada al abrir el VIEJO modal) no sincronizaba estos sliders
  - `openSettings()` en `theme.js` (no disponible) también podría no hacerlo
  - Fix en `settings-bridge.js`: MutationObserver sobre `#settings-panel` que detecta la adición de clase `open` y ejecuta `_syncSpSliders()` — copia valores de `rate-control`, `pitch-control`, `volume-control`, `edge-voice-select`, `voice-select` a sus equivalentes del settings panel

  #### Flujo de guardado correcto (estado post-batch 13)
  ```
  GUARDAR:
  TTS rate/pitch/vol → tts.js input listener → uSet('tts_rate'/'tts_pitch'/'tts_volume')
  TTS edge voice     → tts.js setEdgeTtsVoice() → uSet('edge_tts_voice')
  TTS browser voice  → tts.js change listener → uSet('tts_voice_idx')
  Pills sidebar      → settings-bridge.js togglePillRow() → uSet(canonical_key)
  Proveedores        → settings-bridge.js cambiarProveedor*Ajustes() → uSet(canonical_key)

  RESTAURAR (orden de ejecución en DOMContentLoaded):
  1. settings-bridge.js DOMContentLoaded → syncSelect() rellena selects de proveedores
  2. ui-extra.js DOMContentLoaded       → _sbTtsSetEngine() + copia sliders (valor aún default)
  3. init.js DOMContentLoaded           → _restaurarToggles() restaura sliders + syncTimeout→sb-sliders
                                        → _registrarListenersPrefs() registra listeners

  RESTAURAR (auth:ready — después de resolver sesión Supabase):
  4. init.js auth:ready → _restaurarToggles() + _restaurarVoces() con prefijo correcto
  5. settings-bridge.js auth:ready → syncSidebarPills() (vía init.js que lo llama)
  ```

  #### Preferencias que NO se guardan automáticamente (aún sin fix)
  - **Ancho de columna** (`texto-contenido.style.maxWidth`): el select del settings panel modifica el DOM pero no persiste en uStorage
  - **Posición X/Y del video float**: no se guarda entre sesiones
  - **Estado dock del video float** (`_vfDocked`): no persiste al recargar

- **2026-03-04 — batch 12** (`js/ui-extra.js` · `js/settings-bridge.js` · `SETTINGS-MAP.md`):
  - **Bug 1 — Video float canvas negro tras desacoplar**: `_undockVideoFloat()` reemplaza el `setTimeout(80ms)` por un doble intento más robusto: primero `rAF → rAF` (layout pass) y luego `setTimeout(200ms)` de respaldo. Ambos llaman a `_reiniciarLoopFloat()` que hace `clearRect` + resize del canvas + `_stopFloatLoop` + `_startFloatLoop`. Esto garantiza que el canvas no quede negro en máquinas lentas ni cuando el rAF del dock-DnD aún está en vuelo.
  - **Bug 2 — Preferencias no restauradas al recargar**: `settings-bridge.js` DOMContentLoaded ahora restaura sliders (`rate-control`, `pitch-control`, `volume-control`) desde uStorage con `restoreSlider()` + `dispatchEvent('input')` para propagar a labels y variables. También persiste y restaura `browser_voice` (voz del navegador), esperando el evento `voiceschanged`. Los sliders ya tenían `_bindSliderPersist` (guardado), ahora también tienen restauración.
  - **Bug 3 — Toast de confirmación al cambiar preferencia**: Todos los cambios de preferencia ahora emiten `showToast()`: pills (`togglePillRow`), motor TTS (botones Browser/Edge), voz Edge/Navegador, y todos los selects de proveedores (`cambiarProveedorHumanizerAjustes`, `...UniversoAjustes`, `...TraduccionAjustes`, `...MusicaAjustes`, `...ImgSearchAjustes`, `...ImgIADesdeAjustes`).
  - **SETTINGS-MAP.md creado**: Documento que mapea todas las preferencias del usuario con su clave uStorage, tipo, default, módulo que guarda y módulo que restaura. Incluye sección de claves pendientes de implementar.

- **2026-03-03 — batch 11** (`js/init.js` · `js/settings-bridge.js` · `js/ui-extra.js`) — Fix toggleAjusteAcc · Pills persistencia · Float loop al desacoplar · TTS sliders:
  - `js/init.js` — Eliminada la función `toggleAjusteAcc` que sobreescribía la versión correcta de `settings-bridge.js` (init.js carga después, causaba crash de `querySelectorAll` sobre `null` en todos los acordeones del settings panel).
  - `js/settings-bridge.js` — Añadidas `window.togglePillRow(rowEl, storageKey, callback)` y `window.syncSidebarPills()`. `togglePillRow` alterna la clase `.on`/`.off` de la pill, persiste en uStorage y sincroniza el checkbox oculto. `syncSidebarPills` restaura el estado visual de todas las pills desde uStorage; se llama en DOMContentLoaded y en `auth:ready`. También añadido `_bindSliderPersist` para guardar `tts_rate`, `tts_pitch`, `tts_volume` en uStorage al mover los sliders `rate-control`/`pitch-control`/`volume-control`.
  - `js/ui-extra.js` — `_undockVideoFloat()`: añadida llamada a `_startFloatLoop()` con `setTimeout(..., 50)` al desacoplar el float del dock, que causaba que el canvas quedara negro (el loop había sido cancelado por el dock y nunca se reiniciaba).

- **2026-03-03 — batch 10** (`style.css` · `js/ui-extra.js`) — Settings z-index supremo · Reading controls inteligentes · Jerarquía z-index final · Avatar rail fix:
  - `style.css` — `.settings-overlay` z-index: 10000, `.settings-panel` z-index: 10001 (por encima de todo incluido `#vf-sidebar-dock`). Jerarquía final: `text-area < video-float (9997) < vf-sidebar-dock (9998) < settings-overlay (10000) < settings-panel (10001)`. `.video-float` corregido a 9997. `#ic-cuenta { overflow:hidden }` + `.ic-cuenta-avatar` 24×24px border-radius:50%.
  - `js/ui-extra.js` — `_syncRc()`: cuando reproduciéndose ahora también remueve `rc-mouse-active` inmediatamente. Listener `mousemove` en text-area: guarda con `if (_isPlaying()) return` → cuando reproduce, los controles solo aparecen al hacer `:hover` sobre los botones mismos (CSS), no con cualquier movimiento del ratón.

- **2026-03-03 — batch 9** (`js/ui-extra.js` · `js/auth-ui.js` · `index.html` · `style.css`) — Video flotante visible · Avatar en rail · Mapeo de preferencias:
  - `js/ui-extra.js` — `window.toggleVideo()` añadido: quita/pone clase `.hidden` en `#video-float`, alterna clase `.on` en `#ic-video` e inicia `_startFloatLoop()` al mostrar. Corrige que el botón del rail no hacía nada porque la función no existía en ningún módulo.
  - `index.html` — `#ic-cuenta` añadido al div del rail. Interior reemplazado: `<span class="material-symbols-outlined" id="ic-cuenta-symbol">account_circle</span>` + `<img id="ic-cuenta-avatar" class="ic-cuenta-avatar">`. Material Symbols link actualizado para incluir `account_circle` y `bookmark_flag`.
  - `js/auth-ui.js` — `actualizarAuthUI()` extendida: además de actualizar el widget top-bar, ahora también actualiza el ícono del rail (`#ic-cuenta-symbol` / `#ic-cuenta-avatar`) mostrando la foto de Google cuando el usuario está logueado.
  - `style.css` — Añadida regla `.ic-cuenta-avatar`: 22×22 px, `border-radius:50%`, borde de acento.

- **2026-03-03 — batch 8** (`index.html` · `style.css` · `js/init-extra.js`) — Toasts deduplicados · Video oculto en carga · Paleta Light v2 · Icono folder_open:
  - `index.html` — `<link>` de Material Symbols actualizado: `icon_names` agrega `folder_open`. Rail icon `📂` reemplazado por `<span class="material-symbols-outlined">folder_open</span>`. `video-float` recibe clase `hidden` por defecto → no aparece al cargar.
  - `js/init-extra.js` — Parche de notificaciones: `window.mostrarNotificacion` y `window.mostrarNotificacionPersistente` sobrescritos para redirigir al sistema `showToast()` (elimina el div top-right duplicado). Se ejecuta al cargar y en DOMContentLoaded.
  - `style.css` — `#notification` forzado a `display:none !important` (triple regla para superar especificidad legacy). Tema `light` reescrito con paleta **Warm Linen/Terracota**: fondo `#f8f5f0`, acento `#c07822`, texto `#1e1912`, sage `#3d7a58` — contraste AA en todos los pares. Toasts invertidos (`#1e1912` bg / `#f8f5f0` text) para legibilidad sobre fondos claros. Scrollbar visible.

- **2026-03-03 — batch 7** (`style.css` · `index.html` · `js/init-extra.js`) — Acordeón API Keys · Tema Light · Toggle topbar:
  - `js/init-extra.js` — `window.toggleAjusteAcc(id)`: función que faltaba. Abre/cierra acordeones `.ajuste-seccion` en `#settings-api-section`; cierra los hermanos abiertos al abrir uno nuevo (comportamiento exclusivo).
  - `style.css` — nuevo bloque `[data-theme="light"]`: tokens de papel cálido (fondo `#faf8f4`, acento `#b05a10`), todos los tokens de diseño completos (`--bg-*`, `--text-*`, `--accent*`, `--rail-bg`, `--pill-*`, `--tts-fill`, fuentes) + reglas específicas para botones, rail, sidebar, TTS play y VFD topbar en modo claro.
  - `index.html` — botón `.tb-theme-toggle` (`#tb-theme-toggle`) añadido junto al indicador de servidor TTS. Llama a `_toggleLightDark()`.
  - `js/init-extra.js` — `window._toggleLightDark()`: alterna entre `light` y el último tema oscuro activo. Persiste el estado en `uSet('theme_mode')` y `uSet('last_dark_theme')`. Icono cambia ☀ ↔ 🌙. DOMContentLoaded restaura el modo light si estaba activo al recargar.

- **2026-03-03 — batch 6** (`style.css` + `js/ui-extra.js`) — TTS bar padding · VFD drag-to-undock · Settings z-index:
  - `style.css` — `.tts-progress-row`: added `padding: 4px 14px` and `border-radius: 2px` on track; progress bar now has lateral breathing room instead of going edge-to-edge.
  - `style.css` — `.settings-overlay` z-index raised to 10000, `.settings-panel` to 10001 (above VFD sidebar at 9998). New rule `.app.vf-docked .settings-panel.open { right: 210px }` shifts the panel left when the video dock is active, preventing overlap.
  - `style.css` — `.vfd-topbar`: added `cursor: grab` / `cursor: grabbing` for drag affordance.
  - `js/ui-extra.js` — `_startDrag` exposed as `window._startFloatDragExternal(cx, cy)` so external callers can resume float drag.
  - `js/ui-extra.js` — `_inyectarVfDock()`: after injecting dock HTML, attaches a mousedown/mousemove listener to `.vfd-topbar`. Dragging > 8px calls `_undockVideoFloat()`, repositions the float near the cursor, and resumes normal float drag via `_startFloatDragExternal`.

- **2026-03-03 — batch 5** (`style.css`) — Fix sidebar background color:
  - Legacy `.sidebar` block (section 5, line ~2252) used `background: var(--surface)`. `--surface` is not redefined in theme blocks so it fell back to the `:root` generic `#1a1814`, ignoring the active theme.
  - Changed to `background: var(--bg-panel)` — consistent with the new-layout `.sidebar` block and properly defined in all theme tokens.

- **2026-03-03 — batch 4** (`index.html`) — Sidebar collapsed on load + Material Symbols icons:
  - `.app` now initialises with class `sidebar-collapsed` → sidebar hidden on first load.
  - `#ic-toggle-sidebar` starts with icon `left_panel_open` and title "Expandir panel" to match collapsed state.
  - Material Symbols font link consolidated into a single `<link>` loading all needed icons: `account_circle, bookmark_flag, folder_open, left_panel_close, left_panel_open, newsstand, settings`.
  - Rail icon replacements: 📂 → `folder_open`, 🔖 → `bookmark_flag`, ⚙ (ajustes) → `settings`, 👤 → `account_circle` — all now use `<span class="material-symbols-outlined">`.

- **2026-03-03 — batch 3** (`js/ui-extra.js` + `style.css`) — Video Float Dock Sidebar:
  - Drag-snap: when the float's right edge reaches viewport right margin (< 64 px), `window._dockVideoFloat()` fires.
  - `#vf-sidebar-dock` (210 px wide, `position: fixed; right: 0; height: 100vh`) slides in with spring transition.
  - Layout: topbar (LIVE dot + ⊟ undock) → 16:9 canvas (mirrors float/main canvas via rAF) → REC · Cine · MP4 controls → ambient music section (EQ + track info + ▶/⏭ + 2-column genre grid + volume slider).
  - `window._undockVideoFloat()` removes dock and restores float to `right: 20px / bottom: 58px`.
  - Music state (track name, genre, EQ, active genre, REC) syncs every 350 ms without touching audio nodes.

Next steps I can do for you:
- Expand `js/` with one-line descriptions for every file.
- Produce `STRUCTURE.json` with the same tree for automation.
- Generate a dependency graph (imports/calls) for the `js/` files (requires static analysis).

Tell me which of the above you want next.

## JS Function Index (static scan)

Generated: 2026-03-03 — quick static extraction of top-level functions, async functions, and classes in `js/`.

- `auth-ui.js`
  - (no top-level function declarations detected in quick scan)
  - Dependencies: UI hooks, likely uses `ustorage` and global UI helpers.

- `auth.js`
  - (no top-level function declarations detected in quick scan)
  - Dependencies: auth endpoints, possibly `fetch`/API calls.

- `biblioteca.js`
  - Functions: `init()`, `_abrirIDB()`, `_idbGuardar()`, `_idbLeer()`, `_idbEliminar()`, `_cargarMeta()`, `_cargarMetaLocal()`, `_persistirMetaLocal()`, `_cargarMetaSupabase()`, `_guardarMetaSupabase()`, `_eliminarMetaSupabase()`, `_sincronizarConSupabase()`, `_mapSupabaseALocal()`, `_mapLocalASupabase()`, `bibAgregarArchivo()`, `_extraerPortada()`, `_blobABase64()`, `bibAbrirLibro()`
  - Dependencies: IndexedDB, Supabase API (when enabled), `mostrarNotificacion`, theme/UI callbacks.

- `bookmarks.js`
  - Functions: `_getBookId()`, `_storageKey()`, `_load()`, `_save()`, `_esc()`, `_getSnippet()`, `_getChapterTitle()`, `_formatFecha()`, `_agregarMarcador()`, `_irAMarcador()`, `_sincronizarConfigAntesDeCarga()`, `_eliminarMarcador()`, `_editarNota()`
  - Dependencies: `progresoGetBookId`, `iniciarTTS`, localStorage via `uGet`/`uSet`.

- `comic_loader.js`, `comic_reader.js`, `comic_ui.js` — REMOVED (no longer present on-disk)
  - Previously: contained many event handlers and DOM helpers for comic loading and page navigation.

- `convert_mp3.js`, `convert_mp4.js`, `export_video.js`, `export_buttons.js`
  - (media export utilities; expose async functions for conversion and download flows).

- `epub.js`
  - Functions: `cargarCapitulo(ruta, _cancelToken)` and many internal helpers and progress UI lambdas.
  - Dependencies: `mostrarNotificacion`, `ocultarNotificacionPersistente`, `aplicarOnomatopeyasAutomatico`, voice roles callbacks like `voiceRolesOnCapituloListo`.

- `library.js`
  - Functions: `lgTogglePanel()`, `lgSetMirror(url)`, `lgSetType(type)`, `lgBuscar()`, `lgPaginar(dir)`, `lgEjecutarBusqueda(query, type)`, `lgFetch(params)`, `lgRenderResultados(data, type, container)`, `lgCardEdicion(item)`, `lgCardAutor(item)`, `lgCardSerie(item)`, `lgVerArchivos(editionId, btnEl)`, `lgRenderArchivos(files, container, bookTitle)`, `lgDescargarArchivo(md5, ext, title, btnEl)`, `lgVerDetalle(editionId)`, `lgBuscarPorAutor(autorId, nombre)`, `lgBuscarPorSerie(serieId, titulo)`, utility `_escLg`, `_formatBytes`, and `window.abrirBiblioteca`.
  - Dependencies: server API endpoints, `showToast`/UI helpers.

- `init.js`, `init-extra.js`, `ui-extra.js`
  - Functions and window-scoped helpers: `_toggleEditarTexto`, `_actualizarChPreview`, `toggleAjusteAcc`, `_toggleImgProvMenu`, `_toggleMusicMenu`, `minimizeVideoFloat`, many DOM event handlers and small utilities.

- `main.js`
  - Functions: `mostrarNotificacion(mensaje)`, `mostrarNotificacionPersistente(mensaje)`, `ocultarNotificacionPersistente()`, `actualizarEstadisticas()`, `marcarCambioPendiente()`, `aplicarConfiguracion()` (async), `toggleAutoTranslate()`, `toggleAutoNext()`, `toggleAutoPlay()`.
  - Dependencies: `uGet`/`uSet`, translation/humanizer settings, DOM elements for counters.

- `manga.js`, `manga_ocr.js` — REMOVED (no longer present on-disk)
  - Previously: manga navigation and OCR helpers; included functions to load pages and OCR via `tesseract` wasm files.

- `player.js`, `video.js`
  - `video.js` functions: `toggleGrabacion()`, `iniciarGrabacion()`, `detenerGrabacion()`, `descargarAudio()`, `_aplicarNavBtnState`, `abrirvideo()`, `cerrarvideo()`, and rendering helpers `wrapText`, `measureTextBlock`, `drawvideoScene`, `drawStrokedText`, `rendervideoFrame`, `cycleFloatSize`.
  - Dependencies: MediaRecorder, canvas APIs, file downloads.

- `progress.js`
  - Functions: `_getBookId(filename)`, `_storageKey(bookId)`, `_getProgress(bookId)`, `_saveProgress(bookId, chapter, sentenceIndex, chapterTitle)`, `_clearProgress(bookId)`, `_getChapterTitle()`, `_getCurrentSentenceIndex()`, `_actualizarSidebarProgreso()`, `_startAutoSave()`, `_stopAutoSave()`, `_inyectarEstilosModal()`, `_mostrarModal(progreso, onContinuar, onEmpezarDesdeInicio)`, `_escProgress`, `_sincronizarConfigAntesDeCarga()`, `_irAProgresoGuardado(progreso, archivosDisponibles)`, and `window.onCapituloCargado` handler.
  - Dependencies: localStorage, sidebar update functions.

- `settings-bridge.js`
  - Several `window.*` bridge functions: `toggleAjusteAcc`, `cambiarProveedorHumanizerAjustes`, `guardarHumanizerKeyDesdeAjustes`, `cambiarProveedorUniversoAjustes`, `cambiarProveedorTraduccionAjustes`, `guardarTranslateKeyDesdeAjustes`, `guardarLtDesdeAjustes`, etc. They bridge settings UI to underlying logic (`uSet`, provider change functions).

- `theme.js`
  - Functions: `init()`, `applyThemeDOM(theme)`, `window.selectTheme(theme)`, `window.openSettings()`, `window.closeSettings()`, `window.closeSettingsOverlay(e)`, `window.applySettings()`, `_updateThemeCards(theme)`, `window.syncMusicUI(theme, open)`, `window.toggleMusic()`, `window._syncMusicLabel()`, `window.toggleVideo()`, `window.minimizeVideoFloat()`.
  - Dependencies: `uGet`/`uSet`, DOM theme card elements, CSS variables in `css/`.

- `tts.js`
  - Functions: `_getTTSApiURL()`, `toggleServidorLive()`, `_sincronizarBtnServidorLive()`, `setEdgeTtsVoice(voice)`, `verificarServidorTTS()` (async), `_normalizarTextoTTS(texto)`, `generarAudioLocal(texto, opts)` (async), `_preFetchOracion(index)`, `_limpiarTTSCache()`, `leerOracionLocal(index, audioUrlPreGenerada)`, `cargarVoces()` and event handlers for rate control.
  - Dependencies: local TTS server (xtts), `ustorage`, `voice-roles` functions, audio element management.

- `ui.js`
  - Many DOM/UI utilities: `toggleSubPanel(bodyId, arrowId)`, `_getReemplazosKey()`, `cargarReemplazosParaArchivo(filename)`, `_persistirReemplazos()`, `_actualizarContextoReemplazos()`, `aplicarTexto()` (async), `limpiarEditor()`, `copiarTexto()`, `toggleEditor()`, `reemplazarPalabra()`, `limpiarReemplazosGuardados()`, `actualizarBotonLimpiarReemplazos()`, `renderListaReemplazos()`, `eliminarReemplazo(buscar)`, `toggleReemplazar()`, `abrirModalReemplazos()`, `cerrarModalReemplazos()`, `renderModalReemplazos()`, `filtrarCapitulos(query)`, `poblarSelectorIdioma()`, `cambiarIdiomaTraduccion(langCode)`, `toggleImagenIAPanel()`, `seekTTS(event)`, progress mouse handlers, `abrirAjustes(solapa)`, `cerrarAjustes()`, `cambiarSolapa(nombre)`, and many `_toggle*` helpers for key areas.
  - Dependencies: `uGet`/`uSet`, TTS/player hooks, voice-roles, `epub.js` chapter loaders.

- `ustorage.js`
  - Provides `uGet`, `uSet`, `uRemove` helpers (localStorage abstraction) and JSON parsing safety.
  - Dependencies: browser `localStorage`.

- `voice-roles.js`
  - Functions: `_vrKey()`, `guardarVoiceRoles()`, `cargarVoiceRoles()`, `_vrEsFemenino(texto)`, `_detectarRolOracion(texto, anterior, textoOrig, posOrig)`, `getVozParaOracion(texto, anterior)`, `getVozParaIndice(index)`, `_recalcularConTextoOriginal(oraciones, textoOriginal)`, `recalcularSentenceVoiceIndex()`, `_aplicarHeuristicasPersonajes()`, `_analizarPersonajesConIA()` (async), `renderizarUIVoiceRoles()`, `_vrCrearFila(nombre, vozActual, eliminable, labelOverride)`, `_vrPoblarSelect(selectEl, valorActual)`, `_vrAgregarPersonaje()`.
  - Dependencies: TTS voice lists, optional IA humanizer endpoints (claude/openrouter), `uGet`/`uSet`.

- `xtts-status.js`
  - (provides status sync for external TTS server; quick-scan didn't list explicit top-level functions)

Notes:
- This is a static, best-effort extraction from the repository files — it lists top-level functions, many window-scoped helpers, and obvious dependencies referenced in the code (calls to `uGet`, `uSet`, `showToast`, `mostrarNotificacion`, other `window.*` hooks).
- I focused on the files most relevant to UI, theme and TTS flows. If you want a fully exhaustive per-file AST (every inner function and closure), I can run a deeper parse and produce JSON output, but that will take longer.

Next: should I (choose one)

- expand every `js/` entry with one-line descriptions for each function (detailed), or
- produce `STRUCTURE.json` containing this same index as JSON, or
- run a deeper AST parse to list nested functions and exact call-graph (requires more time)?

## Style / CSS Map

Summary of major style sections, tokens and key selectors in `style.css` (extracted from file headers and top-level blocks):

- Design tokens & variables
  - Root fallbacks: `:root` contains generic tokens like `--bg`, `--surface`, `--border`, `--accent`, `--text`, `--font-*`, `--body-size`, `--body-lh`.
  - Theme blocks: `[data-theme="ember"]`, `[data-theme="mercury"]`, `[data-theme="folio"]`, `[data-theme="graphite"]`, plus `ghost`, `crimson`, `abyss`, `dark`, `minimal` — each overrides color, `--bg-*`, `--text-*`, `--accent`, `--rail-bg`, fonts and glow tokens.

- Layout & structure
  - `.app`, `.rail`, `.sidebar`, `.reading-wrap`, `.reading-topbar`, `.text-area`, `#texto-contenido` — core app frame and reading area styles.
  - Icon rail: `.rail`, `.ic`, `.ic.on`, `.ic-sep`.
  - Sidebar: `.sidebar`, `.sb-head`, `.sb-book-title`, `.sb-progress`, `.sb-leer-wrap`, `.btn-leer`, `.sb-config`, `.pill`, `.pill-thumb`.

- TTS & Controls
  - `.tts-bar`, `.tts-play`, `.tts-stop`, `.tts-track`, `.tts-fill`, `.tts-thumb`, `.tts-info`, `.tts-sentence.active`.
  - Sliders: `.m-vol-slider`, `.mf-vol-bar`, `.mg-vol-input`, `.settings-range` — now include `appearance`, `-moz-appearance`, `-webkit-appearance` tokens.

- Music player variants
  - `.music-ember`, `.music-mercury`, `.music-folio`, `.music-graphite` — per-theme music UI blocks with `.eq`, `.m-btn`, `.m-art`, `.m-info`.

- Video float
  - `.video-float`, `.vid-header`, `.vid-screen`, `.vid-subtitle`, `.vid-controls`, `.vid-filmstrip`.

- Settings & Theme selector
  - `.settings-overlay`, `.settings-panel`, `.settings-header`, `.settings-body`, `.settings-section-label`, `.theme-grid`, `.theme-card`, `.theme-preview`, `.theme-opt-btn`, `.theme-opt-dot`.

- UI Components
  - Toasts: `#toast-stack`, `.toast-item`.
  - Theme previews: `.tp-rail`, `.tp-sidebar`, `.tp-reading`, `.tp-tts` and `.tp-*` theme sub-classes for preview colors.

- Utilities & helpers
  - Utility selectors and classes scattered through file: `.hidden`, `.ml-auto`, spacing helpers, `.chip`, `.btn-reset`, `.rec-btn-inline`, etc. (file contains many small utility classes used throughout `index.html`).

- Responsive & Overrides
  - The file includes `@media` and cascade-note sections where NEW layout definitions intentionally override legacy selectors; search for duplicated selectors (e.g., `.sidebar`, `#texto-contenido`) when changing layout.

Notes & recommendations:

- `style.css` is a unified, concatenated stylesheet — it documents that `layout.css` and `components.css` were merged into it; when editing, prefer changing the smaller module (`css/layout.css` or `css/components.css`) and then updating `style.css` if you maintain build steps.
- Theme changes should target variables in the `[data-theme="..."]` blocks, not deep selectors.
- Sliders and range inputs now include all three appearance properties to avoid editor vendorPrefix warnings.

If you want, I can now:

- append a full list of CSS variables used across the file (JSON or table), or
- generate `STYLE_MAP.json` with the section-to-selectors mapping, or
- extract and list every utility class defined in the stylesheet.
---

## CSS Variables

Todos los custom properties definidos en `:root` y cada `[data-theme]`. Celda vacía = hereda `:root`. El tema `light` (batch 7) no está en el archivo fuente original.

| Token | :root | ember | mercury | folio | graphite | ghost | crimson | abyss | dark | minimal |
|---|---|---|---|---|---|---|---|---|---|---|
| `--accent` |  | #e8a44e | #60a8e8 | #d4705a | #52c49a | #60a8e8 | #d4705a | #52c49a | #6ea8fb | #2b6cb0 |
| `--accent-dim` |  | rgba(232,164,78,0.25) | rgba(96,168,232,0.22) | rgba(212,112,90,0.22) | rgba(82,196,154,0.22) |  |  |  |  |  |
| `--accent-glow` |  | rgba(232,164,78,0.12) | rgba(96,168,232,0.1) | rgba(212,112,90,0.08) | rgba(82,196,154,0.08) |  |  |  |  |  |
| `--accent2` |  | #7eb8a4 | #e88060 | #7ea898 | #c49a52 | #e88060 | #7ea898 | #c49a52 | #9be7c4 | #68d391 |
| `--accent2-dim` |  | rgba(126,184,164,0.25) | rgba(232,128,96,0.22) | rgba(126,168,152,0.22) | rgba(196,154,82,0.22) |  |  |  |  |  |
| `--accent2-rgb` |  | 126,184,164 | 232,128,96 | 126,168,152 | 196,154,82 |  |  |  |  |  |
| `--bg` |  | #0d0b09 | #090c12 | #0c0a0a | #080a0e | #090c12 | #0c0a0a | #080a0e | #080809 | #ffffff |
| `--bg-base` |  | #0d0b09 | #090c12 | #0c0a0a | #080a0e |  |  |  | #080809 | #ffffff |
| `--bg-elevated` |  | #181410 | #0f1220 | #181212 | #0e1018 |  |  |  |  | #f5f5f5 |
| `--bg-hover` |  | rgba(232,164,78,0.05) | rgba(96,168,232,0.04) | rgba(212,112,90,0.04) | rgba(82,196,154,0.04) |  |  |  |  |  |
| `--bg-panel` |  | #0d0b09 | #090c12 | #0c0a0a | #080a0e |  |  |  |  | #ffffff |
| `--bg-surface` |  | #120f0b | #0b0e16 | #100d0d | #0a0c10 |  |  |  |  | #fbfbfb |
| `--body-lh` |  | 1.95 | 2 | 1.9 | 1.95 |  |  |  |  |  |
| `--body-size` |  | 0.77rem | 0.76rem | 0.85rem | 0.78rem |  |  |  |  |  |
| `--border` |  | rgba(255,255,255,0.05) | rgba(255,255,255,0.05) | rgba(255,255,255,0.05) | rgba(255,255,255,0.05) | #1a2030 | #281a18 | #162028 | #252528 | #e6e6e6 |
| `--border-strong` |  | rgba(255,255,255,0.09) | rgba(96,168,232,0.12) | rgba(212,112,90,0.15) | rgba(82,196,154,0.12) |  |  |  |  |  |
| `--ch-title-size` |  | 1.05rem | 1.1rem | 1.25rem | 1.05rem |  |  |  |  |  |
| `--font-body` |  | 'Literata', Georgia, serif | 'Literata', Georgia, serif | 'Cormorant Garamond', Georgi… | 'Literata', Georgia, serif |  |  |  |  |  |
| `--font-deco` |  | 'Bebas Neue', sans-serif | 'DM Mono', monospace | 'Bebas Neue', sans-serif | 'DM Mono', monospace |  |  |  |  |  |
| `--font-display` |  | 'Playfair Display', Georgia,… | 'Crimson Pro', Georgia, serif | 'Cormorant Garamond', Georgi… | 'Literata', Georgia, serif |  |  |  |  |  |
| `--font-ui` |  | 'DM Mono', monospace | 'DM Mono', monospace | 'DM Mono', monospace | 'DM Mono', monospace |  |  |  |  |  |
| `--glow` |  | radial-gradient(circle at 80… | radial-gradient(circle at 10… | radial-gradient(circle at 90… | radial-gradient(circle at 20… |  |  |  |  |  |
| `--ic-active-bg` |  | rgba(232,164,78,0.1) | rgba(96,168,232,0.1) | rgba(212,112,90,0.08) | rgba(82,196,154,0.08) |  |  |  |  |  |
| `--pill-on` |  | rgba(232,164,78,0.28) | rgba(96,168,232,0.25) | rgba(212,112,90,0.25) | rgba(82,196,154,0.22) |  |  |  |  |  |
| `--pill-thumb` |  | #e8a44e | #60a8e8 | #d4705a | #52c49a |  |  |  |  |  |
| `--rail-bg` |  | #0a0806 | #07090e | #0a0808 | #060809 |  |  |  |  | #f5f5f5 |
| `--sidebar-w` | 100% |  |  |  |  |  |  |  | 300px | 300px |
| `--surface` |  |  |  |  |  | #0b0e16 | #100d0d | #0a0c10 | #0f0f10 | #fbfbfb |
| `--surface2` |  | #181410 | #0f1220 | #181212 | #0e1018 | #08090e | #0a0808 | #06080e | #151516 | #f5f5f5 |
| `--text` |  | #f0e8d8 | #d0e8ff | #f5ece8 | #e8f5f0 | #dce8f0 | #e8dcd8 | #d8e8e0 | #e6eef8 | #111827 |
| `--text-body` |  | rgba(210,195,175,0.75) | rgba(180,195,220,0.7) | rgba(225,210,198,0.65) | rgba(185,200,210,0.65) |  |  |  |  |  |
| `--text-dim` |  | rgba(255,255,255,0.1) | rgba(255,255,255,0.08) | rgba(255,255,255,0.08) | rgba(255,255,255,0.08) | #3a4858 | #584540 | #3a5048 | #6d7680 | #9ca3af |
| `--text-muted` |  | rgba(255,255,255,0.22) | rgba(255,255,255,0.22) | rgba(255,255,255,0.2) | rgba(255,255,255,0.2) | #6a7888 | #887068 | #688070 | #9aa6b0 | #6b7280 |
| `--text-primary` |  | #f0e8d8 | #d0e8ff | #f5ece8 | #e8f5f0 |  |  |  | #e6eef8 | #111827 |
| `--tts-fill` |  | linear-gradient(90deg, #e8a4… | linear-gradient(90deg, #60a8… | linear-gradient(90deg, #d470… | linear-gradient(90deg, #52c4… |  |  |  |  |  |

---

## Style Map — secciones → selectores

### 1 · Reset
- *(sin selectores de clase/id)*

### 1 · RESET
- *(sin selectores de clase/id)*

### 2 · DESIGN TOKENS — :root fallback + [data-theme] blocks
- *(sin selectores de clase/id)*

### 3 · THEME SELECTOR UI (buttons in settings sidebar)
- `.theme-grid`
- `.theme-opt-btn`
- `.theme-opt-btn:hover`
- `.theme-opt-btn.active`
- `.theme-opt-dot`
- `.theme-opt-info`
- `.theme-opt-name`
- `.theme-opt-desc`

### 4 · NEW LAYOUT SYSTEM
- `.app`
- `.app::before`
- `.rail`
- `.ic`
- `.ic:hover`
- `.ic.on`
- `.ic.on::after`
- `.ic-sep`
- `.sidebar`
- `.sidebar.collapsed`
- `.app.sidebar-collapsed .sidebar`
- `.sb-head`
- `.sb-book-tag`
- `.sb-book-title`
- `.sb-book-meta`
- `.sb-progress`
- `.sb-prog-bar`
- `.sb-prog-fill`
- `.sb-prog-pct`
- `.sb-search`
- `.sb-search:focus`
- `.ch-list`
- `.ch-item`
- `.ch-item:hover`
- `.ch-item.active`
- `.ch-num`
- `.ch-item.active .ch-num`
- `.sb-leer-wrap`
- `.btn-leer`
- `.btn-leer:hover`
- `.sb-section`
- `.sb-section-hdr`
- `.sb-section-hdr:hover`
- `.sb-section-ico`
- `.sb-section-title`

### 5 · LEGACY COMPONENT STYLES
- `.main-panel`
- `.top-bar`
- `.export-btn:disabled`
- `.export-btn:not(:disabled)`
- `.stats-bar`
- `.stat`
- `.btn-copy-reading`
- `.reading-area`
- `#texto-contenido`
- `.progress-wrap`
- `.progress-track`
- `.progress-fill`
- `#main-progress-tooltip`
- `.app-footer`
- `.tts-status-bar`
- `.editor-panel`
- `.editor-inner`
- `#editor-texto`
- `.editor-actions`
- `.sidebar`
- `.sidebar-section`
- `.section-label`
- `.file-label`
- `#file-name`
- `#chapters`
- `.toggle-row`
- `.toggle`
- `.toggle-slider`
- `#translation-status`
- `.replace-pair`
- `.tts-btn-grid`
- `.slider-row`
- `.slider-label`
- `.tts-control-bar select#edge-voice-select`
- `.btn`

### 6 · UI COMPONENTS — Accordions · Voice Roles
- `#ajustes-scroll-content::-webkit-scrollbar`
- `#ajustes-scroll-content::-webkit-scrollbar-track`
- `#ajustes-scroll-content::-webkit-scrollbar-thumb`
- `#ajustes-scroll-content`
- `.ajuste-seccion`
- `.ajuste-acc-btn`
- `.ajuste-seccion.open > .ajuste-acc-btn`
- `.ajuste-acc-titulo`
- `.ajuste-badge`
- `.ajuste-modo`
- `.ajuste-acc-spacer`
- `.ajuste-acc-chevron`
- `.ajuste-seccion.open > .ajuste-acc-btn .ajuste-acc-chevron`
- `.ajuste-acc-body`
- `.ajuste-seccion.open > .ajuste-acc-body`
- `.ajuste-label`
- `.ajuste-select`
- `.ajuste-input`
- `.ajuste-input-full`
- `.ajuste-btn`
- `.ajuste-btn-alt`
- `.ajuste-row`
- `.ajuste-nota`
- `.ajuste-key-status`
- `.ajuste-key-area`
- `.voice-roles-panel`
- `.voice-roles-title`
- `.voice-roles-row`
- `.voice-roles-label`
- `.voice-roles-select`
- `.voice-roles-test-btn`
- `.voice-roles-del-btn`
- `.voice-roles-add-btn`
- `.voice-roles-status`
- `.settings-divider`

---

## Utility Classes

Clases de un solo selector con rol de helper, estado, layout o prefijo de componente (`tp-`, `vr-`, `vsb-`, `vfd-`, etc.).

| Clase | Propiedades clave |
|---|---|
| `.ajuste-label` | font-size: 0.57rem; color: var(--text-dim) |
| `.ajuste-row` | display: flex; gap: 6px |
| `.ambient-collapse-btn` | font-size: 0.6rem; color: var(--text-dim) |
| `.ambient-vol-icon` | font-size: 0.75rem; color: var(--text-dim) |
| `.ambient-vol-row` | display: flex; align-items: center |
| `.btn-full` | width: 100% |
| `.btn-secondary` | background: var(--surface2); color: var(--text-muted) |
| `.config-label` | font-size: 0.48rem; color: var(--text-muted) |
| `.config-row` | display: flex; justify-content: space-between |
| `.ic-sep` | height: 1px; width: 20px |
| `.img-galeria-grid` | display: grid; grid-template-columns: repeat(3, 1fr) |
| `.img-key-row` | display: flex; gap: 4px |
| `.img-loading` | display: flex; flex-direction: column |
| `.img-prov-dot` | width: 8px; height: 8px |
| `.mf-title` | font-family: var(--font-deco); font-size: 0.48rem |
| `.mf-vol` | display: flex; align-items: center |
| `.mf-vol-bar` | flex: 1; appearance: none |
| `.mf-vol-label` | font-size: 0.44rem; color: var(--text-muted) |
| `.modal-row` | display: flex; align-items: center |
| `.mp-icon` | font-size: 13px; color: var(--accent) |
| `.mp-name` | font-size: 0.5rem; color: var(--text-primary) |
| `.mp-type` | font-size: 0.44rem; color: var(--accent) |
| `.pill` | width: 28px; height: 13px |
| `.pill-thumb` | position: absolute; width: 9px |
| `.progress-wrap` | flex-shrink: 0; padding: 0 28px |
| `.sb-leer-wrap` | padding: 8px 12px; flex-shrink: 0 |
| `.sb-prog-bar` | flex: 1; height: 2px |
| `.sb-tts-engine-row` | display: flex; gap: 5px |
| `.sb-tts-label` | font-size: 0.43rem; letter-spacing: 0.06em |
| `.sb-tts-rate-row` | display: flex; align-items: center |
| `.section-label` | font-size: 0.6rem; letter-spacing: 0.12em |
| `.server-dot` | width: 6px; height: 6px |
| `.settings-row` | display: flex; justify-content: space-between |
| `.settings-section-label` | font-size: 0.44rem; letter-spacing: 0.15em |
| `.slider-label` | display: flex; justify-content: space-between |
| `.slider-row` | margin-bottom: 10px |
| `.sr-desc` | font-size: 0.44rem; color: var(--text-muted) |
| `.sr-label` | font-size: 0.54rem; color: var(--text-primary) |
| `.stats-bar` | display: flex; gap: 24px |
| `.theme-grid` | display: grid; grid-template-columns: 1fr 1fr |
| `.theme-opt-dot` | width: 10px; height: 10px |
| `.toggle-row` | display: flex; align-items: center |
| `.top-bar` | display: flex; align-items: center |
| `.tp-ch` | height: 4px; border-radius: 1px |
| `.tp-ember` | background: #0d0b09 |
| `.tp-folio` | background: #0c0a0a |
| `.tp-graphite` | background: #080a0e |
| `.tp-ic` | width: 8px; height: 8px |
| `.tp-mercury` | background: #090c12 |
| `.tp-p` | height: 3px; border-radius: 1px |
| `.tp-rail` | position: absolute; left: 0 |
| `.tp-reading` | position: absolute; left: 62px |
| `.tp-rt` | height: 6px; border-radius: 1px |
| `.tp-sb-title` | height: 5px; border-radius: 1px |
| `.tp-sidebar` | position: absolute; left: 14px |
| `.tp-tts` | position: absolute; left: 0 |
| `.tp-tts-bar` | flex: 1; height: 2px |
| `.tp-tts-dot` | width: 8px; height: 8px |
| `.tp-tts-fill` | height: 100%; width: 45% |
| `.tp-video` | position: absolute; right: 5px |
| `.tts-bar` | background: var(--bg-panel); border-top: 1px solid var(--border) |
| `.tts-bar-slider` | display: flex; align-items: center |
| `.tts-bar-title` | font-size: 0.6rem; color: var(--text-dim) |
| `.tts-bar-voice--server` | border-color: rgba(200,169,110,.4); color: var(--accent) |
| `.tts-btn-grid` | display: grid; grid-template-columns: 1fr 1fr |
| `.tts-control-bar-sliders` | display: flex; align-items: center |
| `.tts-controls-row` | display: flex; align-items: center |
| `.tts-progress-row` | width: 100%; padding: 0 |
| `.tts-status-bar` | display: flex; align-items: center |
| `.vfd-controls` | display: flex; justify-content: center |
| `.vfd-eq` | display: flex; align-items: flex-end |
| `.vfd-gbtn-detect` | grid-column: 1 / -1 |
| `.vfd-genres` | display: grid; grid-template-columns: 1fr 1fr |
| `.vfd-live-dot` | width: 7px; height: 7px |
| `.vfd-live-label` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vfd-music` | flex: 1; display: flex |
| `.vfd-music-hdr` | display: flex; align-items: center |
| `.vfd-play-row` | display: flex; gap: 5px |
| `.vfd-screen` | width: 100%; aspect-ratio: 16 / 9 |
| `.vfd-topbar` | display: flex; align-items: center |
| `.vfd-track-genre` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vfd-track-info` | flex: 1; min-width: 0 |
| `.vfd-track-name` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vfd-vol-lbl` | font-family: 'DM Mono', monospace; font-size: 0.46rem |
| `.vfd-vol-pct` | font-family: 'DM Mono', monospace; font-size: 0.47rem |
| `.vfd-vol-row` | display: flex; align-items: center |
| `.vfd-vol-slider` | flex: 1; appearance: none |
| `.vid-dot` | width: 5px; height: 5px |
| `.vid-label` | flex: 1; font-size: 0.42rem |
| `.voice-roles-label` | font-family: 'DM Mono', monospace; font-size: 0.65rem |
| `.voice-roles-row` | display: flex; align-items: center |
| `.vr-btn-reanalyze` | background: none; border: 1px solid var(--border, #444) |
| `.vr-header` | display: flex; align-items: center |
| `.vr-label` | font-family: 'DM Mono', monospace; font-size: 0.62rem |
| `.vr-row` | display: flex; align-items: center |
| `.vr-section-label` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vr-status` | font-family: 'DM Mono', monospace; font-size: 0.58rem |
| `.vr-title` | font-family: 'DM Mono', monospace; font-size: 0.62rem |
| `.vsb-btn-row` | display: flex; gap: 5px |
| `.vsb-color-custom` | width: 22px; height: 22px |
| `.vsb-color-panel` | display: flex; flex-direction: row |
| `.vsb-color-row` | display: flex; align-items: center |
| `.vsb-color-swatch` | display: block; width: 20px |
| `.vsb-color-tiny` | width: 26px; height: 22px |
| `.vsb-divider` | width: 100%; height: 1px |
| `.vsb-micro-lbl` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vsb-mini-lbl` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vsb-panel` | width: 0; overflow: hidden |
| `.vsb-playback-row` | display: flex; gap: 4px |
| `.vsb-range` | flex: 1; min-width: 0 |
| `.vsb-range-lbl` | font-family: 'DM Mono', monospace; font-size: 0.52rem |
| `.vsb-range-row` | display: flex; align-items: center |
| `.vsb-row` | display: flex; align-items: center |
| `.vsb-size-row` | display: flex; align-items: center |
| `.vsb-stroke-colors-row` | display: flex; align-items: center |
| `.vsb-stroke-type-row` | display: flex; gap: 4px |
| `.vsb-swatch` | width: 18px; height: 18px |
| `.vsb-tab-line` | display: block; width: 7px |

Clases de un solo selector con rol de helper, estado, layout o prefijo de componente (`tp-`, `vr-`, `vsb-`, `vfd-`, etc.).

| Clase | Propiedades clave |
|---|---|
| `.ajuste-label` | font-size: 0.57rem; color: var(--text-dim) |
| `.ajuste-row` | display: flex; gap: 6px |
| `.ambient-collapse-btn` | font-size: 0.6rem; color: var(--text-dim) |
| `.ambient-vol-icon` | font-size: 0.75rem; color: var(--text-dim) |
| `.ambient-vol-row` | display: flex; align-items: center |
| `.btn-full` | width: 100% |
| `.btn-secondary` | background: var(--surface2); color: var(--text-muted) |
| `.config-label` | font-size: 0.48rem; color: var(--text-muted) |
| `.config-row` | display: flex; justify-content: space-between |
| `.ic-sep` | height: 1px; width: 20px |
| `.img-galeria-grid` | display: grid; grid-template-columns: repeat(3, 1fr) |
| `.img-key-row` | display: flex; gap: 4px |
| `.img-loading` | display: flex; flex-direction: column |
| `.img-prov-dot` | width: 8px; height: 8px |
| `.mf-title` | font-family: var(--font-deco); font-size: 0.48rem |
| `.mf-vol` | display: flex; align-items: center |
| `.mf-vol-bar` | flex: 1; appearance: none |
| `.mf-vol-label` | font-size: 0.44rem; color: var(--text-muted) |
| `.modal-row` | display: flex; align-items: center |
| `.mp-icon` | font-size: 13px; color: var(--accent) |
| `.mp-name` | font-size: 0.5rem; color: var(--text-primary) |
| `.mp-type` | font-size: 0.44rem; color: var(--accent) |
| `.pill` | width: 28px; height: 13px |
| `.pill-thumb` | position: absolute; width: 9px |
| `.progress-wrap` | flex-shrink: 0; padding: 0 28px |
| `.sb-leer-wrap` | padding: 8px 12px; flex-shrink: 0 |
| `.sb-prog-bar` | flex: 1; height: 2px |
| `.sb-tts-engine-row` | display: flex; gap: 5px |
| `.sb-tts-label` | font-size: 0.43rem; letter-spacing: 0.06em |
| `.sb-tts-rate-row` | display: flex; align-items: center |
| `.section-label` | font-size: 0.6rem; letter-spacing: 0.12em |
| `.server-dot` | width: 6px; height: 6px |
| `.settings-row` | display: flex; justify-content: space-between |
| `.settings-section-label` | font-size: 0.44rem; letter-spacing: 0.15em |
| `.slider-label` | display: flex; justify-content: space-between |
| `.slider-row` | margin-bottom: 10px |
| `.sr-desc` | font-size: 0.44rem; color: var(--text-muted) |
| `.sr-label` | font-size: 0.54rem; color: var(--text-primary) |
| `.stats-bar` | display: flex; gap: 24px |
| `.theme-grid` | display: grid; grid-template-columns: 1fr 1fr |
| `.theme-opt-dot` | width: 10px; height: 10px |
| `.toggle-row` | display: flex; align-items: center |
| `.top-bar` | display: flex; align-items: center |
| `.tp-ch` | height: 4px; border-radius: 1px |
| `.tp-ember` | background: #0d0b09 |
| `.tp-folio` | background: #0c0a0a |
| `.tp-graphite` | background: #080a0e |
| `.tp-ic` | width: 8px; height: 8px |
| `.tp-mercury` | background: #090c12 |
| `.tp-p` | height: 3px; border-radius: 1px |
| `.tp-rail` | position: absolute; left: 0 |
| `.tp-reading` | position: absolute; left: 62px |
| `.tp-rt` | height: 6px; border-radius: 1px |
| `.tp-sb-title` | height: 5px; border-radius: 1px |
| `.tp-sidebar` | position: absolute; left: 14px |
| `.tp-tts` | position: absolute; left: 0 |
| `.tp-tts-bar` | flex: 1; height: 2px |
| `.tp-tts-dot` | width: 8px; height: 8px |
| `.tp-tts-fill` | height: 100%; width: 45% |
| `.tp-video` | position: absolute; right: 5px |
| `.tts-bar` | background: var(--bg-panel); border-top: 1px solid var(--border) |
| `.tts-bar-slider` | display: flex; align-items: center |
| `.tts-bar-title` | font-size: 0.6rem; color: var(--text-dim) |
| `.tts-bar-voice--server` | border-color: rgba(200,169,110,.4); color: var(--accent) |
| `.tts-btn-grid` | display: grid; grid-template-columns: 1fr 1fr |
| `.tts-control-bar-sliders` | display: flex; align-items: center |
| `.tts-controls-row` | display: flex; align-items: center |
| `.tts-progress-row` | width: 100%; padding: 0 |
| `.tts-status-bar` | display: flex; align-items: center |
| `.vfd-controls` | display: flex; justify-content: center |
| `.vfd-eq` | display: flex; align-items: flex-end |
| `.vfd-gbtn-detect` | grid-column: 1 / -1 |
| `.vfd-genres` | display: grid; grid-template-columns: 1fr 1fr |
| `.vfd-live-dot` | width: 7px; height: 7px |
| `.vfd-live-label` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vfd-music` | flex: 1; display: flex |
| `.vfd-music-hdr` | display: flex; align-items: center |
| `.vfd-play-row` | display: flex; gap: 5px |
| `.vfd-screen` | width: 100%; aspect-ratio: 16 / 9 |
| `.vfd-topbar` | display: flex; align-items: center |
| `.vfd-track-genre` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vfd-track-info` | flex: 1; min-width: 0 |
| `.vfd-track-name` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vfd-vol-lbl` | font-family: 'DM Mono', monospace; font-size: 0.46rem |
| `.vfd-vol-pct` | font-family: 'DM Mono', monospace; font-size: 0.47rem |
| `.vfd-vol-row` | display: flex; align-items: center |
| `.vfd-vol-slider` | flex: 1; appearance: none |
| `.vid-dot` | width: 5px; height: 5px |
| `.vid-label` | flex: 1; font-size: 0.42rem |
| `.voice-roles-label` | font-family: 'DM Mono', monospace; font-size: 0.65rem |
| `.voice-roles-row` | display: flex; align-items: center |
| `.vr-btn-reanalyze` | background: none; border: 1px solid var(--border, #444) |
| `.vr-header` | display: flex; align-items: center |
| `.vr-label` | font-family: 'DM Mono', monospace; font-size: 0.62rem |
| `.vr-row` | display: flex; align-items: center |
| `.vr-section-label` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vr-status` | font-family: 'DM Mono', monospace; font-size: 0.58rem |
| `.vr-title` | font-family: 'DM Mono', monospace; font-size: 0.62rem |
| `.vsb-btn-row` | display: flex; gap: 5px |
| `.vsb-color-custom` | width: 22px; height: 22px |
| `.vsb-color-panel` | display: flex; flex-direction: row |
| `.vsb-color-row` | display: flex; align-items: center |
| `.vsb-color-swatch` | display: block; width: 20px |
| `.vsb-color-tiny` | width: 26px; height: 22px |
| `.vsb-divider` | width: 100%; height: 1px |
| `.vsb-micro-lbl` | font-family: 'DM Mono', monospace; font-size: 0.48rem |
| `.vsb-mini-lbl` | font-family: 'DM Mono', monospace; font-size: 0.56rem |
| `.vsb-panel` | width: 0; overflow: hidden |
| `.vsb-playback-row` | display: flex; gap: 4px |
| `.vsb-range` | flex: 1; min-width: 0 |
| `.vsb-range-lbl` | font-family: 'DM Mono', monospace; font-size: 0.52rem |
| `.vsb-range-row` | display: flex; align-items: center |
| `.vsb-row` | display: flex; align-items: center |
| `.vsb-size-row` | display: flex; align-items: center |
| `.vsb-stroke-colors-row` | display: flex; align-items: center |
| `.vsb-stroke-type-row` | display: flex; gap: 4px |
| `.vsb-swatch` | width: 18px; height: 18px |
| `.vsb-tab-line` | display: block; width: 7px |