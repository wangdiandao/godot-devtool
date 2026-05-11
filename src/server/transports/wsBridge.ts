import { createServer, type Server as HttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type BridgeContext = 'editor' | 'runtime';

export interface BridgePortConflictDetails {
  code: 'EADDRINUSE';
  port: number;
  message: string;
  guidance: string[];
}

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
  acknowledgedAt: string | null;
  lastSeenAt: string;
  protocolVersion: number | null;
  sessionId: string | null;
}

class WebSocketBridge extends EventEmitter {
  private server: HttpServer | null = null;
  private clients = new Map<string, BridgeClient>();
  private pending = new Map<string, { clientId: string; resolve: (receipt: BridgeReceipt) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private authTokens = new Map<string, string>();
  private port = 8766;

  async start(port = 8766): Promise<void> {
    if (this.server) return;
    this.port = port;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.tryListen();
        return; // Success
      } catch (err) {
        const errorCode = (err as NodeJS.ErrnoException).code;
        if (errorCode === 'EADDRINUSE' && attempt < maxRetries) {
          console.error(`[WebSocket Bridge] Port ${this.port} is in use, retrying without killing external processes (${attempt + 1}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Failed to start WebSocket bridge on port ${this.port} after ${maxRetries} attempts.`);
  }

  private tryListen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer();
      this.server = server;
      server.on('upgrade', (request, socket) => {
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
      const onError = (error: NodeJS.ErrnoException) => {
        if (this.server === server) {
          this.server = null;
        }
        server.close(() => undefined);
        if (error.code === 'EADDRINUSE') {
          const bridgeError = new Error(bridgePortInUseDetails(this.port).message) as NodeJS.ErrnoException;
          bridgeError.code = 'EADDRINUSE';
          reject(bridgeError);
          return;
        }
        reject(error);
      };
      server.once('error', onError);
      server.listen({ port: this.port, host: '127.0.0.1', reuseAddress: true }, () => {
        server.off('error', onError);
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
        acknowledgedAt: client.acknowledgedAt,
        lastSeenAt: client.lastSeenAt,
        protocolVersion: client.protocolVersion,
      }));
    return {
      running: this.server?.listening === true,
      host: '127.0.0.1',
      port: this.port,
      clients,
      pendingCommands: this.pending.size,
    };
  }

  registerProjectAuth(projectPath: string, authToken: string): void {
    if (!authToken) {
      throw new Error('WebSocket bridge auth token must not be empty.');
    }
    this.authTokens.set(normalizeProjectPath(projectPath), authToken);
  }

  private resolveProjectAuthToken(projectPath: string): string | undefined {
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    const cachedToken = this.authTokens.get(normalizedProjectPath);
    if (cachedToken) return cachedToken;

    try {
      const configPath = join(projectPath, '.godot-devtool', 'bridge-config.json');
      if (!existsSync(configPath)) return undefined;
      const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { authToken?: unknown };
      const authToken = typeof parsed.authToken === 'string' ? parsed.authToken : '';
      if (!authToken) return undefined;
      this.authTokens.set(normalizedProjectPath, authToken);
      return authToken;
    } catch {
      return undefined;
    }
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
      this.pending.set(commandId, { clientId: client.id, resolve, reject, timer });
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
      acknowledgedAt: null,
      lastSeenAt: new Date().toISOString(),
      protocolVersion: null,
      sessionId: null,
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
      const now = new Date().toISOString();
      client.context = message.context === 'runtime' ? 'runtime' : 'editor';
      client.projectPath = String(message.projectPath ?? '');
      const expectedToken = this.resolveProjectAuthToken(client.projectPath);
      const receivedToken = typeof message.authToken === 'string' ? message.authToken : '';
      if (!expectedToken || receivedToken !== expectedToken) {
        this.sendFrame(client.socket, JSON.stringify({
          type: 'error',
          code: 'unauthorized',
          message: 'WebSocket bridge hello rejected.',
          serverTime: now,
        }));
        client.socket.destroy();
        return;
      }
      client.protocolVersion = Number.isFinite(Number(message.protocolVersion)) ? Number(message.protocolVersion) : null;
      client.sessionId = typeof message.sessionId === 'string' ? message.sessionId : null;
      client.acknowledgedAt = now;
      client.lastSeenAt = now;
      this.emit('client', client);
      this.sendFrame(client.socket, JSON.stringify({
        type: 'hello_ack',
        context: client.context,
        projectPath: client.projectPath,
        protocolVersion: client.protocolVersion,
        sessionId: client.sessionId,
        serverTime: now,
      }));
      return;
    }
    if (message.type === 'heartbeat') {
      const now = new Date().toISOString();
      client.lastSeenAt = now;
      this.sendFrame(client.socket, JSON.stringify({
        type: 'heartbeat_ack',
        context: client.context,
        sessionId: client.sessionId,
        serverTime: now,
      }));
      return;
    }
    if (message.type === 'receipt') {
      client.lastSeenAt = new Date().toISOString();
      const commandId = String(message.commandId ?? '');
      const pending = this.pending.get(commandId);
      if (!pending || pending.clientId !== client.id) return;
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
    let header: Buffer;
    if (data.length < 126) {
      header = Buffer.from([0x81, data.length]);
    } else if (data.length <= 0xffff) {
      header = Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    socket.write(Buffer.concat([header, data]));
  }
}

function normalizeProjectPath(value: string | null | undefined): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

const bridge = new WebSocketBridge();

export function isBridgePortInUseError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EADDRINUSE';
}

export function bridgePortInUseDetails(port: number): BridgePortConflictDetails {
  return {
    code: 'EADDRINUSE',
    port,
    message: `WebSocket bridge port ${port} is already in use. Another godot-devtool MCP process may already be serving the open Godot editor; this MCP process cannot command editor clients connected to that other listener. Reuse the same MCP session for live editor tools, or inspect the listener with plugin_cleanup_port before changing ports.`,
    guidance: [
      `Call plugin_cleanup_port { "port": ${port} } to inspect the listener before stopping anything.`,
      'If the listener is the active godot-devtool MCP process, keep using that same MCP session for the current Godot editor.',
      'Only stop a verified stale listener with plugin_cleanup_port kill=true and an exact pid.',
      'Only use a different port for an isolated session after setting both GODOT_DEVTOOL_WS_PORT and plugin_install websocketPort to that same port.',
    ],
  };
}

export function getWsBridge(): WebSocketBridge {
  return bridge;
}
