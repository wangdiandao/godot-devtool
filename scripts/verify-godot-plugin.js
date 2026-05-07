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
  const pluginConfigSource = readFileSync(join(sourceRoot, 'plugin.cfg'), 'utf8');
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
  assert.match(pluginSource, /PLUGIN_VERSION := "2\.5\.2"/, 'plugin.gd must report plugin version 2.5.2');
  assert.match(pluginConfigSource, /version="2\.5\.2"/, 'plugin.cfg must report plugin version 2.5.2');
  assert.match(pluginSource, /ws:\/\/127\.0\.0\.1/, 'plugin.gd must default to localhost WebSocket bridge');
  assert.match(pluginSource, /add_control_to_dock/, 'plugin.gd must expose an editor dock for MCP status');
  assert.match(pluginSource, /_dock\.name = "GDT"/, 'plugin.gd dock tab title must be GDT');
  assert.match(pluginSource, /title\.text = "GDT"/, 'plugin.gd status dock heading must be GDT');
  assert.match(pluginSource, /HANDSHAKE_PROTOCOL_VERSION/, 'plugin.gd must declare a versioned handshake protocol');
  assert.match(pluginSource, /_session_id/, 'plugin.gd must include a stable editor session id in hello messages');
  assert.match(pluginSource, /hello_ack/, 'plugin.gd must wait for a server hello_ack');
  assert.match(pluginSource, /_hello_acknowledged/, 'plugin.gd must expose handshake acknowledgement state');
  assert.match(pluginSource, /_last_heartbeat_ms/, 'plugin.gd must track heartbeat-backed registration state');
  assert.match(pluginSource, /handshake_label/, 'plugin.gd status dock must show handshake state separately from socket state');
  assert.match(pluginSource, /TranslationServer\.get_locale/, 'plugin.gd must read the Godot engine locale');
  assert.match(pluginSource, /normalized_locale == "zh"/, 'plugin.gd must detect generic Chinese locales used by the Godot editor');
  assert.match(pluginSource, /zh_cn|zh_hans|zh_sg/, 'plugin.gd must detect explicit Simplified Chinese locales');
  assert.match(pluginSource, /MCP Server/, 'plugin.gd status dock must label MCP server state');
  assert.match(pluginSource, /MCP (服务|\\u670d\\u52a1)/, 'plugin.gd status dock must include Simplified Chinese server label');
  assert.match(pluginSource, /Reconnect/, 'plugin.gd status dock must expose a reconnect action');
  assert.match(pluginSource, /(重新连接|\\u91cd\\u65b0\\u8fde\\u63a5)/, 'plugin.gd status dock must include Simplified Chinese reconnect action');
  assert.match(pluginSource, /_refresh_button/, 'plugin.gd status dock must expose a refresh button');
  assert.match(pluginSource, /_refresh_status/, 'plugin.gd status dock must implement immediate status refresh');
  assert.match(pluginSource, /Refresh/, 'plugin.gd status dock must expose a refresh action');
  assert.match(pluginSource, /(刷新状态|\\u5237\\u65b0\\u72b6\\u6001)/, 'plugin.gd status dock must include Simplified Chinese refresh action');
  assert.match(pluginSource, /Last Command/, 'plugin.gd status dock must show the most recent command');
  assert.match(pluginSource, /(最近命令|\\u6700\\u8fd1\\u547d\\u4ee4)/, 'plugin.gd status dock must include Simplified Chinese command label');
  assert.match(routerSource, /func dispatch_command/, 'command_router.gd must expose dispatch_command');
  assert.match(routerSource, /"unknown_command"/, 'command_router.gd must return structured unknown command errors');
  assert.match(runtimeSource, /class_name GodotDevtoolRuntimeBridge/, 'runtime bridge must expose class_name GodotDevtoolRuntimeBridge');
  assert.match(runtimeSource, /"type": "hello"/, 'runtime bridge must send a hello registration message');
  assert.match(runtimeSource, /"context": "runtime"/, 'runtime bridge must register with context runtime');
  assert.match(runtimeSource, /CONFIG_PATH := "res:\/\/\.godot-devtool\/bridge-config\.json"/, 'runtime bridge must read the installed WebSocket bridge config');
  assert.match(runtimeSource, /STATE_PATH := "res:\/\/\.godot-devtool\/runtime-state\.json"/, 'runtime bridge must write diagnostic runtime state');
  assert.match(runtimeSource, /_load_config/, 'runtime bridge must load the active bridge URL instead of hard-coding the development port');
  assert.match(runtimeSource, /_write_runtime_state/, 'runtime bridge must expose connection and handshake diagnostics while the game runs');
  assert.match(runtimeSource, /helloAttempts/, 'runtime bridge state must include hello attempt diagnostics');
  assert.match(runtimeSource, /get_game_scene_tree/, 'runtime bridge must implement runtime scene tree route');
  assertNoUntypedInferenceHazards(sourceRoot);

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
  assert.match(installedRuntimeSource, /"context": "runtime"/);

  console.log('Verified Godot plugin router source, build output, and project installation.');
} finally {
  await getWsBridge().stop();
  await rm(projectPath, { recursive: true, force: true });
}

function assertNoUntypedInferenceHazards(root) {
  const files = [
    join(root, 'plugin.gd'),
    join(root, 'runtime_bridge.gd'),
    join(root, 'commands', 'runtime_commands.gd'),
  ];
  const hazards = [
    /\bvar\s+\w+\s*:=\s*\w+\.get\("payload"/,
    /\bvar\s+\w+\s*:=\s*.*\.get_image\(\)/,
    /\bvar\s+\w+\s*:=\s*.*\.save_png\(/,
  ];

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    for (const hazard of hazards) {
      assert.doesNotMatch(
        source,
        hazard,
        `${filePath} contains a Godot 4 unsafe inferred Variant assignment: ${hazard}`
      );
    }
  }
}
