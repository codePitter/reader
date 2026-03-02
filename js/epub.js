// ═══════════════════════════════════════
// EPUB — Carga, parsing y navegación de capítulos
// Depende de: main.js (archivosHTML, detenerTTS, cargarCapitulo)
//             translation.js (traduccionAutomatica, ttsHumanizerActivo, _capCache, etc.)
// ═══════════════════════════════════════

// ======================
// CARGA DE ARCHIVOS EPUB
// ======================

// Cargar archivo EPUB
// Interceptar el label para abrir en Documents si showOpenFilePicker esta disponible
(function () {
    const lbl = document.querySelector('label[for="epub-file"]');
    const inp = document.getElementById('epub-file');
    if (lbl && inp && typeof window.showOpenFilePicker === 'function') {
        lbl.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                const [fileHandle] = await window.showOpenFilePicker({
                    startIn: 'documents',
                    types: [{
                        description: 'Libros y documentos', accept: {
                            'application/epub+zip': ['.epub'],
                            'text/plain': ['.txt'],
                            'text/html': ['.html', '.htm'],
                            'application/pdf': ['.pdf'],
                            'application/octet-stream': ['.fb2', '.fb3', '.mobi', '.prc', '.azw3', '.azw', '.cbz', '.cbr'],
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                            'application/rtf': ['.rtf']
                        }
                    }],
                    multiple: false
                });
                const file = await fileHandle.getFile();
                // Disparar el change handler con el archivo obtenido
                const dt = new DataTransfer();
                dt.items.add(file);
                inp.files = dt.files;
                inp.dispatchEvent(new Event('change'));
            } catch (err) {
                if (err.name !== 'AbortError') inp.click(); // fallback al selector nativo
            }
        });
    }
})();

