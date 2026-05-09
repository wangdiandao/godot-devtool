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

class GodotServerFilesystemMethods {


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
}

export function registerGodotServerFilesystemMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerFilesystemMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerFilesystemMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
