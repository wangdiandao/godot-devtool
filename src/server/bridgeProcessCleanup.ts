import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const DEFAULT_BRIDGE_PORT = 8766;
const DEFAULT_WAIT_MS = 1500;

export interface BridgeProcessCleanupOptions {
  port?: number;
  websocketPort?: number;
  pid?: number;
  kill?: boolean;
  force?: boolean;
  allowUnverified?: boolean;
  waitMs?: number;
}

export interface BridgeProcessCandidate {
  pid: number;
  localAddress?: string;
  commandLine?: string | null;
  matchesGodotDevtool: boolean;
  action: 'dry_run' | 'terminated' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
}

export interface BridgeProcessCleanupResult {
  ok: boolean;
  port: number;
  killRequested: boolean;
  force: boolean;
  pid?: number;
  allowUnverified: boolean;
  candidates: BridgeProcessCandidate[];
  killed: number;
  skipped: number;
  message: string;
}

interface ListenerProcess {
  pid: number;
  localAddress?: string;
}

export async function cleanupBridgePort(options: BridgeProcessCleanupOptions = {}): Promise<BridgeProcessCleanupResult> {
  const port = normalizePort(options.port ?? options.websocketPort ?? Number(process.env.GODOT_DEVTOOL_WS_PORT ?? DEFAULT_BRIDGE_PORT));
  const requestedPid = normalizeOptionalPid(options.pid);
  const killRequested = options.kill === true;
  const force = options.force === true;
  const allowUnverified = options.allowUnverified === true;
  const waitMs = normalizeWaitMs(options.waitMs ?? DEFAULT_WAIT_MS);
  const listeners = await findTcpListeners(port);
  const candidates: BridgeProcessCandidate[] = [];

  for (const listener of listeners) {
    const commandLine = await readProcessCommandLine(listener.pid);
    const matchesGodotDevtool = commandLineMatchesGodotDevtool(commandLine);
    const candidate: BridgeProcessCandidate = {
      pid: listener.pid,
      localAddress: listener.localAddress,
      commandLine,
      matchesGodotDevtool,
      action: 'skipped',
    };

    if (requestedPid !== undefined && requestedPid !== listener.pid) {
      candidate.reason = 'pid_guard_mismatch';
      candidates.push(candidate);
      continue;
    }

    if (!matchesGodotDevtool) {
      if (commandLine) {
        candidate.reason = 'command_line_not_godot_devtool';
        candidates.push(candidate);
        continue;
      }
      if (!(killRequested && allowUnverified && requestedPid === listener.pid)) {
        candidate.reason = 'command_line_unavailable';
        candidates.push(candidate);
        continue;
      }
      candidate.reason = 'explicit_pid_command_line_unavailable';
    }

    if (listener.pid === process.pid) {
      candidate.reason = 'current_process';
      candidates.push(candidate);
      continue;
    }

    if (!killRequested) {
      candidate.action = 'dry_run';
      candidate.reason = 'kill_false';
      candidates.push(candidate);
      continue;
    }

    try {
      candidate.action = await terminateProcess(listener.pid, { force, waitMs }) ? 'terminated' : 'failed';
      if (candidate.action === 'failed') {
        candidate.reason = 'process_still_alive';
      }
    } catch (error: any) {
      candidate.action = 'failed';
      candidate.error = error?.message || String(error);
    }
    candidates.push(candidate);
  }

  const killed = candidates.filter((candidate) => candidate.action === 'terminated').length;
  const skipped = candidates.length - killed;
  return {
    ok: candidates.every((candidate) => candidate.action !== 'failed'),
    port,
    killRequested,
    force,
    pid: requestedPid,
    allowUnverified,
    candidates,
    killed,
    skipped,
    message: buildCleanupMessage(port, killRequested, killed, candidates),
  };
}

