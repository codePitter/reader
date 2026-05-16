@echo off
setlocal EnableDelayedExpansion
REM ════════════════════════════════════════════════════════════════
REM  setup_tts.bat — Instala el servidor TTS local (edge-tts)
REM  y lo configura para arrancar minimizado en la bandeja
REM
REM  EJECUTAR desde la carpeta donde estan los archivos .py
REM ════════════════════════════════════════════════════════════════

echo.
echo   +===========================================+
echo   ^|       Instalador del Servidor TTS        ^|
echo   ^|     edge-tts  ^|  Flask  ^|  Tray Icon     ^|
echo   +===========================================+
echo.

REM ── Guardar directorio actual ────────────────────────────────────
set "PROYECTO_DIR=%~dp0"
if "%PROYECTO_DIR:~-1%"=="\" set "PROYECTO_DIR=%PROYECTO_DIR:~0,-1%"

echo   Directorio del proyecto: %PROYECTO_DIR%
echo.

REM ── Verificar Python ────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Python no encontrado en el PATH.
    echo.
    echo   Descargalo desde: https://www.python.org/downloads/
    echo   Durante la instalacion marca "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo   Python detectado: %PYVER%

REM ── Buscar pythonw.exe (arranca sin ventana de consola) ──────────
for /f "delims=" %%p in ('python -c "import sys,os; print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))"') do set "PYTHONW=%%p"

if not exist "%PYTHONW%" (
    echo   [AVISO] pythonw.exe no encontrado. Se usara python.exe.
    set "PYTHONW=python"
) else (
    echo   pythonw.exe: %PYTHONW%
)
echo.

REM ── Instalar dependencias ────────────────────────────────────────
echo   -- Instalando dependencias --
echo.

echo   [1/4] Actualizando pip...
python -m pip install --upgrade pip --quiet 2>nul

echo   [2/4] Instalando edge-tts...
python -m pip install edge-tts --quiet
if %errorlevel% neq 0 goto :error_pip

echo   [3/4] Instalando Flask y Flask-CORS...
python -m pip install flask flask-cors --quiet
if %errorlevel% neq 0 goto :error_pip

echo   [4/4] Instalando pystray y Pillow (icono de bandeja)...
python -m pip install pystray pillow --quiet
if %errorlevel% neq 0 (
    echo   [ERROR] No se pudo instalar pystray/Pillow.
    echo           Son necesarios para el icono en la bandeja del sistema.
    echo.
    echo   Intentalo manualmente: python -m pip install pystray pillow
    goto :fin_error
)

REM ── Verificar imports ────────────────────────────────────────────
echo.
echo   Verificando instalacion...
python -c "import edge_tts, flask, flask_cors, pystray, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Una o mas dependencias no se importan correctamente.
    goto :fin_error
)
echo   OK todas las dependencias instaladas correctamente.

REM ── Verificar archivos del proyecto ─────────────────────────────
echo.
if not exist "%PROYECTO_DIR%\tts_server_tray.py" (
    echo   [ERROR] No se encuentra tts_server_tray.py en:
    echo           %PROYECTO_DIR%
    echo   Asegurate de ejecutar este .bat desde la carpeta del proyecto.
    goto :fin_error
)
echo   OK tts_server_tray.py encontrado.

REM ════════════════════════════════════════════════════════════════
REM  AUTOSTART — preguntar al usuario
REM ════════════════════════════════════════════════════════════════
echo.
echo   -- Inicio automatico con Windows --
echo.
echo   Deseas que el servidor TTS arranque automaticamente
echo   cuando inicias Windows?
echo   (Quedara minimizado en la bandeja del sistema)
echo.
set /p AUTOSTART="   Iniciar con Windows? [S/N]: "

if /i "!AUTOSTART!"=="S" (
    call :registrar_autostart
) else (
    echo.
    echo   Inicio automatico: NO configurado.
    echo   Para iniciarlo manualmente ejecuta:
    echo     pythonw "%PROYECTO_DIR%\tts_server_tray.py"
)

REM ════════════════════════════════════════════════════════════════
REM  FIN
REM ════════════════════════════════════════════════════════════════
echo.
echo   +===========================================+
echo   ^|         Instalacion completada!          ^|
echo   +===========================================+
echo.
echo   Inicio manual en la bandeja del sistema:
echo     pythonw "%PROYECTO_DIR%\tts_server_tray.py"
echo.
echo   Inicio con consola (para debug):
echo     python "%PROYECTO_DIR%\tts_server_tray.py"
echo.

set /p INICIAR_AHORA="   Iniciar el servidor ahora? [S/N]: "
if /i "!INICIAR_AHORA!"=="S" (
    echo.
    echo   Iniciando servidor en la bandeja del sistema...
    start "" "%PYTHONW%" "%PROYECTO_DIR%\tts_server_tray.py"
    echo   Busca el icono verde con la T en la bandeja del sistema.
    echo   (esquina inferior derecha, puede estar oculto en la flecha ^)
)

echo.
pause
exit /b 0


REM ════════════════════════════════════════════════════════════════
REM  SUBRUTINA: escribir en el registro de Windows (HKCU\Run)
REM ════════════════════════════════════════════════════════════════
:registrar_autostart
    set "REG_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
    set "REG_NAME=TTS Server"
    set "REG_VALUE="%PYTHONW%" "%PROYECTO_DIR%\tts_server_tray.py""

    REM Eliminar entrada previa si ya existia
    reg delete "%REG_KEY%" /v "%REG_NAME%" /f >nul 2>&1

    REM Registrar nueva entrada
    reg add "%REG_KEY%" /v "%REG_NAME%" /t REG_SZ /d "%REG_VALUE%" /f >nul 2>&1

    if %errorlevel% neq 0 (
        echo.
        echo   [ERROR] No se pudo escribir en el registro de Windows.
        echo   Intentalo ejecutando el .bat como Administrador
        echo   (clic derecho ^> Ejecutar como administrador).
    ) else (
        echo.
        echo   OK Inicio automatico configurado.
        echo      El servidor arrancara en la bandeja cada vez
        echo      que inicies sesion en Windows.
        echo.
        echo   Para desactivarlo: clic derecho en el icono de la
        echo   bandeja y desmarca "Arrancar al iniciar el sistema".
    )
    goto :eof


REM ════════════════════════════════════════════════════════════════
:error_pip
    echo.
    echo   [ERROR] Fallo la instalacion de una dependencia pip.
    echo   Intentalo manualmente:
    echo     python -m pip install edge-tts flask flask-cors pystray pillow
    echo.

:fin_error
    echo.
    pause
    exit /b 1
