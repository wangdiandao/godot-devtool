import type { BrokerClientSnapshot, BridgeContext } from '../broker/types.js';

export class BridgeTargetAmbiguityError extends Error {
  public readonly code = 'bridge_target_ambiguous';

  constructor(
    public readonly context: BridgeContext,
    public readonly candidates: BrokerClientSnapshot[]
  ) {
    super(`Multiple ${context} bridge sessions match this request. Pass runId or sessionId to choose a target.`);
    this.name = 'BridgeTargetAmbiguityError';
  }
}

export function bridgeTargetAmbiguityPayload(error: BridgeTargetAmbiguityError): Record<string, unknown> {
  return {
    ok: false,
    error: error.message,
    code: error.code,
    context: error.context,
    candidates: error.candidates,
    guidance: [
      'Call list_bridge_sessions to inspect connected editor/runtime sessions.',
      'Pass sessionId for editor/runtime routes when multiple sessions match.',
      'Pass runId for runtime routes when multiple game instances match.',
    ],
  };
}
