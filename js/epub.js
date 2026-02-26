// ═══════════════════════════════════════
// EPUB — Carga, parsing y navegación de capítulos
// Depende de: main.js (archivosHTML, detenerTTS, cargarCapitulo)
//             translation.js (traduccionAutomatica, ttsHumanizerActivo, _capCache, etc.)
// ═══════════════════════════════════════

// ======================
// CARGA DE ARCHIVOS EPUB
// ======================

// Cargar archivo EPUB
document.getElementById('epub-file').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.epub')) {
        mostrarNotificacion('⚠ Selecciona un archivo EPUB válido');
        return;
    }

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
            // Re-aplicar reemplazos al cargar desde cache: pueden haber cambiado desde que se cacheó
            textoCompleto = aplicarReemplazosAutomaticos(entrada.texto);
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

            // ─── Barra de progreso unificada: 3 fases ───
            // Fase 1 (0-60%): Traducción párrafo a párrafo
            // Fase 2 (60-75%): Revisión
            // Fase 3 (75-100%): Optimización IA
            const _mostrarBarraFase = (fase, pctFase, label) => {
                if (_traduccionEnBackground) return;
                let pctGlobal;
                if (fase === 1) pctGlobal = Math.round(pctFase * 0.60);          // 0-60%
                else if (fase === 2) pctGlobal = Math.round(60 + pctFase * 0.15); // 60-75%
                else pctGlobal = Math.round(75 + pctFase * 0.25);                 // 75-100%

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
                if (mpbF3) mpbF3.style.color = fase === 3 ? 'var(--accent2)' : 'var(--text-dim)';

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
                if (kF3) kF3.style.color = fase === 3 ? 'var(--accent2)' : 'var(--text-dim)';
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

            // Completar barra y ocultarla
            _mostrarBarraFase(3, 100, '✓ Listo');
            setTimeout(() => {
                // Ocultar barra del video
                const kWrap = document.getElementById('video-translation-progress');
                if (kWrap) kWrap.style.display = 'none';
                // Ocultar barra del main
                const mpbWrap = document.getElementById('main-processing-bar');
                if (mpbWrap) mpbWrap.style.display = 'none';
                // Restaurar ambient player
                const ambPlayerEl = document.getElementById('ambient-player');
                if (ambPlayerEl && typeof ambientPlaying !== 'undefined') {
                    ambPlayerEl.style.opacity = '';
                    ambPlayerEl.style.pointerEvents = '';
                }
                // Resetear progress-fill antiguo
                const fill = document.getElementById('progress-fill');
                const pctEl = document.getElementById('tts-percent');
                if (fill) setTimeout(() => { fill.style.width = '0%'; }, 400);
                if (pctEl) setTimeout(() => { pctEl.style.display = 'none'; }, 400);
            }, 800);

            textoCompleto = aplicarReemplazosAutomaticos(textoCompleto);
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

        // ── Pre-procesar el siguiente capítulo en background ──
        // Capturar el token actual: si el usuario navega antes de los 5s, el callback no hará nada
        _limpiarCache(ruta);
        const siguiente = _getSiguienteRuta(ruta);
        if (siguiente) {
            const tokenAlProgramar = _bgCancelToken;
            setTimeout(() => {
                // Solo arrancar el BG si el usuario no navegó desde que programamos esto
                if (_bgCancelToken === tokenAlProgramar) {
                    _preTradducirCapitulo(siguiente);
                }
            }, 5000);
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