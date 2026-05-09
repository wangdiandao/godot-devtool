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

class GodotServerSharedMethods {

  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.error(`[DEBUG] ${message}`);
    }
  }



  private createGodotLogArgs(purpose: string): string[] {
    const logDirectory = resolve(process.env.GODOT_DEVTOOL_HEADLESS_LOG_DIR ?? join(tmpdir(), 'godot-devtool-headless-logs'));
    mkdirSync(logDirectory, { recursive: true });

    const safePurpose = purpose.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) || 'godot';
    const logPath = join(logDirectory, `${safePurpose}-${process.pid}-${Date.now()}-${randomUUID()}.log`);
    return ['--log-file', logPath];
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



  private walkProjectFilesSync(projectPath: string, options: { includeHidden?: boolean; textOnly?: boolean; maxFiles?: number; maxDepth?: number } = {}): string[] {
    const root = resolve(projectPath);
    const result: string[] = [];
    const maxFiles = Math.max(1, Number(options.maxFiles ?? GODOT_PROJECT_SCAN_MAX_FILES));
    const maxDepth = Math.max(0, Number(options.maxDepth ?? GODOT_PROJECT_SCAN_MAX_DEPTH));
    const visit = (directory: string, depth: number) => {
      if (result.length >= maxFiles || depth > maxDepth) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (result.length >= maxFiles) break;
        if (!options.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules' || entry.name === 'build') continue;
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) visit(fullPath, depth + 1);
        if (entry.isFile()) {
          const relativePath = relative(root, fullPath).replace(/\\/g, '/');
          if (!options.textOnly || /\.(cfg|gd|gdshader|godot|import|json|md|shader|tres|tscn|txt|uid)$/i.test(relativePath)) result.push(relativePath);
        }
      }
    };
    visit(root, 0);
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
    const args = ['--headless', ...this.createGodotLogArgs('syntax-check'), '--path', projectPath, '--check-only', '--script', scriptPath];

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



  private appendProcessOutput(target: string[], data: Buffer, logPrefix: string): void {
    const lines = data.toString().split(/\r?\n/);
    target.push(...lines);
    if (target.length > GODOT_DEBUG_OUTPUT_MAX_LINES) {
      target.splice(0, target.length - GODOT_DEBUG_OUTPUT_MAX_LINES);
    }
    lines.forEach((line: string) => {
      if (line.trim()) this.logDebug(`[${logPrefix}] ${line}`);
    });
  }



  private buildGodotOperationError(operation: string, error: any): Error {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const code = error?.code ?? null;
    const signal = error?.signal ?? null;
    const timeoutText = error?.killed || signal === 'SIGTERM'
      ? ` Godot operation timed out after ${GODOT_OPERATION_TIMEOUT_MS}ms and was terminated.`
      : '';
    const detail = (stderr || stdout || error?.message || 'Unknown Godot process failure').trim();
    const exitDetail = code !== null || signal !== null
      ? ` with exit code ${code ?? 'null'} and signal ${signal ?? 'null'}`
      : '';
    const failure = new Error(`Godot operation ${operation} failed${exitDetail}.${timeoutText}${detail ? ` ${detail}` : ''}`);
    (failure as any).stdout = stdout;
    (failure as any).stderr = stderr;
    (failure as any).exitCode = code;
    (failure as any).signal = signal;
    return failure;
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
        ...this.createGodotLogArgs(operation),
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
      throw this.buildGodotOperationError(operation, error);
    }
  }
}

export function registerGodotServerSharedMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerSharedMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerSharedMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
