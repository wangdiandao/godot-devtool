import type { GodotToolDefinition } from './types.js';

export const PROJECT_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'get_project_info',
    description: 'Retrieve metadata about a Godot project',
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
    name: 'project_get_settings',
    description: 'Read Godot project.godot settings by section or section/key list',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        section: { type: 'string', description: 'Optional project.godot section name, such as application or input' },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional section/key values such as application/config/name',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'project_set_setting',
    description: 'Update Godot project.godot settings with dry-run preview and audit logging',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        changes: {
          type: 'object',
          description: 'Settings keyed by section/key, such as {"application/config/name":"Game"}',
        },
        dryRun: { type: 'boolean', description: 'Preview changes without writing project.godot' },
      },
      required: ['projectPath', 'changes'],
    },
  },
  {
    name: 'project_input_action',
    description: 'List or update project InputMap actions in project.godot',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete'], description: 'Input action operation. Defaults to list.' },
        name: { type: 'string', description: 'Input action name for create, update, or delete' },
        deadzone: { type: 'number', description: 'Input action deadzone. Defaults to 0.5.' },
        events: { type: 'array', items: { type: 'object' }, description: 'Serialized Godot input events' },
        dryRun: { type: 'boolean', description: 'Preview changes without writing project.godot' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_resource_index',
    description: 'Return a categorized resource index for a Godot project',
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
    name: 'resource_dependency_graph',
    description: 'Build a resource dependency graph and identify orphan resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_script_index',
    description: 'Return GDScript files with class, base class, exported variables, and functions',
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
    name: 'get_export_presets',
    description: 'Read configured Godot export presets',
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
    name: 'check_export_presets',
    description: 'Inspect Godot export presets and report pre-export issues',
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
    name: 'export_matrix',
    description: 'Summarize export targets, platform families, signing/template status, and CI steps',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'update_export_preset',
    description: 'Update fields or options for a configured Godot export preset',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        presetName: {
          type: 'string',
          description: 'Export preset name from export_presets.cfg',
        },
        fields: {
          type: 'object',
          description: 'Top-level preset fields to update, such as export_path or runnable',
        },
        options: {
          type: 'object',
          description: 'Preset options to update, such as application/icon or custom_template/debug',
        },
      },
      required: ['projectPath', 'presetName'],
    },
  },
  {
    name: 'export_project',
    description: 'Run a controlled Godot export for a configured preset',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        presetName: {
          type: 'string',
          description: 'Export preset name from export_presets.cfg',
        },
        outputPath: {
          type: 'string',
          description: 'Output path relative to the Godot project',
        },
        mode: {
          type: 'string',
          enum: ['debug', 'release', 'pack'],
          description: 'Export mode. Defaults to debug.',
        },
        createOutputDirectory: {
          type: 'boolean',
          description: 'Create the output directory before exporting. Defaults to true.',
        },
      },
      required: ['projectPath', 'presetName', 'outputPath'],
    },
  },
  {
    name: 'create_gameplay_prototype',
    description: 'Create a high-level block-based gameplay prototype scaffold in a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        template: {
          type: 'string',
          enum: ['survivors'],
          description: 'Prototype template. Defaults to survivors.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing generated files. Defaults to false.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'create_workflow_test_scene',
    description: 'Create a small Godot scene for validating MCP scene/script/check workflows',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative .tscn path. Defaults to scenes/devtool_workflow_test.tscn.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing generated files. Defaults to false.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_audit_log',
    description: 'Read godot-devtool project audit log entries',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of recent audit entries to return',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'run_project_checks',
    description: 'Run stable project checks for CI, review, and release workflows',
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
    name: 'update_project_uids',
    description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
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
];
