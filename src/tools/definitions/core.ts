import type { GodotToolDefinition } from './types.js';

export const CORE_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'launch_editor',
    description: 'Launch Godot editor for a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'run_project',
    description: 'Run the Godot project and capture output',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene: {
          type: 'string',
          description: 'Optional: Specific scene to run',
        },
        headless: {
          type: 'boolean',
          description: 'Run the project in headless mode for automated smoke/debug runs',
        },
        quitAfter: {
          type: 'number',
          description: 'Optional number of frames before Godot quits',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_debug_output',
    description: 'Get the current debug output and errors',
    inputSchema: {
      type: 'object',
      properties: {
        outputOffset: {
          type: 'number',
          description: 'Optional output line offset for windowed reads',
        },
        errorOffset: {
          type: 'number',
          description: 'Optional error line offset for windowed reads',
        },
        tail: {
          type: 'number',
          description: 'Optional maximum number of recent lines to return from each stream',
        },
      },
      required: [],
    },
  },
  {
    name: 'clear_debug_output',
    description: 'Clear buffered output for the currently running Godot project',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'stop_project',
    description: 'Stop the currently running Godot project',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_godot_version',
    description: 'Get the installed Godot version',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_projects',
    description: 'List Godot projects in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to search for Godot projects',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to search recursively (default: false)',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'get_capabilities',
    description: 'Return supported godot-devtool MCP tools, compatibility aliases, run modes, risk levels, and input schemas',
    inputSchema: {
      type: 'object',
      properties: {
        includeAliases: {
          type: 'boolean',
          description: 'Include compatibility alias entries. Defaults to true.',
        },
        includeSchemas: {
          type: 'boolean',
          description: 'Include input schemas for tools. Defaults to true.',
        },
      },
      required: [],
    },
  },
];
