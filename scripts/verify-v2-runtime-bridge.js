import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { installEditorBridge, readEditorBridgeStatus } = await import('../build/godot/editorBridge.js');
const { getWsBridge } = await import('../build/server/transports/wsBridge.js');
const projectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-v2-runtime-'));

try {
  await writeFile(
    join(projectPath, 'project.godot'),
    [
      '[application]',
      'config/name="godot-devtool v2 Runtime Verify"',
      '',
    ].join('\n'),
    'utf8'
  );

  const install = await installEditorBridge(projectPath, { overwrite: true, websocketPort: 8766 });
  assert.equal(install.bridge.mode, 'websocket');
  assert.equal(install.bridge.port, 8766);
  assert.ok(install.changedFiles.includes('addons/godot_devtool/plugin.cfg'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/plugin.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/command_router.gd'));
  assert.ok(install.changedFiles.includes('addons/godot_devtool/runtime_bridge.gd'));
  assert.ok(existsSync(join(projectPath, 'addons', 'godot_devtool', 'commands', 'runtime_commands.gd')));

  const projectFile = await readFile(join(projectPath, 'project.godot'), 'utf8');
  assert.match(projectFile, /DevtoolRuntime="\*res:\/\/addons\/godot_devtool\/runtime_bridge\.gd"/);

  const status = await readEditorBridgeStatus(projectPath);
  assert.equal(status.installed, true);
  assert.equal(status.bridge.mode, 'websocket');
  assert.equal(status.bridge.port, 8766);
  assert.equal(status.runtime.installed, true);
  assert.equal(status.runtime.transport, 'runtime_ws');

  const pluginSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'plugin.gd'), 'utf8');
  const runtimeSource = readFileSync(join(projectPath, 'addons', 'godot_devtool', 'runtime_bridge.gd'), 'utf8');
  assert.match(pluginSource, /dispatch_command/);
  assert.match(runtimeSource, /simulate_action/);
  assert.match(runtimeSource, /get_game_node_properties/);
  assert.match(runtimeSource, /get_game_screenshot/);

  console.log('Verified v2 runtime bridge installation into a project fixture.');
} finally {
  await getWsBridge().stop();
  await rm(projectPath, { recursive: true, force: true });
}
