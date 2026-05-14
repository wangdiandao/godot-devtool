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
  runId: { type: 'string', description: 'Godot runtime run id for multi-instance runtime routes' },
  sessionId: { type: 'string', description: 'Editor or runtime bridge session id for multi-session routing' },
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
      properties: compatibilitySchemaProperties(route),
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

function compatibilitySchemaProperties(route: (typeof COMPATIBILITY_TOOL_ROUTES)[string]): Record<string, unknown> {
  if (route.toolName !== 'simulate_action') return COMPATIBILITY_SCHEMA_PROPERTIES;
  return {
    ...COMPATIBILITY_SCHEMA_PROPERTIES,
    action: {
      type: 'string',
      description: 'InputMap action name to press or release. `name` and `actionName` are accepted as aliases.',
    },
    actionName: {
      type: 'string',
      description: 'Alias for `action` when calling simulate_action.',
    },
    name: {
      type: 'string',
      description: 'Alias for `action` when calling simulate_action.',
    },
    pressed: {
      type: 'boolean',
      description: 'Whether the InputMap action is pressed. Defaults to true.',
    },
    strength: {
      type: 'number',
      description: 'InputMap action strength from 0 to 1. Defaults to 1.',
    },
    parameters: {
      type: 'object',
      description: 'Optional compatibility bag. `pressed` and `strength` are promoted when top-level values are omitted.',
    },
  };
}

function compatibilityDescription(route: (typeof COMPATIBILITY_TOOL_ROUTES)[string]): string {
  if (route.implementationStatus === 'runtime_bridge') {
    return `Runtime WebSocket compatibility route. Executes ${route.toolName} through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected.`;
  }
  if (route.implementationStatus === 'canonical_route') {
    return `${humanizeCompatibilityToolName(route.toolName)} using the ${route.canonicalTool} implementation.`;
  }
  return `Exact-name compatibility route for ${route.toolName}. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable.`;
}

function humanizeCompatibilityToolName(toolName: string): string {
  const words = toolName.split('_').filter(Boolean);
  if (words.length === 0) return 'Run the requested Godot workflow';

  const verbMap: Record<string, string> = {
    add: 'Add',
    assign: 'Assign',
    bake: 'Bake',
    clear: 'Clear',
    connect: 'Connect',
    create: 'Create',
    delete: 'Delete',
    disconnect: 'Disconnect',
    edit: 'Edit',
    fill: 'Fill',
    find: 'Find',
    get: 'Get',
    list: 'List',
    move: 'Move',
    read: 'Read',
    remove: 'Remove',
    set: 'Set',
    setup: 'Set up',
    tilemap: 'Update',
  };
  if (words[0] === 'tilemap' && words.length > 1) {
    const tilemapVerb = verbMap[words[1]] ?? 'Run';
    const tilemapSubject = ['TileMap', ...words.slice(2)]
      .map((word) => (word === 'ui' ? 'UI' : word))
      .join(' ')
      .trim();
    return tilemapSubject ? `${tilemapVerb} ${tilemapSubject}` : `${tilemapVerb} TileMap`;
  }
  const subject = words
    .slice(1)
    .map((word) => (word === 'ui' ? 'UI' : word))
    .join(' ')
    .trim();
  const verb = verbMap[words[0]] ?? 'Run';
  return subject ? `${verb} ${subject}` : `${verb} Godot workflow`;
}
