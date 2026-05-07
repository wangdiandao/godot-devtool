// @ts-nocheck
/**
 * Extracted GodotServer tool implementations.
 *
 * GodotServer.ts owns process state and stdio lifecycle; this mixin owns the
 * large native/headless/editor/runtime tool implementation surface. Keep new
 * route-specific logic in src/server/handlers/* or src/server/routes/* and only
 * use this file for legacy implementations that still need server internals.
 */

/**
 * godot-devtool MCP server.
 *
 * Provides tools for interacting with Godot Engine projects from MCP clients.
 */

import { join, basename, normalize, dirname, relative, resolve } from 'path';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'fs';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeGodotProject, indexGodotProjectResources } from '../godot/projectAnalysis.js';
import { analyzeGDScriptFile, indexGDScriptFiles, readGDScriptFile } from '../godot/scriptAnalysis.js';
import {
  buildExportMatrix,
  ensureExportOutputDirectory,
  generateCiSnippets,
  inspectExportPresets,
  updateExportPreset,
} from '../godot/exportConfig.js';
import { isSafeProjectRelativePath } from '../godot/pathValidation.js';
import { buildResourceDependencyGraph } from '../godot/resourceDependencies.js';
import { deleteProjectSettings, rawProjectSettingValue, readProjectSettings, writeProjectSettings } from '../godot/projectSettings.js';
import {
  appendAuditEntry,
  createGameplayPrototype,
  createWorkflowTestScene,
  readAuditLog,
  runProjectChecks,
} from '../godot/workflowAutomation.js';
import {
  createEditorUnsupportedResult,
  openSceneFile,
  type SceneOpenResult,
} from '../godot/editorSession.js';
import {
  enqueueEditorCommand,
  enqueueRuntimeCommand,
  installEditorBridge,
  readEditorBridgeStatus,
  readRuntimeBridgeStatus,
  waitForEditorCommandReceipt,
  waitForRuntimeCommandReceipt,
} from '../godot/editorBridge.js';
import {
  deleteProjectPath,
  listProjectDirectory,
  previewProjectDelete,
  readProjectFile,
  writeProjectFile,
} from '../godot/filesystemTools.js';
import {
  createProjectResource,
  loadProjectResource,
  saveProjectResource,
} from '../godot/resourceTools.js';
import {
  createProjectScript,
  writeProjectScript,
} from '../godot/scriptTools.js';
import {
  buildAuditReplay,
  buildDiffSummary,
  readSafetyPolicy,
  suggestRollback,
  writeSafetyPolicy,
} from '../godot/safetyRecovery.js';
import { getOperationsScriptPath } from '../godot/paths.js';
import { COMPATIBILITY_TOOL_ROUTES, type CompatibilityToolRoute } from '../tools/compatibilityTools.js';
import { GODOT_TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';
import { createToolHandlers, createUnknownToolError } from './handlers/index.js';
import { PACKAGE_NAME, PACKAGE_VERSION, godotPathGuidance } from './packageMetadata.js';
import { getBrowserVisualizer } from './transports/browserVisualizer.js';
import { getWsBridge } from './transports/wsBridge.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE
const GODOT_OPERATION_TIMEOUT_MS = Number(process.env.GODOT_DEVTOOL_GODOT_TIMEOUT_MS ?? 120000);

const execFileAsync = promisify(execFile);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
  startedAt: string;
  exitedAt?: string;
  exitCode?: number | null;
}

/**
 * Interface for server configuration
 */
export interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean; // New option to control path validation behavior
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
  [key: string]: any;
}

const BRIDGE_COMPATIBILITY_TOOLS = new Set([
  'get_open_scripts',
  'get_editor_screenshot',
  'execute_editor_script',
  'reload_plugin',
  'reload_project',
  'get_editor_performance',
]);

const RUNTIME_COMPATIBILITY_TOOLS = new Set([
  'get_game_screenshot',
  'simulate_key',
  'simulate_mouse_click',
  'simulate_mouse_move',
  'simulate_action',
  'simulate_sequence',
  'get_game_scene_tree',
  'get_game_node_properties',
  'set_game_node_property',
  'execute_game_script',
  'capture_frames',
  'monitor_properties',
  'start_recording',
  'stop_recording',
  'replay_recording',
  'find_ui_elements',
  'click_button_by_text',
  'wait_for_node',
  'find_nearby_nodes',
  'navigate_to',
  'move_to',
  'get_performance_monitors',
]);


