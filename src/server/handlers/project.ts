import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createProjectToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    get_project_info: (args) => host.handleGetProjectInfo(args),
    project_get_settings: (args) => host.handleProjectGetSettings(args),
    project_set_setting: (args) => host.handleProjectSetSetting(args),
    project_input_action: (args) => host.handleProjectInputAction(args),
    get_resource_index: (args) => host.handleGetResourceIndex(args),
    resource_dependency_graph: (args) => host.handleResourceDependencyGraph(args),
    get_script_index: (args) => host.handleGetScriptIndex(args),
    get_export_presets: (args) => host.handleGetExportPresets(args),
    check_export_presets: (args) => host.handleCheckExportPresets(args),
    export_matrix: (args) => host.handleExportMatrix(args),
    generate_ci_snippet: (args) => host.handleGenerateCiSnippet(args),
    update_export_preset: (args) => host.handleUpdateExportPreset(args),
    export_project: (args) => host.handleExportProject(args),
    create_gameplay_prototype: (args) => host.handleCreateGameplayPrototype(args),
    create_workflow_test_scene: (args) => host.handleCreateWorkflowTestScene(args),
    get_audit_log: (args) => host.handleGetAuditLog(args),
    run_project_checks: (args) => host.handleRunProjectChecks(args),
    update_project_uids: (args) => host.handleUpdateProjectUids(args),
  };
}
