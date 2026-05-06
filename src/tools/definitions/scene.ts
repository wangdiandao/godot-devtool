import type { GodotToolDefinition } from './types.js';

export const SCENE_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'create_scene',
    description: 'Create a new Godot scene file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path where the scene file will be saved (relative to project)',
        },
        rootNodeType: {
          type: 'string',
          description: 'Type of the root node (e.g., Node2D, Node3D)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_scene_tree',
    description: 'Return the node tree for a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'load_sprite',
    description: 'Load a sprite into a Sprite2D node',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
        },
        texturePath: {
          type: 'string',
          description: 'Path to the texture file (relative to project)',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
    },
  },
  {
    name: 'export_mesh_library',
    description: 'Export a scene as a MeshLibrary resource',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (.tscn) to export',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the mesh library (.res) will be saved',
        },
        meshItemNames: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional: Names of specific mesh items to include (defaults to all)',
        },
      },
      required: ['projectPath', 'scenePath', 'outputPath'],
    },
  },
  {
    name: 'save_scene',
    description: 'Save changes to a scene file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        newPath: {
          type: 'string',
          description: 'Optional: New path to save the scene to (for creating variants)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_uid',
    description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Path to the file (relative to project) for which to get the UID',
        },
      },
      required: ['projectPath', 'filePath'],
    },
  },
];
