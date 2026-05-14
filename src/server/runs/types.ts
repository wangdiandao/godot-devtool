import type { ChildProcess } from 'node:child_process';
import type { SerializedRunStatus as RunStatusSnapshot } from './runStatus.js';

export type { SerializedRunStatus } from './runStatus.js';

export interface ManagedGodotRun {
  runId: string;
  projectPath: string;
  scene?: string | null;
  headless: boolean;
  quitAfter?: number | null;
  args?: string[];
  process: ChildProcess;
  output: string[];
  errors: string[];
  startedAt: string;
  exitedAt?: string;
  exitCode?: number | null;
  exitSignal?: string | null;
}

export interface RunSelectionOptions {
  runId?: string;
  projectPath?: string;
  includeExited?: boolean;
  mode?: RunSelectionMode;
}

export type RunSelectionMode = 'active' | 'available';
export type RunSelectionFailureReason = 'none' | 'not_found' | 'not_active' | 'ambiguous';

export interface RunSelectionResult {
  ok: boolean;
  run?: ManagedGodotRun;
  reason?: RunSelectionFailureReason;
  message?: string;
  candidates?: RunStatusSnapshot[];
  runId?: string | null;
}

export class RunAmbiguityError extends Error {
  constructor(public readonly candidates: ManagedGodotRun[]) {
    super('Multiple Godot run instances match this request. Pass runId to choose one.');
    this.name = 'RunAmbiguityError';
  }
}
