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
const websocketPort = Number(process.env.GODOT_DEVTOOL_VERIFY_PLUGIN_WS_PORT ?? 18767);
const releaseVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version;
const escapedReleaseVersion = releaseVersion.replaceAll('.', '\\.');

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
  assert.match(pluginSource, new RegExp(`PLUGIN_VERSION := "${escapedReleaseVersion}"`), `plugin.gd must report plugin version ${releaseVersion}`);
  assert.match(pluginConfigSource, new RegExp(`version="${escapedReleaseVersion}"`), `plugin.cfg must report plugin version ${releaseVersion}`);
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
  assert.match(pluginSource, /_primary_status_label/, 'plugin.gd status dock must show a primary bridge status summary');
  assert.match(pluginSource, /_runtime_status_label/, 'plugin.gd status dock must show runtime bridge status separately from editor bridge status');
  assert.match(pluginSource, /_transport_label/, 'plugin.gd status dock must show transport details separately from MCP server availability');
  assert.match(pluginSource, /_create_status_section/, 'plugin.gd status dock must group status rows into readable sections');
  assert.match(pluginSource, /_create_status_dot/, 'plugin.gd status dock must include visual status dots');
  assert.match(pluginSource, /TranslationServer\.get_locale/, 'plugin.gd must read the Godot engine locale');
  assert.match(pluginSource, /normalized_locale == "zh"/, 'plugin.gd must detect generic Chinese locales used by the Godot editor');
  assert.match(pluginSource, /zh_cn|zh_hans|zh_sg/, 'plugin.gd must detect explicit Simplified Chinese locales');
  assert.match(pluginSource, /MCP Server/, 'plugin.gd status dock must label MCP server state');
  assert.match(pluginSource, /Ready via stdio/, 'plugin.gd status dock must clarify MCP server availability is via stdio');
  assert.match(pluginSource, /Editor Bridge/, 'plugin.gd status dock must label the editor bridge separately');
  assert.match(pluginSource, /Runtime Bridge/, 'plugin.gd status dock must label the runtime bridge separately');
  assert.match(pluginSource, /Waiting for game/, 'plugin.gd status dock must explain runtime bridge idle state without implying MCP failure');
  assert.match(pluginSource, /Transport/, 'plugin.gd status dock must label WebSocket as transport details');
  assert.match(pluginSource, /Live Editor/, 'plugin.gd status dock must include a live editor section');
  assert.match(pluginSource, /Current Scene/, 'plugin.gd status dock must show the current edited scene');
  assert.match(pluginSource, /Selection/, 'plugin.gd status dock must show the current editor selection');
  assert.match(pluginSource, /Live Edits/, 'plugin.gd status dock must show whether live editor mutations are available');
  assert.match(pluginSource, /Save Mode/, 'plugin.gd status dock must show the editor save strategy');
  assert.match(pluginSource, /Manual by default/, 'plugin.gd status dock must make manual-save behavior explicit');
  assert.match(pluginSource, /Runtime Session/, 'plugin.gd status dock must show runtime session diagnostics');
  assert.match(pluginSource, /Last Runtime Seen/, 'plugin.gd status dock must show runtime state freshness');
  assert.match(pluginSource, /Activity/, 'plugin.gd status dock must group command and receipt details under Activity');
  assert.match(pluginSource, /Last Result/, 'plugin.gd status dock must show the latest command result');
  assert.doesNotMatch(pluginSource, /_save_scene_button/, 'plugin.gd dock must not expose a persistent Save Scene button');
  assert.match(pluginSource, /MCP (服务|\\u670d\\u52a1)/, 'plugin.gd status dock must include Simplified Chinese server label');
  assert.match(pluginSource, /(通过 stdio 就绪|\\u901a\\u8fc7 stdio \\u5c31\\u7eea)/, 'plugin.gd status dock must include Simplified Chinese stdio availability text');
  assert.match(pluginSource, /(编辑器桥接|\\u7f16\\u8f91\\u5668\\u6865\\u63a5)/, 'plugin.gd status dock must include Simplified Chinese editor bridge label');
  assert.match(pluginSource, /(运行时桥接|\\u8fd0\\u884c\\u65f6\\u6865\\u63a5)/, 'plugin.gd status dock must include Simplified Chinese runtime bridge label');
  assert.match(pluginSource, /(等待游戏运行|\\u7b49\\u5f85\\u6e38\\u620f\\u8fd0\\u884c)/, 'plugin.gd status dock must include Simplified Chinese runtime waiting text');
  assert.match(pluginSource, /(实时编辑器|\\u5b9e\\u65f6\\u7f16\\u8f91\\u5668)/, 'plugin.gd status dock must include Simplified Chinese live editor label');
  assert.match(pluginSource, /(当前场景|\\u5f53\\u524d\\u573a\\u666f)/, 'plugin.gd status dock must include Simplified Chinese current scene label');
  assert.match(pluginSource, /(保存模式|\\u4fdd\\u5b58\\u6a21\\u5f0f)/, 'plugin.gd status dock must include Simplified Chinese save mode label');
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
  for (const liveEditorCommand of [
    'editor_add_node',
    'editor_delete_node',
    'editor_rename_node',
    'editor_move_node',
    'editor_duplicate_node',
    'editor_save_scene',
  ]) {
    assert.match(
      readFileSync(join(sourceRoot, 'commands', 'editor_commands.gd'), 'utf8'),
      new RegExp(`"${liveEditorCommand}"`),
      `editor_commands.gd must route ${liveEditorCommand}`
    );
  }
  const editorCommandSource = readFileSync(join(sourceRoot, 'commands', 'editor_commands.gd'), 'utf8');
  const runtimeCommandSource = readFileSync(join(sourceRoot, 'commands', 'runtime_commands.gd'), 'utf8');
  assert.match(editorCommandSource, /create_action\("godot-devtool add node"\)/, 'live editor add node must use UndoRedo');
  assert.match(editorCommandSource, /create_action\("godot-devtool delete node"\)/, 'live editor delete node must use UndoRedo');
  assert.match(editorCommandSource, /save_scene\(\)/, 'live editor save must call the editor save_scene API');
  assert.match(editorCommandSource, /edited\.get_path\(\)/, 'live editor node resolution must accept editor absolute node paths');
  assert.match(runtimeSource, /class_name GodotDevtoolRuntimeBridge/, 'runtime bridge must expose class_name GodotDevtoolRuntimeBridge');
  assert.match(runtimeSource, /"type": "hello"/, 'runtime bridge must send a hello registration message');
  assert.match(runtimeSource, /"context": "runtime"/, 'runtime bridge must register with context runtime');
  assert.match(runtimeSource, /CONFIG_PATH := "res:\/\/\.godot-devtool\/bridge-config\.json"/, 'runtime bridge must read the installed WebSocket bridge config');
  assert.match(runtimeSource, /STATE_PATH := "res:\/\/\.godot-devtool\/runtime-state\.json"/, 'runtime bridge must write diagnostic runtime state');
  assert.match(runtimeSource, /_load_config/, 'runtime bridge must load the active bridge URL instead of hard-coding the development port');
  assert.match(runtimeSource, /_write_runtime_state/, 'runtime bridge must expose connection and handshake diagnostics while the game runs');
  assert.match(runtimeSource, /helloAttempts/, 'runtime bridge state must include hello attempt diagnostics');
  assertRuntimeReadyConnectsBeforeStateWrite(runtimeSource);
  assertRuntimeScreenshotHandlesUnavailableImage(runtimeCommandSource);
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

  const install = await installEditorBridge(projectPath, { overwrite: true, websocketPort });
  assert.equal(install.bridge.mode, 'websocket');
  assert.equal(install.bridge.port, websocketPort);
  assert.ok(install.bridge.authToken);
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
  assert.equal(status.bridge.port, websocketPort);
  assert.equal(status.runtime.installed, true);
  assert.equal(status.runtime.transport, 'runtime_ws');

  const installedPluginSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'plugin.gd'), 'utf8');
  const installedRuntimeSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime_bridge.gd'), 'utf8');
  const installedRuntimeCommandSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'commands', 'runtime_commands.gd'), 'utf8');
  assert.match(installedPluginSource, /dispatch_command/);
  assert.match(installedRuntimeSource, /simulate_action/);
  assert.match(installedRuntimeSource, /get_game_node_properties/);
  assert.match(installedRuntimeSource, /get_game_screenshot/);
  assert.match(installedRuntimeSource, /"context": "runtime"/);
  assertRuntimeReadyConnectsBeforeStateWrite(installedRuntimeSource);
  assertRuntimeScreenshotHandlesUnavailableImage(installedRuntimeCommandSource);

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

