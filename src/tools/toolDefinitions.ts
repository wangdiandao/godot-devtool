export const GODOT_TOOL_ALIASES: Record<string, string> = {
  scene_create: 'create_scene',
  scene_save: 'save_scene',
  scene_get_tree: 'get_scene_tree',
  node_add: 'add_node',
  node_delete: 'delete_node',
  node_rename: 'rename_node',
  script_read: 'read_script_file',
  project_get_info: 'get_project_info',
  debug_get_logs: 'get_debug_output',
};

import { BASE_GODOT_TOOL_DEFINITIONS } from './definitions/index.js';

export const GODOT_TOOL_DEFINITIONS: any[] = [...BASE_GODOT_TOOL_DEFINITIONS];

for (const [aliasName, canonicalName] of Object.entries(GODOT_TOOL_ALIASES)) {
  const canonicalTool = GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === canonicalName);
  if (canonicalTool) {
    GODOT_TOOL_DEFINITIONS.push({
      ...canonicalTool,
      name: aliasName,
      description: `Compatibility alias for ${canonicalName}. ${canonicalTool.description}`,
      canonicalName,
    });
  }
}
