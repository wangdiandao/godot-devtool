import type { GodotToolDefinition } from './types.js';

export const EDITOR_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'plugin_install',
    description: 'Install the godot-devtool v2 WebSocket editor/runtime plugin into a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        overwrite: { type: 'boolean', description: 'Overwrite existing plugin files' },
        websocketPort: { type: 'number', description: 'Local WebSocket bridge port. Defaults to 8766.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'plugin_status',
    description: 'Read godot-devtool v2 plugin installation status and WebSocket bridge configuration',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'plugin_reload',
    description: 'Reload the godot-devtool v2 editor plugin through the WebSocket bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'scene_open',
    description: 'Open a scene in the MCP session using headless/file-based scene access',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative .tscn path to open',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'scene_get_current',
    description: 'Return the current scene tracked by this MCP session, if one was opened',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Optional path to the Godot project directory to filter the current scene',
        },
      },
      required: [],
    },
  },
  {
    name: 'install_editor_bridge',
    canonicalName: 'plugin_install',
    description: 'Compatibility alias for plugin_install. Install the godot-devtool v2 WebSocket editor/runtime plugin into a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        overwrite: { type: 'boolean', description: 'Overwrite existing bridge plugin files' },
        mode: { type: 'string', enum: ['websocket'], description: 'Bridge mode. v2 only supports websocket.' },
        httpPort: { type: 'number', description: 'HTTP bridge port when mode is http. Defaults to 8765.' },
        websocketPort: { type: 'number', description: 'WebSocket bridge port when mode is websocket. Defaults to 8766.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_bridge_status',
    canonicalName: 'plugin_status',
    description: 'Compatibility alias for plugin_status. Read live editor bridge installation and WebSocket connection status',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_get_selection',
    description: 'Return the current editor selection when a live editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
      },
      required: [],
    },
  },
  {
    name: 'editor_select_node',
    description: 'Select a node in the live Godot editor when an editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path to select',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'editor_undo_redo',
    description: 'Perform undo or redo in the live Godot editor when an editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['undo', 'redo'],
          description: 'Editor history action to perform',
        },
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory with editor bridge installed',
        },
      },
      required: ['projectPath', 'action'],
    },
  },
  {
    name: 'editor_inspector_get_properties',
    description: 'Read Inspector properties from the selected or addressed node through the live editor bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional edited scene path used for command context' },
        nodePath: { type: 'string', description: 'Optional node path. Defaults to the current editor selection.' },
        propertyNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names. Defaults to all Inspector-visible properties.',
        },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_inspector_set_properties',
    description: 'Write Inspector properties on the selected or addressed node through the live editor bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional edited scene path used for command context' },
        nodePath: { type: 'string', description: 'Optional node path. Defaults to the current editor selection.' },
        properties: { type: 'object', description: 'Properties to write, using structured Variant values where needed' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'properties'],
    },
  },
];
