import { CORE_TOOL_DEFINITIONS } from './core.js';
import { PROJECT_TOOL_DEFINITIONS } from './project.js';
import { EDITOR_TOOL_DEFINITIONS } from './editor.js';
import { FILESYSTEM_TOOL_DEFINITIONS } from './filesystem.js';
import { RESOURCE_TOOL_DEFINITIONS } from './resource.js';
import { SCRIPT_TOOL_DEFINITIONS } from './script.js';
import { NODE_TOOL_DEFINITIONS } from './node.js';
import { SCENE_TOOL_DEFINITIONS } from './scene.js';
import { VISUAL_TOOL_DEFINITIONS } from './visual.js';
import { COMPATIBILITY_TOOL_DEFINITIONS } from './compatibility.js';
import type { GodotToolDefinition } from './types.js';
import { routeMetadataForTool } from '../../server/routeRegistry.js';

export const GODOT_TOOL_DEFINITION_GROUPS: GodotToolDefinition[][] = [
  CORE_TOOL_DEFINITIONS,
  PROJECT_TOOL_DEFINITIONS,
  EDITOR_TOOL_DEFINITIONS,
  FILESYSTEM_TOOL_DEFINITIONS,
  RESOURCE_TOOL_DEFINITIONS,
  SCRIPT_TOOL_DEFINITIONS,
  NODE_TOOL_DEFINITIONS,
  SCENE_TOOL_DEFINITIONS,
  VISUAL_TOOL_DEFINITIONS,
  COMPATIBILITY_TOOL_DEFINITIONS,
];

export const BASE_GODOT_TOOL_DEFINITIONS: GodotToolDefinition[] = GODOT_TOOL_DEFINITION_GROUPS
  .flat()
  .map((tool) => ({
    ...tool,
    ...routeMetadataForTool(tool.name),
  }));
