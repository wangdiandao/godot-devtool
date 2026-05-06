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

const requiredCompatibilityTools17 = [
  'get_project_settings',
  'set_project_setting',
  'open_scene',
  'play_scene',
  'stop_scene',
  'duplicate_node',
  'move_node',
  'update_property',
  'connect_signal',
  'disconnect_signal',
  'list_scripts',
  'read_script',
  'create_script',
  'attach_script',
  'validate_script',
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
  'list_export_presets',
  'read_resource',
  'create_resource',
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
  'project_path_to_uid',
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
  'clear_output',
  'get_signals',
  'reload_plugin',
  'reload_project',
  'get_output_log',
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

const routeSource = readFileSync(join(repoRoot, 'src/tools/compatibilityTools.ts'), 'utf8');
const serverSource = readFileSync(join(repoRoot, 'src/server/GodotServer.ts'), 'utf8');
const weakImplementationPatterns = [
  'unsupportedReason',
  "status: 'implemented'",
  'properties: null',
  'fileBackedQaResult',
  'qaArtifact',
  'editAudioBusLayout',
  'editAnimationTreeMetadata',
];
for (const pattern of weakImplementationPatterns) {
  if (routeSource.includes(pattern) || serverSource.includes(pattern)) {
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

const canonicalToolNames = GODOT_TOOL_DEFINITIONS
  .filter((tool) => !tool.canonicalName)
  .map((tool) => tool.name);
const handlerHost = new Proxy({}, {
  get: () => () => undefined,
});
const handlerNames = Object.keys(createToolHandlers(handlerHost));
const missingHandlers = canonicalToolNames.filter((toolName) => !handlerNames.includes(toolName));
const extraHandlers = handlerNames.filter((toolName) => !canonicalToolNames.includes(toolName));

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
