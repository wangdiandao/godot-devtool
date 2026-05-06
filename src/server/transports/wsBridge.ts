import { createServer, type Server as HttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

type BridgeContext = 'editor' | 'runtime';

export interface BridgeReceipt {
  commandId: string;
  type: string;
  status: 'completed' | 'failed' | 'expired';
  startedAt?: string;
  finishedAt: string;
  error?: string;
  result?: unknown;
}

interface BridgeClient {
  id: string;
  projectPath: string | null;
  context: BridgeContext | null;
  socket: import('node:net').Socket;
  connectedAt: string;
}

class WebSocketBridge extends EventEmitter {
  private server: HttpServer | null = null;
  private clients = new Map<string, BridgeClient>();
  private pending = new Map<string, { resolve: (receipt: BridgeReceipt) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private port = 8766;

  async start(port = 8766): Promise<void> {
    if (this.server) return;
    this.port = port;
    this.server = createServer();
    this.server.on('upgrade', (request, socket) => {
      const key = request.headers['sec-websocket-key'];
      if (typeof key !== 'string') {
        socket.destroy();
        return;
      }
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'));
      this.registerSocket(socket as import('node:net').Socket);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '127.0.0.1', () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) client.socket.destroy();
    this.clients.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('WebSocket bridge stopped before command completed.'));
    }
    this.pending.clear();
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  status(projectPath?: string) {
    const clients = [...this.clients.values()]
      .filter((client) => !projectPath || normalizeProjectPath(client.projectPath) === normalizeProjectPath(projectPath))
      .map((client) => ({
        id: client.id,
        context: client.context,
        projectPath: client.projectPath,
        connectedAt: client.connectedAt,
      }));
    return {
      running: Boolean(this.server),
      host: '127.0.0.1',
      port: this.port,
      clients,
      pendingCommands: this.pending.size,
    };
  }

  async sendCommand(projectPath: string, context: BridgeContext, command: string, payload: Record<string, unknown>, timeoutMs = 10000): Promise<BridgeReceipt> {
    await this.start(this.port);
    const client = [...this.clients.values()].find((candidate) => (
      candidate.context === context &&
      normalizeProjectPath(candidate.projectPath) === normalizeProjectPath(projectPath)
    ));
    if (!client) {
      throw new Error(`No active ${context} WebSocket bridge is connected for ${projectPath}. Enable the godot-devtool plugin or start the project runtime.`);
    }
    const commandId = randomUUID();
    const receiptPromise = new Promise<BridgeReceipt>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error(`Timed out waiting for ${context} WebSocket command ${command}.`));
      }, timeoutMs);
      this.pending.set(commandId, { resolve, reject, timer });
    });
    this.sendFrame(client.socket, JSON.stringify({
      type: 'command',
      commandId,
      command,
      payload,
      timeoutMs,
    }));
    return receiptPromise;
  }

  private registerSocket(socket: import('node:net').Socket): void {
    const client: BridgeClient = {
      id: randomUUID(),
      projectPath: null,
      context: null,
      socket,
      connectedAt: new Date().toISOString(),
    };
    this.clients.set(client.id, client);
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const frame = this.decodeFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.bytesRead);
        this.handleMessage(client, frame.payload);
      }
    });
    socket.on('close', () => this.clients.delete(client.id));
    socket.on('error', () => this.clients.delete(client.id));
  }

  private handleMessage(client: BridgeClient, payload: string): void {
    let message: any;
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    if (message.type === 'hello') {
      client.context = message.context === 'runtime' ? 'runtime' : 'editor';
      client.projectPath = String(message.projectPath ?? '');
      this.emit('client', client);
      return;
    }
    if (message.type === 'receipt') {
      const commandId = String(message.commandId ?? '');
      const pending = this.pending.get(commandId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(commandId);
      pending.resolve({
        commandId,
        type: String(message.command ?? message.route ?? 'websocket'),
        status: message.status === 'completed' ? 'completed' : 'failed',
        finishedAt: new Date().toISOString(),
        error: message.error ? String(message.error) : '',
        result: message.result,
      });
    }
  }

  private decodeFrame(buffer: Buffer): { payload: string; bytesRead: number } | null {
    const first = buffer[0];
    const second = buffer[1];
    const opcode = first & 0x0f;
    if (opcode === 0x8) return { payload: '', bytesRead: buffer.length };
    let offset = 2;
    let length = second & 0x7f;
    if (length === 126) {
      if (buffer.length < offset + 2) return null;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) return null;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const masked = Boolean(second & 0x80);
    let mask: Buffer | null = null;
    if (masked) {
      if (buffer.length < offset + 4) return null;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length < offset + length) return null;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }
    return { payload: payload.toString('utf8'), bytesRead: offset + length };
  }

  private sendFrame(socket: import('node:net').Socket, payload: string): void {
    const data = Buffer.from(payload, 'utf8');
    const header = data.length < 126
      ? Buffer.from([0x81, data.length])
      : Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]);
    socket.write(Buffer.concat([header, data]));
  }
}

function normalizeProjectPath(value: string | null | undefined): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

const bridge = new WebSocketBridge();

export function getWsBridge(): WebSocketBridge {
  return bridge;
}
