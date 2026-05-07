import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import {
  assertWriteAllowed,
  buildDiffSummary,
  type DiffSummary,
  type WriteSafetyResult,
} from './safetyRecovery.js';
import { appendAuditEntry } from './workflowAutomation.js';

const RAW_PROJECT_SETTING_VALUE = Symbol('rawProjectSettingValue');

type RawProjectSettingValue = { readonly [RAW_PROJECT_SETTING_VALUE]: true; readonly __godotRaw: string };
type SettingValue = string | number | boolean | null | RawProjectSettingValue | Record<string, unknown> | unknown[];

export interface ProjectSettingsReadOptions {
  section?: string;
  keys?: string[];
}

export interface ProjectSettingsReadResult {
  projectPath: string;
  section: string | null;
  values: Record<string, string>;
  sections: string[];
}

export interface ProjectSettingsWriteOptions {
  changes: Record<string, SettingValue>;
  dryRun?: boolean;
}

export interface ProjectSettingsWriteResult {
  changed: boolean;
  dryRun: boolean;
  changedKeys: string[];
  preview: Array<{
    key: string;
    before: string | null;
    after: string;
  }>;
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
}

export interface ProjectSettingsDeleteResult {
  changed: boolean;
  dryRun: boolean;
  deletedKeys: string[];
  preview: Array<{
    key: string;
    before: string | null;
  }>;
  safety?: WriteSafetyResult;
  diffSummary?: DiffSummary;
}

interface SectionRange {
  name: string;
  startLine: number;
  endLine: number;
  values: Record<string, string>;
}

export async function readProjectSettings(
  projectPath: string,
  options: ProjectSettingsReadOptions = {}
): Promise<ProjectSettingsReadResult> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    throw new Error('Missing project.godot');
  }

  const content = await readFile(projectFilePath, 'utf8');
  const sections = parseSectionRanges(content.split(/\r?\n/));
  const values: Record<string, string> = {};

  if (options.keys && options.keys.length > 0) {
    for (const fullKey of options.keys) {
      const parsed = splitSettingKey(fullKey);
      const section = sections.find((candidate) => candidate.name === parsed.section);
      if (section && Object.hasOwn(section.values, parsed.key)) {
        values[fullKey] = normalizeProjectValue(section.values[parsed.key]);
      }
    }
  } else if (options.section) {
    const section = sections.find((candidate) => candidate.name === options.section);
    if (section) {
      for (const [key, value] of Object.entries(section.values)) {
        values[`${options.section}/${key}`] = normalizeProjectValue(value);
      }
    }
  } else {
    for (const section of sections) {
      for (const [key, value] of Object.entries(section.values)) {
        values[`${section.name}/${key}`] = normalizeProjectValue(value);
      }
    }
  }

  return {
    projectPath,
    section: options.section ?? null,
    values,
    sections: sections.map((section) => section.name),
  };
}

export async function writeProjectSettings(
  projectPath: string,
  options: ProjectSettingsWriteOptions
): Promise<ProjectSettingsWriteResult> {
  if (!options.changes || typeof options.changes !== 'object' || Array.isArray(options.changes)) {
    throw new Error('changes must be a JSON object keyed by section/key');
  }

  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    throw new Error('Missing project.godot');
  }

  let lines = (await readFile(projectFilePath, 'utf8')).split(/\r?\n/);
  const preview: ProjectSettingsWriteResult['preview'] = [];

  for (const [fullKey, value] of Object.entries(options.changes)) {
    const parsed = splitSettingKey(fullKey);
    const formatted = formatProjectValue(value);
    const before = findCurrentSettingValue(lines, parsed.section, parsed.key);
    preview.push({
      key: fullKey,
      before: before === null ? null : normalizeProjectValue(before),
      after: normalizeProjectValue(formatted),
    });
    lines = applySetting(lines, parsed.section, parsed.key, formatted);
  }

  const changedKeys = preview
    .filter((change) => change.before !== change.after)
    .map((change) => change.key);

  const nextContent = lines.join('\n');
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'project_set_setting',
    riskLevel: 'write',
    changes: [{ path: 'project.godot', content: nextContent, overwrite: true }],
  });
  const safety = options.dryRun || changedKeys.length === 0
    ? diffSummary.policy
    : await assertWriteAllowed(projectPath, {
        operation: 'project_set_setting',
        riskLevel: 'write',
        paths: ['project.godot'],
      });

  if (!options.dryRun && changedKeys.length > 0) {
    await writeFile(projectFilePath, nextContent, 'utf8');
    await appendAuditEntry(projectPath, {
      operation: 'project_set_setting',
      changedFiles: ['project.godot'],
      skippedFiles: [],
      details: { changedKeys },
    });
  }

  return {
    changed: changedKeys.length > 0,
    dryRun: options.dryRun === true,
    changedKeys,
    preview,
    safety,
    diffSummary,
  };
}

