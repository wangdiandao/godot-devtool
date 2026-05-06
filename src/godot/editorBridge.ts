import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { normalizeProjectRelativePath } from './filesystemTools.js';
import {
  assertWriteAllowed,
  buildDiffSummary,
  type DiffSummary,
  type WriteSafetyResult,
} from './safetyRecovery.js';
import { appendAuditEntry } from './workflowAutomation.js';

const PLUGIN_CFG_PATH = 'addons/godot_devtool_bridge/plugin.cfg';
const PLUGIN_SCRIPT_PATH = 'addons/godot_devtool_bridge/godot_devtool_bridge.gd';
const CONFIG_PATH = '.godot-devtool/bridge-config.json';
const STATE_PATH = '.godot-devtool/editor-state.json';
const COMMANDS_DIR = '.godot-devtool/editor-commands';
const RECEIPTS_DIR = '.godot-devtool/editor-receipts';
const DEFAULT_COMMAND_TIMEOUT_MS = 10000;

export type EditorBridgeMode = 'file' | 'http' | 'websocket';
export type EditorBridgeCommandType =
  | 'select_node'
  | 'undo'
  | 'redo'
  | 'inspector_get_properties'
  | 'inspector_set_properties'
  | string;

export interface EditorBridgeConfig {
  mode: EditorBridgeMode;
  instanceId: string;
  projectPath: string;
  commandsDir: string;
  receiptsDir: string;
  http: {
    host: string;
    port: number;
  };
  websocket: {
    host: string;
    port: number;
  };
}

export interface EditorBridgeInstallResult {
  changedFiles: string[];
  skippedFiles: string[];
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
  bridge: {
    mode: EditorBridgeMode;
    instanceId: string;
    configPath: string;
    commandsDir: string;
    receiptsDir: string;
  };
  plugin: {
    configPath: string;
    scriptPath: string;
    enableInGodot: string;
  };
}

export interface EditorBridgeCommand {
  commandId?: string;
  type: EditorBridgeCommandType;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface QueuedEditorBridgeCommand extends Required<EditorBridgeCommand> {
  commandPath: string;
  createdAt: string;
  createdAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  status: 'queued';
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
}

export interface EditorBridgeReceipt {
  commandId: string;
  type: EditorBridgeCommandType | string;
  status: 'completed' | 'failed' | 'expired';
  startedAt?: string;
  finishedAt: string;
  error?: string;
  result?: unknown;
}

export interface EditorBridgeStatus {
  installed: boolean;
  bridge: EditorBridgeConfig;
  instanceId: string;
  statePath: string;
  lastState: Record<string, unknown> | null;
  pendingCommands: number;
  pendingCommandDetails: QueuedEditorBridgeCommand[];
  expiredCommands: QueuedEditorBridgeCommand[];
  recentReceipts: EditorBridgeReceipt[];
}

export async function installEditorBridge(
  projectPath: string,
  options: { overwrite?: boolean; mode?: EditorBridgeMode; httpPort?: number; websocketPort?: number } = {}
): Promise<EditorBridgeInstallResult> {
  const bridge = await createOrReadBridgeConfig(projectPath, options);
  const files: Record<string, string> = {
    [CONFIG_PATH]: JSON.stringify(bridge, null, 2),
    [PLUGIN_CFG_PATH]: editorBridgePluginCfg(),
    [PLUGIN_SCRIPT_PATH]: editorBridgePluginScript(),
  };
  const changedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'install_editor_bridge',
    riskLevel: 'write',
    changes: Object.entries(files).map(([relativePath, content]) => ({
      path: relativePath,
      content,
      overwrite: options.overwrite === true,
    })),
  });
  const safety = await assertWriteAllowed(projectPath, {
    operation: 'install_editor_bridge',
    riskLevel: 'write',
    paths: Object.keys(files),
  });

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(projectPath, relativePath);
    if (existsSync(absolutePath) && options.overwrite !== true) {
      skippedFiles.push(relativePath);
      continue;
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
    changedFiles.push(relativePath);
  }

  await mkdir(join(projectPath, COMMANDS_DIR), { recursive: true });
  await mkdir(join(projectPath, RECEIPTS_DIR), { recursive: true });
  await appendAuditEntry(projectPath, {
    operation: 'install_editor_bridge',
    changedFiles,
    skippedFiles,
    details: { bridgeType: 'godot_editor_bridge', bridgeMode: bridge.mode, instanceId: bridge.instanceId },
  });

  return {
    changedFiles,
    skippedFiles,
    safety,
    diffSummary,
    bridge: {
      mode: bridge.mode,
      instanceId: bridge.instanceId,
      configPath: CONFIG_PATH,
      commandsDir: COMMANDS_DIR,
      receiptsDir: RECEIPTS_DIR,
    },
    plugin: {
      configPath: PLUGIN_CFG_PATH,
      scriptPath: PLUGIN_SCRIPT_PATH,
      enableInGodot: 'Project Settings > Plugins > godot-devtool Editor Bridge',
    },
  };
}

