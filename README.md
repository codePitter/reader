# 📖 Lector Web

> Lector de eBooks con TTS, traducción automática y exportación de video — 100 % en el navegador, sin instalación.

---

## ¿Qué es?

Una Single-Page Application que convierte cualquier eBook en una experiencia de lectura inmersiva con voz, música ambiental generada proceduralmente y exportación de contenido. Toda la lógica corre en el cliente: no hay backend propio, y los datos nunca salen de tu dispositivo salvo cuando tú lo decides.

---

## Características

### Formatos de lectura
Soporta EPUB, TXT, HTML, PDF, FB2, FB3, DOCX, RTF, ODT, MOBI y AZW3. Los formatos que requieren librerías externas (PDF.js, mammoth.js) se cargan bajo demanda desde CDN solo cuando se necesitan.

### Text-to-Speech
El motor TTS tiene dos modos que pueden alternarse en cualquier momento. El modo **navegador** usa la API `SpeechSynthesis` nativa, disponible sin ninguna configuración adicional. El modo **servidor local** conecta con el servidor edge-tts incluido en el proyecto (`tts_api_server.py`), que ofrece voces neurales de Microsoft Edge de calidad notablemente superior, procesadas completamente en tu máquina.

El servidor local viene con un segundo script (`tts_server_tray.py`) que lo empaqueta con un ícono en la bandeja del sistema y lo registra para arranque automático en Windows, macOS y Linux.

### Traducción automática
Traduce capítulos completos al idioma del navegador (o a cualquier idioma seleccionado manualmente). La traducción se realiza con modelos de lenguaje que el usuario elige y configura con su propia API key:

- OpenAI (gpt-4o-mini)
- Perplexity AI (sonar)
- Anthropic Claude (haiku)
- Google Gemini 2.0 Flash
- OpenRouter (modelo configurable)

Un **humanizador** opcional pasa el texto traducido por un segundo prompt para limpiar literalismos y mejorar la lectura en voz alta. Los capítulos se pre-traducen en segundo plano mientras lees, eliminando la espera al avanzar.

### Música ambiental
Genera música de fondo de forma procedural directamente en el navegador usando la Web Audio API, sin ningún archivo de audio externo. Detecta el género narrativo del libro (fantasía épica, thriller, romance, sci-fi, horror, etc.) y selecciona el generador correspondiente. Los géneros disponibles incluyen mystery, suspense, drama, fantasy, epic, horror, romance, action, adventure y sci-fi.

### Imágenes de fondo
Busca imágenes contextuales para el panel de video desde Pixabay, Pexels, Unsplash o Openverse. El proveedor Picsum siempre está disponible como fallback sin necesidad de API key. Las imágenes rotan automáticamente durante la reproducción.

### Exportación
Desde el panel de exportación se puede generar un **video MP4** con el texto de cada capítulo sincronizado sobre las imágenes de fondo, con los efectos visuales configurados (viñeta, escala de grises, brillo, zoom). El audio se genera con el motor TTS activo y se ensambla con FFmpeg.wasm, que corre en el navegador sin ningún servidor. También se puede exportar el audio por separado como **MP3** con calidad configurable.

### Revisión gramatical
Revisa el texto con la API de LanguageTool. En modo anónimo procesa ~1 500 caracteres por request; con una cuenta gratuita de LanguageTool llega a 20 000 caracteres. Los resultados se cachean por hash del capítulo para no repetir llamadas.

### Biblioteca integrada
Busca libros directamente en LibGen desde el sidebar de la aplicación, con soporte de varios mirrors y paginación. Las descargas se abren en una pestaña nueva.

### Marcadores y progreso
El sistema de marcadores guarda la posición exacta a nivel de oración con una nota opcional. El progreso de lectura se persiste por libro y se restaura automáticamente.

### Asignación de voces por personaje
Analiza el texto con IA para detectar personajes y asignarles voces Edge TTS distintas, mejorando la experiencia de escucha en libros con diálogos.

### Autenticación (opcional)
La aplicación funciona completamente sin cuenta. Si el usuario inicia sesión con Google o email/password vía Supabase, sus configuraciones y preferencias se aíslan bajo su ID de usuario y se migran automáticamente desde el perfil invitado.

---

## Servidor TTS local

El servidor es un script Python ligero que no requiere GPU.

```bash
# Instalación
pip install edge-tts flask flask-cors

# Arranque
python tts_api_server.py               # puerto 5000 por defecto
python tts_api_server.py --port 8020   # puerto custom
```

