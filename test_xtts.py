"""
Script de prueba simple para verificar que XTTS v2 funciona correctamente
"""

import torch
from TTS.api import TTS

print("=" * 60)
print("🎤 Prueba de XTTS v2")
print("=" * 60)

# Detectar dispositivo
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"\n📱 Dispositivo: {device}")

if device == "cuda":
    print(f"   GPU: {torch.cuda.get_device_name(0)}")
    print(f"   VRAM disponible: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

# Cargar modelo
print("\n🔄 Cargando modelo XTTS v2...")
print("   (Esto puede tardar varios minutos la primera vez)")

try:
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print("✅ Modelo cargado exitosamente!")
except Exception as e:
    print(f"❌ Error al cargar el modelo: {e}")
    exit(1)

# Generar audio de prueba
print("\n🎙️ Generando audio de prueba...")

texto_prueba = "Hola, esta es una prueba del modelo XTTS versión dos. La calidad de voz debería ser muy superior a la síntesis tradicional."

try:
    tts.tts_to_file(
        text=texto_prueba,
        file_path="prueba_xtts.wav",
        language="es"
    )
    print("✅ Audio generado: prueba_xtts.wav")
    print("\n🔊 Reproduce el archivo 'prueba_xtts.wav' para escuchar el resultado")
    
except Exception as e:
    print(f"❌ Error al generar audio: {e}")
    exit(1)

print("\n" + "=" * 60)
print("✅ Prueba completada exitosamente!")
print("=" * 60)
print("\n💡 Siguiente paso: ejecuta 'python tts_api_server.py' para iniciar el servidor")