import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createNodeToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    node_get: (args) => host.handleNodeGet(args),
    node_move: (args) => host.handleNodeMove(args),
    node_duplicate: (args) => host.handleNodeDuplicate(args),
    node_find: (args) => host.handleNodeFind(args),
    get_node_properties: (args) => host.handleGetNodeProperties(args),
    update_node_properties: (args) => host.handleUpdateNodeProperties(args),
    rename_node: (args) => host.handleRenameNode(args),
    delete_node: (args) => host.handleDeleteNode(args),
    add_node: (args) => host.handleAddNode(args),
  };
}
