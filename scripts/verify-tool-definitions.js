import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createToolHandlers } from '../build/server/handlers/index.js';
import { COMPATIBILITY_TOOL_ROUTES } from '../build/tools/compatibilityTools.js';
import { GODOT_TOOL_ALIASES, GODOT_TOOL_DEFINITIONS } from '../build/tools/toolDefinitions.js';

const repoRoot = process.cwd();

const requiredFiles = [
  'src/tools/definitions/core.ts',
  'src/tools/definitions/project.ts',
  'src/tools/definitions/editor.ts',
  'src/tools/definitions/filesystem.ts',
  'src/tools/definitions/resource.ts',
  'src/tools/definitions/script.ts',
  'src/tools/definitions/node.ts',
  'src/tools/definitions/scene.ts',
  'src/tools/definitions/visual.ts',
  'src/tools/definitions/compatibility.ts',
  'src/tools/compatibilityTools.ts',
  'src/tools/definitions/index.ts',
  'src/server/handlers/compatibility.ts',
  'src/server/transports/browserVisualizer.ts',
];

const missingFiles = requiredFiles.filter((filePath) => !existsSync(join(process.cwd(), filePath)));
if (missingFiles.length > 0) {
  console.error(`Missing tool definition modules:\n${missingFiles.join('\n')}`);
  process.exit(1);
}

const toolNames = GODOT_TOOL_DEFINITIONS.map((tool) => tool.name);
const duplicateNames = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
if (duplicateNames.length > 0) {
  console.error(`Duplicate tool definitions: ${[...new Set(duplicateNames)].join(', ')}`);
  process.exit(1);
}

