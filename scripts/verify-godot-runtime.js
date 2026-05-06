import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const godotPath = process.env.GODOT_PATH;
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