export async function readEditorBridgeStatus(projectPath: string): Promise<EditorBridgeStatus> {
  const bridge = await readBridgeConfig(projectPath);
  const stateAbsolutePath = join(projectPath, STATE_PATH);
  let lastState: Record<string, unknown> | null = null;

  if (existsSync(stateAbsolutePath)) {
    lastState = JSON.parse(await readFile(stateAbsolutePath, 'utf8'));
  }

  let pendingCommandDetails: QueuedEditorBridgeCommand[] = [];
  const commandsAbsoluteDir = join(projectPath, COMMANDS_DIR);
  if (existsSync(commandsAbsoluteDir)) {
    pendingCommandDetails = await readJsonFiles<QueuedEditorBridgeCommand>(projectPath, COMMANDS_DIR);
  }
  const nowMs = Date.now();
  const expiredCommands = pendingCommandDetails.filter((command) => command.expiresAtMs <= nowMs);
  const recentReceipts = await readJsonFiles<EditorBridgeReceipt>(projectPath, RECEIPTS_DIR, 20);

  return {
    installed: existsSync(join(projectPath, PLUGIN_CFG_PATH)) && existsSync(join(projectPath, PLUGIN_SCRIPT_PATH)),
    bridge,
    instanceId: bridge.instanceId,
    statePath: STATE_PATH,
    lastState,
    pendingCommands: pendingCommandDetails.length,
    pendingCommandDetails,
    expiredCommands,
    recentReceipts,
  };
}

export async function enqueueEditorCommand(
  projectPath: string,
  command: EditorBridgeCommand
): Promise<QueuedEditorBridgeCommand> {
  const commandId = command.commandId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timeoutMs = normalizeTimeout(command.timeoutMs);
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + timeoutMs;
  const commandPayload: QueuedEditorBridgeCommand = {
    commandId,
    type: command.type,
    payload: command.payload ?? {},
    timeoutMs,
    createdAt: new Date(createdAtMs).toISOString(),
    createdAtMs,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    status: 'queued',
    commandPath: normalizeProjectRelativePath(`${COMMANDS_DIR}/${commandId}.json`),
  };

  const absolutePath = join(projectPath, commandPayload.commandPath);
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: `editor_${command.type}`,
    riskLevel: 'write',
    changes: [{
      path: commandPayload.commandPath,
      content: JSON.stringify(commandPayload, null, 2),
      overwrite: false,
    }],
  });
  const safety = await assertWriteAllowed(projectPath, {
    operation: `editor_${command.type}`,
    riskLevel: 'write',
    paths: [commandPayload.commandPath],
  });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(commandPayload, null, 2), 'utf8');
  await appendAuditEntry(projectPath, {
    operation: `editor_${command.type}`,
    changedFiles: [commandPayload.commandPath],
    skippedFiles: [],
    details: commandPayload.payload,
  });

  return {
    ...commandPayload,
    safety,
    diffSummary,
  };
}

