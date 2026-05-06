/**
 * godot-devtool MCP server.
 *
 * Provides tools for interacting with Godot Engine projects from MCP clients.
 */

import { join, basename, normalize, dirname, relative, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
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
import { deleteProjectSettings, readProjectSettings, writeProjectSettings } from '../godot/projectSettings.js';
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
import { GODOT_TOOL_ALIASES, GODOT_TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';
import { createToolHandlers, createUnknownToolError } from './handlers/index.js';
import { getWsBridge } from './transports/wsBridge.js';
import { registerGodotServerMethods } from './GodotServer.methods.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE

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

/**
 * Main server class for the Godot MCP server
 */
export interface GodotServer {
  run(): Promise<void>;
  logDebug(message: string): void;
  isValidGodotPathSync(path: string): boolean;
  setupToolHandlers(): void;
  cleanup(): Promise<void>;
}

export class GodotServer {
  private server: Server;
  private activeProcess: GodotProcess | null = null;
  private lastRun: GodotProcess | null = null;
  private godotPath: string | null = null;
  private operationsScriptPath: string;
  private currentScene: SceneOpenResult | null = null;
  private validatedPaths: Map<string, boolean> = new Map();
  private strictPathValidation: boolean = false;

  /**
   * Parameter name mappings between snake_case and camelCase
   * This allows the server to accept both formats
   */
  private parameterMappings: Record<string, string> = {
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
    'root_node_type': 'rootNodeType',
    'parent_node_path': 'parentNodePath',
    'node_type': 'nodeType',
    'node_name': 'nodeName',
    'texture_path': 'texturePath',
    'node_path': 'nodePath',
    'output_path': 'outputPath',
    'mesh_item_names': 'meshItemNames',
    'property_names': 'propertyNames',
    'new_name': 'newName',
    'new_path': 'newPath',
    'timeout_ms': 'timeoutMs',
    'http_port': 'httpPort',
    'websocket_port': 'websocketPort',
    'file_path': 'filePath',
    'target_path': 'targetPath',
    'resource_path': 'resourcePath',
    'resource_type': 'resourceType',
    'material_path': 'materialPath',
    'material_type': 'materialType',
    'shader_path': 'shaderPath',
    'property_name': 'propertyName',
    'shader_type': 'shaderType',
    'process_material_type': 'processMaterialType',
    'tile_set_path': 'tileSetPath',
    'atlas_source_id': 'atlasSourceId',
    'tile_size': 'tileSize',
    'custom_data_layers': 'customDataLayers',
    'physics_layer': 'physicsLayer',
    'navigation_layer': 'navigationLayer',
    'terrain_set': 'terrainSet',
    'terrain_name': 'terrainName',
    'terrain_bits': 'terrainBits',
    'weighted_tiles': 'weightedTiles',
    'template_name': 'templateName',
    'tile_palette': 'tilePalette',
    'cell': 'cell',
    'source_id': 'sourceId',
    'atlas_coords': 'atlasCoords',
    'alternative_tile': 'alternativeTile',
    'collision_layer': 'collisionLayer',
    'collision_mask': 'collisionMask',
    'collision_layer_names': 'collisionLayerNames',
    'collision_mask_names': 'collisionMaskNames',
    'shape_type': 'shapeType',
    'shape_resource_path': 'shapeResourcePath',
    'stream_path': 'streamPath',
    'bus': 'bus',
    'bus_name': 'busName',
    'effect_type': 'effectType',
    'effect_index': 'effectIndex',
    'bypass_effects': 'bypassEffects',
    'layout_path': 'layoutPath',
    'volume_db': 'volumeDb',
    'autoplay': 'autoplay',
    'agent_radius': 'agentRadius',
    'cell_size': 'cellSize',
    'cell_height': 'cellHeight',
    'start_position': 'startPosition',
    'end_position': 'endPosition',
    'debug_node_name': 'debugNodeName',
    'base_type': 'baseType',
    'class_name': 'className',
    'path_contains': 'pathContains',
    'script_path': 'scriptPath',
    'player_name': 'playerName',
    'animation_name': 'animationName',
    'tree_name': 'treeName',
    'animation_player_path': 'animationPlayerPath',
    'track_type': 'trackType',
    'track_path': 'trackPath',
    'track_index': 'trackIndex',
    'update_mode': 'updateMode',
    'tree_path': 'treePath',
    'from_state': 'fromState',
    'to_state': 'toState',
    'state_name': 'stateName',
    'blend_node_name': 'blendNodeName',
    'blend_node_type': 'blendNodeType',
    'parameter_path': 'parameterPath',
    'parameter_value': 'parameterValue',
    'transition_index': 'transitionIndex',
    'transition_parameters': 'transitionParameters',
    'signal_name': 'signalName',
    'target_node_path': 'targetNodePath',
    'method_name': 'methodName',
    'signal_mappings': 'signalMappings',
    'group_name': 'groupName',
    'layout_preset': 'layoutPreset',
    'theme_path': 'themePath',
    'font_sizes': 'fontSizes',
    'include_paths': 'includePaths',
    'texture_defaults': 'textureDefaults',
    'preset_name': 'presetName',
    'include_export': 'includeExport',
    'include_artifact_upload': 'includeArtifactUpload',
    'create_output_directory': 'createOutputDirectory',
    'output_offset': 'outputOffset',
    'error_offset': 'errorOffset',
    'quit_after': 'quitAfter',
    'dry_run': 'dryRun',
    'directory': 'directory',
    'recursive': 'recursive',
    'scene': 'scene',
  };

  /**
   * Reverse mapping from camelCase to snake_case
   * Generated from parameterMappings for quick lookups
   */
  private reverseParameterMappings: Record<string, string> = {};

  constructor(config?: GodotServerConfig) {
    // Initialize reverse parameter mappings
    for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
      this.reverseParameterMappings[camelCase] = snakeCase;
    }
    // Apply configuration if provided
    let debugMode = DEBUG_MODE;
    let godotDebugMode = GODOT_DEBUG_MODE;

    if (config) {
      if (config.debugMode !== undefined) {
        debugMode = config.debugMode;
      }
      if (config.godotDebugMode !== undefined) {
        godotDebugMode = config.godotDebugMode;
      }
      if (config.strictPathValidation !== undefined) {
        this.strictPathValidation = config.strictPathValidation;
      }

      // Store and validate custom Godot path if provided
      if (config.godotPath) {
        const normalizedPath = normalize(config.godotPath);
        this.godotPath = normalizedPath;
        this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

        // Validate immediately with sync check
        if (!this.isValidGodotPathSync(this.godotPath)) {
          console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
          this.godotPath = null; // Reset to trigger auto-detection later
        }
      }
    }

    // Set the path to the operations script
    this.operationsScriptPath = getOperationsScriptPath(import.meta.url);
    if (debugMode) console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'godot-devtool',
        version: '2.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    // Cleanup on exit
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Log debug messages if debug mode is enabled
   * Using stderr instead of stdout to avoid interfering with JSON-RPC communication
   */
}

registerGodotServerMethods(GodotServer);
