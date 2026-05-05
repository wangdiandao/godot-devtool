import { Dirent } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';

export interface GodotAutoload {
  name: string;
  path: string;
  singleton: boolean;
}

export interface GodotResourceCounts {
  scenes: number;
  scripts: number;
  textures: number;
  audio: number;
  models: number;
  resources: number;
  shaders: number;
  other: number;
}

export interface GodotResourceIndexItem {
  path: string;
  extension: string;
}

export interface GodotResourceIndex {
  scenes: GodotResourceIndexItem[];
  scripts: GodotResourceIndexItem[];
  textures: GodotResourceIndexItem[];
  audio: GodotResourceIndexItem[];
  models: GodotResourceIndexItem[];
  resources: GodotResourceIndexItem[];
  shaders: GodotResourceIndexItem[];
  other: GodotResourceIndexItem[];
}

export interface GodotProjectAnalysis {
  name: string;
  mainScene: string | null;
  autoloads: GodotAutoload[];
  inputActions: string[];
  rendering: {
    method: string | null;
  };
  resourceCounts: GodotResourceCounts;
}

type ProjectSettings = Record<string, Record<string, string>>;

const INITIAL_COUNTS: GodotResourceCounts = {
  scenes: 0,
  scripts: 0,
  textures: 0,
  audio: 0,
  models: 0,
  resources: 0,
  shaders: 0,
  other: 0,
};

const RESOURCE_INDEX_CATEGORIES = [
  'scenes',
  'scripts',
  'textures',
  'audio',
  'models',
  'resources',
  'shaders',
  'other',
] as const;
type ResourceIndexCategory = (typeof RESOURCE_INDEX_CATEGORIES)[number];

const TEXTURE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.aseprite',
]);

const AUDIO_EXTENSIONS = new Set([
  '.ogg',
  '.wav',
  '.mp3',
]);

const MODEL_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.fbx',
  '.obj',
  '.dae',
]);

export async function analyzeGodotProject(projectPath: string): Promise<GodotProjectAnalysis> {
  const projectFilePath = join(projectPath, 'project.godot');
  const projectFileContent = await readFile(projectFilePath, 'utf8');
  const settings = parseProjectSettings(projectFileContent);

  return {
    name: settings.application?.['config/name'] ?? getFallbackProjectName(projectPath),
    mainScene: settings.application?.['run/main_scene'] ?? null,
    autoloads: parseAutoloads(settings.autoload ?? {}),
    inputActions: Object.keys(settings.input ?? {}).sort(),
    rendering: {
      method: settings.rendering?.['renderer/rendering_method'] ?? null,
    },
    resourceCounts: await countProjectResources(projectPath),
  };
}

export function parseProjectSettings(content: string): ProjectSettings {
  const settings: ProjectSettings = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      settings[currentSection] = settings[currentSection] ?? {};
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) {
      continue;
    }

    const key = line.slice(0, assignmentIndex).trim();
    const value = normalizeProjectValue(line.slice(assignmentIndex + 1).trim());
    settings[currentSection][key] = value;
  }

  return settings;
}

export async function indexGodotProjectResources(projectPath: string): Promise<GodotResourceIndex> {
  const index = createEmptyResourceIndex();
  await walkProjectFiles(projectPath, (fullPath, fileName) => {
    const extension = getExtension(fileName);
    const category = getResourceCategory(extension);
    index[category].push({
      path: toResourcePath(projectPath, fullPath),
      extension,
    });
  });

  for (const category of RESOURCE_INDEX_CATEGORIES) {
    index[category].sort((left, right) => left.path.localeCompare(right.path));
  }

  return index;
}

async function countProjectResources(projectPath: string): Promise<GodotResourceCounts> {
  const counts = { ...INITIAL_COUNTS };
  await walkProjectFiles(projectPath, (_fullPath, fileName) => {
    const category = getResourceCategory(getExtension(fileName));
    counts[category] += 1;
  });
  return counts;
}

async function walkProjectFiles(
  directory: string,
  visitFile: (fullPath: string, fileName: string) => void | Promise<void>
): Promise<void> {
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
      await walkProjectFiles(fullPath, visitFile);
      continue;
    }

    await visitFile(fullPath, entry.name);
  }
}

function getResourceCategory(extension: string): ResourceIndexCategory {
  if (extension === '.tscn' || extension === '.scn') {
    return 'scenes';
  } else if (extension === '.gd') {
    return 'scripts';
  } else if (extension === '.tres' || extension === '.res') {
    return 'resources';
  } else if (extension === '.shader' || extension === '.gdshader') {
    return 'shaders';
  } else if (TEXTURE_EXTENSIONS.has(extension)) {
    return 'textures';
  } else if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  } else if (MODEL_EXTENSIONS.has(extension)) {
    return 'models';
  }

  return 'other';
}

function parseAutoloads(autoloadSettings: Record<string, string>): GodotAutoload[] {
  return Object.entries(autoloadSettings).map(([name, rawPath]) => {
    const singleton = rawPath.startsWith('*');
    return {
      name,
      path: singleton ? rawPath.slice(1) : rawPath,
      singleton,
    };
  });
}

function normalizeProjectValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot).toLowerCase();
}

function getFallbackProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1);
}

function createEmptyResourceIndex(): GodotResourceIndex {
  return {
    scenes: [],
    scripts: [],
    textures: [],
    audio: [],
    models: [],
    resources: [],
    shaders: [],
    other: [],
  };
}

function toResourcePath(projectPath: string, fullPath: string): string {
  const relativePath = relative(projectPath, fullPath).replace(/\\/g, '/');
  return `res://${relativePath}`;
}
