import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createEditorToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    scene_open: (args) => host.handleSceneOpen(args),
    scene_get_current: (args) => host.handleSceneGetCurrent(args),
    plugin_install: (args) => host.handleInstallEditorBridge(args),
    plugin_status: (args) => host.handleEditorBridgeStatus(args),
    plugin_reload: (args) => host.handlePluginReload(args),
    install_editor_bridge: (args) => host.handleInstallEditorBridge(args),
    editor_bridge_status: (args) => host.handleEditorBridgeStatus(args),
    editor_get_selection: (args) => host.handleEditorGetSelection(args),
    editor_select_node: (args) => host.handleEditorSelectNode(args),
    editor_undo_redo: (args) => host.handleEditorUndoRedo(args),
    editor_inspector_get_properties: (args) => host.handleEditorInspectorGetProperties(args),
    editor_inspector_set_properties: (args) => host.handleEditorInspectorSetProperties(args),
  };
}
