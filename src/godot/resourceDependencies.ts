import { Dirent } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';

import { parseProjectSettings } from './projectAnalysis.js';

export interface ResourceDependencyNode {
  path: string;
  kind: string;
  referencedBy: string[];
  references: string[];
}

export interface ResourceDependencyEdge {
  from: string;
  to: string;
}

export interface ResourceDependencyGraph {
  nodes: ResourceDependencyNode[];
  edges: ResourceDependencyEdge[];
  entrypoints: string[];
  orphans: ResourceDependencyNode[];
}

const TRACKED_EXTENSIONS = new Set([
  '.tscn',
  '.scn',
  '.gd',
  '.tres',
  '.res',
  '.gdshader',
  '.material',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.ogg',
  '.wav',
  '.mp3',
  '.glb',
  '.gltf',
]);

export async function buildResourceDependencyGraph(projectPath: string): Promise<ResourceDependencyGraph> {
  const files = await listProjectFiles(projectPath);
  const resourcePaths = files.map((filePath) => toResourcePath(projectPath, filePath));
  const resourceSet = new Set(resourcePaths);
  const edges: ResourceDependencyEdge[] = [];
  const nodeMap = new Map<string, ResourceDependencyNode>();

  for (const resourcePath of resourcePaths) {
    nodeMap.set(resourcePath, {
      path: resourcePath,
      kind: kindForPath(resourcePath),
      referencedBy: [],
      references: [],
    });
  }

  for (const filePath of files) {
    const from = toResourcePath(projectPath, filePath);
    const references = extractResourceReferences(await readFile(filePath, 'utf8'));
    for (const to of references) {
      if (!resourceSet.has(to)) continue;
      edges.push({ from, to });
      nodeMap.get(from)?.references.push(to);
      nodeMap.get(to)?.referencedBy.push(from);
    }
  }

  const entrypoints = await getEntrypoints(projectPath);
  const reachable = findReachable(entrypoints, edges);
  const nodes = [...nodeMap.values()].sort((left, right) => left.path.localeCompare(right.path));
  const orphans = nodes.filter((node) => {
    if (entrypoints.includes(node.path)) return false;
    if (node.kind === 'script' && node.referencedBy.length > 0) return false;
    return !reachable.has(node.path) && node.referencedBy.length === 0;
  });

  return {
    nodes,
    edges: edges.sort((left, right) => `${left.from} ${left.to}`.localeCompare(`${right.from} ${right.to}`)),
    entrypoints,
    orphans,
  };
}

async function getEntrypoints(projectPath: string): Promise<string[]> {
  const content = await readFile(join(projectPath, 'project.godot'), 'utf8');
  const settings = parseProjectSettings(content);
  const entrypoints = new Set<string>();
  const mainScene = settings.application?.['run/main_scene'];
  if (mainScene) entrypoints.add(mainScene);
  for (const rawAutoloadPath of Object.values(settings.autoload ?? {})) {
    const autoloadPath = rawAutoloadPath.startsWith('*') ? rawAutoloadPath.slice(1) : rawAutoloadPath;
    if (autoloadPath.startsWith('res://')) entrypoints.add(autoloadPath);
  }
  return [...entrypoints].sort();
}

function extractResourceReferences(content: string): string[] {
  const references = new Set<string>();
  const pattern = /res:\/\/[^"'\]\)\s,]+/g;
  for (const match of content.matchAll(pattern)) {
    references.add(match[0]);
  }
  return [...references].sort();
}

function findReachable(entrypoints: string[], edges: ResourceDependencyEdge[]): Set<string> {
  const bySource = new Map<string, string[]>();
  for (const edge of edges) {
    bySource.set(edge.from, [...(bySource.get(edge.from) ?? []), edge.to]);
  }

  const reachable = new Set<string>();
  const stack = [...entrypoints];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    stack.push(...(bySource.get(current) ?? []));
  }

  return reachable;
}

async function listProjectFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];
  await walk(projectPath, files);
  return files.filter((filePath) => TRACKED_EXTENSIONS.has(extensionForPath(filePath)));
}

async function walk(directory: string, files: string[]): Promise<void> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'build' || entry.name === 'node_modules') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

function toResourcePath(projectPath: string, fullPath: string): string {
  return `res://${relative(projectPath, fullPath).replace(/\\/g, '/')}`;
}

function extensionForPath(path: string): string {
  const dotIndex = path.lastIndexOf('.');
  return dotIndex === -1 ? '' : path.slice(dotIndex).toLowerCase();
}

function kindForPath(path: string): string {
  const extension = extensionForPath(path);
  if (extension === '.tscn' || extension === '.scn') return 'scene';
  if (extension === '.gd') return 'script';
  if (extension === '.gdshader') return 'shader';
  if (extension === '.tres' || extension === '.res' || extension === '.material') return 'resource';
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(extension)) return 'texture';
  if (['.ogg', '.wav', '.mp3'].includes(extension)) return 'audio';
  if (['.glb', '.gltf'].includes(extension)) return 'model';
  return 'other';
}
