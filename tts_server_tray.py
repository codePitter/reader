"""
tts_server_tray.py — Servidor TTS local con ícono en la bandeja del sistema
Empaquetado con PyInstaller como ejecutable standalone (Python incluido)

Funciones:
  - Corre el servidor edge-tts en un hilo de fondo
  - Muestra ícono en la bandeja con menú contextual
  - Se registra para arrancar automáticamente al inicio del sistema
  - Puerto configurable (persiste en config.json junto al ejecutable)
  - Compatible con Windows, macOS y Linux

Dependencias (incluidas en el bundle):
  pip install edge-tts flask flask-cors pystray pillow
"""

import sys
import os
import json
import platform
import subprocess
import threading
import time
import io
import logging
import asyncio
import traceback

# ── Silenciar logs de Flask en el bundle ─────────────────────────────────────
logging.basicConfig(level=logging.WARNING)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# ── Imports del servidor TTS ──────────────────────────────────────────────────
import edge_tts
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ── Imports del tray ──────────────────────────────────────────────────────────
import pystray
from PIL import Image, ImageDraw

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════════

APP_NAME    = "TTS Server"
APP_ID      = "com.lector.ttsserver"   # usado en macOS LaunchAgent y Linux .desktop
DEFAULT_PORT = 5000
VERSION      = "1.0.0"

# Directorio junto al ejecutable (funciona tanto en desarrollo como bundleado)
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(BASE_DIR, "tts_config.json")


def _load_config() -> dict:
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(cfg: dict):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"[config] Error guardando config: {e}")


def get_port() -> int:
    cfg = _load_config()
    p = cfg.get("port", DEFAULT_PORT)
    try:
        return int(p)
    except Exception:
        return DEFAULT_PORT


def set_port(port: int):
    cfg = _load_config()
    cfg["port"] = port
    _save_config(cfg)


# ═══════════════════════════════════════════════════════════════════════════════
# SERVIDOR FLASK (edge-tts)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_VOICE = "es-AR-TomasNeural"
DEFAULT_RATE  = "+0%"
DEFAULT_PITCH = "+0Hz"

flask_app = Flask(__name__)
CORS(flask_app)

_server_thread = None
_server_running = False


@flask_app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "engine": "edge-tts",
        "default_voice": DEFAULT_VOICE,
        "version": VERSION,
        "port": get_port(),
    })


@flask_app.route('/voices', methods=['GET'])
def voices():
    async def _get():
        all_voices = await edge_tts.list_voices()
        return [v for v in all_voices if v["Locale"].startswith("es-")]
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_get())
    finally:
        loop.close()
    return jsonify(result)


@flask_app.route('/tts', methods=['POST'])
def tts():
    data  = request.get_json(force=True)
    text  = data.get('text', '').strip()
    voice = data.get('voice', DEFAULT_VOICE)
    rate  = data.get('rate',  DEFAULT_RATE)
    pitch = data.get('pitch', DEFAULT_PITCH)

    if not text:
        return jsonify({"error": "text is required"}), 400
    if len(text) > 10_000:
        return jsonify({"error": "text too long (max 10000 chars)"}), 400

    async def _synthesize():
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        buf.seek(0)
        return buf

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        audio_buf = loop.run_until_complete(_synthesize())
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        loop.close()

    return send_file(audio_buf, mimetype="audio/mpeg",
                     as_attachment=False, download_name="tts.mp3")


def _run_server(port: int):
    """Corre Flask en un hilo daemon. No imprime nada en producción."""
    global _server_running
    _server_running = True
    try:
        flask_app.run(host='0.0.0.0', port=port, debug=False,
                      use_reloader=False, threaded=True)
    except Exception as e:
        print(f"[server] Error: {e}")
    finally:
        _server_running = False


def start_server():
    global _server_thread
    port = get_port()
    _server_thread = threading.Thread(target=_run_server, args=(port,), daemon=True)
    _server_thread.start()
    # Darle un momento al servidor para que levante
    time.sleep(1.5)


# ═══════════════════════════════════════════════════════════════════════════════
# AUTOSTART — registro por plataforma
# ═══════════════════════════════════════════════════════════════════════════════

OS = platform.system()   # "Windows" | "Darwin" | "Linux"


def _exe_path() -> str:
    """Ruta al ejecutable actual."""
    return sys.executable if not getattr(sys, 'frozen', False) else sys.executable


def autostart_is_enabled() -> bool:
    exe = _exe_path()
    if OS == "Windows":
        import winreg
        try:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_READ
            )
            val, _ = winreg.QueryValueEx(key, APP_NAME)
            winreg.CloseKey(key)
            return val == f'"{exe}"'
        except Exception:
            return False

    elif OS == "Darwin":
        plist = _mac_plist_path()
        return os.path.exists(plist)

    elif OS == "Linux":
        desktop = _linux_desktop_path()
        return os.path.exists(desktop)

    return False