export function commandLineMatchesGodotDevtool(commandLine?: string | null): boolean {
  if (!commandLine) return false;
  const normalized = commandLine.replace(/\\/g, '/').toLowerCase();
  const hasPackageToken = /\bgodot-devtool\b/.test(normalized);
  if (!hasPackageToken) return false;
  const hasBuildEntry = /(^|\/)build\/index\.js(\b|["'\s]|$)/.test(normalized);
  const hasPackageCommand = /(^|[\s"'])godot-devtool(?:\.cmd|\.ps1)?(?=$|[\s"'])/.test(normalized);
  return hasBuildEntry || hasPackageCommand;
}

async function findTcpListeners(port: number): Promise<ListenerProcess[]> {
  return process.platform === 'win32'
    ? findWindowsTcpListeners(port)
    : findUnixTcpListeners(port);
}

async function findWindowsTcpListeners(port: number): Promise<ListenerProcess[]> {
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  const listeners: ListenerProcess[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^TCP\s/i.test(trimmed)) continue;
    const columns = trimmed.split(/\s+/);
    if (columns.length < 5 || columns[3].toUpperCase() !== 'LISTENING') continue;
    if (parseLocalPort(columns[1]) !== port) continue;
    const pid = Number(columns[4]);
    if (Number.isInteger(pid) && pid > 0) {
      listeners.push({ pid, localAddress: columns[1] });
    }
  }
  return uniqueListeners(listeners);
}

async function findUnixTcpListeners(port: number): Promise<ListenerProcess[]> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const listeners: ListenerProcess[] = [];
    for (const line of stdout.split(/\r?\n/).slice(1)) {
      const columns = line.trim().split(/\s+/);
      const pid = Number(columns[1]);
      if (Number.isInteger(pid) && pid > 0) {
        listeners.push({ pid, localAddress: columns.at(-2) });
      }
    }
    return uniqueListeners(listeners);
  } catch {
    return [];
  }
}

async function readProcessCommandLine(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return readWindowsProcessCommandLine(pid);
  }
  return readUnixProcessCommandLine(pid);
}

async function readWindowsProcessCommandLine(pid: number): Promise<string | null> {
  try {
    const script = [
      `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue`,
      'if ($null -ne $process) { $process.CommandLine }',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readUnixProcessCommandLine(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], {
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function terminateProcess(pid: number, options: { force: boolean; waitMs: number }): Promise<boolean> {
  if (!isProcessAlive(pid)) return true;
  process.kill(pid, 'SIGTERM');
  if (await waitForProcessExit(pid, options.waitMs)) return true;
  if (options.force && isProcessAlive(pid)) {
    process.kill(pid, 'SIGKILL');
    return waitForProcessExit(pid, options.waitMs);
  }
  return !isProcessAlive(pid);
}

function parseLocalPort(localAddress: string): number | null {
  const match = /:(\d+)$/.exec(localAddress);
  return match ? Number(match[1]) : null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!isProcessAlive(pid)) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 50);
  });
}

function normalizePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('port must be an integer between 1 and 65535');
  }
  return value;
}

function normalizeOptionalPid(value: number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('pid must be a positive integer');
  }
  return value;
}

function normalizeWaitMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WAIT_MS;
  return Math.max(100, Math.min(10000, Math.floor(value)));
}

function uniqueListeners(listeners: ListenerProcess[]): ListenerProcess[] {
  const byPid = new Map<number, ListenerProcess>();
  for (const listener of listeners) {
    if (!byPid.has(listener.pid)) {
      byPid.set(listener.pid, listener);
    }
  }
  return [...byPid.values()];
}

function buildCleanupMessage(port: number, killRequested: boolean, killed: number, candidates: BridgeProcessCandidate[]): string {
  if (candidates.length === 0) return `No TCP listener found on port ${port}.`;
  if (!killRequested) return `Found ${candidates.length} listener(s) on port ${port}; dry-run only.`;
  if (killed > 0) return `Stopped ${killed} matching or explicitly selected godot-devtool listener(s) on port ${port}.`;
  return `No matching godot-devtool listener was stopped on port ${port}.`;
}
