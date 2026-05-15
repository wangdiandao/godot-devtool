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
    assertUtf8NoBom(join(root, 'plugin.cfg'));
    assert.ok(existsSync(join(root, 'plugin.gd')), `Missing plugin.gd in ${root}`);
    assert.ok(existsSync(join(root, 'command_router.gd')), `Missing command_router.gd in ${root}`);
    assert.ok(existsSync(join(root, 'runtime_bridge.gd')), `Missing runtime_bridge.gd in ${root}`);
    assert.ok(existsSync(join(root, 'editor', 'editor_bridge_client.gd')), `Missing editor bridge client in ${root}`);
    assert.ok(existsSync(join(root, 'editor', 'status_dock.gd')), `Missing status dock in ${root}`);
    assert.ok(existsSync(join(root, 'runtime', 'runtime_client.gd')), `Missing runtime client in ${root}`);
    assert.ok(existsSync(join(root, 'runtime', 'runtime_state_store.gd')), `Missing runtime state store in ${root}`);
  }

  const routerSource = readFileSync(join(sourceRoot, 'command_router.gd'), 'utf8');
  const pluginEntrySource = readFileSync(join(sourceRoot, 'plugin.gd'), 'utf8');
  const pluginConfigSource = readFileSync(join(sourceRoot, 'plugin.cfg'), 'utf8');
  const runtimeSource = readFileSync(join(sourceRoot, 'runtime_bridge.gd'), 'utf8');
  const editorClientSource = readFileSync(join(sourceRoot, 'editor', 'editor_bridge_client.gd'), 'utf8');
  const statusDockSource = readFileSync(join(sourceRoot, 'editor', 'status_dock.gd'), 'utf8');
  const runtimeClientSource = readFileSync(join(sourceRoot, 'runtime', 'runtime_client.gd'), 'utf8');
  const runtimeStateStoreSource = readFileSync(join(sourceRoot, 'runtime', 'runtime_state_store.gd'), 'utf8');
  const editorBridgeSource = [pluginEntrySource, editorClientSource, statusDockSource].join('\n');
  const pluginSource = editorBridgeSource;
  const runtimeBridgeSource = [runtimeSource, runtimeClientSource, runtimeStateStoreSource].join('\n');

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

  assert.match(pluginSource, /EditorBridgeClient/, 'plugin.gd must delegate to the editor bridge client');
  assert.match(runtimeSource, /RuntimeClient/, 'runtime_bridge.gd must delegate to the runtime client');
  assert.match(editorBridgeSource, /WebSocketPeer/, 'editor bridge client must use Godot WebSocketPeer');
  assert.match(editorBridgeSource, new RegExp(`PLUGIN_VERSION := "${escapedReleaseVersion}"`), `editor bridge client must report plugin version ${releaseVersion}`);
  assert.match(runtimeBridgeSource, new RegExp(`PLUGIN_VERSION := "${escapedReleaseVersion}"`), `runtime client must report plugin version ${releaseVersion}`);
  assert.match(pluginConfigSource, new RegExp(`version="${escapedReleaseVersion}"`), `plugin.cfg must report plugin version ${releaseVersion}`);
  assert.match(editorBridgeSource, /ws:\/\/127\.0\.0\.1/, 'editor bridge client must default to localhost WebSocket bridge');
  assert.match(editorBridgeSource, /add_control_to_dock/, 'editor bridge client must expose an editor dock for MCP status');
  assert.match(statusDockSource, /name = "GDT"/, 'status dock tab title must be GDT');
  assert.match(statusDockSource, /title\.text = "GDT"/, 'status dock heading must be GDT');
  assert.match(editorBridgeSource, /HANDSHAKE_PROTOCOL_VERSION/, 'editor bridge client must declare a versioned handshake protocol');
  assert.match(editorBridgeSource, /_session_id/, 'editor bridge client must include a stable editor session id in hello messages');
  assert.match(editorBridgeSource, /hello_ack/, 'editor bridge client must wait for a server hello_ack');
  assert.match(editorBridgeSource, /_hello_acknowledged/, 'editor bridge client must expose handshake acknowledgement state');
  assert.match(editorBridgeSource, /_last_heartbeat_ms/, 'editor bridge client must track heartbeat-backed registration state');
  assert.match(editorBridgeSource, /handshake_label/, 'status dock must show handshake state separately from socket state');
  assert.match(editorBridgeSource, /_primary_status_label/, 'status dock must show a primary bridge status summary');
  assert.match(editorBridgeSource, /_runtime_status_label/, 'status dock must show runtime bridge status separately from editor bridge status');
  assert.match(editorBridgeSource, /_connection_summary_label/, 'status dock must show a compact agent and instance summary');
  assert.match(editorBridgeSource, /frontend_status/, 'editor bridge client must request broker status for agent and instance counts');
  assert.match(editorBridgeSource, /frontend_status_ack/, 'editor bridge client must consume broker status acknowledgements');
  assert.match(editorBridgeSource, /_agent_count/, 'status dock must derive connected agent count from broker status');
  assert.match(editorBridgeSource, /_runtime_instance_count/, 'status dock must derive active runtime instance count from broker status');
  assert.match(editorBridgeSource, /_editor_diagnostics_text/, 'status dock must keep editor transport/session diagnostics available without persistent rows');
  assert.match(editorBridgeSource, /_runtime_diagnostics_text/, 'status dock must keep runtime session diagnostics available without persistent rows');
  assert.match(editorBridgeSource, /_activity_summary/, 'status dock must collapse command and receipt details into one activity row');
  assert.match(statusDockSource, /OVERRUN_TRIM_ELLIPSIS/, 'status dock must keep compact rows single-line with ellipsis overflow');
  assert.doesNotMatch(statusDockSource, /_create_status_section/, 'status dock must not show verbose persistent sections by default');
  assert.doesNotMatch(statusDockSource, /labels\["transport"\]|labels\["broker"\]|labels\["runtime_session"\]|labels\["last_error"\]/, 'status dock must not allocate persistent diagnostic rows for transport, broker, runtime session, or last error');
  assert.match(statusDockSource, /_create_status_dot/, 'status dock must include visual status dots');
  assert.match(editorBridgeSource, /TranslationServer\.get_locale/, 'editor bridge client must read the Godot engine locale');
  assert.match(editorBridgeSource, /normalized_locale == "zh"/, 'editor bridge client must detect generic Chinese locales used by the Godot editor');
  assert.match(editorBridgeSource, /zh_cn|zh_hans|zh_sg/, 'editor bridge client must detect explicit Simplified Chinese locales');
  assert.match(editorBridgeSource, /MCP Server/, 'status dock must label MCP server state');
  assert.match(editorBridgeSource, /Ready via stdio/, 'status dock must clarify MCP server availability is via stdio');
  assert.match(editorBridgeSource, /Editor Bridge/, 'status dock must label the editor bridge separately');
  assert.match(editorBridgeSource, /Runtime Bridge/, 'status dock must label the runtime bridge separately');
  assert.match(editorBridgeSource, /Agent/, 'status dock must include an Agent count label');
  assert.match(editorBridgeSource, /Instance/, 'status dock must include an instance count label');
  assert.match(editorBridgeSource, /Waiting for game/, 'status dock must explain runtime bridge idle state without implying MCP failure');
  assert.match(editorBridgeSource, /RUNTIME_STATE_STALE_SECONDS/, 'status dock must age out stale runtime-state files');
  assert.match(editorBridgeSource, /Stale/, 'status dock must show stale runtime state distinctly from a live runtime');
  assert.match(editorBridgeSource, /Transport/, 'status dock must keep WebSocket transport diagnostics in tooltips');
  assert.match(editorBridgeSource, /Current Scene/, 'status dock must show the current edited scene');
  assert.match(editorBridgeSource, /Selection/, 'status dock must show the current editor selection');
  assert.match(editorBridgeSource, /Live Edits/, 'status dock must show whether live editor mutations are available');
  assert.match(editorBridgeSource, /Save Mode/, 'status dock must show the editor save strategy');
  assert.match(editorBridgeSource, /Manual by default/, 'status dock must make manual-save behavior explicit');
  assert.match(editorBridgeSource, /Runtime Session/, 'status dock must show runtime session diagnostics');
  assert.match(editorBridgeSource, /Last Runtime Seen/, 'status dock must show runtime state freshness');
  assert.match(editorBridgeSource, /Activity/, 'status dock must group command and receipt details in a compact Activity row');
  assert.match(editorBridgeSource, /Last Result/, 'status dock must show the latest command result');
  assert.doesNotMatch(editorBridgeSource, /_save_scene_button/, 'status dock must not expose a persistent Save Scene button');
  assert.match(pluginSource, /MCP (服务|\\u670d\\u52a1)/, 'plugin.gd status dock must include Simplified Chinese server label');
  assert.match(pluginSource, /(通过 stdio 就绪|\\u901a\\u8fc7 stdio \\u5c31\\u7eea)/, 'plugin.gd status dock must include Simplified Chinese stdio availability text');
  assert.match(pluginSource, /(编辑器桥接|\\u7f16\\u8f91\\u5668\\u6865\\u63a5)/, 'plugin.gd status dock must include Simplified Chinese editor bridge label');
  assert.match(pluginSource, /(运行时桥接|\\u8fd0\\u884c\\u65f6\\u6865\\u63a5)/, 'plugin.gd status dock must include Simplified Chinese runtime bridge label');
  assert.match(pluginSource, /(连接状态|\\u8fde\\u63a5\\u72b6\\u6001)/, 'plugin.gd status dock must include Simplified Chinese connection summary label');
  assert.match(pluginSource, /(实例|\\u5b9e\\u4f8b)/, 'plugin.gd status dock must include Simplified Chinese instance count label');
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
  assertEditorEnterTreeInitiatesConnection(editorClientSource, 'enter_tree');
  assertConnectThrottleAllowsFirstAttempt(editorClientSource, 'editor bridge client');
  assertDockStatusUpdatesAreStable(editorClientSource, 'process');
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
  assert.match(runtimeBridgeSource, /class_name GodotDevtoolRuntimeBridge/, 'runtime bridge must expose class_name GodotDevtoolRuntimeBridge');
  assert.match(runtimeBridgeSource, /"type": "hello"/, 'runtime client must send a hello registration message');
  assert.match(runtimeBridgeSource, /"context": "runtime"/, 'runtime client must register with context runtime');
  assert.match(runtimeBridgeSource, /CONFIG_PATH := "res:\/\/\.godot-devtool\/bridge-config\.json"/, 'runtime client must read the installed WebSocket bridge config');
  assert.match(runtimeBridgeSource, /STATE_PATH := "res:\/\/\.godot-devtool\/runtime-state\.json"/, 'runtime state store must write diagnostic runtime state');
  assert.match(runtimeBridgeSource, /_load_config/, 'runtime client must load the active bridge URL instead of hard-coding the development port');
  assert.match(runtimeBridgeSource, /_write_runtime_state/, 'runtime client must expose connection and handshake diagnostics while the game runs');
  assert.match(runtimeBridgeSource, /helloAttempts/, 'runtime bridge state must include hello attempt diagnostics');
  assertRuntimeReadyConnectsBeforeStateWrite(runtimeClientSource, 'ready');
  assertConnectThrottleAllowsFirstAttempt(runtimeClientSource, 'runtime client');
  assertRuntimeScreenshotHandlesUnavailableImage(runtimeCommandSource);
  assert.match(runtimeBridgeSource, /get_game_scene_tree/, 'runtime bridge must implement runtime scene tree route');
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
  assert.ok(install.changedFiles.includes('addons/godot_devtool/editor/editor_bridge_client.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/editor/status_dock.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/runtime/runtime_client.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/runtime/runtime_state_store.gd'));
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
  assertUtf8NoBom(join(projectPath, 'addons', 'godot_devtool', 'plugin.cfg'));
  const installedRuntimeSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime_bridge.gd'), 'utf8');
  const installedEditorClientSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'editor', 'editor_bridge_client.gd'), 'utf8');
  const installedStatusDockSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'editor', 'status_dock.gd'), 'utf8');
  const installedRuntimeClientSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime', 'runtime_client.gd'), 'utf8');
  const installedRuntimeStateStoreSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime', 'runtime_state_store.gd'), 'utf8');
  const installedRuntimeCommandSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'commands', 'runtime_commands.gd'), 'utf8');
  const installedEditorBridgeSource = [installedPluginSource, installedEditorClientSource, installedStatusDockSource].join('\n');
  const installedRuntimeBridgeSource = [installedRuntimeSource, installedRuntimeClientSource, installedRuntimeStateStoreSource].join('\n');
  assert.match(installedEditorBridgeSource, /dispatch_command/);
  assert.match(installedRuntimeBridgeSource, /simulate_action/);
  assert.match(installedRuntimeBridgeSource, /get_game_node_properties/);
  assert.match(installedRuntimeBridgeSource, /get_game_screenshot/);
  assert.match(installedRuntimeBridgeSource, /"context": "runtime"/);
  assertEditorEnterTreeInitiatesConnection(installedEditorClientSource, 'enter_tree');
  assertConnectThrottleAllowsFirstAttempt(installedEditorClientSource, 'installed editor bridge client');
  assertDockStatusUpdatesAreStable(installedEditorClientSource, 'process');
  assertRuntimeReadyConnectsBeforeStateWrite(installedRuntimeClientSource, 'ready');
  assertConnectThrottleAllowsFirstAttempt(installedRuntimeClientSource, 'installed runtime client');
  assertRuntimeScreenshotHandlesUnavailableImage(installedRuntimeCommandSource);

  console.log('Verified Godot plugin router source, build output, and project installation.');
} finally {
  await getWsBridge().stop();
  await rm(projectPath, { recursive: true, force: true });
}

