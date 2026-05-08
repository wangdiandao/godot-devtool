import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.join(__dirname, '..', 'build');

// Make the build/index.js file executable
fs.chmodSync(path.join(buildDir, 'index.js'), '755');

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

  const sourceSkillDir = path.join(__dirname, '..', 'skills', 'godot-devtool');
  const buildSkillDir = path.join(buildDir, 'skills', 'godot-devtool');
  fs.removeSync(buildSkillDir);
  fs.ensureDirSync(buildSkillDir);
  fs.copyFileSync(
    path.join(sourceSkillDir, 'SKILL.md'),
    path.join(buildSkillDir, 'SKILL.md')
  );
  console.log('Successfully copied godot-devtool skill into build output');
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');
