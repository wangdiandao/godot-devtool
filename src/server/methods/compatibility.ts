// @ts-nocheck
/**
 * Split GodotServer tool implementation module.
 *
 * GodotServer.ts owns process state and stdio lifecycle. Route-specific logic
 * should live in src/server/handlers/* or the matching src/server/methods/*
 * module instead of growing GodotServer.methods.ts.
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
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeGodotProject, indexGodotProjectResources } from '../../godot/projectAnalysis.js';
import { analyzeGDScriptFile, indexGDScriptFiles, readGDScriptFile } from '../../godot/scriptAnalysis.js';
import {
  buildExportMatrix,
  ensureExportOutputDirectory,
  generateCiSnippets,
  inspectExportPresets,
  updateExportPreset,
} from '../../godot/exportConfig.js';
import { isSafeProjectRelativePath } from '../../godot/pathValidation.js';
import { buildResourceDependencyGraph } from '../../godot/resourceDependencies.js';
import { deleteProjectSettings, rawProjectSettingValue, readProjectSettings, writeProjectSettings } from '../../godot/projectSettings.js';
import {
  appendAuditEntry,
  createGameplayPrototype,
  createWorkflowTestScene,
  readAuditLog,
  runProjectChecks,
} from '../../godot/workflowAutomation.js';
import {
  createEditorUnsupportedResult,
  openSceneFile,
  type SceneOpenResult,
} from '../../godot/editorSession.js';
import {
  enqueueEditorCommand,
  enqueueRuntimeCommand,
  installEditorBridge,
  readEditorBridgeStatus,
  readRuntimeBridgeStatus,
  waitForEditorCommandReceipt,
  waitForRuntimeCommandReceipt,
} from '../../godot/editorBridge.js';
import {
  deleteProjectPath,
  listProjectDirectory,
  previewProjectDelete,
  readProjectFile,
  writeProjectFile,
} from '../../godot/filesystemTools.js';
import {
  createProjectResource,
  loadProjectResource,
  saveProjectResource,
} from '../../godot/resourceTools.js';
import {
  createProjectScript,
  writeProjectScript,
} from '../../godot/scriptTools.js';
import {
  buildAuditReplay,
  buildDiffSummary,
  readSafetyPolicy,
  suggestRollback,
  writeSafetyPolicy,
} from '../../godot/safetyRecovery.js';
import { getOperationsScriptPath } from '../../godot/paths.js';
import { COMPATIBILITY_TOOL_ROUTES, type CompatibilityToolRoute } from '../../tools/compatibilityTools.js';
import { GODOT_TOOL_DEFINITIONS } from '../../tools/toolDefinitions.js';
import { createToolHandlers, createUnknownToolError } from '../handlers/index.js';
import { PACKAGE_NAME, PACKAGE_VERSION, godotPathGuidance } from '../packageMetadata.js';
import { getBrowserVisualizer } from '../transports/browserVisualizer.js';
import { getWsBridge } from '../transports/wsBridge.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE
const GODOT_OPERATION_TIMEOUT_MS = Number(process.env.GODOT_DEVTOOL_GODOT_TIMEOUT_MS ?? 120000);
const GODOT_PROJECT_SCAN_MAX_FILES = Number(process.env.GODOT_DEVTOOL_SCAN_MAX_FILES ?? 10000);
const GODOT_PROJECT_SCAN_MAX_DEPTH = Number(process.env.GODOT_DEVTOOL_SCAN_MAX_DEPTH ?? 24);
const GODOT_DEBUG_OUTPUT_MAX_LINES = Number(process.env.GODOT_DEVTOOL_DEBUG_MAX_LINES ?? 5000);
const GODOT_PROCESS_STARTUP_GRACE_MS = Number(process.env.GODOT_DEVTOOL_PROCESS_STARTUP_GRACE_MS ?? 500);

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
  exitSignal?: string | null;
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

class GodotServerCompatibilityMethods {


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
      this.logDebug(`Runtime bridge was not connected during ${toolName} preflight; waiting for DevtoolRuntime to reconnect before dispatch.`);
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
}

export function registerGodotServerCompatibilityMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerCompatibilityMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerCompatibilityMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