function assertUtf8NoBom(filePath) {
  const bytes = readFileSync(filePath);
  assert.notDeepEqual(
    Array.from(bytes.subarray(0, 3)),
    [0xef, 0xbb, 0xbf],
    `${filePath} must be UTF-8 without BOM so Godot can read the [plugin] script field`
  );
}

function assertNoUntypedInferenceHazards(root) {
  const files = [
    join(root, 'plugin.gd'),
    join(root, 'runtime_bridge.gd'),
    join(root, 'editor', 'editor_bridge_client.gd'),
    join(root, 'editor', 'status_dock.gd'),
    join(root, 'runtime', 'runtime_client.gd'),
    join(root, 'runtime', 'runtime_state_store.gd'),
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

function assertRuntimeReadyConnectsBeforeStateWrite(source, functionName = '_ready') {
  const readyBody = extractGdscriptFunctionBody(source, functionName);
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

function assertEditorEnterTreeInitiatesConnection(source, functionName = '_enter_tree') {
  const enterTreeBody = extractGdscriptFunctionBody(source, functionName);
  assert.ok(enterTreeBody.includes('_load_config()'), 'plugin.gd _enter_tree must load bridge config before connecting');
  assert.ok(enterTreeBody.includes('_try_connect()'), 'plugin.gd _enter_tree must initiate the first WebSocket connection');
  assert.ok(
    enterTreeBody.indexOf('_load_config()') < enterTreeBody.indexOf('_try_connect()'),
    'plugin.gd _enter_tree must load config before initiating the first connection'
  );
  assert.ok(
    enterTreeBody.indexOf('_try_connect()') < enterTreeBody.indexOf('_create_status_dock()'),
    'plugin.gd _enter_tree must start connecting before building the status dock'
  );
}

function assertConnectThrottleAllowsFirstAttempt(source, label) {
  const tryConnectBody = extractGdscriptFunctionBody(source, '_try_connect');
  assert.ok(
    tryConnectBody.includes('_last_connect_attempt_ms > 0'),
    `${label} _try_connect must not throttle the first connection attempt after startup`
  );
  assert.ok(
    tryConnectBody.indexOf('_last_connect_attempt_ms > 0') < tryConnectBody.indexOf('now - _last_connect_attempt_ms < 1000'),
    `${label} _try_connect must check for a previous attempt before applying retry throttling`
  );
}

function assertDockStatusUpdatesAreStable(source, processFunctionName = '_process') {
  assert.match(source, /STATUS_REFRESH_INTERVAL_MS := \d+/, 'plugin.gd dock status refresh must be throttled');
  const processBody = extractGdscriptFunctionBody(source, processFunctionName);
  assert.ok(
    processBody.trimEnd().endsWith('_update_status_panel_if_due()'),
    'plugin.gd _process must use a throttled status-panel refresh instead of rewriting the dock every frame'
  );

  const throttledBody = extractGdscriptFunctionBody(source, '_update_status_panel_if_due');
  assert.ok(throttledBody.includes('Time.get_ticks_msec()'), 'plugin.gd throttled status refresh must use monotonic time');
  assert.ok(throttledBody.includes('STATUS_REFRESH_INTERVAL_MS'), 'plugin.gd throttled status refresh must honor STATUS_REFRESH_INTERVAL_MS');
  assert.ok(throttledBody.includes('_update_status_panel()'), 'plugin.gd throttled status refresh must still update the dock when due');

  const labelBody = extractGdscriptFunctionBody(source, '_set_label_text');
  assert.ok(labelBody.includes('label.text == next_text'), 'plugin.gd dock label updates must be idempotent');
  assert.ok(
    labelBody.indexOf('label.text == next_text') < labelBody.indexOf('label.text = next_text'),
    'plugin.gd dock labels must avoid assigning unchanged text'
  );

  const statusTextBody = extractGdscriptFunctionBody(source, '_set_status_text');
  assert.ok(statusTextBody.includes('_set_label_text'), 'plugin.gd status rows must use the idempotent label setter');

  const dotBody = extractGdscriptFunctionBody(source, '_set_status_dot');
  assert.ok(dotBody.includes('next_color'), 'plugin.gd dock status dots must compute the next color before assignment');
  assert.ok(dotBody.includes('dot.color == next_color'), 'plugin.gd dock status dots must avoid assigning unchanged colors');

  const updateBody = extractGdscriptFunctionBody(source, '_update_status_panel');
  assert.ok(updateBody.includes('_set_button_text'), 'plugin.gd dock buttons must use idempotent text/tooltip updates');
  assert.ok(updateBody.includes('_set_label_tooltip'), 'plugin.gd compact dock must keep diagnostics available through label tooltips');
  assert.ok(updateBody.includes('_set_control_visible'), 'plugin.gd compact dock must hide empty optional rows');

  const tooltipBody = extractGdscriptFunctionBody(source, '_set_label_tooltip');
  assert.ok(tooltipBody.includes('label.tooltip_text == next_tooltip'), 'plugin.gd dock label tooltips must avoid assigning unchanged tooltip text');

  const visibilityBody = extractGdscriptFunctionBody(source, '_set_control_visible');
  assert.ok(visibilityBody.includes('control.visible == next_visible'), 'plugin.gd dock optional rows must avoid assigning unchanged visibility');

  const buttonBody = extractGdscriptFunctionBody(source, '_set_button_text');
  assert.ok(buttonBody.includes('button.text != next_text'), 'plugin.gd dock buttons must avoid assigning unchanged text');
  assert.ok(buttonBody.includes('button.tooltip_text != next_tooltip'), 'plugin.gd dock buttons must avoid assigning unchanged tooltips');
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
