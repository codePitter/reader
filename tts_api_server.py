"""
tts_api_server.py — Servidor TTS local usando edge-tts (Microsoft Neural TTS)
Compatible con Python 3.9, 3.10, 3.11, 3.12, 3.13

Instalación:
    pip install edge-tts flask flask-cors

Uso:
    python tts_api_server.py              # puerto por defecto: 5000
    python tts_api_server.py --port 8020  # puerto custom
    PORT=8020 python tts_api_server.py    # vía variable de entorno

Endpoints:
    GET  /health          → estado del servidor
    GET  /voices          → lista de voces en español
    POST /tts             → sintetizar texto → MP3
"""

import argparse
import asyncio
import io
import os
import sys
import edge_tts
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)   # Necesario para que la web pueda llamar al servidor local

# ── Voces por defecto ────────────────────────────────────────────────────────
DEFAULT_VOICE = "es-AR-TomasNeural"
DEFAULT_RATE  = "+0%"     # rango: -50% a +100%
DEFAULT_PITCH = "+0Hz"    # rango: -50Hz a +50Hz


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "engine": "edge-tts",
        "default_voice": DEFAULT_VOICE,
        "version": "2.1",
        "port": _get_port(),
    })


@app.route('/voices', methods=['GET'])
def voices():
    """Lista todas las voces disponibles en español."""
    async def _get_voices():
        all_voices = await edge_tts.list_voices()
        return [v for v in all_voices if v["Locale"].startswith("es-")]

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        spanish_voices = loop.run_until_complete(_get_voices())
    finally:
        loop.close()

    return jsonify(spanish_voices)


@app.route('/tts', methods=['POST'])
def tts():
    data  = request.get_json(force=True)
    text  = data.get('text', '').strip()
    voice = data.get('voice', DEFAULT_VOICE)
    rate  = data.get('rate',  DEFAULT_RATE)
    pitch = data.get('pitch', DEFAULT_PITCH)

    if not text:
        return jsonify({"error": "text is required"}), 400

    # Limitar largo de texto por petición (protección básica)
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

    return send_file(
        audio_buf,
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="tts.mp3"
    )


# ── Puerto ───────────────────────────────────────────────────────────────────

def _get_port():
    """Prioridad: --port arg → variable $PORT → 5000 por defecto."""
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--port', type=int, default=None)
    args, _ = parser.parse_known_args()
    return args.port or int(os.environ.get('PORT', 5000))


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = _get_port()

    print("=" * 55)
    print("  TTS API Server — edge-tts (Microsoft Neural TTS)")
    print("=" * 55)
    print(f"  Voz por defecto  : {DEFAULT_VOICE}")
    print(f"  Puerto           : {port}")
    print(f"  Endpoint TTS     : http://localhost:{port}/tts")
    print(f"  Health check     : http://localhost:{port}/health")
    print(f"  Voces disponibles: http://localhost:{port}/voices")
    print(f"  Python           : {sys.version}")
    print("=" * 55)
    print("  Cambiar puerto:")
    print(f"    python tts_api_server.py --port 8020")
    print(f"    PORT=8020 python tts_api_server.py")
    print("=" * 55)
    print("  Presioná Ctrl+C para detener el servidor")
    print()

    app.run(host='0.0.0.0', port=port, debug=False)