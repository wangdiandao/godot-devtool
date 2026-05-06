import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { inspectExportPresets } from './exportConfig.js';
import { isSafeProjectRelativePath } from './pathValidation.js';
import { analyzeGodotProject, indexGodotProjectResources } from './projectAnalysis.js';
import { indexGDScriptFiles } from './scriptAnalysis.js';

export interface WorkflowWriteOptions {
  overwrite?: boolean;
}

export interface GameplayPrototypeOptions extends WorkflowWriteOptions {
  template?: 'survivors';
}

export interface WorkflowTestSceneOptions extends WorkflowWriteOptions {
  scenePath?: string;
}

export interface WorkflowChangeResult {
  changedFiles: string[];
  skippedFiles: string[];
}

export interface AuditEntry {
  timestamp: string;
  operation: string;
  changedFiles: string[];
  skippedFiles: string[];
  details?: Record<string, unknown>;
}

export interface AuditLogReadResult {
  path: string;
  entries: AuditEntry[];
}

export interface ProjectCheckResult {
  ok: boolean;
  checks: Array<{
    name: string;
    status: 'pass' | 'warning' | 'error';
    code: string;
    message: string;
    cause: string;
    suggestion: string;
    details?: unknown;
  }>;
  summary: {
    passed: number;
    warnings: number;
    errors: number;
  };
}

const AUDIT_LOG_PATH = '.godot-devtool/audit.jsonl';

export async function createGameplayPrototype(
  projectPath: string,
  options: GameplayPrototypeOptions = {}
): Promise<WorkflowChangeResult & { template: 'survivors' }> {
  const template = options.template ?? 'survivors';
  if (template !== 'survivors') {
    throw new Error(`Unsupported gameplay prototype template: ${template}`);
  }

  const files = survivorsPrototypeFiles();
  const result = await writeProjectFiles(projectPath, files, options);
  await appendAuditEntry(projectPath, {
    operation: 'create_gameplay_prototype',
    changedFiles: result.changedFiles,
    skippedFiles: result.skippedFiles,
    details: { template },
  });

  return { template, ...result };
}

export async function createWorkflowTestScene(
  projectPath: string,
  options: WorkflowTestSceneOptions = {}
): Promise<WorkflowChangeResult & { scenePath: string }> {
  const scenePath = options.scenePath ?? 'scenes/devtool_workflow_test.tscn';
  if (!isSafeProjectRelativePath(scenePath) || !scenePath.endsWith('.tscn')) {
    throw new Error('scenePath must be a project-relative .tscn path');
  }

  const files = workflowTestSceneFiles(scenePath);
  const result = await writeProjectFiles(projectPath, files, options);
  await appendAuditEntry(projectPath, {
    operation: 'create_workflow_test_scene',
    changedFiles: result.changedFiles,
    skippedFiles: result.skippedFiles,
    details: { scenePath },
  });

  return { scenePath, ...result };
}

export async function readAuditLog(projectPath: string, limit?: number): Promise<AuditLogReadResult> {
  const auditPath = join(projectPath, AUDIT_LOG_PATH);
  if (!existsSync(auditPath)) {
    return { path: AUDIT_LOG_PATH, entries: [] };
  }

  const content = await readFile(auditPath, 'utf8');
  const entries = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry);
  const limitedEntries = Number.isInteger(limit) && limit! > 0 ? entries.slice(-limit!) : entries;
  return { path: AUDIT_LOG_PATH, entries: limitedEntries };
}

