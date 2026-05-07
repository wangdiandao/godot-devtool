import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const fragmentDir = join(process.cwd(), 'src', 'scripts', 'godot_operations');
const fragments = [
  '00_entry_common.gd',
  '10_visual_helpers.gd',
  '20_scene_node_commands.gd',
  '30_animation_commands.gd',
  '40_ui_commands.gd',
  '50_visual_commands.gd',
  '60_tilemap_spatial_commands.gd',
  '70_scene_asset_commands.gd',
];

const missing = fragments
  .map((fragment) => join(fragmentDir, fragment))
  .filter((fragmentPath) => !existsSync(fragmentPath));

if (missing.length > 0) {
  console.error(`Missing Godot operation fragments:\n${missing.join('\n')}`);
  process.exit(1);
}

const generatedPath = join(process.cwd(), 'build', 'scripts', 'godot_operations.gd');
if (!existsSync(generatedPath)) {
  console.error(`Missing generated Godot operation script: ${generatedPath}`);
  process.exit(1);
}

const expected = fragments
  .map((fragment) => readFileSync(join(fragmentDir, fragment), 'utf8'))
  .join('');
const generated = readFileSync(generatedPath, 'utf8');

if (generated !== expected) {
  console.error('Generated godot_operations.gd does not match the ordered source fragments.');
  process.exit(1);
}

const nodeMoveMatch = expected.match(/func node_move\(params\):[\s\S]*?\nfunc node_duplicate\(params\):/);
if (!nodeMoveMatch) {
  console.error('Could not locate node_move implementation in Godot operation fragments.');
  process.exit(1);
}
const nodeMoveSource = nodeMoveMatch[0];
for (const requiredSnippet of [
  'params.has("parent_node_path")',
  'old_parent.remove_child(node)',
  'new_parent.add_child(node)',
  '"previousParentPath"',
  '"newParentPath"',
]) {
  if (!nodeMoveSource.includes(requiredSnippet)) {
    console.error(`node_move reparent support is missing required snippet: ${requiredSnippet}`);
    process.exit(1);
  }
}

console.log(`Verified generated Godot operation script from ${fragments.length} fragments.`);
