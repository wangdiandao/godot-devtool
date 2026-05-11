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
import { bridgePortInUseDetails, getWsBridge, isBridgePortInUseError } from '../transports/wsBridge.js';

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

class GodotServerCoreMethods {

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
  private findGodotProjects(directory: string, recursive: boolean, depth = 0, visited = { count: 0 }): Array<{ path: string; name: string }> {
    const projects: Array<{ path: string; name: string }> = [];
    if (depth > GODOT_PROJECT_SCAN_MAX_DEPTH || visited.count >= GODOT_PROJECT_SCAN_MAX_FILES) return projects;

    try {
      visited.count += 1;
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
          if (visited.count >= GODOT_PROJECT_SCAN_MAX_FILES) break;
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
          if (visited.count >= GODOT_PROJECT_SCAN_MAX_FILES) break;
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
              const subProjects = this.findGodotProjects(subdir, true, depth + 1, visited);
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

      const existingEditor = await this.findConnectedEditorClient(args.projectPath);
      if (existingEditor.client) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Godot editor is already connected for project at ${args.projectPath}. Reusing the existing editor session instead of launching a new process.`,
                  reusedExistingEditor: true,
                  client: existingEditor.client,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      if (existingEditor.portConflict) {
        return this.createErrorResponse(
          `Cannot launch a replacement Godot editor because ${existingEditor.portConflict.message} Use plugin_cleanup_port to inspect the owner; reuse the same MCP session if it is the active bridge.`,
          existingEditor.portConflict.guidance
        );
      }

      // Ensure godotPath is set only when a new editor process is needed.
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

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', ...this.createGodotLogArgs('launch-editor'), '--path', args.projectPath], {
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

  private async findConnectedEditorClient(projectPath: string): Promise<{ client: any | null; portConflict: any | null }> {
    const findClient = () => getWsBridge()
      .status(projectPath)
      .clients
      .find((client: any) => client.context === 'editor') ?? null;

    const currentClient = findClient();
    if (currentClient) return { client: currentClient, portConflict: null };

    try {
      const status = await readEditorBridgeStatus(projectPath);
      const portConflict = (status.lastState as any)?.portConflict ?? null;
      if (portConflict) return { client: null, portConflict };
    } catch {
      return { client: null, portConflict: null };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client = findClient();
      if (client) return { client, portConflict: null };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return { client: null, portConflict: null };
  }



  /**
   * Handle the get_capabilities tool.
   */
  private handleGetCapabilities(args: any) {
    args = this.normalizeParameters(args || {});
    const includeSchemas = args.includeSchemas === true;
    const compact = args.compact !== false;

    const toStringList = (value: any): string[] => {
      if (value === undefined || value === null) return [];
      if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
      return [String(value)].filter(Boolean);
    };

    const routeGroups = new Set(toStringList(args.routeGroup));
    const transports = new Set(toStringList(args.transport));
    const riskLevels = new Set(toStringList(args.riskLevel));
    const requestedToolNames = toStringList(args.toolNames);
    const requestedToolNameSet = new Set(requestedToolNames);
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    const hasFilter = routeGroups.size > 0 || transports.size > 0 || riskLevels.size > 0 || requestedToolNameSet.size > 0 || query.length > 0;

    if (includeSchemas && !hasFilter) {
      return this.createErrorResponse(
        'includeSchemas=true requires routeGroup, transport, riskLevel, toolNames, or query to keep get_capabilities lightweight.',
        [
          'Call get_capabilities without includeSchemas for the lightweight catalog index',
          'Request schemas for one workflow, for example { "routeGroup": "scene", "includeSchemas": true }',
          'Request schemas for exact tools, for example { "toolNames": ["scene_open", "add_node"], "includeSchemas": true }',
        ]
      );
    }

    const matchesQuery = (tool: any): boolean => {
      if (!query) return true;
      return [
        tool.name,
        tool.description,
        tool.routeGroup,
        tool.transport,
        tool.riskLevel,
        tool.canonicalName,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    };

    let filteredDefinitions = GODOT_TOOL_DEFINITIONS.filter((tool) => {
      if (routeGroups.size > 0 && !routeGroups.has(String(tool.routeGroup))) return false;
      if (transports.size > 0 && !transports.has(String(tool.transport))) return false;
      if (riskLevels.size > 0 && !riskLevels.has(String(tool.riskLevel))) return false;
      if (requestedToolNameSet.size > 0 && !requestedToolNameSet.has(tool.name)) return false;
      return matchesQuery(tool);
    });

    if (requestedToolNames.length > 0) {
      const order = new Map(requestedToolNames.map((name, index) => [name, index]));
      filteredDefinitions = [...filteredDefinitions].sort((left, right) =>
        (order.get(left.name) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.name) ?? Number.MAX_SAFE_INTEGER)
      );
    }

    const summarize = (key: string) => Object.entries(GODOT_TOOL_DEFINITIONS.reduce((acc: any, tool: any) => {
      const value = String(tool[key] ?? 'unknown');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {}))
      .map(([name, count]) => ({ name, count }))
      .sort((left: any, right: any) => String(left.name).localeCompare(String(right.name)));

    const tools = filteredDefinitions.map((tool) => {
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
      schemaIncluded: includeSchemas,
      filters: {
        routeGroup: [...routeGroups],
        transport: [...transports],
        riskLevel: [...riskLevels],
        toolNames: requestedToolNames,
        query: query || null,
      },
      totalToolCount: GODOT_TOOL_DEFINITIONS.length,
      toolCount: tools.length,
      routeGroups: summarize('routeGroup'),
      transports: summarize('transport'),
      riskLevels: summarize('riskLevel'),
      unknownToolNames: requestedToolNames.filter((name) => !GODOT_TOOL_DEFINITIONS.some((tool) => tool.name === name)),
      tools,
    };

    return {
      content: [
        {
          type: 'text',
          text: compact ? JSON.stringify(result) : JSON.stringify(result, null, 2),
        },
      ],
    };
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
        this.lastRun = {
          ...this.activeProcess,
          exitedAt: new Date().toISOString(),
          exitCode: null,
          exitSignal: 'SIGTERM',
        };
        this.activeProcess = null;
      }

      const cmdArgs = ['-d'];
      if (args.headless === true) {
        cmdArgs.push('--headless');
      }
      cmdArgs.push(...this.createGodotLogArgs('run-project'));
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
        this.appendProcessOutput(output, data, 'Godot stdout');
      });

      process.stderr?.on('data', (data: Buffer) => {
        this.appendProcessOutput(errors, data, 'Godot stderr');
      });

      const run: GodotProcess = { process, output, errors, startedAt: new Date().toISOString() };
      this.activeProcess = run;

      process.on('exit', (code: number | null, signal: string | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        run.exitedAt = run.exitedAt ?? new Date().toISOString();
        run.exitCode = run.exitCode ?? code;
        run.exitSignal = run.exitSignal ?? signal;
        if (this.activeProcess && this.activeProcess.process === process) {
          this.lastRun = run;
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        run.exitedAt = run.exitedAt ?? new Date().toISOString();
        run.exitCode = run.exitCode ?? null;
        run.exitSignal = run.exitSignal ?? null;
        this.lastRun = run;
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      const startupError = await new Promise<Error | null>((resolveStartup) => {
        let settled = false;
        const finish = (error: Error | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolveStartup(error);
        };
        const timer = setTimeout(() => finish(null), GODOT_PROCESS_STARTUP_GRACE_MS);
        process.once('error', (err: Error) => finish(err));
        process.once('exit', (code: number | null, signal: string | null) => {
          finish(new Error(`Godot project exited during startup with code ${code ?? 'null'} and signal ${signal ?? 'null'}.`));
        });
      });
      if (startupError) {
        run.exitedAt = run.exitedAt ?? new Date().toISOString();
        run.exitCode = run.exitCode ?? null;
        run.exitSignal = run.exitSignal ?? null;
        this.lastRun = run;
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
        return this.createErrorResponse(`Failed to run Godot project: ${startupError.message}`);
      }

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
              exitSignal: run.exitSignal ?? null,
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
    const run = this.activeProcess;
    run.process.kill();
    run.exitedAt = run.exitedAt ?? new Date().toISOString();
    run.exitCode = run.exitCode ?? null;
    run.exitSignal = run.exitSignal ?? 'SIGTERM';
    this.lastRun = run;
    const output = run.output;
    const errors = run.errors;
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
      try {
        await getWsBridge().start(websocketPort);
        console.error(`[SERVER] Godot WebSocket bridge listening on ws://127.0.0.1:${websocketPort}`);
      } catch (error) {
        if (!isBridgePortInUseError(error)) {
          throw error;
        }
        const conflict = bridgePortInUseDetails(websocketPort);
        console.error(`[SERVER] ${conflict.message}`);
        for (const item of conflict.guidance) {
          console.error(`[SERVER] ${item}`);
        }
        console.error('[SERVER] Continuing stdio MCP startup; native tools and plugin_cleanup_port remain available.');
      }

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

export function registerGodotServerCoreMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerCoreMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerCoreMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
