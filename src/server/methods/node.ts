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

class GodotServerNodeMethods {


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
    if (args.mode === 'editor_live') {
      return this.handleEditorMoveNode(args);
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
    if (args.mode === 'editor_live') {
      return this.handleEditorDuplicateNode(args);
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
    if (args.mode === 'editor_live') {
      return this.handleEditorInspectorSetProperties(args);
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
    if (args.mode === 'editor_live') {
      return this.handleEditorRenameNode(args);
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
    if (args.mode === 'editor_live') {
      return this.handleEditorDeleteNode(args);
    }

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
    if (args.mode === 'editor_live') {
      return this.handleEditorAddNode(args);
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
}

export function registerGodotServerNodeMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerNodeMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerNodeMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
