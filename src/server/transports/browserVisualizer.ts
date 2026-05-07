import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';

import { getWsBridge } from './wsBridge.js';

export interface BrowserVisualizerStartOptions {
  port?: number;
  projectPath?: string;
}

class BrowserVisualizer {
  private server: HttpServer | null = null;
  private host = '127.0.0.1';
  private port = 8767;
  private startedAt: string | null = null;
  private projectPath: string | null = null;

  async start(options: BrowserVisualizerStartOptions = {}) {
    this.projectPath = typeof options.projectPath === 'string' && options.projectPath.trim()
      ? options.projectPath.trim()
      : this.projectPath;

    if (this.server) return this.status();

    const requestedPort = Number.isFinite(Number(options.port)) ? Number(options.port) : this.port;
    this.server = createServer((request, response) => {
      this.handleRequest(request.url || '/', response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(requestedPort, this.host, () => {
        this.server!.off('error', reject);
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        this.startedAt = new Date().toISOString();
        resolve();
      });
    });

    return this.status();
  }

  async stop() {
    if (!this.server) return this.status(false);
    const closing = this.server;
    this.server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
    this.startedAt = null;
    return this.status(false);
  }

  status(running = Boolean(this.server)) {
    return {
      running,
      host: this.host,
      port: this.port,
      url: running ? `http://${this.host}:${this.port}/` : null,
      startedAt: this.startedAt,
      projectPath: this.projectPath,
      bridge: getWsBridge().status(this.projectPath || undefined),
      refreshIntervalMs: 1000,
    };
  }

  private handleRequest(path: string, response: import('node:http').ServerResponse): void {
    const url = new URL(path, `http://${this.host}:${this.port}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(renderVisualizerHtml());
      return;
    }

    if (url.pathname === '/api/status' || url.pathname === '/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify(this.status(), null, 2));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  }
}

function renderVisualizerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>godot-devtool Browser Visualizer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #d9dee7;
      --accent: #0f766e;
      --warn: #b45309;
      --bad: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 650;
      letter-spacing: 0;
    }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 380px) 1fr;
      gap: 16px;
      padding: 16px 24px 28px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: 0;
    }
    dl {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 12px;
      margin: 0;
    }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #e8f5f3;
      color: var(--accent);
      font-weight: 650;
    }
    .warn { background: #fff4e5; color: var(--warn); }
    .bad { background: #fdecec; color: var(--bad); }
    .stack {
      display: grid;
      gap: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 9px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    code {
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 12px;
      background: #eef1f5;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .tools {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .tool {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      min-height: 86px;
    }
    .tool strong { display: block; margin-bottom: 6px; }
    .muted { color: var(--muted); }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; padding: 12px; }
      header { padding: 14px 12px; align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <h1>godot-devtool Browser Visualizer</h1>
    <span id="status-pill" class="pill warn">Loading</span>
  </header>
  <main>
    <div class="stack">
      <section>
        <h2>Bridge Status</h2>
        <dl id="bridge-status"></dl>
      </section>
      <section>
        <h2>Live Routes</h2>
        <div class="tools">
          <div class="tool"><strong>Runtime Screenshots</strong><code>get_game_screenshot</code><br><code>capture_frames</code></div>
          <div class="tool"><strong>Runtime Inspection</strong><code>get_game_scene_tree</code><br><code>get_game_node_properties</code></div>
          <div class="tool"><strong>Input And UI</strong><code>simulate_action</code><br><code>find_ui_elements</code></div>
          <div class="tool"><strong>Editor State</strong><code>editor_get_selection</code><br><code>get_editor_screenshot</code></div>
        </div>
      </section>
    </div>
    <section>
      <h2>Connected Clients</h2>
      <table>
        <thead>
          <tr><th>Context</th><th>Project</th><th>Session</th><th>Last Seen</th></tr>
        </thead>
        <tbody id="clients"></tbody>
      </table>
    </section>
  </main>
  <script>
    const statusPill = document.getElementById('status-pill');
    const bridgeStatus = document.getElementById('bridge-status');
    const clientsTable = document.getElementById('clients');

    function row(label, value) {
      return '<dt>' + label + '</dt><dd>' + value + '</dd>';
    }

    function text(value) {
      return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    }

    async function refresh() {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        const payload = await response.json();
        const bridge = payload.bridge || {};
        const clientCount = Array.isArray(bridge.clients) ? bridge.clients.length : 0;
        statusPill.textContent = clientCount > 0 ? 'Connected' : 'Waiting for bridge clients';
        statusPill.className = clientCount > 0 ? 'pill' : 'pill warn';
        bridgeStatus.innerHTML = [
          row('Visualizer URL', text(payload.url)),
          row('Project Filter', text(payload.projectPath || 'All projects')),
          row('WebSocket', text((bridge.running ? 'running' : 'stopped') + ' at ' + bridge.host + ':' + bridge.port)),
          row('Clients', text(clientCount)),
          row('Pending', text(bridge.pendingCommands || 0)),
          row('Started', text(payload.startedAt || 'not running'))
        ].join('');
        clientsTable.innerHTML = clientCount
          ? bridge.clients.map(client => '<tr><td>' + text(client.context) + '</td><td>' + text(client.projectPath) + '</td><td>' + text(client.sessionId || client.id) + '</td><td>' + text(client.lastSeenAt) + '</td></tr>').join('')
          : '<tr><td colspan="4" class="muted">No Godot editor or runtime bridge is connected yet.</td></tr>';
      } catch (error) {
        statusPill.textContent = 'Status unavailable';
        statusPill.className = 'pill bad';
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

const visualizer = new BrowserVisualizer();

export function getBrowserVisualizer(): BrowserVisualizer {
  return visualizer;
}
