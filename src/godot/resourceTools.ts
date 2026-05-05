import { existsSync } from 'fs';
import { join } from 'path';

import {
  normalizeProjectRelativePath,
  readProjectFile,
  writeProjectFile,
  type ProjectChangeResult,
} from './filesystemTools.js';

const SUPPORTED_RESOURCE_EXTENSIONS = ['.tres', '.res', '.tscn', '.scn', '.gdshader', '.material'];

export interface ResourceCreateOptions {
  resourcePath: string;
  resourceType: string;
  properties?: Record<string, string | number | boolean | null>;
  overwrite?: boolean;
}

export interface ResourceSaveOptions {
  resourcePath: string;
  content: string;
  overwrite?: boolean;
}

export interface ProjectResourceRead {
  resourcePath: string;
  resourceType: string;
  content: string;
  encoding: 'utf8';
}

export async function loadProjectResource(
  projectPath: string,
  resourcePath: string
): Promise<ProjectResourceRead> {
  const safeResourcePath = validateResourcePath(resourcePath);
  const readResult = await readProjectFile(projectPath, safeResourcePath);

  return {
    resourcePath: safeResourcePath,
    resourceType: detectResourceType(safeResourcePath, readResult.content),
    content: readResult.content,
    encoding: readResult.encoding,
  };
}

export async function createProjectResource(
  projectPath: string,
  options: ResourceCreateOptions
): Promise<ProjectChangeResult & { resourcePath: string; resourceType: string }> {
  const safeResourcePath = validateResourcePath(options.resourcePath);
  const content = buildResourceContent(options.resourceType, options.properties ?? {});
  const result = await writeProjectFile(projectPath, safeResourcePath, content, {
    overwrite: options.overwrite === true,
  });

  return {
    resourcePath: safeResourcePath,
    resourceType: options.resourceType,
    ...result,
  };
}

export async function saveProjectResource(
  projectPath: string,
  options: ResourceSaveOptions
): Promise<ProjectChangeResult & { resourcePath: string; resourceType: string }> {
  const safeResourcePath = validateResourcePath(options.resourcePath);
  if (existsSync(join(projectPath, safeResourcePath)) && options.overwrite !== true) {
    throw new Error(`Resource already exists: ${safeResourcePath}. Pass overwrite=true to replace it.`);
  }

  const result = await writeProjectFile(projectPath, safeResourcePath, options.content, {
    overwrite: options.overwrite === true,
  });

  return {
    resourcePath: safeResourcePath,
    resourceType: detectResourceType(safeResourcePath, options.content),
    ...result,
  };
}

function validateResourcePath(resourcePath: string): string {
  const safeResourcePath = normalizeProjectRelativePath(resourcePath);
  if (!SUPPORTED_RESOURCE_EXTENSIONS.some((extension) => safeResourcePath.endsWith(extension))) {
    throw new Error(`Resource path must use a supported resource extension: ${SUPPORTED_RESOURCE_EXTENSIONS.join(', ')}`);
  }

  return safeResourcePath;
}

function buildResourceContent(
  resourceType: string,
  properties: Record<string, string | number | boolean | null>
): string {
  const lines = [`[gd_resource type="${resourceType}" format=3]`, ''];
  for (const [key, value] of Object.entries(properties)) {
    lines.push(`${key} = ${formatResourceValue(value)}`);
  }

  if (lines.at(-1) !== '') {
    lines.push('');
  }

  return lines.join('\n');
}

function detectResourceType(resourcePath: string, content: string): string {
  const resourceMatch = content.match(/^\[gd_resource\s+type="([^"]+)"/m);
  if (resourceMatch) return resourceMatch[1];

  if (content.match(/^\[gd_scene\b/m)) return 'PackedScene';
  if (resourcePath.endsWith('.gdshader')) return 'Shader';
  if (resourcePath.endsWith('.material')) return 'Material';
  return 'Resource';
}

function formatResourceValue(value: string | number | boolean | null): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