function assertRuntimeReadyConnectsBeforeStateWrite(source) {
  const readyBody = extractGdscriptFunctionBody(source, '_ready');
  assert.ok(readyBody.includes('_load_config()'), 'runtime bridge _ready must load bridge config before connecting');
  assert.ok(readyBody.includes('_try_connect()'), 'runtime bridge _ready must initiate the first WebSocket connection');
  assert.ok(
    readyBody.indexOf('_load_config()') < readyBody.indexOf('_try_connect()'),
    'runtime bridge _ready must load config before initiating the first connection'
  );
  assert.ok(
    readyBody.indexOf('_try_connect()') < readyBody.indexOf('_write_runtime_state()'),
    'runtime bridge _ready must attempt the first connection before writing runtime state'
  );
}

function assertRuntimeScreenshotHandlesUnavailableImage(source) {
  const screenshotBody = extractGdscriptFunctionBody(source, '_screenshot');
  assert.ok(screenshotBody.includes('DisplayServer.get_name()'), 'runtime screenshot must detect headless display mode before reading the viewport texture');
  assert.ok(
    screenshotBody.indexOf('DisplayServer.get_name()') < screenshotBody.indexOf('get_texture().get_image()'),
    'runtime screenshot must reject headless display mode before get_image'
  );
  assert.ok(screenshotBody.includes('get_texture().get_image()'), 'runtime screenshot must capture the viewport image');
  assert.ok(screenshotBody.includes('image == null'), 'runtime screenshot must handle unavailable headless viewport images');
  assert.ok(
    screenshotBody.indexOf('image == null') > screenshotBody.indexOf('get_texture().get_image()'),
    'runtime screenshot must check the captured image after get_image'
  );
  assert.ok(
    screenshotBody.indexOf('image == null') < screenshotBody.indexOf('image.save_png'),
    'runtime screenshot must reject unavailable images before save_png'
  );
}

function extractGdscriptFunctionBody(source, functionName) {
  const signature = `func ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing ${functionName} function`);
  const nextFunction = source.indexOf('\nfunc ', start + signature.length);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}
