import { COMPATIBILITY_TOOL_ROUTES } from '../compatibilityTools.js';
import type { GodotToolDefinition } from './types.js';

const COMPATIBILITY_SCHEMA_PROPERTIES: Record<string, unknown> = {
  projectPath: { type: 'string', description: 'Path to the Godot project directory' },
  scenePath: { type: 'string', description: 'Project-relative scene path' },
  nodePath: { type: 'string', description: 'Node path inside a scene or runtime tree' },
  parentNodePath: { type: 'string', description: 'Parent node path for create operations' },
  nodeType: { type: 'string', description: 'Godot node type' },
  nodeName: { type: 'string', description: 'Godot node name' },
  scriptPath: { type: 'string', description: 'Project-relative GDScript path' },
  resourcePath: { type: 'string', description: 'Project-relative resource path' },
  filePath: { type: 'string', description: 'Project-relative file path' },
  targetPath: { type: 'string', description: 'Project-relative target path' },
  shaderPath: { type: 'string', description: 'Project-relative shader path' },
  materialPath: { type: 'string', description: 'Project-relative material path' },
  animationPlayerPath: { type: 'string', description: 'AnimationPlayer node path' },
  animationName: { type: 'string', description: 'Animation name' },
  action: { type: 'string', description: 'Optional action for tools that support multiple operations' },
  name: { type: 'string', description: 'General name argument, such as an input action, group, or preset name' },
  type: { type: 'string', description: 'General type filter' },
  text: { type: 'string', description: 'Text argument for UI or search operations' },
  content: { type: 'string', description: 'Full text content for write operations' },
  properties: { type: 'object', description: 'Properties to read, write, create, or inspect' },
  parameters: { type: 'object', description: 'Shader, tree, or tool parameters' },
  changes: { type: 'object', description: 'Project settings or resource changes' },
  position: { description: 'Position value as a structured Godot Variant or simple object' },
  value: { description: 'Generic value argument' },
  cell: { type: 'object', description: 'TileMap cell coordinate' },
  rect: { type: 'object', description: 'TileMap rectangle' },
  sourceId: { type: 'number', description: 'TileMap source id' },
  atlasCoords: { type: 'object', description: 'Tile atlas coordinates' },
  alternativeTile: { type: 'number', description: 'Alternative tile id' },
  trackType: { type: 'string', description: 'Animation track type' },
  trackPath: { type: 'string', description: 'Animation track path' },
  trackIndex: { type: 'number', description: 'Animation track index' },
  time: { type: 'number', description: 'Animation keyframe time' },
  nodePaths: { type: 'array', items: { type: 'string' }, description: 'Node paths for batch operations' },
  propertyNames: { type: 'array', items: { type: 'string' }, description: 'Property names for read operations' },
  timeoutMs: { type: 'number', description: 'Timeout in milliseconds' },
  dryRun: { type: 'boolean', description: 'Preview changes without writing' },
  overwrite: { type: 'boolean', description: 'Allow overwriting existing files or resources' },
  confirm: { type: 'boolean', description: 'Confirm a destructive operation' },
};

export const COMPATIBILITY_TOOL_DEFINITIONS: GodotToolDefinition[] = Object.values(COMPATIBILITY_TOOL_ROUTES).map((route) => {
  const canonicalName = route.canonicalTool !== 'compatibility_native' ? route.canonicalTool : undefined;

  return {
    name: route.toolName,
    description: compatibilityDescription(route),
    ...(canonicalName ? { canonicalName } : {}),
    inputSchema: {
      type: 'object',
      properties: COMPATIBILITY_SCHEMA_PROPERTIES,
      required: [],
    },
    compatibility: {
      since: '1.7.0',
      canonicalTool: route.canonicalTool,
      implementationStatus: route.implementationStatus,
      supported: true,
    },
  };
});

function compatibilityDescription(route: (typeof COMPATIBILITY_TOOL_ROUTES)[string]): string {
  if (route.implementationStatus === 'runtime_bridge') {
    return `Runtime WebSocket compatibility route. Executes ${route.toolName} through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected.`;
  }
  if (route.implementationStatus === 'canonical_route') {
    return `Executable compatibility wrapper for ${route.canonicalTool}. Routes exact-name client calls through the canonical godot-devtool implementation.`;
  }
  return `Exact-name compatibility route for ${route.toolName}. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available.`;
}
