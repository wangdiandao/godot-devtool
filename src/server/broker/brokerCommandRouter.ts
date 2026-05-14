import { randomUUID } from 'node:crypto';

import type { BridgeClient, BridgeReceipt, BrokerCommandSnapshot } from './types.js';

export interface PendingBridgeCommand {
  commandId: string;
  clientId: string;
  targetKey: string;
  command: string;
  state: 'queued' | 'sent';
  createdAt: string;
  sentAt: string | null;
  timeoutMs: number;
  sessionId: string | null;
  runId: string | null;
  resolve: (receipt: BridgeReceipt) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class BrokerCommandRouter {
  private pending = new Map<string, PendingBridgeCommand>();
  private queues = new Map<string, Promise<unknown>>();

  get size(): number {
    return this.pending.size;
  }

  snapshot(): BrokerCommandSnapshot[] {
    return [...this.pending.values()].map((pending) => ({
      commandId: pending.commandId,
      clientId: pending.clientId,
      targetKey: pending.targetKey,
      command: pending.command,
      state: pending.state,
      createdAt: pending.createdAt,
      sentAt: pending.sentAt,
      timeoutMs: pending.timeoutMs,
      sessionId: pending.sessionId,
      runId: pending.runId,
    }));
  }

  clear(errorMessage = 'WebSocket bridge stopped before command completed.'): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(errorMessage));
    }
    this.pending.clear();
    this.queues.clear();
  }

  send(
    client: BridgeClient,
    sendFrame: (socket: import('node:net').Socket, payload: string) => void,
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number
  ): Promise<BridgeReceipt> {
    const commandId = randomUUID();
    const targetQueueKey = commandTargetKey(client);
    const receiptPromise = new Promise<BridgeReceipt>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error(`Timed out waiting for ${client.context} WebSocket command ${command}.`));
      }, timeoutMs);
      this.pending.set(commandId, {
        commandId,
        clientId: client.id,
        targetKey: targetQueueKey,
        command,
        state: 'queued',
        createdAt: new Date().toISOString(),
        sentAt: null,
        timeoutMs,
        sessionId: client.sessionId,
        runId: client.runId,
        resolve,
        reject,
        timer,
      });
    });
    const previous = this.queues.get(targetQueueKey) ?? Promise.resolve();
    const sendTask = previous.catch(() => undefined).then(() => {
      const pending = this.pending.get(commandId);
      if (!pending) return;
      pending.state = 'sent';
      pending.sentAt = new Date().toISOString();
      sendFrame(client.socket, JSON.stringify({
        type: 'command',
        commandId,
        command,
        payload,
        timeoutMs,
      }));
      return receiptPromise;
    });
    this.queues.set(targetQueueKey, sendTask);
    return receiptPromise;
  }

  resolveReceipt(client: BridgeClient, message: any): boolean {
    const commandId = String(message.commandId ?? '');
    const pending = this.pending.get(commandId);
    if (!pending || pending.clientId !== client.id) return false;
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
    return true;
  }
}

function commandTargetKey(client: BridgeClient): string {
  return [
    client.projectPath ?? '',
    client.context ?? '',
    client.sessionId ?? client.id,
    client.runId ?? '',
  ].join('|');
}
