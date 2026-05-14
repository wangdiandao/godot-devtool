import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

import type { ManagedGodotRun } from './types.js';

export function createRunId(prefix = 'run'): string {
  return `${prefix}-${randomUUID()}`;
}

export function createManagedRun(options: {
  runId?: string;
  projectPath: string;
  scene?: string | null;
  headless?: boolean;
  quitAfter?: number | null;
  args?: string[];
  process: ChildProcess;
}): ManagedGodotRun {
  return {
    runId: options.runId || createRunId(),
    projectPath: options.projectPath,
    scene: options.scene ?? null,
    headless: options.headless === true,
    quitAfter: options.quitAfter ?? null,
    args: options.args ? [...options.args] : [],
    process: options.process,
    output: [],
    errors: [],
    startedAt: new Date().toISOString(),
  };
}

export function startGodotRunProcess(godotPath: string, args: string[], extraEnv: Record<string, string> = {}): ChildProcess {
  const env = { ...process.env, ...extraEnv };
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(godotPath)) {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return spawn(comspec, ['/d', '/c', godotPath, ...args], {
      stdio: 'pipe',
      env,
    });
  }
  return spawn(godotPath, args, { stdio: 'pipe', env });
}

export function stopRunProcess(run: ManagedGodotRun): void {
  run.process.kill();
  run.exitedAt = run.exitedAt ?? new Date().toISOString();
  run.exitCode = run.exitCode ?? null;
  run.exitSignal = run.exitSignal ?? 'SIGTERM';
}

export function markRunStartError(run: ManagedGodotRun): void {
  run.exitedAt = run.exitedAt ?? new Date().toISOString();
  run.exitCode = run.exitCode ?? null;
  run.exitSignal = run.exitSignal ?? null;
}

export function markRunExited(run: ManagedGodotRun, code: number | null, signal: string | null): void {
  run.exitedAt = run.exitedAt ?? new Date().toISOString();
  run.exitCode = run.exitCode ?? code;
  run.exitSignal = run.exitSignal ?? signal;
}

export function appendRunOutput(
  target: string[],
  data: Buffer,
  maxLines: number,
  logPrefix?: string,
  logLine?: (message: string) => void
): void {
  const text = data.toString('utf8');
  const lines = text.split(/\r?\n/);
  target.push(...lines);
  if (target.length > maxLines) {
    target.splice(0, target.length - maxLines);
  }
  if (logPrefix && logLine) {
    for (const line of lines) {
      if (line.trim()) logLine(`[${logPrefix}] ${line}`);
    }
  }
}
