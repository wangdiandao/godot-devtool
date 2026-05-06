import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';

import { isSafeProjectRelativePath } from './pathValidation.js';
import {
  assertWriteAllowed,
  buildDiffSummary,
  type DiffSummary,
  type WriteSafetyResult,
} from './safetyRecovery.js';
import { appendAuditEntry } from './workflowAutomation.js';

export interface ProjectDirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'other';
  size: number;
}

export interface ProjectDirectoryList {
  directory: string;
  entries: ProjectDirectoryEntry[];
}

export interface ProjectFileRead {
  path: string;
  content: string;
  encoding: 'utf8';
  size: number;
}

export interface ProjectWriteOptions {
  overwrite?: boolean;
}

export interface ProjectDeleteOptions {
  confirm?: boolean;
  recursive?: boolean;
}

export interface ProjectChangeResult {
  changedFiles: string[];
  skippedFiles: string[];
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
}

export interface ProjectDeleteResult {
  deletedFiles: string[];
  skippedFiles: string[];
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
}

export interface ProjectDeletePreview {
  targetPath: string;
  exists: boolean;
  type: 'file' | 'directory' | 'other' | 'missing';
  recursive: boolean;
  willDelete: string[];
  requiresConfirmation: true;
  diffSummary: DiffSummary;
}

export async function listProjectDirectory(
  projectPath: string,
  directory = '.'
): Promise<ProjectDirectoryList> {
  const safeDirectory = normalizeProjectRelativePath(directory);
  const absoluteDirectory = resolveProjectPath(projectPath, safeDirectory);
  const directoryStat = await stat(absoluteDirectory);
  if (!directoryStat.isDirectory()) {
    throw new Error(`Project-relative path is not a directory: ${directory}`);
  }

  const entries = await Promise.all(
    (await readdir(absoluteDirectory, { withFileTypes: true })).map(async (entry) => {
      const entryRelativePath = normalizeSlashes(join(safeDirectory, entry.name));
      const entryStat = await stat(join(absoluteDirectory, entry.name));
      return {
        name: entry.name,
        path: entryRelativePath,
        type: entry.isDirectory() ? 'directory' as const : entry.isFile() ? 'file' as const : 'other' as const,
        size: entryStat.size,
      };
    })
  );

  return {
    directory: safeDirectory,
    entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export async function readProjectFile(projectPath: string, filePath: string): Promise<ProjectFileRead> {
  const safeFilePath = normalizeProjectRelativePath(filePath);
  const absoluteFilePath = resolveProjectPath(projectPath, safeFilePath);
  const fileStat = await stat(absoluteFilePath);
  if (!fileStat.isFile()) {
    throw new Error(`Project-relative path is not a file: ${filePath}`);
  }

  return {
    path: safeFilePath,
    content: await readFile(absoluteFilePath, 'utf8'),
    encoding: 'utf8',
    size: fileStat.size,
  };
}

export async function writeProjectFile(
  projectPath: string,
  filePath: string,
  content: string,
  options: ProjectWriteOptions = {}
): Promise<ProjectChangeResult> {
  const safeFilePath = normalizeProjectRelativePath(filePath);
  const absoluteFilePath = resolveProjectPath(projectPath, safeFilePath);
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'filesystem_write',
    riskLevel: 'write',
    changes: [{ path: safeFilePath, content, overwrite: options.overwrite === true }],
  });
  const safety = await assertWriteAllowed(projectPath, {
    operation: 'filesystem_write',
    paths: [safeFilePath],
    riskLevel: 'write',
  });
  if (existsSync(absoluteFilePath) && options.overwrite !== true) {
    throw new Error(`File already exists: ${safeFilePath}. Pass overwrite=true to replace it.`);
  }

  await mkdir(dirname(absoluteFilePath), { recursive: true });
  await writeFile(absoluteFilePath, content, 'utf8');
  const result = { changedFiles: [safeFilePath], skippedFiles: [], safety, diffSummary };

  await appendAuditEntry(projectPath, {
    operation: 'filesystem_write',
    changedFiles: result.changedFiles,
    skippedFiles: result.skippedFiles,
    details: { overwrite: options.overwrite === true },
  });

  return result;
}

