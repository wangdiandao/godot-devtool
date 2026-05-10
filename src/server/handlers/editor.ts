import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createEditorToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    scene_open: (args) => host.handleSceneOpen(args),
    scene_get_current: (args) => host.handleSceneGetCurrent(args),
    plugin_install: (args) => host.handleInstallEditorBridge(args),
    plugin_status: (args) => host.handleEditorBridgeStatus(args),
    plugin_cleanup_port: (args) => host.handlePluginCleanupPort(args),
    plugin_reload: (args) => host.handlePluginReload(args),
    editor_get_selection: (args) => host.handleEditorGetSelection(args),
    editor_select_node: (args) => host.handleEditorSelectNode(args),
    editor_undo_redo: (args) => host.handleEditorUndoRedo(args),
    editor_inspector_get_properties: (args) => host.handleEditorInspectorGetProperties(args),
    editor_inspector_set_properties: (args) => host.handleEditorInspectorSetProperties(args),
    editor_add_node: (args) => host.handleEditorAddNode(args),
    editor_delete_node: (args) => host.handleEditorDeleteNode(args),
    editor_rename_node: (args) => host.handleEditorRenameNode(args),
    editor_move_node: (args) => host.handleEditorMoveNode(args),
    editor_duplicate_node: (args) => host.handleEditorDuplicateNode(args),
    editor_save_scene: (args) => host.handleEditorSaveScene(args),
  };
}