class GodotServerMethodMixin {
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.error(`[DEBUG] ${message}`);
    }
  }

  /**
   * Create a standardized error response with possible solutions
   */
  private createErrorResponse(message: string, possibleSolutions: string[] = []): any {
    // Log the error
    console.error(`[SERVER] Error response: ${message}`);
    if (possibleSolutions.length > 0) {
      console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
    }

    const response: any = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (possibleSolutions.length > 0) {
      response.content.push({
        type: 'text',
        text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
      });
    }

    return response;
  }

  /**
   * Create a standard JSON text response for MCP tool results.
   */
  private createJsonResponse(result: unknown): any {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleCompatibilityTool(toolName: string, args: any) {
    const route = COMPATIBILITY_TOOL_ROUTES[toolName];
    if (!route) {
      return this.createErrorResponse(`Unknown compatibility tool: ${toolName}`);
    }

    const routedArgs = this.buildCompatibilityArgs(route, args || {});
    switch (route.canonicalTool) {
      case 'signal':
        return this.handleP9SceneOperation('signal', routedArgs);
      case 'project_input_action':
        return this.handleProjectInputAction(routedArgs);
      case 'animation':
        return this.handleP9SceneOperation('animation', routedArgs);
      case 'tilemap':
        return this.handleP11SceneOperation('tilemap', routedArgs);
      case 'shader':
        return this.handleP10VisualOperation('shader', routedArgs);
      case 'material':
        return this.handleP10VisualOperation('material', routedArgs);
      case 'lighting':
        return this.handleP10VisualOperation('lighting', routedArgs);
      case 'particle':
        return this.handleP10VisualOperation('particle', routedArgs);
      case 'navigation':
        return this.handleP11SceneOperation('navigation', routedArgs);
      case 'audio':
        return this.handleP11SceneOperation('audio', routedArgs);
      case 'animation_state_machine':
        return this.handleP9SceneOperation('animation_state_machine', routedArgs);
      case 'filesystem_list':
        return this.handleFilesystemList(routedArgs);
      case 'filesystem_read':
        return this.handleFilesystemRead(routedArgs);
      case 'filesystem_delete':
        return this.handleFilesystemDelete(routedArgs);
      case 'resource_create':
        return this.handleResourceCreate(routedArgs);
      case 'resource_save':
        return this.handleResourceSave(routedArgs);
      case 'script_write':
        return this.handleScriptWrite(routedArgs);
      case 'node_find':
        return this.handleNodeFind(routedArgs);
      case 'node_move':
        return this.handleNodeMove(routedArgs);
      case 'export_matrix':
        return this.handleExportMatrix(routedArgs);
      case 'physics':
        return this.handleP11SceneOperation('physics', routedArgs);
      case 'resource_dependency_graph':
        return this.handleResourceDependencyGraph(routedArgs);
      case 'get_project_info':
        return this.handleGetProjectInfo(routedArgs);
      case 'compatibility_native':
        return this.handleNativeCompatibilityTool(toolName, routedArgs);
      default:
        return this.createErrorResponse(
          `Compatibility route ${toolName} points to unsupported canonical tool ${route.canonicalTool}`,
          ['Update src/tools/compatibilityTools.ts and GodotServer.handleCompatibilityTool together']
        );
    }
  }

  private buildCompatibilityArgs(route: CompatibilityToolRoute, args: any): OperationParams {
    const normalizedArgs = this.normalizeParameters(args || {});
    const routedArgs: OperationParams = { ...normalizedArgs };

    if (route.fieldMap) {
      for (const [fromKey, toKey] of Object.entries(route.fieldMap)) {
        if (normalizedArgs[fromKey] !== undefined && routedArgs[toKey] === undefined) {
          routedArgs[toKey] = normalizedArgs[fromKey];
        }
      }
    }

    if (route.fixedArgs) {
      Object.assign(routedArgs, route.fixedArgs);
    }

    return routedArgs;
  }

  private async handleNativeCompatibilityTool(toolName: string, args: any) {
    args = this.normalizeParameters(args || {});
    const projectPathError = this.validateProjectArgs(args);
    if (projectPathError) return projectPathError;

    try {
      if (RUNTIME_COMPATIBILITY_TOOLS.has(toolName)) {
        return this.createJsonResponse(await this.queueRuntimeCompatibilityCommand(toolName, args));
      }

      if (BRIDGE_COMPATIBILITY_TOOLS.has(toolName)) {
        return this.createJsonResponse(await this.queueBridgeCompatibilityCommand(toolName, args));
      }

      switch (toolName) {
        case 'get_editor_errors':
          return this.createJsonResponse(this.getEditorDiagnostics(args));
        case 'search_files':
          return this.createJsonResponse(this.searchProjectFiles(args));
        case 'search_in_files':
        case 'find_node_references':
        case 'find_script_references':
          return this.createJsonResponse(this.searchProjectFileContents(args));
        case 'uid_to_project_path':
          return this.createJsonResponse(this.findProjectPathByUid(args));
        case 'add_scene_instance':
          return this.createJsonResponse(await this.appendSceneInstance(args));
        case 'get_node_groups':
          return this.createJsonResponse(this.getNodeGroups(args));
        case 'set_node_groups':
          return this.createJsonResponse(await this.setNodeGroups(args));
        case 'find_nodes_in_group':
          return this.createJsonResponse(this.findNodesInGroup(args));
        case 'set_anchor_preset':
          return this.handleUpdateNodeProperties({
            ...args,
            properties: {
              ...this.anchorPresetProperties(args.presetName ?? args.preset ?? 'full_rect'),
              ...(args.properties ?? {}),
            },
          });
        case 'find_nodes_by_script':
          return this.createJsonResponse(this.findNodesByScript(args));
        case 'get_autoload':
          return this.createJsonResponse(await this.getAutoloadInfo(args));
        case 'find_ui_elements':
          return this.createJsonResponse(this.findUiElements(args));
        case 'find_nearby_nodes':
          return this.createJsonResponse(this.findNearbyNodes(args));
        case 'tilemap_get_cell':
          return this.handleP11SceneOperation('tilemap', { ...args, action: 'get_cell' });
        case 'tilemap_get_used_cells':
          return this.handleP11SceneOperation('tilemap', { ...args, action: 'get_used_cells' });
        case 'tilemap_clear':
          return this.handleP11SceneOperation('tilemap', { ...args, action: 'clear' });
        case 'set_theme_color':
          return this.handleP9SceneOperation('ui', { ...args, action: 'set_theme_color' });
        case 'set_theme_constant':
          return this.handleP9SceneOperation('ui', { ...args, action: 'set_theme_constant' });
        case 'set_theme_font_size':
          return this.handleP9SceneOperation('ui', { ...args, action: 'set_theme_font_size' });
        case 'set_theme_stylebox':
          return this.handleP9SceneOperation('ui', { ...args, action: 'set_theme_stylebox' });
        case 'get_theme_info':
          return this.handleP9SceneOperation('ui', { ...args, action: 'get_theme_info' });
        case 'find_signal_connections':
        case 'analyze_signal_flow':
          return this.createJsonResponse(this.findSignalConnections(args));
        case 'batch_set_property':
          return this.createJsonResponse(await this.batchSetProperty(args));
        case 'get_scene_dependencies':
          return this.createJsonResponse(this.getSceneDependencies(args));
        case 'cross_scene_set_property':
          return this.createJsonResponse(await this.crossSceneSetProperty(args));
        case 'detect_circular_dependencies':
          return this.createJsonResponse(this.detectCircularDependencies(args));
        case 'edit_shader':
        case 'edit_resource':
          return this.createJsonResponse(await this.editProjectTextResource(toolName, args));
        case 'get_resource_preview':
          return this.createJsonResponse(this.getResourcePreview(args));
        case 'add_autoload':
        case 'remove_autoload':
          return this.createJsonResponse(await this.editAutoload(toolName, args));
        case 'get_physics_layers':
          return this.createJsonResponse(this.getPhysicsLayers(args));
        case 'add_raycast':
          return this.handleAddNode({ ...args, nodeType: args.nodeType ?? 'RayCast2D', nodeName: args.nodeName ?? 'RayCast2D' });
        case 'add_mesh_instance':
          return this.handleAddNode({ ...args, nodeType: 'MeshInstance3D', nodeName: args.nodeName ?? 'MeshInstance3D' });
        case 'setup_camera_3d':
          return this.handleAddNode({ ...args, nodeType: 'Camera3D', nodeName: args.nodeName ?? 'Camera3D' });
        case 'add_gridmap':
          return this.handleAddNode({ ...args, nodeType: 'GridMap', nodeName: args.nodeName ?? 'GridMap' });
        case 'set_particle_material':
        case 'set_particle_color_gradient':
        case 'apply_particle_preset':
          return this.handleP10VisualOperation('particle', { ...args, action: 'create', properties: args.properties ?? args.parameters ?? {} });
        case 'get_particle_info':
          return this.handleP10VisualOperation('particle', { ...args, action: 'list' });
        case 'set_navigation_layers':
          return this.handleP11SceneOperation('navigation', { ...args, action: 'configure_bake', properties: args.properties ?? {} });
        case 'add_audio_bus':
          return this.handleP11SceneOperation('audio', { ...args, action: 'add_bus' });
        case 'add_audio_bus_effect':
          return this.handleP11SceneOperation('audio', { ...args, action: 'add_bus_effect' });
        case 'set_audio_bus':
          return this.handleP11SceneOperation('audio', { ...args, action: 'set_bus' });
        case 'get_animation_tree_structure':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'list' });
        case 'set_tree_parameter':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'set_tree_parameter' });
        case 'add_state_machine_state':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'add_state' });
        case 'remove_state_machine_state':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'remove_state' });
        case 'add_state_machine_transition':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'add_transition' });
        case 'remove_state_machine_transition':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'remove_transition' });
        case 'set_blend_tree_node':
          return this.handleP9SceneOperation('animation_state_machine', { ...args, action: 'set_blend_tree_node' });
        case 'analyze_scene_complexity':
          return this.createJsonResponse(this.analyzeSceneComplexity(args));
        case 'get_editor_performance':
          return this.createJsonResponse(this.getPerformanceSnapshot(toolName, args));
        case 'batch_get_properties':
          return this.createJsonResponse(await this.batchGetProperties(args));
        case 'wait_for_node':
          return this.createJsonResponse(await this.waitForSceneNode(args));
        case 'assert_node_state':
          return this.createJsonResponse(await this.assertNodeState(args));
        case 'compare_screenshots':
          return this.createJsonResponse(await this.compareScreenshotFiles(args));
        case 'assert_screen_text':
          return this.createJsonResponse(await this.assertScreenText(args));
        case 'run_test_scenario':
          return this.createJsonResponse(await this.runCompatibilityTestScenario(args));
        case 'run_stress_test':
          return this.createJsonResponse(await this.runCompatibilityStressTest(args));
        case 'get_test_report':
          return this.createJsonResponse(await this.readQaReport(args));
        default:
          return this.createErrorResponse(`No executable compatibility implementation is registered for ${toolName}`, [
            'Check COMPATIBILITY_TOOL_ROUTES and handleNativeCompatibilityTool before documenting this method as supported.',
          ]);
      }
    } catch (error: any) {
      return this.createErrorResponse(`Failed to run ${toolName}: ${error.message ?? String(error)}`);
    }
  }

  private walkProjectFilesSync(projectPath: string, options: { includeHidden?: boolean; textOnly?: boolean } = {}): string[] {
    const root = resolve(projectPath);
    const result: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!options.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules' || entry.name === 'build') continue;
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        if (entry.isFile()) {
          const relativePath = relative(root, fullPath).replace(/\\/g, '/');
          if (!options.textOnly || /\.(cfg|gd|gdshader|godot|import|json|md|shader|tres|tscn|txt|uid)$/i.test(relativePath)) result.push(relativePath);
        }
      }
    };
    visit(root);
    return result.sort();
  }

  private safeProjectPath(projectPath: string, filePath: string): string {
    const root = realpathSync(resolve(projectPath));
    const relativePath = String(filePath ?? '').replace(/^res:\/\//, '').replace(/\\/g, '/');
    if (!isSafeProjectRelativePath(relativePath)) throw new Error(`Invalid project-relative path: ${filePath}`);
    const absolutePath = resolve(root, relativePath);
    this.assertPathInsideProject(root, absolutePath, filePath);
    this.assertNoSymlinkPathComponents(root, relativePath);
    if (!existsSync(absolutePath)) return absolutePath;
    const realTarget = realpathSync(absolutePath);
    this.assertPathInsideProject(root, realTarget, filePath);
    return realTarget;
  }

  private assertPathInsideProject(projectRoot: string, absolutePath: string, originalPath: string): void {
    const relation = relative(projectRoot, absolutePath);
    if (relation.startsWith('..') || relation === '..' || resolve(relation) === relation) throw new Error(`Path escapes project root: ${originalPath}`);
  }

  private assertNoSymlinkPathComponents(projectRoot: string, relativePath: string): void {
    let current = projectRoot;
    for (const segment of relativePath.split('/').filter((part) => part.length > 0)) {
      current = join(current, segment);
      if (!existsSync(current)) return;
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`Project-relative path resolves through a symlink or junction: ${relativePath}`);
      }
    }
  }

  private readProjectTextSync(projectPath: string, filePath: string): string {
    return readFileSync(this.safeProjectPath(projectPath, filePath), 'utf8');
  }

  private toResourcePath(path: string): string {
    return String(path).startsWith('res://') ? String(path) : `res://${String(path).replace(/\\/g, '/')}`;
  }

  private normalizeScriptPath(scriptPath: string): string {
    const normalized = String(scriptPath ?? '').replace(/^res:\/\//, '').replace(/\\/g, '/');
    if (!isSafeProjectRelativePath(normalized) || !normalized.endsWith('.gd')) {
      throw new Error('Invalid scriptPath. Provide a project-relative .gd script path.');
    }
    return normalized;
  }

  private searchProjectFiles(args: any) {
    const query = String(args.query ?? args.pattern ?? args.name ?? '').toLowerCase();
    const suffix = String(args.glob ?? args.extension ?? '').toLowerCase().replace(/^\*/, '');
    const files = this.walkProjectFilesSync(args.projectPath)
      .filter((path) => (!query || path.toLowerCase().includes(query)) && (!suffix || path.toLowerCase().endsWith(suffix)))
      .slice(0, args.limit ?? 200);
    return { query, count: files.length, files: files.map((path) => `res://${path}`) };
  }

  private searchProjectFileContents(args: any) {
    const query = String(args.query ?? args.pattern ?? args.text ?? '');
    if (!query) return { query, matches: [] };
    const needle = args.caseSensitive === true ? query : query.toLowerCase();
    const matches: any[] = [];
    for (const path of this.walkProjectFilesSync(args.projectPath, { textOnly: true })) {
      const lines = this.readProjectTextSync(args.projectPath, path).split(/\r?\n/);
      lines.forEach((line, index) => {
        if ((args.caseSensitive === true ? line : line.toLowerCase()).includes(needle)) matches.push({ path: `res://${path}`, line: index + 1, text: line });
      });
      if (matches.length >= (args.limit ?? 200)) break;
    }
    return { query, matches: matches.slice(0, args.limit ?? 200) };
  }

  private findProjectPathByUid(args: any) {
    const uid = String(args.uid ?? args.resourceUid ?? '');
    const matches = this.walkProjectFilesSync(args.projectPath, { includeHidden: true, textOnly: true })
      .filter((path) => this.readProjectTextSync(args.projectPath, path).includes(uid))
      .map((path) => ({ path: `res://${path.replace(/\.uid$/, '')}`, uidFile: path.endsWith('.uid') ? `res://${path}` : null }));
    return { uid, path: matches[0]?.path ?? null, matches };
  }

  private parseSceneNodeHeaders(projectPath: string, scenePath: string) {
    const content = this.readProjectTextSync(projectPath, scenePath);
    return [...content.matchAll(/\[node[^\]]+\]/g)].map((match) => {
      const header = match[0];
      return {
        header,
        start: match.index ?? 0,
        end: (match.index ?? 0) + header.length,
        name: header.match(/name="([^"]+)"/)?.[1] ?? '',
        type: header.match(/type="([^"]+)"/)?.[1] ?? '',
        parent: header.match(/parent="([^"]+)"/)?.[1] ?? '',
      };
    });
  }

  private nodePathFromHeader(node: any): string {
    return node.parent ? `${node.parent}/${node.name}` : node.name;
  }

  private findSceneNodeHeader(args: any, content?: string) {
    const nodes = content ? [...content.matchAll(/\[node[^\]]+\]/g)].map((match) => ({ header: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, name: match[0].match(/name="([^"]+)"/)?.[1] ?? '', type: match[0].match(/type="([^"]+)"/)?.[1] ?? '', parent: match[0].match(/parent="([^"]+)"/)?.[1] ?? '' })) : this.parseSceneNodeHeaders(args.projectPath, args.scenePath);
    const wanted = String(args.nodePath ?? args.name ?? '').replace(/^root\/?/, '');
    return nodes.find((node) => this.nodePathFromHeader(node).endsWith(wanted) || node.name === wanted || wanted.endsWith(`/${node.name}`));
  }

  private parseGroups(header: string): string[] {
    return [...(header.match(/\sgroups=\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((group) => group[1]).sort();
  }

  private async appendSceneInstance(args: any) {
    const scenePath = args.scenePath;
    const instanceScenePath = args.instanceScenePath ?? args.resourcePath ?? args.sourceScenePath;
    if (!scenePath || !instanceScenePath) throw new Error('Provide scenePath and instanceScenePath');
    const content = this.readProjectTextSync(args.projectPath, scenePath);
    const extId = `inst_${Date.now().toString(36)}`;
    const nodeName = args.nodeName ?? basename(String(instanceScenePath)).replace(/\.(tscn|scn)$/i, '');
    const parent = args.parentNodePath ? ` parent="${String(args.parentNodePath).replace(/^root\/?/, '')}"` : '';
    const updated = `${content.trimEnd()}\n\n[ext_resource type="PackedScene" path="${this.toResourcePath(instanceScenePath)}" id="${extId}"]\n\n[node name="${nodeName}"${parent} instance=ExtResource("${extId}")]\n`;
    const result = await writeProjectFile(args.projectPath, scenePath, updated, { overwrite: true });
    return { changedFiles: result.changedFiles, instance: { nodeName, scenePath, instanceScenePath: this.toResourcePath(instanceScenePath) } };
  }

  private getNodeGroups(args: any) { return { scenePath: args.scenePath, nodePath: args.nodePath, groups: this.parseGroups(this.findSceneNodeHeader(args)?.header ?? '') }; }

  private async setNodeGroups(args: any) {
    const content = this.readProjectTextSync(args.projectPath, args.scenePath);
    const node = this.findSceneNodeHeader(args, content);
    if (!node) throw new Error(`Node not found: ${args.nodePath}`);
    const groups = Array.isArray(args.groups) ? args.groups.map(String) : [];
    const header = node.header.replace(/\s+groups=\[[^\]]*\]/, '');
    const groupText = groups.length ? ` groups=[${groups.map((group: string) => `"${group}"`).join(', ')}]` : '';
    const updated = `${content.slice(0, node.start)}${header.slice(0, -1)}${groupText}]${content.slice(node.end)}`;
    const result = await writeProjectFile(args.projectPath, args.scenePath, updated, { overwrite: true });
    return { changedFiles: result.changedFiles, groups };
  }

  private findNodesInGroup(args: any) {
    const group = String(args.groupName ?? args.group ?? args.name ?? '');
    return { group, nodes: this.parseSceneNodeHeaders(args.projectPath, args.scenePath).filter((node) => this.parseGroups(node.header).includes(group)).map((node) => ({ name: node.name, type: node.type, path: this.nodePathFromHeader(node) })) };
  }

  private anchorPresetProperties(preset: string): Record<string, unknown> {
    const presets: Record<string, Record<string, unknown>> = {
      full_rect: { anchor_left: 0, anchor_top: 0, anchor_right: 1, anchor_bottom: 1, offset_left: 0, offset_top: 0, offset_right: 0, offset_bottom: 0 },
      center: { anchor_left: 0.5, anchor_top: 0.5, anchor_right: 0.5, anchor_bottom: 0.5 },
      top_left: { anchor_left: 0, anchor_top: 0, anchor_right: 0, anchor_bottom: 0 },
    };
    return presets[preset] ?? presets.full_rect;
  }

  private findNodesByScript(args: any) { const scriptPath = this.toResourcePath(args.scriptPath ?? args.resourcePath ?? ''); return { scriptPath, nodes: this.parseSceneNodeHeaders(args.projectPath, args.scenePath).filter((node) => node.header.includes(scriptPath)).map((node) => ({ name: node.name, type: node.type, path: this.nodePathFromHeader(node) })) }; }
  private async getAutoloadInfo(args: any) { const info = await analyzeGodotProject(args.projectPath); const name = args.name ?? args.autoloadName; return { autoloads: name ? info.autoloads.filter((autoload) => autoload.name === name) : info.autoloads }; }
  private findUiElements(args: any) { const text = String(args.text ?? '').toLowerCase(); const types = new Set(['Control', 'Button', 'Label', 'Panel', 'PanelContainer', 'TextureRect', 'LineEdit', 'TextEdit', 'CheckBox', 'OptionButton']); return { nodes: this.parseSceneNodeHeaders(args.projectPath, args.scenePath).filter((node) => types.has(node.type) || (text && node.name.toLowerCase().includes(text))).map((node) => ({ name: node.name, type: node.type, path: this.nodePathFromHeader(node) })) }; }
  private findNearbyNodes(args: any) { return { origin: args.position ?? args.origin ?? null, radius: args.radius ?? null, nodes: this.parseSceneNodeHeaders(args.projectPath, args.scenePath).map((node) => ({ name: node.name, type: node.type, path: this.nodePathFromHeader(node) })) }; }
  private inspectTileMapData(toolName: string, args: any) { const used = [...this.readProjectTextSync(args.projectPath, args.scenePath).matchAll(/tile_map_data\s*=\s*([^\n\r]+)/g)].map((match) => match[1]); return { toolName, scenePath: args.scenePath, nodePath: args.nodePath, cell: args.cell ?? null, usedCells: used, rawTileMapData: used }; }
  private async clearTileMapData(args: any) { const updated = this.readProjectTextSync(args.projectPath, args.scenePath).replace(/^\s*tile_map_data\s*=.*$/gm, 'tile_map_data = PackedByteArray()'); const result = await writeProjectFile(args.projectPath, args.scenePath, updated, { overwrite: true }); return { changedFiles: result.changedFiles, cleared: true }; }

  private async editThemeResource(toolName: string, args: any) {
    const themePath = args.themePath ?? args.resourcePath;
    if (!themePath) throw new Error('Provide themePath or resourcePath');
    const exists = existsSync(this.safeProjectPath(args.projectPath, themePath));
    const content = exists ? this.readProjectTextSync(args.projectPath, themePath) : '[gd_resource type="Theme" format=3]\n\n[resource]\n';
    const key = args.key ?? args.name ?? toolName.replace(/^set_theme_/, 'default_');
    const value = JSON.stringify(args.value ?? args.color ?? args.constant ?? args.fontSize ?? args.stylebox ?? args.properties ?? null);
    const pattern = new RegExp(`^${this.escapeRegExp(String(key))}\\s*=.*$`, 'm');
    const updated = pattern.test(content) ? content.replace(pattern, `${key} = ${value}`) : `${content.trimEnd()}\n${key} = ${value}\n`;
    const result = await writeProjectFile(args.projectPath, themePath, updated, { overwrite: true });
    return { changedFiles: result.changedFiles, themePath, key };
  }

  private readThemeInfo(args: any) { const themePath = args.themePath ?? args.resourcePath; return { themePath, overrides: this.readProjectTextSync(args.projectPath, themePath).split(/\r?\n/).filter((line) => line.includes('=')).map((line) => line.trim()) }; }
  private findSignalConnections(args: any) { const files = args.scenePath ? [args.scenePath] : this.walkProjectFilesSync(args.projectPath).filter((path) => path.endsWith('.tscn')); const connections: any[] = []; for (const path of files) for (const match of this.readProjectTextSync(args.projectPath, path).matchAll(/\[connection[^\]]+\]/g)) connections.push({ scenePath: `res://${path}`, connection: match[0] }); return { connections }; }
  private async batchSetProperty(args: any) { const nodes = this.parseSceneNodeHeaders(args.projectPath, args.scenePath).filter((node) => !args.type || node.type === args.type); for (const node of nodes) await this.handleUpdateNodeProperties({ ...args, nodePath: this.nodePathFromHeader(node), properties: args.properties ?? { [args.propertyName]: args.value } }); return { changedNodes: nodes.map((node) => this.nodePathFromHeader(node)) }; }
  private getSceneDependencies(args: any) { const dependencies = [...this.readProjectTextSync(args.projectPath, args.scenePath).matchAll(/res:\/\/[^"'\]\)\s,]+/g)].map((match) => match[0]); return { scenePath: args.scenePath, dependencies: [...new Set(dependencies)].sort() }; }
  private async crossSceneSetProperty(args: any) { const changed: any[] = []; for (const scenePath of this.walkProjectFilesSync(args.projectPath).filter((path) => path.endsWith('.tscn'))) { const nodes = this.parseSceneNodeHeaders(args.projectPath, scenePath).filter((node) => !args.type || node.type === args.type); for (const node of nodes) { await this.handleUpdateNodeProperties({ ...args, scenePath, nodePath: this.nodePathFromHeader(node), properties: args.properties ?? { [args.propertyName]: args.value } }); changed.push({ scenePath, nodePath: this.nodePathFromHeader(node) }); } } return { changed }; }
  private detectCircularDependencies(args: any) { const files = this.walkProjectFilesSync(args.projectPath, { textOnly: true }).filter((path) => /\.(tscn|tres|gd)$/i.test(path)); const edges = files.map((path) => ({ from: `res://${path}`, to: [...this.readProjectTextSync(args.projectPath, path).matchAll(/res:\/\/[^"'\]\)\s,]+/g)].map((match) => match[0]) })); return { cycles: edges.filter((edge) => edge.to.some((to) => edges.find((candidate) => candidate.from === to && candidate.to.includes(edge.from)))) }; }

  private async editProjectTextResource(toolName: string, args: any) { const path = args.shaderPath ?? args.resourcePath ?? args.filePath; if (!path) throw new Error('Provide shaderPath, resourcePath, or filePath'); let content = this.readProjectTextSync(args.projectPath, path); if (typeof args.search === 'string') content = content.replaceAll(args.search, String(args.replace ?? '')); else if (typeof args.content === 'string') content = args.content; else if (args.properties && typeof args.properties === 'object') content = `${content.trimEnd()}\n${Object.entries(args.properties).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`; const result = await writeProjectFile(args.projectPath, path, content, { overwrite: true }); return { toolName, changedFiles: result.changedFiles }; }
  private getResourcePreview(args: any) { const path = args.resourcePath ?? args.filePath; const content = this.readProjectTextSync(args.projectPath, path); return { resourcePath: path, size: content.length, preview: content.slice(0, args.maxLength ?? 1000) }; }
  private async editAutoload(toolName: string, args: any) { const name = args.name ?? args.autoloadName; if (!name) throw new Error('Provide autoload name'); if (toolName === 'add_autoload') { const path = args.path ?? args.scriptPath ?? args.resourcePath; if (!path) throw new Error('Provide scriptPath/resourcePath for add_autoload'); return writeProjectSettings(args.projectPath, { changes: { [`autoload/${name}`]: `${args.singleton === false ? '' : '*'}${this.toResourcePath(path)}` }, dryRun: args.dryRun === true }); } return deleteProjectSettings(args.projectPath, [`autoload/${name}`]); }
  private getPhysicsLayers(args: any) { const content = existsSync(join(args.projectPath, 'project.godot')) ? this.readProjectTextSync(args.projectPath, 'project.godot') : ''; return { layers: [...content.matchAll(/layer_names\/(\d+d_physics)\/layer_(\d+)="([^"]+)"/g)].map((match) => ({ domain: match[1], layer: Number(match[2]), name: match[3] })) }; }

  private analyzeSceneComplexity(args: any) { const nodes = this.parseSceneNodeHeaders(args.projectPath, args.scenePath); const byType: Record<string, number> = {}; nodes.forEach((node) => { byType[node.type || 'unknown'] = (byType[node.type || 'unknown'] ?? 0) + 1; }); return { scenePath: args.scenePath, nodeCount: nodes.length, byType, warnings: nodes.length > 500 ? ['Large scene node count'] : [] }; }
  private getPerformanceSnapshot(toolName: string, args: any) { return { toolName, timestamp: new Date().toISOString(), process: { pid: process.pid, memory: process.memoryUsage(), uptime: process.uptime() }, projectPath: args.projectPath ?? null }; }
  private getEditorDiagnostics(args: any) {
    const run = this.activeProcess ?? this.lastRun;
    const output = [...(run?.output ?? []), ...(run?.errors ?? [])].join('\n');
    const diagnostics = this.extractGodotDiagnostics(output);
    const errorLines = (run?.errors ?? [])
      .filter((line) => /error|warning|script error|parse error/i.test(line))
      .slice(-(args.limit ?? 100));
    return {
      source: run ? 'godot_process_output' : 'godot_process_output_unavailable',
      active: this.activeProcess !== null,
      startedAt: run?.startedAt ?? null,
      exitedAt: run?.exitedAt ?? null,
      exitCode: run?.exitCode ?? null,
      diagnostics,
      errorLines,
    };
  }
  private getSceneNodePropertiesFromText(args: any, nodePath: string) {
    const content = this.readProjectTextSync(args.projectPath, args.scenePath);
    const node = this.findSceneNodeHeader({ ...args, nodePath }, content);
    if (!node) throw new Error(`Node not found: ${nodePath}`);
    const properties: Record<string, unknown> = { name: node.name, type: node.type, parent: node.parent, path: this.nodePathFromHeader(node) };
    const nextNodeIndex = content.indexOf('\n[node', node.end);
    const sectionEnd = nextNodeIndex >= 0 ? nextNodeIndex : content.length;
    const body = content.slice(node.end, sectionEnd);
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_\/:.]+)\s*=\s*(.+)$/);
      if (match) properties[match[1]] = match[2].trim();
    }
    return properties;
  }
  private async batchGetProperties(args: any) {
    const nodePaths = Array.isArray(args.nodePaths) ? args.nodePaths.map(String) : this.parseSceneNodeHeaders(args.projectPath, args.scenePath).map((node) => this.nodePathFromHeader(node));
    return {
      scenePath: args.scenePath,
      nodes: nodePaths.map((nodePath: string) => ({ nodePath, properties: this.getSceneNodePropertiesFromText(args, nodePath) })),
    };
  }
  private async waitForSceneNode(args: any) {
    const timeoutMs = Number(args.timeoutMs ?? 5000);
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const found = Boolean(this.findSceneNodeHeader(args));
      if (found) return { found: true, nodePath: args.nodePath, waitedMs: Date.now() - started };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { found: false, nodePath: args.nodePath, waitedMs: Date.now() - started, error: `Node did not appear within ${timeoutMs}ms` };
  }
  private async assertNodeState(args: any) {
    const nodePath = args.nodePath ?? args.path;
    if (!nodePath) throw new Error('nodePath is required');
    const expected = args.expected ?? args.properties ?? {};
    const actual = this.getSceneNodePropertiesFromText(args, nodePath);
    const failures = Object.entries(expected).filter(([key, value]) => String(actual[key]) !== String(value)).map(([key, value]) => ({ property: key, expected: value, actual: actual[key] ?? null }));
    return { passed: failures.length === 0, nodePath, expected, actual, failures };
  }
  private async compareScreenshotFiles(args: any) {
    const baselinePath = args.baselinePath ?? args.expectedPath ?? args.leftPath;
    const actualPath = args.actualPath ?? args.screenshotPath ?? args.rightPath;
    if (!baselinePath || !actualPath) throw new Error('baselinePath and actualPath are required');
    const baseline = readFileSync(this.safeProjectPath(args.projectPath, baselinePath));
    const actual = readFileSync(this.safeProjectPath(args.projectPath, actualPath));
    const equal = baseline.equals(actual);
    return { passed: equal, baselinePath, actualPath, baselineBytes: baseline.length, actualBytes: actual.length, byteDelta: Math.abs(baseline.length - actual.length) };
  }
  private async assertScreenText(args: any) {
    const expected = String(args.text ?? args.expectedText ?? '');
    if (!expected) throw new Error('text or expectedText is required');
    const extractedText = String(args.extractedText ?? args.screenText ?? '');
    if (!extractedText) {
      return { passed: false, expectedText: expected, actualText: '', error: 'No extractedText/screenText was provided. godot-devtool does not fake OCR results; pass text captured from the game UI or use find_ui_elements/click_button_by_text through the runtime bridge.' };
    }
    return { passed: extractedText.includes(expected), expectedText: expected, actualText: extractedText };
  }
  private async writeQaReport(args: any, entry: any) {
    const path = '.godot-devtool/test-report.json';
    const absolutePath = this.safeProjectPath(args.projectPath, path);
    const report = existsSync(absolutePath) ? JSON.parse(readFileSync(absolutePath, 'utf8')) : { runs: [] };
    report.runs.push({ timestamp: new Date().toISOString(), ...entry });
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, JSON.stringify(report, null, 2), 'utf8');
    return { changedFiles: [path], report };
  }
  private async runCompatibilityTestScenario(args: any) {
    const result = await runProjectChecks(args.projectPath);
    return this.writeQaReport(args, { toolName: 'run_test_scenario', scenario: args.scenario ?? args.name ?? 'project_checks', result });
  }
  private async runCompatibilityStressTest(args: any) {
    const iterations = Math.max(1, Math.min(50, Number(args.iterations ?? 3)));
    const runs = [];
    for (let index = 0; index < iterations; index += 1) {
      runs.push(await runProjectChecks(args.projectPath));
    }
    const passed = runs.every((run: any) => run.ok !== false);
    return this.writeQaReport(args, { toolName: 'run_stress_test', iterations, passed, runs });
  }
  private async readQaReport(args: any) {
    const path = '.godot-devtool/test-report.json';
    const absolutePath = this.safeProjectPath(args.projectPath, path);
    return existsSync(absolutePath) ? JSON.parse(readFileSync(absolutePath, 'utf8')) : { runs: [] };
  }
  private async queueBridgeCompatibilityCommand(toolName: string, args: any) {
    const timeoutMs = Number(args.timeoutMs ?? 10000);
    const command = await enqueueEditorCommand(args.projectPath, { type: toolName, payload: args, timeoutMs });
    const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, timeoutMs);
    this.assertCompletedBridgeReceipt(toolName, receipt);
    return {
      toolName,
      commandId: command.commandId,
      commandPath: command.commandPath,
      bridge: 'godot-devtool editor/runtime command queue',
      queued: false,
      status: receipt.status,
      ok: receipt.status === 'completed',
      error: receipt.error ?? '',
      result: receipt.result ?? null,
      receipt,
    };
  }
  private async queueRuntimeCompatibilityCommand(toolName: string, args: any) {
    const status = await readRuntimeBridgeStatus(args.projectPath);
    if (!status.installed) {
      throw new Error('Runtime bridge is not installed. Run plugin_install with overwrite=true, then start the Godot project so the DevtoolRuntime autoload can process commands.');
    }
    if (status.stale) {
      throw new Error(`Runtime bridge is not active. State path ${status.statePath} is ${status.ageMs === null ? 'missing' : `${status.ageMs}ms old`}; start or focus the running Godot project and retry.`);
    }

    const timeoutMs = Number(args.timeoutMs ?? 10000);
    const command = await enqueueRuntimeCommand(args.projectPath, { type: toolName, payload: args, timeoutMs });
    const receipt = await waitForRuntimeCommandReceipt(args.projectPath, command.commandId, timeoutMs);
    this.assertCompletedBridgeReceipt(toolName, receipt);
    return {
      toolName,
      commandId: command.commandId,
      commandPath: command.commandPath,
      bridge: 'godot-devtool runtime command queue',
      queued: false,
      status: receipt.status,
      ok: receipt.status === 'completed',
      error: receipt.error ?? '',
      result: receipt.result ?? null,
      receipt,
    };
  }
  private assertCompletedBridgeReceipt(toolName: string, receipt: any): void {
    if (receipt.status === 'completed') return;
    const error = receipt.error ? `: ${receipt.error}` : '';
    throw new Error(`${toolName} failed through the WebSocket bridge${error}`);
  }
  private async handleBrowserVisualizerStart(args: any) {
    args = this.normalizeParameters(args || {});
    const result = await getBrowserVisualizer().start({
      port: args.port,
      projectPath: args.projectPath,
    });
    return this.createJsonResponse(result);
  }
  private handleBrowserVisualizerStatus(args: any) {
    args = this.normalizeParameters(args || {});
    void args;
    return this.createJsonResponse(getBrowserVisualizer().status());
  }
  private async handleBrowserVisualizerStop(args: any) {
    args = this.normalizeParameters(args || {});
    void args;
    return this.createJsonResponse(await getBrowserVisualizer().stop());
  }
  private escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  private getToolRiskLevel(toolName: string): string {
    const compatibilityRoute = COMPATIBILITY_TOOL_ROUTES[toolName];
    if (compatibilityRoute) {
      if (compatibilityRoute.canonicalTool === 'compatibility_native') {
        return compatibilityRoute.riskLevel ?? 'read';
      }
      return this.getToolRiskLevel(compatibilityRoute.canonicalTool ?? toolName);
    }

    if (['filesystem_delete', 'export_project', 'update_project_uids'].includes(toolName)) {
      return 'dangerous';
    }
    if (toolName === 'set_safety_policy') {
      return 'write';
    }
    if (
      toolName.includes('create') ||
      toolName.includes('write') ||
      toolName.includes('update') ||
      toolName.includes('delete') ||
      toolName.includes('save') ||
      [
        'add_node',
        'rename_node',
        'node_set_property',
        'node_move',
        'node_duplicate',
        'script_attach',
        'animation',
        'animation_state_machine',
        'signal',
        'group',
        'ui',
        'material',
        'shader',
        'lighting',
        'particle',
        'tilemap',
        'geometry',
        'physics',
        'navigation',
        'audio',
        'load_sprite',
        'project_set_setting',
        'project_input_action',
        'editor_inspector_set_properties',
      ].includes(toolName)
    ) {
      return 'write';
    }
    if (['launch_editor', 'run_project', 'stop_project'].includes(toolName)) {
      return 'process';
    }
    return 'read';
  }

  private getToolRunMode(toolName: string): string {
    const compatibilityRoute = COMPATIBILITY_TOOL_ROUTES[toolName];
    if (compatibilityRoute) {
      if (compatibilityRoute.canonicalTool === 'compatibility_native') {
        return compatibilityRoute.runMode ?? 'file_system_or_editor_bridge';
      }
      return this.getToolRunMode(compatibilityRoute.canonicalTool ?? toolName);
    }

    if (['launch_editor'].includes(toolName)) {
      return 'editor_process';
    }
    if (['run_project', 'stop_project', 'get_debug_output', 'clear_debug_output', 'get_godot_version'].includes(toolName)) {
      return 'process_control';
    }
    if (
      [
        'editor_get_selection',
        'editor_select_node',
        'editor_undo_redo',
        'editor_inspector_get_properties',
        'editor_inspector_set_properties',
      ].includes(toolName)
    ) {
      return 'editor_bridge_optional';
    }
    if (
      [
        'create_scene',
        'get_scene_tree',
        'get_node_properties',
        'update_node_properties',
        'rename_node',
        'delete_node',
        'add_node',
        'load_sprite',
        'export_mesh_library',
        'save_scene',
        'get_uid',
        'update_project_uids',
        'node_get',
        'node_move',
        'node_duplicate',
        'node_find',
        'script_attach',
        'animation',
        'animation_state_machine',
        'signal',
        'group',
        'ui',
        'material',
        'shader',
        'lighting',
        'particle',
        'tilemap',
        'geometry',
        'physics',
        'navigation',
        'audio',
      ].includes(toolName)
    ) {
      return 'headless_godot';
    }
    return 'file_system_or_node';
  }

  /**
   * Validate a path to prevent path traversal attacks
   */
  private validatePath(path: string): boolean {
    // Basic validation to prevent path traversal
    if (!path || path.includes('..')) {
      return false;
    }

    // Add more validation as needed
    return true;
  }

  /**
   * Validate a Godot class name to prevent arbitrary script instantiation.
   * Class names must be simple identifiers (e.g. "Node2D", "CharacterBody3D").
   * Rejects anything that looks like a path (res://, absolute paths, dots, slashes, colons).
   */
  private validateClassName(name: string): boolean {
    if (!name) return false;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  }

  /**
   * Validate a node name before passing it to Godot scene mutation operations.
   */
  private validateNodeName(name: string): boolean {
    if (!name) return false;
    return !/[\\/:*?"<>|]/.test(name);
  }

  /**
   * Validate export preset field and option keys before writing export_presets.cfg.
   */
  private validateExportConfigKey(key: string): boolean {
    return /^[A-Za-z0-9_./-]+$/.test(key);
  }

  /**
   * Shared validation for operations that read or mutate an existing scene file.
   */
  private validateSceneOperationArgs(args: any, requiredFields: string[]): any | null {
    for (const field of requiredFields) {
      if (!args[field]) {
        return this.createErrorResponse(
          'Missing required parameters',
          [`Provide ${requiredFields.join(', ')}`]
        );
      }
    }

    for (const field of ['projectPath', 'scenePath', 'nodePath']) {
      if (args[field] && !this.validatePath(args[field])) {
        return this.createErrorResponse(
          `Invalid ${field}`,
          ['Provide valid paths without ".." or other potentially unsafe characters']
        );
      }
    }

    const projectFile = join(args.projectPath, 'project.godot');
    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Not a valid Godot project: ${args.projectPath}`,
        [
          'Ensure the path points to a directory containing a project.godot file',
          'Use list_projects to find valid Godot projects',
        ]
      );
    }

    const scenePath = join(args.projectPath, args.scenePath);
    if (!existsSync(scenePath)) {
      return this.createErrorResponse(
        `Scene file does not exist: ${args.scenePath}`,
        ['Ensure the scene path is correct', 'Use create_scene to create a new scene first']
      );
    }

    return null;
  }

  /**
   * Validate a Godot project path.
   */
  private validateProjectArgs(args: any): any | null {
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    const projectFile = join(args.projectPath, 'project.godot');
    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Not a valid Godot project: ${args.projectPath}`,
        [
          'Ensure the path points to a directory containing a project.godot file',
          'Use list_projects to find valid Godot projects',
        ]
      );
    }

    return null;
  }

  /**
   * Validate script-oriented tool arguments.
   */
  private validateScriptArgs(args: any): any | null {
    const projectValidation = this.validateProjectArgs(args);
    if (projectValidation) return projectValidation;

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a path to a .gd script relative to the project or as res://']
      );
    }

    if (!this.validatePath(args.scriptPath)) {
      return this.createErrorResponse(
        'Invalid script path',
        ['Provide a valid script path without ".." or other potentially unsafe characters']
      );
    }

    if (!args.scriptPath.endsWith('.gd')) {
      return this.createErrorResponse(
        'Invalid script path',
        ['Provide a path to a .gd script']
      );
    }

    const relativeScriptPath = args.scriptPath.startsWith('res://') ? args.scriptPath.slice(6) : args.scriptPath;
    const scriptFile = join(args.projectPath, relativeScriptPath);
    if (!existsSync(scriptFile)) {
      return this.createErrorResponse(
        `Script file does not exist: ${args.scriptPath}`,
        ['Use get_script_index to find available scripts']
      );
    }

    return null;
  }

  /**
   * Run Godot's built-in GDScript parser check.
   */
  private async runGodotSyntaxCheck(projectPath: string, scriptPath: string): Promise<any> {
    const args = ['--headless', '--path', projectPath, '--check-only', '--script', scriptPath];

    try {
      const { stdout, stderr } = await execFileAsync(this.godotPath!, args, { timeout: 30000 });
      return {
        ok: true,
        scriptPath,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        diagnostics: [],
      };
    } catch (error: any) {
      const stdout = error?.stdout ?? '';
      const stderr = error?.stderr ?? '';
      return {
        ok: false,
        scriptPath,
        stdout,
        stderr,
        diagnostics: this.extractGodotDiagnostics(`${stdout}\n${stderr}`),
      };
    }
  }

  private extractGodotDiagnostics(output: string): any[] {
    const diagnostics: any[] = [];
    const lines = output.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const scriptMatch = line.match(/SCRIPT ERROR: (.+)$/);
      if (!scriptMatch) continue;

      const location = lines[index + 1]?.match(/\s+at:\s+(.+):(\d+)/);
      diagnostics.push({
        message: scriptMatch[1].trim(),
        file: location?.[1] ?? null,
        line: location?.[2] ? Number(location[2]) : null,
      });
    }

    return diagnostics;
  }

  /**
   * Extract the JSON object printed by a Godot operation from mixed log output.
   */
  private extractLastJsonObject(output: string): string {
    const trimmed = output.trim();
    const lastJsonStart = trimmed.lastIndexOf('\n{');
    if (lastJsonStart !== -1) {
      return trimmed.slice(lastJsonStart + 1);
    }
    return trimmed;
  }

  /**
   * Synchronous validation for constructor use
   * This is a quick check that only verifies file existence, not executable validity
   * Full validation will be performed later in detectGodotPath
   * @param path Path to check
   * @returns True if the path exists or is 'godot' (which might be in PATH)
   */
  private isValidGodotPathSync(path: string): boolean {
    try {
      this.logDebug(`Quick-validating Godot path: ${path}`);
      return path === 'godot' || existsSync(path);
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      return false;
    }
  }

  /**
   * Validate if a Godot path is valid and executable
   */
  private async isValidGodotPath(path: string): Promise<boolean> {
    // Check cache first
    if (this.validatedPaths.has(path)) {
      return this.validatedPaths.get(path)!;
    }

    try {
      this.logDebug(`Validating Godot path: ${path}`);

      // Check if the file exists (skip for 'godot' which might be in PATH)
      if (path !== 'godot' && !existsSync(path)) {
        this.logDebug(`Path does not exist: ${path}`);
        this.validatedPaths.set(path, false);
        return false;
      }

      // Try to execute Godot with --version flag
      // Using execFileAsync with argument array to prevent command injection
      await execFileAsync(path, ['--version']);

      this.logDebug(`Valid Godot path: ${path}`);
      this.validatedPaths.set(path, true);
      return true;
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      this.validatedPaths.set(path, false);
      return false;
    }
  }

  /**
   * Detect the Godot executable path based on the operating system
   */
  private async detectGodotPath() {
    // If godotPath is already set and valid, use it
    if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
      this.logDebug(`Using existing Godot path: ${this.godotPath}`);
      return;
    }

    // Check environment variable next
    if (process.env.GODOT_PATH) {
      const normalizedPath = normalize(process.env.GODOT_PATH);
      this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
        return;
      } else {
        this.logDebug(`GODOT_PATH environment variable is invalid`);
      }
    }

    // Auto-detect based on platform
    const osPlatform = process.platform;
    this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

    const possiblePaths: string[] = [
      'godot', // Check if 'godot' is in PATH first
    ];

    // Add platform-specific paths
    if (osPlatform === 'darwin') {
      possiblePaths.push(
        '/Applications/Godot.app/Contents/MacOS/Godot',
        '/Applications/Godot_4.app/Contents/MacOS/Godot',
        `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
      );
    } else if (osPlatform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Godot\\Godot.exe',
        'C:\\Program Files (x86)\\Godot\\Godot.exe',
        'C:\\Program Files\\Godot_4\\Godot.exe',
        'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
        `${process.env.USERPROFILE}\\Godot\\Godot.exe`
      );
      if (process.env['ProgramFiles(x86)']) {
        possiblePaths.push(`${process.env['ProgramFiles(x86)']}\\Steam\\steamapps\\common\\Godot Engine\\Godot.exe`);
      }
      if (process.env.ProgramFiles) {
        possiblePaths.push(`${process.env.ProgramFiles}\\Steam\\steamapps\\common\\Godot Engine\\Godot.exe`);
      }
    } else if (osPlatform === 'linux') {
      possiblePaths.push(
        '/usr/bin/godot',
        '/usr/local/bin/godot',
        '/snap/bin/godot',
        `${process.env.HOME}/.local/bin/godot`
      );
    }

    // Try each possible path
    for (const path of possiblePaths) {
      const normalizedPath = normalize(path);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        process.env.GODOT_PATH = normalizedPath;
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    for (const guidance of godotPathGuidance(osPlatform)) {
      console.error(`[SERVER] ${guidance}`);
    }

    if (this.strictPathValidation) {
      // In strict mode, throw an error
      throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
    } else {
      // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
      if (osPlatform === 'win32') {
        this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
      } else if (osPlatform === 'darwin') {
        this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
      } else {
        this.godotPath = normalize('/usr/bin/godot');
      }

      this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
      console.error(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.error(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
    }
  }

  /**
   * Set a custom Godot path
   * @param customPath Path to the Godot executable
   * @returns True if the path is valid and was set, false otherwise
   */
  public async setGodotPath(customPath: string): Promise<boolean> {
    if (!customPath) {
      return false;
    }

    // Normalize the path to ensure consistent format across platforms
    // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
    const normalizedPath = normalize(customPath);
    if (await this.isValidGodotPath(normalizedPath)) {
      this.godotPath = normalizedPath;
      process.env.GODOT_PATH = normalizedPath;
      this.logDebug(`Godot path set to: ${normalizedPath}`);
      return true;
    }

    this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
    return false;
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup() {
    this.logDebug('Cleaning up resources');
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await getBrowserVisualizer().stop();
    await getWsBridge().stop();
    await this.server.close();
  }

  /**
   * Check if the Godot version is 4.4 or later
   * @param version The Godot version string
   * @returns True if the version is 4.4 or later
   */
  private isGodot44OrLater(version: string): boolean {
    const match = version.match(/^(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major > 4 || (major === 4 && minor >= 4);
    }
    return false;
  }

  /**
   * Normalize parameters to camelCase format
   * @param params Object with either snake_case or camelCase keys
   * @returns Object with all keys in camelCase format
   */
  private normalizeParameters(params: OperationParams): OperationParams {
    if (!params || typeof params !== 'object') {
      return params;
    }
    
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        let normalizedKey = key;
        
        // If the key is in snake_case, convert it to camelCase using our mapping
        if (key.includes('_') && this.parameterMappings[key]) {
          normalizedKey = this.parameterMappings[key];
        }
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
        } else {
          result[normalizedKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Convert camelCase keys to snake_case
   * @param params Object with camelCase keys
   * @returns Object with snake_case keys
   */
  private convertCamelToSnakeCase(params: OperationParams): OperationParams {
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        // Convert camelCase to snake_case
        const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
        } else {
          result[snakeKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Execute a Godot operation using the operations script
   * @param operation The operation to execute
   * @param params The parameters for the operation
   * @param projectPath The path to the Godot project
   * @returns The stdout and stderr from the operation
   */
  private async executeOperation(
    operation: string,
    params: OperationParams,
    projectPath: string
  ): Promise<{ stdout: string; stderr: string }> {
    this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
    this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

    // Convert camelCase parameters to snake_case for Godot script
    const snakeCaseParams = this.convertCamelToSnakeCase(params);
    this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);


    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(snakeCaseParams);

      // Build argument array for execFile to prevent command injection
      // Using execFile with argument arrays avoids shell interpretation entirely
      const args = [
        '--headless',
        '--path',
        projectPath,  // Safe: passed as argument, not interpolated into shell command
        '--script',
        this.operationsScriptPath,
        operation,
        paramsJson,  // Safe: passed as argument, not interpreted by shell
      ];

      
      if (GODOT_DEBUG_MODE) {
        args.push('--debug-godot');
      }

      this.logDebug(`Executing: ${this.godotPath} ${args.join(' ')}`);

      const { stdout, stderr } = await execFileAsync(this.godotPath!, args, {
        timeout: GODOT_OPERATION_TIMEOUT_MS,
        killSignal: 'SIGTERM',
        maxBuffer: 20 * 1024 * 1024,
      });

      return { stdout: stdout ?? '', stderr: stderr ?? '' };
    } catch (error: unknown) {
      // If execFileAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string; killed?: boolean; signal?: string };
        const timeoutText = execError.killed || execError.signal === 'SIGTERM'
          ? `\nGodot operation timed out after ${GODOT_OPERATION_TIMEOUT_MS}ms and was terminated.`
          : '';
        return {
          stdout: execError.stdout ?? '',
          stderr: `${execError.stderr ?? ''}${timeoutText}`,
        };
      }

      throw error;
    }
  }

  /**
   * Get the structure of a Godot project
   * @param projectPath Path to the Godot project
   * @returns Object representing the project structure
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    try {
      // Get top-level directories in the project
      const entries = readdirSync(projectPath, { withFileTypes: true });

      const structure: any = {
        scenes: [],
        scripts: [],
        assets: [],
        other: [],
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          // Skip hidden directories
          if (dirName.startsWith('.')) {
            continue;
          }

          // Count files in common directories
          if (dirName === 'scenes' || dirName.includes('scene')) {
            structure.scenes.push(entry.name);
          } else if (dirName === 'scripts' || dirName.includes('script')) {
            structure.scripts.push(entry.name);
          } else if (
            dirName === 'assets' ||
            dirName === 'textures' ||
            dirName === 'models' ||
            dirName === 'sounds' ||
            dirName === 'music'
          ) {
            structure.assets.push(entry.name);
          } else {
            structure.other.push(entry.name);
          }
        }
      }

      return structure;
    } catch (error) {
      this.logDebug(`Error getting project structure: ${error}`);
      return { error: 'Failed to get project structure' };
    }
  }

  /**
   * Find Godot projects in a directory
   * @param directory Directory to search
   * @param recursive Whether to search recursively
   * @returns Array of Godot projects
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
    const projects: Array<{ path: string; name: string }> = [];

    try {
      // Check if the directory itself is a Godot project
      const projectFile = join(directory, 'project.godot');
      if (existsSync(projectFile)) {
        projects.push({
          path: directory,
          name: basename(directory),
        });
      }

      // If not recursive, only check immediate subdirectories
      if (!recursive) {
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            }
          }
        }
      } else {
        // Recursive search
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            // Skip hidden directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            // Check if this directory is a Godot project
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            } else {
              // Recursively search this directory
              const subProjects = this.findGodotProjects(subdir, true);
              projects.push(...subProjects);
            }
          }
        }
      }
    } catch (error) {
      this.logDebug(`Error searching directory ${directory}: ${error}`);
    }

    return projects;
  }

  /**
   * Set up the tool handlers for the MCP server
   */
  private setupToolHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: GODOT_TOOL_DEFINITIONS,
    }));

    const toolHandlers = createToolHandlers(this);

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestedToolName = request.params.name;
      const toolName = requestedToolName;
      this.logDebug(`Handling tool request: ${toolName}`);

      const handler = toolHandlers[toolName];
      if (!handler) {
        throw createUnknownToolError(requestedToolName);
      }

      return await handler(request.params.arguments);
    });
  }

  /**
   * Handle the launch_editor tool
   * @param args Tool arguments
   */
  private async handleLaunchEditor(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
        stdio: 'ignore',
        detached: true,
      });
      const startupError = await new Promise<Error | null>((resolveStartup) => {
        let settled = false;
        const finish = (error: Error | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolveStartup(error);
        };
        const timer = setTimeout(() => finish(null), 500);
        process.once('error', (err: Error) => finish(err));
        process.once('exit', (code: number | null, signal: string | null) => {
          finish(new Error(`Godot editor exited during startup with code ${code ?? 'null'} and signal ${signal ?? 'null'}.`));
        });
      });
      if (startupError) {
        return this.createErrorResponse(`Failed to launch Godot editor: ${startupError.message}`);
      }
      process.unref();

      return {
        content: [
          {
            type: 'text',
            text: `Godot editor launched successfully for project at ${args.projectPath}.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to launch Godot editor: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_capabilities tool.
   */
  private handleGetCapabilities(args: any) {
    args = this.normalizeParameters(args || {});
    const includeSchemas = args.includeSchemas !== false;

    const tools = GODOT_TOOL_DEFINITIONS.map((tool) => {
      const entry: any = {
        name: tool.name,
        description: tool.description,
        routeGroup: tool.routeGroup,
        transport: tool.transport,
        runMode: tool.transport,
        riskLevel: tool.riskLevel,
        requiresEditor: tool.requiresEditor,
        requiresRuntime: tool.requiresRuntime,
        canonicalName: tool.canonicalName,
      };
      if (includeSchemas) {
        entry.inputSchema = tool.inputSchema;
      }
      return entry;
    });

    const result: any = {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      serverMode: 'mcp_stdio',
      bridgeMode: 'websocket',
      executionModes: ['native', 'headless_godot', 'process_control', 'editor_ws', 'runtime_ws'],
      godotPathConfigured: Boolean(this.godotPath || process.env.GODOT_PATH),
      godotPathGuidance: godotPathGuidance(),
      strictPathValidation: this.strictPathValidation,
      toolCount: tools.length,
      tools,
    };

    return this.createJsonResponse(result);
  }

  /**
   * Handle the run_project tool
   * @param args Tool arguments
   */
  private async handleRunProject(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Kill any existing process
      if (this.activeProcess) {
        this.logDebug('Killing existing Godot process before starting a new one');
        this.activeProcess.process.kill();
      }

      const cmdArgs = ['-d'];
      if (args.headless === true) {
        cmdArgs.push('--headless');
      }
      if (Number.isInteger(args.quitAfter) && args.quitAfter >= 0) {
        cmdArgs.push('--quit-after', String(args.quitAfter));
      }
      cmdArgs.push('--path', args.projectPath);
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      const process = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
      const output: string[] = [];
      const errors: string[] = [];

      process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        output.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
        });
      });

      process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        errors.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
        });
      });

      process.on('exit', (code: number | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess.exitedAt = new Date().toISOString();
          this.activeProcess.exitCode = code;
          this.lastRun = this.activeProcess;
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      this.activeProcess = { process, output, errors, startedAt: new Date().toISOString() };

      return {
        content: [
          {
            type: 'text',
            text: `Godot project started in debug mode. Use get_debug_output to see output.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot project: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput(args: any) {
    args = this.normalizeParameters(args || {});
    const run = this.activeProcess ?? this.lastRun;
    if (!run) {
      return this.createErrorResponse(
        'No Godot process output is available.',
        [
          'Use run_project to start a Godot project first',
          'Check if the Godot process crashed unexpectedly',
        ]
      );
    }

    const outputOffset = Number.isInteger(args.outputOffset) && args.outputOffset >= 0 ? args.outputOffset : 0;
    const errorOffset = Number.isInteger(args.errorOffset) && args.errorOffset >= 0 ? args.errorOffset : 0;
    const tail = Number.isInteger(args.tail) && args.tail > 0 ? args.tail : null;
    const outputWindow = run.output.slice(outputOffset);
    const errorWindow = run.errors.slice(errorOffset);
    const output = tail ? outputWindow.slice(-tail) : outputWindow;
    const errors = tail ? errorWindow.slice(-tail) : errorWindow;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              output,
              errors,
              outputOffset,
              errorOffset,
              nextOutputOffset: run.output.length,
              nextErrorOffset: run.errors.length,
              active: this.activeProcess !== null,
              startedAt: run.startedAt,
              exitedAt: run.exitedAt ?? null,
              exitCode: run.exitCode ?? null,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the clear_debug_output tool
   */
  private async handleClearDebugOutput() {
    const run = this.activeProcess ?? this.lastRun;
    if (!run) {
      return this.createErrorResponse(
        'No Godot process output is available.',
        ['Use run_project to start a Godot project first']
      );
    }

    run.output.length = 0;
    run.errors.length = 0;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ message: 'Debug output cleared', nextOutputOffset: 0, nextErrorOffset: 0 }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle the stop_project tool
   */
  private async handleStopProject() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process to stop.',
        [
          'Use run_project to start a Godot project first',
          'The process may have already terminated',
        ]
      );
    }

    this.logDebug('Stopping active Godot process');
    this.activeProcess.process.kill();
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    this.activeProcess = null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Godot project stopped',
              finalOutput: output,
              finalErrors: errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the get_godot_version tool
   */
  private async handleGetGodotVersion() {
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      this.logDebug('Getting Godot version');
      const { stdout } = await execFileAsync(this.godotPath!, ['--version']);
      return {
        content: [
          {
            type: 'text',
            text: stdout.trim(),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get Godot version: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the list_projects tool
   */
  private async handleListProjects(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.directory) {
      return this.createErrorResponse(
        'Directory is required',
        ['Provide a valid directory path to search for Godot projects']
      );
    }

    if (!this.validatePath(args.directory)) {
      return this.createErrorResponse(
        'Invalid directory path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
      if (!existsSync(args.directory)) {
        return this.createErrorResponse(
          `Directory does not exist: ${args.directory}`,
          ['Provide a valid directory path that exists on the system']
        );
      }

      const recursive = args.recursive === true;
      const projects = this.findGodotProjects(args.directory, recursive);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list projects: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the directory exists and is accessible',
          'Check if you have permission to read the directory',
        ]
      );
    }
  }

  /**
   * Get the structure of a Godot project asynchronously by counting files recursively
   * @param projectPath Path to the Godot project
   * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
   */
  private getProjectStructureAsync(projectPath: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const structure = {
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0,
        };

        const scanDirectory = (currentPath: string) => {
          const entries = readdirSync(currentPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = join(currentPath, entry.name);
            
            // Skip hidden files and directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            
            if (entry.isDirectory()) {
              // Recursively scan subdirectories
              scanDirectory(entryPath);
            } else if (entry.isFile()) {
              // Count file by extension
              const ext = entry.name.split('.').pop()?.toLowerCase();
              
              if (ext === 'tscn') {
                structure.scenes++;
              } else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
                structure.scripts++;
              } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
                structure.assets++;
              } else {
                structure.other++;
              }
            }
          }
        };
        
        // Start scanning from the project root
        scanDirectory(projectPath);
        resolve(structure);
      } catch (error) {
        this.logDebug(`Error getting project structure asynchronously: ${error}`);
        resolve({ 
          error: 'Failed to get project structure',
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0
        });
      }
    });
  }

  /**
   * Handle the get_project_info tool
   */
  private async handleGetProjectInfo(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }
  
    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }
  
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }
  
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }
  
      this.logDebug(`Getting project info for: ${args.projectPath}`);
  
      // Get Godot version
      const execOptions = { timeout: 10000 }; // 10 second timeout
      const { stdout } = await execFileAsync(this.godotPath!, ['--version'], execOptions);
  
      const projectAnalysis = await analyzeGodotProject(args.projectPath);
  
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: projectAnalysis.name,
                path: args.projectPath,
                godotVersion: stdout.trim(),
                mainScene: projectAnalysis.mainScene,
                autoloads: projectAnalysis.autoloads,
                inputActions: projectAnalysis.inputActions,
                rendering: projectAnalysis.rendering,
                structure: projectAnalysis.resourceCounts,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get project info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  private async handleProjectGetSettings(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await readProjectSettings(args.projectPath, {
        section: args.section,
        keys: Array.isArray(args.keys) ? args.keys : undefined,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read project settings: ${error?.message || 'Unknown error'}`,
        ['Use section or keys such as application/config/name']
      );
    }
  }

  private async handleProjectSetSetting(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.changes || typeof args.changes !== 'object' || Array.isArray(args.changes)) {
      return this.createErrorResponse(
        'Invalid project settings update',
        ['Provide changes as an object keyed by section/key, for example {"application/config/name":"Game"}']
      );
    }

    try {
      const result = await writeProjectSettings(args.projectPath, {
        changes: args.changes,
        dryRun: args.dryRun === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project settings: ${error?.message || 'Unknown error'}`,
        ['Check setting keys and project.godot write permissions']
      );
    }
  }

  private async handleProjectInputAction(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    const action = args.action ?? 'list';
    try {
      if (action === 'list') {
        const result = await readProjectSettings(args.projectPath, { section: 'input' });
        return this.createJsonResponse(result);
      }

      if (!args.name || typeof args.name !== 'string') {
        return this.createErrorResponse('Input action name is required', ['Provide name for create, update, or delete']);
      }

      if (!/^[A-Za-z0-9_./-]+$/.test(args.name)) {
        return this.createErrorResponse('Invalid input action name', ['Use a simple InputMap action name']);
      }

      if (action === 'create' || action === 'update') {
        const events = Array.isArray(args.events) ? args.events : [];
        const deadzone = typeof args.deadzone === 'number' ? args.deadzone : 0.5;
        const result = await writeProjectSettings(args.projectPath, {
          changes: {
            [`input/${args.name}`]: rawProjectSettingValue(this.formatInputActionProjectValue(deadzone, events)),
          },
          dryRun: args.dryRun === true,
        });
        return this.createJsonResponse(result);
      }

      if (action === 'delete') {
        const result = await deleteProjectSettings(args.projectPath, [`input/${args.name}`], {
          dryRun: args.dryRun === true,
        });
        return this.createJsonResponse(result);
      }

      return this.createErrorResponse('Unsupported input action operation', ['Use list, create, update, or delete']);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to manage input action: ${error?.message || 'Unknown error'}`,
        ['Check the InputMap action name and event payload']
      );
    }
  }

  private formatInputActionProjectValue(deadzone: number, events: unknown[]): string {
    const serializedEvents = events.map((event) => this.formatInputEventProjectValue(event));
    return [
      '{',
      `"deadzone": ${Number.isFinite(deadzone) ? deadzone : 0.5},`,
      `"events": [${serializedEvents.join(', ')}]`,
      '}',
    ].join('\n');
  }

  private formatInputEventProjectValue(event: unknown): string {
    if (typeof event === 'string') {
      const trimmed = event.trim();
      if (/^(Object|InputEvent)/.test(trimmed)) return trimmed;
      return JSON.stringify(trimmed);
    }

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('InputMap events must be Godot event strings or JSON objects with a type field');
    }

    const source = event as Record<string, unknown>;
    const eventType = String(source.type ?? source.class ?? source.eventType ?? 'InputEventKey');
    if (!/^InputEvent[A-Za-z0-9_]*$/.test(eventType)) {
      throw new Error(`Unsupported InputMap event type: ${eventType}`);
    }

    const pairs: string[] = [
      '"resource_local_to_scene": false',
      '"resource_name": ""',
      '"device": ' + this.godotProjectLiteral(source.device ?? -1),
      '"window_id": ' + this.godotProjectLiteral(source.windowId ?? source.window_id ?? 0),
    ];

    for (const [key, value] of Object.entries(source)) {
      if (['type', 'class', 'eventType'].includes(key)) continue;
      pairs.push(`${JSON.stringify(this.toGodotSnakeCase(key))}: ${this.godotProjectLiteral(value)}`);
    }

    if (!pairs.some((pair) => pair.startsWith('"script":'))) {
      pairs.push('"script": null');
    }

    return `Object(${eventType},${pairs.join(',')})`;
  }

  private godotProjectLiteral(value: unknown): string {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^(Object|InputEvent|NodePath|Vector2|Vector3|Color)\(/.test(trimmed)) return trimmed;
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.godotProjectLiteral(entry)).join(', ')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => `${JSON.stringify(this.toGodotSnakeCase(key))}: ${this.godotProjectLiteral(entry)}`);
      return `{${entries.join(', ')}}`;
    }
    return JSON.stringify(String(value));
  }

  private toGodotSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Handle the get_resource_index tool
   */
  private async handleGetResourceIndex(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const resourceIndex = await indexGodotProjectResources(args.projectPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resourceIndex, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get resource index: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the project path is accessible',
          'Verify the project contains a readable project.godot file',
        ]
      );
    }
  }

  private async handleResourceDependencyGraph(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const graph = await buildResourceDependencyGraph(args.projectPath);
      return this.createJsonResponse(graph);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to build resource dependency graph: ${error?.message || 'Unknown error'}`,
        ['Ensure project resources are readable text files where dependency parsing is required']
      );
    }
  }

  /**
   * Handle the get_script_index tool
   */
  private async handleGetScriptIndex(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const scripts = await indexGDScriptFiles(args.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(scripts, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get script index: ${error?.message || 'Unknown error'}`,
        ['Ensure the project scripts are readable']
      );
    }
  }

  /**
   * Handle the get_export_presets tool
   */
  private async handleGetExportPresets(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const inspection = await inspectExportPresets(args.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(inspection.presets, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read export presets: ${error?.message || 'Unknown error'}`,
        ['Ensure export_presets.cfg is readable']
      );
    }
  }

  /**
   * Handle the check_export_presets tool
   */
  private async handleCheckExportPresets(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const inspection = await inspectExportPresets(args.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(inspection, null, 2),
          },
        ],
        isError: inspection.issues.some((issue) => issue.severity === 'error'),
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to check export presets: ${error?.message || 'Unknown error'}`,
        ['Ensure export_presets.cfg is readable']
      );
    }
  }

  private async handleExportMatrix(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const matrix = await buildExportMatrix(args.projectPath);
      return this.createJsonResponse(matrix);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to build export matrix: ${error?.message || 'Unknown error'}`,
        ['Ensure export_presets.cfg is readable']
      );
    }
  }

  private async handleGenerateCiSnippet(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    const provider = args.provider ?? 'all';
    if (!['github_actions', 'gitlab_ci', 'all'].includes(provider)) {
      return this.createErrorResponse(
        'Invalid CI provider',
        ['Use github_actions, gitlab_ci, or all']
      );
    }

    try {
      const snippets = generateCiSnippets(args.projectPath, {
        provider,
        includeExport: args.includeExport !== false,
        includeArtifactUpload: args.includeArtifactUpload !== false,
        presetName: args.presetName,
        outputPath: args.outputPath,
      });

      if (provider === 'github_actions') {
        return this.createJsonResponse({ provider, snippet: snippets.githubActions, commands: snippets.commands });
      }
      if (provider === 'gitlab_ci') {
        return this.createJsonResponse({ provider, snippet: snippets.gitlabCi, commands: snippets.commands });
      }

      return this.createJsonResponse(snippets);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to generate CI snippet: ${error?.message || 'Unknown error'}`,
        ['Provide a valid projectPath and optional presetName/outputPath']
      );
    }
  }

  /**
   * Handle the update_export_preset tool
   */
  private async handleUpdateExportPreset(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.presetName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and presetName']
      );
    }

    const fields = args.fields ?? {};
    const options = args.options ?? {};
    if (typeof fields !== 'object' || Array.isArray(fields) || typeof options !== 'object' || Array.isArray(options)) {
      return this.createErrorResponse(
        'Invalid export preset update',
        ['Provide fields and options as JSON objects']
      );
    }

    for (const key of [...Object.keys(fields), ...Object.keys(options)]) {
      if (!this.validateExportConfigKey(key)) {
        return this.createErrorResponse(
          `Invalid export preset key: ${key}`,
          ['Use simple export preset keys such as export_path, application/icon, or custom_template/debug']
        );
      }
    }

    if (fields.export_path && !isSafeProjectRelativePath(String(fields.export_path))) {
      return this.createErrorResponse(
        'Invalid export_path',
        ['Provide a project-relative export path without ".." or absolute path prefixes']
      );
    }

    try {
      const inspection = await updateExportPreset(args.projectPath, {
        presetName: args.presetName,
        fields,
        options,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(inspection, null, 2),
          },
        ],
        isError: inspection.issues.some((issue) => issue.severity === 'error'),
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update export preset: ${error?.message || 'Unknown error'}`,
        ['Ensure export_presets.cfg is writable', 'Use get_export_presets to list available presets']
      );
    }
  }

  /**
   * Handle the export_project tool
   */
  private async handleExportProject(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.presetName || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, presetName, and outputPath']
      );
    }

    if (!isSafeProjectRelativePath(args.outputPath)) {
      return this.createErrorResponse(
        'Invalid output path',
        ['Provide a project-relative output path without ".." or absolute path prefixes']
      );
    }

    const mode = args.mode ?? 'debug';
    if (!['debug', 'release', 'pack'].includes(mode)) {
      return this.createErrorResponse(
        'Invalid export mode',
        ['Use one of: debug, release, pack']
      );
    }

    try {
      const inspection = await inspectExportPresets(args.projectPath);
      const preset = inspection.presets.find((candidate) => candidate.name === args.presetName);
      if (!preset) {
        return this.createErrorResponse(
          `Export preset not found: ${args.presetName}`,
          ['Use get_export_presets to list available presets']
        );
      }

      if (args.createOutputDirectory !== false) {
        await ensureExportOutputDirectory(args.projectPath, args.outputPath);
      }

      if (!this.godotPath) {
        await this.detectGodotPath();
      }

      const exportFlag = mode === 'release' ? '--export-release' : mode === 'pack' ? '--export-pack' : '--export-debug';
      const godotArgs = ['--headless', '--path', args.projectPath, exportFlag, args.presetName, args.outputPath];

      try {
        const { stdout, stderr } = await execFileAsync(this.godotPath!, godotArgs, { timeout: 120000 });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  mode,
                  presetName: args.presetName,
                  outputPath: args.outputPath,
                  stdout,
                  stderr,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: false,
                  mode,
                  presetName: args.presetName,
                  outputPath: args.outputPath,
                  stdout: error?.stdout ?? '',
                  stderr: error?.stderr ?? '',
                  exitCode: error?.code ?? null,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to export project: ${error?.message || 'Unknown error'}`,
        ['Ensure Godot export templates are installed', 'Verify export_presets.cfg contains the requested preset']
      );
    }
  }

  /**
   * Handle the create_gameplay_prototype tool
   */
  private async handleCreateGameplayPrototype(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await createGameplayPrototype(args.projectPath, {
        template: args.template ?? 'survivors',
        overwrite: args.overwrite === true,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create gameplay prototype: ${error?.message || 'Unknown error'}`,
        ['Use template "survivors"', 'Set overwrite=true only when replacing generated files intentionally']
      );
    }
  }

  /**
   * Handle the create_workflow_test_scene tool
   */
  private async handleCreateWorkflowTestScene(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (args.scenePath && (!isSafeProjectRelativePath(args.scenePath) || !args.scenePath.endsWith('.tscn'))) {
      return this.createErrorResponse(
        'Invalid scenePath',
        ['Provide a project-relative .tscn path without ".." or absolute path prefixes']
      );
    }

    try {
      const result = await createWorkflowTestScene(args.projectPath, {
        scenePath: args.scenePath,
        overwrite: args.overwrite === true,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create workflow test scene: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative .tscn path', 'Set overwrite=true only when replacing generated files intentionally']
      );
    }
  }

  /**
   * Handle the get_audit_log tool
   */
  private async handleGetAuditLog(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await readAuditLog(args.projectPath, args.limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read audit log: ${error?.message || 'Unknown error'}`,
        ['Ensure the project path is readable']
      );
    }
  }

  private async handleGetSafetyPolicy(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await readSafetyPolicy(args.projectPath));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read safety policy: ${error?.message || 'Unknown error'}`,
        ['Ensure the project path is readable']
      );
    }
  }

  private async handleSetSafetyPolicy(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await writeSafetyPolicy(args.projectPath, {
        enabled: args.enabled === true,
        writeAllowlist: args.writeAllowlist ?? [],
        blockedPaths: args.blockedPaths ?? [],
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to set safety policy: ${error?.message || 'Unknown error'}`,
        ['Use project-relative allowlist and blocked path patterns such as scripts/**']
      );
    }
  }

  private async handlePreviewWriteSafety(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.operation || !Array.isArray(args.changes)) {
      return this.createErrorResponse('Missing required parameters', ['Provide operation and changes']);
    }

    try {
      return this.createJsonResponse(await buildDiffSummary(args.projectPath, {
        operation: args.operation,
        riskLevel: args.riskLevel,
        changes: args.changes,
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to preview write safety: ${error?.message || 'Unknown error'}`,
        ['Use project-relative change paths inside the Godot project']
      );
    }
  }

  private async handleGetAuditReplay(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await buildAuditReplay(args.projectPath, { limit: args.limit }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to build audit replay: ${error?.message || 'Unknown error'}`,
        ['Ensure .godot-devtool/audit.jsonl is readable']
      );
    }
  }

  private async handleGetRollbackSuggestions(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.operation) {
      return this.createErrorResponse('Missing required parameters', ['Provide operation']);
    }

    try {
      return this.createJsonResponse(await suggestRollback(args.projectPath, {
        operation: args.operation,
        changedFiles: Array.isArray(args.changedFiles) ? args.changedFiles : [],
        skippedFiles: Array.isArray(args.skippedFiles) ? args.skippedFiles : [],
        details: args.details && typeof args.details === 'object' && !Array.isArray(args.details) ? args.details : {},
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get rollback suggestions: ${error?.message || 'Unknown error'}`,
        ['Provide an operation name and optional changedFiles from the audit log']
      );
    }
  }

  /**
   * Handle the run_project_checks tool
   */
  private async handleRunProjectChecks(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await runProjectChecks(args.projectPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.ok,
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run project checks: ${error?.message || 'Unknown error'}`,
        ['Ensure the project is readable and contains project.godot']
      );
    }
  }

  /**
   * Handle the scene_open tool
   */
  private async handleSceneOpen(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.scenePath || !isSafeProjectRelativePath(args.scenePath) || !args.scenePath.endsWith('.tscn')) {
      return this.createErrorResponse(
        'Invalid scenePath',
        ['Provide a project-relative .tscn path without ".." or absolute path prefixes']
      );
    }

    try {
      const result = await openSceneFile(args.projectPath, args.scenePath);
      this.currentScene = result;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to open scene: ${error?.message || 'Unknown error'}`,
        ['Use get_resource_index to find valid scenes']
      );
    }
  }

  /**
   * Handle the scene_get_current tool
   */
  private async handleSceneGetCurrent(args: any) {
    args = this.normalizeParameters(args || {});

    if (args.projectPath && !this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    if (!this.currentScene || (args.projectPath && this.currentScene.projectPath !== args.projectPath)) {
      const result = {
        ok: false,
        status: 'unsupported',
        mode: 'headless_file',
        message: 'No current scene is available. Use scene_open first. Reading the live editor current scene requires an editor bridge.',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(this.currentScene, null, 2),
        },
      ],
    };
  }

  private async handleInstallEditorBridge(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await installEditorBridge(args.projectPath, {
        overwrite: args.overwrite === true,
        mode: args.mode,
        httpPort: args.httpPort,
        websocketPort: args.websocketPort,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to install editor bridge: ${error?.message || 'Unknown error'}`,
        ['Ensure the project addons directory is writable']
      );
    }
  }

  private async handleEditorBridgeStatus(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await readEditorBridgeStatus(args.projectPath);
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read editor bridge status: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  private async handlePluginReload(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const command = await enqueueEditorCommand(args.projectPath, {
        type: 'plugin_reload',
        payload: {},
        timeoutMs: args.timeoutMs,
      });
      const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, Number(args.timeoutMs ?? 10000));
      this.assertCompletedBridgeReceipt('plugin_reload', receipt);
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_websocket_bridge',
        command,
        receipt,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to reload plugin: ${error?.message || 'Unknown error'}`,
        ['Install and enable the godot-devtool plugin, then confirm the WebSocket bridge is connected']
      );
    }
  }

  private async handleEditorGetSelection(args: any) {
    args = this.normalizeParameters(args || {});
    if (!args.projectPath) {
      return this.handleEditorUnsupported('editor_get_selection');
    }

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const status = await readEditorBridgeStatus(args.projectPath);
      return this.createJsonResponse({
        ok: status.installed,
        mode: 'godot_editor_file_bridge',
        selection: (status.lastState?.selection as unknown[]) ?? [],
        currentScene: status.lastState?.currentScene ?? null,
        updatedAt: status.lastState?.updatedAt ?? null,
        pendingCommands: status.pendingCommands,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read editor selection: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  private async handleEditorSelectNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required', ['Provide a node path to select']);
    }

    try {
      const command = await enqueueEditorCommand(args.projectPath, {
        type: 'select_node',
        payload: {
          scenePath: args.scenePath ?? null,
          nodePath: args.nodePath,
        },
        timeoutMs: args.timeoutMs,
      });
      const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, Number(args.timeoutMs ?? 10000));
      this.assertCompletedBridgeReceipt('editor_select_node', receipt);
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_websocket_bridge',
        command,
        receipt,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue editor selection: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  private async handleEditorUndoRedo(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!['undo', 'redo'].includes(args.action)) {
      return this.createErrorResponse('Invalid editor action', ['Use undo or redo']);
    }

    try {
      const command = await enqueueEditorCommand(args.projectPath, {
        type: args.action,
        payload: {},
        timeoutMs: args.timeoutMs,
      });
      const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, Number(args.timeoutMs ?? 10000));
      this.assertCompletedBridgeReceipt('editor_undo_redo', receipt);
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_websocket_bridge',
        command,
        receipt,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue editor history action: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  private async handleEditorInspectorGetProperties(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (args.propertyNames && !Array.isArray(args.propertyNames)) {
      return this.createErrorResponse('Invalid propertyNames', ['Provide propertyNames as an array of strings']);
    }

    try {
      const command = await enqueueEditorCommand(args.projectPath, {
        type: 'inspector_get_properties',
        payload: {
          scenePath: args.scenePath ?? null,
          nodePath: args.nodePath ?? null,
          propertyNames: args.propertyNames ?? [],
        },
        timeoutMs: args.timeoutMs,
      });
      const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, Number(args.timeoutMs ?? 10000));
      this.assertCompletedBridgeReceipt('editor_inspector_get_properties', receipt);
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_websocket_bridge',
        command,
        receipt,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue inspector property read: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  private async handleEditorInspectorSetProperties(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.properties || typeof args.properties !== 'object' || Array.isArray(args.properties)) {
      return this.createErrorResponse('Invalid properties', ['Provide properties as an object']);
    }

    try {
      const command = await enqueueEditorCommand(args.projectPath, {
        type: 'inspector_set_properties',
        payload: {
          scenePath: args.scenePath ?? null,
          nodePath: args.nodePath ?? null,
          properties: args.properties,
        },
        timeoutMs: args.timeoutMs,
      });
      const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, Number(args.timeoutMs ?? 10000));
      this.assertCompletedBridgeReceipt('editor_inspector_set_properties', receipt);
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_websocket_bridge',
        command,
        receipt,
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue inspector property write: ${error?.message || 'Unknown error'}`,
        ['Install and enable the editor bridge plugin first']
      );
    }
  }

  /**
   * Return an explicit unsupported response for editor-online tools.
   */
  private handleEditorUnsupported(operation: string) {
    const result = createEditorUnsupportedResult(operation);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: true,
    };
  }

  /**
   * Handle the filesystem_list tool
   */
  private async handleFilesystemList(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      const result = await listProjectDirectory(args.projectPath, args.directory ?? '.');
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list project directory: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative directory path inside the Godot project']
      );
    }
  }

  /**
   * Handle the filesystem_read tool
   */
  private async handleFilesystemRead(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.filePath) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath and filePath']);
    }

    try {
      const result = await readProjectFile(args.projectPath, args.filePath);
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read project file: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative file path inside the Godot project']
      );
    }
  }

  /**
   * Handle the filesystem_write tool
   */
  private async handleFilesystemWrite(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.filePath || typeof args.content !== 'string') {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, filePath, and content']);
    }

    try {
      const result = await writeProjectFile(args.projectPath, args.filePath, args.content, {
        overwrite: args.overwrite === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to write project file: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative file path', 'Pass overwrite=true only when replacing an existing file intentionally']
      );
    }
  }

  /**
   * Handle the filesystem_delete tool
   */
  private async handleFilesystemDelete(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.targetPath) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, targetPath, and confirm=true']);
    }

    try {
      const result = await deleteProjectPath(args.projectPath, args.targetPath, {
        confirm: args.confirm === true,
        recursive: args.recursive === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to delete project path: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative target path', 'Pass confirm=true for any delete operation']
      );
    }
  }

  private async handleFilesystemPreviewDelete(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.targetPath) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath and targetPath']);
    }

    try {
      const result = await previewProjectDelete(args.projectPath, args.targetPath, {
        recursive: args.recursive === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to preview project delete: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative path inside the Godot project']
      );
    }
  }

  /**
   * Handle the resource_load tool
   */
  private async handleResourceLoad(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.resourcePath) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath and resourcePath']);
    }

    try {
      const result = await loadProjectResource(args.projectPath, args.resourcePath);
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to load resource: ${error?.message || 'Unknown error'}`,
        ['Use a supported project-relative resource path']
      );
    }
  }

  /**
   * Handle the resource_create tool
   */
  private async handleResourceCreate(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.resourcePath || !args.resourceType) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, resourcePath, and resourceType']);
    }

    try {
      const result = await createProjectResource(args.projectPath, {
        resourcePath: args.resourcePath,
        resourceType: args.resourceType,
        properties: args.properties ?? {},
        overwrite: args.overwrite === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create resource: ${error?.message || 'Unknown error'}`,
        ['Use a supported project-relative resource path', 'Pass overwrite=true only when replacing an existing resource intentionally']
      );
    }
  }

  /**
   * Handle the resource_save tool
   */
  private async handleResourceSave(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.resourcePath || typeof args.content !== 'string') {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, resourcePath, and content']);
    }

    try {
      const result = await saveProjectResource(args.projectPath, {
        resourcePath: args.resourcePath,
        content: args.content,
        overwrite: args.overwrite === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to save resource: ${error?.message || 'Unknown error'}`,
        ['Use a supported project-relative resource path', 'Pass overwrite=true only when replacing an existing resource intentionally']
      );
    }
  }

  /**
   * Handle the script_create tool
   */
  private async handleScriptCreate(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.scriptPath) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath and scriptPath']);
    }

    try {
      const result = await createProjectScript(args.projectPath, {
        scriptPath: args.scriptPath,
        baseType: args.baseType,
        className: args.className,
        content: args.content,
        overwrite: args.overwrite === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create script: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative .gd path', 'Pass overwrite=true only when replacing an existing script intentionally']
      );
    }
  }

  /**
   * Handle the script_write tool
   */
  private async handleScriptWrite(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.scriptPath || typeof args.content !== 'string') {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, scriptPath, and content']);
    }

    try {
      const result = await writeProjectScript(args.projectPath, {
        scriptPath: args.scriptPath,
        content: args.content,
        overwrite: args.overwrite === true,
      });
      return this.createJsonResponse(result);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to write script: ${error?.message || 'Unknown error'}`,
        ['Use a project-relative .gd path', 'Pass overwrite=true only when replacing an existing script intentionally']
      );
    }
  }

  /**
   * Handle the script_attach tool
   */
  private async handleScriptAttach(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath', 'scriptPath']);
    if (validationError) return validationError;

    try {
      const scriptPath = this.normalizeScriptPath(args.scriptPath);
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        scriptPath,
      };
      const { stdout, stderr } = await this.executeOperation('script_attach', params, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to attach script: ${stderr}`);
      }

      await appendAuditEntry(args.projectPath, {
        operation: 'script_attach',
        changedFiles: [args.scenePath],
        skippedFiles: [],
        details: {
          nodePath: args.nodePath,
          scriptPath,
        },
      });

      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to attach script: ${error?.message || 'Unknown error'}`,
        ['Ensure the scene, node, and script all exist']
      );
    }
  }

  /**
   * Handle the node_get tool
   */
  private async handleNodeGet(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;

    try {
      const { stdout, stderr } = await this.executeOperation('node_get', {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      }, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to get node: ${stderr}`);
      }
      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get node: ${error?.message || 'Unknown error'}`,
        ['Ensure the scene and node path exist']
      );
    }
  }

  /**
   * Handle the node_move tool
   */
  private async handleNodeMove(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;
    if (!args.position && !args.parentNodePath) {
      return this.createErrorResponse('Missing required parameters', ['Provide position or parentNodePath']);
    }

    try {
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };
      if (args.position) params.position = args.position;
      if (args.parentNodePath) params.parentNodePath = args.parentNodePath;

      const { stdout, stderr } = await this.executeOperation('node_move', params, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to move node: ${stderr}`);
      }
      await appendAuditEntry(args.projectPath, {
        operation: 'node_move',
        changedFiles: [args.scenePath],
        skippedFiles: [],
        details: {
          nodePath: args.nodePath,
          parentNodePath: args.parentNodePath ?? null,
          position: args.position ?? null,
        },
      });
      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to move node: ${error?.message || 'Unknown error'}`,
        ['Ensure the node exists, the destination parent exists, and position is valid when provided']
      );
    }
  }

  /**
   * Handle the node_duplicate tool
   */
  private async handleNodeDuplicate(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;
    if (args.newName && !this.validateNodeName(args.newName)) {
      return this.createErrorResponse('Invalid node name', ['Provide a valid duplicate node name']);
    }

    try {
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };
      if (args.newName) params.newName = args.newName;
      if (args.parentNodePath) params.parentNodePath = args.parentNodePath;

      const { stdout, stderr } = await this.executeOperation('node_duplicate', params, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to duplicate node: ${stderr}`);
      }
      await appendAuditEntry(args.projectPath, {
        operation: 'node_duplicate',
        changedFiles: [args.scenePath],
        skippedFiles: [],
        details: { nodePath: args.nodePath, newName: args.newName ?? null },
      });
      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to duplicate node: ${error?.message || 'Unknown error'}`,
        ['Ensure the node exists and the duplicate name is valid']
      );
    }
  }

  /**
   * Handle the node_find tool
   */
  private async handleNodeFind(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath']);
    if (validationError) return validationError;

    try {
      const params: any = { scenePath: args.scenePath };
      if (args.name) params.name = args.name;
      if (args.type) params.type = args.type;
      if (args.pathContains) params.pathContains = args.pathContains;
      const { stdout, stderr } = await this.executeOperation('node_find', params, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to find nodes: ${stderr}`);
      }
      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to find nodes: ${error?.message || 'Unknown error'}`,
        ['Ensure the scene exists and provide at least one optional filter for narrower results']
      );
    }
  }

  /**
   * Handle P9 scene workflow tools backed by godot_operations.gd.
   */
  private async handleP9SceneOperation(operation: string, args: any) {
    args = this.normalizeParameters(args);

    const uiAction = args.action ?? 'create';
    const requiredFields = operation === 'ui' && uiAction === 'create'
      ? ['projectPath', 'scenePath', 'nodeType', 'nodeName']
      : ['projectPath', 'scenePath'];
    const validationError = this.validateSceneOperationArgs(args, requiredFields);
    if (validationError) return validationError;

    if (operation === 'ui' && args.nodeType) {
      if (!this.validateClassName(args.nodeType)) {
        return this.createErrorResponse('Invalid node type', ['Use a built-in Control class name such as Control, Label, Button, or PanelContainer']);
      }
    }
    if (operation === 'ui') {
      if (args.themePath && (!isSafeProjectRelativePath(args.themePath) || !/\.(tres|res)$/i.test(args.themePath))) {
        return this.createErrorResponse('Invalid themePath', ['Provide a project-relative .tres or .res Theme path']);
      }
      if (args.nodeName && !this.validateNodeName(args.nodeName)) {
        return this.createErrorResponse('Invalid node name', ['Provide a node name without path separators or reserved filename characters']);
      }
    }

    try {
      const params: any = {
        scenePath: args.scenePath,
      };

      for (const key of [
        'action',
        'nodePath',
        'parentNodePath',
        'nodeType',
        'nodeName',
        'playerName',
        'animationName',
        'length',
        'trackType',
        'trackPath',
        'trackIndex',
        'time',
        'value',
        'updateMode',
        'tracks',
        'treePath',
        'treeName',
        'animationPlayerPath',
        'states',
        'transitions',
        'stateName',
        'fromState',
        'toState',
        'blendNodeName',
        'blendNodeType',
        'parameterPath',
        'parameterValue',
        'transitionIndex',
        'transitionParameters',
        'signalName',
        'targetNodePath',
        'methodName',
        'signalMappings',
        'groupName',
        'text',
        'layoutPreset',
        'themePath',
        'key',
        'name',
        'value',
        'color',
        'constant',
        'fontSize',
        'stylebox',
        'typeName',
        'templateName',
        'colors',
        'constants',
        'fontSizes',
        'styleboxes',
        'properties',
      ]) {
        if (args[key] !== undefined) {
          params[key] = args[key];
        }
      }

      const { stdout, stderr } = await this.executeOperation(operation, params, args.projectPath);
      if (stderr && (stderr.includes('Failed to') || stderr.includes('required') || stderr.includes('Unsupported'))) {
        return this.createErrorResponse(`Failed to run ${operation}: ${stderr}`);
      }

      const action = args.action ?? (operation === 'ui' ? 'create' : 'list');
      if (action !== 'list') {
        await appendAuditEntry(args.projectPath, {
          operation,
          changedFiles: [args.scenePath, args.tileSetPath].filter(Boolean),
          skippedFiles: [],
          details: {
            action,
            nodePath: args.nodePath ?? args.parentNodePath ?? null,
          },
        });
      }

      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run ${operation}: ${error?.message || 'Unknown error'}`,
        ['Ensure the scene exists and the requested node paths/classes are valid']
      );
    }
  }

  /**
   * Handle P10 visual tools backed by structured Godot resources and scene edits.
   */
  private async handleP10VisualOperation(operation: string, args: any) {
    args = this.normalizeParameters(args || {});

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    const action = args.action ?? (operation === 'shader' ? 'read' : 'list');
    const isSceneOperation = operation === 'lighting' || operation === 'particle' || Boolean(args.scenePath);
    if (isSceneOperation) {
      const sceneValidationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath']);
      if (sceneValidationError) return sceneValidationError;
    }

    if (args.resourcePath && (!isSafeProjectRelativePath(args.resourcePath) || !/\.(tres|res|material)$/i.test(args.resourcePath))) {
      return this.createErrorResponse('Invalid resourcePath', ['Provide a project-relative .tres, .res, or .material path']);
    }
    if (args.materialPath && (!isSafeProjectRelativePath(args.materialPath) || !/\.(tres|res|material)$/i.test(args.materialPath))) {
      return this.createErrorResponse('Invalid materialPath', ['Provide a project-relative .tres, .res, or .material path']);
    }
    if (args.shaderPath && (!isSafeProjectRelativePath(args.shaderPath) || !args.shaderPath.endsWith('.gdshader'))) {
      return this.createErrorResponse('Invalid shaderPath', ['Provide a project-relative .gdshader path']);
    }
    if (args.nodeType && !this.validateClassName(args.nodeType)) {
      return this.createErrorResponse('Invalid node type', ['Use a built-in Godot visual node class name']);
    }
    if (args.nodeName && !this.validateNodeName(args.nodeName)) {
      return this.createErrorResponse('Invalid node name', ['Provide a node name without path separators or reserved filename characters']);
    }
    if (args.materialType && !this.validateClassName(args.materialType)) {
      return this.createErrorResponse('Invalid material type', ['Use StandardMaterial3D, CanvasItemMaterial, or ShaderMaterial']);
    }

    try {
      const params: any = {};
      for (const key of [
        'action',
        'scenePath',
        'nodePath',
        'parentNodePath',
        'nodeType',
        'nodeName',
        'resourcePath',
        'materialPath',
        'materialType',
        'shaderPath',
        'shaderType',
        'presetName',
        'templateName',
        'propertyName',
        'code',
        'includePaths',
        'textureDefaults',
        'parameters',
        'properties',
        'processMaterialType',
        'amount',
        'lifetime',
        'emitting',
      ]) {
        if (args[key] !== undefined) {
          params[key] = args[key];
        }
      }

      const { stdout, stderr } = await this.executeOperation(operation, params, args.projectPath);
      if (stderr && (stderr.includes('Failed to') || stderr.includes('required') || stderr.includes('Unsupported') || stderr.includes('Invalid'))) {
        return this.createErrorResponse(`Failed to run ${operation}: ${stderr}`);
      }

      const mutatingActions = ['create', 'update', 'apply', 'set_parameters', 'create_from_template'];
      if (mutatingActions.includes(action)) {
        await appendAuditEntry(args.projectPath, {
          operation,
          changedFiles: [args.scenePath, args.resourcePath, args.materialPath, args.shaderPath].filter(Boolean),
          skippedFiles: [],
          details: {
            action,
            nodePath: args.nodePath ?? args.parentNodePath ?? null,
          },
        });
      }

      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run ${operation}: ${error?.message || 'Unknown error'}`,
        ['Check resource paths, scene paths, and requested Godot class names']
      );
    }
  }

  /**
   * Handle P11 scene tools for 2D, physics, navigation, and audio workflows.
   */
  private async handleP11SceneOperation(operation: string, args: any) {
    args = this.normalizeParameters(args || {});

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath']);
    if (validationError) return validationError;

    if (args.nodeType && !this.validateClassName(args.nodeType)) {
      return this.createErrorResponse('Invalid node type', ['Use a built-in Godot node class name']);
    }
    if (args.nodeName && !this.validateNodeName(args.nodeName)) {
      return this.createErrorResponse('Invalid node name', ['Provide a node name without path separators or reserved filename characters']);
    }
    if (args.tileSetPath && (!isSafeProjectRelativePath(args.tileSetPath) || !/\.(tres|res)$/i.test(args.tileSetPath))) {
      return this.createErrorResponse('Invalid tileSetPath', ['Provide a project-relative .tres or .res TileSet path']);
    }
    if (args.shapeResourcePath && (!isSafeProjectRelativePath(args.shapeResourcePath) || !/\.(tres|res)$/i.test(args.shapeResourcePath))) {
      return this.createErrorResponse('Invalid shapeResourcePath', ['Provide a project-relative .tres or .res shape resource path']);
    }
    if (args.streamPath && !isSafeProjectRelativePath(args.streamPath)) {
      return this.createErrorResponse('Invalid streamPath', ['Provide a project-relative audio stream path']);
    }

    try {
      const params: any = {
        scenePath: args.scenePath,
      };
      for (const key of [
        'action',
        'nodePath',
        'parentNodePath',
        'nodeType',
        'nodeName',
        'tileSetPath',
        'texturePath',
        'atlasSourceId',
        'tileSize',
        'margin',
        'separation',
        'tiles',
        'cell',
        'sourceId',
        'atlasCoords',
        'alternativeTile',
        'cells',
        'rect',
        'metadata',
        'customDataLayers',
        'physicsLayer',
        'navigationLayer',
        'terrainSet',
        'terrain',
        'terrainName',
        'polygons',
        'terrainBits',
        'weightedTiles',
        'seed',
        'templateName',
        'tilePalette',
        'collisionLayer',
        'collisionMask',
        'collisionLayerNames',
        'collisionMaskNames',
        'shapeType',
        'shapeResourcePath',
        'dimensions',
        'radius',
        'height',
        'points',
        'agentRadius',
        'cellSize',
        'cellHeight',
        'startPosition',
        'endPosition',
        'debugNodeName',
        'streamPath',
        'bus',
        'busName',
        'effect',
        'effectType',
        'effectIndex',
        'layoutPath',
        'volumeDb',
        'mute',
        'solo',
        'bypassEffects',
        'autoplay',
        'properties',
      ]) {
        if (args[key] !== undefined) {
          params[key] = args[key];
        }
      }

      const { stdout, stderr } = await this.executeOperation(operation, params, args.projectPath);
      if (stderr && (stderr.includes('Failed to') || stderr.includes('required') || stderr.includes('Unsupported') || stderr.includes('Invalid'))) {
        return this.createErrorResponse(`Failed to run ${operation}: ${stderr}`);
      }

      const action = args.action ?? 'list';
      if (action !== 'list' && action !== 'read') {
        await appendAuditEntry(args.projectPath, {
          operation,
          changedFiles: [args.scenePath],
          skippedFiles: [],
          details: {
            action,
            nodePath: args.nodePath ?? args.parentNodePath ?? null,
            nodeType: args.nodeType ?? null,
          },
        });
      }

      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run ${operation}: ${error?.message || 'Unknown error'}`,
        ['Ensure the scene exists and the requested node paths/classes are valid']
      );
    }
  }

  /**
   * Handle the read_script_file tool
   */
  private async handleReadScriptFile(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateScriptArgs(args);
    if (validationError) return validationError;

    try {
      const script = await readGDScriptFile(args.projectPath, args.scriptPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(script, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read script file: ${error?.message || 'Unknown error'}`,
        ['Ensure the script path exists and points to a .gd file']
      );
    }
  }

  /**
   * Handle the analyze_script_references tool
   */
  private async handleAnalyzeScriptReferences(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateScriptArgs(args);
    if (validationError) return validationError;

    try {
      const analysis = await analyzeGDScriptFile(args.projectPath, args.scriptPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to analyze script references: ${error?.message || 'Unknown error'}`,
        ['Ensure the script path exists and points to a readable .gd file']
      );
    }
  }

  /**
   * Handle the check_gdscript_syntax tool
   */
  private async handleCheckGDScriptSyntax(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateScriptArgs(args);
    if (validationError) return validationError;

    try {
      if (!this.godotPath) {
        await this.detectGodotPath();
      }

      const scriptPath = args.scriptPath.startsWith('res://') ? args.scriptPath : `res://${args.scriptPath}`;
      const result = await this.runGodotSyntaxCheck(args.projectPath, scriptPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.ok,
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to check GDScript syntax: ${error?.message || 'Unknown error'}`,
        ['Ensure Godot is installed correctly', 'Verify the script can be parsed by Godot']
      );
    }
  }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide valid paths for both the project and the scene']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    const rootNodeType = args.rootNodeType || 'Node2D';
    if (!this.validateClassName(rootNodeType)) {
      return this.createErrorResponse(
        'Invalid rootNodeType',
        ['rootNodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        rootNodeType,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create scene: ${stderr}`,
          [
            'Check if the root node type is valid',
            'Ensure you have write permissions to the scene path',
            'Verify the scene path is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_scene_tree tool
   */
  private async handleGetSceneTree(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath']);
    if (validationError) return validationError;

    try {
      const params = { scenePath: args.scenePath };
      const { stdout, stderr } = await this.executeOperation('get_scene_tree', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to get scene tree: ${stderr}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: this.extractLastJsonObject(stdout),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get scene tree: ${error?.message || 'Unknown error'}`,
        ['Ensure Godot is installed correctly', 'Verify the scene file is accessible']
      );
    }
  }

  /**
   * Handle the get_node_properties tool
   */
  private async handleGetNodeProperties(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;

    try {
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };
      if (Array.isArray(args.propertyNames)) {
        params.propertyNames = args.propertyNames;
      }

      const { stdout, stderr } = await this.executeOperation('get_node_properties', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to get node properties: ${stderr}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: this.extractLastJsonObject(stdout),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get node properties: ${error?.message || 'Unknown error'}`,
        ['Ensure the node path exists', 'Verify the scene file is accessible']
      );
    }
  }

  /**
   * Handle the update_node_properties tool
   */
  private async handleUpdateNodeProperties(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;

    if (!args.properties || typeof args.properties !== 'object' || Array.isArray(args.properties)) {
      return this.createErrorResponse('Properties object is required', ['Provide a properties object to update']);
    }

    try {
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        properties: args.properties,
      };
      const { stdout, stderr } = await this.executeOperation('update_node_properties', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to update node properties: ${stderr}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node properties updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update node properties: ${error?.message || 'Unknown error'}`,
        ['Ensure the node path exists', 'Verify each property name is valid for the node']
      );
    }
  }

  /**
   * Handle the rename_node tool
   */
  private async handleRenameNode(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;

    if (!this.validateNodeName(args.newName)) {
      return this.createErrorResponse(
        'Invalid node name',
        ['Provide a non-empty node name without path separators or reserved filename characters']
      );
    }

    try {
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        newName: args.newName,
      };
      const { stdout, stderr } = await this.executeOperation('rename_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to rename node: ${stderr}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node renamed successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to rename node: ${error?.message || 'Unknown error'}`,
        ['Ensure the node path exists', 'Verify the new name is valid']
      );
    }
  }

  /**
   * Handle the delete_node tool
   */
  private async handleDeleteNode(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateSceneOperationArgs(args, ['projectPath', 'scenePath', 'nodePath']);
    if (validationError) return validationError;

    try {
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };
      const { stdout, stderr } = await this.executeOperation('delete_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to delete node: ${stderr}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node deleted successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to delete node: ${error?.message || 'Unknown error'}`,
        ['Ensure the node path exists', 'The root node cannot be deleted']
      );
    }
  }

  /**
   * Handle the add_node tool
   */
  private async handleAddNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodeType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validateClassName(args.nodeType)) {
      return this.createErrorResponse(
        'Invalid nodeType',
        ['nodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
      };

      // Add optional parameters
      if (args.parentNodePath) {
        params.parentNodePath = args.parentNodePath;
      }

      if (args.properties) {
        params.properties = args.properties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to add node: ${stderr}`,
          [
            'Check if the node type is valid',
            'Ensure the parent node path exists',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the load_sprite tool
   */
  private async handleLoadSprite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and texturePath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.nodePath) ||
      !this.validatePath(args.texturePath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Check if the texture file exists
      const texturePath = join(args.projectPath, args.texturePath);
      if (!existsSync(texturePath)) {
        return this.createErrorResponse(
          `Texture file does not exist: ${args.texturePath}`,
          [
            'Ensure the texture path is correct',
            'Upload or create the texture file first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        texturePath: args.texturePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to load sprite: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
            'Verify the texture file is a valid image format',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to load sprite: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the export_mesh_library tool
   */
  private async handleExportMeshLibrary(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.outputPath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        outputPath: args.outputPath,
      };

      // Add optional parameters
      if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
        params.meshItemNames = args.meshItemNames;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to export mesh library: ${stderr}`,
          [
            'Check if the scene contains valid 3D meshes',
            'Ensure the output path is valid',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to export mesh library: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the save_scene tool
   */
  private async handleSaveScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // If newPath is provided, validate it
    if (args.newPath && !this.validatePath(args.newPath)) {
      return this.createErrorResponse(
        'Invalid new path',
        ['Provide a valid new path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
      };

      // Add optional parameters
      if (args.newPath) {
        params.newPath = args.newPath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to save scene: ${stderr}`,
          [
            'Check if the scene file is valid',
            'Ensure you have write permissions to the output path',
            'Verify the scene can be properly packed',
          ]
        );
      }

      const savePath = args.newPath || args.scenePath;
      return {
        content: [
          {
            type: 'text',
            text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to save scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.filePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and filePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the file exists
      const filePath = join(args.projectPath, args.filePath);
      if (!existsSync(filePath)) {
        return this.createErrorResponse(
          `File does not exist: ${args.filePath}`,
          ['Ensure the file path is correct']
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        filePath: args.filePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to get UID: ${stderr}`,
          [
            'Check if the file is a valid Godot resource',
            'Ensure the file path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `UID for ${args.filePath}: ${stdout.trim()}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get UID: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the update_project_uids tool
   */
  private async handleUpdateProjectUids(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        projectPath: args.projectPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to update project UIDs: ${stderr}`,
          [
            'Check if the project is valid',
            'Ensure you have write permissions to the project directory',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Run the MCP server
   */
  async run() {
    try {
      // Detect Godot path before starting the server
      await this.detectGodotPath();

      if (!this.godotPath) {
        console.error('[SERVER] Failed to find a valid Godot executable path');
        console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
        process.exit(1);
      }

      // Check if the path is valid
      const isValid = await this.isValidGodotPath(this.godotPath);

      if (!isValid) {
        if (this.strictPathValidation) {
          // In strict mode, exit if the path is invalid
          console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
          process.exit(1);
        } else {
          // In compatibility mode, warn but continue with the default path
          console.error(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] This may cause issues when executing Godot commands');
          console.error('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
        }
      }

      console.error(`[SERVER] Using Godot at: ${this.godotPath}`);

      const websocketPort = Number(process.env.GODOT_DEVTOOL_WS_PORT ?? 8766);
      await getWsBridge().start(websocketPort);
      console.error(`[SERVER] Godot WebSocket bridge listening on ws://127.0.0.1:${websocketPort}`);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Godot MCP server running on stdio');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SERVER] Failed to start:', errorMessage);
      process.exit(1);
    }
  }
}

export function registerGodotServerMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerMethodMixin.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerMethodMixin.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
