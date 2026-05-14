import { createServer, type Server as HttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BrokerClientRegistry, normalizeProjectPath } from '../broker/brokerClientRegistry.js';
import { BrokerCommandRouter } from '../broker/brokerCommandRouter.js';
import { BrokerLeaseRegistry } from '../broker/brokerLeases.js';
import { sendRemoteBrokerMessage } from '../broker/brokerServer.js';
import {
  type BridgeClient,
  type BridgeCommandTarget,
  type BridgeContext,
  type BridgePortConflictDetails,
  type BridgeReceipt,
} from '../broker/types.js';
import { BridgeTargetAmbiguityError, bridgeTargetAmbiguityPayload } from '../targets/ambiguity.js';
import { resolveBridgeTarget } from '../targets/targetResolver.js';

export type { BridgePortConflictDetails, BridgeReceipt };

const DEFAULT_RECONNECT_WAIT_MS = 1500;

class WebSocketBridge extends EventEmitter {
  private server: HttpServer | null = null;
  private clients = new BrokerClientRegistry();
  private commandRouter = new BrokerCommandRouter();
  private leases = new BrokerLeaseRegistry();
  private authTokens = new Map<string, string>();
  private port = 8766;
  private brokerId = randomUUID();

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
    this.commandRouter.clear();
    this.leases.clear();
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  status(projectPath?: string) {
    return {
      brokerId: this.brokerId,
      running: this.server?.listening === true,
      host: '127.0.0.1',
      port: this.port,
      clients: this.clients.snapshots(projectPath),
      pendingCommands: this.commandRouter.size,
      pendingCommandDetails: this.commandRouter.snapshot(),
      pendingCommandCount: this.commandRouter.size,
      leases: this.leases.snapshot(),
    };
  }

