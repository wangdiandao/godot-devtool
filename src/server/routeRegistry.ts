import { COMPATIBILITY_TOOL_ROUTES } from '../tools/compatibilityTools.js';

export type ToolTransport = 'native' | 'headless_godot' | 'process_control' | 'editor_ws' | 'runtime_ws';

export interface RouteMetadata {
  routeGroup: string;
  transport: ToolTransport;
  riskLevel: 'read' | 'write' | 'destructive' | 'process';
  requiresEditor: boolean;
  requiresRuntime: boolean;
}

const PROCESS_TOOLS = new Set([
  'launch_editor',
  'run_project',
  'stop_project',
  'get_debug_output',
  'clear_debug_output',
  'get_godot_version',
  'browser_visualizer_start',
  'browser_visualizer_status',
  'browser_visualizer_stop',
]);

const EDITOR_WS_TOOLS = new Set([
  'plugin_reload',
  'editor_get_selection',
  'editor_select_node',
  'editor_undo_redo',
  'editor_inspector_get_properties',
  'editor_inspector_set_properties',
  'execute_editor_script',
  'get_editor_screenshot',
  'get_open_scripts',
  'reload_plugin',
  'reload_project',
  'get_editor_performance',
]);

const RUNTIME_WS_TOOLS = new Set([
  'get_game_screenshot',
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
  'find_ui_elements',
  'click_button_by_text',
  'wait_for_node',
  'find_nearby_nodes',
  'navigate_to',
  'move_to',
]);

const HEADLESS_GROUPS = new Set(['scene', 'node', 'visual']);
const MULTI_ACTION_WRITE_TOOLS = new Set([
  'animation',
  'animation_state_machine',
  'audio',
  'geometry',
  'group',
  'lighting',
  'material',
  'navigation',
  'particle',
  'physics',
  'project_input_action',
  'shader',
  'signal',
  'tilemap',
  'ui',
]);

export function routeMetadataForTool(toolName: string): RouteMetadata {
  const compatibilityRoute = COMPATIBILITY_TOOL_ROUTES[toolName];
  const canonical = compatibilityRoute?.canonicalTool && compatibilityRoute.canonicalTool !== 'compatibility_native'
    ? compatibilityRoute.canonicalTool
    : toolName;
  const routeGroup = inferRouteGroup(canonical, toolName);
  const transport = inferTransport(toolName, routeGroup);
  return {
    routeGroup,
    transport,
    riskLevel: inferRiskLevel(toolName, compatibilityRoute?.riskLevel),
    requiresEditor: transport === 'editor_ws',
    requiresRuntime: transport === 'runtime_ws',
  };
}

function inferTransport(toolName: string, routeGroup: string): ToolTransport {
  if (toolName === 'plugin_install' || toolName === 'plugin_status') return 'native';
  if (RUNTIME_WS_TOOLS.has(toolName)) return 'runtime_ws';
  if (EDITOR_WS_TOOLS.has(toolName)) return 'editor_ws';
  if (PROCESS_TOOLS.has(toolName)) return 'process_control';
  if (HEADLESS_GROUPS.has(routeGroup)) return 'headless_godot';
  return 'native';
}

function inferRiskLevel(toolName: string, configured?: string): RouteMetadata['riskLevel'] {
  if (configured === 'destructive' || configured === 'write' || configured === 'process') return configured;
  if (PROCESS_TOOLS.has(toolName)) return 'process';
  if (/(delete|remove|clear|stop|kill)/.test(toolName)) return 'destructive';
  if (MULTI_ACTION_WRITE_TOOLS.has(toolName)) return 'write';
  if (/(set|add|create|write|save|install|reload|run|launch|edit|update|attach|connect|disconnect|simulate|click|move|rename|duplicate|export|record|replay|fill)/.test(toolName)) return 'write';
  return 'read';
}

function inferRouteGroup(canonical: string, toolName: string): string {
  const name = canonical === 'compatibility_native' ? toolName : canonical;
  if (name.startsWith('plugin_') || name.startsWith('editor_') || name === 'reload_plugin') return 'editor';
  if (name.includes('runtime') || name.includes('game_') || name.startsWith('simulate_') || name.includes('screenshot') || name.includes('recording') || name.includes('test_') || name.includes('_test') || name.startsWith('assert_')) return 'runtime';
  if (name.includes('project') || name.includes('autoload') || name.includes('input_action')) return 'project';
  if (name.includes('filesystem') || name.includes('file') || name.includes('search')) return 'filesystem';
  if (name.includes('resource') || name.includes('uid') || name.includes('export')) return 'resource';
  if (name.includes('script') || name.includes('gdscript')) return 'script';
  if (name.includes('node') || name.includes('group')) return 'node';
  if (name.includes('scene') || name.includes('animation') || name.includes('tilemap') || name.includes('physics') || name.includes('navigation') || name.includes('audio') || name.includes('signal')) return 'scene';
  if (name.includes('shader') || name.includes('material') || name.includes('lighting') || name.includes('particle') || name.includes('theme') || name.includes('ui')) return 'visual';
  return 'core';
}