export async function deleteProjectPath(
  projectPath: string,
  targetPath: string,
  options: ProjectDeleteOptions = {}
): Promise<ProjectDeleteResult> {
  const safeTargetPath = normalizeProjectRelativePath(targetPath);
  if (safeTargetPath === '.') {
    throw new Error('Refusing to delete the project root');
  }
  if (options.confirm !== true) {
    throw new Error(`Deleting ${safeTargetPath} requires confirm=true`);
  }

  const absoluteTargetPath = resolveProjectPath(projectPath, safeTargetPath);
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'filesystem_delete',
    riskLevel: 'dangerous',
    changes: [{ path: safeTargetPath, delete: true, recursive: options.recursive === true }],
  });
  const safety = await assertWriteAllowed(projectPath, {
    operation: 'filesystem_delete',
    paths: [safeTargetPath],
    riskLevel: 'dangerous',
  });
  if (!existsSync(absoluteTargetPath)) {
    return { deletedFiles: [], skippedFiles: [safeTargetPath], safety, diffSummary };
  }

  await rm(absoluteTargetPath, { recursive: options.recursive === true, force: false });
  const result = { deletedFiles: [safeTargetPath], skippedFiles: [], safety, diffSummary };

  await appendAuditEntry(projectPath, {
    operation: 'filesystem_delete',
    changedFiles: result.deletedFiles,
    skippedFiles: result.skippedFiles,
    details: { recursive: options.recursive === true },
  });

  return result;
}

export async function previewProjectDelete(
  projectPath: string,
  targetPath: string,
  options: Pick<ProjectDeleteOptions, 'recursive'> = {}
): Promise<ProjectDeletePreview> {
  const safeTargetPath = normalizeProjectRelativePath(targetPath);
  if (safeTargetPath === '.') {
    throw new Error('Refusing to preview deletion of the project root');
  }

  const absoluteTargetPath = resolveProjectPath(projectPath, safeTargetPath);
  if (!existsSync(absoluteTargetPath)) {
    const diffSummary = await buildDiffSummary(projectPath, {
      operation: 'filesystem_delete',
      riskLevel: 'dangerous',
      changes: [{ path: safeTargetPath, delete: true, recursive: options.recursive === true }],
    });
    return {
      targetPath: safeTargetPath,
      exists: false,
      type: 'missing',
      recursive: options.recursive === true,
      willDelete: [],
      requiresConfirmation: true,
      diffSummary,
    };
  }

  const targetStat = await stat(absoluteTargetPath);
  const willDelete = targetStat.isDirectory()
    ? await listDeletionTargets(projectPath, absoluteTargetPath, options.recursive === true)
    : [safeTargetPath];
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'filesystem_delete',
    riskLevel: 'dangerous',
    changes: willDelete.map((path) => ({ path, delete: true, recursive: options.recursive === true })),
  });

  return {
    targetPath: safeTargetPath,
    exists: true,
    type: targetStat.isDirectory() ? 'directory' : targetStat.isFile() ? 'file' : 'other',
    recursive: options.recursive === true,
    willDelete,
    requiresConfirmation: true,
    diffSummary,
  };
}

export function normalizeProjectRelativePath(path: string): string {
  if (path === '.' || path === './') {
    return '.';
  }

  const normalized = normalizeSlashes(path.replace(/^res:\/\//, ''));
  if (!isSafeProjectRelativePath(normalized)) {
    throw new Error('Path must be project-relative and must not contain traversal or absolute path prefixes');
  }

  return normalized;
}

function resolveProjectPath(projectPath: string, relativePath: string): string {
  const projectRoot = resolve(projectPath);
  const absolutePath = resolve(projectRoot, relativePath);
  const relation = relative(projectRoot, absolutePath);
  if (relation.startsWith('..') || relation === '..' || resolve(relation) === relation) {
    throw new Error('Resolved path escapes the Godot project root');
  }

  return absolutePath;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

async function listDeletionTargets(
  projectPath: string,
  absolutePath: string,
  recursive: boolean
): Promise<string[]> {
  const targetStat = await stat(absolutePath);
  if (!targetStat.isDirectory()) {
    return [normalizeSlashes(relative(resolve(projectPath), absolutePath))];
  }

  if (!recursive) {
    return [normalizeSlashes(relative(resolve(projectPath), absolutePath))];
  }

  const result: string[] = [];
  for (const entry of await readdir(absolutePath, { withFileTypes: true })) {
    const childPath = join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listDeletionTargets(projectPath, childPath, true)));
    } else {
      result.push(normalizeSlashes(relative(resolve(projectPath), childPath)));
    }
  }
  result.push(normalizeSlashes(relative(resolve(projectPath), absolutePath)));
  return result.sort();
}
