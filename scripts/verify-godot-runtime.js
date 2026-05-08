import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const godotPath = process.env.GODOT_PATH;
verifyRuntimeBridgeSources();

assert.ok(godotPath, 'GODOT_PATH must point to a Godot executable');
assert.ok(existsSync(godotPath), `GODOT_PATH does not exist: ${godotPath}`);

const operationsScriptPath = join(process.cwd(), 'build', 'scripts', 'godot_operations.gd');
assert.ok(existsSync(operationsScriptPath), `Missing generated operations script: ${operationsScriptPath}`);

const projectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-runtime-'));

try {
  await writeFile(
    join(projectPath, 'project.godot'),
    [
      '[application]',
      'config/name="godot-devtool Runtime Verify"',
      '',
    ].join('\n'),
    'utf8'
  );
  await mkdir(join(projectPath, '.godot-devtool-logs'), { recursive: true });

  const version = await runProcess(godotPath, ['--version']);
  assertProcessSuccess('godot --version', version);
  assert.match(version.stdout, /\d+\.\d+/, 'Godot version output should contain a version number');

  await runGodotOperation('create_scene', {
    scene_path: 'scenes/main.tscn',
    root_node_type: 'Node2D',
  }, { parseJson: false });

  const trigger = await runGodotOperation('physics', {
    scene_path: 'scenes/main.tscn',
    action: 'create_area_trigger_template',
    parent_node_path: 'root',
    node_name: 'Trigger',
    collision_layer: 2,
    collision_mask: 4,
    shape_type: 'CircleShape2D',
    radius: 12,
  });
  assert.equal(trigger.nodeType, 'Area2D');
  assert.equal(trigger.nodePath, 'root/Trigger');

  const collisionInfo = await runGodotOperation('physics', {
    scene_path: 'scenes/main.tscn',
    action: 'get_collision_info',
  });
  assert.ok(collisionInfo.physics.some((entry) => entry.path === 'root/Trigger'));

  const analysis = await runGodotOperation('physics', {
    scene_path: 'scenes/main.tscn',
    action: 'analyze_scene_physics',
  });
  assert.equal(analysis.action, 'analyze_scene_physics');
  assert.equal(analysis.summary.errors, 0);

  const debugGeometry = await runGodotOperation('navigation', {
    scene_path: 'scenes/main.tscn',
    action: 'create_debug_geometry',
    start_position: { type: 'Vector2', value: [0, 0] },
    end_position: { type: 'Vector2', value: [64, 32] },
  });
  assert.equal(debugGeometry.action, 'create_debug_geometry');
  assert.equal(debugGeometry.pointCount, 2);

  console.log(`runtime verification passed with ${version.stdout.trim()}`);
} finally {
  await rm(projectPath, { recursive: true, force: true });
}

async function runGodotOperation(operation, params, options = {}) {
  const result = await runProcess(godotPath, [
    '--headless',
    '--log-file',
    join(projectPath, '.godot-devtool-logs', `${operation}-${Date.now()}.log`),
    '--path',
    projectPath,
    '--script',
    operationsScriptPath,
    operation,
    JSON.stringify(params),
  ]);

  assertProcessSuccess(`godot operation ${operation}`, result);
  if (options.parseJson === false) {
    return result;
  }
  return extractLastJsonObject(result.stdout);
}

function runProcess(file, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        code: null,
        signal: null,
        stdout: '',
        stderr: '',
        error: error?.message || String(error),
      });
      return;
    }

    let settled = false;
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      resolve({
        code: null,
        signal: null,
        stdout,
        stderr,
        error: error?.message || String(error),
      });
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({
        code,
        signal,
        stdout,
        stderr,
        error: null,
      });
    });
  });
}

function assertProcessSuccess(label, result) {
  assert.equal(
    result.code,
    0,
    `${label} failed\nexitCode=${result.code}\nsignal=${result.signal}\nerror=${result.error || ''}\nstdout=${result.stdout}\nstderr=${result.stderr}`
  );
}

function extractLastJsonObject(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith('{')) continue;
    return JSON.parse(lines[index]);
  }
  throw new Error(`No JSON object found in stdout:\n${stdout}`);
}

function verifyRuntimeBridgeSources() {
  const sourceRuntimeCommands = readFileSync(
    join(process.cwd(), 'src', 'addons', 'godot_devtool', 'commands', 'runtime_commands.gd'),
    'utf8'
  );
  const sourceRuntimeBridge = readFileSync(join(process.cwd(), 'src', 'addons', 'godot_devtool', 'runtime_bridge.gd'), 'utf8');
  const sourceCommandRouter = readFileSync(join(process.cwd(), 'src', 'addons', 'godot_devtool', 'command_router.gd'), 'utf8');
  const sourceAddonRuntime = [sourceRuntimeCommands, sourceRuntimeBridge, sourceCommandRouter].join('\n');
  const installedBridgeGenerator = readFileSync(join(process.cwd(), 'src', 'godot', 'editorBridge.ts'), 'utf8');

  for (const [label, source] of [
    ['source addon runtime bridge', sourceAddonRuntime],
    ['installed runtime bridge generator', installedBridgeGenerator],
  ]) {
    assert.match(source, /Input\.parse_input_event/, `${label} must inject key and mouse input through Input.parse_input_event`);
    assert.match(source, /InputMap\.has_action/, `${label} must validate simulate_action names against InputMap`);
    assert.match(source, /InputEventKey\.new/, `${label} must create InputEventKey for simulate_key`);
    assert.match(source, /InputEventMouseButton\.new/, `${label} must create InputEventMouseButton for simulate_mouse_click`);
    assert.match(source, /InputEventMouseMotion\.new/, `${label} must create InputEventMouseMotion for simulate_mouse_move`);
    assert.match(source, /delayFrames/, `${label} must honor per-event sequence frame delays`);
    assert.match(source, /"ok": not failed.*results/s, `${label} must preserve sequence failures instead of reporting success-only receipts`);
    assert.match(source, /"start_recording"/, `${label} must register start_recording`);
    assert.match(source, /"stop_recording"/, `${label} must register stop_recording`);
    assert.match(source, /"replay_recording"/, `${label} must register replay_recording`);
    assert.match(source, /func _input\(event: InputEvent\)/, `${label} must capture runtime input events while recording`);
    assert.match(source, /FileAccess\.WRITE/, `${label} must persist input recordings as files`);
    assert.match(source, /FileAccess\.READ/, `${label} must read input recordings for replay`);
    assert.match(source, /JSON\.parse_string/, `${label} must parse recording JSON before replay`);
  }
}
