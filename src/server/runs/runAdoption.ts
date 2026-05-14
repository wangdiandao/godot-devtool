import type { ManagedGodotRun } from './types.js';
import { createManagedRun } from './runProcess.js';

export type LegacyRunLike = Partial<Omit<ManagedGodotRun, 'process'>> & {
  process: ManagedGodotRun['process'];
};

export function normalizeAdoptedRun(run: LegacyRunLike): ManagedGodotRun {
  const adopted = run as ManagedGodotRun;
  adopted.runId = adopted.runId ?? createManagedRun({ projectPath: adopted.projectPath ?? '', process: adopted.process }).runId;
  adopted.projectPath = adopted.projectPath ?? '';
  adopted.scene = adopted.scene ?? null;
  adopted.headless = adopted.headless === true;
  adopted.quitAfter = adopted.quitAfter ?? null;
  adopted.args = adopted.args ? [...adopted.args] : [];
  adopted.output = adopted.output ?? [];
  adopted.errors = adopted.errors ?? [];
  adopted.startedAt = adopted.startedAt ?? new Date().toISOString();
  return adopted;
}
