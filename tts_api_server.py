"""
Servidor API para TTS con XTTS v2
Requisitos: pip install TTS flask flask-cors torch
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import torch
from TTS.api import TTS
import os
import tempfile
import uuid
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Permitir CORS para conexiones desde el navegador

# Configuración
TEMP_DIR = Path(tempfile.gettempdir()) / "tts_outputs"
TEMP_DIR.mkdir(exist_ok=True)

# Inicializar el modelo
print("🔄 Cargando modelo XTTS v2...")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"📱 Usando dispositivo: {device}")

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("✅ Modelo cargado exitosamente!")

# Voces de referencia opcionales (puedes agregar tus propias voces aquí)
REFERENCE_VOICES = {
    "default": None  # Sin clonación, usa voz por defecto
}

@app.route('/health', methods=['GET'])
def health_check():
    """Verificar que el servidor está funcionando"""
    return jsonify({
        "status": "ok",
        "model": "xtts_v2",
        "device": device
    })

@app.route('/tts', methods=['POST'])
def text_to_speech():
    """
    Endpoint principal para convertir texto a voz
    
    Parámetros JSON:
    - text: Texto a convertir
    - language: Código de idioma (default: "es")
    - speaker_wav: Ruta a archivo de voz de referencia (opcional)
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({"error": "Se requiere el campo 'text'"}), 400
        
        text = data['text']
        language = data.get('language', 'es')
        
        # Generar nombre de archivo único
        output_filename = f"tts_{uuid.uuid4().hex}.wav"
        output_path = TEMP_DIR / output_filename
        
        print(f"🎤 Generando audio para: {text[:50]}...")
        
        # Si hay un speaker_wav proporcionado, usar clonación de voz
        speaker_wav = data.get('speaker_wav')
        
        if speaker_wav and os.path.exists(speaker_wav):
            # Con clonación de voz
            tts.tts_to_file(
                text=text,
                file_path=str(output_path),
                speaker_wav=speaker_wav,
                language=language
            )
        else:
            # Sin clonación, voz por defecto
            tts.tts_to_file(
                text=text,
                file_path=str(output_path),
                language=language
            )
        
        print(f"✅ Audio generado: {output_filename}")
        
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=output_filename
        )
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/tts/stream', methods=['POST'])
def text_to_speech_stream():
    """
    Endpoint para streaming de audio (más rápido para respuestas largas)
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({"error": "Se requiere el campo 'text'"}), 400
        
        text = data['text']
        language = data.get('language', 'es')
        
        # Para streaming, dividir texto en oraciones
        sentences = [s.strip() + '.' for s in text.split('.') if s.strip()]
        
        audio_files = []
        
        for i, sentence in enumerate(sentences):
            output_filename = f"tts_stream_{uuid.uuid4().hex}.wav"
            output_path = TEMP_DIR / output_filename
            
            tts.tts_to_file(
                text=sentence,
                file_path=str(output_path),
                language=language
            )
            
            audio_files.append(str(output_path))
        
        # Retornar lista de archivos para descarga
        return jsonify({
            "status": "success",
            "audio_files": [os.path.basename(f) for f in audio_files]
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/voices', methods=['GET'])
def list_voices():
    """Listar voces de referencia disponibles"""
    return jsonify({
        "voices": list(REFERENCE_VOICES.keys())
    })

@app.route('/cleanup', methods=['POST'])
def cleanup_temp_files():
    """Limpiar archivos temporales antiguos"""
    try:
        deleted = 0
        for file in TEMP_DIR.glob("tts_*.wav"):
            file.unlink()
            deleted += 1
        
        return jsonify({
            "status": "success",
            "files_deleted": deleted
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 Iniciando servidor TTS API...")
    print(f"📡 Servidor disponible en: http://localhost:5000")
    print(f"🎤 Modelo: XTTS v2 ({device})")
    print("\n📝 Endpoints disponibles:")
    print("  - POST /tts           → Convertir texto a voz")
    print("  - POST /tts/stream    → Streaming de audio")
    print("  - GET  /health        → Estado del servidor")
    print("  - GET  /voices        → Voces disponibles")
    print("  - POST /cleanup       → Limpiar archivos temporales")
    
    app.run(host='0.0.0.0', port=5000, debug=False)