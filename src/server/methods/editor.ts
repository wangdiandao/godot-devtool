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

class GodotServerEditorMethods {


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
          autoSave: args.autoSave === true,
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



  private async queueEditorLiveSceneCommand(args: any, commandType: string, payload: Record<string, unknown>, failureLabel: string) {
    const timeoutMs = Number(args.timeoutMs ?? 10000);
    const command = await enqueueEditorCommand(args.projectPath, {
      type: commandType,
      payload: {
        scenePath: args.scenePath ?? null,
        autoSave: args.autoSave === true,
        ...payload,
      },
      timeoutMs,
    });
    const receipt = await waitForEditorCommandReceipt(args.projectPath, command.commandId, timeoutMs);
    this.assertCompletedBridgeReceipt(commandType, receipt);
    return this.createJsonResponse({
      ok: true,
      mode: 'godot_editor_websocket_bridge',
      command,
      receipt,
    });
  }



  private async handleEditorAddNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    if (!args.nodeType || !args.nodeName) {
      return this.createErrorResponse('Missing required parameters', ['Provide projectPath, nodeType, and nodeName']);
    }
    if (!this.validateClassName(args.nodeType)) {
      return this.createErrorResponse('Invalid nodeType', ['nodeType must be a built-in Godot class name']);
    }
    if (!this.validateNodeName(args.nodeName)) {
      return this.createErrorResponse('Invalid nodeName', ['Provide a valid node name']);
    }
    if (args.properties !== undefined && (!args.properties || typeof args.properties !== 'object' || Array.isArray(args.properties))) {
      return this.createErrorResponse('Invalid properties', ['Provide properties as an object']);
    }

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_add_node', {
        parentNodePath: args.parentNodePath ?? null,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
        properties: args.properties ?? {},
      }, 'add live editor node');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor add node: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
      );
    }
  }



  private async handleEditorDeleteNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required', ['Provide the non-root editor node path to delete']);
    }

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_delete_node', {
        nodePath: args.nodePath,
      }, 'delete live editor node');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor delete node: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
      );
    }
  }



  private async handleEditorRenameNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.nodePath || !this.validateNodeName(args.newName)) {
      return this.createErrorResponse('Invalid rename request', ['Provide nodePath and a valid newName']);
    }

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_rename_node', {
        nodePath: args.nodePath,
        newName: args.newName,
      }, 'rename live editor node');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor rename node: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
      );
    }
  }



  private async handleEditorMoveNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.nodePath || (!args.position && !args.parentNodePath)) {
      return this.createErrorResponse('Invalid move request', ['Provide nodePath and either position or parentNodePath']);
    }

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_move_node', {
        nodePath: args.nodePath,
        parentNodePath: args.parentNodePath ?? null,
        position: args.position ?? null,
      }, 'move live editor node');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor move node: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
      );
    }
  }



  private async handleEditorDuplicateNode(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required', ['Provide the editor node path to duplicate']);
    }
    if (args.newName && !this.validateNodeName(args.newName)) {
      return this.createErrorResponse('Invalid newName', ['Provide a valid duplicate node name']);
    }

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_duplicate_node', {
        nodePath: args.nodePath,
        newName: args.newName ?? null,
        parentNodePath: args.parentNodePath ?? null,
      }, 'duplicate live editor node');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor duplicate node: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
      );
    }
  }



  private async handleEditorSaveScene(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return await this.queueEditorLiveSceneCommand(args, 'editor_save_scene', {}, 'save live editor scene');
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to enqueue live editor save scene: ${error?.message || 'Unknown error'}`,
        ['Open the target scene in Godot, enable the godot-devtool plugin, then retry']
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
}

export function registerGodotServerEditorMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerEditorMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerEditorMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
