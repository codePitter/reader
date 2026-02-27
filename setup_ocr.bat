@echo off
REM ════════════════════════════════════════════════════════════════
REM  setup_ocr.bat — Instala Tesseract.js v5 para uso OFFLINE
REM
REM  EJECUTAR desde la RAIZ del proyecto (donde esta index.html)
REM  Doble clic o: cd C:\ruta\proyecto && setup_ocr.bat
REM
REM  Crea:  raiz/tesseract/tesseract.min.js  (y demas archivos)
REM ════════════════════════════════════════════════════════════════

echo.
echo   Instalando Tesseract.js offline...
echo   Directorio: %CD%
echo.

set B=tesseract
set JS=https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist
set CORE=https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0
set LANG=https://tessdata.projectnaptha.com/4.0.0

if not exist "%B%"      mkdir "%B%"
if not exist "%B%\lang" mkdir "%B%\lang"

call :get "%JS%/tesseract.min.js"              "%B%\tesseract.min.js"
call :get "%JS%/worker.min.js"                 "%B%\worker.min.js"
call :get "%CORE%/tesseract-core.wasm.js"      "%B%\tesseract-core.wasm.js"
call :get "%CORE%/tesseract-core-simd.wasm.js" "%B%\tesseract-core-simd.wasm.js"
call :get "%LANG%/spa.traineddata.gz"          "%B%\lang\spa.traineddata.gz"
call :get "%LANG%/eng.traineddata.gz"          "%B%\lang\eng.traineddata.gz"
call :get "%LANG%/jpn.traineddata.gz"          "%B%\lang\jpn.traineddata.gz"
call :get "%LANG%/chi_sim.traineddata.gz"      "%B%\lang\chi_sim.traineddata.gz"
call :get "%LANG%/por.traineddata.gz"          "%B%\lang\por.traineddata.gz"
call :get "%LANG%/fra.traineddata.gz"          "%B%\lang\fra.traineddata.gz"
call :get "%LANG%/deu.traineddata.gz"          "%B%\lang\deu.traineddata.gz"
call :get "%LANG%/ita.traineddata.gz"          "%B%\lang\ita.traineddata.gz"
call :get "%LANG%/kor.traineddata.gz"          "%B%\lang\kor.traineddata.gz"

echo.
echo   Listo. Ahora el OCR funciona sin internet.
echo.
pause
goto :eof

:get
if exist "%~2" ( echo   OK ya existe: %~nx2 & goto :eof )
echo   Descargando %~nx2 ...
powershell -Command "Invoke-WebRequest -Uri '%~1' -OutFile '%~2' -UseBasicParsing" 2>nul
if %errorlevel% neq 0 ( echo   ERROR descargando %~1 ) else ( echo   OK %~nx2 )
goto :eof