export async function runProjectChecks(projectPath: string): Promise<ProjectCheckResult> {
  const checks: ProjectCheckResult['checks'] = [];

  if (!existsSync(join(projectPath, 'project.godot'))) {
    checks.push({
      name: 'project_file',
      status: 'error',
      code: 'missing_project_file',
      message: 'Missing project.godot',
      cause: 'The supplied directory does not contain a Godot project file.',
      suggestion: 'Pass the root directory of a Godot project or create project.godot in this directory.',
    });
    return buildCheckResult(checks);
  }

  checks.push({
    name: 'project_file',
    status: 'pass',
    code: 'project_file_found',
    message: 'project.godot exists',
    cause: 'The required Godot project file is present.',
    suggestion: 'No action needed.',
  });

  try {
    const projectInfo = await analyzeGodotProject(projectPath);
    checks.push({
      name: 'project_info',
      status: 'pass',
      code: 'project_info_parsed',
      message: 'Project metadata parsed',
      cause: 'project.godot metadata could be read and normalized.',
      suggestion: 'No action needed.',
      details: {
        name: projectInfo.name,
        mainScene: projectInfo.mainScene,
        autoloads: projectInfo.autoloads.length,
      },
    });
  } catch (error: any) {
    checks.push({
      name: 'project_info',
      status: 'error',
      code: 'project_info_parse_failed',
      message: `Project metadata parsing failed: ${error?.message || 'Unknown error'}`,
      cause: 'The project metadata reader could not parse project.godot.',
      suggestion: 'Open project.godot in Godot or a text editor and fix malformed section/key syntax.',
    });
  }

  try {
    const resourceIndex = await indexGodotProjectResources(projectPath);
    checks.push({
      name: 'resource_index',
      status: 'pass',
      code: 'resource_index_generated',
      message: 'Resource index generated',
      cause: 'Project resources were scanned successfully.',
      suggestion: 'No action needed.',
      details: {
        scenes: resourceIndex.scenes.length,
        scripts: resourceIndex.scripts.length,
        resources: resourceIndex.resources.length,
      },
    });
  } catch (error: any) {
    checks.push({
      name: 'resource_index',
      status: 'error',
      code: 'resource_index_failed',
      message: `Resource indexing failed: ${error?.message || 'Unknown error'}`,
      cause: 'The resource scanner failed while walking or reading project files.',
      suggestion: 'Check file permissions and fix malformed scene or resource files reported by the error.',
    });
  }

  try {
    const scripts = await indexGDScriptFiles(projectPath);
    checks.push({
      name: 'script_index',
      status: 'pass',
      code: 'script_index_generated',
      message: 'GDScript index generated',
      cause: 'GDScript files were scanned successfully.',
      suggestion: 'No action needed.',
      details: {
        scripts: scripts.length,
      },
    });
  } catch (error: any) {
    checks.push({
      name: 'script_index',
      status: 'error',
      code: 'script_index_failed',
      message: `GDScript indexing failed: ${error?.message || 'Unknown error'}`,
      cause: 'The GDScript scanner failed while reading or parsing script files.',
      suggestion: 'Check script file permissions and repair malformed GDScript declarations.',
    });
  }

  try {
    const exportInspection = await inspectExportPresets(projectPath);
    const errorCount = exportInspection.issues.filter((issue) => issue.severity === 'error').length;
    checks.push({
      name: 'export_presets',
      status: errorCount > 0 ? 'warning' : exportInspection.issues.length > 0 ? 'warning' : 'pass',
      code: exportInspection.issues.length > 0 ? 'export_presets_have_findings' : 'export_presets_ready',
      message: exportInspection.hasExportPresets
        ? `Export presets inspected with ${exportInspection.issues.length} issue(s)`
        : 'No export presets configured',
      cause: exportInspection.issues.length > 0
        ? 'Export preset inspection found release-preflight issues.'
        : 'Export presets are present and passed local preflight checks.',
      suggestion: exportInspection.issues.length > 0
        ? 'Review details.issues and apply the per-issue suggestions before release export.'
        : 'No action needed.',
      details: exportInspection,
    });
  } catch (error: any) {
    checks.push({
      name: 'export_presets',
      status: 'warning',
      code: 'export_preset_inspection_skipped',
      message: `Export preset inspection skipped: ${error?.message || 'Unknown error'}`,
      cause: 'The export preset reader failed before it could produce structured findings.',
      suggestion: 'Ensure export_presets.cfg is readable and contains valid preset sections.',
    });
  }

  return buildCheckResult(checks);
}