Con la versión de bandeja del sistema:

```bash
pip install edge-tts flask flask-cors pystray pillow
python tts_server_tray.py
```

El servidor queda corriendo en segundo plano con un ícono en la bandeja y se puede configurar para arrancar automáticamente con el sistema.

**Endpoints:**

| Ruta | Descripción |
|---|---|
| `GET /health` | Estado del servidor |
| `GET /voices` | Lista de voces en español disponibles |
| `POST /tts` | Síntesis: `{text, voice, rate, pitch}` → MP3 |

---

## Configuración

La aplicación no requiere ningún archivo de configuración. Todo se ajusta desde la propia interfaz y se persiste en `localStorage`. Las API keys de servicios externos (modelos de IA, buscadores de imágenes) se ingresan una vez desde el panel de configuración y se guardan localmente.

**API keys opcionales que puedes configurar:**

| Servicio | Para qué se usa | Cómo obtenerla |
|---|---|---|
| OpenAI | Traducción y humanización | platform.openai.com |
| Perplexity | Traducción y humanización | perplexity.ai/settings/api |
| Anthropic | Traducción y humanización | console.anthropic.com |
| Google Gemini | Traducción y humanización (gratis) | aistudio.google.com |
| Pixabay | Imágenes de alta calidad | pixabay.com/api/docs |
| Unsplash | Imágenes fotográficas | unsplash.com/developers |
| LanguageTool | Revisión gramatical extendida | languagetool.org/es/cuenta |

---

## Tecnologías

El proyecto no usa frameworks ni herramientas de build. Todo el código es JavaScript vanilla que carga directamente desde `index.html`.

**Librerías de terceros (cargadas desde CDN):**

| Librería | Uso |
|---|---|
| JSZip | Parsing de EPUB, ZIP, CBZ |
| PDF.js | Extracción de texto de PDF |
| mammoth.js | Conversión de DOCX a HTML |
| FFmpeg.wasm | Renderizado de MP4, conversión a MP3 |
| Supabase JS | Autenticación |

**Servicios de infraestructura:**

| Servicio | Uso |
|---|---|
| Supabase | Autenticación (Google OAuth + Email) |
| corsproxy.io | Proxy CORS para LibGen API |

---

## Estructura del proyecto

```
├── index.html              Punto de entrada
├── style.css               Estilos globales
│
├── ustorage.js             Abstracción de localStorage por usuario
├── auth.js                 Autenticación con Supabase
├── auth-ui.js              UI del modal de login
├── main.js                 Estado global y utilidades base
│
├── epub.js                 Carga y parsing de EPUB
├── formats.js              Soporte de formatos alternativos
├── library.js              Búsqueda en LibGen
├── bookmarks.js            Sistema de marcadores
├── progress.js             Progreso de lectura
│
├── translation.js          Traducción automática + humanizador IA
├── grammar.js              Revisión gramatical (LanguageTool)
│
├── tts.js                  Motor TTS (browser + servidor local)
├── voice-roles.js          Voces por personaje
├── xtts-status.js          Estado del servidor TTS local
│
├── player.js               Música ambiental (Web Audio API)
├── images.js               Búsqueda de imágenes
├── video.js                Panel de video en vivo
│
├── export_video.js         Exportación de video MP4
├── export_buttons.js       Botones de exportación en top-bar
├── convert_mp4.js          FFmpeg.wasm: ensamblado de video
├── convert_mp3.js          FFmpeg.wasm: conversión a MP3
│
├── ui.js                   Controles e interfaz de usuario
├── init.js                 Inicialización final
│
├── tts_api_server.py       Servidor TTS local (Flask + edge-tts)
├── tts_server_tray.py      Servidor TTS con bandeja del sistema
└── test_xtts.py            Script de prueba de instalación
```

---

## Privacidad

- Todo el procesamiento ocurre en tu dispositivo excepto cuando usas servicios externos que tú mismo configuras (modelos de IA, búsqueda de imágenes).
- El servidor TTS local usa edge-tts, que se conecta a la infraestructura de Microsoft Edge para la síntesis de voz. El texto se envía a Microsoft en ese caso.
- LibGen se consulta a través de un proxy CORS público (`corsproxy.io`) para la búsqueda; las descargas son directas.
- Supabase solo se usa para autenticación; no almacena datos de lectura.

---

## Licencia

Pendiente de definir.
