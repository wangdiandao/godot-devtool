import type { BridgeClient, BridgeCommandTarget, BridgeContext } from '../broker/types.js';
import { BrokerClientRegistry } from '../broker/brokerClientRegistry.js';
import { BridgeTargetAmbiguityError } from './ambiguity.js';

export function resolveBridgeTarget(
  registry: BrokerClientRegistry,
  projectPath: string,
  context: BridgeContext,
  target: BridgeCommandTarget = {}
): BridgeClient | null {
  let candidates = registry.find(projectPath, context);
  if (target.sessionId) {
    candidates = candidates.filter((client) => client.sessionId === target.sessionId);
  }
  if (target.runId) {
    candidates = candidates.filter((client) => client.runId === target.runId);
  }
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new BridgeTargetAmbiguityError(context, candidates.map((client) => ({
      id: client.id,
      context: client.context,
      projectPath: client.projectPath,
      connectedAt: client.connectedAt,
      acknowledgedAt: client.acknowledgedAt,
      lastSeenAt: client.lastSeenAt,
      protocolVersion: client.protocolVersion,
      sessionId: client.sessionId,
      runId: client.runId,
    })));
  }
  return candidates[0];
}
