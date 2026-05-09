import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();

function readSourceTree(relativeDirectory) {
  const directory = join(repoRoot, relativeDirectory);
  const sources = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      sources.push(readSourceTree(relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      sources.push(readFileSync(join(repoRoot, relativePath), 'utf8'));
    }
  }
  return sources.join('\n');
}

const filesystem = await import('../build/godot/filesystemTools.js');
const projectSettings = await import('../build/godot/projectSettings.js');
const editorBridge = await import('../build/godot/editorBridge.js');
const { getWsBridge } = await import('../build/server/transports/wsBridge.js');

const projectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-security-project-'));
const outsidePath = await mkdtemp(join(tmpdir(), 'godot-devtool-security-outside-'));
const bridgePort = Number(process.env.GODOT_DEVTOOL_SECURITY_WS_PORT ?? 18766);
const bridge = getWsBridge();

try {
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Security Fixture"\n', 'utf8');
  await writeFile(join(outsidePath, 'secret.txt'), 'outside secret\n', 'utf8');

  await assert.rejects(
    () => projectSettings.writeProjectSettings(projectPath, {
      changes: {
        'application/config/name': 'Safe"\n[autoload]\nInjected="*res://evil.gd"',
      },
    }),
    /unsafe|newline|raw/i,
    'project settings string values must reject CR/LF injection'
  );

  await assert.rejects(
    () => projectSettings.writeProjectSettings(projectPath, {
      changes: {
        'application/config/name': { __godotRaw: '"Safe"\n[autoload]\nInjected="*res://evil.gd"' },
      },
    }),
    /raw|trusted|unsafe/i,
    'public JSON-shaped raw project setting values must be rejected'
  );

  await assertSymlinkEscapeRejected(projectPath, outsidePath);

  const install = await editorBridge.installEditorBridge(projectPath, { overwrite: true, websocketPort: bridgePort });
  assert.ok(install.bridge.authToken, 'plugin_install must generate a bridge auth token');
  const config = JSON.parse(await readFile(join(projectPath, '.godot-devtool', 'bridge-config.json'), 'utf8'));
  assert.equal(typeof config.authToken, 'string');
  assert.ok(config.authToken.length >= 32, 'bridge auth token must have meaningful entropy');

  await bridge.start(bridgePort);
  const unauthorizedSocket = await openWebSocket(bridgePort);
  sendMaskedTextFrame(unauthorizedSocket, JSON.stringify({
    type: 'hello',
    context: 'runtime',
    projectPath,
    protocolVersion: 1,
    sessionId: 'attacker',
  }));
  await delay(150);
  assert.equal(
    bridge.status(projectPath).clients.length,
    0,
    'unauthenticated bridge hello must not register a client'
  );
  unauthorizedSocket.destroy();

  const lazyProjectPath = await mkdtemp(join(tmpdir(), 'godot-devtool-security-lazy-auth-'));
  await mkdir(join(lazyProjectPath, '.godot-devtool'), { recursive: true });
  await writeFile(join(lazyProjectPath, 'project.godot'), '[application]\nconfig/name="Lazy Auth Fixture"\n', 'utf8');
  await writeFile(join(lazyProjectPath, '.godot-devtool', 'bridge-config.json'), JSON.stringify({
    mode: 'websocket',
    instanceId: 'lazy-auth-fixture',
    projectPath: lazyProjectPath,
    host: '127.0.0.1',
    port: bridgePort,
    url: `ws://127.0.0.1:${bridgePort}`,
    authToken: 'lazy-auth-token-with-enough-entropy',
  }, null, 2), 'utf8');
  const lazySocket = await openWebSocket(bridgePort);
  sendMaskedTextFrame(lazySocket, JSON.stringify({
    type: 'hello',
    context: 'editor',
    projectPath: lazyProjectPath,
    protocolVersion: 1,
    sessionId: 'lazy-auth-editor',
    authToken: 'lazy-auth-token-with-enough-entropy',
  }));
  await delay(150);
  assert.equal(
    bridge.status(lazyProjectPath).clients.length,
    1,
    'WebSocket bridge must lazily load project auth from .godot-devtool/bridge-config.json during hello'
  );
  lazySocket.destroy();
  await rm(lazyProjectPath, { recursive: true, force: true });

  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts['verify:all'], /verify:runtime/, 'verify:all must include verify:runtime');
  assert.match(packageJson.scripts['verify:all'], /verify:security/, 'verify:all must include verify:security');

  const releaseSource = readFileSync(join(repoRoot, 'scripts/publish-github-release.js'), 'utf8');
  for (const requiredPattern of [
    /git[\s\S]*status[\s\S]*--porcelain/,
    /rev-parse[\s\S]*HEAD/,
    /rev-parse[\s\S]*refs\/tags/,
    /verify:all/,
    /ALLOW_RELEASE_CLOBBER/,
  ]) {
    assert.match(releaseSource, requiredPattern, `release script is missing guard: ${requiredPattern}`);
  }

  const serverSource = readSourceTree('src/server');
  assert.match(serverSource, /execFileAsync\(this\.godotPath!, args, \{[\s\S]*timeout:/, 'headless Godot exec must set a timeout');
  assert.match(serverSource, /killSignal:/, 'headless Godot timeout must configure a kill signal');
  assert.match(serverSource, /createGodotLogArgs[\s\S]*--log-file/, 'Godot process launches must use an explicit writable log file');
  assert.match(serverSource, /\['--headless', \.\.\.this\.createGodotLogArgs/, 'headless Godot exec args must insert log-file before --path');
  assert.match(serverSource, /\['-e', \.\.\.this\.createGodotLogArgs\('launch-editor'\), '--path'/, 'launch_editor must insert log-file before --path');
  assert.match(serverSource, /cmdArgs\.push\(\.\.\.this\.createGodotLogArgs\('run-project'\)\)/, 'run_project must insert log-file before --path');
  assert.match(serverSource, /stdio:\s*'ignore'/, 'launch_editor must not keep undrained stdio pipes');
  assert.match(serverSource, /validateScriptPath|normalizeScriptPath/, 'script_attach must normalize and validate scriptPath');

  const runtimeCommands = readFileSync(join(repoRoot, 'src/addons/godot_devtool/commands/runtime_commands.gd'), 'utf8');
  assert.match(runtimeCommands, /_safe_devtool_output_path/, 'runtime output paths must go through a safe output helper');
  assert.match(runtimeCommands, /begins_with\("res:\/\/\.godot-devtool\/"\)/, 'runtime outputs must be constrained to .godot-devtool');

  console.log('security hardening verification passed');
} finally {
  await bridge.stop();
  await rm(projectPath, { recursive: true, force: true });
  await rm(outsidePath, { recursive: true, force: true });
}

async function assertSymlinkEscapeRejected(projectRoot, outsideRoot) {
  const linkPath = join(projectRoot, 'outside-link');
  try {
    await symlink(outsideRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    const source = readFileSync(join(repoRoot, 'src/godot/filesystemTools.ts'), 'utf8');
    assert.match(source, /realpath/, 'filesystem path containment must canonicalize symlinks');
    return;
  }

  await assert.rejects(
    () => filesystem.readProjectFile(projectRoot, 'outside-link/secret.txt'),
    /escape|symlink|outside|project root/i,
    'project-relative reads must reject symlink escapes'
  );
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
