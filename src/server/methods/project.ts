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

class GodotServerProjectMethods {


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
            [`input/${args.name}`]: rawProjectSettingValue(this.formatInputActionProjectValue(deadzone, events)),
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



  private formatInputActionProjectValue(deadzone: number, events: unknown[]): string {
    const serializedEvents = events.map((event) => this.formatInputEventProjectValue(event));
    return [
      '{',
      `"deadzone": ${Number.isFinite(deadzone) ? deadzone : 0.5},`,
      `"events": [${serializedEvents.join(', ')}]`,
      '}',
    ].join('\n');
  }



  private formatInputEventProjectValue(event: unknown): string {
    if (typeof event === 'string') {
      const trimmed = event.trim();
      if (/^(Object|InputEvent)/.test(trimmed)) return trimmed;
      return JSON.stringify(trimmed);
    }

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('InputMap events must be Godot event strings or JSON objects with a type field');
    }

    const source = event as Record<string, unknown>;
    const eventType = String(source.type ?? source.class ?? source.eventType ?? 'InputEventKey');
    if (!/^InputEvent[A-Za-z0-9_]*$/.test(eventType)) {
      throw new Error(`Unsupported InputMap event type: ${eventType}`);
    }

    const pairs: string[] = [
      '"resource_local_to_scene": false',
      '"resource_name": ""',
      '"device": ' + this.godotProjectLiteral(source.device ?? -1),
      '"window_id": ' + this.godotProjectLiteral(source.windowId ?? source.window_id ?? 0),
    ];

    for (const [key, value] of Object.entries(source)) {
      if (['type', 'class', 'eventType'].includes(key)) continue;
      pairs.push(`${JSON.stringify(this.toGodotSnakeCase(key))}: ${this.godotProjectLiteral(value)}`);
    }

    if (!pairs.some((pair) => pair.startsWith('"script":'))) {
      pairs.push('"script": null');
    }

    return `Object(${eventType},${pairs.join(',')})`;
  }



  private godotProjectLiteral(value: unknown): string {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^(Object|InputEvent|NodePath|Vector2|Vector3|Color)\(/.test(trimmed)) return trimmed;
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.godotProjectLiteral(entry)).join(', ')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => `${JSON.stringify(this.toGodotSnakeCase(key))}: ${this.godotProjectLiteral(entry)}`);
      return `{${entries.join(', ')}}`;
    }
    return JSON.stringify(String(value));
  }



  private toGodotSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
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



  private async handleGenerateCiSnippet(args: any) {
    args = this.normalizeParameters(args || {});
    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    const provider = args.provider ?? 'all';
    if (!['github_actions', 'gitlab_ci', 'all'].includes(provider)) {
      return this.createErrorResponse(
        'Invalid CI provider',
        ['Use github_actions, gitlab_ci, or all']
      );
    }

    try {
      const snippets = generateCiSnippets(args.projectPath, {
        provider,
        includeExport: args.includeExport !== false,
        includeArtifactUpload: args.includeArtifactUpload !== false,
        presetName: args.presetName,
        outputPath: args.outputPath,
      });

      if (provider === 'github_actions') {
        return this.createJsonResponse({ provider, snippet: snippets.githubActions, commands: snippets.commands });
      }
      if (provider === 'gitlab_ci') {
        return this.createJsonResponse({ provider, snippet: snippets.gitlabCi, commands: snippets.commands });
      }

      return this.createJsonResponse(snippets);
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to generate CI snippet: ${error?.message || 'Unknown error'}`,
        ['Provide a valid projectPath and optional presetName/outputPath']
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
      const godotArgs = ['--headless', ...this.createGodotLogArgs(`export-${mode}`), '--path', args.projectPath, exportFlag, args.presetName, args.outputPath];

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



  private async handleGetSafetyPolicy(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await readSafetyPolicy(args.projectPath));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to read safety policy: ${error?.message || 'Unknown error'}`,
        ['Ensure the project path is readable']
      );
    }
  }



  private async handleSetSafetyPolicy(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await writeSafetyPolicy(args.projectPath, {
        enabled: args.enabled === true,
        writeAllowlist: args.writeAllowlist ?? [],
        blockedPaths: args.blockedPaths ?? [],
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to set safety policy: ${error?.message || 'Unknown error'}`,
        ['Use project-relative allowlist and blocked path patterns such as scripts/**']
      );
    }
  }



  private async handlePreviewWriteSafety(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.operation || !Array.isArray(args.changes)) {
      return this.createErrorResponse('Missing required parameters', ['Provide operation and changes']);
    }

    try {
      return this.createJsonResponse(await buildDiffSummary(args.projectPath, {
        operation: args.operation,
        riskLevel: args.riskLevel,
        changes: args.changes,
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to preview write safety: ${error?.message || 'Unknown error'}`,
        ['Use project-relative change paths inside the Godot project']
      );
    }
  }



  private async handleGetAuditReplay(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;

    try {
      return this.createJsonResponse(await buildAuditReplay(args.projectPath, { limit: args.limit }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to build audit replay: ${error?.message || 'Unknown error'}`,
        ['Ensure .godot-devtool/audit.jsonl is readable']
      );
    }
  }



  private async handleGetRollbackSuggestions(args: any) {
    args = this.normalizeParameters(args);

    const validationError = this.validateProjectArgs(args);
    if (validationError) return validationError;
    if (!args.operation) {
      return this.createErrorResponse('Missing required parameters', ['Provide operation']);
    }

    try {
      return this.createJsonResponse(await suggestRollback(args.projectPath, {
        operation: args.operation,
        changedFiles: Array.isArray(args.changedFiles) ? args.changedFiles : [],
        skippedFiles: Array.isArray(args.skippedFiles) ? args.skippedFiles : [],
        details: args.details && typeof args.details === 'object' && !Array.isArray(args.details) ? args.details : {},
      }));
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get rollback suggestions: ${error?.message || 'Unknown error'}`,
        ['Provide an operation name and optional changedFiles from the audit log']
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
}

export function registerGodotServerProjectMethods(GodotServerCtor: any): void {
  for (const name of Object.getOwnPropertyNames(GodotServerProjectMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GodotServerProjectMethods.prototype, name);
    if (descriptor) {
      Object.defineProperty(GodotServerCtor.prototype, name, descriptor);
    }
  }
}
