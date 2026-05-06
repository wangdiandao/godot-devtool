import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const addonRoot = join(process.cwd(), 'build', 'addons', 'godot_devtool');
const sourceRoot = join(process.cwd(), 'src', 'addons', 'godot_devtool');

for (const root of [sourceRoot, addonRoot]) {
  assert.ok(existsSync(join(root, 'plugin.cfg')), `Missing plugin.cfg in ${root}`);
  assert.ok(existsSync(join(root, 'plugin.gd')), `Missing plugin.gd in ${root}`);
  assert.ok(existsSync(join(root, 'command_router.gd')), `Missing command_router.gd in ${root}`);
  assert.ok(existsSync(join(root, 'runtime_bridge.gd')), `Missing runtime_bridge.gd in ${root}`);
}

const routerSource = readFileSync(join(sourceRoot, 'command_router.gd'), 'utf8');
const pluginSource = readFileSync(join(sourceRoot, 'plugin.gd'), 'utf8');
const runtimeSource = readFileSync(join(sourceRoot, 'runtime_bridge.gd'), 'utf8');

for (const commandFile of [
  'project_commands.gd',
  'scene_commands.gd',
  'node_commands.gd',
  'script_commands.gd',
  'editor_commands.gd',
  'input_commands.gd',
  'runtime_commands.gd',
  'animation_commands.gd',
  'tilemap_commands.gd',
  'ui_theme_commands.gd',
  'physics_commands.gd',
  'navigation_commands.gd',
  'audio_commands.gd',
  'visual_commands.gd',
  'qa_commands.gd',
]) {
  assert.ok(existsSync(join(sourceRoot, 'commands', commandFile)), `Missing routed command file: ${commandFile}`);
  assert.match(routerSource, new RegExp(commandFile.replace('.', '\\.')), `command_router.gd must preload ${commandFile}`);
}

assert.match(pluginSource, /WebSocketPeer/, 'plugin.gd must use Godot WebSocketPeer');
assert.match(pluginSource, /ws:\/\/127\.0\.0\.1/, 'plugin.gd must default to localhost WebSocket bridge');
assert.match(routerSource, /func dispatch_command/, 'command_router.gd must expose dispatch_command');
assert.match(routerSource, /"unknown_command"/, 'command_router.gd must return structured unknown command errors');
assert.match(runtimeSource, /class_name GodotDevtoolRuntimeBridge/, 'runtime bridge must expose class_name GodotDevtoolRuntimeBridge');
assert.match(runtimeSource, /get_game_scene_tree/, 'runtime bridge must implement runtime scene tree route');

console.log('Verified v2 Godot plugin router source and build output.');
