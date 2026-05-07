import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createCoreToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    launch_editor: (args) => host.handleLaunchEditor(args),
    run_project: (args) => host.handleRunProject(args),
    get_debug_output: (args) => host.handleGetDebugOutput(args),
    clear_debug_output: () => host.handleClearDebugOutput(),
    stop_project: () => host.handleStopProject(),
    get_godot_version: () => host.handleGetGodotVersion(),
    get_capabilities: (args) => host.handleGetCapabilities(args),
    list_projects: (args) => host.handleListProjects(args),
    browser_visualizer_start: (args) => host.handleBrowserVisualizerStart(args),
    browser_visualizer_status: (args) => host.handleBrowserVisualizerStatus(args),
    browser_visualizer_stop: (args) => host.handleBrowserVisualizerStop(args),
  };
}
