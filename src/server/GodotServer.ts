/**
 * godot-devtool MCP server.
 *
 * Provides tools for interacting with Godot Engine projects from MCP clients.
 */

import { join, basename, normalize } from 'path';
import { existsSync, readdirSync } from 'fs';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeGodotProject, indexGodotProjectResources } from '../godot/projectAnalysis.js';
import { analyzeGDScriptFile, indexGDScriptFiles, readGDScriptFile } from '../godot/scriptAnalysis.js';
import { buildExportMatrix, ensureExportOutputDirectory, inspectExportPresets, updateExportPreset } from '../godot/exportConfig.js';
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
  installEditorBridge,
  readEditorBridgeStatus,
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
import { getOperationsScriptPath } from '../godot/paths.js';
import { GODOT_TOOL_ALIASES, GODOT_TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';

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

/**
 * Main server class for the Godot MCP server
 */
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
    'shape_type': 'shapeType',
    'stream_path': 'streamPath',
    'bus': 'bus',
    'volume_db': 'volumeDb',
    'autoplay': 'autoplay',
    'base_type': 'baseType',
    'class_name': 'className',
    'path_contains': 'pathContains',
    'script_path': 'scriptPath',
    'player_name': 'playerName',
    'animation_name': 'animationName',
    'tree_name': 'treeName',
    'animation_player_path': 'animationPlayerPath',
    'signal_name': 'signalName',
    'target_node_path': 'targetNodePath',
    'method_name': 'methodName',
    'group_name': 'groupName',
    'layout_preset': 'layoutPreset',
    'preset_name': 'presetName',
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
        version: '1.0.0',
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

  private getToolRiskLevel(toolName: string): string {
    if (['filesystem_delete', 'export_project', 'update_project_uids'].includes(toolName)) {
      return 'dangerous';
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
        'install_editor_bridge',
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
        'editor_bridge_status',
        'install_editor_bridge',
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
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

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

      const { stdout, stderr } = await execFileAsync(this.godotPath!, args);

      return { stdout: stdout ?? '', stderr: stderr ?? '' };
    } catch (error: unknown) {
      // If execFileAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string };
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
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

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestedToolName = request.params.name;
      const toolName = GODOT_TOOL_ALIASES[requestedToolName] ?? requestedToolName;
      this.logDebug(`Handling tool request: ${requestedToolName} as ${toolName}`);
      switch (toolName) {
        case 'launch_editor':
          return await this.handleLaunchEditor(request.params.arguments);
        case 'run_project':
          return await this.handleRunProject(request.params.arguments);
        case 'get_debug_output':
          return await this.handleGetDebugOutput(request.params.arguments);
        case 'clear_debug_output':
          return await this.handleClearDebugOutput();
        case 'stop_project':
          return await this.handleStopProject();
        case 'get_godot_version':
          return await this.handleGetGodotVersion();
        case 'get_capabilities':
          return this.handleGetCapabilities(request.params.arguments);
        case 'list_projects':
          return await this.handleListProjects(request.params.arguments);
        case 'get_project_info':
          return await this.handleGetProjectInfo(request.params.arguments);
        case 'project_get_settings':
          return await this.handleProjectGetSettings(request.params.arguments);
        case 'project_set_setting':
          return await this.handleProjectSetSetting(request.params.arguments);
        case 'project_input_action':
          return await this.handleProjectInputAction(request.params.arguments);
        case 'get_resource_index':
          return await this.handleGetResourceIndex(request.params.arguments);
        case 'resource_dependency_graph':
          return await this.handleResourceDependencyGraph(request.params.arguments);
        case 'get_script_index':
          return await this.handleGetScriptIndex(request.params.arguments);
        case 'get_export_presets':
          return await this.handleGetExportPresets(request.params.arguments);
        case 'check_export_presets':
          return await this.handleCheckExportPresets(request.params.arguments);
        case 'export_matrix':
          return await this.handleExportMatrix(request.params.arguments);
        case 'update_export_preset':
          return await this.handleUpdateExportPreset(request.params.arguments);
        case 'export_project':
          return await this.handleExportProject(request.params.arguments);
        case 'create_gameplay_prototype':
          return await this.handleCreateGameplayPrototype(request.params.arguments);
        case 'create_workflow_test_scene':
          return await this.handleCreateWorkflowTestScene(request.params.arguments);
        case 'get_audit_log':
          return await this.handleGetAuditLog(request.params.arguments);
        case 'run_project_checks':
          return await this.handleRunProjectChecks(request.params.arguments);
        case 'scene_open':
          return await this.handleSceneOpen(request.params.arguments);
        case 'scene_get_current':
          return await this.handleSceneGetCurrent(request.params.arguments);
        case 'install_editor_bridge':
          return await this.handleInstallEditorBridge(request.params.arguments);
        case 'editor_bridge_status':
          return await this.handleEditorBridgeStatus(request.params.arguments);
        case 'editor_get_selection':
          return await this.handleEditorGetSelection(request.params.arguments);
        case 'editor_select_node':
          return await this.handleEditorSelectNode(request.params.arguments);
        case 'editor_undo_redo':
          return await this.handleEditorUndoRedo(request.params.arguments);
        case 'editor_inspector_get_properties':
          return await this.handleEditorInspectorGetProperties(request.params.arguments);
        case 'editor_inspector_set_properties':
          return await this.handleEditorInspectorSetProperties(request.params.arguments);
        case 'filesystem_list':
          return await this.handleFilesystemList(request.params.arguments);
        case 'filesystem_read':
          return await this.handleFilesystemRead(request.params.arguments);
        case 'filesystem_write':
          return await this.handleFilesystemWrite(request.params.arguments);
        case 'filesystem_delete':
          return await this.handleFilesystemDelete(request.params.arguments);
        case 'filesystem_preview_delete':
          return await this.handleFilesystemPreviewDelete(request.params.arguments);
        case 'resource_load':
          return await this.handleResourceLoad(request.params.arguments);
        case 'resource_create':
          return await this.handleResourceCreate(request.params.arguments);
        case 'resource_save':
          return await this.handleResourceSave(request.params.arguments);
        case 'script_create':
          return await this.handleScriptCreate(request.params.arguments);
        case 'script_write':
          return await this.handleScriptWrite(request.params.arguments);
        case 'script_attach':
          return await this.handleScriptAttach(request.params.arguments);
        case 'node_get':
          return await this.handleNodeGet(request.params.arguments);
        case 'node_get_property':
          return await this.handleGetNodeProperties(request.params.arguments);
        case 'node_set_property':
          return await this.handleUpdateNodeProperties(request.params.arguments);
        case 'node_move':
          return await this.handleNodeMove(request.params.arguments);
        case 'node_duplicate':
          return await this.handleNodeDuplicate(request.params.arguments);
        case 'node_find':
          return await this.handleNodeFind(request.params.arguments);
        case 'animation':
          return await this.handleP9SceneOperation('animation', request.params.arguments);
        case 'animation_state_machine':
          return await this.handleP9SceneOperation('animation_state_machine', request.params.arguments);
        case 'signal':
          return await this.handleP9SceneOperation('signal', request.params.arguments);
        case 'group':
          return await this.handleP9SceneOperation('group', request.params.arguments);
        case 'ui':
          return await this.handleP9SceneOperation('ui', request.params.arguments);
        case 'material':
          return await this.handleP10VisualOperation('material', request.params.arguments);
        case 'shader':
          return await this.handleP10VisualOperation('shader', request.params.arguments);
        case 'lighting':
          return await this.handleP10VisualOperation('lighting', request.params.arguments);
        case 'particle':
          return await this.handleP10VisualOperation('particle', request.params.arguments);
        case 'tilemap':
          return await this.handleP11SceneOperation('tilemap', request.params.arguments);
        case 'geometry':
          return await this.handleP11SceneOperation('geometry', request.params.arguments);
        case 'physics':
          return await this.handleP11SceneOperation('physics', request.params.arguments);
        case 'navigation':
          return await this.handleP11SceneOperation('navigation', request.params.arguments);
        case 'audio':
          return await this.handleP11SceneOperation('audio', request.params.arguments);
        case 'read_script_file':
          return await this.handleReadScriptFile(request.params.arguments);
        case 'analyze_script_references':
          return await this.handleAnalyzeScriptReferences(request.params.arguments);
        case 'check_gdscript_syntax':
          return await this.handleCheckGDScriptSyntax(request.params.arguments);
        case 'create_scene':
          return await this.handleCreateScene(request.params.arguments);
        case 'get_scene_tree':
          return await this.handleGetSceneTree(request.params.arguments);
        case 'get_node_properties':
          return await this.handleGetNodeProperties(request.params.arguments);
        case 'update_node_properties':
          return await this.handleUpdateNodeProperties(request.params.arguments);
        case 'rename_node':
          return await this.handleRenameNode(request.params.arguments);
        case 'delete_node':
          return await this.handleDeleteNode(request.params.arguments);
        case 'add_node':
          return await this.handleAddNode(request.params.arguments);
        case 'load_sprite':
          return await this.handleLoadSprite(request.params.arguments);
        case 'export_mesh_library':
          return await this.handleExportMeshLibrary(request.params.arguments);
        case 'save_scene':
          return await this.handleSaveScene(request.params.arguments);
        case 'get_uid':
          return await this.handleGetUid(request.params.arguments);
        case 'update_project_uids':
          return await this.handleUpdateProjectUids(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${requestedToolName}`
          );
      }
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
        stdio: 'pipe',
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot editor:', err);
      });

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
    const includeAliases = args.includeAliases !== false;
    const includeSchemas = args.includeSchemas !== false;
    const aliasNames = new Set(Object.keys(GODOT_TOOL_ALIASES));
    const canonicalTools = GODOT_TOOL_DEFINITIONS.filter((tool) => !aliasNames.has(tool.name));

    const tools = canonicalTools.map((tool) => {
      const entry: any = {
        name: tool.name,
        description: tool.description,
        runMode: this.getToolRunMode(tool.name),
        riskLevel: this.getToolRiskLevel(tool.name),
      };
      if (includeSchemas) {
        entry.inputSchema = tool.inputSchema;
      }
      return entry;
    });

    const result: any = {
      name: 'godot-devtool',
      version: '1.0.0',
      serverMode: 'mcp_stdio',
      executionModes: ['file_system_or_node', 'headless_godot', 'process_control', 'editor_bridge_optional'],
      godotPathConfigured: Boolean(this.godotPath || process.env.GODOT_PATH),
      strictPathValidation: this.strictPathValidation,
      toolCount: tools.length,
      aliasCount: Object.keys(GODOT_TOOL_ALIASES).length,
      tools,
    };

    if (includeAliases) {
      result.aliases = Object.entries(GODOT_TOOL_ALIASES).map(([aliasName, canonicalName]) => ({
        name: aliasName,
        canonicalName,
        runMode: this.getToolRunMode(canonicalName),
        riskLevel: this.getToolRiskLevel(canonicalName),
        inputSchema: includeSchemas
          ? GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === canonicalName)?.inputSchema
          : undefined,
      }));
    }

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
            [`input/${args.name}`]: {
              deadzone,
              events,
            },
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
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_file_bridge',
        command,
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
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_file_bridge',
        command,
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
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_bridge',
        command,
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
      return this.createJsonResponse({
        ok: true,
        mode: 'godot_editor_bridge',
        command,
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
    if (!args.scriptPath.endsWith('.gd')) {
      return this.createErrorResponse('Invalid scriptPath', ['Provide a .gd script path']);
    }

    try {
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        scriptPath: args.scriptPath,
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
          scriptPath: args.scriptPath,
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
    if (!args.position) {
      return this.createErrorResponse('Missing required parameters', ['Provide position']);
    }

    try {
      const { stdout, stderr } = await this.executeOperation('node_move', {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        position: args.position,
      }, args.projectPath);
      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(`Failed to move node: ${stderr}`);
      }
      await appendAuditEntry(args.projectPath, {
        operation: 'node_move',
        changedFiles: [args.scenePath],
        skippedFiles: [],
        details: { nodePath: args.nodePath, position: args.position },
      });
      return this.createJsonResponse(JSON.parse(this.extractLastJsonObject(stdout)));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to move node: ${error?.message || 'Unknown error'}`,
        ['Ensure the node exists and accepts a position property']
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

    const requiredFields = operation === 'ui'
      ? ['projectPath', 'scenePath', 'nodeType', 'nodeName']
      : ['projectPath', 'scenePath'];
    const validationError = this.validateSceneOperationArgs(args, requiredFields);
    if (validationError) return validationError;

    if (operation === 'ui') {
      if (!this.validateClassName(args.nodeType)) {
        return this.createErrorResponse('Invalid node type', ['Use a built-in Control class name such as Control, Label, Button, or PanelContainer']);
      }
      if (!this.validateNodeName(args.nodeName)) {
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
        'tracks',
        'treeName',
        'animationPlayerPath',
        'states',
        'transitions',
        'signalName',
        'targetNodePath',
        'methodName',
        'groupName',
        'text',
        'layoutPreset',
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
        'propertyName',
        'code',
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

      const mutatingActions = ['create', 'update', 'apply', 'set_parameters'];
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
        'shapeType',
        'points',
        'streamPath',
        'bus',
        'volumeDb',
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
