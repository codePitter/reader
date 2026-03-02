// ═══════════════════════════════════════════════════════════════
// XTTS-STATUS — Indicador de estado del servidor TTS local
//
// Verifica periódicamente si el servidor edge-tts está corriendo.
// Puerto configurable desde uStorage o argumento manual.
//
// API pública:
//   xttsEstaActivo()          → true/false
//   xttsPingAhora()           → reverifica de inmediato
//   xttsSetPort(port)         → cambiar puerto en caliente (persiste en uStorage)
//   xttsGetPort()             → puerto activo
//   xttsGetURL()              → URL base del servidor
//
// Evento emitido: 'xtts:status'  → { detail: { activo, port } }
//
// No depende de auth.js ni biblioteca.js.
// Debe cargarse DESPUÉS de ustorage.js.
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────
    const PORT_DEFAULT = 5000;
    const PORT_KEY = 'tts_server_port';   // clave en uStorage
    const HEALTH_PATH = '/health';
    const POLL_MS_OK = 15_000;
    const POLL_MS_FAIL = 8_000;
    const FETCH_TIMEOUT = 3_000;

    // URLs de descarga — reemplazar cuando existan builds reales
    const DOWNLOADS = {
        windows: { label: 'Windows (.exe)', url: '#tts-download-windows', icon: '🪟' },
        mac: { label: 'macOS (.dmg)', url: '#tts-download-mac', icon: '🍎' },
        linux: { label: 'Linux (.AppImage)', url: '#tts-download-linux', icon: '🐧' },
    };

    // ─── ESTADO ──────────────────────────────────────────────────
    let _activo = false;
    let _timer = null;
    let _panelVisible = false;
    let _port = _leerPuerto();

    function _leerPuerto() {
        const guardado = typeof uGet === 'function' ? parseInt(uGet(PORT_KEY)) : NaN;
        return isNaN(guardado) ? PORT_DEFAULT : guardado;
    }

    function _serverURL() {
        return `http://localhost:${_port}`;
    }

    // ─── INIT ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        _inyectarHTML();
        _inyectarEstilos();
        _verificar();
    });

    // ─── VERIFICACIÓN ────────────────────────────────────────────

    async function _verificar() {
        clearTimeout(_timer);
        const ok = await _pingServidor();
        if (ok !== _activo) {
            _activo = ok;
            _actualizarUI();
        }
        _timer = setTimeout(_verificar, _activo ? POLL_MS_OK : POLL_MS_FAIL);
    }

    async function _pingServidor() {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
            const resp = await fetch(_serverURL() + HEALTH_PATH, {
                method: 'GET',
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(t);
            return resp.ok;
        } catch {
            return false;
        }
    }

    // ─── UI ──────────────────────────────────────────────────────

    function _actualizarUI() {
        const dot = document.getElementById('xtts-dot');
        const btn = document.getElementById('xtts-status-btn');
        if (!dot) return;

        dot.className = `xtts-dot xtts-dot--${_activo ? 'on' : 'off'}`;
        btn.title = _activo
            ? `Servidor TTS activo en localhost:${_port}`
            : `Servidor TTS no detectado en localhost:${_port} — clic para instalar`;

        const ok = document.getElementById('xtts-panel-ok');
        const off = document.getElementById('xtts-panel-off');
        if (ok) ok.style.display = _activo ? 'flex' : 'none';
        if (off) off.style.display = _activo ? 'none' : 'block';

        // Actualizar todas las referencias al puerto en el panel
        document.querySelectorAll('.xtts-port-display').forEach(el => {
            el.textContent = `localhost:${_port}`;
        });
        const cmd = document.querySelector('.xtts-cmd');
        if (cmd) cmd.textContent = `python tts_api_server.py --port ${_port}`;

        document.dispatchEvent(new CustomEvent('xtts:status', {
            detail: { activo: _activo, port: _port }
        }));
    }

    function _togglePanel(forzar) {
        _panelVisible = forzar !== undefined ? forzar : !_panelVisible;
        const panel = document.getElementById('xtts-panel');
        if (!panel) return;
        if (_panelVisible) {
            panel.removeAttribute('hidden');
            requestAnimationFrame(() => panel.classList.add('xtts-panel--visible'));
        } else {
            panel.classList.remove('xtts-panel--visible');
            setTimeout(() => panel.setAttribute('hidden', ''), 220);
        }
    }

    document.addEventListener('click', e => {
        if (!_panelVisible) return;
        const wrap = document.getElementById('xtts-status-wrap');
        if (wrap && !wrap.contains(e.target)) _togglePanel(false);
    });

    // ─── CAMBIO DE PUERTO ────────────────────────────────────────

    function _aplicarPuerto(port) {
        const p = parseInt(port);
        if (isNaN(p) || p < 1 || p > 65535) return false;
        _port = p;
        if (typeof uSet === 'function') uSet(PORT_KEY, String(p));
        clearTimeout(_timer);
        _actualizarUI();
        _verificar();
        return true;
    }

    function _onPortInputChange(input) {
        const ok = _aplicarPuerto(input.value);
        input.style.borderColor = ok ? '' : '#ff8a65';
        if (ok && typeof mostrarNotificacion === 'function')
            mostrarNotificacion(`Puerto TTS actualizado: ${_port}`);
    }

    // ─── INYECCIÓN HTML ──────────────────────────────────────────

    function _inyectarHTML() {
        const ancla = document.getElementById('btn-tts-servidor-live')
            || document.querySelector('.tts-control-bar');
        if (!ancla) return;

        const wrap = document.createElement('div');
        wrap.id = 'xtts-status-wrap';
        wrap.className = 'xtts-status-wrap';
        wrap.innerHTML = `
            <button id="xtts-status-btn"
                    class="xtts-status-btn"
                    onclick="window._xttsTogglePanel()"
                    title="Verificando servidor TTS…">
                <span id="xtts-dot" class="xtts-dot xtts-dot--off"></span>
                <span class="xtts-label">TTS</span>
            </button>

            <div id="xtts-panel" class="xtts-panel" hidden>

                <div class="xtts-panel-header">
                    <span class="xtts-panel-title">Servidor TTS local</span>
                    <button class="xtts-panel-close" onclick="window._xttsTogglePanel()">✕</button>
                </div>

                <!-- Puerto configurable -->
                <div class="xtts-port-row">
                    <span class="xtts-port-lbl">Puerto</span>
                    <input id="xtts-port-input"
                           class="xtts-port-input"
                           type="number" min="1" max="65535"
                           value="${_port}"
                           title="Puerto del servidor TTS (por defecto: 5000)">
                    <button class="xtts-port-apply"
                            onclick="window._xttsOnPortChange(document.getElementById('xtts-port-input'))">
                        ↵ Aplicar
                    </button>
                </div>

                <!-- Estado activo -->
                <div id="xtts-panel-ok" class="xtts-panel-ok" style="display:none;">
                    <div class="xtts-panel-ok-icon">✓</div>
                    <div class="xtts-panel-ok-text">
                        Servidor activo en
                        <code class="xtts-port-display">localhost:${_port}</code><br>
                        <span class="xtts-panel-ok-sub">edge-tts · Microsoft Neural TTS</span>
                    </div>
                </div>

                <!-- Estado inactivo + descargas -->
                <div id="xtts-panel-off" class="xtts-panel-off">
                    <div class="xtts-panel-off-msg">
                        ⚠ No se detectó el servidor en
                        <code class="xtts-port-display">localhost:${_port}</code>
                    </div>
                    <div class="xtts-panel-off-sub">
                        Iniciá el servidor manualmente con:
                        <code class="xtts-cmd">python tts_api_server.py --port ${_port}</code>
                        O descargá el instalador para que arranque automáticamente.
                    </div>
                    <div class="xtts-downloads">
                        ${Object.values(DOWNLOADS).map(d => `
                        <a class="xtts-dl-btn" href="${d.url}" download>
                            <span class="xtts-dl-icon">${d.icon}</span>
                            <span>${d.label}</span>
                        </a>`).join('')}
                    </div>
                    <div class="xtts-panel-retry">
                        <button class="xtts-retry-btn" onclick="window._xttsReverificar()">
                            ↻ Verificar de nuevo
                        </button>
                    </div>
                </div>

            </div>
        `;

        ancla.insertAdjacentElement('afterend', wrap);
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────

    window._xttsTogglePanel = () => _togglePanel();
    window._xttsOnPortChange = (input) => _onPortInputChange(input);
    window._xttsReverificar = () => {
        _verificar();
        if (typeof mostrarNotificacion === 'function')
            mostrarNotificacion('↻ Verificando servidor TTS…');
    };

    window.xttsEstaActivo = () => _activo;
    window.xttsGetPort = () => _port;
    window.xttsGetURL = () => _serverURL();
    window.xttsPingAhora = _verificar;
    window.xttsSetPort = (port) => {
        const input = document.getElementById('xtts-port-input');
        if (input) input.value = port;
        return _aplicarPuerto(port);
    };

    // ─── ESTILOS ─────────────────────────────────────────────────

    function _inyectarEstilos() {
        const style = document.createElement('style');
        style.textContent = `

.xtts-status-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
}
.xtts-status-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--surface2, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-dim, #888);
    font-family: 'DM Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 4px 8px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    user-select: none;
    white-space: nowrap;
}
.xtts-status-btn:hover {
    border-color: var(--accent, #c8a96e);
    color: var(--text, #ddd);
}
.xtts-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.4s, box-shadow 0.4s;
}
.xtts-dot--on {
    background: #4caf50;
    box-shadow: 0 0 6px rgba(76,175,80,0.7);
    animation: xttsPulse 2.5s ease-in-out infinite;
}
.xtts-dot--off { background: #555; box-shadow: none; }
@keyframes xttsPulse {
    0%,100% { box-shadow: 0 0 4px rgba(76,175,80,0.5); }
    50%     { box-shadow: 0 0 10px rgba(76,175,80,0.9); }
}
.xtts-label { font-size: 0.55rem; }

.xtts-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 295px;
    background: var(--surface, #161616);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.7);
    z-index: 9999;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    overflow: hidden;
}
.xtts-panel--visible { opacity: 1; transform: translateY(0); }

.xtts-panel-header {
    display: flex;
    align-items: center;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--border, #333);
}
.xtts-panel-title {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim, #888);
}
.xtts-panel-close {
    background: none; border: none;
    color: var(--text-dim, #888);
    font-size: 0.65rem; cursor: pointer;
    padding: 0 2px; line-height: 1;
    transition: color 0.15s;
}
.xtts-panel-close:hover { color: var(--accent, #c8a96e); }

.xtts-port-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border, #333);
    background: var(--surface2, #1e1e1e);
}
.xtts-port-lbl {
    font-family: 'DM Mono', monospace;
    font-size: 0.52rem;
    color: var(--text-dim, #888);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex-shrink: 0;
}
.xtts-port-input {
    flex: 1;
    background: var(--bg, #111);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text, #ddd);
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem;
    padding: 4px 8px;
    outline: none;
    transition: border-color 0.2s;
    -moz-appearance: textfield;
}
.xtts-port-input::-webkit-inner-spin-button,
.xtts-port-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.xtts-port-input:focus { border-color: var(--accent, #c8a96e); }
.xtts-port-apply {
    background: none;
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-dim, #888);
    font-family: 'DM Mono', monospace;
    font-size: 0.52rem;
    padding: 3px 8px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.15s, color 0.15s;
}
.xtts-port-apply:hover { border-color: var(--accent2, #7eb89a); color: var(--accent2, #7eb89a); }

.xtts-panel-ok {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
}
.xtts-panel-ok-icon {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: rgba(76,175,80,0.15);
    border: 1px solid rgba(76,175,80,0.3);
    color: #4caf50;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.xtts-panel-ok-text {
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    color: var(--text, #ddd);
    line-height: 1.6;
}
.xtts-panel-ok-text code { color: #4caf50; font-size: 0.55rem; }
.xtts-panel-ok-sub { color: var(--text-dim, #888); font-size: 0.52rem; }

.xtts-panel-off { padding: 12px 16px 14px; }
.xtts-panel-off-msg {
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    color: #ff8a65;
    line-height: 1.5;
    margin-bottom: 6px;
}
.xtts-panel-off-msg code { color: #ff8a65; font-size: 0.55rem; }
.xtts-panel-off-sub {
    font-family: 'DM Mono', monospace;
    font-size: 0.53rem;
    color: var(--text-dim, #888);
    line-height: 1.8;
    margin-bottom: 12px;
}
.xtts-cmd {
    display: block;
    background: var(--bg, #111);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 4px 8px;
    margin: 4px 0 8px;
    font-size: 0.52rem;
    color: var(--accent2, #7eb89a);
    white-space: nowrap;
    overflow-x: auto;
    user-select: all;
    cursor: text;
}
.xtts-downloads {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 10px;
}
.xtts-dl-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface2, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    padding: 7px 10px;
    text-decoration: none;
    color: var(--text-dim, #888);
    font-family: 'DM Mono', monospace;
    font-size: 0.57rem;
    transition: border-color 0.2s, color 0.2s;
}
.xtts-dl-btn:hover {
    border-color: var(--accent, #c8a96e);
    color: var(--accent, #c8a96e);
}
.xtts-dl-icon { font-size: 0.85rem; flex-shrink: 0; }
.xtts-panel-retry { display: flex; justify-content: flex-end; }
.xtts-retry-btn {
    background: none;
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-dim, #888);
    font-family: 'DM Mono', monospace;
    font-size: 0.53rem;
    padding: 4px 10px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
}
.xtts-retry-btn:hover {
    border-color: var(--accent2, #7eb89a);
    color: var(--accent2, #7eb89a);
}

@media (max-height: 500px) {
    .xtts-panel { bottom: auto; top: calc(100% + 8px); }
}
        `;
        document.head.appendChild(style);
    }

})();