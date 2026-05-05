import { isSafeProjectRelativePath } from './pathValidation.js';
import { writeProjectFile, type ProjectChangeResult } from './filesystemTools.js';
import { appendAuditEntry } from './workflowAutomation.js';

export interface ScriptCreateOptions {
  scriptPath: string;
  baseType?: string;
  className?: string;
  content?: string;
  overwrite?: boolean;
}

export interface ScriptWriteOptions {
  scriptPath: string;
  content: string;
  overwrite?: boolean;
}

export async function createProjectScript(
  projectPath: string,
  options: ScriptCreateOptions
): Promise<ProjectChangeResult & { scriptPath: string }> {
  const scriptPath = validateScriptPath(options.scriptPath);
  const content = options.content ?? buildDefaultScript(options.baseType ?? 'Node', options.className);
  const result = await writeProjectFile(projectPath, scriptPath, content, {
    overwrite: options.overwrite === true,
  });

  await appendAuditEntry(projectPath, {
    operation: 'script_create',
    changedFiles: result.changedFiles,
    skippedFiles: result.skippedFiles,
    details: {
      scriptPath,
      baseType: options.baseType ?? 'Node',
      className: options.className ?? null,
    },
  });

  return { scriptPath, ...result };
}

export async function writeProjectScript(
  projectPath: string,
  options: ScriptWriteOptions
): Promise<ProjectChangeResult & { scriptPath: string }> {
  const scriptPath = validateScriptPath(options.scriptPath);
  const result = await writeProjectFile(projectPath, scriptPath, options.content, {
    overwrite: options.overwrite === true,
  });

  await appendAuditEntry(projectPath, {
    operation: 'script_write',
    changedFiles: result.changedFiles,
    skippedFiles: result.skippedFiles,
    details: {
      scriptPath,
      overwrite: options.overwrite === true,
    },
  });

  return { scriptPath, ...result };
}

function validateScriptPath(scriptPath: string): string {
  const normalized = scriptPath.replace(/^res:\/\//, '');
  if (!isSafeProjectRelativePath(normalized)) {
    throw new Error('scriptPath must be project-relative and must not contain traversal or absolute path prefixes');
  }

  if (!normalized.endsWith('.gd')) {
    throw new Error('scriptPath must point to a .gd file');
  }

  return normalized;
}

function buildDefaultScript(baseType: string, className?: string): string {
  const lines = [`extends ${baseType}`];
  if (className) {
    lines.push('', `class_name ${className}`);
  }

  lines.push('', 'func _ready() -> void:', '\tpass', '');
  return lines.join('\n');
}
