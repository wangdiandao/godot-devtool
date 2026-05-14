import type { ManagedGodotRun } from './types.js';

export interface SerializedRunStatus {
  runId: string;
  projectPath: string;
  scene: string | null;
  headless: boolean;
  quitAfter: number | null;
  args: string[];
  pid: number | null;
  active: boolean;
  startedAt: string;
  exitedAt: string | null;
  exitCode: number | null;
  exitSignal: string | null;
  outputLines: number;
  errorLines: number;
}

export function serializeRunStatus(run: ManagedGodotRun): SerializedRunStatus {
  return {
    runId: run.runId,
    projectPath: run.projectPath,
    scene: run.scene ?? null,
    headless: run.headless,
    quitAfter: run.quitAfter ?? null,
    args: run.args ? [...run.args] : [],
    pid: run.process?.pid ?? null,
    active: !run.exitedAt,
    startedAt: run.startedAt,
    exitedAt: run.exitedAt ?? null,
    exitCode: run.exitCode ?? null,
    exitSignal: run.exitSignal ?? null,
    outputLines: run.output.length,
    errorLines: run.errors.length,
  };
}

export function runAmbiguityPayload(candidates: ManagedGodotRun[]): Record<string, unknown> {
  return {
    ok: false,
    code: 'run_target_ambiguous',
    error: 'Multiple Godot run instances match this request. Pass runId to choose one.',
    candidates: candidates.map(serializeRunStatus),
    guidance: [
      'Call list_run_instances to inspect active and recent Godot runs.',
      'Pass runId to get_debug_output, clear_debug_output, stop_project, or runtime tools.',
    ],
  };
}