  async remoteStatus(port: number, projectPath?: string) {
    const response = await sendRemoteBrokerMessage(port, {
      type: 'frontend_status',
      projectPath,
    }, 2000);
    if (response?.type !== 'frontend_status_ack' || !response.status) {
      throw new Error(`Port ${port} is occupied, but the listener did not respond as a godot-devtool broker.`);
    }
    return response.status;
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

  async sendCommand(
    projectPath: string,
    context: BridgeContext,
    command: string,
    payload: Record<string, unknown>,
    timeoutMs = 10000,
    target: BridgeCommandTarget = targetFromPayload(payload)
  ): Promise<BridgeReceipt> {
    try {
      await this.start(this.port);
    } catch (error) {
      if (!isBridgePortInUseError(error)) throw error;
      return this.sendCommandViaRemoteBroker(projectPath, context, command, payload, timeoutMs, target);
    }
    const client = await this.waitForClient(projectPath, context, timeoutMs, target);
    if (!client) {
      throw new Error(`No active ${context} WebSocket bridge is connected for ${projectPath}. Enable the godot-devtool plugin or start the project runtime.`);
    }
    const pendingLease = this.leases.acquire('pending_command', `${client.id}:${randomUUID()}`, timeoutMs + 1000);
    try {
      return await this.commandRouter.send(client, this.sendFrame.bind(this), command, payload, timeoutMs);
    } finally {
      this.leases.release(pendingLease.id);
    }
  }

  private async sendCommandViaRemoteBroker(
    projectPath: string,
    context: BridgeContext,
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    target: BridgeCommandTarget
  ): Promise<BridgeReceipt> {
    const response = await sendRemoteBrokerMessage(this.port, {
      type: 'frontend_command',
      projectPath,
      context,
      command,
      payload,
      timeoutMs,
      target,
      authToken: this.resolveProjectAuthToken(projectPath),
    }, timeoutMs);
    if (response?.type !== 'frontend_receipt' || !response.receipt) {
      if (response?.type === 'frontend_error' && response.error) {
        throwRemoteBrokerError(response.error);
      }
      throw new Error(`Port ${this.port} is occupied, but the listener did not respond as a godot-devtool broker.`);
    }
    return response.receipt as BridgeReceipt;
  }

  private findClient(projectPath: string, context: BridgeContext, target: BridgeCommandTarget = {}): BridgeClient | null {
    return resolveBridgeTarget(this.clients, projectPath, context, target);
  }

  private async waitForClient(projectPath: string, context: BridgeContext, timeoutMs: number, target: BridgeCommandTarget): Promise<BridgeClient | null> {
    const existing = this.findClient(projectPath, context, target);
    if (existing) return existing;

    const reconnectWaitMs = Math.min(
      timeoutMs,
      Number(process.env.GODOT_DEVTOOL_WS_RECONNECT_WAIT_MS ?? DEFAULT_RECONNECT_WAIT_MS)
    );
    if (!Number.isFinite(reconnectWaitMs) || reconnectWaitMs <= 0) return null;

    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;
      const finish = (client: BridgeClient | null) => {
        clearTimeout(timer);
        this.off('client', onClient);
        resolve(client);
      };
      const onClient = (client: BridgeClient) => {
        if (
          client.context === context &&
          normalizeProjectPath(client.projectPath) === normalizeProjectPath(projectPath) &&
          (!target.sessionId || client.sessionId === target.sessionId) &&
          (!target.runId || client.runId === target.runId)
        ) {
          finish(this.findClient(projectPath, context, target));
        }
      };
      timer = setTimeout(() => finish(null), reconnectWaitMs);
      this.on('client', onClient);
      const lateExisting = this.findClient(projectPath, context, target);
      if (lateExisting) finish(lateExisting);
    });
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
      runId: null,
    };
    this.clients.add(client);
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
    socket.on('close', () => this.unregisterClient(client.id));
    socket.on('error', () => this.unregisterClient(client.id));
  }

  private unregisterClient(clientId: string): void {
    this.clients.remove(clientId);
    this.leases.releaseByOwner(clientId);
  }

  private handleMessage(client: BridgeClient, payload: string): void {
    let message: any;
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    if (message.type === 'frontend_status') {
      this.leases.acquire('frontend', client.id, 5000);
      this.sendFrame(client.socket, JSON.stringify({
        type: 'frontend_status_ack',
        status: this.status(typeof message.projectPath === 'string' ? message.projectPath : undefined),
      }));
      return;
    }
    if (message.type === 'frontend_command') {
      this.handleFrontendCommand(client, message);
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
      client.runId = typeof message.runId === 'string' ? message.runId : null;
      client.acknowledgedAt = now;
      client.lastSeenAt = now;
      this.leases.acquire(client.context, client.id);
      this.emit('client', client);
      this.sendFrame(client.socket, JSON.stringify({
        type: 'hello_ack',
        brokerId: this.brokerId,
        context: client.context,
        projectPath: client.projectPath,
        protocolVersion: client.protocolVersion,
        sessionId: client.sessionId,
        runId: client.runId,
        serverTime: now,
      }));
      return;
    }
    if (message.type === 'heartbeat') {
      const now = new Date().toISOString();
      client.lastSeenAt = now;
      this.sendFrame(client.socket, JSON.stringify({
        type: 'heartbeat_ack',
        brokerId: this.brokerId,
        context: client.context,
        sessionId: client.sessionId,
        runId: client.runId,
        serverTime: now,
      }));
      return;
    }
    if (message.type === 'receipt') {
      client.lastSeenAt = new Date().toISOString();
      this.commandRouter.resolveReceipt(client, message);
    }
  }

  private async handleFrontendCommand(client: BridgeClient, message: any): Promise<void> {
    this.leases.acquire('frontend', client.id, Math.max(5000, Number(message.timeoutMs ?? 10000) + 1000));
    try {
      const projectPath = String(message.projectPath ?? '');
      const expectedToken = this.resolveProjectAuthToken(projectPath);
      const receivedToken = typeof message.authToken === 'string' ? message.authToken : '';
      if (!expectedToken || receivedToken !== expectedToken) {
        this.sendFrame(client.socket, JSON.stringify({
          type: 'frontend_error',
          commandId: String(message.commandId ?? ''),
          error: {
            ok: false,
            code: 'unauthorized_frontend_command',
            error: 'Frontend broker command rejected.',
            guidance: ['Use the project bridge auth token from .godot-devtool/bridge-config.json when forwarding commands to a shared broker.'],
          },
        }));
        return;
      }
      const receipt = await this.sendCommand(
        projectPath,
        message.context === 'runtime' ? 'runtime' : 'editor',
        String(message.command ?? ''),
        isRecord(message.payload) ? message.payload : {},
        Number(message.timeoutMs ?? 10000),
        isRecord(message.target) ? message.target : {}
      );
      this.sendFrame(client.socket, JSON.stringify({ type: 'frontend_receipt', receipt }));
    } catch (error: any) {
      if (error instanceof BridgeTargetAmbiguityError) {
        this.sendFrame(client.socket, JSON.stringify({
          type: 'frontend_error',
          commandId: String(message.commandId ?? ''),
          error: bridgeTargetAmbiguityPayload(error),
        }));
        return;
      }
      this.sendFrame(client.socket, JSON.stringify({
        type: 'frontend_receipt',
        receipt: {
          commandId: String(message.commandId ?? ''),
          type: String(message.command ?? 'frontend_command'),
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: error?.message || String(error),
          result: {},
        },
      }));
    } finally {
      this.leases.release(`frontend:${client.id}`);
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

function targetFromPayload(payload: Record<string, unknown>): BridgeCommandTarget {
  return {
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    runId: typeof payload.runId === 'string' ? payload.runId : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwRemoteBrokerError(errorPayload: unknown): never {
  if (isRecord(errorPayload) && errorPayload.code === 'bridge_target_ambiguous') {
    const context = errorPayload.context === 'runtime' ? 'runtime' : 'editor';
    const candidates = Array.isArray(errorPayload.candidates) ? errorPayload.candidates : [];
    throw new BridgeTargetAmbiguityError(context, candidates as any);
  }
  if (isRecord(errorPayload) && typeof errorPayload.error === 'string') {
    throw new Error(errorPayload.error);
  }
  throw new Error('Remote godot-devtool broker returned an error.');
}
