import type { ManagedGodotRun, RunSelectionFailureReason, RunSelectionMode, RunSelectionOptions, SerializedRunStatus } from './types.js';
import { serializeRunStatus } from './runStatus.js';
import { projectPathMatches } from './projectPath.js';

export type RunSelection =
  | { ok: true; run: ManagedGodotRun }
  | {
      ok: false;
      reason: RunSelectionFailureReason;
      message: string;
      candidates: SerializedRunStatus[];
      runId: string | null;
    };

export function filterRuns(runs: Iterable<ManagedGodotRun>, options: RunSelectionOptions = {}): ManagedGodotRun[] {
  return [...runs].filter((run) => {
    if (!projectPathMatches(run.projectPath, options.projectPath)) return false;
    if (options.includeExited === false && run.exitedAt) return false;
    return true;
  });
}

export function selectRun(
  runs: Iterable<ManagedGodotRun>,
  getById: (runId: string) => ManagedGodotRun | null,
  options: RunSelectionOptions = {}
): RunSelection {
  const mode: RunSelectionMode = options.mode ?? 'available';
  const includeExited = mode === 'active' ? false : options.includeExited;
  const requestedRunId = options.runId ?? null;

  if (requestedRunId) {
    const selected = getById(requestedRunId);
    if (!selected || !projectPathMatches(selected.projectPath, options.projectPath)) {
      return failure('not_found', `No Godot run found for runId "${requestedRunId}".`, [], requestedRunId);
    }
    if (includeExited === false && selected.exitedAt) {
      return failure('not_active', `Godot run "${requestedRunId}" has already exited.`, [selected], requestedRunId);
    }
    return { ok: true, run: selected };
  }

  const candidates = filterRuns(runs, { ...options, includeExited });
  const activeCandidates = candidates.filter((run) => !run.exitedAt);

  if (mode === 'active') {
    return selectSingle(activeCandidates, 'No active Godot process is available.', requestedRunId);
  }

  if (activeCandidates.length > 0) {
    return selectSingle(activeCandidates, 'No active Godot process output is available.', requestedRunId);
  }

  return selectSingle(candidates, 'No Godot process output is available.', requestedRunId);
}

function selectSingle(candidates: ManagedGodotRun[], noneMessage: string, runId: string | null): RunSelection {
  if (candidates.length === 1) return { ok: true, run: candidates[0] };
  if (candidates.length > 1) {
    return failure(
      'ambiguous',
      'Multiple Godot run instances match this request. Pass runId to choose one.',
      candidates,
      runId
    );
  }
  return failure('none', noneMessage, [], runId);
}

function failure(
  reason: RunSelectionFailureReason,
  message: string,
  candidates: ManagedGodotRun[],
  runId: string | null
): RunSelection {
  return {
    ok: false,
    reason,
    message,
    candidates: candidates.map(serializeRunStatus),
    runId,
  };
}
