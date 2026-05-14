import type { BrokerStatusSnapshot } from './types.js';

export function summarizeBrokerStatus(status: BrokerStatusSnapshot): Record<string, unknown> {
  const editorClients = status.clients.filter((client) => client.context === 'editor');
  const runtimeClients = status.clients.filter((client) => client.context === 'runtime');
  return {
    ...status,
    summary: {
      editorClients: editorClients.length,
      runtimeClients: runtimeClients.length,
      pendingCommands: status.pendingCommandCount,
      running: status.running,
      port: status.port,
    },
  };
}
