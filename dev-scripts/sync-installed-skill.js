import { existsSync, cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const repoRoot = process.cwd();
const buildSkillsDir = join(repoRoot, 'build', 'skills');
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
const installedSkillsDir = join(codexHome, 'skills');

if (!existsSync(buildSkillsDir)) {
  console.error(`Build skills directory not found: ${buildSkillsDir}`);
  process.exit(1);
}

mkdirSync(installedSkillsDir, { recursive: true });

const skillNames = readdirSync(buildSkillsDir)
  .filter((entry) => {
    const entryPath = join(buildSkillsDir, entry);
    return statSync(entryPath).isDirectory() && existsSync(join(entryPath, 'SKILL.md'));
  })
  .sort();

for (const name of skillNames) {
  const sourceDir = join(buildSkillsDir, name);
  const targetDir = join(installedSkillsDir, name);
  mkdirSync(targetDir, { recursive: true });
  cpSync(join(sourceDir, 'SKILL.md'), join(targetDir, 'SKILL.md'));
  console.log(`Synced ${name} -> ${targetDir}`);
}

console.log(`Synced ${skillNames.length} godot-devtool skills into ${installedSkillsDir}.`);
