import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { createCoreToolHandlers } from './core.js';
import { createEditorToolHandlers } from './editor.js';
import { createFilesystemToolHandlers } from './filesystem.js';
import { createNodeToolHandlers } from './node.js';
import { createProjectToolHandlers } from './project.js';
import { createResourceToolHandlers } from './resource.js';
import { createSceneToolHandlers } from './scene.js';
import { createScriptToolHandlers } from './script.js';
import { createVisualToolHandlers } from './visual.js';
import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    ...createCoreToolHandlers(host),
    ...createProjectToolHandlers(host),
    ...createEditorToolHandlers(host),
    ...createFilesystemToolHandlers(host),
    ...createResourceToolHandlers(host),
    ...createScriptToolHandlers(host),
    ...createNodeToolHandlers(host),
    ...createSceneToolHandlers(host),
    ...createVisualToolHandlers(host),
  };
}

export function createUnknownToolError(requestedToolName: string): McpError {
  return new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${requestedToolName}`
  );
}
