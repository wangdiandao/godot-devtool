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
    name: 'plugin_cleanup_port',
    description: 'Explicitly inspect and optionally stop stale godot-devtool WebSocket bridge listeners on a local port',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Local WebSocket bridge port. Defaults to 8766.' },
        websocketPort: { type: 'number', description: 'Alias for port.' },
        pid: { type: 'number', description: 'Optional listener PID guard. Required with allowUnverified when command-line verification is unavailable.' },
        kill: { type: 'boolean', description: 'Set true to stop matching stale godot-devtool listeners. Defaults to false dry-run mode.' },
        force: { type: 'boolean', description: 'After a graceful stop times out, forcefully terminate matching listeners. Defaults to false.' },
        allowUnverified: { type: 'boolean', description: 'Allow cleanup of an exact listener PID when the process command line cannot be verified. Requires pid and kill=true.' },
        waitMs: { type: 'number', description: 'Milliseconds to wait after each stop signal. Defaults to 1500.' },
      },
      required: [],
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
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live Inspector property write. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'properties'],
    },
  },
  {
    name: 'editor_add_node',
    description: 'Add a node to the currently open editor scene through UndoRedo without externally rewriting the scene file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        parentNodePath: { type: 'string', description: 'Parent node path. Defaults to the edited scene root.' },
        nodeType: { type: 'string', description: 'Godot node class to instantiate, such as Sprite2D, Node2D, or Camera3D' },
        nodeName: { type: 'string', description: 'Name for the new node' },
        properties: { type: 'object', description: 'Optional Inspector properties to set on the new node before adding it' },
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live change. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'nodeType', 'nodeName'],
    },
  },
  {
    name: 'editor_delete_node',
    description: 'Delete a non-root node from the currently open editor scene through UndoRedo',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        nodePath: { type: 'string', description: 'Path to the non-root node to delete' },
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live change. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'nodePath'],
    },
  },
  {
    name: 'editor_rename_node',
    description: 'Rename a node in the currently open editor scene through UndoRedo',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        nodePath: { type: 'string', description: 'Path to the node to rename' },
        newName: { type: 'string', description: 'New node name' },
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live change. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'nodePath', 'newName'],
    },
  },
  {
    name: 'editor_move_node',
    description: 'Move or reparent a node in the currently open editor scene through UndoRedo',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        parentNodePath: { type: 'string', description: 'Optional destination parent node path for reparenting' },
        position: { type: 'object', description: 'Optional position value, for example { "type": "Vector2", "value": [x, y] }' },
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live change. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'nodePath'],
    },
  },
  {
    name: 'editor_duplicate_node',
    description: 'Duplicate a node in the currently open editor scene through UndoRedo',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        nodePath: { type: 'string', description: 'Path to the node to duplicate' },
        newName: { type: 'string', description: 'Optional name for the duplicate node' },
        parentNodePath: { type: 'string', description: 'Optional destination parent node path' },
        autoSave: { type: 'boolean', description: 'Save the edited scene after the live change. Defaults to false.' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'nodePath'],
    },
  },
  {
    name: 'editor_save_scene',
    description: 'Save the currently open editor scene through the live editor bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional project-relative scene path to verify against the currently open editor scene' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath'],
    },
  },
];
