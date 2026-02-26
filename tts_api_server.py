"""
tts_api_server.py — Servidor TTS local usando edge-tts (Microsoft Azure Neural TTS)
Compatible con Python 3.9, 3.10, 3.11, 3.12, 3.13
Instalación: pip install edge-tts flask flask-cors
Uso:         python tts_api_server.py
Endpoint:    http://localhost:5000/tts   POST { "text": "...", "voice": "es-AR-TomasNeural" }
             http://localhost:5000/health GET
             http://localhost:5000/voices GET  (lista de voces disponibles)
"""

import asyncio
import io
import sys
import edge_tts
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Voces por defecto (español) ──────────────────────────────────────────────
# Voces recomendadas en español:
#   es-AR-TomasNeural       → Argentino masculino  ★ recomendado para novelas
#   es-AR-ElenaNeural       → Argentino femenino
#   es-ES-AlvaroNeural      → Español (España) masculino
#   es-ES-ElviraNeural      → Español (España) femenino
#   es-MX-JorgeNeural       → Mexicano masculino
#   es-MX-DaliaNeural       → Mexicano femenino
#   es-US-AlonsoNeural      → Español (US) masculino

DEFAULT_VOICE = "es-AR-TomasNeural"
DEFAULT_RATE  = "+0%"     # velocidad: -50% a +100%
DEFAULT_PITCH = "+0Hz"    # tono: -50Hz a +50Hz


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "engine": "edge-tts",
        "default_voice": DEFAULT_VOICE,
        "version": "2.0"
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


if __name__ == '__main__':
    print("=" * 55)
    print("  TTS API Server — edge-tts (Microsoft Neural TTS)")
    print("=" * 55)
    print(f"  Voz por defecto : {DEFAULT_VOICE}")
    print(f"  Endpoint TTS    : http://localhost:5000/tts")
    print(f"  Health check    : http://localhost:5000/health")
    print(f"  Voces disponibles: http://localhost:5000/voices")
    print(f"  Python          : {sys.version}")
    print("=" * 55)
    print("  Instalación: pip install edge-tts flask flask-cors")
    print("=" * 55)
    app.run(host='0.0.0.0', port=5000, debug=False)