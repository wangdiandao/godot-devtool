import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { isSafeProjectRelativePath } from './pathValidation.js';

export interface SceneOpenResult {
  ok: true;
  mode: 'headless_file';
  projectPath: string;
  scenePath: string;
  openedAt: string;
  rootNode: {
    name: string;
    type: string;
  };
  nodeCount: number;
  supportsEditorState: false;
}

export interface EditorUnsupportedResult {
  ok: false;
  status: 'unsupported';
  mode: 'headless_file';
  operation: string;
  message: string;
  supportedWhen: string;
}

export async function openSceneFile(projectPath: string, scenePath: string): Promise<SceneOpenResult> {
  if (!isSafeProjectRelativePath(scenePath) || !scenePath.endsWith('.tscn')) {
    throw new Error('scenePath must be a project-relative .tscn path');
  }

  const absoluteScenePath = join(projectPath, scenePath);
  if (!existsSync(absoluteScenePath)) {
    throw new Error(`Scene file does not exist: ${scenePath}`);
  }

  const sceneContent = await readFile(absoluteScenePath, 'utf8');
  const rootNode = parseRootNode(sceneContent);
  const nodeCount = (sceneContent.match(/^\[node\s/gm) ?? []).length;

  return {
    ok: true,
    mode: 'headless_file',
    projectPath,
    scenePath,
    openedAt: new Date().toISOString(),
    rootNode,
    nodeCount,
    supportsEditorState: false,
  };
}

export function createEditorUnsupportedResult(operation: string): EditorUnsupportedResult {
  return {
    ok: false,
    status: 'unsupported',
    mode: 'headless_file',
    operation,
    message: `${operation} requires a live Godot editor bridge. The current MCP server only has headless/file-based scene access.`,
    supportedWhen: 'A live editor bridge is available and exposes selection and undo/redo state.',
  };
}

function parseRootNode(sceneContent: string): { name: string; type: string } {
  const rootMatch = sceneContent.match(/^\[node\s+name="([^"]+)"\s+type="([^"]+)"/m);
  if (rootMatch) {
    return {
      name: rootMatch[1],
      type: rootMatch[2],
    };
  }

  return {
    name: '',
    type: '',
  };
}
