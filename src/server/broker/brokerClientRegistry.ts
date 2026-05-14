import type { BridgeClient, BridgeContext, BrokerClientSnapshot } from './types.js';

export class BrokerClientRegistry {
  private clients = new Map<string, BridgeClient>();

  add(client: BridgeClient): void {
    this.clients.set(client.id, client);
  }

  get(id: string): BridgeClient | undefined {
    return this.clients.get(id);
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  clear(): void {
    this.clients.clear();
  }

  values(): BridgeClient[] {
    return [...this.clients.values()];
  }

  find(projectPath: string, context: BridgeContext): BridgeClient[] {
    const normalizedProjectPath = normalizeProjectPath(projectPath);
    return this.values().filter((client) => (
      client.context === context &&
      normalizeProjectPath(client.projectPath) === normalizedProjectPath
    ));
  }

  snapshots(projectPath?: string): BrokerClientSnapshot[] {
    const normalizedProjectPath = projectPath ? normalizeProjectPath(projectPath) : '';
    return this.values()
      .filter((client) => !normalizedProjectPath || normalizeProjectPath(client.projectPath) === normalizedProjectPath)
      .map((client) => ({
        id: client.id,
        context: client.context,
        projectPath: client.projectPath,
        connectedAt: client.connectedAt,
        acknowledgedAt: client.acknowledgedAt,
        lastSeenAt: client.lastSeenAt,
        protocolVersion: client.protocolVersion,
        sessionId: client.sessionId,
        runId: client.runId,
      }));
  }
}

export function normalizeProjectPath(value: string | null | undefined): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
