export type CompatibilityToolRoute = {
  toolName: string;
  canonicalTool?: string;
  fixedArgs?: Record<string, unknown>;
  fieldMap?: Record<string, string>;
  runMode?: string;
  riskLevel?: string;
};

export const DIRECT_COMPATIBILITY_ALIASES: Record<string, string> = {
  get_project_settings: 'project_get_settings',
  set_project_setting: 'project_set_setting',
  open_scene: 'scene_open',
  play_scene: 'run_project',
  stop_scene: 'stop_project',
  duplicate_node: 'node_duplicate',
  move_node: 'node_move',
  update_property: 'node_set_property',
  list_scripts: 'get_script_index',
  read_script: 'read_script_file',
  create_script: 'script_create',
  attach_script: 'script_attach',
  validate_script: 'check_gdscript_syntax',
  list_export_presets: 'get_export_presets',
  read_resource: 'resource_load',
  create_resource: 'resource_create',
  clear_output: 'clear_debug_output',
  get_output_log: 'get_debug_output',
  project_path_to_uid: 'get_uid',
};

const ROUTED_COMPATIBILITY_TOOLS: CompatibilityToolRoute[] = [
  { toolName: 'connect_signal', canonicalTool: 'signal', fixedArgs: { action: 'connect' } },
  { toolName: 'disconnect_signal', canonicalTool: 'signal', fixedArgs: { action: 'disconnect' } },
  { toolName: 'get_input_actions', canonicalTool: 'project_input_action', fixedArgs: { action: 'list' } },
  { toolName: 'set_input_action', canonicalTool: 'project_input_action', fixedArgs: { action: 'update' } },
  { toolName: 'list_animations', canonicalTool: 'animation', fixedArgs: { action: 'list' } },
  { toolName: 'create_animation', canonicalTool: 'animation', fixedArgs: { action: 'create' } },
  { toolName: 'tilemap_set_cell', canonicalTool: 'tilemap', fixedArgs: { action: 'set_cell' } },
  { toolName: 'tilemap_fill_rect', canonicalTool: 'tilemap', fixedArgs: { action: 'fill_rect' } },
  { toolName: 'create_shader', canonicalTool: 'shader', fixedArgs: { action: 'create' } },
  { toolName: 'read_shader', canonicalTool: 'shader', fixedArgs: { action: 'read' } },
  { toolName: 'assign_shader_material', canonicalTool: 'material', fixedArgs: { action: 'apply' } },
  { toolName: 'set_shader_param', canonicalTool: 'shader', fixedArgs: { action: 'set_parameters' }, fieldMap: { parameter: 'parameters' } },
  { toolName: 'get_shader_params', canonicalTool: 'shader', fixedArgs: { action: 'inspect' } },
  { toolName: 'setup_lighting', canonicalTool: 'lighting', fixedArgs: { action: 'create' } },
  { toolName: 'create_particles', canonicalTool: 'particle', fixedArgs: { action: 'create' } },
  { toolName: 'setup_navigation_region', canonicalTool: 'navigation', fixedArgs: { action: 'create', nodeType: 'NavigationRegion2D' } },
  { toolName: 'setup_navigation_agent', canonicalTool: 'navigation', fixedArgs: { action: 'create', nodeType: 'NavigationAgent2D' } },
  { toolName: 'add_audio_player', canonicalTool: 'audio', fixedArgs: { action: 'create' } },
  { toolName: 'get_audio_bus_layout', canonicalTool: 'audio', fixedArgs: { action: 'list_buses' } },
  { toolName: 'create_animation_tree', canonicalTool: 'animation_state_machine', fixedArgs: { action: 'create' } },
  { toolName: 'get_filesystem_tree', canonicalTool: 'filesystem_list', fixedArgs: { directory: '' } },
  { toolName: 'get_scene_file_content', canonicalTool: 'filesystem_read', fieldMap: { scenePath: 'filePath' } },
  { toolName: 'delete_scene', canonicalTool: 'filesystem_delete', fieldMap: { scenePath: 'targetPath' }, fixedArgs: { confirm: true } },
  { toolName: 'add_resource', canonicalTool: 'resource_create', fixedArgs: { resourceType: 'Resource' } },
  { toolName: 'edit_script', canonicalTool: 'script_write' },
  { toolName: 'get_signals', canonicalTool: 'signal', fixedArgs: { action: 'list' } },
  { toolName: 'add_animation_track', canonicalTool: 'animation', fixedArgs: { action: 'add_track' } },
  { toolName: 'set_animation_keyframe', canonicalTool: 'animation', fixedArgs: { action: 'set_keyframe' } },
  { toolName: 'get_animation_info', canonicalTool: 'animation', fixedArgs: { action: 'get_info' } },
  { toolName: 'remove_animation', canonicalTool: 'animation', fixedArgs: { action: 'remove' } },
  { toolName: 'tilemap_get_info', canonicalTool: 'tilemap', fixedArgs: { action: 'list' } },
  { toolName: 'create_theme', canonicalTool: 'ui', fixedArgs: { action: 'create_theme', nodeType: 'Control', nodeName: 'ThemeRoot' } },
  { toolName: 'find_nodes_by_type', canonicalTool: 'node_find' },
  { toolName: 'get_export_info', canonicalTool: 'export_matrix' },
  { toolName: 'edit_resource', canonicalTool: 'resource_save' },
  { toolName: 'setup_physics_body', canonicalTool: 'physics', fixedArgs: { action: 'create' } },
  { toolName: 'setup_collision', canonicalTool: 'physics', fixedArgs: { action: 'create_shape_resource' } },
  { toolName: 'set_physics_layers', canonicalTool: 'physics', fixedArgs: { action: 'set_layers' } },
  { toolName: 'get_collision_info', canonicalTool: 'physics', fixedArgs: { action: 'get_collision_info' } },
  { toolName: 'setup_environment', canonicalTool: 'lighting', fixedArgs: { action: 'create', nodeType: 'WorldEnvironment' } },
  { toolName: 'set_material_3d', canonicalTool: 'material', fixedArgs: { action: 'apply' } },
  { toolName: 'bake_navigation_mesh', canonicalTool: 'navigation', fixedArgs: { action: 'bake_navigation_mesh' } },
  { toolName: 'get_navigation_info', canonicalTool: 'navigation', fixedArgs: { action: 'list' } },
  { toolName: 'get_audio_info', canonicalTool: 'audio', fixedArgs: { action: 'list' } },
  { toolName: 'find_unused_resources', canonicalTool: 'resource_dependency_graph' },
  { toolName: 'get_project_statistics', canonicalTool: 'get_project_info' },
];

