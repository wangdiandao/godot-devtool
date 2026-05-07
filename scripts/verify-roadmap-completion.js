import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const projectSettings = await import('../build/godot/projectSettings.js');
const editorBridge = await import('../build/godot/editorBridge.js');
const { getWsBridge } = await import('../build/server/transports/wsBridge.js');
const dependencies = await import('../build/godot/resourceDependencies.js');
const filesystem = await import('../build/godot/filesystemTools.js');
const exportConfig = await import('../build/godot/exportConfig.js');
const safetyRecovery = await import('../build/godot/safetyRecovery.js');
const toolDefinitions = await import('../build/tools/toolDefinitions.js');

const projectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-roadmap-'));

try {
  await writeFile(
    join(projectPath, 'project.godot'),
    [
      '[application]',
      'config/name="Roadmap Fixture"',
      'run/main_scene="res://scenes/main.tscn"',
      '',
      '[input]',
      'move_left={"deadzone":0.5,"events":[]}',
      '',
    ].join('\n'),
    'utf8'
  );

  await filesystem.writeProjectFile(projectPath, 'scenes/main.tscn', [
    '[gd_scene load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://scripts/player.gd" id="1_player"]',
    '',
    '[node name="Main" type="Node2D"]',
    'script = ExtResource("1_player")',
    '',
  ].join('\n'));
  await filesystem.writeProjectFile(projectPath, 'scripts/player.gd', [
    'extends Node2D',
    'const ICON := preload("res://icon.svg")',
    '',
  ].join('\n'));
  await filesystem.writeProjectFile(projectPath, 'icon.svg', '<svg></svg>');
  await filesystem.writeProjectFile(projectPath, 'unused.tres', '[gd_resource type="Resource" format=3]\n');

  const settings = await projectSettings.readProjectSettings(projectPath, {
    keys: ['application/config/name'],
  });
  assert.equal(settings.values['application/config/name'], 'Roadmap Fixture');

  await projectSettings.writeProjectSettings(projectPath, {
    changes: {
      'application/config/name': 'Roadmap Updated',
      'rendering/renderer/rendering_method': 'gl_compatibility',
    },
  });
  const deleteResult = await projectSettings.deleteProjectSettings(projectPath, ['input/move_left']);
  assert.deepEqual(deleteResult.deletedKeys, ['input/move_left']);
  const updatedProjectFile = await readFile(join(projectPath, 'project.godot'), 'utf8');
  assert.match(updatedProjectFile, /config\/name="Roadmap Updated"/);
  assert.match(updatedProjectFile, /\[rendering\]/);
  assert.doesNotMatch(updatedProjectFile, /move_left=/);

  const install = await editorBridge.installEditorBridge(projectPath, { overwrite: true });
  assert.ok(install.changedFiles.includes('addons/godot_devtool/plugin.cfg'));
  assert.ok(existsSync(join(projectPath, 'addons/godot_devtool/plugin.gd')));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/runtime_bridge.gd'));
  assert.ok(existsSync(join(projectPath, 'addons/godot_devtool/runtime_bridge.gd')));
  assert.equal(install.bridge.mode, 'websocket');
  assert.equal(install.bridge.port, 8766);
  assert.ok(install.bridge.instanceId);
  assert.equal(install.runtime.enabled, true);
  assert.equal(install.runtime.statePath, '.godot-devtool/runtime-state.json');
  const installedProjectFile = await readFile(join(projectPath, 'project.godot'), 'utf8');
  assert.match(installedProjectFile, /DevtoolRuntime="\*res:\/\/addons\/godot_devtool\/runtime_bridge.gd"/);

  const bridgeStatus = await editorBridge.readEditorBridgeStatus(projectPath);
  assert.equal(bridgeStatus.installed, true);
  assert.equal(bridgeStatus.bridge.mode, 'websocket');
  assert.equal(bridgeStatus.runtime.installed, true);
  assert.equal(bridgeStatus.runtime.transport, 'runtime_ws');
  assert.equal(bridgeStatus.runtime.statePath, '.godot-devtool/runtime-state.json');
  assert.equal(bridgeStatus.pendingCommands, 0);
  assert.equal(bridgeStatus.pendingCommandDetails.length, 0);
  assert.ok(bridgeStatus.instanceId);
  assert.deepEqual(bridgeStatus.recentReceipts, []);

  const bridgeScript = await readFile(join(projectPath, 'addons/godot_devtool/plugin.gd'), 'utf8');
  assert.match(bridgeScript, /WebSocketPeer/);
  assert.match(bridgeScript, /dispatch_command/);
  const runtimeScript = await readFile(join(projectPath, 'addons/godot_devtool/runtime_bridge.gd'), 'utf8');
  assert.match(runtimeScript, /class_name GodotDevtoolRuntimeBridge/);
  assert.match(runtimeScript, /get_game_scene_tree/);
  assert.match(runtimeScript, /simulate_action/);
  assert.match(runtimeScript, /get_game_screenshot/);

  const graph = await dependencies.buildResourceDependencyGraph(projectPath);
  assert.ok(graph.nodes.some((node) => node.path === 'res://scripts/player.gd'));
  assert.ok(graph.edges.some((edge) => edge.from === 'res://scenes/main.tscn' && edge.to === 'res://scripts/player.gd'));
  assert.ok(graph.orphans.some((node) => node.path === 'res://unused.tres'));

  const preview = await filesystem.previewProjectDelete(projectPath, 'unused.tres');
  assert.equal(preview.willDelete.length, 1);
  assert.ok(preview.diffSummary);
  assert.equal(preview.diffSummary.files[0].action, 'delete');
  await stat(join(projectPath, 'unused.tres'));

  const defaultPolicy = await safetyRecovery.readSafetyPolicy(projectPath);
  assert.equal(defaultPolicy.usingDefaultPolicy, true);
  assert.equal(defaultPolicy.policy.enabled, false);

  const defaultSafety = await safetyRecovery.evaluateWriteSafety(projectPath, {
    operation: 'filesystem_write',
    paths: ['notes/default-policy.txt'],
    riskLevel: 'write',
  });
  assert.equal(defaultSafety.decision, 'not_configured');
  assert.equal(defaultSafety.allowed, true);

  await safetyRecovery.writeSafetyPolicy(projectPath, {
    enabled: true,
    writeAllowlist: ['scripts/**', '.godot-devtool/**'],
    blockedPaths: ['scripts/blocked.gd'],
  });
  const policy = await safetyRecovery.readSafetyPolicy(projectPath);
  assert.equal(policy.usingDefaultPolicy, false);
  assert.equal(policy.policy.enabled, true);

  const allowedWrite = await filesystem.writeProjectFile(projectPath, 'scripts/allowed.gd', 'extends Node\n');
  assert.equal(allowedWrite.safety.decision, 'allowed');
  assert.equal(allowedWrite.diffSummary.files[0].action, 'create');

  await assert.rejects(
    () => filesystem.writeProjectFile(projectPath, 'scripts/blocked.gd', 'extends Node\n'),
    /blocked by safety policy/
  );

  const writePreview = await safetyRecovery.buildDiffSummary(projectPath, {
    operation: 'filesystem_write',
    riskLevel: 'write',
    changes: [{ path: 'scripts/allowed.gd', content: 'extends Node2D\n' }],
  });
  assert.equal(writePreview.files[0].action, 'modify');
  assert.equal(writePreview.files[0].lineDelta, 0);
  assert.equal(writePreview.policy.decision, 'allowed');

  await writeFile(
    join(projectPath, '.godot-devtool', 'audit.jsonl'),
    [
      JSON.stringify({ timestamp: '2026-05-06T00:00:00.000Z', operation: 'filesystem_write', changedFiles: ['scripts/allowed.gd'], skippedFiles: [], details: { overwrite: false } }),
      '{not-json',
      JSON.stringify({ timestamp: '2026-05-06T00:01:00.000Z', operation: 'filesystem_delete', changedFiles: ['unused.tres'], skippedFiles: [], details: { recursive: false } }),
      '',
    ].join('\n'),
    'utf8'
  );
  const replay = await safetyRecovery.buildAuditReplay(projectPath, { limit: 10 });
  assert.equal(replay.totalEntries, 2);
  assert.equal(replay.parseErrors.length, 1);
  assert.equal(replay.operationCounts.filesystem_write, 1);
  assert.equal(replay.changedFileCounts['scripts/allowed.gd'], 1);
  assert.ok(replay.riskHighlights.some((highlight) => highlight.operation === 'filesystem_delete'));

  const rollback = await safetyRecovery.suggestRollback(projectPath, {
    operation: 'filesystem_write',
    changedFiles: ['scripts/allowed.gd'],
    details: { overwrite: true },
  });
  assert.equal(rollback.supported, false);
  assert.ok(rollback.suggestions.some((suggestion) => suggestion.includes('VCS')));

  await writeFile(
    join(projectPath, 'export_presets.cfg'),
    [
      '[preset.0]',
      'name="Windows Desktop"',
      'platform="Windows Desktop"',
      'runnable=true',
      'export_path="builds/windows/game.exe"',
      '',
      '[preset.0.options]',
      'application/icon="res://missing.svg"',
      '',
    ].join('\n'),
    'utf8'
  );
  const matrix = await exportConfig.buildExportMatrix(projectPath);
  assert.equal(matrix.targets.length, 1);
  assert.equal(matrix.targets[0].platformFamily, 'desktop');
  assert.ok(matrix.targets[0].issues.some((issue) => issue.message.includes('icon')));

  const tilemapTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'tilemap');
  assert.ok(tilemapTool);
  const tilemapActions = tilemapTool.inputSchema.properties.action.enum;
  for (const action of [
    'add_atlas_source',
    'set_tile_metadata',
    'set_tile_collision',
    'set_tile_navigation',
    'set_terrain',
    'paint_random',
    'apply_template',
  ]) {
    assert.ok(tilemapActions.includes(action), `tilemap action missing: ${action}`);
  }

  const operationsScript = await readFile(join(process.cwd(), 'build/scripts/godot_operations.gd'), 'utf8');
  assert.match(operationsScript, /func tilemap_add_atlas_source/);
  assert.match(operationsScript, /func tilemap_set_tile_metadata/);
  assert.match(operationsScript, /func tilemap_set_tile_collision/);
  assert.match(operationsScript, /func tilemap_set_tile_navigation/);
  assert.match(operationsScript, /func tilemap_set_terrain/);
  assert.match(operationsScript, /func tilemap_paint_random/);
  assert.match(operationsScript, /func tilemap_apply_template/);
  assert.match(operationsScript, /survivor_arena/);

  const readRepoFile = (path) => readFile(join(process.cwd(), path), 'utf8');
  const [
    readme,
    readmeZh,
    roadmap,
    roadmapZh,
    changelog,
    changelogZh,
    license,
    tsconfigRaw,
    packageRaw,
    skillRaw,
    gitignore,
  ] = await Promise.all([
    readRepoFile('README.md'),
    readRepoFile('README.zh-CN.md'),
    readRepoFile('ROADMAP.md'),
    readRepoFile('ROADMAP.zh-CN.md'),
    readRepoFile('CHANGELOG.md'),
    readRepoFile('CHANGELOG.zh-CN.md'),
    readRepoFile('LICENSE'),
    readRepoFile('tsconfig.json'),
    readRepoFile('package.json'),
    readRepoFile('skills/godot-devtool/SKILL.md'),
    readRepoFile('.gitignore'),
  ]);
  const tsconfig = JSON.parse(tsconfigRaw);
  const packageJson = JSON.parse(packageRaw);
  const releaseVersion = packageJson.version;
  const escapedReleaseVersion = releaseVersion.replaceAll('.', '\\.');
  const latestReleaseZipVersion = '2.4.0';
  const escapedLatestReleaseZipVersion = latestReleaseZipVersion.replaceAll('.', '\\.');
  assert.equal(releaseVersion, '2.4.0');

  const shaderTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'shader');
  const materialTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'material');
  const animationTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'animation');
  const animationTreeTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'animation_state_machine');
  const uiTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'ui');
  const physicsTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'physics');
  const navigationTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'navigation');
  const ciSnippetTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'generate_ci_snippet');
  const getSafetyPolicyTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'get_safety_policy');
  const setSafetyPolicyTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'set_safety_policy');
  const previewWriteSafetyTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'preview_write_safety');
  const auditReplayTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'get_audit_replay');
  const rollbackSuggestionsTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'get_rollback_suggestions');
  assert.ok(shaderTool);
  assert.ok(materialTool);
  assert.ok(animationTool);
  assert.ok(animationTreeTool);
  assert.ok(uiTool);
  assert.ok(physicsTool);
  assert.ok(navigationTool);
  assert.ok(ciSnippetTool);
  assert.ok(getSafetyPolicyTool);
  assert.ok(setSafetyPolicyTool);
  assert.ok(previewWriteSafetyTool);
  assert.ok(auditReplayTool);
  assert.ok(rollbackSuggestionsTool);
  for (const action of ['create', 'read', 'inspect', 'set_parameters']) {
    assert.ok(shaderTool.inputSchema.properties.action.enum.includes(action), `shader action missing: ${action}`);
  }
  for (const field of ['includePaths', 'textureDefaults']) {
    assert.ok(shaderTool.inputSchema.properties[field], `shader field missing: ${field}`);
  }
  for (const action of ['create', 'read', 'update', 'apply', 'list_templates', 'create_from_template']) {
    assert.ok(materialTool.inputSchema.properties.action.enum.includes(action), `material action missing: ${action}`);
  }
  for (const action of ['list', 'create', 'add_track', 'set_keyframe', 'get_info', 'remove']) {
    assert.ok(animationTool.inputSchema.properties.action.enum.includes(action), `animation action missing: ${action}`);
  }
  for (const action of ['list', 'create', 'set_transition_parameters']) {
    assert.ok(animationTreeTool.inputSchema.properties.action.enum.includes(action), `animation_state_machine action missing: ${action}`);
  }
  for (const action of ['create', 'create_theme', 'apply_theme', 'create_template', 'auto_connect_signals']) {
    assert.ok(uiTool.inputSchema.properties.action.enum.includes(action), `ui action missing: ${action}`);
  }
  for (const action of [
    'list',
    'create',
    'set_layers',
    'get_collision_info',
    'create_shape_resource',
    'create_area_trigger_template',
    'create_character_controller_template',
    'analyze_scene_physics',
  ]) {
    assert.ok(physicsTool.inputSchema.properties.action.enum.includes(action), `physics action missing: ${action}`);
  }
  for (const field of ['collisionLayer', 'collisionMask', 'collisionLayerNames', 'shapeResourcePath', 'templateName', 'dimensions', 'radius', 'height']) {
    assert.ok(physicsTool.inputSchema.properties[field], `physics field missing: ${field}`);
  }
  for (const action of [
    'list',
    'create',
    'set_polygon',
    'configure_bake',
    'bake_navigation_mesh',
    'query_path',
    'create_debug_geometry',
  ]) {
    assert.ok(navigationTool.inputSchema.properties.action.enum.includes(action), `navigation action missing: ${action}`);
  }
  for (const field of ['agentRadius', 'cellSize', 'cellHeight', 'startPosition', 'endPosition', 'debugNodeName']) {
    assert.ok(navigationTool.inputSchema.properties[field], `navigation field missing: ${field}`);
  }
  for (const field of ['provider', 'includeExport', 'includeArtifactUpload']) {
    assert.ok(ciSnippetTool.inputSchema.properties[field], `generate_ci_snippet field missing: ${field}`);
  }
  for (const field of ['enabled', 'writeAllowlist', 'blockedPaths']) {
    assert.ok(setSafetyPolicyTool.inputSchema.properties[field], `set_safety_policy field missing: ${field}`);
  }
  for (const field of ['operation', 'riskLevel', 'changes']) {
    assert.ok(previewWriteSafetyTool.inputSchema.properties[field], `preview_write_safety field missing: ${field}`);
  }

  const exportInspection = await exportConfig.inspectExportPresets(projectPath);
  assert.ok(exportInspection.issues.some((issue) => issue.code === 'missing_export_template' && issue.suggestion));
  assert.ok(exportInspection.issues.some((issue) => issue.code === 'missing_icon' && issue.cause));
  assert.ok(exportInspection.metadata.projectName);

  const exportMatrix = await exportConfig.buildExportMatrix(projectPath);
  assert.ok(exportMatrix.targets[0].templateChecks.length > 0);
  assert.ok(exportMatrix.targets[0].signingDetails.length > 0);
  assert.ok(exportMatrix.targets[0].artifact);
  assert.ok(exportMatrix.generatedCiSnippets.githubActions.includes('godot --headless'));

  const workflowChecks = await import('../build/godot/workflowAutomation.js');
  const checkResult = await workflowChecks.runProjectChecks(projectPath);
  assert.ok(checkResult.checks.every((check) => check.code && check.cause && check.suggestion));
  const exportCheck = checkResult.checks.find((check) => check.name === 'export_presets');
  assert.ok(exportCheck);
  assert.ok(exportCheck.details.issues.some((issue) => issue.code && issue.suggestion));

  assert.match(operationsScript, /func collect_shader_includes/);
  assert.match(operationsScript, /func collect_shader_texture_uniforms/);
  assert.match(operationsScript, /func create_material_from_template/);
  assert.match(operationsScript, /func animation_add_track/);
  assert.match(operationsScript, /func animation_set_keyframe/);
  assert.match(operationsScript, /func animation_get_info/);
  assert.match(operationsScript, /func animation_remove/);
  assert.match(operationsScript, /func animation_tree_set_transition_parameters/);
  assert.match(operationsScript, /func ui_create_theme/);
  assert.match(operationsScript, /func ui_create_template/);
  assert.match(operationsScript, /func ui_auto_connect_signals/);
  assert.match(operationsScript, /func physics_set_layers/);
  assert.match(operationsScript, /func physics_create_shape_resource/);
  assert.match(operationsScript, /func physics_create_area_trigger_template/);
  assert.match(operationsScript, /func physics_create_character_controller_template/);
  assert.match(operationsScript, /func physics_analyze_scene/);
  assert.match(operationsScript, /func navigation_configure_bake/);
  assert.match(operationsScript, /func navigation_bake_mesh/);
  assert.match(operationsScript, /func navigation_query_path/);
  assert.match(operationsScript, /func navigation_create_debug_geometry/);

  assert.match(readme, new RegExp(`version-${escapedReleaseVersion}`));
  assert.match(readmeZh, new RegExp(`version-${escapedReleaseVersion}`));
  assert.match(readme, /Install From Release Zip/);
  assert.match(readme, new RegExp(`godot-devtool-build-${escapedLatestReleaseZipVersion}\\.zip`));
  assert.match(readmeZh, /从 Release Zip 安装/);
  assert.match(readmeZh, new RegExp(`godot-devtool-build-${escapedLatestReleaseZipVersion}\\.zip`));
  assert.match(readme, /## What It Can Do/);
  assert.match(readme, /## All \d+ Tools/);
  assert.match(readme, /### Project Tools \(\d+\)/);
  assert.match(readme, /\| Tool \| Description \|/);
  assert.match(readme, /\| `get_project_info` \|/);
  assert.match(readme, /\| `plugin_status` \|/);
  assert.match(readmeZh, /## 全部 \d+ 个工具/);
  assert.match(readmeZh, /### 项目工具 \(\d+\)/);
  assert.match(readmeZh, /\| 工具 \| 描述 \|/);
  assert.match(readmeZh, /\| `get_project_info` \|/);
  assert.match(readmeZh, /\| `plugin_status` \|/);
  assert.doesNotMatch(readmeZh, /### Project Tools/);
  assert.doesNotMatch(readmeZh, /Executable compatibility wrapper/);
  assert.doesNotMatch(readmeZh, /Compatibility alias for/);
  assert.match(readme, /generate_ci_snippet/);
  assert.match(readmeZh, /generate_ci_snippet/);
  assert.match(readme, /plugin_install/);
  assert.match(readmeZh, /plugin_install/);
  assert.match(readme, /Ask AI To Install It/);
  assert.match(readmeZh, /让 AI 协助安装/);
  assert.match(readme, /What It Can Do/);
  assert.match(readmeZh, /能做什么/);
  assert.match(readme, /godot-mcp-pro/);
  assert.match(readmeZh, /godot-mcp-pro/);
  assert.match(readme, /Expand-Archive/);
  assert.match(readmeZh, /Expand-Archive/);
  assert.match(readme, /assert_node_state/);
  assert.match(readmeZh, /assert_node_state/);
  assert.match(readme, /ws:\/\/127\.0\.0\.1:8766/);
  assert.match(readmeZh, /ws:\/\/127\.0\.0\.1:8766/);
  assert.match(readmeZh, /## 能做什么/);
  assert.match(readme, /\[skills\/godot-devtool\/SKILL\.md\]\(skills\/godot-devtool\/SKILL\.md\)/);
  assert.match(readmeZh, /\[skills\/godot-devtool\/SKILL\.md\]\(skills\/godot-devtool\/SKILL\.md\)/);

  assert.match(skillRaw, /^name: godot-devtool$/m);
  assert.match(skillRaw, /mcp_server: "godot-devtool"/);
  assert.match(skillRaw, new RegExp(`version: "${escapedReleaseVersion}"`));
  assert.match(skillRaw, new RegExp(`Compatibility: \`godot-devtool\` ${escapedReleaseVersion}\\.`));
  assert.match(skillRaw, /get_capabilities/);
  assert.match(skillRaw, /run_project_checks/);
  assert.match(skillRaw, /MCP clients and connected AI assistants/);
  assert.match(skillRaw, /"mcpServers"/);
  assert.match(skillRaw, /plugin_install/);
  assert.match(skillRaw, /runtime_ws/);
  assert.equal(existsSync(join(process.cwd(), 'skills/godot-devtool/agents/openai.yaml')), false);
  assert.equal(packageJson.scripts['verify:tools'], 'npm run build && node scripts/verify-tool-definitions.js');
  assert.equal(packageJson.scripts['verify:plugin'], 'npm run build && node scripts/verify-godot-plugin.js');
  assert.equal(packageJson.scripts['verify:runtime'], 'npm run build && node scripts/verify-godot-runtime.js');
  assert.equal(packageJson.scripts['verify:all'], 'npm run verify:tools && npm run verify:gdscripts && npm run verify:plugin && npm run verify:roadmap');
  assert.equal(packageJson.scripts['release:github'], 'npm run build && node scripts/publish-github-release.js');
  assert.ok(existsSync(join(process.cwd(), 'scripts/verify-godot-plugin.js')));
  assert.ok(existsSync(join(process.cwd(), 'scripts/verify-godot-runtime.js')));
  assert.equal(existsSync(join(process.cwd(), 'scripts/verify-v2-capabilities.js')), false);
  assert.equal(existsSync(join(process.cwd(), 'scripts/verify-v2-plugin-router.js')), false);
  assert.equal(existsSync(join(process.cwd(), 'scripts/verify-v2-runtime-bridge.js')), false);
  assert.ok(existsSync(join(process.cwd(), 'scripts/publish-github-release.js')));
  assert.ok(existsSync(join(process.cwd(), 'build/skills/godot-devtool/SKILL.md')));
  assert.match(await readRepoFile('build/skills/godot-devtool/SKILL.md'), new RegExp(`version: "${escapedReleaseVersion}"`));
  assert.match(changelog, /\[中文\]\(CHANGELOG\.zh-CN\.md\)/);
  assert.match(changelogZh, /\[English\]\(CHANGELOG\.md\)/);
  for (const version of [releaseVersion, '2.1.0', '2.0.0', '1.8.0', '1.7.0', '1.6.0', '1.5.0', '1.4.0', '1.3.1', '1.3.0', '1.2.1', '1.2.0', '1.1.0', '1.0.0']) {
    assert.match(changelog, new RegExp(`## Version ${version}`));
    assert.match(changelogZh, new RegExp(`## ${version}`));
  }
  assert.match(roadmap, /\[中文\]\(ROADMAP\.zh-CN\.md\)/);
  assert.match(roadmapZh, /\[English\]\(ROADMAP\.md\)/);
  assert.doesNotMatch(roadmap, /### 1\.4\.0/);
  assert.doesNotMatch(roadmapZh, /### 1\.4\.0/);
  assert.doesNotMatch(roadmap, /### 1\.5\.0/);
  assert.doesNotMatch(roadmapZh, /### 1\.5\.0/);
  assert.doesNotMatch(roadmap, /### 1\.6\.0/);
  assert.doesNotMatch(roadmapZh, /### 1\.6\.0/);
  assert.doesNotMatch(roadmap, /### 1\.7\.0/);
  assert.doesNotMatch(roadmapZh, /### 1\.7\.0/);
  assert.doesNotMatch(roadmap, /### 1\.3\.0/);
  assert.doesNotMatch(roadmapZh, /### 1\.3\.0/);
  assert.match(roadmap, /## Future Versions/);
  assert.match(roadmapZh, /## 未来计划/);

  assert.doesNotMatch(license, /Solomon Elias|Coding-Solo|godot-mcp/i);
  assert.doesNotMatch(roadmap, /Coding-Solo|godot-mcp|Solomon Elias/i);
  assert.doesNotMatch(changelog, /Solomon Elias/i);
  assert.equal(tsconfig.compilerOptions.module, 'NodeNext');
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'NodeNext');
  assert.deepEqual(tsconfig.compilerOptions.types, ['node']);
  assert.deepEqual(tsconfig.include, ['src/**/*.ts']);
  assert.ok(tsconfig.exclude.includes('scripts'));
  assert.match(gitignore, /\/godot-devtool-build-\*\.zip/);
  assert.match(gitignore, /\/\.godot\//);
  assert.doesNotMatch(tsconfigRaw, /Coding-Solo|godot-mcp|Solomon Elias/i);
  assert.doesNotMatch(gitignore, /Coding-Solo|godot-mcp|Solomon Elias/i);

  console.log('roadmap completion verification passed');
} finally {
  await getWsBridge().stop();
  await rm(projectPath, { recursive: true, force: true });
}