document.getElementById('epub-file').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.epub')) {
        mostrarNotificacion('⚠ Selecciona un archivo EPUB válido');
        return;
    }

    // Registrar nombre y cargar los reemplazos guardados para este libro
    _epubFilename = file.name;
    if (typeof cargarReemplazosParaArchivo === 'function') cargarReemplazosParaArchivo(file.name);

    try {
        document.getElementById('file-name').textContent = 'Cargando...';
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        archivosHTML = {};
        const promesas = [];

        // ── También capturar TOC/NCX/NAV para extraer títulos reales ──
        let _tocMap = {};
        let _ncxText = null, _navText = null, _opfBase = '';

        zip.forEach((rutaRelativa, archivo) => {
            if (rutaRelativa.match(/\.(html|xhtml)$/i) && !rutaRelativa.includes('nav.xhtml')) {
                promesas.push(
                    archivo.async('text').then(contenido => {
                        archivosHTML[rutaRelativa] = contenido;
                    })
                );
            }
            if (rutaRelativa.match(/toc\.ncx$/i)) {
                promesas.push(archivo.async('text').then(t => { _ncxText = t; }));
            }
            if (rutaRelativa.match(/nav\.xhtml$/i)) {
                promesas.push(archivo.async('text').then(t => { _navText = t; }));
            }
            if (rutaRelativa.match(/\.opf$/i)) {
                _opfBase = rutaRelativa.split('/').slice(0, -1).join('/');
            }
        });

        await Promise.all(promesas);

        // Construir mapa ruta → título desde NCX (EPUB2)
        if (_ncxText) {
            try {
                const _ncxDoc = new DOMParser().parseFromString(_ncxText, 'application/xml');
                _ncxDoc.querySelectorAll('navPoint').forEach(np => {
                    const src = np.querySelector('content')?.getAttribute('src');
                    const label = np.querySelector('navLabel text')?.textContent?.trim();
                    if (src && label) {
                        const clean = src.split('#')[0];
                        _tocMap[clean] = label;
                        if (_opfBase) _tocMap[_opfBase + '/' + clean] = label;
                    }
                });
            } catch (e) { console.warn('NCX parse error', e); }
        }

        // Construir mapa ruta → título desde nav.xhtml (EPUB3)
        if (_navText) {
            try {
                const _navDoc = new DOMParser().parseFromString(_navText, 'text/html');
                _navDoc.querySelectorAll('nav a, ol a').forEach(a => {
                    const href = a.getAttribute('href');
                    const label = a.textContent.trim();
                    if (href && label) {
                        const clean = href.split('#')[0];
                        _tocMap[clean] = label;
                        if (_opfBase) _tocMap[_opfBase + '/' + clean] = label;
                    }
                });
            } catch (e) { console.warn('NAV parse error', e); }
        }

        // Ordenar numéricamente extrayendo todos los números del nombre de archivo
        const archivosOrdenados = Object.keys(archivosHTML).sort((a, b) => {
            // Extraer secuencia de números del path completo para comparar
            const numA = a.match(/\d+/g);
            const numB = b.match(/\d+/g);
            if (numA && numB) {
                // Comparar de mayor a menor grupo numérico significativo
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    const nA = parseInt(numA[i] || 0);
                    const nB = parseInt(numB[i] || 0);
                    if (nA !== nB) return nA - nB;
                }
            }
            return a.localeCompare(b);
        });

        if (archivosOrdenados.length === 0) {
            throw new Error('No se encontraron capítulos en el EPUB');
        }

        const selector = document.getElementById('chapters');
        selector.innerHTML = '';

        archivosOrdenados.forEach((ruta, index) => {
            const option = document.createElement('option');
            option.value = ruta;

            const parser = new DOMParser();
            const doc = parser.parseFromString(archivosHTML[ruta], 'text/html');

            // Método mejorado para extraer el título del capítulo
            let titulo = null;

            // 0. PRIORIDAD: buscar en el TOC/NCX del EPUB (fuente más confiable)
            // Intentar con ruta completa, luego solo el nombre de archivo
            const rutaCorta = ruta.split('/').pop();
            if (_tocMap[ruta]) {
                titulo = _tocMap[ruta];
            } else if (_tocMap[rutaCorta]) {
                titulo = _tocMap[rutaCorta];
            }

            // 1. Si no está en TOC, intentar <title> (solo si no dice "Unknown")
            if (!titulo) {
                const titleElement = doc.querySelector('title');
                const t = titleElement?.textContent?.trim();
                if (t && !/^unknown$/i.test(t)) titulo = t;
            }

            // 2. Intentar obtener del primer h1, h2 o h3
            if (!titulo) {
                const heading = doc.querySelector('h1, h2, h3');
                if (heading && heading.textContent.trim()) {
                    titulo = heading.textContent.trim();
                }
            }

            // 3. Buscar en el body cualquier texto que parezca un título
            if (!titulo) {
                const firstP = doc.querySelector('p');
                if (firstP && firstP.textContent.trim().length < 100) {
                    titulo = firstP.textContent.trim();
                }
            }

            // 4. Extraer del nombre del archivo si contiene información útil
            if (!titulo) {
                const nombreArchivo = ruta.split('/').pop().replace(/\.(html|xhtml)$/i, '');
                const match = nombreArchivo.match(/(\d+)|chapter|cap|ch/i);
                if (match) {
                    titulo = nombreArchivo.replace(/_/g, ' ').replace(/-/g, ' ');
                }
            }

            // 5. Usar número de capítulo como último recurso
            if (!titulo) {
                titulo = `Capítulo ${index + 1}`;
            }

            // Limpiar y formatear el título
            titulo = titulo
                .replace(/^\s*chapter\s*/i, 'Capítulo ')
                .replace(/^\s*cap\s*/i, 'Capítulo ')
                .replace(/^\s*ch\s*/i, 'Capítulo ')
                .trim();

            // Agregar número si no lo tiene
            if (!/\d/.test(titulo)) {
                option.textContent = `${index + 1}. ${titulo}`;
            } else {
                option.textContent = titulo;
            }

            selector.appendChild(option);
        });

        window._cargandoProgramaticamente = true;
        selector.selectedIndex = 0;
        window._cargandoProgramaticamente = false;

        document.getElementById('chapter-selector').style.display = 'block';
        document.getElementById('file-name').textContent = `${file.name} (${archivosOrdenados.length} capítulos)`;
        mostrarNotificacion('✓ EPUB cargado correctamente');

        if (archivosOrdenados.length > 0) {
            cargarCapitulo(archivosOrdenados[0]);
        }

    } catch (error) {
        console.error('Error al cargar EPUB:', error);
        document.getElementById('file-name').textContent = 'Error al cargar';
        mostrarNotificacion('⚠ Error al cargar EPUB: ' + error.message);
    }
});

