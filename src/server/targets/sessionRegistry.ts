import type { BrokerClientSnapshot, BridgeContext } from '../broker/types.js';

export class SessionRegistry {
  constructor(private readonly snapshotsProvider: () => BrokerClientSnapshot[]) {}

  list(projectPath?: string, context?: BridgeContext): BrokerClientSnapshot[] {
    const normalizedProjectPath = projectPath ? normalizeProjectPath(projectPath) : '';
    return this.snapshotsProvider().filter((session) => {
      if (context && session.context !== context) return false;
      if (normalizedProjectPath && normalizeProjectPath(session.projectPath) !== normalizedProjectPath) return false;
      return true;
    });
  }
}

function normalizeProjectPath(value: string | null | undefined): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
