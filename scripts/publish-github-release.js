import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = `v${version}`;
const repo = process.env.GITHUB_REPOSITORY || 'wangdiandao/godot-devtool';
const assetName = `godot-devtool-build-${version}.zip`;
const assetPath = join(process.cwd(), assetName);
const npmCommand = process.env.npm_execpath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmRunArgs = process.env.npm_execpath ? [process.env.npm_execpath, 'run'] : ['run'];
let uploaded = false;

try {
  if (!existsSync(join(process.cwd(), 'build', 'index.js'))) {
    throw new Error('build/index.js is missing. Run npm run build before publishing.');
  }

  rmSync(assetPath, { force: true });
  runReleaseGuards(tag);
  createZip(assetPath);

  if (!releaseExists(repo, tag)) {
    execFileSync('gh', [
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--target',
      'main',
      '--title',
      `godot-devtool ${version}`,
      '--notes',
      `godot-devtool ${version}`,
    ], { stdio: 'inherit' });
  }

  execFileSync('gh', [
    'release',
    'upload',
    tag,
    assetPath,
    '--repo',
    repo,
    ...(process.env.ALLOW_RELEASE_CLOBBER === 'true' ? ['--clobber'] : []),
  ], { stdio: 'inherit' });
  uploaded = true;
} finally {
  if (uploaded && existsSync(assetPath)) {
    rmSync(assetPath, { force: true });
    console.log(`Deleted local release package after upload: ${assetName}`);
  }
}

function runReleaseGuards(releaseTag) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (dirty) {
    throw new Error('Refusing to publish from a dirty worktree. Commit or stash local changes first.');
  }

  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  if (branch !== 'main' && process.env.ALLOW_RELEASE_BRANCH !== 'true') {
    throw new Error(`Refusing to publish from ${branch || 'detached HEAD'}. Use main or set ALLOW_RELEASE_BRANCH=true intentionally.`);
  }

  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  let tagSha = '';
  try {
    tagSha = execFileSync('git', ['rev-parse', `refs/tags/${releaseTag}^{}`], { encoding: 'utf8' }).trim();
  } catch {
    execFileSync('git', ['tag', releaseTag, headSha], { stdio: 'inherit' });
    tagSha = headSha;
  }
  if (tagSha !== headSha) {
    throw new Error(`Refusing to publish ${releaseTag}: tag points to ${tagSha}, but HEAD is ${headSha}.`);
  }

  execFileSync(npmCommand, [...npmRunArgs, 'verify:all'], { stdio: 'inherit' });
}

function createZip(destination) {
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Compress-Archive -Path '${join(process.cwd(), 'build', '*').replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`,
    ], { stdio: 'inherit' });
    return;
  }

  execFileSync('zip', ['-r', destination, 'build'], { stdio: 'inherit' });
}

function releaseExists(repository, releaseTag) {
  try {
    execFileSync('gh', ['release', 'view', releaseTag, '--repo', repository], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
