import { COMPATIBILITY_TOOL_ROUTES } from '../../tools/compatibilityTools.js';
import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createCompatibilityToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return Object.fromEntries(
    Object.keys(COMPATIBILITY_TOOL_ROUTES).map((toolName) => [
      toolName,
      (args: any) => host.handleCompatibilityTool(toolName, args),
    ])
  );
}