export async function appendAuditEntry(
  projectPath: string,
  entry: Omit<AuditEntry, 'timestamp'>
): Promise<void> {
  const auditPath = join(projectPath, AUDIT_LOG_PATH);
  await mkdir(dirname(auditPath), { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  const existing = existsSync(auditPath) ? await readFile(auditPath, 'utf8') : '';
  await writeFile(auditPath, `${existing}${line}\n`, 'utf8');
}

async function writeProjectFiles(
  projectPath: string,
  files: Record<string, string>,
  options: WorkflowWriteOptions
): Promise<WorkflowChangeResult> {
  const changedFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    if (!isSafeProjectRelativePath(relativePath)) {
      throw new Error(`Unsafe project-relative path: ${relativePath}`);
    }

    const absolutePath = join(projectPath, relativePath);
    if (existsSync(absolutePath) && options.overwrite !== true) {
      skippedFiles.push(relativePath);
      continue;
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
    changedFiles.push(relativePath);
  }

  return { changedFiles, skippedFiles };
}

function buildCheckResult(checks: ProjectCheckResult['checks']): ProjectCheckResult {
  const summary = {
    passed: checks.filter((check) => check.status === 'pass').length,
    warnings: checks.filter((check) => check.status === 'warning').length,
    errors: checks.filter((check) => check.status === 'error').length,
  };

  return {
    ok: summary.errors === 0,
    checks,
    summary,
  };
}

function workflowTestSceneFiles(scenePath: string): Record<string, string> {
  return {
    [scenePath]: [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://scripts/devtool_workflow/workflow_test.gd" id="1_workflow"]',
      '',
      '[node name="DevtoolWorkflowTest" type="Node2D"]',
      'script = ExtResource("1_workflow")',
      '',
      '[node name="Target" type="Node2D" parent="."]',
      'position = Vector2(160, 96)',
      '',
    ].join('\n'),
    'scripts/devtool_workflow/workflow_test.gd': [
      'extends Node2D',
      '',
      'var elapsed := 0.0',
      '',
      'func _process(delta: float) -> void:',
      '\telapsed += delta',
      '\tqueue_redraw()',
      '',
      'func _draw() -> void:',
      '\tdraw_rect(Rect2(Vector2(-32, -32), Vector2(64, 64)), Color(0.2, 0.7, 1.0))',
      '\tdraw_rect(Rect2(Vector2(128, 64), Vector2(64, 64)), Color(1.0, 0.8, 0.2))',
      '',
    ].join('\n'),
  };
}

function survivorsPrototypeFiles(): Record<string, string> {
  return {
    'scenes/devtool_survivors_prototype.tscn': [
      '[gd_scene load_steps=5 format=3]',
      '',
      '[ext_resource type="Script" path="res://scripts/devtool_survivors/prototype_controller.gd" id="1_game"]',
      '[ext_resource type="Script" path="res://scripts/devtool_survivors/player_controller.gd" id="2_player"]',
      '[ext_resource type="Script" path="res://scripts/devtool_survivors/enemy.gd" id="3_enemy"]',
      '[ext_resource type="Script" path="res://scripts/devtool_survivors/projectile.gd" id="4_projectile"]',
      '',
      '[node name="DevtoolSurvivorsPrototype" type="Node2D"]',
      'script = ExtResource("1_game")',
      '',
      '[node name="Player" type="Node2D" parent="."]',
      'script = ExtResource("2_player")',
      '',
      '[node name="Enemy" type="Node2D" parent="."]',
      'position = Vector2(260, 0)',
      'script = ExtResource("3_enemy")',
      '',
      '[node name="Projectile" type="Node2D" parent="."]',
      'position = Vector2(80, 0)',
      'script = ExtResource("4_projectile")',
      '',
    ].join('\n'),
    'scripts/devtool_survivors/prototype_controller.gd': [
      'extends Node2D',
      '',
      'const ENEMY_SCRIPT := preload("res://scripts/devtool_survivors/enemy.gd")',
      '',
      'var spawn_timer := 0.0',
      '',
      'func _process(delta: float) -> void:',
      '\tspawn_timer += delta',
      '\tif spawn_timer >= 2.0:',
      '\t\tspawn_timer = 0.0',
      '\t\tspawn_enemy()',
      '',
      'func spawn_enemy() -> void:',
      '\tvar enemy := Node2D.new()',
      '\tenemy.name = "Enemy"',
      '\tenemy.position = Vector2(randf_range(-360.0, 360.0), randf_range(-220.0, 220.0))',
      '\tenemy.set_script(ENEMY_SCRIPT)',
      '\tadd_child(enemy)',
      '',
    ].join('\n'),
    'scripts/devtool_survivors/player_controller.gd': [
      'extends Node2D',
      '',
      '@export var speed := 260.0',
      '',
      'func _process(delta: float) -> void:',
      '\tvar direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")',
      '\tposition += direction * speed * delta',
      '\tqueue_redraw()',
      '',
      'func _draw() -> void:',
      '\tdraw_rect(Rect2(Vector2(-16, -16), Vector2(32, 32)), Color(0.2, 0.7, 1.0))',
      '',
    ].join('\n'),
    'scripts/devtool_survivors/enemy.gd': [
      'extends Node2D',
      '',
      '@export var speed := 80.0',
      '',
      'func _process(delta: float) -> void:',
      '\tvar player := get_tree().current_scene.find_child("Player", true, false)',
      '\tif player:',
      '\t\tposition = position.move_toward(player.global_position, speed * delta)',
      '\tqueue_redraw()',
      '',
      'func _draw() -> void:',
      '\tdraw_rect(Rect2(Vector2(-14, -14), Vector2(28, 28)), Color(1.0, 0.25, 0.2))',
      '',
    ].join('\n'),
    'scripts/devtool_survivors/projectile.gd': [
      'extends Node2D',
      '',
      '@export var velocity := Vector2(220.0, 0.0)',
      '',
      'func _process(delta: float) -> void:',
      '\tposition += velocity * delta',
      '\tqueue_redraw()',
      '',
      'func _draw() -> void:',
      '\tdraw_rect(Rect2(Vector2(-6, -6), Vector2(12, 12)), Color(1.0, 0.9, 0.2))',
      '',
    ].join('\n'),
  };
}
