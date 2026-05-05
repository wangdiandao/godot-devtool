import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getOperationsScriptPath(moduleUrl: string): string {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  return join(moduleDir, '..', 'scripts', 'godot_operations.gd');
}
