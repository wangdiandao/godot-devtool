import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { GodotServer } from '../build/server/GodotServer.js';

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
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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
