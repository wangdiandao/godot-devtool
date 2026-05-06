import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const projectSettings = await import('../build/godot/projectSettings.js');
const editorBridge = await import('../build/godot/editorBridge.js');
const dependencies = await import('../build/godot/resourceDependencies.js');
const filesystem = await import('../build/godot/filesystemTools.js');
const exportConfig = await import('../build/godot/exportConfig.js');
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
  assert.ok(install.changedFiles.includes('addons/godot_devtool_bridge/plugin.cfg'));
  assert.ok(existsSync(join(projectPath, 'addons/godot_devtool_bridge/godot_devtool_bridge.gd')));
  assert.equal(install.bridge.mode, 'file');
  assert.ok(install.bridge.instanceId);

  const command = await editorBridge.enqueueEditorCommand(projectPath, {
    type: 'select_node',
    payload: { scenePath: 'res://scenes/main.tscn', nodePath: 'root/Main' },
    timeoutMs: 2500,
  });
  assert.equal(command.type, 'select_node');
  assert.ok(command.commandId);
  assert.equal(command.timeoutMs, 2500);
  assert.ok(command.createdAt);
  assert.ok(command.expiresAt);

  const commandFile = JSON.parse(await readFile(join(projectPath, command.commandPath), 'utf8'));
  assert.equal(commandFile.commandId, command.commandId);
  assert.equal(commandFile.timeoutMs, 2500);
  assert.equal(commandFile.status, 'queued');

  const inspectorRead = await editorBridge.enqueueEditorCommand(projectPath, {
    type: 'inspector_get_properties',
    payload: { scenePath: 'res://scenes/main.tscn', nodePath: 'root/Main', propertyNames: ['name', 'position'] },
  });
  assert.equal(inspectorRead.type, 'inspector_get_properties');

  const inspectorWrite = await editorBridge.enqueueEditorCommand(projectPath, {
    type: 'inspector_set_properties',
    payload: { scenePath: 'res://scenes/main.tscn', nodePath: 'root/Main', properties: { visible: true } },
  });
  assert.equal(inspectorWrite.type, 'inspector_set_properties');

  const bridgeStatus = await editorBridge.readEditorBridgeStatus(projectPath);
  assert.equal(bridgeStatus.installed, true);
  assert.equal(bridgeStatus.bridge.mode, 'file');
  assert.equal(bridgeStatus.pendingCommands, 3);
  assert.equal(bridgeStatus.pendingCommandDetails.length, 3);
  assert.ok(bridgeStatus.instanceId);
  assert.deepEqual(bridgeStatus.recentReceipts, []);

  const bridgeScript = await readFile(join(projectPath, 'addons/godot_devtool_bridge/godot_devtool_bridge.gd'), 'utf8');
  assert.match(bridgeScript, /func _write_receipt/);
  assert.match(bridgeScript, /inspector_get_properties/);
  assert.match(bridgeScript, /inspector_set_properties/);
  assert.match(bridgeScript, /expiresAt/);

  const graph = await dependencies.buildResourceDependencyGraph(projectPath);
  assert.ok(graph.nodes.some((node) => node.path === 'res://scripts/player.gd'));
  assert.ok(graph.edges.some((edge) => edge.from === 'res://scenes/main.tscn' && edge.to === 'res://scripts/player.gd'));
  assert.ok(graph.orphans.some((node) => node.path === 'res://unused.tres'));

  const preview = await filesystem.previewProjectDelete(projectPath, 'unused.tres');
  assert.equal(preview.willDelete.length, 1);
  await stat(join(projectPath, 'unused.tres'));

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
    readRepoFile('.gitignore'),
  ]);
  const tsconfig = JSON.parse(tsconfigRaw);
  const packageJson = JSON.parse(packageRaw);
  const releaseVersion = packageJson.version;
  const escapedReleaseVersion = releaseVersion.replaceAll('.', '\\.');

  const shaderTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'shader');
  const materialTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'material');
  const animationTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'animation');
  const animationTreeTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'animation_state_machine');
  const uiTool = toolDefinitions.GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === 'ui');
  assert.ok(shaderTool);
  assert.ok(materialTool);
  assert.ok(animationTool);
  assert.ok(animationTreeTool);
  assert.ok(uiTool);
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

  assert.match(readme, new RegExp(`version-${escapedReleaseVersion}`));
  assert.match(readmeZh, new RegExp(`version-${escapedReleaseVersion}`));
  assert.match(readme, /Latest release package/);
  assert.match(readme, new RegExp(`godot-devtool-build-${escapedReleaseVersion}\\.zip`));
  assert.match(readmeZh, /最新发行包/);
  assert.match(readmeZh, new RegExp(`godot-devtool-build-${escapedReleaseVersion}\\.zip`));
  assert.match(readme, /## All Tools/);
  assert.match(readmeZh, /## 全部工具/);

  assert.match(changelog, /\[中文\]\(CHANGELOG\.zh-CN\.md\)/);
  assert.match(changelogZh, /\[English\]\(CHANGELOG\.md\)/);
  for (const version of [releaseVersion, '1.3.0', '1.2.1', '1.2.0', '1.1.0', '1.0.0']) {
    assert.match(changelog, new RegExp(`## Version ${version}`));
    assert.match(changelogZh, new RegExp(`## ${version}`));
  }

  assert.match(roadmap, /\[中文\]\(ROADMAP\.zh-CN\.md\)/);
  assert.match(roadmapZh, /\[English\]\(ROADMAP\.md\)/);
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
  await rm(projectPath, { recursive: true, force: true });
}
