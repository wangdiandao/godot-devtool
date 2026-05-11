import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { GodotServer } from '../build/server/GodotServer.js';
import { commandLineMatchesGodotDevtool } from '../build/server/bridgeProcessCleanup.js';
import { getWsBridge } from '../build/server/transports/wsBridge.js';
import { installEditorBridge } from '../build/godot/editorBridge.js';

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'godot-devtool-process-'));
  try {
    const projectPath = join(tempRoot, 'project');
    await writeFile(join(tempRoot, 'project.godot'), '[application]\nconfig/name="Fixture"\n', 'utf8');
    await writeFile(join(projectPath, 'placeholder'), '', 'utf8').catch(async () => {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(projectPath, { recursive: true }));
      await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Fixture"\n', 'utf8');
    });

    const failingGodot = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\where.exe'
      : await writeFakeGodot(tempRoot, {
          exitCode: 7,
          stderr: 'No valid meshes found in the scene\n',
        });
    const failingServer = new GodotServer({ godotPath: failingGodot });
    await assert.rejects(
      () => failingServer.executeOperation('export_mesh_library', { scenePath: 'main.tscn', outputPath: 'mesh.tres' }, projectPath),
      /Godot operation export_mesh_library failed/
    );

    const instantExitGodot = failingGodot;
    const instantServer = new GodotServer({ godotPath: instantExitGodot });
    const runResponse = await instantServer.handleRunProject({ projectPath });
    assert.equal(runResponse.isError, true, 'run_project must report startup exits as an error');
    assert.match(runResponse.content[0].text, /exited during startup/i);

    const liveServer = new GodotServer({ godotPath: failingGodot });
    liveServer.activeProcess = {
      process: { kill() {} },
      output: ['fake-godot-ready'],
      errors: [],
      startedAt: new Date().toISOString(),
    };
    const stopped = await liveServer.handleStopProject();
    assert.equal(stopped.isError, undefined, 'stop_project should stop an active process');
    const debugOutput = await liveServer.handleGetDebugOutput({});
    const debugPayload = JSON.parse(debugOutput.content[0].text);
    assert.ok(debugPayload.output.some((line) => line.includes('fake-godot-ready')), 'last run output should remain readable after stop_project');
    assert.equal(debugPayload.active, false);

    await assertWebSocketPortConflictIsNonDestructive();
    assertBridgeCleanupCommandLineMatching();
    await assertPluginCleanupPortIsExplicitAndScoped();
    await assertLaunchEditorReusesConnectedEditor(tempRoot);
    await assertOccupiedBridgePortIsDiagnosable(tempRoot);
    await assertMcpServerStartsWhenBridgePortIsOccupied();
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function assertLaunchEditorReusesConnectedEditor(tempRoot) {
  const projectPath = join(tempRoot, 'open-editor-project');
  await mkdir(projectPath, { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Open Editor Fixture"\n', 'utf8');

  const bridge = getWsBridge();
  await bridge.stop();
  const websocketPort = await findFreePort();
  const install = await installEditorBridge(projectPath, { overwrite: true, websocketPort });
  const port = install.bridge.port;
  const editorSocket = await openWebSocket(port);
  try {
    sendMaskedTextFrame(editorSocket, JSON.stringify({
      type: 'hello',
      context: 'editor',
      projectPath,
      protocolVersion: 1,
      sessionId: 'already-open-editor',
      authToken: install.bridge.authToken,
    }));
    await delay(150);
    assert.equal(bridge.status(projectPath).clients.filter((client) => client.context === 'editor').length, 1);

    const instantExitGodot = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\where.exe'
      : await writeFakeGodot(tempRoot, { exitCode: 9, stderr: 'launch_editor should not spawn\n' });
    const server = new GodotServer({ godotPath: instantExitGodot });
    const response = await server.handleLaunchEditor({ projectPath });
    assert.equal(response.isError, undefined, 'launch_editor must reuse an already connected editor instead of spawning');
    assert.match(response.content[0].text, /already connected|existing editor/i);
  } finally {
    editorSocket.destroy();
    await bridge.stop();
  }
}

async function assertOccupiedBridgePortIsDiagnosable(tempRoot) {
  const projectPath = join(tempRoot, 'occupied-bridge-project');
  await mkdir(join(projectPath, '.godot-devtool'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Occupied Bridge Fixture"\n', 'utf8');

  const bridge = getWsBridge();
  await bridge.stop();
  const blocker = await startBlockingPortProcess({ commandLineMarker: join(process.cwd(), 'build', 'index.js') });
  await writeFile(join(projectPath, '.godot-devtool', 'bridge-config.json'), JSON.stringify({
    mode: 'websocket',
    instanceId: 'occupied-bridge',
    projectPath,
    host: '127.0.0.1',
    port: blocker.port,
    url: `ws://127.0.0.1:${blocker.port}`,
    authToken: 'occupied-token',
  }, null, 2), 'utf8');

  try {
    const server = new GodotServer({ godotPath: process.execPath });
    const statusResponse = await server.handleEditorBridgeStatus({ projectPath });
    assert.equal(statusResponse.isError, undefined, 'plugin_status should stay available when the bridge port is occupied');
    const statusPayload = parseToolJson(statusResponse);
    assert.equal(statusPayload.lastState.connected, false, 'current MCP process must not claim a client owned by another listener');
    assert.equal(statusPayload.lastState.portConflict.port, blocker.port, 'plugin_status should report the occupied bridge port');
    assert.match(statusPayload.lastState.portConflict.message, /already.*use|occupied/i);
    assert.match(statusPayload.lastState.portConflict.guidance.join('\n'), /plugin_cleanup_port/);
    assert.match(statusPayload.lastState.portConflict.guidance.join('\n'), /reuse.*MCP|same MCP/i);

    const launchResponse = await server.handleLaunchEditor({ projectPath });
    assert.equal(launchResponse.isError, true, 'launch_editor should not open another editor when the configured bridge port is occupied');
    assert.match(launchResponse.content[0].text, /bridge port .*already.*use|occupied/i);
    assert.match(launchResponse.content[0].text, /plugin_cleanup_port|same MCP|reuse/i);
    assert.equal(blocker.child.exitCode, null, 'diagnostics must not stop the existing bridge listener');
  } finally {
    await bridge.stop();
    await stopChild(blocker.child);
  }
}

async function assertMcpServerStartsWhenBridgePortIsOccupied() {
  const bridge = getWsBridge();
  await bridge.stop();
  const blocker = await startBlockingPortProcess({ commandLineMarker: join(process.cwd(), 'build', 'index.js') });
  const child = spawn(process.execPath, [join(process.cwd(), 'build', 'index.js')], {
    env: {
      ...process.env,
      GODOT_PATH: process.execPath,
      GODOT_DEVTOOL_WS_PORT: String(blocker.port),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    const stderr = await waitForStderr(child, /Godot MCP server running on stdio|Failed to start/i);
    assert.match(stderr, /Godot MCP server running on stdio/i, 'MCP stdio server should still start when the bridge port is occupied');
    assert.match(stderr, /bridge port .*already.*use|occupied/i, 'startup should explain the bridge port conflict');
    assert.equal(child.exitCode, null, 'MCP process must remain alive for native diagnostics and cleanup tools');
  } finally {
    await stopChild(child);
    await stopChild(blocker.child);
  }
}

function assertBridgeCleanupCommandLineMatching() {
  assert.equal(
    commandLineMatchesGodotDevtool('node E:/godot-devtool/build/index.js'),
    true,
    'cleanup should recognize the release-zip MCP entry point'
  );
  assert.equal(
    commandLineMatchesGodotDevtool('node -e "server.listen(8766)"'),
    false,
    'cleanup must not treat arbitrary node listeners as godot-devtool'
  );
}

function waitForStderr(child, pattern) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for stderr pattern ${pattern}. Stderr so far:\n${buffer}`));
    }, 5000);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      if (pattern.test(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Process exited before stderr pattern ${pattern}: code=${code} signal=${signal}\n${buffer}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function assertWebSocketPortConflictIsNonDestructive() {
  const bridge = getWsBridge();
  await bridge.stop();
  const blocker = await startBlockingPortProcess();
  try {
    await assert.rejects(
      () => bridge.start(blocker.port),
      /already in use|GODOT_DEVTOOL_WS_PORT|websocketPort/i,
      'WebSocket bridge must report occupied ports instead of killing the owner'
    );
    assert.equal(bridge.status().running, false, 'failed listen attempts must not leave bridge status as running');
    assert.equal(blocker.child.exitCode, null, 'port owner process must remain alive after bridge start failure');

    await stopChild(blocker.child);
    await bridge.start(blocker.port);
    assert.equal(bridge.status().running, true, 'bridge should start after the port owner exits');
  } finally {
    await bridge.stop();
    await stopChild(blocker.child);
  }
}

async function assertPluginCleanupPortIsExplicitAndScoped() {
  const server = new GodotServer({ godotPath: process.execPath });

  const unrelated = await startBlockingPortProcess();
  try {
    const unrelatedResponse = await server.handlePluginCleanupPort({ port: unrelated.port, kill: true, force: true });
    const unrelatedPayload = parseToolJson(unrelatedResponse);
    assert.equal(unrelatedPayload.killed, 0, 'cleanup must not kill unrelated listeners');
    assert.equal(unrelated.child.exitCode, null, 'unrelated listener must remain alive after cleanup request');

    const wrongPidResponse = await server.handlePluginCleanupPort({
      port: unrelated.port,
      pid: process.pid,
      kill: true,
      force: true,
      allowUnverified: true,
    });
    const wrongPidPayload = parseToolJson(wrongPidResponse);
    assert.equal(wrongPidPayload.killed, 0, 'unverified cleanup must require the exact listener pid');
    assert.equal(unrelated.child.exitCode, null, 'wrong pid guard must leave unrelated listener alive');
  } finally {
    await stopChild(unrelated.child);
  }

  const marker = join(process.cwd(), 'build', 'index.js');
  const stale = await startBlockingPortProcess({ commandLineMarker: marker });
  try {
    const dryRunResponse = await server.handlePluginCleanupPort({ port: stale.port });
    const dryRunPayload = parseToolJson(dryRunResponse);
    assert.equal(dryRunPayload.killRequested, false, 'cleanup must default to dry-run mode');
    assert.equal(dryRunPayload.killed, 0, 'dry-run cleanup must not kill matching listeners');
    assert.ok(
      dryRunPayload.candidates.some((candidate) => candidate.pid === stale.child.pid),
      'dry-run cleanup should identify the listener pid on the occupied port'
    );
    assert.equal(stale.child.exitCode, null, 'dry-run cleanup must leave matching listener alive');

    const killResponse = await server.handlePluginCleanupPort({
      port: stale.port,
      pid: stale.child.pid,
      kill: true,
      force: true,
      allowUnverified: true,
    });
    const killPayload = parseToolJson(killResponse);
    assert.equal(killPayload.killed, 1, 'explicit cleanup must kill exactly one matching stale listener');
    await waitForChildExit(stale.child);
    assert.notEqual(stale.child.exitCode, null, 'matching stale listener should exit after explicit cleanup');

    const bridge = getWsBridge();
    await bridge.stop();
    await bridge.start(stale.port);
    assert.equal(bridge.status().running, true, 'bridge should start after explicit stale listener cleanup');
    await bridge.stop();
  } finally {
    await stopChild(stale.child);
  }
}

async function startBlockingPortProcess(options = {}) {
  const args = [
    '-e',
    [
      "const { createServer } = require('node:http');",
      "const server = createServer((_request, response) => response.end('blocked'));",
      "server.listen(0, '127.0.0.1', () => console.log(server.address().port));",
      'setInterval(() => {}, 1000);',
    ].join(' '),
  ];
  if (options.commandLineMarker) {
    args.push(options.commandLineMarker);
  }
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await readFirstStdoutLine(child);
  return { child, port: Number(port) };
}

function readFirstStdoutLine(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for blocking port process to report its port'));
    }, 5000);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      cleanup();
      resolve(buffer.slice(0, newlineIndex).trim());
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Blocking port process exited before reporting a port: code=${code} signal=${signal}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    child.stdout?.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for child process exit')), 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openWebSocket(port) {
  const socket = connect({ host: '127.0.0.1', port });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write([
    'GET / HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'));
  await new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\r\n\r\n')) {
        socket.off('data', onData);
        resolve();
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
  return socket;
}

async function findFreePort() {
  const child = await startBlockingPortProcess();
  const port = child.port;
  await stopChild(child.child);
  return port;
}

function sendMaskedTextFrame(socket, payload) {
  const data = Buffer.from(payload, 'utf8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const header = data.length < 126
    ? Buffer.from([0x81, 0x80 | data.length])
    : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 0xff]);
  const masked = Buffer.from(data);
  for (let index = 0; index < masked.length; index += 1) {
    masked[index] ^= mask[index % 4];
  }
  socket.write(Buffer.concat([header, mask, masked]));
}

function parseToolJson(response) {
  assert.equal(response.isError, undefined, `tool response should not be an error: ${JSON.stringify(response)}`);
  assert.equal(response.content?.[0]?.type, 'text');
  return JSON.parse(response.content[0].text);
}

async function writeFakeGodot(directory, options) {
  const scriptPath = join(directory, `fake-godot-${Math.random().toString(16).slice(2)}${process.platform === 'win32' ? '.cmd' : '.sh'}`);
  if (process.platform === 'win32') {
    await writeFile(
      scriptPath,
      [
        '@echo off',
        options.stdout ? `echo ${escapeCmd(options.stdout.trim())}` : '',
        options.stderr ? `echo ${escapeCmd(options.stderr.trim())} 1>&2` : '',
        `exit /b ${options.exitCode ?? 0}`,
        '',
      ].join('\r\n'),
      'utf8'
    );
  } else {
    await writeFile(
      scriptPath,
      [
        '#!/bin/sh',
        options.stdout ? `printf '%s\\n' ${JSON.stringify(options.stdout.trim())}` : '',
        options.stderr ? `printf '%s\\n' ${JSON.stringify(options.stderr.trim())} >&2` : '',
        `exit ${options.exitCode ?? 0}`,
        '',
      ].join('\n'),
      'utf8'
    );
    await chmod(scriptPath, 0o755);
  }
  assert.ok(existsSync(scriptPath));
  return scriptPath;
}

function escapeCmd(value) {
  return String(value).replace(/[&|<>^]/g, '^$&');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