def autostart_enable():
    exe = _exe_path()
    if OS == "Windows":
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, f'"{exe}"')
        winreg.CloseKey(key)

    elif OS == "Darwin":
        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{APP_ID}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
"""
        os.makedirs(os.path.dirname(_mac_plist_path()), exist_ok=True)
        with open(_mac_plist_path(), "w") as f:
            f.write(plist_content)
        subprocess.run(["launchctl", "load", _mac_plist_path()],
                       capture_output=True)

    elif OS == "Linux":
        desktop_content = f"""[Desktop Entry]
Type=Application
Name={APP_NAME}
Exec={exe}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=Servidor TTS local para el lector web
"""
        os.makedirs(os.path.dirname(_linux_desktop_path()), exist_ok=True)
        with open(_linux_desktop_path(), "w") as f:
            f.write(desktop_content)
        os.chmod(_linux_desktop_path(), 0o644)


def autostart_disable():
    if OS == "Windows":
        import winreg
        try:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_SET_VALUE
            )
            winreg.DeleteValue(key, APP_NAME)
            winreg.CloseKey(key)
        except Exception:
            pass

    elif OS == "Darwin":
        plist = _mac_plist_path()
        if os.path.exists(plist):
            subprocess.run(["launchctl", "unload", plist], capture_output=True)
            os.remove(plist)

    elif OS == "Linux":
        desktop = _linux_desktop_path()
        if os.path.exists(desktop):
            os.remove(desktop)


def _mac_plist_path() -> str:
    return os.path.expanduser(f"~/Library/LaunchAgents/{APP_ID}.plist")


def _linux_desktop_path() -> str:
    return os.path.expanduser(f"~/.config/autostart/{APP_ID}.desktop")


# ═══════════════════════════════════════════════════════════════════════════════
# ÍCONO DEL TRAY — generado con Pillow (sin archivo externo)
# ═══════════════════════════════════════════════════════════════════════════════

def _make_icon_image(active: bool = True) -> Image.Image:
    """
    Crea un ícono de 64×64 px con un círculo y la letra T.
    Verde si el servidor está activo, gris si no.
    """
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fondo circular
    bg_color = (46, 125, 50, 255) if active else (80, 80, 80, 255)   # verde / gris
    draw.ellipse([2, 2, size - 2, size - 2], fill=bg_color)

    # Letra "T"
    text_color = (255, 255, 255, 255)
    # Barra horizontal
    draw.rectangle([16, 18, 48, 24], fill=text_color)
    # Barra vertical
    draw.rectangle([28, 18, 36, 50], fill=text_color)

    return img


# ═══════════════════════════════════════════════════════════════════════════════
# TRAY — menú y lógica
# ═══════════════════════════════════════════════════════════════════════════════

_tray_icon: pystray.Icon = None


def _build_menu() -> pystray.Menu:
    port  = get_port()
    auto  = autostart_is_enabled()

    status_label = f"✓ Servidor activo — localhost:{port}" if _server_running \
                   else f"✗ Servidor detenido — puerto {port}"

    return pystray.Menu(
        pystray.MenuItem(status_label, None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(
            f"{'✓ ' if auto else ''}Arrancar al iniciar el sistema",
            _toggle_autostart
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Abrir en el navegador", _open_browser),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Salir", _quit_app),
    )


def _toggle_autostart(icon, item):
    if autostart_is_enabled():
        autostart_disable()
    else:
        autostart_enable()
    # Refrescar menú
    icon.menu = _build_menu()


def _open_browser(icon=None, item=None):
    import webbrowser
    webbrowser.open(f"http://localhost:{get_port()}/health")


def _quit_app(icon, item):
    icon.stop()
    os._exit(0)


def _run_tray():
    global _tray_icon
    img  = _make_icon_image(active=True)
    menu = _build_menu()
    _tray_icon = pystray.Icon(APP_NAME, img, APP_NAME, menu)
    _tray_icon.run()


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    # 1. En el primer arranque, registrar autostart automáticamente
    cfg = _load_config()
    if not cfg.get("autostart_configured"):
        try:
            autostart_enable()
        except Exception as e:
            print(f"[autostart] No se pudo configurar autostart: {e}")
        cfg["autostart_configured"] = True
        _save_config(cfg)

    # 2. Iniciar el servidor Flask en un hilo de fondo
    print(f"[tts] Iniciando servidor en puerto {get_port()}...")
    start_server()
    print(f"[tts] Servidor corriendo en http://localhost:{get_port()}")

    # 3. Mostrar ícono en la bandeja (bloquea hasta que el usuario salga)
    _run_tray()


if __name__ == "__main__":
    main()
