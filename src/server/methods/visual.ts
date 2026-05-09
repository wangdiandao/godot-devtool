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

class GodotServerVisualMethods {


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
}

export function registerGodotServerVisualMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerVisualMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerVisualMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
