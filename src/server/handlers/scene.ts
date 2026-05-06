import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createSceneToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    create_scene: (args) => host.handleCreateScene(args),
    get_scene_tree: (args) => host.handleGetSceneTree(args),
    load_sprite: (args) => host.handleLoadSprite(args),
    export_mesh_library: (args) => host.handleExportMeshLibrary(args),
    save_scene: (args) => host.handleSaveScene(args),
    get_uid: (args) => host.handleGetUid(args),
  };
}