export async function deleteProjectSettings(
  projectPath: string,
  keys: string[],
  options: { dryRun?: boolean } = {}
): Promise<ProjectSettingsDeleteResult> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    throw new Error('Missing project.godot');
  }

  let lines = (await readFile(projectFilePath, 'utf8')).split(/\r?\n/);
  const preview: ProjectSettingsDeleteResult['preview'] = [];

  for (const fullKey of keys) {
    const parsed = splitSettingKey(fullKey);
    const before = findCurrentSettingValue(lines, parsed.section, parsed.key);
    preview.push({
      key: fullKey,
      before: before === null ? null : normalizeProjectValue(before),
    });
    lines = removeSetting(lines, parsed.section, parsed.key);
  }

  const deletedKeys = preview.filter((entry) => entry.before !== null).map((entry) => entry.key);
  const nextContent = lines.join('\n');
  const diffSummary = await buildDiffSummary(projectPath, {
    operation: 'project_delete_setting',
    riskLevel: 'write',
    changes: [{ path: 'project.godot', content: nextContent, overwrite: true }],
  });
  const safety = options.dryRun || deletedKeys.length === 0
    ? diffSummary.policy
    : await assertWriteAllowed(projectPath, {
        operation: 'project_delete_setting',
        riskLevel: 'write',
        paths: ['project.godot'],
      });
  if (!options.dryRun && deletedKeys.length > 0) {
    await writeFile(projectFilePath, nextContent, 'utf8');
    await appendAuditEntry(projectPath, {
      operation: 'project_delete_setting',
      changedFiles: ['project.godot'],
      skippedFiles: [],
      details: { deletedKeys },
    });
  }

  return {
    changed: deletedKeys.length > 0,
    dryRun: options.dryRun === true,
    deletedKeys,
    preview,
    safety,
    diffSummary,
  };
}

function parseSectionRanges(lines: string[]): SectionRange[] {
  const sections: SectionRange[] = [];
  let currentSection: SectionRange | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (currentSection) {
        currentSection.endLine = lineIndex;
      }
      currentSection = {
        name: sectionMatch[1],
        startLine: lineIndex,
        endLine: lines.length,
        values: {},
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection || !line || line.startsWith(';') || line.startsWith('#')) continue;
    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;
    currentSection.values[line.slice(0, assignmentIndex).trim()] = line.slice(assignmentIndex + 1).trim();
  }

  return sections;
}

function splitSettingKey(fullKey: string): { section: string; key: string } {
  const firstSlash = fullKey.indexOf('/');
  if (firstSlash <= 0 || firstSlash === fullKey.length - 1) {
    throw new Error(`Project setting key must use section/key format: ${fullKey}`);
  }

  const section = fullKey.slice(0, firstSlash);
  const key = fullKey.slice(firstSlash + 1);
  if (!/^[A-Za-z0-9_./-]+$/.test(section) || !/^[A-Za-z0-9_./-]+$/.test(key)) {
    throw new Error(`Unsafe project setting key: ${fullKey}`);
  }

  return { section, key };
}

function findCurrentSettingValue(lines: string[], sectionName: string, key: string): string | null {
  const section = parseSectionRanges(lines).find((candidate) => candidate.name === sectionName);
  return section?.values[key] ?? null;
}

function applySetting(lines: string[], sectionName: string, key: string, value: string): string[] {
  const nextLines = [...lines];
  const sections = parseSectionRanges(nextLines);
  const section = sections.find((candidate) => candidate.name === sectionName);

  if (!section) {
    if (nextLines.at(-1)?.trim() !== '') nextLines.push('');
    nextLines.push(`[${sectionName}]`, `${key}=${value}`, '');
    return nextLines;
  }

  for (let lineIndex = section.startLine + 1; lineIndex < section.endLine; lineIndex += 1) {
    const line = nextLines[lineIndex].trim();
    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;
    if (line.slice(0, assignmentIndex).trim() === key) {
      nextLines[lineIndex] = `${key}=${value}`;
      return nextLines;
    }
  }

  let insertionIndex = section.endLine;
  while (insertionIndex > section.startLine + 1 && nextLines[insertionIndex - 1].trim() === '') {
    insertionIndex -= 1;
  }
  nextLines.splice(insertionIndex, 0, `${key}=${value}`);
  return nextLines;
}

function removeSetting(lines: string[], sectionName: string, key: string): string[] {
  const nextLines = [...lines];
  const section = parseSectionRanges(nextLines).find((candidate) => candidate.name === sectionName);
  if (!section) return nextLines;

  for (let lineIndex = section.startLine + 1; lineIndex < section.endLine; lineIndex += 1) {
    const line = nextLines[lineIndex].trim();
    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;
    if (line.slice(0, assignmentIndex).trim() === key) {
      nextLines.splice(lineIndex, 1);
      return nextLines;
    }
  }

  return nextLines;
}

function formatProjectValue(value: SettingValue): string {
  if (isRawProjectSettingValue(value)) {
    assertRawProjectSettingValue(value.__godotRaw);
    return value.__godotRaw;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') {
    if (hasStructuralRawProjectValue(value)) {
      throw new Error('Raw project setting values are only allowed through rawProjectSettingValue().');
    }
    return JSON.stringify(value);
  }
  assertSingleLineProjectValue(value, 'project setting string value');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function rawProjectSettingValue(value: string): RawProjectSettingValue {
  assertRawProjectSettingValue(value);
  return { [RAW_PROJECT_SETTING_VALUE]: true, __godotRaw: value };
}

function isRawProjectSettingValue(value: SettingValue): value is RawProjectSettingValue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as RawProjectSettingValue)[RAW_PROJECT_SETTING_VALUE] === true &&
    typeof (value as RawProjectSettingValue).__godotRaw === 'string'
  );
}

function hasStructuralRawProjectValue(value: SettingValue): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.hasOwn(value as object, '__godotRaw')
  );
}

function assertSingleLineProjectValue(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} must not contain newline, CR, or LF characters.`);
  }
}

function assertRawProjectSettingValue(value: string): void {
  if (/[\r\n]\s*\[[^\]]+\]/.test(value) || /[\r\n][A-Za-z0-9_./-]+\s*=/.test(value)) {
    throw new Error('raw project setting value must not inject new sections or settings.');
  }
}

function normalizeProjectValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  return value;
}
