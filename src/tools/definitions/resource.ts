import type { GodotToolDefinition } from './types.js';

export const RESOURCE_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'resource_load',
    description: 'Load a text-based Godot resource from the project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative resource path',
        },
      },
      required: ['projectPath', 'resourcePath'],
    },
  },
  {
    name: 'resource_create',
    description: 'Create a simple structured Godot resource file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative .tres/.res resource path',
        },
        resourceType: {
          type: 'string',
          description: 'Godot resource type, such as Resource, StandardMaterial3D, or ShaderMaterial',
        },
        properties: {
          type: 'object',
          description: 'Optional top-level resource properties',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing resource',
        },
      },
      required: ['projectPath', 'resourcePath', 'resourceType'],
    },
  },
  {
    name: 'resource_save',
    description: 'Save text-based Godot resource content with overwrite protection',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative resource path',
        },
        content: {
          type: 'string',
          description: 'Full resource file content',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing resource',
        },
      },
      required: ['projectPath', 'resourcePath', 'content'],
    },
  },
];
