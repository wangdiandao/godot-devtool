import type { GodotToolDefinition } from './types.js';

export const FILESYSTEM_TOOL_DEFINITIONS: GodotToolDefinition[] = [
  {
    name: 'filesystem_list',
    description: 'List files and directories inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        directory: {
          type: 'string',
          description: 'Project-relative directory. Defaults to project root.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'filesystem_read',
    description: 'Read a UTF-8 text file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Project-relative file path',
        },
      },
      required: ['projectPath', 'filePath'],
    },
  },
  {
    name: 'filesystem_write',
    description: 'Write a UTF-8 text file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Project-relative file path',
        },
        content: {
          type: 'string',
          description: 'UTF-8 text content to write',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing file',
        },
      },
      required: ['projectPath', 'filePath', 'content'],
    },
  },
  {
    name: 'filesystem_delete',
    description: 'Delete a project-local file or directory with explicit confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        targetPath: {
          type: 'string',
          description: 'Project-relative file or directory path to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to delete anything',
        },
        recursive: {
          type: 'boolean',
          description: 'Allow deleting a non-empty directory',
        },
      },
      required: ['projectPath', 'targetPath', 'confirm'],
    },
  },
  {
    name: 'filesystem_preview_delete',
    description: 'Preview a project-local delete operation without deleting files',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        targetPath: { type: 'string', description: 'Project-relative file or directory path to preview' },
        recursive: { type: 'boolean', description: 'Preview recursive directory deletion' },
      },
      required: ['projectPath', 'targetPath'],
    },
  },
];
