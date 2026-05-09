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

class GodotServerScriptMethods {


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
}

export function registerGodotServerScriptMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerScriptMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerScriptMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
