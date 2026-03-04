# Documentación Técnica — Lector Web

> Versión de referencia interna. Describe la arquitectura, el grafo de dependencias, las APIs externas y los flujos de datos del sistema.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Árbol de módulos](#2-árbol-de-módulos)
3. [Grafo de dependencias](#3-grafo-de-dependencias)
4. [Módulos detallados](#4-módulos-detallados)
5. [Subsistemas principales](#5-subsistemas-principales)
6. [APIs externas](#6-apis-externas)
7. [Persistencia y almacenamiento](#7-persistencia-y-almacenamiento)
8. [Servidor TTS local](#8-servidor-tts-local)
9. [Flujos de datos](#9-flujos-de-datos)
10. [Patrones y convenciones](#10-patrones-y-convenciones)
11. [Variables globales de estado](#11-variables-globales-de-estado)

---

## 1. Visión general

El sistema es una **Single-Page Application (SPA) sin framework**, escrita en JavaScript vanilla + HTML/CSS, que funciona completamente en el navegador. No existe un backend propio: toda la lógica reside en el cliente, y las funcionalidades de red se delegan a servicios externos o a un servidor local opcional.

**Capacidades principales:**

| Dominio | Descripción |
|---|---|
| Lectura | EPUB, TXT, HTML, PDF, FB2, FB3, DOCX, RTF, ODT, MOBI, AZW3 |
| TTS | Browser SpeechSynthesis + servidor edge-tts local + grabación WAV |
| Traducción | Auto-traducción vía LLM (OpenAI, Perplexity, Claude) con humanizador |
| Música ambiental | Generación procedural 100 % Web Audio API (sin archivos externos) |
| Imágenes | Búsqueda en Pixabay, Pexels, Unsplash, Openverse, Picsum |
| Exportación | Video MP4 (canvas + MediaRecorder), Audio MP3 (FFmpeg.wasm) |
| Biblioteca | Búsqueda y descarga de libros vía LibGen JSON API |
| Marcadores | Sistema de bookmarks por libro, persistido en localStorage |
| Auth | Supabase + Google OAuth + Email/Password |
| Gramática | Revisión ortográfica vía LanguageTool API (anónimo o con cuenta) |

---

## 2. Árbol de módulos

```
index.html
│
├── ustorage.js          ← carga primero (abstracción localStorage)
├── auth.js              ← Supabase init + gestión de sesión
├── auth-ui.js           ← UI modal de login/registro
│
├── main.js              ← variables globales + utilidades base
│
├── epub.js              ← carga y parsing de EPUB + navegación
├── formats.js           ← formatos alternativos (TXT, PDF, FB2, DOCX…)
├── library.js           ← panel de búsqueda LibGen
├── bookmarks.js         ← sistema de marcadores
├── progress.js          ← progreso de lectura por libro
│
├── translation.js       ← traducción automática + humanizador IA
├── grammar.js           ← revisión LanguageTool + reemplazo onomatopeyas
│
├── tts.js               ← motor TTS (browser synth + servidor local)
├── voice-roles.js       ← asignación de voces por personaje (IA)
├── xtts-status.js       ← polling de disponibilidad del servidor TTS
│
├── player.js            ← motor de música ambiental (Web Audio API)
├── images.js            ← búsqueda y gestión de imágenes
├── video.js             ← panel de video en vivo (canvas)
│
├── export_video.js      ← exportación offscreen MP4
├── export_buttons.js    ← botones top-bar de exportación
├── convert_mp4.js       ← FFmpeg.wasm: WAV+imágenes → MP4
├── convert_mp3.js       ← FFmpeg.wasm: WAV → MP3
│
├── ui.js                ← renderizado de UI, controles, selectors
└── init.js              ← inicialización final, edición inline de texto
```

**Orden de carga obligatorio:**
`ustorage.js` → `auth.js` → `main.js` → *(módulos de contenido)* → `ui.js` → `init.js`

---

## 3. Grafo de dependencias

```
ustorage.js
    └─→ auth.js
            └─→ auth-ui.js

main.js  (estado global compartido)
    ├─→ epub.js
    │       ├─→ formats.js
    │       └─→ translation.js
    │               └─→ grammar.js
    ├─→ tts.js
    │       ├─→ xtts-status.js
    │       └─→ voice-roles.js
    ├─→ player.js
    ├─→ images.js
    │       └─→ video.js
    ├─→ export_video.js
    │       ├─→ export_buttons.js
    │       ├─→ convert_mp4.js
    │       └─→ convert_mp3.js
    ├─→ library.js
    ├─→ bookmarks.js
    ├─→ progress.js
    ├─→ ui.js
    └─→ init.js
```

Las dependencias son unidireccionales. Los módulos de nivel inferior leen variables globales expuestas por `main.js`; los de nivel superior orquestan los inferiores mediante llamadas directas a funciones globales.

---

## 4. Módulos detallados

### `ustorage.js`
Capa de abstracción sobre `localStorage` con prefijos por usuario.

- **Prefijos:** `guest_` sin sesión · `user_{supabaseId}_` con sesión
- **API:** `uGet(key)`, `uSet(key, val)`, `uRemove(key)`, `uKey(key)`, `uSetUser(id)`, `uClearUser()`
- **Migración automática:** al hacer login, las claves `guest_*` se copian bajo el nuevo prefijo de usuario (solo si el usuario no tiene ya un valor propio)
- **Migración legacy:** si una clave no existe con prefijo `guest_`, busca la versión sin prefijo y la migra silenciosamente

### `auth.js`
Gestión completa de autenticación con Supabase.

- Inicializa `supabase.createClient` al cargar
- Procesa tokens OAuth del hash de URL (`_procesarHashOAuth`)
- Suscribe a `onAuthStateChange` → dispara eventos DOM `auth:ready`, `auth:signin`, `auth:signout`
- Llama a `uSetUser` / `uClearUser` **antes** de despachar eventos, para que los listeners lean con el prefijo correcto
- Expone: `loginConGoogle()`, `loginConEmail()`, `registrarConEmail()`, `recuperarContrasena()`, `cerrarSesion()`, `getAuthUser()`, `estaAutenticado()`, `getUserId()`, `getUserDisplayName()`, `getUserAvatarUrl()`

### `main.js`
Define todo el estado mutable global que los módulos comparten. No contiene lógica de negocio pesada.

- Estado TTS (browser synth): `synth`, `utterance`, `isPaused`, `isReading`, `currentSentenceIndex`, `sentences`
- Estado TTS local: `usarAPILocal`, `servidorTTSDisponible`, `audioActual`, `_ttsSessionToken`
- Cache de pre-traducción: `_capCache`, `_capCacheEnCurso`, `_bgCancelToken`
- Cancelación de carga: `_cargaCapituloToken`
- Configuración narrativa: `aiDetectedUniverse`, `UNIVERSE_CONFIG`
- Utilidades: `mostrarNotificacion()`, `mostrarNotificacionPersistente()`, `ocultarNotificacionPersistente()`, `actualizarEstadisticas()`
- Gestión de config pendiente: `marcarCambioPendiente()`, `aplicarConfiguracion()`

### `epub.js`
Carga de archivos EPUB (ZIP con HTML/XHTML internos) y navegación de capítulos.

- Usa `JSZip` para extraer los archivos internos
- Parsea `container.xml` → `OPF` → `spine` para el orden correcto de los capítulos
- Parsea `NCX` / `nav.xhtml` para extraer títulos reales
- Soporta `showOpenFilePicker` (File System Access API) con fallback a `<input type="file">`
- Llama a `voiceRolesOnEpubLoad()` al abrir un nuevo libro
- Llama a `cargarReemplazosParaArchivo()` para cargar los reemplazos guardados del libro

### `formats.js`
Soporte de formatos alternativos al EPUB.

| Formato | Librería usada | Notas |
|---|---|---|
| TXT | nativa | split por capítulos o bloques |
| HTML | nativa | capítulo único |
| PDF | PDF.js (CDN) | extracción texto página a página |
| FB2 | nativa (XML DOM) | capítulos por `<section>` |
| FB3 | JSZip + XML | ZIP con XML interno |
| DOCX | mammoth.js (CDN) | extrae HTML con estilos |
| RTF | nativa (regex) | extrae texto limpio |
| ODT | JSZip + XML | `content.xml` interno |
| MOBI/AZW3 | nativa | extracción básica de texto |
| CBZ/CBR | JSZip / unrar.js | imágenes secuenciales |

Las librerías CDN se cargan dinámicamente (`_fmtLoadScript`) solo cuando se necesitan.

### `translation.js`
Traducción automática de capítulos y humanización del texto.

- **Idioma destino:** detectado automáticamente desde `navigator.language`; override manual via `window._traduccionLangOverride`
- **Humanizadores IA disponibles:**

| ID | Proveedor | Modelo |
|---|---|---|
| `perplexity` | Perplexity AI | sonar |
| `openai` | OpenAI | gpt-4o-mini |
| `claude` | Anthropic | claude-haiku-4-5 |
| `gemini` | Google | gemini-2.0-flash |
| `openrouter` | OpenRouter | configurable |

- **Cache:** `_capCache[ruta] = { texto, traducida, humanizada }` — evita re-traducir un capítulo si no cambia
- **Pre-traducción background:** el capítulo siguiente se pre-procesa en segundo plano usando `_bgCancelToken` para abortar si el usuario navega antes de que termine

### `grammar.js`
Revisión ortográfica y gramatical vía LanguageTool.

- Caché por hash del texto en `localStorage` → 0 llamadas si el capítulo no cambió
- Pre-filtro local con regex para errores comunes (sin API)
- Soporta credenciales LT gratuitas: 20 K chars/req · 75 K chars/min (vs ~1 500 chars anónimo)
- Reemplazo automático de onomatopeyas (toggle `autoReemplazarOnomatopeyas`)

### `tts.js`
Motor de TTS con dos backends.

**Backend 1 — Browser SpeechSynthesis:**
- Divide el texto en oraciones (`dividirEnOraciones`)
- Lee oración a oración usando `speechSynthesis.speak(utterance)`
- `_ttsSessionToken` evita callbacks `onended` obsoletos de sesiones previas

**Backend 2 — Servidor local (edge-tts):**
- Lee desde `_getTTSApiURL()` (puerto configurable, resuelto por `xtts-status.js`)
- POST `/tts` → MP3 → `Audio` element → `onended` → siguiente oración
- Toggle `_usarServidorLive` persiste en `localStorage`

**Grabación:**
- Captura audio del backend activo vía `AudioContext.createMediaStreamDestination`
- Produce un `Blob` WAV que puede pasarse a `convert_mp3.js` o `export_video.js`

### `xtts-status.js`
Polling de disponibilidad del servidor TTS.

- Expone `xttsGetURL()` que devuelve la URL activa
- Puerto configurable por el usuario (persiste en `localStorage` bajo `tts_server_port`)
- Actualiza el indicador visual de estado del servidor en la UI

### `voice-roles.js`
Asignación de voces distintas por personaje.

- Al cargar un EPUB, la IA analiza el texto para detectar personajes y sus voces óptimas
- Persiste el mapeo `personaje → voz Edge TTS` por libro
- `voiceRolesOnEpubLoad()` resetea el análisis al abrir un nuevo libro

### `player.js`
Motor de música ambiental procedural 100 % en el navegador.

Géneros disponibles con su generador Web Audio:

| Género | Técnica |
|---|---|
| mystery | Osciladores sine + pulso temporal |
| suspense | Sawtooth + LFO tremolo + bass heartbeat |
| drama | Pads sine + filter sweep |
| fantasy | Strings simulados + arpa |
| epic | Bronces + percusión |
| horror | Drones + ruido filtrado |
| romance | Piano suave + pad |
| action | Ritmo percutido + bajo |
| adventure | Fanfare periódico |
| sci_fi | Modulación AM + sweep |

- `aiDetectedUniverse` (seteado al cargar un libro) mapea al `UNIVERSE_CONFIG` y activa el generador correcto
- `ambientGainNode` es el punto de control de volumen (usado también por `tts.js` para mezclado)

### `images.js`
Búsqueda y rotación de imágenes de fondo.

**Proveedores:**

| ID | API | Key requerida |
|---|---|---|
| `pixabay` | Pixabay API | sí (gratuita) |
| `pexels` | Pexels API | sí (gratuita) |
| `unsplash` | Unsplash API | sí (gratuita) |
| `openverse` | Openverse API | no (800M imágenes CC) |
| `picsum` | Picsum Photos | no (siempre disponible) |

- Mantiene pools de URLs pre-cargadas para reducir latencia
- Auto-rotación de fondo cada 18 s (`AUTO_ROT_INTERVAL`) durante la reproducción de video

### `video.js`
Panel de video en vivo.

- Renderiza en un `<canvas>`: imagen de fondo + efectos (vignette, grayscale, brillo, contraste, zoom) + texto sincronizado con el TTS
- Usa `requestAnimationFrame` para el loop de renderizado
- Efectos configurables en tiempo real desde la UI

### `export_video.js`
Exportación offscreen de video MP4.

**Flujo:**
1. Modal de configuración (TTS mode, calidad, imágenes por grupo)
2. Paso de selección de thumbnails (`_pasarASeleccionImagenes`)
3. Pre-generación de audio (todas las oraciones en paralelo)
4. Render frame-a-frame en canvas offscreen
5. `MediaRecorder` → chunks WebM/MP4 → descarga

- `_expEffects`: objeto de efectos globales aplicados al canvas
- `_expImageRanges`: array de rangos de frases por imagen, editable desde el timeline

### `convert_mp4.js` / `convert_mp3.js`
Conversión de audio/video usando **FFmpeg.wasm** (procesamiento local, sin servidor).

- `_cargarFFmpeg()` (en `convert_mp4.js`) inicializa la instancia compartida
- `convert_mp3.js` reutiliza esa instancia para WAV → MP3 con `libmp3lame`
- Ambos módulos exponen un modal de progreso con log técnico y botón de cancelación

### `library.js`
Búsqueda de libros vía LibGen JSON API.

- 3 mirrors disponibles (`libgen.is`, `libgen.st`, `libgen.rs`) con fallback automático
- CORS proxy (`corsproxy.io` / `allorigins.win`) para las llamadas JSON (LibGen no envía headers CORS)
- Las descargas se abren en pestaña nueva (evita CORS)
- Paginación de 25 resultados, búsqueda por título/autor/serie

### `bookmarks.js`
Sistema de marcadores por libro.

- Estructura de un marcador: `{ id, chapter, sentenceIndex, chapterTitle, snippet, note, timestamp }`
- Clave de storage: `bookmarks_{bookId}` (vía `uGet`/`uSet`)
- `bookId` obtenido de `progresoGetBookId()` (de `progress.js`)
- Hook `onCapituloCargadoBookmarks(ruta)` llamado desde `progress.js` al cambiar de capítulo

### `progress.js`
Seguimiento de progreso de lectura.

- Persiste: capítulo actual, índice de frase, porcentaje completado
- Expone `progresoGetBookId()` usado por `bookmarks.js`
- Hook de capítulo cargado que notifica a otros módulos

### `ui.js`
Renderizado y control de la interfaz de usuario.

- Controles de configuración TTS, traducción, humanizador, gramática
- Selector de idioma de traducción (`window._traduccionLangOverride`)
- Carga y muestra reemplazos automáticos por libro (`cargarReemplazosParaArchivo`)
- Sincronización de toggles con `localStorage` vía `uSet`/`uGet`

### `init.js`
Inicialización final y edición inline de texto.

- `_toggleEditarTexto()`: limpia los spans TTS del DOM, activa `contentEditable`, restaura el estado al guardar
- Debe cargarse el último, después de que todos los módulos estén disponibles

---

## 5. Subsistemas principales

### 5.1 Pipeline de carga de capítulo

```
usuario selecciona capítulo
        │
        ▼
epub.js / formats.js
  └─ extrae HTML del capítulo
        │
        ▼
translation.js
  └─ [si traduccionAutomatica]
       └─ traduce con LLM
          └─ [si ttsHumanizerActivo]
               └─ humaniza con LLM secundario
        │
        ▼
grammar.js
  └─ [si grammarReviewActivo]
       └─ revisa con LanguageTool
          └─ aplica correcciones + reemplaza onomatopeyas
        │
        ▼
ui.js
  └─ renderiza HTML en #texto-contenido
  └─ actualiza selector, estadísticas, progreso
        │
        ▼
tts.js
  └─ dividirEnOraciones()
  └─ envolverOracionesEnSpans()
        │
        ▼
player.js + images.js
  └─ actualiza música ambiental según universo detectado
  └─ precarga imágenes para el video
```

Cada etapa comprueba `_cargaCapituloToken` (cancelación) antes de continuar.

### 5.2 Pipeline de exportación de video

```
exportarVideoDirecto()
        │
        ▼
export_video.js → Modal config (paso 1)
        │
        ▼
_pasarASeleccionImagenes() (paso 2)
  └─ images.js busca imágenes según universo
        │
        ▼
_preGenerarAudioTTS()
  └─ tts.js → por cada oración → MP3 buffer
        │
        ▼
_iniciarExportacion()
  └─ canvas offscreen 1280×720
  └─ bucle: por cada oración
       ├─ dibujar fondo + efectos
       ├─ dibujar texto wrapeado
       └─ MediaRecorder.write(frame)
        │
        ▼
convert_mp4.js → FFmpeg.wasm
  └─ WAV + frames → MP4 H.264
        │
        ▼
showSaveFilePicker() / descarga automática
```

---

## 6. APIs externas

| Servicio | Uso | Autenticación | Gratuito |
|---|---|---|---|
| Supabase | Auth + (futuro) sync cloud | anon key en código | ✓ tier gratis |
| Google OAuth | Login social | vía Supabase | ✓ |
| OpenAI | Humanizador / traducción | API key del usuario | ✗ |
| Perplexity AI | Humanizador / traducción | API key del usuario | ✗ |
| Anthropic Claude | Humanizador / traducción | API key del usuario | ✗ |
| Google Gemini | Humanizador / traducción | API key del usuario | ✓ tier gratis |
| OpenRouter | Humanizador / traducción | API key del usuario | ✗ |
| LanguageTool | Revisión gramatical | anónimo o cuenta gratis | ✓ con límites |
| Pixabay | Imágenes | API key del usuario | ✓ tier gratis |
| Pexels | Imágenes | API key hardcodeada (puede rotar) | ✓ |
| Unsplash | Imágenes | API key del usuario | ✓ tier gratis |
| Openverse | Imágenes CC | sin key | ✓ |
| Picsum Photos | Imágenes placeholder | sin key | ✓ |
| LibGen | Búsqueda de libros | sin key (CORS proxy) | ✓ |
| corsproxy.io | Proxy CORS para LibGen | sin key | ✓ |
| JSZip CDN | Parsing ZIP/EPUB | CDN público | ✓ |
| PDF.js CDN | Parsing PDF | CDN público | ✓ |
| mammoth.js CDN | Parsing DOCX | CDN público | ✓ |
| FFmpeg.wasm CDN | Conversión MP4/MP3 | CDN público | ✓ |

---

## 7. Persistencia y almacenamiento

Todo el estado persistente se guarda en `localStorage` a través de `ustorage.js`.

### Claves principales

| Clave (`uGet`/`uSet`) | Módulo | Descripción |
|---|---|---|
| `toggle_auto_translate` | main.js | traducción automática activa |
| `toggle_auto_next` | main.js | avance automático de capítulo |
| `toggle_auto_play` | main.js | auto-play tras traducir |
| `edge_tts_voice` | tts.js | voz Edge TTS seleccionada |
| `tts_servidor_live` | tts.js | usar servidor local para live |
| `tts_server_port` | xtts-status.js | puerto del servidor TTS |
| `image_provider` | images.js | proveedor de imágenes activo |
| `pixabay_api_key` | images.js | API key Pixabay |
| `pexels_api_key` | images.js | API key Pexels |
| `unsplash_api_key` | images.js | API key Unsplash |
| `claude_api_key` | translation.js | API key del humanizador activo |
| `lt_username` / `lt_apikey` | grammar.js | credenciales LanguageTool |
| `grammar_review_activo` | grammar.js | revisión gramatical activa |
| `bookmarks_{bookId}` | bookmarks.js | array de marcadores del libro |
| `replacements_{filename}` | ui.js | reemplazos automáticos por libro |
| `progress_{bookId}` | progress.js | progreso de lectura |
| `lt_cache` | grammar.js | caché de revisiones LT |
| `mg_fit` / `mg_dir` / `mg_gap` / `mg_bg` | comic_reader.js | preferencias del lector de comics |

---

## 8. Servidor TTS local

El servidor local provee TTS de alta calidad usando **Microsoft Edge TTS** (Neural TTS gratuito), sin enviar datos a la nube desde el servidor (edge-tts se conecta a la infraestructura de Microsoft, pero no a servidores propios).

### Archivos

| Archivo | Descripción |
|---|---|
| `tts_api_server.py` | Servidor Flask standalone (desarrollo / uso directo) |
| `tts_server_tray.py` | Bundle con ícono en bandeja del sistema + autostart |
| `test_xtts.py` | Script de prueba para validar instalación de XTTS v2 |

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor, versión, puerto activo |
| GET | `/voices` | Lista de voces disponibles en español |
| POST | `/tts` | Síntesis: `{text, voice, rate, pitch}` → MP3 stream |

### Configuración

```bash
# Puerto por defecto: 5000
python tts_api_server.py

# Puerto custom
python tts_api_server.py --port 8020
PORT=8020 python tts_api_server.py
```

### Instalación

```bash
pip install edge-tts flask flask-cors

# Con bandeja del sistema:
pip install edge-tts flask flask-cors pystray pillow
```

### Autostart (`tts_server_tray.py`)

El script de bandeja registra el ejecutable para arranque automático en las tres plataformas:

| OS | Mecanismo |
|---|---|
| Windows | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| macOS | `~/Library/LaunchAgents/{APP_ID}.plist` |
| Linux | `~/.config/autostart/{APP_ID}.desktop` |

El puerto y el estado de autostart se persisten en `tts_config.json` junto al ejecutable.

---

## 9. Flujos de datos

### 9.1 Autenticación

```
Carga de página
      │
      ▼
auth.js → supabase.auth.getSession()
      │
      ├─ [tiene sesión] → uSetUser(id) → auth:ready
      └─ [sin sesión]   → auth:ready (user: null)
                                │
                                ▼
                         init.js escucha auth:ready
                         → carga preferencias del usuario
```

### 9.2 Cambio de backend TTS

```
usuario hace toggle en UI
      │
      ▼
toggleServidorLive()
      │
      ├─ [activar] → verificarServidorTTS()
      │                   ├─ [ok]    → _usarServidorLive = true
      │                   └─ [fail]  → revertir toggle, notificación
      │
      └─ [desactivar] → _usarServidorLive = false
                         → [si estaba leyendo] detener + relanzar con browser synth
```

### 9.3 Pre-traducción background

```
cargarCapitulo(ruta) completa
      │
      ▼
[¿hay capítulo siguiente?]
      │
      ▼
_bgCancelToken++ → identificador único de esta tarea
      │
      ▼
traducirCapituloBackground(siguienteRuta, token)
      │
      ├─ [token cambió en cualquier punto] → abortar silenciosamente
      └─ [completado] → _capCache[siguienteRuta] = { texto, traducida, humanizada }
```

---

## 10. Patrones y convenciones

### Cancelación de tareas asíncronas

Se usa el patrón **token de cancelación** con variables enteras globales:

```javascript
// Al iniciar una tarea
_miToken++;
const miToken = _miToken;

// En cada await
if (_miToken !== miToken) return; // cancelado
```

### Estado pendiente (config)

Los cambios de configuración no se aplican inmediatamente sino que se acumulan con `marcarCambioPendiente()` hasta que el usuario presiona "Aplicar" (`aplicarConfiguracion()`). Esto evita recargas innecesarias del capítulo al cambiar múltiples toggles.

### Módulos autocontenidos con IIFE

Los módulos que no deben exponer estado global (como `bookmarks.js`) se envuelven en IIFE:

```javascript
(function () {
    'use strict';
    // estado privado
    // funciones privadas
    // solo se expone al window lo estrictamente necesario
})();
```

### Comunicación entre módulos

Los módulos se comunican de tres maneras:
1. **Variables globales de `main.js`** — lectura directa
2. **Funciones globales** — llamadas directas por nombre
3. **Eventos DOM personalizados** — `CustomEvent` en `document` (usado principalmente por el sistema de auth)

### Claves de storage

Convenio de nombres: `snake_case`, prefijadas automáticamente por `ustorage.js`. Las claves de colecciones usan el patrón `{tipo}_{bookId}` (ej: `bookmarks_abc123`, `progress_abc123`).

---

## 11. Variables globales de estado

Las siguientes variables de `main.js` son leídas y/o modificadas por múltiples módulos. Cualquier cambio en sus nombres requiere actualización en todos los módulos consumidores.

| Variable | Tipo | Consumidores |
|---|---|---|
| `sentences` | `string[]` | tts.js, export_video.js, export_buttons.js |
| `currentSentenceIndex` | `number` | tts.js, video.js, export_video.js |
| `isReading` | `boolean` | tts.js, export_buttons.js, ui.js |
| `isPaused` | `boolean` | tts.js, ui.js |
| `traduccionAutomatica` | `boolean` | translation.js, epub.js, main.js |
| `grammarReviewActivo` | `boolean` | grammar.js, epub.js |
| `autoReemplazarOnomatopeyas` | `boolean` | grammar.js, epub.js |
| `_capCache` | `object` | translation.js, main.js |
| `_bgCancelToken` | `number` | translation.js, main.js |
| `_cargaCapituloToken` | `number` | epub.js, main.js, translation.js |
| `aiDetectedUniverse` | `string\|null` | player.js, images.js, main.js |
| `reemplazosAutomaticos` | `object` | epub.js, ui.js |
| `_epubFilename` | `string` | epub.js, ui.js |
| `audioActual` | `Audio\|null` | tts.js |
| `_ttsSessionToken` | `number` | tts.js |
| `servidorTTSDisponible` | `boolean` | tts.js, xtts-status.js, ui.js |
| `usarAPILocal` | `boolean` | tts.js |
