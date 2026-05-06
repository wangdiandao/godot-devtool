import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createFilesystemToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    filesystem_list: (args) => host.handleFilesystemList(args),
    filesystem_read: (args) => host.handleFilesystemRead(args),
    filesystem_write: (args) => host.handleFilesystemWrite(args),
    filesystem_delete: (args) => host.handleFilesystemDelete(args),
    filesystem_preview_delete: (args) => host.handleFilesystemPreviewDelete(args),
  };
}
