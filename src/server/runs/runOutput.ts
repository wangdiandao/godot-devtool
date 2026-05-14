import type { ManagedGodotRun } from './types.js';

export function readRunOutput(run: ManagedGodotRun, args: any = {}): Record<string, unknown> {
  const outputOffset = Number.isInteger(args.outputOffset) && args.outputOffset >= 0 ? args.outputOffset : 0;
  const errorOffset = Number.isInteger(args.errorOffset) && args.errorOffset >= 0 ? args.errorOffset : 0;
  const tail = Number.isInteger(args.tail) && args.tail > 0 ? args.tail : null;
  const outputWindow = run.output.slice(outputOffset);
  const errorWindow = run.errors.slice(errorOffset);
  const output = tail ? outputWindow.slice(-tail) : outputWindow;
  const errors = tail ? errorWindow.slice(-tail) : errorWindow;
  return {
    runId: run.runId,
    projectPath: run.projectPath,
    output,
    errors,
    outputOffset,
    errorOffset,
    nextOutputOffset: run.output.length,
    nextErrorOffset: run.errors.length,
    active: !run.exitedAt,
    startedAt: run.startedAt,
    exitedAt: run.exitedAt ?? null,
    exitCode: run.exitCode ?? null,
    exitSignal: run.exitSignal ?? null,
  };
}

export const readRunDebugOutput = readRunOutput;

export function clearRunOutput(run: ManagedGodotRun): Record<string, unknown> {
  run.output.length = 0;
  run.errors.length = 0;
  return {
    runId: run.runId,
    message: 'Debug output cleared',
    nextOutputOffset: 0,
    nextErrorOffset: 0,
  };
}

export const clearRunDebugOutput = clearRunOutput;

export function appendRunStdout(run: ManagedGodotRun, data: Buffer, options: { logPrefix: string; logLine: (message: string) => void }): void {
  appendRunText(run.output, data, options);
}

export function appendRunStderr(run: ManagedGodotRun, data: Buffer, options: { logPrefix: string; logLine: (message: string) => void }): void {
  appendRunText(run.errors, data, options);
}

function appendRunText(target: string[], data: Buffer, options: { logPrefix: string; logLine: (message: string) => void }): void {
  const lines = data.toString('utf8').split(/\r?\n/).filter((line) => line.length > 0);
  for (const line of lines) {
    target.push(line);
    options.logLine(`${options.logPrefix}: ${line}`);
  }
}