// Cargar capítulo seleccionado
async function cargarCapitulo(ruta, _cancelToken) {
    if (!ruta || !archivosHTML[ruta]) return;

    // Si no se pasa token, capturar el actual (para no romper llamadas existentes)
    if (_cancelToken === undefined) _cancelToken = typeof _cargaCapituloToken !== 'undefined' ? _cargaCapituloToken : 0;
    const _isCancelled = () => typeof _cargaCapituloToken !== 'undefined' && _cargaCapituloToken !== _cancelToken;

    const _limpiarBarrasCancelacion = () => {
        ['main-processing-bar', 'video-translation-progress'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const fill = document.getElementById('progress-fill');
        const pctEl = document.getElementById('tts-percent');
        const label2 = document.getElementById('tts-status-label');
        const statusEl = document.getElementById('tts-status');
        if (fill) fill.style.width = '0%';
        if (pctEl) pctEl.style.display = 'none';
        if (label2) label2.textContent = '';
        if (statusEl) statusEl.textContent = 'Detenido';
        const ambPlayer = document.getElementById('ambient-player');
        if (ambPlayer && typeof ambientPlaying !== 'undefined') {
            ambPlayer.style.opacity = '';
            ambPlayer.style.pointerEvents = '';
        }
        if (typeof ocultarNotificacionPersistente === 'function') ocultarNotificacionPersistente();
        setTimeout(() => { if (typeof mostrarNotificacion === 'function') mostrarNotificacion('✕ Proceso cancelado'); }, 100);
    };

    // Detener TTS si está activo
    detenerTTS();

    // Cancelar cualquier BG en curso (el nuevo capítulo necesita su propio BG luego)
    _bgCancelToken++;

    try {
        let textoCompleto;

        // ── Usar cache si está disponible y el estado coincide ──
        const estadoHumanizador = ttsHumanizerActivo && !!claudeApiKey;
        const entrada = _capCache[ruta];
        if (entrada && entrada.traducida === traduccionAutomatica && entrada.humanizada === estadoHumanizador) {
            console.log(`⚡ Cargando desde cache: ${ruta.split('/').pop()}`);
            textoCompleto = entrada.texto;
            // Onomatopeyas automáticas sobre el texto cacheado
            if (typeof autoReemplazarOnomatopeyas !== 'undefined' && autoReemplazarOnomatopeyas &&
                typeof aplicarOnomatopeyasAutomatico === 'function') {
                textoCompleto = aplicarOnomatopeyasAutomatico(textoCompleto);
            }
            // Re-aplicar reemplazos al cargar desde cache: pueden haber cambiado desde que se cacheó
            textoCompleto = aplicarReemplazosAutomaticos(textoCompleto);
            delete _capCache[ruta];
        } else {
            // Cache inválido o no existe — procesar ahora
            if (entrada) {
                console.log(`♻ Cache invalidado: ${ruta.split('/').pop()}`);
                delete _capCache[ruta];
            }

            // Extraer texto del HTML
            const contenidoHTML = archivosHTML[ruta];
            const parser = new DOMParser();
            const doc = parser.parseFromString(contenidoHTML, 'text/html');
            const body = doc.body.cloneNode(true);

            body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
            body.querySelectorAll('a[href*="index_split"]').forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.tagName === 'P') parent.remove();
            });

            const BLOQUES = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'LI']);
            const parrafos = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote, li');
            textoCompleto = '';
            parrafos.forEach(elemento => {
                // Saltar si tiene hijos que también son elementos de bloque (evita duplicación)
                const tieneHijoBloque = Array.from(elemento.children).some(c => BLOQUES.has(c.tagName));
                if (tieneHijoBloque) return;
                const texto = (elemento.textContent || '').trim();
                if (texto.length > 0) {
                    textoCompleto += (elemento.tagName.startsWith('H') ? '\n\n' + texto + '\n\n' : texto + '\n\n');
                }
            });
            textoCompleto = textoCompleto.replace(/\n\n\n+/g, '\n\n').trim();

            // ─── Barra de progreso unificada: 4 fases ───
            // Fase 1 (0-55%):  Traducción párrafo a párrafo
            // Fase 2 (55-70%): Revisión
            // Fase 3 (70-85%): Optimización IA
            // Fase 4 (85-100%): Gramática + onomatopeyas
            const _mostrarBarraFase = (fase, pctFase, label) => {
                if (_traduccionEnBackground) return;
                let pctGlobal;
                if (fase === 1) pctGlobal = Math.round(pctFase * 0.55);           // 0-55%
                else if (fase === 2) pctGlobal = Math.round(55 + pctFase * 0.15); // 55-70%
                else if (fase === 3) pctGlobal = Math.round(70 + pctFase * 0.15); // 70-85%
                else pctGlobal = Math.round(85 + pctFase * 0.15);                 // 85-100%

                const labelTexto = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

                // ── Barra del reading area (main) ──
                const mpbWrap = document.getElementById('main-processing-bar');
                const mpbFill = document.getElementById('mpb-fill');
                const mpbPct = document.getElementById('mpb-pct');
                const mpbLabel = document.getElementById('mpb-label');
                const mpbF1 = document.getElementById('mpb-f1');
                const mpbF2 = document.getElementById('mpb-f2');
                const mpbF3 = document.getElementById('mpb-f3');
                if (mpbWrap) mpbWrap.style.display = 'flex';
                // Atenuar ambient player durante TRO para no obstruir la vista
                // Guard: solo si player.js cargó (ambientGainNode o el elemento existen)
                const ambPlayer = document.getElementById('ambient-player');
                if (ambPlayer && typeof ambientPlaying !== 'undefined') {
                    ambPlayer.style.opacity = '0.15';
                    ambPlayer.style.pointerEvents = 'none';
                }
                if (mpbFill) mpbFill.style.width = pctGlobal + '%';
                if (mpbPct) mpbPct.textContent = pctGlobal + '%';
                if (mpbLabel) mpbLabel.textContent = labelTexto;
                if (mpbF1) mpbF1.style.color = fase >= 2 ? 'var(--text-muted)' : 'var(--accent2)';
                if (mpbF2) mpbF2.style.color = fase === 2 ? 'var(--accent2)' : (fase > 2 ? 'var(--text-muted)' : 'var(--text-dim)');
                if (mpbF3) mpbF3.style.color = fase === 3 ? 'var(--accent2)' : (fase > 3 ? 'var(--text-muted)' : 'var(--text-dim)');
                const mpbF4 = document.getElementById('mpb-f4');
                if (mpbF4) mpbF4.style.color = fase === 4 ? 'var(--accent2)' : 'var(--text-dim)';

                // ── Barra antigua (progress-fill + tts-status-label) ──
                const fill = document.getElementById('progress-fill');
                const label2 = document.getElementById('tts-status-label');
                const pctEl = document.getElementById('tts-percent');
                if (fill) fill.style.width = pctGlobal + '%';
                if (pctEl) { pctEl.textContent = pctGlobal + '%'; pctEl.style.display = 'inline'; }
                if (label2) label2.innerHTML = label;

                // ── Overlay del modo video (video) ──
                const kWrap = document.getElementById('video-translation-progress');
                const kFill = document.getElementById('ktl-fill');
                const kPct = document.getElementById('ktl-pct');
                const kLabel = document.getElementById('ktl-label');
                const kF1 = document.getElementById('ktl-f1');
                const kF2 = document.getElementById('ktl-f2');
                const kF3 = document.getElementById('ktl-f3');
                if (kWrap) kWrap.style.display = 'flex';
                if (kFill) kFill.style.width = pctGlobal + '%';
                if (kPct) kPct.textContent = pctGlobal + '%';
                if (kLabel) kLabel.textContent = labelTexto;
                if (kF1) kF1.style.color = fase >= 2 ? 'var(--text-muted)' : 'var(--accent2)';
                if (kF2) kF2.style.color = fase === 2 ? 'var(--accent2)' : (fase > 2 ? 'var(--text-muted)' : 'var(--text-dim)');
                if (kF3) kF3.style.color = fase === 3 ? 'var(--accent2)' : (fase > 3 ? 'var(--text-muted)' : 'var(--text-dim)');
                const kF4 = document.getElementById('ktl-f4');
                if (kF4) kF4.style.color = fase === 4 ? 'var(--accent2)' : 'var(--text-dim)';
            };

            if (traduccionAutomatica) {
                document.getElementById('texto-contenido').innerHTML = '';
                document.getElementById('tts-status').textContent = 'Traduciendo...';

                // Sobrescribir actualizarProgresoTraduccion para usar escala de fase 1
                const _origActualizar = window._overrideActualizarProgreso;
                window._overrideActualizarProgreso = (actual, total) => {
                    _mostrarBarraFase(1, (actual / total) * 100, `<span style="color:var(--accent2)">⟳</span> Traduciendo... ${actual}/${total}`);
                };

                textoCompleto = await traducirTexto(textoCompleto);

                if (_isCancelled()) { _limpiarBarrasCancelacion(); return; }

                window._overrideActualizarProgreso = null;
                document.getElementById('tts-status').textContent = 'Revisando...';

                // Fase 2: Revisión explícita — detectar y re-traducir párrafos que quedaron en inglés
                _mostrarBarraFase(2, 0, `<span style="color:var(--accent)">🔍</span> Revisando traducción...`);
                textoCompleto = await revisarYRetraducirTexto(textoCompleto);
                if (_isCancelled()) { _limpiarBarrasCancelacion(); return; }
                _mostrarBarraFase(2, 100, `<span style="color:var(--accent)">🔍</span> Revisión completa ✓`);
                await new Promise(r => setTimeout(r, 300));
                document.getElementById('tts-status').textContent = 'Detenido';
            }

            // Fase 2.5: Limpieza silenciosa de URLs (entre revisión y optimización)
            textoCompleto = limpiarURLs(textoCompleto);

            if (_isCancelled()) { _limpiarBarrasCancelacion(); return; }

            // Fase 3: Optimización IA
            if (ttsHumanizerActivo && claudeApiKey) {
                document.getElementById('tts-status').textContent = '✨ Optimizando...';
                textoCompleto = await naturalizarTextoParaTTS(textoCompleto, (hecho, total) => {
                    _mostrarBarraFase(3, (hecho / total) * 100, `<span style="color:var(--accent)">✨</span> Optimizando con IA... ${hecho}/${total}`);
                });
                if (_isCancelled()) { _limpiarBarrasCancelacion(); return; }
                document.getElementById('tts-status').textContent = 'Detenido';
            }

            // Completar barra fases 1-3 y mostrar transición
            _mostrarBarraFase(3, 100, '✓ Optimización lista');
            await new Promise(r => setTimeout(r, 150));
        }

        // ── Fase 4: Gramática → Onomatopeyas (en este orden: LT no debe ver los reemplazos) ──
        const _grammarActivo = typeof grammarReviewActivo !== 'undefined' && grammarReviewActivo &&
            typeof revisarGramaticaYOnomatopeyas === 'function';
        const _autoOnomaActivo = typeof autoReemplazarOnomatopeyas !== 'undefined' && autoReemplazarOnomatopeyas &&
            typeof aplicarOnomatopeyasAutomatico === 'function';

        if (_grammarActivo) {
            // Revisión gramatical primero — antes de onomatopeyas para que LT
            // no intente "corregir" los reemplazos (ej: "chistó" como error)
            const mpbWrap2 = document.getElementById('main-processing-bar');
            if (mpbWrap2) mpbWrap2.style.display = 'flex';
            const mpbFill2 = document.getElementById('mpb-fill');
            const mpbPct2 = document.getElementById('mpb-pct');
            const mpbLabel2 = document.getElementById('mpb-label');
            if (mpbFill2) mpbFill2.style.width = '85%';
            if (mpbPct2) mpbPct2.textContent = '85%';
            if (mpbLabel2) mpbLabel2.textContent = '📝 Revisión gramatical...';
            const mpbF4b = document.getElementById('mpb-f4');
            if (mpbF4b) mpbF4b.style.color = 'var(--accent2)';
            document.getElementById('tts-status').textContent = '📝 Gramática...';
            textoCompleto = await revisarGramaticaYOnomatopeyas(textoCompleto);
            if (_isCancelled()) {
                ['main-processing-bar', 'video-translation-progress'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.style.display = 'none';
                });
                return;
            }
            document.getElementById('tts-status').textContent = 'Detenido';
        }

        if (_autoOnomaActivo) {
            // Onomatopeyas AL FINAL — sobre el texto ya traducido y revisado
            textoCompleto = aplicarOnomatopeyasAutomatico(textoCompleto);
        }

        // ── Reemplazos manuales del usuario ──
        textoCompleto = aplicarReemplazosAutomaticos(textoCompleto);

        // ── Ocultar barra de progreso ──
        {
            const lastFase = (_grammarActivo || _autoOnomaActivo) ? 4 : 3;
            const mpbWrapF = document.getElementById('main-processing-bar');
            const mpbFillF = document.getElementById('mpb-fill');
            const mpbPctF = document.getElementById('mpb-pct');
            const mpbLabelF = document.getElementById('mpb-label');
            if (mpbFillF) mpbFillF.style.width = '100%';
            if (mpbPctF) mpbPctF.textContent = '100%';
            if (mpbLabelF) mpbLabelF.textContent = '✓ Listo';
            setTimeout(() => {
                if (mpbWrapF) mpbWrapF.style.display = 'none';
                const kWrap = document.getElementById('video-translation-progress');
                if (kWrap) kWrap.style.display = 'none';
                const ambPlayerEl = document.getElementById('ambient-player');
                if (ambPlayerEl && typeof ambientPlaying !== 'undefined') {
                    ambPlayerEl.style.opacity = '';
                    ambPlayerEl.style.pointerEvents = '';
                }
                const fill = document.getElementById('progress-fill');
                const pctEl = document.getElementById('tts-percent');
                if (fill) setTimeout(() => { fill.style.width = '0%'; }, 400);
                if (pctEl) setTimeout(() => { pctEl.style.display = 'none'; }, 400);
            }, 800);
        }

        renderizarTextoEnContenedor(document.getElementById('texto-contenido'), textoCompleto);
        actualizarEstadisticas();

        // ── Actualizar título de capítulo en el header (junto al botón Editor) ──
        const selector = document.getElementById('chapters');
        const tituloSeleccionado = selector?.options[selector.selectedIndex]?.textContent || '';
        const headerTitleEl = document.getElementById('current-chapter-title');
        if (headerTitleEl && tituloSeleccionado) {
            headerTitleEl.textContent = tituloSeleccionado;
        }

        // Actualizar título de capítulo en el visor modo video
        const capEl = document.getElementById('kp-chapter');
        const tituloActual = document.getElementById('current-chapter-title')?.textContent || '';
        if (capEl) capEl.textContent = tituloActual;

        mostrarNotificacion(traduccionAutomatica ? '✓ Capítulo listo' : '✓ Capítulo cargado');

        // ── Detectar universo narrativo ahora que el texto está disponible ──
        // Se llama aquí (y no solo en activarModoVideo) para que el pool de imágenes
        // empiece a cargarse en background antes de que el usuario inicie la reproducción.
        // detectarUniverso() lee el nombre del archivo y el título del capítulo,
        // que ya están seteados en este punto.
        if (typeof detectarUniverso === 'function') {
            setTimeout(() => detectarUniverso(), 100);
        }

        // ── Habilitar botones de exportar ahora que hay contenido cargado ──
        const btnExportVideo = document.getElementById('btn-export-video');
        const btnExportAudio = document.getElementById('btn-export-audio');
        if (btnExportVideo) btnExportVideo.disabled = false;
        if (btnExportAudio) btnExportAudio.disabled = false;

        // ── Determinar si iniciar TTS automáticamente ──
        const eraNavegacionIntencionada = !!window._navegacionIntencionada;
        window._navegacionIntencionada = false;

        const autoPlayCheckbox = document.getElementById('auto-play-after-translate');
        const debeAutoPlay = autoPlayCheckbox && autoPlayCheckbox.checked
            && (traduccionAutomatica || (ttsHumanizerActivo && claudeApiKey));

        if (eraNavegacionIntencionada && typeof videoActive !== 'undefined' && videoActive) {
            setTimeout(() => { iniciarTTS(); }, 200);
        } else if (debeAutoPlay && !eraNavegacionIntencionada) {
            setTimeout(() => { iniciarTTS(); }, 400);
        }

        // ── Pre-procesar el siguiente y el anterior capítulo en background ──
        // El siguiente arranca a los 5s; el anterior a los 12s (para no competir con el siguiente).
        // Ambos respetan el token: si el usuario navega antes, los callbacks no hacen nada.
        _limpiarCache(ruta);
        const siguiente = _getSiguienteRuta(ruta);
        const anterior = _getAnteriorRuta(ruta);
        const tokenAlProgramar = _bgCancelToken;

        if (siguiente) {
            setTimeout(() => {
                if (_bgCancelToken === tokenAlProgramar) {
                    _preTradducirCapitulo(siguiente, 'siguiente');
                }
            }, 5000);
        }

        if (anterior) {
            setTimeout(() => {
                // Solo arrancar si no se navegó Y si el siguiente ya terminó (token no cambiado)
                if (_bgCancelToken === tokenAlProgramar) {
                    _preTradducirCapitulo(anterior, 'anterior');
                }
            }, 12000);
        }

    } catch (error) {
        console.error('Error al cargar capítulo:', error);
        mostrarNotificacion('⚠ Error al cargar el capítulo: ' + error.message);
    }
}

// Evento de cambio en el selector de capítulos
// Solo responde a cambios hechos por el usuario (no navegación programática)
window._cargandoProgramaticamente = false;
document.getElementById('chapters').addEventListener('change', function (e) {
    if (window._cargandoProgramaticamente) return;
    // Al cambiar de capítulo manualmente, siempre mostrar botón Aplicar
    // para que el usuario pueda re-procesar con la configuración actual
    if (typeof traduccionAutomatica !== 'undefined' || typeof ttsHumanizerActivo !== 'undefined') {
        const hayProcesamiento = (typeof traduccionAutomatica !== 'undefined' && traduccionAutomatica)
            || (typeof ttsHumanizerActivo !== 'undefined' && ttsHumanizerActivo);
        if (hayProcesamiento) {
            const row = document.getElementById('aplicar-row');
            const hint = document.getElementById('aplicar-hint');
            if (row) row.style.display = 'block';
            if (hint) hint.textContent = 'Nuevo capítulo — presiona Aplicar para procesar';
            _configPendiente = true;
        }
    }
    cargarCapitulo(e.target.value);
});