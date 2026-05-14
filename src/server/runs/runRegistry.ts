import type { ChildProcess } from 'node:child_process';

import type { ManagedGodotRun, RunSelectionOptions } from './types.js';
import { createManagedRun, markRunExited, startGodotRunProcess, stopRunProcess } from './runProcess.js';
import { serializeRunStatus } from './runStatus.js';
import { normalizeAdoptedRun, type LegacyRunLike } from './runAdoption.js';
import { filterRuns, selectRun, type RunSelection } from './runSelection.js';

export { type RunSelection } from './runSelection.js';

export class RunRegistry {
  private readonly runs = new Map<string, ManagedGodotRun>();
  private lastRunId: string | null = null;

  add(run: ManagedGodotRun): ManagedGodotRun {
    if (this.runs.has(run.runId) && this.runs.get(run.runId) !== run) {
      throw new Error(`Godot runId already exists: ${run.runId}`);
    }
    this.runs.set(run.runId, run);
    this.lastRunId = run.runId;
    return run;
  }

  register(options: {
    process: ChildProcess;
    projectPath?: string | null;
    scene?: string | null;
    headless?: boolean;
    quitAfter?: number | null;
    args?: string[];
    output?: string[];
    errors?: string[];
    startedAt?: string;
    runId?: string;
  }): ManagedGodotRun {
    const run = createManagedRun({
      runId: options.runId,
      projectPath: options.projectPath ?? '',
      scene: options.scene ?? null,
      headless: options.headless,
      quitAfter: options.quitAfter,
      args: options.args,
      process: options.process,
    });
    run.output = options.output ? [...options.output] : run.output;
    run.errors = options.errors ? [...options.errors] : run.errors;
    run.startedAt = options.startedAt ?? run.startedAt;
    return this.add(run);
  }

  start(options: {
    godotPath: string;
    args: string[];
    runId?: string;
    projectPath: string;
    scene?: string | null;
    headless?: boolean;
    quitAfter?: number | null;
  }): ManagedGodotRun {
    if (options.runId && this.runs.has(options.runId)) {
      throw new Error(`Godot runId already exists: ${options.runId}`);
    }
    return this.register({
      process: startGodotRunProcess(options.godotPath, options.args),
      runId: options.runId,
      projectPath: options.projectPath,
      scene: options.scene ?? null,
      headless: options.headless,
      quitAfter: options.quitAfter,
      args: options.args,
    });
  }

  adoptLegacy(run: LegacyRunLike): ManagedGodotRun {
    if (run.runId && this.runs.has(run.runId)) return this.runs.get(run.runId)!;
    const existing = this.findByProcess(run.process);
    if (existing) return existing;
    return this.add(normalizeAdoptedRun(run));
  }

  markLast(run: ManagedGodotRun): void {
    this.lastRunId = run.runId;
  }

  get(runId: string): ManagedGodotRun | null {
    return this.runs.get(runId) ?? null;
  }

  findByProcess(process: ChildProcess): ManagedGodotRun | null {
    for (const run of this.runs.values()) {
      if (run.process === process) return run;
    }
    return null;
  }

  list(options: RunSelectionOptions = {}): ManagedGodotRun[] {
    return filterRuns(this.runs.values(), options);
  }

  resolve(options: RunSelectionOptions = {}): ManagedGodotRun | null {
    const selection = this.select(options);
    return selection.ok ? selection.run : null;
  }

  select(options: RunSelectionOptions = {}): RunSelection {
    return selectRun(this.runs.values(), (runId) => this.get(runId), options);
  }

  getLatestActiveRun(projectPath?: string): ManagedGodotRun | null {
    const active = this.list({ projectPath, includeExited: false });
    return active[active.length - 1] ?? null;
  }

  getLastRun(): ManagedGodotRun | null {
    return this.lastRunId ? this.get(this.lastRunId) : null;
  }

  activeRunCount(projectPath?: string): number {
    return this.list({ projectPath, includeExited: false }).length;
  }

  markExited(run: ManagedGodotRun, code: number | null, signal: string | null): ManagedGodotRun {
    markRunExited(run, code, signal);
    this.markLast(run);
    return run;
  }

  stop(run: ManagedGodotRun): ManagedGodotRun {
    if (!run.exitedAt) {
      stopRunProcess(run);
    }
    this.markLast(run);
    return run;
  }

  status(options: RunSelectionOptions = {}): Record<string, unknown> {
    const runs = this.list(options);
    const active = runs.filter((run) => !run.exitedAt);
    return {
      runs: runs.map(serializeRunStatus),
      count: runs.length,
      activeCount: active.length,
      lastRunId: this.lastRunId,
    };
  }
}

export const GodotRunRegistry = RunRegistry;
