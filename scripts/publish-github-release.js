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
let uploaded = false;

try {
  if (!existsSync(join(process.cwd(), 'build', 'index.js'))) {
    throw new Error('build/index.js is missing. Run npm run build before publishing.');
  }

  rmSync(assetPath, { force: true });
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
    '--clobber',
  ], { stdio: 'inherit' });
  uploaded = true;
} finally {
  if (uploaded && existsSync(assetPath)) {
    rmSync(assetPath, { force: true });
    console.log(`Deleted local release package after upload: ${assetName}`);
  }
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