const nativeRisk = (toolName: string): string => (
  toolName.includes('set') ||
  toolName.includes('add') ||
  toolName.includes('remove') ||
  toolName.includes('execute') ||
  toolName.includes('simulate') ||
  toolName.includes('click') ||
  toolName.includes('move') ||
  toolName.includes('clear') ||
  toolName.includes('edit') ||
  toolName.includes('reload') ||
  toolName.includes('record') ||
  toolName.includes('replay') ||
  toolName.includes('run_')
) ? 'write' : 'read';

const NATIVE_COMPATIBILITY_TOOL_NAMES = [
  'search_files', 'uid_to_project_path', 'add_scene_instance', 'set_anchor_preset',
  'get_node_groups', 'set_node_groups', 'find_nodes_in_group', 'get_open_scripts',
  'search_in_files', 'get_editor_errors', 'get_editor_screenshot', 'get_game_screenshot',
  'execute_editor_script', 'reload_plugin', 'reload_project', 'simulate_key',
  'simulate_mouse_click', 'simulate_mouse_move', 'simulate_action', 'simulate_sequence',
  'get_game_scene_tree', 'get_game_node_properties', 'set_game_node_property',
  'execute_game_script', 'capture_frames', 'monitor_properties', 'start_recording',
  'stop_recording', 'replay_recording', 'find_nodes_by_script', 'get_autoload',
  'batch_get_properties', 'find_ui_elements', 'click_button_by_text', 'wait_for_node',
  'find_nearby_nodes', 'navigate_to', 'move_to', 'tilemap_get_cell', 'tilemap_clear',
  'tilemap_get_used_cells', 'set_theme_color', 'set_theme_constant',
  'set_theme_font_size', 'set_theme_stylebox', 'get_theme_info',
  'get_performance_monitors', 'get_editor_performance', 'find_signal_connections',
  'batch_set_property', 'find_node_references', 'get_scene_dependencies',
  'cross_scene_set_property', 'find_script_references', 'detect_circular_dependencies',
  'edit_shader', 'get_resource_preview', 'add_autoload', 'remove_autoload',
  'get_physics_layers', 'add_raycast', 'add_mesh_instance', 'setup_camera_3d',
  'add_gridmap', 'set_particle_material', 'set_particle_color_gradient',
  'apply_particle_preset', 'get_particle_info', 'set_navigation_layers',
  'add_audio_bus', 'add_audio_bus_effect', 'set_audio_bus',
  'get_animation_tree_structure', 'set_tree_parameter', 'add_state_machine_state',
  'remove_state_machine_state', 'add_state_machine_transition',
  'remove_state_machine_transition', 'set_blend_tree_node', 'analyze_scene_complexity',
  'analyze_signal_flow', 'run_test_scenario', 'assert_node_state',
  'assert_screen_text', 'compare_screenshots', 'run_stress_test', 'get_test_report',
];

const UNSUPPORTED_COMPATIBILITY_TOOLS: CompatibilityToolRoute[] = NATIVE_COMPATIBILITY_TOOL_NAMES.map((toolName) => ({
  toolName,
  canonicalTool: 'compatibility_native',
  riskLevel: nativeRisk(toolName),
  runMode: toolName.includes('game') || toolName.includes('simulate') || toolName.includes('record') || toolName.includes('screenshot') || toolName.includes('test')
    ? 'runtime_bridge_or_file'
    : 'file_system_or_editor_bridge',
}));

export const COMPATIBILITY_TOOL_ROUTES: Record<string, CompatibilityToolRoute> = Object.fromEntries(
  [...ROUTED_COMPATIBILITY_TOOLS, ...UNSUPPORTED_COMPATIBILITY_TOOLS].map((route) => [route.toolName, route])
);

export const REQUIRED_COMPATIBILITY_TOOL_NAMES_17 = [
  ...Object.keys(DIRECT_COMPATIBILITY_ALIASES),
  ...Object.keys(COMPATIBILITY_TOOL_ROUTES),
];
