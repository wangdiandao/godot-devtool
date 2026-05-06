import { existsSync } from 'fs';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { normalizeProjectRelativePath } from './filesystemTools.js';
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
  | 'inspector_set_properties';

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
    'version="1.4.0"',
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
