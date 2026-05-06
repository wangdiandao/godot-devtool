import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { installEditorBridge, readEditorBridgeStatus } = await import('../build/godot/editorBridge.js');
const { getWsBridge } = await import('../build/server/transports/wsBridge.js');

const addonRoot = join(process.cwd(), 'build', 'addons', 'godot_devtool');
const sourceRoot = join(process.cwd(), 'src', 'addons', 'godot_devtool');
const projectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-plugin-'));

try {
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

  await writeFile(
    join(projectPath, 'project.godot'),
    [
      '[application]',
      'config/name="godot-devtool Plugin Verify"',
      '',
    ].join('\n'),
    'utf8'
  );

  const install = await installEditorBridge(projectPath, { overwrite: true, websocketPort: 8766 });
  assert.equal(install.bridge.mode, 'websocket');
  assert.equal(install.bridge.port, 8766);
  assert.ok(install.changedFiles.includes('addons/godot_devtool/plugin.cfg'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/plugin.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/command_router.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/runtime_bridge.gd'));
  assert.ok(existsSync(join(projectPath, 'addons', 'godot_devtool', 'commands', 'runtime_commands.gd')));

  const projectFile = await readFile(join(projectPath, 'project.godot'), 'utf8');
  assert.match(projectFile, /DevtoolRuntime="\*res:\/\/addons\/godot_devtool\/runtime_bridge\.gd"/);

  const status = await readEditorBridgeStatus(projectPath);
  assert.equal(status.installed, true);
  assert.equal(status.bridge.mode, 'websocket');
  assert.equal(status.bridge.port, 8766);
  assert.equal(status.runtime.installed, true);
  assert.equal(status.runtime.transport, 'runtime_ws');

  const installedPluginSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'plugin.gd'), 'utf8');
  const installedRuntimeSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime_bridge.gd'), 'utf8');
  assert.match(installedPluginSource, /dispatch_command/);
  assert.match(installedRuntimeSource, /simulate_action/);
  assert.match(installedRuntimeSource, /get_game_node_properties/);
  assert.match(installedRuntimeSource, /get_game_screenshot/);

  console.log('Verified Godot plugin router source, build output, and project installation.');
} finally {
  await getWsBridge().stop();
  await rm(projectPath, { recursive: true, force: true });
}
