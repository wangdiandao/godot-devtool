import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const expectedVersion = packageJson.version;
const expectedSkills = [
  'godot-devtool',
  'godot-devtool-project-setup',
  'godot-devtool-live-editor',
  'godot-devtool-runtime-test',
  'godot-devtool-scene-authoring',
  'godot-devtool-release-verify',
];
const expectedAgentFile = 'godot-dev.agent.md';
const expectedBundleFiles = [
  'plugin.json',
  '.codex-plugin/plugin.json',
  '.claude-plugin/plugin.json',
  `agents/${expectedAgentFile}`,
];

const repoSkillsDir = join(repoRoot, 'skills');
const buildSkillsDir = join(repoRoot, 'build', 'skills');
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
const installedSkillsDir = join(codexHome, 'skills');

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readSkill(root, name) {
  const filePath = join(root, name, 'SKILL.md');
  assert.ok(existsSync(filePath), `Missing ${filePath}`);
  const raw = readFileSync(filePath, 'utf8');
  return {
    filePath,
    raw,
    hash: hashFile(filePath),
  };
}

function readJson(root, relativePath) {
  const filePath = join(root, ...relativePath.split('/'));
  assert.ok(existsSync(filePath), `Missing ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function skillDirectoryNames(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => {
      const entryPath = join(root, entry);
      return statSync(entryPath).isDirectory() && existsSync(join(entryPath, 'SKILL.md'));
    })
    .sort();
}

function verifyPluginBundle(root, label) {
  const manifest = readJson(root, 'plugin.json');
  assert.equal(manifest.name, 'godot-devtool', `${label} root plugin name must be godot-devtool`);
  assert.equal(manifest.version, expectedVersion, `${label} root plugin version must match package.json`);
  assert.equal(manifest.agents, 'agents/', `${label} root plugin must expose agents/`);
  assert.deepEqual(manifest.skills, ['skills/'], `${label} root plugin must expose skills/`);
  assert.ok(manifest.keywords.includes('godot'), `${label} root plugin keywords must include godot`);
  assert.ok(manifest.keywords.includes('mcp'), `${label} root plugin keywords must include mcp`);

  const codexManifest = readJson(root, '.codex-plugin/plugin.json');
  assert.equal(codexManifest.name, 'godot-devtool', `${label} Codex plugin name must be godot-devtool`);
  assert.equal(codexManifest.version, expectedVersion, `${label} Codex plugin version must match package.json`);
  assert.equal(codexManifest.skills, './skills/', `${label} Codex plugin must point at ./skills/`);
  assert.ok(codexManifest.interface, `${label} Codex plugin must include interface metadata`);
  assert.equal(codexManifest.interface.displayName, 'Godot Devtool', `${label} Codex display name must be stable`);
  assert.ok(codexManifest.interface.defaultPrompt.includes('godot-dev'), `${label} Codex default prompt must route to the agent`);
  assert.ok(codexManifest.interface.capabilities.includes('agents'), `${label} Codex capabilities must mention agents`);
  assert.ok(codexManifest.interface.capabilities.includes('skills'), `${label} Codex capabilities must mention skills`);
  assert.ok(codexManifest.interface.capabilities.includes('mcp'), `${label} Codex capabilities must mention mcp`);

  const claudeManifest = readJson(root, '.claude-plugin/plugin.json');
  assert.equal(claudeManifest.name, 'godot-devtool', `${label} Claude plugin name must be godot-devtool`);
  assert.equal(claudeManifest.version, expectedVersion, `${label} Claude plugin version must match package.json`);
  assert.ok(claudeManifest.keywords.includes('godot'), `${label} Claude plugin keywords must include godot`);

  const agentPath = join(root, 'agents', expectedAgentFile);
  assert.ok(existsSync(agentPath), `Missing ${agentPath}`);
  const agentRaw = readFileSync(agentPath, 'utf8');
  assert.match(agentRaw, /^name: godot-dev$/m, `${label} agent name must be godot-dev`);
  assert.match(agentRaw, /^user-invocable: true$/m, `${label} agent must be user invocable`);
  assert.match(agentRaw, /get_capabilities/, `${label} agent must start from MCP capability discovery`);
  assert.match(agentRaw, /plugin_install/, `${label} agent must cover plugin installation`);
  assert.match(agentRaw, /plugin_dock_status/, `${label} agent must cover Dock acceptance`);
  assert.match(agentRaw, /run_project/, `${label} agent must cover runtime testing`);
  for (const name of expectedSkills) {
    assert.match(agentRaw, new RegExp(name), `${label} agent must reference ${name}`);
  }
}

const repoSkillNames = skillDirectoryNames(repoSkillsDir);
for (const name of expectedSkills) {
  assert.ok(repoSkillNames.includes(name), `Repo skill is missing: ${name}`);
}

for (const name of expectedSkills) {
  const repoSkill = readSkill(repoSkillsDir, name);
  assert.match(repoSkill.raw, new RegExp(`^name: ${name}$`, 'm'), `${name} frontmatter name must match directory`);
  assert.match(repoSkill.raw, new RegExp(`version: "${expectedVersion.replaceAll('.', '\\.')}"`), `${name} version must match package.json`);

  const buildSkill = readSkill(buildSkillsDir, name);
  assert.equal(buildSkill.hash, repoSkill.hash, `${name} build SKILL.md hash must match repo`);
}

const rootSkill = readSkill(repoSkillsDir, 'godot-devtool').raw;
for (const name of expectedSkills.filter((entry) => entry !== 'godot-devtool')) {
  assert.match(rootSkill, new RegExp(name), `Root router skill must reference ${name}`);
}

verifyPluginBundle(repoRoot, 'repo');
verifyPluginBundle(join(repoRoot, 'build'), 'build');
for (const relativePath of expectedBundleFiles) {
  const repoFile = join(repoRoot, ...relativePath.split('/'));
  const buildFile = join(repoRoot, 'build', ...relativePath.split('/'));
  assert.equal(hashFile(buildFile), hashFile(repoFile), `${relativePath} build hash must match repo`);
}

if (existsSync(installedSkillsDir)) {
  const installedSkillNames = skillDirectoryNames(installedSkillsDir);
  for (const name of expectedSkills) {
    assert.ok(installedSkillNames.includes(name), `Installed Codex skill is missing: ${name}`);
    const repoSkill = readSkill(repoSkillsDir, name);
    const installedSkill = readSkill(installedSkillsDir, name);
    assert.equal(installedSkill.hash, repoSkill.hash, `${name} installed SKILL.md hash must match repo`);
  }
  console.log(`Verified ${expectedSkills.length} repo/build/installed skills at ${installedSkillsDir}.`);
} else {
  console.log(`Verified ${expectedSkills.length} repo/build skills. Installed Codex skills directory not found; skipped local install check: ${installedSkillsDir}`);
}
