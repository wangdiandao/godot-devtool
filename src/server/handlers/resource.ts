import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createResourceToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    resource_load: (args) => host.handleResourceLoad(args),
    resource_create: (args) => host.handleResourceCreate(args),
    resource_save: (args) => host.handleResourceSave(args),
  };
}