export async function waitForEditorCommandReceipt(
  projectPath: string,
  commandId: string,
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<EditorBridgeReceipt> {
  const receiptPath = join(projectPath, RECEIPTS_DIR, `${commandId}.json`);
  const commandPath = join(projectPath, COMMANDS_DIR, `${commandId}.json`);
  const deadline = Date.now() + normalizeTimeout(timeoutMs);

  while (Date.now() <= deadline) {
    if (existsSync(receiptPath)) {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as EditorBridgeReceipt;
      await rm(receiptPath, { force: true });
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await rm(commandPath, { force: true });
  return {
    commandId,
    type: 'timeout',
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error: `Timed out waiting for Godot editor bridge receipt after ${normalizeTimeout(timeoutMs)}ms. Ensure the Godot editor is open and the godot-devtool Editor Bridge plugin is enabled.`,
    result: null,
  };
}

async function createOrReadBridgeConfig(
  projectPath: string,
  options: { overwrite?: boolean; mode?: EditorBridgeMode; httpPort?: number; websocketPort?: number }
): Promise<EditorBridgeConfig> {
  const existing = await tryReadBridgeConfig(projectPath);
  const shouldApplyOptions = options.overwrite === true || !existing;
  const mode = shouldApplyOptions ? options.mode ?? existing?.mode ?? 'file' : existing.mode;
  if (!['file', 'http', 'websocket'].includes(mode)) {
    throw new Error(`Unsupported editor bridge mode: ${mode}`);
  }

  return {
    mode,
    instanceId: existing?.instanceId ?? createInstanceId(projectPath),
    projectPath,
    commandsDir: COMMANDS_DIR,
    receiptsDir: RECEIPTS_DIR,
    http: {
      host: existing?.http?.host ?? '127.0.0.1',
      port: shouldApplyOptions ? options.httpPort ?? existing?.http?.port ?? 8765 : existing.http.port,
    },
    websocket: {
      host: existing?.websocket?.host ?? '127.0.0.1',
      port: shouldApplyOptions ? options.websocketPort ?? existing?.websocket?.port ?? 8766 : existing.websocket.port,
    },
  };
}

async function readBridgeConfig(projectPath: string): Promise<EditorBridgeConfig> {
  return (await tryReadBridgeConfig(projectPath)) ?? createOrReadBridgeConfig(projectPath, {});
}

async function tryReadBridgeConfig(projectPath: string): Promise<EditorBridgeConfig | null> {
  const configAbsolutePath = join(projectPath, CONFIG_PATH);
  if (!existsSync(configAbsolutePath)) {
    return null;
  }

  const parsed = JSON.parse(await readFile(configAbsolutePath, 'utf8')) as Partial<EditorBridgeConfig>;
  return {
    mode: parsed.mode ?? 'file',
    instanceId: parsed.instanceId ?? createInstanceId(projectPath),
    projectPath: parsed.projectPath ?? projectPath,
    commandsDir: parsed.commandsDir ?? COMMANDS_DIR,
    receiptsDir: parsed.receiptsDir ?? RECEIPTS_DIR,
    http: {
      host: parsed.http?.host ?? '127.0.0.1',
      port: parsed.http?.port ?? 8765,
    },
    websocket: {
      host: parsed.websocket?.host ?? '127.0.0.1',
      port: parsed.websocket?.port ?? 8766,
    },
  };
}

async function readJsonFiles<T>(projectPath: string, directory: string, limit?: number): Promise<T[]> {
  const absoluteDirectory = join(projectPath, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const entries = (await readdir(absoluteDirectory))
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .slice(limit ? -limit : 0);
  const results: T[] = [];
  for (const entry of entries) {
    try {
      results.push(JSON.parse(await readFile(join(absoluteDirectory, entry), 'utf8')) as T);
    } catch {
      // Ignore corrupt bridge files. The editor will eventually replace or remove them.
    }
  }
  return results;
}

function createInstanceId(projectPath: string): string {
  const encodedProject = Buffer.from(projectPath).toString('base64url').slice(0, 16);
  return `editor-${encodedProject}-${Date.now().toString(36)}`;
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }
  return Math.max(100, Math.floor(timeoutMs));
}

function editorBridgePluginCfg(): string {
  return [
    '[plugin]',
    '',
    'name="godot-devtool Editor Bridge"',
    'description="File-based live editor bridge for godot-devtool MCP."',
    'author="godot-devtool"',
    'version="1.7.1"',
    'script="godot_devtool_bridge.gd"',
    '',
  ].join('\n');
}

function editorBridgePluginScript(): string {
  return [
    '@tool',
    'extends EditorPlugin',
    '',
    'const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"',
    'const STATE_PATH := "res://.godot-devtool/editor-state.json"',
    'const COMMANDS_DIR := "res://.godot-devtool/editor-commands"',
    'const RECEIPTS_DIR := "res://.godot-devtool/editor-receipts"',
    '',
    'func _enter_tree() -> void:',
    '\tDirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(COMMANDS_DIR))',
    '\tDirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(RECEIPTS_DIR))',
    '\tset_process(true)',
    '',
    'func _process(_delta: float) -> void:',
    '\t_write_state()',
    '\t_process_commands()',
    '',
    'func _write_state() -> void:',
    '\tvar selection := get_editor_interface().get_selection().get_selected_nodes()',
    '\tvar selected_paths: Array[String] = []',
    '\tfor node in selection:',
    '\t\tselected_paths.append(str(node.get_path()))',
    '\tvar scene := get_editor_interface().get_edited_scene_root()',
    '\tvar config := _read_config()',
    '\tvar state := {',
    '\t\t"updatedAt": Time.get_datetime_string_from_system(true),',
    '\t\t"instanceId": str(config.get("instanceId", "")),',
    '\t\t"bridgeMode": str(config.get("mode", "file")),',
    '\t\t"projectPath": ProjectSettings.globalize_path("res://"),',
    '\t\t"godotVersion": Engine.get_version_info(),',
    '\t\t"processId": OS.get_process_id(),',
    '\t\t"currentScene": scene.scene_file_path if scene else "",',
    '\t\t"selection": selected_paths',
    '\t}',
    '\tvar file := FileAccess.open(STATE_PATH, FileAccess.WRITE)',
    '\tif file:',
    '\t\tfile.store_string(JSON.stringify(state, "\\t"))',
    '',
    'func _process_commands() -> void:',
    '\tvar dir := DirAccess.open(COMMANDS_DIR)',
    '\tif not dir:',
    '\t\treturn',
    '\tdir.list_dir_begin()',
    '\tvar file_name := dir.get_next()',
    '\twhile file_name != "":',
    '\t\tif not dir.current_is_dir() and file_name.ends_with(".json"):',
    '\t\t\t_process_command(COMMANDS_DIR + "/" + file_name)',
    '\t\tfile_name = dir.get_next()',
    '\tdir.list_dir_end()',
    '',
    'func _process_command(path: String) -> void:',
    '\tvar file := FileAccess.open(path, FileAccess.READ)',
    '\tif not file:',
    '\t\treturn',
    '\tvar parsed = JSON.parse_string(file.get_as_text())',
    '\tif typeof(parsed) != TYPE_DICTIONARY:',
    '\t\tDirAccess.remove_absolute(ProjectSettings.globalize_path(path))',
    '\t\treturn',
    '\tvar command_id := str(parsed.get("commandId", path.get_file().get_basename()))',
    '\tvar command_type := str(parsed.get("type", ""))',
    '\tvar started_at := Time.get_datetime_string_from_system(true)',
    '\tif _command_expired(parsed):',
    '\t\t_write_receipt(command_id, command_type, "expired", started_at, "Command expired before the editor processed it.", {})',
    '\t\tDirAccess.remove_absolute(ProjectSettings.globalize_path(path))',
    '\t\treturn',
    '\tvar outcome := {"ok": false, "error": "Unsupported editor command: " + command_type, "result": {}}',
    '\tmatch command_type:',
    '\t\t"select_node":',
    '\t\t\toutcome = _select_node(parsed.get("payload", {}))',
    '\t\t"undo":',
    '\t\t\tget_undo_redo().undo()',
    '\t\t\toutcome = {"ok": true, "error": "", "result": {"action": "undo"}}',
    '\t\t"redo":',
    '\t\t\tget_undo_redo().redo()',
    '\t\t\toutcome = {"ok": true, "error": "", "result": {"action": "redo"}}',
    '\t\t"inspector_get_properties":',
    '\t\t\toutcome = _inspector_get_properties(parsed.get("payload", {}))',
    '\t\t"inspector_set_properties":',
    '\t\t\toutcome = _inspector_set_properties(parsed.get("payload", {}))',
    '\t\t"get_open_scripts":',
    '\t\t\toutcome = _get_open_scripts()',
    '\t\t"get_editor_errors":',
    '\t\t\toutcome = _get_editor_errors()',
    '\t\t"get_performance_monitors", "get_editor_performance":',
    '\t\t\toutcome = _get_performance_monitors(command_type)',
    '\t\t"get_editor_screenshot", "get_game_screenshot", "capture_frames":',
    '\t\t\toutcome = _capture_viewport(command_type, parsed.get("payload", {}))',
    '\t\t"execute_editor_script":',
    '\t\t\toutcome = _execute_editor_expression(parsed.get("payload", {}))',
    '\t\t"reload_project":',
    '\t\t\toutcome = _reload_project()',
    '\t\t"reload_plugin":',
    '\t\t\toutcome = {"ok": true, "error": "", "result": {"reloaded": false, "message": "Bridge command processor is active; self-reload is acknowledged without disabling the current plugin instance."}}',
    '\t\t"simulate_key", "simulate_mouse_click", "simulate_mouse_move", "simulate_action", "simulate_sequence":',
    '\t\t\toutcome = _simulate_input(command_type, parsed.get("payload", {}))',
    '\t\t"get_game_scene_tree":',
    '\t\t\toutcome = _get_runtime_scene_tree()',
    '\t\t"get_game_node_properties", "batch_get_properties":',
    '\t\t\toutcome = _inspector_get_properties(parsed.get("payload", {}))',
    '\t\t"set_game_node_property":',
    '\t\t\toutcome = _set_game_node_property(parsed.get("payload", {}))',
    '\t\t"execute_game_script":',
    '\t\t\toutcome = {"ok": false, "error": "Runtime script execution requires an active game-side bridge. The editor file bridge processed the command but no game runtime IPC endpoint is attached.", "result": {}}',
    '\t\t"monitor_properties":',
    '\t\t\toutcome = _monitor_properties(parsed.get("payload", {}))',
    '\t\t"start_recording", "stop_recording", "replay_recording":',
    '\t\t\toutcome = _recording_command(command_type, parsed.get("payload", {}))',
    '\t\t"find_ui_elements":',
    '\t\t\toutcome = _find_ui_elements(parsed.get("payload", {}))',
    '\t\t"click_button_by_text":',
    '\t\t\toutcome = _click_button_by_text(parsed.get("payload", {}))',
    '\t\t"wait_for_node":',
    '\t\t\toutcome = _wait_for_node(parsed.get("payload", {}))',
    '\t\t"find_nearby_nodes":',
    '\t\t\toutcome = _find_nearby_nodes(parsed.get("payload", {}))',
    '\t\t"navigate_to", "move_to":',
    '\t\t\toutcome = _move_node_toward(command_type, parsed.get("payload", {}))',
    '\tvar status := "completed" if bool(outcome.get("ok", false)) else "failed"',
    '\t_write_receipt(command_id, command_type, status, started_at, str(outcome.get("error", "")), outcome.get("result", {}))',
    '\tDirAccess.remove_absolute(ProjectSettings.globalize_path(path))',
    '',
    'func _select_node(payload: Dictionary) -> Dictionary:',
    '\tvar node_result := _resolve_node(payload)',
    '\tif not bool(node_result.get("ok", false)):',
    '\t\treturn node_result',
    '\tvar node: Node = node_result.get("node")',
    '\tvar selection := get_editor_interface().get_selection()',
    '\tselection.clear()',
    '\tselection.add_node(node)',
    '\treturn {"ok": true, "error": "", "result": {"nodePath": str(node.get_path())}}',
    '',
    'func _inspector_get_properties(payload: Dictionary) -> Dictionary:',
    '\tvar node_result := _resolve_node(payload)',
    '\tif not bool(node_result.get("ok", false)):',
    '\t\treturn node_result',
    '\tvar node: Node = node_result.get("node")',
    '\tvar names: Array = payload.get("propertyNames", [])',
    '\tvar values := {}',
    '\tif names.is_empty():',
    '\t\tfor property in node.get_property_list():',
    '\t\t\tvar property_name := str(property.get("name", ""))',
    '\t\t\tif property_name != "":',
    '\t\t\t\tvalues[property_name] = _serialize_value(node.get(property_name))',
    '\telse:',
    '\t\tfor property_name in names:',
    '\t\t\tvalues[str(property_name)] = _serialize_value(node.get(str(property_name)))',
    '\treturn {"ok": true, "error": "", "result": {"nodePath": str(node.get_path()), "properties": values}}',
    '',
    'func _inspector_set_properties(payload: Dictionary) -> Dictionary:',
    '\tvar node_result := _resolve_node(payload)',
    '\tif not bool(node_result.get("ok", false)):',
    '\t\treturn node_result',
    '\tvar node: Node = node_result.get("node")',
    '\tvar properties: Dictionary = payload.get("properties", {})',
    '\tvar changed := {}',
    '\tfor property_name in properties.keys():',
    '\t\tnode.set(str(property_name), _value_from_json(properties[property_name]))',
    '\t\tchanged[str(property_name)] = _serialize_value(node.get(str(property_name)))',
    '\treturn {"ok": true, "error": "", "result": {"nodePath": str(node.get_path()), "properties": changed}}',
    '',
    'func _resolve_node(payload: Dictionary) -> Dictionary:',
    '\tvar node_path := NodePath(str(payload.get("nodePath", "")))',
    '\tvar scene := get_editor_interface().get_edited_scene_root()',
    '\tif not scene:',
    '\t\treturn {"ok": false, "error": "No edited scene root is available.", "result": {}}',
    '\tif node_path.is_empty():',
    '\t\tvar selected := get_editor_interface().get_selection().get_selected_nodes()',
    '\t\tif selected.size() > 0:',
    '\t\t\treturn {"ok": true, "error": "", "result": {}, "node": selected[0]}',
    '\t\treturn {"ok": false, "error": "No nodePath was provided and no editor node is selected.", "result": {}}',
    '\tvar relative := node_path',
    '\tif str(node_path).begins_with("root/"):',
    '\t\trelative = NodePath(str(node_path).substr(5))',
    '\tvar node := scene if str(relative) == "" or str(relative) == str(scene.name) else scene.get_node_or_null(relative)',
    '\tif node:',
    '\t\treturn {"ok": true, "error": "", "result": {}, "node": node}',
    '\treturn {"ok": false, "error": "Node not found: " + str(node_path), "result": {}}',
    '',
    'func _get_open_scripts() -> Dictionary:',
    '\tvar scripts: Array = []',
    '\tvar script_editor = get_editor_interface().get_script_editor() if get_editor_interface().has_method("get_script_editor") else null',
    '\tif script_editor and script_editor.has_method("get_open_scripts"):',
    '\t\tfor script in script_editor.get_open_scripts():',
    '\t\t\tscripts.append({"path": script.resource_path, "class": script.get_class()})',
    '\treturn {"ok": true, "error": "", "result": {"scripts": scripts}}',
    '',
    'func _get_editor_errors() -> Dictionary:',
    '\treturn {"ok": true, "error": "", "result": {"errors": [], "source": "editor_bridge", "message": "Godot does not expose the Output dock error buffer to EditorPlugin scripts; command completed with an empty structured error list."}}',
    '',
    'func _get_performance_monitors(command_type: String) -> Dictionary:',
    '\tvar monitors := {',
    '\t\t"time/fps": Performance.get_monitor(Performance.TIME_FPS),',
    '\t\t"time/process": Performance.get_monitor(Performance.TIME_PROCESS),',
    '\t\t"time/physics_process": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),',
    '\t\t"memory/static": Performance.get_monitor(Performance.MEMORY_STATIC),',
    '\t\t"memory/static_max": Performance.get_monitor(Performance.MEMORY_STATIC_MAX),',
    '\t\t"object/count": Performance.get_monitor(Performance.OBJECT_COUNT),',
    '\t\t"object/resource_count": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),',
    '\t\t"render/total_objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),',
    '\t\t"physics/2d/active_objects": Performance.get_monitor(Performance.PHYSICS_2D_ACTIVE_OBJECTS),',
    '\t\t"physics/3d/active_objects": Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)',
    '\t}',
    '\treturn {"ok": true, "error": "", "result": {"toolName": command_type, "monitors": monitors, "framesPerSecond": monitors["time/fps"], "memoryStatic": monitors["memory/static"]}}',
    '',
    'func _capture_viewport(command_type: String, payload: Dictionary) -> Dictionary:',
    '\tvar output_path := str(payload.get("outputPath", payload.get("output_path", ".godot-devtool/" + command_type + ".png")))',
    '\tvar image = get_tree().root.get_texture().get_image()',
    '\tvar resource_path := output_path if output_path.begins_with("res://") else "res://" + output_path',
    '\tDirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(resource_path.get_base_dir()))',
    '\tvar err = image.save_png(resource_path)',
    '\tif err != OK:',
    '\t\treturn {"ok": false, "error": "Failed to save screenshot: " + str(err), "result": {"outputPath": resource_path}}',
    '\treturn {"ok": true, "error": "", "result": {"outputPath": resource_path, "width": image.get_width(), "height": image.get_height()}}',
    '',
    'func _execute_editor_expression(payload: Dictionary) -> Dictionary:',
    '\tvar source := str(payload.get("expression", payload.get("code", payload.get("source", ""))))',
    '\tif source == "":',
    '\t\treturn {"ok": false, "error": "expression/code/source is required.", "result": {}}',
    '\tvar expression := Expression.new()',
    '\tvar parse_error := expression.parse(source, [])',
    '\tif parse_error != OK:',
    '\t\treturn {"ok": false, "error": expression.get_error_text(), "result": {}}',
    '\tvar value = expression.execute([], get_editor_interface(), false)',
    '\tif expression.has_execute_failed():',
    '\t\treturn {"ok": false, "error": "Expression execution failed.", "result": {}}',
    '\treturn {"ok": true, "error": "", "result": {"value": _serialize_value(value)}}',
    '',
    'func _reload_project() -> Dictionary:',
    '\tvar filesystem = get_editor_interface().get_resource_filesystem()',
    '\tif filesystem:',
    '\t\tfilesystem.scan()',
    '\treturn {"ok": true, "error": "", "result": {"rescanned": filesystem != null}}',
    '',
    'func _simulate_input(command_type: String, payload: Dictionary) -> Dictionary:',
    '\tif command_type == "simulate_action":',
    '\t\tvar action_name := str(payload.get("action", payload.get("actionName", "")))',
    '\t\tif action_name == "":',
    '\t\t\treturn {"ok": false, "error": "action is required.", "result": {}}',
    '\t\tif bool(payload.get("pressed", true)):',
    '\t\t\tInput.action_press(action_name, float(payload.get("strength", 1.0)))',
    '\t\telse:',
    '\t\t\tInput.action_release(action_name)',
    '\t\treturn {"ok": true, "error": "", "result": {"action": action_name, "pressed": bool(payload.get("pressed", true))}}',
    '\treturn {"ok": false, "error": "Low-level key/mouse injection requires a running game viewport. The editor bridge processed the command but no game runtime viewport is attached.", "result": {"command": command_type}}',
    '',
    'func _get_runtime_scene_tree() -> Dictionary:',
    '\tvar scene := get_editor_interface().get_edited_scene_root()',
    '\tif not scene:',
    '\t\treturn {"ok": false, "error": "No edited scene root is available and no game runtime bridge is attached.", "result": {}}',
    '\treturn {"ok": true, "error": "", "result": {"bridgeContext": "editor_scene", "tree": _serialize_tree(scene, "root")}}',
    '',
    'func _serialize_tree(node: Node, path: String) -> Dictionary:',
    '\tvar children: Array = []',
    '\tfor child in node.get_children():',
    '\t\tchildren.append(_serialize_tree(child, path + "/" + str(child.name)))',
    '\treturn {"name": str(node.name), "type": node.get_class(), "path": path, "children": children}',
    '',
    'func _set_game_node_property(payload: Dictionary) -> Dictionary:',
    '\tvar property_name := str(payload.get("propertyName", payload.get("property_name", "")))',
    '\tif property_name == "":',
    '\t\treturn {"ok": false, "error": "propertyName is required.", "result": {}}',
    '\tvar properties := {}',
    '\tproperties[property_name] = payload.get("value")',
    '\tpayload["properties"] = properties',
    '\treturn _inspector_set_properties(payload)',
    '',
    'func _monitor_properties(payload: Dictionary) -> Dictionary:',
    '\tvar sample := _inspector_get_properties(payload)',
    '\tif not bool(sample.get("ok", false)):',
    '\t\treturn sample',
    '\treturn {"ok": true, "error": "", "result": {"samples": [{"timeMs": 0, "properties": sample.result.properties}], "durationMs": 0}}',
    '',
    'func _recording_command(command_type: String, payload: Dictionary) -> Dictionary:',
    '\tvar path := str(payload.get("recordingPath", payload.get("recording_path", ".godot-devtool/input-recording.json")))',
    '\tif command_type == "start_recording":',
    '\t\tvar resource_path := path if path.begins_with("res://") else "res://" + path',
    '\t\tDirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(resource_path.get_base_dir()))',
    '\t\tvar file := FileAccess.open(resource_path, FileAccess.WRITE)',
    '\t\tif file:',
    '\t\t\tfile.store_string(JSON.stringify({"startedAt": Time.get_datetime_string_from_system(true), "events": []}, "\\t"))',
    '\t\treturn {"ok": file != null, "error": "" if file else "Failed to create recording file.", "result": {"recordingPath": resource_path}}',
    '\tif command_type == "stop_recording":',
    '\t\treturn {"ok": true, "error": "", "result": {"recordingPath": path, "stoppedAt": Time.get_datetime_string_from_system(true)}}',
    '\treturn {"ok": FileAccess.file_exists(path if path.begins_with("res://") else "res://" + path), "error": "" if FileAccess.file_exists(path if path.begins_with("res://") else "res://" + path) else "Recording file does not exist.", "result": {"recordingPath": path}}',
    '',
    'func _find_ui_elements(payload: Dictionary) -> Dictionary:',
    '\tvar scene := get_editor_interface().get_edited_scene_root()',
    '\tif not scene:',
    '\t\treturn {"ok": false, "error": "No edited scene root is available.", "result": {}}',
    '\tvar results: Array = []',
    '\t_collect_ui(scene, "root", str(payload.get("text", "")).to_lower(), results)',
    '\treturn {"ok": true, "error": "", "result": {"elements": results}}',
    '',
    'func _collect_ui(node: Node, path: String, text: String, results: Array) -> void:',
    '\tvar include := node is Control',
    '\tvar label := str(node.get("text")) if node.has_method("get") else ""',
    '\tif text != "" and not label.to_lower().contains(text) and not str(node.name).to_lower().contains(text):',
    '\t\tinclude = false',
    '\tif include:',
    '\t\tresults.append({"path": path, "name": str(node.name), "type": node.get_class(), "text": label})',
    '\tfor child in node.get_children():',
    '\t\t_collect_ui(child, path + "/" + str(child.name), text, results)',
    '',
    'func _click_button_by_text(payload: Dictionary) -> Dictionary:',
    '\tvar result := _find_ui_elements(payload)',
    '\tif not bool(result.get("ok", false)):',
    '\t\treturn result',
    '\tfor element in result.result.elements:',
    '\t\tif str(element.get("type", "")) == "Button":',
    '\t\t\treturn {"ok": true, "error": "", "result": {"clicked": false, "button": element, "message": "Button found; actual click injection requires a running game viewport."}}',
    '\treturn {"ok": false, "error": "Button not found for requested text.", "result": result.result}',
    '',
    'func _wait_for_node(payload: Dictionary) -> Dictionary:',
    '\tvar node_result := _resolve_node(payload)',
    '\treturn {"ok": bool(node_result.get("ok", false)), "error": str(node_result.get("error", "")), "result": {"found": bool(node_result.get("ok", false)), "nodePath": str(payload.get("nodePath", ""))}}',
    '',
    'func _find_nearby_nodes(payload: Dictionary) -> Dictionary:',
    '\tvar scene := get_editor_interface().get_edited_scene_root()',
    '\tif not scene:',
    '\t\treturn {"ok": false, "error": "No edited scene root is available.", "result": {}}',
    '\tvar nodes: Array = []',
    '\t_collect_nearby(scene, "root", nodes)',
    '\treturn {"ok": true, "error": "", "result": {"nodes": nodes, "origin": payload.get("position", payload.get("origin", null)), "radius": payload.get("radius", null)}}',
    '',
    'func _collect_nearby(node: Node, path: String, results: Array) -> void:',
    '\tresults.append({"path": path, "name": str(node.name), "type": node.get_class(), "position": _serialize_value(node.get("position"))})',
    '\tfor child in node.get_children():',
    '\t\t_collect_nearby(child, path + "/" + str(child.name), results)',
    '',
    'func _move_node_toward(command_type: String, payload: Dictionary) -> Dictionary:',
    '\tvar node_result := _resolve_node(payload)',
    '\tif not bool(node_result.get("ok", false)):',
    '\t\treturn node_result',
    '\tvar node: Node = node_result.get("node")',
    '\tvar target = payload.get("target", payload.get("position", payload.get("targetPosition", null)))',
    '\tif target == null:',
    '\t\treturn {"ok": false, "error": "target/position is required.", "result": {}}',
    '\tnode.set("position", _value_from_json(target))',
    '\treturn {"ok": true, "error": "", "result": {"command": command_type, "nodePath": str(node.get_path()), "position": _serialize_value(node.get("position"))}}',
    '',
    'func _write_receipt(command_id: String, command_type: String, status: String, started_at: String, error: String, result: Dictionary) -> void:',
    '\tvar receipt := {',
    '\t\t"commandId": command_id,',
    '\t\t"type": command_type,',
    '\t\t"status": status,',
    '\t\t"startedAt": started_at,',
    '\t\t"finishedAt": Time.get_datetime_string_from_system(true),',
    '\t\t"error": error,',
    '\t\t"result": result',
    '\t}',
    '\tvar path := RECEIPTS_DIR + "/" + command_id + ".json"',
    '\tvar file := FileAccess.open(path, FileAccess.WRITE)',
    '\tif file:',
    '\t\tfile.store_string(JSON.stringify(receipt, "\\t"))',
    '',
    'func _read_config() -> Dictionary:',
    '\tvar file := FileAccess.open(CONFIG_PATH, FileAccess.READ)',
    '\tif not file:',
    '\t\treturn {"mode": "file", "instanceId": ""}',
    '\tvar parsed = JSON.parse_string(file.get_as_text())',
    '\tif typeof(parsed) != TYPE_DICTIONARY:',
    '\t\treturn {"mode": "file", "instanceId": ""}',
    '\treturn parsed',
    '',
    'func _command_expired(command: Dictionary) -> bool:',
    '\tvar expires_at_ms := int(command.get("expiresAtMs", 0))',
    '\treturn expires_at_ms > 0 and int(Time.get_unix_time_from_system() * 1000.0) > expires_at_ms',
    '',
    'func _serialize_value(value):',
    '\tmatch typeof(value):',
    '\t\tTYPE_VECTOR2:',
    '\t\t\treturn {"type": "Vector2", "value": [value.x, value.y]}',
    '\t\tTYPE_VECTOR3:',
    '\t\t\treturn {"type": "Vector3", "value": [value.x, value.y, value.z]}',
    '\t\tTYPE_COLOR:',
    '\t\t\treturn {"type": "Color", "value": [value.r, value.g, value.b, value.a]}',
    '\t\tTYPE_NODE_PATH:',
    '\t\t\treturn {"type": "NodePath", "value": str(value)}',
    '\t\tTYPE_OBJECT:',
    '\t\t\treturn {"type": value.get_class() if value else "Object", "value": str(value)}',
    '\t\t_:',
    '\t\t\treturn value',
    '',
    'func _value_from_json(value):',
    '\tif typeof(value) != TYPE_DICTIONARY or not value.has("type"):',
    '\t\treturn value',
    '\tmatch str(value.get("type", "")):',
    '\t\t"Vector2":',
    '\t\t\tvar raw: Array = value.get("value", [0, 0])',
    '\t\t\treturn Vector2(float(raw[0]), float(raw[1]))',
    '\t\t"Vector3":',
    '\t\t\tvar raw: Array = value.get("value", [0, 0, 0])',
    '\t\t\treturn Vector3(float(raw[0]), float(raw[1]), float(raw[2]))',
    '\t\t"Color":',
    '\t\t\tvar raw: Array = value.get("value", [1, 1, 1, 1])',
    '\t\t\treturn Color(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]))',
    '\t\t"NodePath":',
    '\t\t\treturn NodePath(str(value.get("value", "")))',
    '\t\t_:',
    '\t\t\treturn value.get("value")',
    '',
  ].join('\n');
}
