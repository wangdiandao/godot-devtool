export type BridgeContext = 'editor' | 'runtime';

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

export interface BridgeCommandTarget {
  sessionId?: string;
  runId?: string;
}

export interface BrokerCommandSnapshot {
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
}

export interface BrokerClientSnapshot {
  id: string;
  context: BridgeContext | null;
  projectPath: string | null;
  connectedAt: string;
  acknowledgedAt: string | null;
  lastSeenAt: string;
  protocolVersion: number | null;
  sessionId: string | null;
  runId: string | null;
}

export interface BrokerStatusSnapshot {
  brokerId: string;
  running: boolean;
  host: string;
  port: number;
  clients: BrokerClientSnapshot[];
  pendingCommands: number;
  pendingCommandDetails: BrokerCommandSnapshot[];
  pendingCommandCount: number;
  leases: Record<string, unknown>;
}

export interface BridgeClient {
  id: string;
  projectPath: string | null;
  context: BridgeContext | null;
  socket: import('node:net').Socket;
  connectedAt: string;
  acknowledgedAt: string | null;
  lastSeenAt: string;
  protocolVersion: number | null;
  sessionId: string | null;
  runId: string | null;
}