const toolsByName = new Map(GODOT_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
if (Object.keys(GODOT_TOOL_ALIASES).length !== 0) {
  console.error(`Pure compatibility aliases must not be published in 2.5.0+: ${Object.keys(GODOT_TOOL_ALIASES).join(', ')}`);
  process.exit(1);
}
const compatibilityAliasDescriptions = GODOT_TOOL_DEFINITIONS.filter((tool) =>
  /^Compatibility alias for\b/.test(String(tool.description || '')) ||
  /^Compatibility alias\b/.test(String(tool.description || ''))
);
if (compatibilityAliasDescriptions.length > 0) {
  console.error(`Compatibility alias tool definitions remain: ${compatibilityAliasDescriptions.map((tool) => tool.name).join(', ')}`);
  process.exit(1);
}
for (const requiredName of ['plugin_install', 'plugin_status', 'plugin_reload']) {
  if (!toolsByName.has(requiredName)) {
    console.error(`Missing v2 plugin tool: ${requiredName}`);
    process.exit(1);
  }
}
for (const requiredName of ['browser_visualizer_start', 'browser_visualizer_status', 'browser_visualizer_stop']) {
  if (!toolsByName.has(requiredName)) {
    console.error(`Missing Browser visualizer tool: ${requiredName}`);
    process.exit(1);
  }
}

for (const tool of GODOT_TOOL_DEFINITIONS) {
  const missingMetadata = ['routeGroup', 'transport', 'riskLevel'].filter((key) => !tool[key]);
  if (missingMetadata.length > 0) {
    console.error(`Tool ${tool.name} is missing v2 metadata: ${missingMetadata.join(', ')}`);
    process.exit(1);
  }

  if (typeof tool.requiresEditor !== 'boolean' || typeof tool.requiresRuntime !== 'boolean') {
    console.error(`Tool ${tool.name} must declare requiresEditor/requiresRuntime booleans`);
    process.exit(1);
  }
}

const invalidBridgeModes = GODOT_TOOL_DEFINITIONS.filter((tool) =>
  String(tool.transport).includes('file_queue') ||
  String(tool.description).toLowerCase().includes('file-based live editor bridge')
);
if (invalidBridgeModes.length > 0) {
  console.error(`v2 must not advertise file-queue bridge routes: ${invalidBridgeModes.map((tool) => tool.name).join(', ')}`);
  process.exit(1);
}

const pluginInstall = toolsByName.get('plugin_install');
if (pluginInstall.transport !== 'native' || pluginInstall.routeGroup !== 'editor') {
  console.error('plugin_install must be a native editor route');
  process.exit(1);
}

const requiredCompatibilityTools17 = [
  'connect_signal',
  'disconnect_signal',
  'get_input_actions',
  'set_input_action',
  'list_animations',
  'create_animation',
  'tilemap_set_cell',
  'tilemap_fill_rect',
  'create_shader',
  'read_shader',
  'assign_shader_material',
  'set_shader_param',
  'get_shader_params',
  'setup_lighting',
  'create_particles',
  'setup_navigation_region',
  'setup_navigation_agent',
  'add_audio_player',
  'get_audio_bus_layout',
  'create_animation_tree',
  'get_filesystem_tree',
  'search_files',
  'uid_to_project_path',
  'get_scene_file_content',
  'delete_scene',
  'add_scene_instance',
  'add_resource',
  'set_anchor_preset',
  'get_node_groups',
  'set_node_groups',
  'find_nodes_in_group',
  'edit_script',
  'get_open_scripts',
  'search_in_files',
  'get_editor_errors',
  'get_editor_screenshot',
  'get_game_screenshot',
  'execute_editor_script',
  'get_signals',
  'reload_plugin',
  'reload_project',
  'simulate_key',
  'simulate_mouse_click',
  'simulate_mouse_move',
  'simulate_action',
  'simulate_sequence',
  'get_game_scene_tree',
  'get_game_node_properties',
  'set_game_node_property',
  'execute_game_script',
  'capture_frames',
  'monitor_properties',
  'start_recording',
  'stop_recording',
  'replay_recording',
  'find_nodes_by_script',
  'get_autoload',
  'batch_get_properties',
  'find_ui_elements',
  'click_button_by_text',
  'wait_for_node',
  'find_nearby_nodes',
  'navigate_to',
  'move_to',
  'add_animation_track',
  'set_animation_keyframe',
  'get_animation_info',
  'remove_animation',
  'tilemap_get_cell',
  'tilemap_clear',
  'tilemap_get_info',
  'tilemap_get_used_cells',
  'create_theme',
  'set_theme_color',
  'set_theme_constant',
  'set_theme_font_size',
  'set_theme_stylebox',
  'get_theme_info',
  'get_performance_monitors',
  'get_editor_performance',
  'find_nodes_by_type',
  'find_signal_connections',
  'batch_set_property',
  'find_node_references',
  'get_scene_dependencies',
  'cross_scene_set_property',
  'find_script_references',
  'detect_circular_dependencies',
  'edit_shader',
  'get_export_info',
  'edit_resource',
  'get_resource_preview',
  'add_autoload',
  'remove_autoload',
  'setup_physics_body',
  'setup_collision',
  'set_physics_layers',
  'get_physics_layers',
  'get_collision_info',
  'add_raycast',
  'add_mesh_instance',
  'setup_camera_3d',
  'setup_environment',
  'add_gridmap',
  'set_material_3d',
  'set_particle_material',
  'set_particle_color_gradient',
  'apply_particle_preset',
  'get_particle_info',
  'bake_navigation_mesh',
  'set_navigation_layers',
  'get_navigation_info',
  'add_audio_bus',
  'add_audio_bus_effect',
  'set_audio_bus',
  'get_audio_info',
  'get_animation_tree_structure',
  'set_tree_parameter',
  'add_state_machine_state',
  'remove_state_machine_state',
  'add_state_machine_transition',
  'remove_state_machine_transition',
  'set_blend_tree_node',
  'analyze_scene_complexity',
  'analyze_signal_flow',
  'find_unused_resources',
  'get_project_statistics',
  'run_test_scenario',
  'assert_node_state',
  'assert_screen_text',
  'compare_screenshots',
  'run_stress_test',
  'get_test_report',
];
const missingCompatibilityTools17 = requiredCompatibilityTools17.filter((toolName) => !toolNames.includes(toolName));
if (missingCompatibilityTools17.length > 0) {
  console.error(`Missing 1.7.0 compatibility tools: ${missingCompatibilityTools17.join(', ')}`);
  process.exit(1);
}

for (const runtimeToolName of [
  'simulate_key',
  'simulate_mouse_click',
  'simulate_mouse_move',
  'simulate_action',
  'simulate_sequence',
  'start_recording',
  'stop_recording',
  'replay_recording',
]) {
  const tool = toolsByName.get(runtimeToolName);
  if (!tool) {
    console.error(`Missing runtime compatibility route: ${runtimeToolName}`);
    process.exit(1);
  }
  if (tool.transport !== 'runtime_ws' || tool.routeGroup !== 'runtime' || tool.requiresRuntime !== true) {
    console.error(`${runtimeToolName} must be advertised as a runtime_ws runtime route`);
    process.exit(1);
  }
  if (tool.compatibility?.implementationStatus !== 'runtime_bridge') {
    console.error(`${runtimeToolName} must report runtime_bridge compatibility implementation status`);
    process.exit(1);
  }
  if (!String(tool.description).includes('Runtime WebSocket compatibility route')) {
    console.error(`${runtimeToolName} must describe runtime bridge execution instead of completion receipts`);
    process.exit(1);
  }
}

const routeSource = readFileSync(join(repoRoot, 'src/tools/compatibilityTools.ts'), 'utf8');
const serverSource = [
  readFileSync(join(repoRoot, 'src/server/GodotServer.ts'), 'utf8'),
  readFileSync(join(repoRoot, 'src/server/GodotServer.methods.ts'), 'utf8'),
].join('\n');
if (/version:\s*['"]2\.2\.0['"]/.test(serverSource)) {
  console.error('Server metadata must not hard-code stale version 2.2.0');
  process.exit(1);
}
if (!serverSource.includes('PACKAGE_VERSION')) {
  console.error('Server metadata must use package version metadata');
  process.exit(1);
}
if (!serverSource.includes('GODOT_DEVTOOL_WS_PORT') || !serverSource.includes('getWsBridge().start(websocketPort)')) {
  console.error('GodotServer.run must keep the WebSocket bridge listening for the MCP server lifetime');
  process.exit(1);
}
if (!serverSource.includes('await getWsBridge().stop()')) {
  console.error('GodotServer.cleanup must stop the WebSocket bridge');
  process.exit(1);
}
if (!serverSource.includes('await getBrowserVisualizer().stop()')) {
  console.error('GodotServer.cleanup must stop the Browser visualizer');
  process.exit(1);
}
const editorBridgeSource = readFileSync(join(repoRoot, 'src/godot/editorBridge.ts'), 'utf8');
const pluginRouterSource = readFileSync(join(repoRoot, 'src/addons/godot_devtool/command_router.gd'), 'utf8');
const pluginEditorCommandsSource = readFileSync(join(repoRoot, 'src/addons/godot_devtool/commands/editor_commands.gd'), 'utf8');
if (!pluginEditorCommandsSource.includes('"get_open_scripts"') || !pluginEditorCommandsSource.includes('"get_editor_performance"')) {
  console.error('Installed editor plugin routes must implement get_open_scripts and get_editor_performance before advertising them');
  process.exit(1);
}
if (!pluginRouterSource.includes('dispatch_command')) {
  console.error('Installed editor plugin router must dispatch advertised editor routes');
  process.exit(1);
}
if (!serverSource.includes('assertCompletedBridgeReceipt')) {
  console.error('WebSocket wrappers must propagate failed receipts as MCP errors');
  process.exit(1);
}
const weakImplementationPatterns = [
  'unsupportedReason',
  "status: 'implemented'",
  'properties: null',
  'fileBackedQaResult',
  'qaArtifact',
  'editAudioBusLayout',
  'editAnimationTreeMetadata',
  'Runtime script execution requires an active game-side bridge',
  'Low-level key/mouse injection requires a running game viewport',
  'empty structured error list',
  'actual click injection requires',
  '"clicked": false',
];
for (const pattern of weakImplementationPatterns) {
  if (routeSource.includes(pattern) || serverSource.includes(pattern) || editorBridgeSource.includes(pattern)) {
    console.error(`Weak or placeholder implementation marker remains: ${pattern}`);
    process.exit(1);
  }
}

for (const [aliasName, targetName] of Object.entries(GODOT_TOOL_ALIASES)) {
  if (!toolNames.includes(targetName)) {
    console.error(`Alias ${aliasName} points to missing tool ${targetName}`);
    process.exit(1);
  }
}

for (const tool of GODOT_TOOL_DEFINITIONS) {
  if (tool.canonicalName) {
    const canonicalTool = toolsByName.get(tool.canonicalName);
    if (!canonicalTool) {
      console.error(`Tool ${tool.name} declares missing canonicalName ${tool.canonicalName}`);
      process.exit(1);
    }
    if (canonicalTool.canonicalName) {
      console.error(`Tool ${tool.name} must resolve directly to canonical tool ${tool.canonicalName}, not another alias`);
      process.exit(1);
    }
  }

  const compatibilityCanonical = tool.compatibility?.canonicalTool;
  if (compatibilityCanonical && compatibilityCanonical !== 'compatibility_native' && tool.canonicalName !== compatibilityCanonical) {
    console.error(`Compatibility tool ${tool.name} must expose top-level canonicalName ${compatibilityCanonical}`);
    process.exit(1);
  }
}

const canonicalToolNames = GODOT_TOOL_DEFINITIONS
  .filter((tool) => !tool.canonicalName)
  .map((tool) => tool.name);
const handlerHost = new Proxy({}, {
  get: () => () => undefined,
});
const handlerNames = Object.keys(createToolHandlers(handlerHost));
const missingHandlers = canonicalToolNames.filter((toolName) => !handlerNames.includes(toolName));
const extraHandlers = handlerNames.filter((toolName) => !toolNames.includes(toolName));

if (missingHandlers.length > 0) {
  console.error(`Missing handlers for tools: ${missingHandlers.join(', ')}`);
  process.exit(1);
}

if (extraHandlers.length > 0) {
  console.error(`Handlers without tool definitions: ${extraHandlers.join(', ')}`);
  process.exit(1);
}

if (GODOT_TOOL_DEFINITIONS.length < 70) {
  console.error(`Unexpectedly low tool count: ${GODOT_TOOL_DEFINITIONS.length}`);
  process.exit(1);
}

console.log(`Verified ${GODOT_TOOL_DEFINITIONS.length} tool definitions and ${Object.keys(GODOT_TOOL_ALIASES).length} aliases.`);
