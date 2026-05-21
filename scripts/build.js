import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.join(__dirname, '..', 'build');

// Make the build/index.js file executable
fs.chmodSync(path.join(buildDir, 'index.js'), '755');

removeStaleCompiledOutputs();

for (const staleBuildArtifact of [
  'survivors_behavior_test.log',
  'visual_probe.gd',
]) {
  fs.removeSync(path.join(buildDir, staleBuildArtifact));
}

// Copy the scripts directory to the build directory
try {
  // Ensure the build/scripts directory exists
  fs.removeSync(path.join(buildDir, 'scripts'));
  fs.ensureDirSync(path.join(buildDir, 'scripts'));

  const operationFragments = [
    '00_entry_common.gd',
    '10_visual_helpers.gd',
    '20_scene_node_commands.gd',
    '30_animation_commands.gd',
    '40_ui_commands.gd',
    '50_visual_commands.gd',
    '60_tilemap_spatial_commands.gd',
    '70_scene_asset_commands.gd',
  ];

  const operationsSource = operationFragments
    .map((fileName) => fs.readFileSync(
      path.join(__dirname, '..', 'src', 'scripts', 'godot_operations', fileName),
      'utf8'
    ))
    .join('');

  fs.writeFileSync(
    path.join(buildDir, 'scripts', 'godot_operations.gd'),
    operationsSource
  );

  console.log('Successfully generated godot_operations.gd from source fragments');

  const sourceAddonDir = path.join(__dirname, '..', 'src', 'addons', 'godot_devtool');
  const buildAddonDir = path.join(buildDir, 'addons', 'godot_devtool');
  fs.removeSync(buildAddonDir);
  fs.copySync(sourceAddonDir, buildAddonDir);
  console.log('Successfully copied godot-devtool Godot addon into build output');

  const sourceSkillsDir = path.join(__dirname, '..', 'skills');
  const buildSkillsDir = path.join(buildDir, 'skills');
  fs.removeSync(buildSkillsDir);
  fs.copySync(sourceSkillsDir, buildSkillsDir, {
    filter: (sourcePath) => {
      const stat = fs.statSync(sourcePath);
      return stat.isDirectory() || path.basename(sourcePath) === 'SKILL.md';
    },
  });
  console.log('Successfully copied godot-devtool skills into build output');

  copyBundleFile('plugin.json');
  copyBundleDirectory('.codex-plugin');
  copyBundleDirectory('.claude-plugin');
  copyBundleDirectory('agents');
  console.log('Successfully copied plugin bundle metadata into build output');
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');

function removeStaleCompiledOutputs() {
  const srcDir = path.join(__dirname, '..', 'src');
  const expectedCompiledFiles = new Set(
    listFiles(srcDir)
      .filter((filePath) => filePath.endsWith('.ts'))
      .map((filePath) => {
        const relativeSource = path.relative(srcDir, filePath);
        return normalizeBuildRelative(relativeSource.replace(/\.ts$/, '.js'));
      })
  );

  for (const filePath of listFiles(buildDir)) {
    const relativeBuildPath = normalizeBuildRelative(path.relative(buildDir, filePath));
    if (relativeBuildPath.startsWith('addons/') || relativeBuildPath.startsWith('scripts/') || relativeBuildPath.startsWith('skills/')) {
      continue;
    }
    if (filePath.endsWith('.js') && !expectedCompiledFiles.has(relativeBuildPath)) {
      fs.removeSync(filePath);
    }
  }

  removeEmptyDirectories(buildDir);
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

function removeEmptyDirectories(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directory, entry.name));
    }
  }
  if (directory !== buildDir && fs.readdirSync(directory).length === 0) {
    fs.removeSync(directory);
  }
}

function normalizeBuildRelative(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function copyBundleFile(relativePath) {
  const sourcePath = path.join(__dirname, '..', relativePath);
  const targetPath = path.join(buildDir, relativePath);
  fs.removeSync(targetPath);
  fs.ensureDirSync(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyBundleDirectory(relativePath) {
  const sourcePath = path.join(__dirname, '..', relativePath);
  const targetPath = path.join(buildDir, relativePath);
  fs.removeSync(targetPath);
  fs.copySync(sourcePath, targetPath);
}
