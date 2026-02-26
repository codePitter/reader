"""
Servidor API para TTS con XTTS v2
Requisitos: pip install TTS flask flask-cors torch
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import torch
import os
import tempfile
import uuid
import atexit
import time
from pathlib import Path

app = Flask(__name__)
CORS(app)

# ── Configuración ──
TEMP_DIR = Path(tempfile.gettempdir()) / "tts_outputs"
TEMP_DIR.mkdir(exist_ok=True)
MAX_TEXT_LENGTH = 5000  # caracteres

# Ruta a un archivo WAV de referencia para clonar la voz (OBLIGATORIO para XTTS v2)
# Debe ser un WAV mono/stereo, 22050Hz+, mínimo 6 segundos de voz limpia
DEFAULT_SPEAKER_WAV = os.environ.get("SPEAKER_WAV", "speaker.wav")

# ── Carga diferida del modelo ──
# Se carga en el primer request para no bloquear el arranque si hay error
_tts = None
_device = None

def get_tts():
    global _tts, _device
    if _tts is not None:
        return _tts, _device
    try:
        from TTS.api import TTS
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🔄 Cargando modelo XTTS v2 en {_device}...")
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_device)
        print("✅ Modelo cargado!")
        return _tts, _device
    except Exception as e:
        print(f"❌ Error al cargar modelo: {e}")
        raise

# ── Limpieza automática de temporales al cerrar ──
def _cleanup_on_exit():
    for f in TEMP_DIR.glob("tts_*.wav"):
        try:
            f.unlink()
        except Exception:
            pass

atexit.register(_cleanup_on_exit)

# ── Limpieza automática de archivos con más de 1 hora ──
def _cleanup_old_files():
    cutoff = time.time() - 3600
    for f in TEMP_DIR.glob("tts_*.wav"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
        except Exception:
            pass


@app.route('/health', methods=['GET'])
def health_check():
    """Verificar que el servidor está funcionando"""
    try:
        tts, device = get_tts()
        speaker_ok = Path(DEFAULT_SPEAKER_WAV).exists()
        return jsonify({
            "status": "ok",
            "model": "xtts_v2",
            "device": device,
            "speaker_wav": DEFAULT_SPEAKER_WAV,
            "speaker_wav_found": speaker_ok,
        })
    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 503


@app.route('/tts', methods=['POST'])
def text_to_speech():
    """
    Convertir texto a voz con XTTS v2.

    Body JSON:
      text        — texto a sintetizar (requerido)
      language    — código de idioma, ej: "es", "en" (default: "es")
      speaker_wav — ruta absoluta a WAV de referencia (opcional, usa DEFAULT_SPEAKER_WAV si no se envía)
    """
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "Se requiere el campo 'text'"}), 400

        text = data['text'].strip()
        if not text:
            return jsonify({"error": "El campo 'text' está vacío"}), 400
        if len(text) > MAX_TEXT_LENGTH:
            return jsonify({"error": f"Texto demasiado largo (máx {MAX_TEXT_LENGTH} chars)"}), 400

        language    = data.get('language', 'es')
        speaker_wav = data.get('speaker_wav', DEFAULT_SPEAKER_WAV)

        # XTTS v2 necesita un speaker_wav — sin él no funciona
        if not speaker_wav or not Path(speaker_wav).exists():
            return jsonify({
                "error": (
                    f"speaker_wav no encontrado: '{speaker_wav}'. "
                    "XTTS v2 necesita un archivo WAV de referencia. "
                    "Coloca 'speaker.wav' junto al servidor o define la variable SPEAKER_WAV."
                )
            }), 400

        tts, _ = get_tts()
        _cleanup_old_files()

        output_path = TEMP_DIR / f"tts_{uuid.uuid4().hex}.wav"
        print(f"🎤 [{language}] {text[:60]}{'...' if len(text)>60 else ''}")

        tts.tts_to_file(
            text=text,
            file_path=str(output_path),
            speaker_wav=speaker_wav,
            language=language,
        )

        print(f"✅ {output_path.name}")
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=output_path.name,
        )

    except Exception as e:
        print(f"❌ {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/tts/stream', methods=['POST'])
def text_to_speech_stream():
    """
    Genera audio por oraciones y retorna los WAV como lista descargable
    desde el endpoint GET /tts/file/<filename>.

    Body JSON: igual que /tts
    """
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "Se requiere el campo 'text'"}), 400

        text        = data['text'].strip()
        language    = data.get('language', 'es')
        speaker_wav = data.get('speaker_wav', DEFAULT_SPEAKER_WAV)

        if not speaker_wav or not Path(speaker_wav).exists():
            return jsonify({"error": f"speaker_wav no encontrado: '{speaker_wav}'"}), 400

        tts, _ = get_tts()
        sentences = [s.strip() for s in text.split('.') if s.strip()]
        audio_files = []

        for sentence in sentences:
            if not sentence:
                continue
            out = TEMP_DIR / f"tts_stream_{uuid.uuid4().hex}.wav"
            tts.tts_to_file(
                text=sentence + '.',
                file_path=str(out),
                speaker_wav=speaker_wav,
                language=language,
            )
            audio_files.append(out.name)

        return jsonify({"status": "success", "audio_files": audio_files})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/tts/file/<filename>', methods=['GET'])
def download_file(filename):
    """Descarga un archivo WAV generado por /tts/stream"""
    # Sanitizar: solo nombres simples, sin path traversal
    if '/' in filename or '\\' in filename or '..' in filename:
        return jsonify({"error": "Nombre de archivo inválido"}), 400
    path = TEMP_DIR / filename
    if not path.exists():
        return jsonify({"error": "Archivo no encontrado"}), 404
    return send_file(path, mimetype='audio/wav')


@app.route('/voices', methods=['GET'])
def list_voices():
    """Muestra la voz de referencia activa"""
    speaker_ok = Path(DEFAULT_SPEAKER_WAV).exists()
    return jsonify({
        "default_speaker_wav": DEFAULT_SPEAKER_WAV,
        "speaker_wav_found": speaker_ok,
        "note": "XTTS v2 clona la voz del speaker_wav. Puedes enviar tu propio speaker_wav en el body del POST /tts."
    })


@app.route('/cleanup', methods=['POST'])
def cleanup_temp_files():
    """Elimina todos los WAV temporales"""
    deleted = 0
    for f in TEMP_DIR.glob("tts_*.wav"):
        try:
            f.unlink()
            deleted += 1
        except Exception:
            pass
    return jsonify({"status": "success", "files_deleted": deleted})


if __name__ == '__main__':
    print("🚀 Servidor TTS API — XTTS v2")
    print(f"📁 Temporales: {TEMP_DIR}")
    print(f"🎙  Speaker WAV: {DEFAULT_SPEAKER_WAV} ({'✅ encontrado' if Path(DEFAULT_SPEAKER_WAV).exists() else '⚠ NO encontrado — /tts fallará hasta configurarlo'})")
    print("\n📝 Endpoints:")
    print("  POST /tts              → Texto a WAV (devuelve el archivo directamente)")
    print("  POST /tts/stream       → Texto a WAVs por oración")
    print("  GET  /tts/file/<name>  → Descargar WAV de /tts/stream")
    print("  GET  /health           → Estado del servidor")
    print("  GET  /voices           → Info del speaker activo")
    print("  POST /cleanup          → Borrar temporales")
    print("\n💡 Para cambiar la voz: SPEAKER_WAV=/ruta/a/voz.wav python tts_api_server.py")
    print("📡 Escuchando en http://localhost:5000\n")
    app.run(host='0.0.0.0', port=5000, debug=False)