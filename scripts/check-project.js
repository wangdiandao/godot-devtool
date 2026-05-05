import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectPath = process.argv[2];

if (!projectPath) {
  console.error('Usage: node scripts/check-project.js <projectPath>');
  process.exit(2);
}

if (!existsSync(resolve(projectPath, 'project.godot'))) {
  console.error(`Not a Godot project: ${projectPath}`);
  process.exit(2);
}

const { runProjectChecks } = await import('../build/godot/workflowAutomation.js');
const result = await runProjectChecks(resolve(projectPath));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
