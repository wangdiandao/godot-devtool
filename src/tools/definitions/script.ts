import type { GodotToolDefinition } from './types.js';

export const SCRIPT_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'script_create',
    description: 'Create a GDScript file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scriptPath: { type: 'string', description: 'Project-relative .gd script path' },
        baseType: { type: 'string', description: 'Base Godot type for generated script. Defaults to Node.' },
        className: { type: 'string', description: 'Optional class_name declaration' },
        content: { type: 'string', description: 'Optional full script content' },
        overwrite: { type: 'boolean', description: 'Required when replacing an existing script' },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'script_write',
    description: 'Write full GDScript content with overwrite protection',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scriptPath: { type: 'string', description: 'Project-relative .gd script path' },
        content: { type: 'string', description: 'Full script content' },
        overwrite: { type: 'boolean', description: 'Required when replacing an existing script' },
      },
      required: ['projectPath', 'scriptPath', 'content'],
    },
  },
  {
    name: 'script_attach',
    description: 'Attach a GDScript resource to a node in a scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        scriptPath: { type: 'string', description: 'Project-relative or res:// .gd script path' },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
    },
  },
  {
    name: 'read_script_file',
    description: 'Read a GDScript file from a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'analyze_script_references',
    description: 'Analyze a GDScript file for class, functions, exports, node paths, and resource references',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'check_gdscript_syntax',
    description: 'Run Godot --check-only against a GDScript file and return diagnostics',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
];
