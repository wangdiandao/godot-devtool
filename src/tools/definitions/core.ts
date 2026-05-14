import type { GodotToolDefinition } from './types.js';
import { GET_CAPABILITIES_WORKFLOW_FILTERS, WORKFLOW_TOOL_FILTERS } from '../../server/routeRegistry.js';

export const CORE_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'launch_editor',
    description: 'Reuse an already connected Godot editor for a project, launch one only when no bridge is connected, and refuse to open a replacement editor when the configured bridge port is occupied by another listener',
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
        runId: {
          type: 'string',
          description: 'Optional caller-provided run id. Defaults to a generated id.',
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
        projectPath: {
          type: 'string',
          description: 'Optional Godot project path used to select a run when multiple projects have recent output.',
        },
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
        runId: {
          type: 'string',
          description: 'Optional Godot run instance id. Required when multiple runs are available.',
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
      properties: {
        projectPath: {
          type: 'string',
          description: 'Optional Godot project path used to select a run when multiple projects have recent output.',
        },
        runId: {
          type: 'string',
          description: 'Optional Godot run instance id. Required when multiple runs are available.',
        },
      },
      required: [],
    },
  },
  {
    name: 'stop_project',
    description: 'Stop the currently running Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Optional Godot project path used to select a run when multiple projects are active.',
        },
        runId: {
          type: 'string',
          description: 'Optional Godot run instance id. Required when multiple runs are active.',
        },
      },
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
        workflow: {
          type: 'string',
          enum: GET_CAPABILITIES_WORKFLOW_FILTERS,
          description: 'Optional focused workflow filter for compact context. Use this instead of requesting all schemas.',
          metadata: WORKFLOW_TOOL_FILTERS,
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
    name: 'broker_status',
    description: 'Read the shared godot-devtool 3.0 WebSocket broker status, connected clients, pending commands, and leases',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Optional Godot project path used to filter sessions.' },
        port: { type: 'number', description: 'Optional WebSocket broker port. Defaults to GODOT_DEVTOOL_WS_PORT or 8766.' },
      },
      required: [],
    },
  },
  {
    name: 'list_bridge_sessions',
    description: 'List connected editor/runtime bridge sessions with sessionId, runId, project path, context, and last-seen time',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Optional Godot project path used to filter sessions.' },
        context: { type: 'string', enum: ['editor', 'runtime'], description: 'Optional bridge context filter.' },
        port: { type: 'number', description: 'Optional WebSocket broker port. Defaults to GODOT_DEVTOOL_WS_PORT or 8766.' },
      },
      required: [],
    },
  },
  {
    name: 'list_run_instances',
    description: 'List Godot game/editor run instances managed by this MCP server',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Optional Godot project path used to filter run instances.' },
        includeExited: { type: 'boolean', description: 'Include exited run instances. Defaults to true.' },
      },
      required: [],
    },
  },
  {
    name: 'stop_run_instance',
    description: 'Stop one Godot run instance by runId',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Optional Godot project path guard for the run being stopped.' },
        runId: { type: 'string', description: 'Godot run instance id returned by run_project.' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'resolve_bridge_target',
    description: 'Resolve the editor/runtime bridge target for a project and report ambiguity candidates without sending a command',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory.' },
        context: { type: 'string', enum: ['editor', 'runtime'], description: 'Bridge target context.' },
        sessionId: { type: 'string', description: 'Optional editor/runtime bridge session id.' },
        runId: { type: 'string', description: 'Optional Godot runtime run id.' },
        port: { type: 'number', description: 'Optional WebSocket broker port. Defaults to GODOT_DEVTOOL_WS_PORT or 8766.' },
      },
      required: ['projectPath', 'context'],
    },
  },
  {
    name: 'broker_cleanup_idle',
    description: 'Stop the transient shared broker listener only when no clients, runs, or pending commands require it',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Optional Godot project path used to decide whether the broker is idle.' },
        port: { type: 'number', description: 'Optional WebSocket broker port for status checks. Defaults to GODOT_DEVTOOL_WS_PORT or 8766.' },
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
