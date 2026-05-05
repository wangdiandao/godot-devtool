import { Dirent } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';

export interface GDScriptSummary {
  path: string;
  className: string | null;
  extendsClass: string | null;
  functions: string[];
  exports: string[];
}

export interface GDScriptAnalysis extends GDScriptSummary {
  nodePaths: string[];
  resourcePaths: string[];
  lineCount: number;
  content: string;
}

export async function indexGDScriptFiles(projectPath: string): Promise<GDScriptSummary[]> {
  const files: string[] = [];
  await walk(projectPath, async (fullPath, fileName) => {
    if (fileName.endsWith('.gd')) {
      files.push(fullPath);
    }
  });

  const summaries = await Promise.all(
    files.sort().map(async (fullPath) => {
      const content = await readFile(fullPath, 'utf8');
      const metadata = parseGDScriptMetadata(content);
      return {
        path: toResourcePath(projectPath, fullPath),
        className: metadata.className,
        extendsClass: metadata.extendsClass,
        functions: metadata.functions,
        exports: metadata.exports,
      };
    })
  );

  return summaries;
}

export async function analyzeGDScriptFile(projectPath: string, scriptPath: string): Promise<GDScriptAnalysis> {
  const fullPath = toProjectFilePath(projectPath, scriptPath);
  const content = await readFile(fullPath, 'utf8');
  const metadata = parseGDScriptMetadata(content);

  return {
    path: normalizeResourcePath(scriptPath),
    className: metadata.className,
    extendsClass: metadata.extendsClass,
    functions: metadata.functions,
    exports: metadata.exports,
    nodePaths: extractNodePaths(content),
    resourcePaths: extractResourcePaths(content),
    lineCount: countLines(content),
    content,
  };
}

export async function readGDScriptFile(projectPath: string, scriptPath: string): Promise<{ path: string; content: string }> {
  const fullPath = toProjectFilePath(projectPath, scriptPath);
  const content = await readFile(fullPath, 'utf8');
  return {
    path: normalizeResourcePath(scriptPath),
    content,
  };
}

function parseGDScriptMetadata(content: string): Omit<GDScriptSummary, 'path'> {
  const className = content.match(/^\s*class_name\s+([A-Za-z_][A-Za-z0-9_]*)/m)?.[1] ?? null;
  const extendsClass = content.match(/^\s*extends\s+([A-Za-z_][A-Za-z0-9_./"]*)/m)?.[1]?.replaceAll('"', '') ?? null;
  const functions = [...content.matchAll(/^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)].map((match) => match[1]);
  const exports = [...content.matchAll(/^\s*@export(?:\([^)]*\))?\s+var\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map(
    (match) => match[1]
  );

  return {
    className,
    extendsClass,
    functions,
    exports,
  };
}

function extractNodePaths(content: string): string[] {
  const paths = new Set<string>();

  for (const match of content.matchAll(/\$([A-Za-z0-9_./]+)/g)) {
    paths.add(`$${match[1]}`);
  }

  for (const match of content.matchAll(/get_node(?:_or_null)?\(\s*"([^"]+)"\s*\)/g)) {
    paths.add(match[1]);
  }

  return [...paths].sort();
}

function extractResourcePaths(content: string): string[] {
  const paths = new Set<string>();

  for (const match of content.matchAll(/res:\/\/[^"')\s]+/g)) {
    paths.add(match[0]);
  }

  return [...paths].sort();
}

async function walk(directory: string, visitFile: (fullPath: string, fileName: string) => void | Promise<void>): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, visitFile);
      continue;
    }

    await visitFile(fullPath, entry.name);
  }
}

function normalizeResourcePath(scriptPath: string): string {
  return scriptPath.startsWith('res://') ? scriptPath : `res://${scriptPath.replace(/\\/g, '/')}`;
}

function toProjectFilePath(projectPath: string, scriptPath: string): string {
  const relativePath = scriptPath.startsWith('res://') ? scriptPath.slice('res://'.length) : scriptPath;
  return join(projectPath, relativePath);
}

function toResourcePath(projectPath: string, fullPath: string): string {
  return `res://${relative(projectPath, fullPath).replace(/\\/g, '/')}`;
}

function countLines(content: string): number {
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  if (!normalized) return 0;
  return normalized.split(/\r?\n/).length;
}
