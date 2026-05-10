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
    description: 'Return a lightweight godot-devtool tool catalog by default, with optional filtered input schemas by route group, transport, risk level, tool name, or query',
    inputSchema: {
      type: 'object',
      properties: {
        includeSchemas: {
          type: 'boolean',
          description: 'Include input schemas for the filtered tools. Defaults to false and requires routeGroup, transport, riskLevel, toolNames, or query when true.',
        },
        routeGroup: {
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Optional route group filter such as project, scene, node, visual, editor, runtime, filesystem, resource, script, or core.',
        },
        transport: {
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Optional transport filter such as native, headless_godot, process_control, editor_ws, or runtime_ws.',
        },
        riskLevel: {
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Optional risk-level filter such as read, write, destructive, or process.',
        },
        toolNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional exact tool names to return. When provided, results follow this requested order.',
        },
        query: {
          type: 'string',
          description: 'Optional case-insensitive search across tool name, description, route group, transport, risk level, and canonical name.',
        },
        compact: {
          type: 'boolean',
          description: 'Return compact JSON. Defaults to true; set false for pretty-printed JSON.',
        },
      },
      required: [],
    },
  },
  {
    name: 'browser_visualizer_start',
    description: 'Start a local read-only browser dashboard for Godot editor/runtime bridge status and live-route guidance',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: 'Optional local HTTP port. Use 0 to choose an available port. Defaults to 8767.',
        },
        projectPath: {
          type: 'string',
          description: 'Optional Godot project path used to filter connected bridge clients.',
        },
      },
      required: [],
    },
  },
  {
    name: 'browser_visualizer_status',
    description: 'Read the local Browser visualizer URL, project filter, and connected editor/runtime bridge clients',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'browser_visualizer_stop',
    description: 'Stop the local Browser visualizer HTTP dashboard',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
