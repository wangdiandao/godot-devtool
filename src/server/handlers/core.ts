import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createCoreToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    launch_editor: (args) => host.handleLaunchEditor(args),
    run_project: (args) => host.handleRunProject(args),
    get_debug_output: (args) => host.handleGetDebugOutput(args),
    clear_debug_output: (args) => host.handleClearDebugOutput(args),
    stop_project: (args) => host.handleStopProject(args),
    get_godot_version: () => host.handleGetGodotVersion(),
    get_capabilities: (args) => host.handleGetCapabilities(args),
    list_projects: (args) => host.handleListProjects(args),
    broker_status: (args) => host.handleBrokerStatus(args),
    list_bridge_sessions: (args) => host.handleListBridgeSessions(args),
    list_run_instances: (args) => host.handleListRunInstances(args),
    stop_run_instance: (args) => host.handleStopRunInstance(args),
    resolve_bridge_target: (args) => host.handleResolveBridgeTarget(args),
    broker_cleanup_idle: (args) => host.handleBrokerCleanupIdle(args),
    browser_visualizer_start: (args) => host.handleBrowserVisualizerStart(args),
    browser_visualizer_status: (args) => host.handleBrowserVisualizerStatus(args),
    browser_visualizer_stop: (args) => host.handleBrowserVisualizerStop(args),
  };
}
