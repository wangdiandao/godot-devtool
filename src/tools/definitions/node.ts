import type { GodotToolDefinition } from './types.js';

export const NODE_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'node_get',
    description: 'Get node information from a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_move',
    description: 'Move a node by setting its position or reparenting it in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        parentNodePath: { type: 'string', description: 'Optional destination parent node path for reparenting' },
        position: {
          type: 'object',
          description: 'Position value, for example { "type": "Vector2", "value": [x, y] }',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_duplicate',
    description: 'Duplicate a node in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the node to duplicate' },
        newName: { type: 'string', description: 'Optional name for the duplicate node' },
        parentNodePath: { type: 'string', description: 'Optional destination parent node path' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_find',
    description: 'Find nodes in a scene by name, type, or path substring',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        name: { type: 'string', description: 'Optional exact node name to match' },
        type: { type: 'string', description: 'Optional exact Godot class to match' },
        pathContains: { type: 'string', description: 'Optional node path substring to match' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_node_properties',
    description: 'Read selected properties from a node in a Godot scene',
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
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        propertyNames: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional property names to read. Defaults to name, type, position, visible, script.',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'update_node_properties',
    description: 'Update properties on a node in a Godot scene',
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
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        properties: {
          type: 'object',
          description: 'Properties to update. Use { "type": "Vector2", "value": [x, y] } for Vector2 values.',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
    },
  },
  {
    name: 'rename_node',
    description: 'Rename a node in a Godot scene',
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
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        newName: {
          type: 'string',
          description: 'New node name',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'newName'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a non-root node from a Godot scene',
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
          description: 'Path to the non-root node to delete',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'add_node',
    description: 'Add a node to an existing scene',
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
        parentNodePath: {
          type: 'string',
          description: 'Path to the parent node (e.g., "root" or "root/Player")',
        },
        nodeType: {
          type: 'string',
          description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
        },
        nodeName: {
          type: 'string',
          description: 'Name for the new node',
        },
        properties: {
          type: 'object',
          description: 'Optional properties to set on the node',
        },
      },
      required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
    },
  },
];
