import { existsSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join } from 'path';

export interface GodotExportPreset {
  index: number;
  name: string;
  platform: string;
  runnable: boolean;
  exportPath: string | null;
  options: Record<string, string>;
}

export interface GodotExportIssue {
  severity: 'error' | 'warning';
  preset?: string;
  message: string;
}

export interface GodotExportInspection {
  hasExportPresets: boolean;
  presets: GodotExportPreset[];
  issues: GodotExportIssue[];
}

export interface GodotExportMatrixTarget extends GodotExportPreset {
  platformFamily: 'desktop' | 'mobile' | 'web' | 'unknown';
  outputDirectory: string | null;
  signingConfigured: boolean;
  templatesConfigured: boolean;
  issues: GodotExportIssue[];
}

export interface GodotExportMatrix {
  targets: GodotExportMatrixTarget[];
  issues: GodotExportIssue[];
  recommendedCiSteps: string[];
}

type ExportConfigValue = string | number | boolean | null;
type SectionData = Record<string, string>;

export interface GodotExportPresetUpdate {
  presetName: string;
  fields?: Record<string, ExportConfigValue>;
  options?: Record<string, ExportConfigValue>;
}

export async function inspectExportPresets(projectPath: string): Promise<GodotExportInspection> {
  const exportConfigPath = join(projectPath, 'export_presets.cfg');
  if (!existsSync(exportConfigPath)) {
    return {
      hasExportPresets: false,
      presets: [],
      issues: [
        {
          severity: 'error',
          message: 'Missing export_presets.cfg',
        },
      ],
    };
  }

  const content = await readFile(exportConfigPath, 'utf8');
  const sections = parseIniLikeConfig(content);
  const presets = parsePresets(sections);
  const issues = await inspectPresets(projectPath, presets);

  return {
    hasExportPresets: true,
    presets,
    issues,
  };
}

export async function buildExportMatrix(projectPath: string): Promise<GodotExportMatrix> {
  const inspection = await inspectExportPresets(projectPath);
  const targets = inspection.presets.map((preset) => {
    const presetIssues = inspection.issues.filter((issue) => issue.preset === preset.name);
    return {
      ...preset,
      platformFamily: platformFamilyFor(preset.platform),
      outputDirectory: preset.exportPath ? dirname(preset.exportPath).replace(/\\/g, '/') : null,
      signingConfigured: hasSigningConfigured(preset),
      templatesConfigured: Boolean(preset.options['custom_template/debug'] || preset.options['custom_template/release']),
      issues: presetIssues,
    };
  });

  return {
    targets,
    issues: inspection.issues,
    recommendedCiSteps: [
      'npm run check:project -- <projectPath>',
      'godot --headless --path <projectPath> --check-only --script <script>',
      'godot --headless --path <projectPath> --export-debug <preset> <outputPath>',
    ],
  };
}

export async function ensureExportOutputDirectory(projectPath: string, outputPath: string): Promise<void> {
  const outputDirectory = dirname(join(projectPath, outputPath));
  await mkdir(outputDirectory, { recursive: true });
}

export async function updateExportPreset(
  projectPath: string,
  update: GodotExportPresetUpdate
): Promise<GodotExportInspection> {
  const exportConfigPath = join(projectPath, 'export_presets.cfg');
  if (!existsSync(exportConfigPath)) {
    throw new Error('Missing export_presets.cfg');
  }

  const content = await readFile(exportConfigPath, 'utf8');
  let lines = content.split(/\r?\n/);
  const sections = parseSectionRanges(lines);
  const presetSection = sections.find((section) => {
    return /^preset\.\d+$/.test(section.name) && section.values.name === update.presetName;
  });

  if (!presetSection) {
    throw new Error(`Export preset not found: ${update.presetName}`);
  }

  if (update.fields && Object.keys(update.fields).length > 0) {
    lines = applySectionChanges(lines, presetSection.name, update.fields);
  }

  if (update.options && Object.keys(update.options).length > 0) {
    const optionsSectionName = `${presetSection.name}.options`;
    const currentSections = parseSectionRanges(lines);
    const hasOptionsSection = currentSections.some((section) => section.name === optionsSectionName);

    if (hasOptionsSection) {
      lines = applySectionChanges(lines, optionsSectionName, update.options);
    } else {
      lines = insertSectionAfter(lines, presetSection.name, optionsSectionName, update.options);
    }
  }

  await writeFile(exportConfigPath, lines.join('\n'), 'utf8');
  return inspectExportPresets(projectPath);
}

function parseIniLikeConfig(content: string): Record<string, SectionData> {
  const sections: Record<string, SectionData> = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = sections[currentSection] ?? {};
      continue;
    }

    if (!currentSection) continue;

    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;

    const key = line.slice(0, assignmentIndex).trim();
    const value = normalizeConfigValue(line.slice(assignmentIndex + 1).trim());
    sections[currentSection][key] = value;
  }

  return sections;
}

function parsePresets(sections: Record<string, SectionData>): GodotExportPreset[] {
  const presets: GodotExportPreset[] = [];

  for (const [sectionName, section] of Object.entries(sections)) {
    const presetMatch = sectionName.match(/^preset\.(\d+)$/);
    if (!presetMatch) continue;

    const index = Number(presetMatch[1]);
    const options = sections[`preset.${index}.options`] ?? {};
    presets.push({
      index,
      name: section.name ?? `Preset ${index}`,
      platform: section.platform ?? '',
      runnable: section.runnable === 'true',
      exportPath: section.export_path ?? null,
      options,
    });
  }

  return presets.sort((left, right) => left.index - right.index);
}

async function inspectPresets(projectPath: string, presets: GodotExportPreset[]): Promise<GodotExportIssue[]> {
  const issues: GodotExportIssue[] = [];

  if (presets.length === 0) {
    issues.push({
      severity: 'error',
      message: 'No export presets are defined',
    });
  }

  for (const preset of presets) {
    if (!preset.exportPath) {
      issues.push({
        severity: 'warning',
        preset: preset.name,
        message: 'Preset does not define export_path',
      });
      continue;
    }

    const outputDirectory = dirname(join(projectPath, preset.exportPath));
    if (!(await directoryExists(outputDirectory))) {
      issues.push({
        severity: 'warning',
        preset: preset.name,
        message: `Export output directory does not exist: ${dirname(preset.exportPath).replace(/\\/g, '/')}`,
      });
    }

    const iconPath = preset.options['application/icon'];
    if (iconPath && !(await projectPathExists(projectPath, iconPath))) {
      issues.push({
        severity: 'warning',
        preset: preset.name,
        message: `Preset icon does not exist: ${iconPath}`,
      });
    }

    for (const templateKey of ['custom_template/debug', 'custom_template/release']) {
      const templatePath = preset.options[templateKey];
      if (templatePath && !(await projectPathExists(projectPath, templatePath))) {
        issues.push({
          severity: 'warning',
          preset: preset.name,
          message: `Custom export template does not exist: ${templatePath}`,
        });
      }
    }

    if (/android/i.test(preset.platform) && !preset.options['package/unique_name']) {
      issues.push({
        severity: 'warning',
        preset: preset.name,
        message: 'Android package/unique_name is not configured',
      });
    }

    if (preset.options['codesign/enable'] === 'true') {
      const hasSigningIdentity =
        Boolean(preset.options['codesign/identity']) ||
        Boolean(preset.options['codesign/certificate_file']) ||
        Boolean(preset.options['codesign/apple_team_id']);
      if (!hasSigningIdentity) {
        issues.push({
          severity: 'warning',
          preset: preset.name,
          message: 'Code signing is enabled but no signing identity or certificate is configured',
        });
      }
    }
  }

  return issues;
}

function platformFamilyFor(platform: string): GodotExportMatrixTarget['platformFamily'] {
  if (/windows|linux|macos|mac os|desktop/i.test(platform)) return 'desktop';
  if (/android|ios/i.test(platform)) return 'mobile';
  if (/web|html5/i.test(platform)) return 'web';
  return 'unknown';
}

function hasSigningConfigured(preset: GodotExportPreset): boolean {
  return Boolean(
    preset.options['codesign/identity'] ||
      preset.options['codesign/certificate_file'] ||
      preset.options['codesign/apple_team_id'] ||
      preset.options['keystore/debug'] ||
      preset.options['keystore/release']
  );
}

interface SectionRange {
  name: string;
  startLine: number;
  endLine: number;
  values: SectionData;
}

function parseSectionRanges(lines: string[]): SectionRange[] {
  const sections: SectionRange[] = [];
  let currentSection: SectionRange | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
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

    if (!currentSection || !line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;

    const key = line.slice(0, assignmentIndex).trim();
    currentSection.values[key] = normalizeConfigValue(line.slice(assignmentIndex + 1).trim());
  }

  return sections;
}

function applySectionChanges(
  lines: string[],
  sectionName: string,
  changes: Record<string, ExportConfigValue>
): string[] {
  const nextLines = [...lines];
  const section = parseSectionRanges(nextLines).find((candidate) => candidate.name === sectionName);
  if (!section) {
    throw new Error(`Export preset section not found: ${sectionName}`);
  }

  let insertionIndex = section.endLine;
  while (insertionIndex > section.startLine + 1 && nextLines[insertionIndex - 1].trim() === '') {
    insertionIndex--;
  }

  for (const [key, value] of Object.entries(changes)) {
    const updatedLine = `${key}=${formatConfigValue(value)}`;
    const existingLineIndex = findSectionKeyLine(nextLines, section, key);
    if (existingLineIndex === -1) {
      nextLines.splice(insertionIndex, 0, updatedLine);
      insertionIndex++;
    } else {
      nextLines[existingLineIndex] = updatedLine;
    }
  }

  return nextLines;
}

function insertSectionAfter(
  lines: string[],
  afterSectionName: string,
  sectionName: string,
  changes: Record<string, ExportConfigValue>
): string[] {
  const nextLines = [...lines];
  const afterSection = parseSectionRanges(nextLines).find((candidate) => candidate.name === afterSectionName);
  if (!afterSection) {
    throw new Error(`Export preset section not found: ${afterSectionName}`);
  }

  const sectionLines = [
    '',
    `[${sectionName}]`,
    ...Object.entries(changes).map(([key, value]) => `${key}=${formatConfigValue(value)}`),
  ];
  nextLines.splice(afterSection.endLine, 0, ...sectionLines);
  return nextLines;
}

function findSectionKeyLine(lines: string[], section: SectionRange, key: string): number {
  for (let lineIndex = section.startLine + 1; lineIndex < section.endLine; lineIndex++) {
    const line = lines[lineIndex].trim();
    const assignmentIndex = line.indexOf('=');
    if (assignmentIndex === -1) continue;

    if (line.slice(0, assignmentIndex).trim() === key) {
      return lineIndex;
    }
  }

  return -1;
}

async function projectPathExists(projectPath: string, candidatePath: string): Promise<boolean> {
  const resolvedPath = resolveProjectPath(projectPath, candidatePath);
  if (!resolvedPath) return true;
  return directoryOrFileExists(resolvedPath);
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const result = await stat(path);
    return result.isDirectory();
  } catch {
    return false;
  }
}

async function directoryOrFileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectPath(projectPath: string, candidatePath: string): string | null {
  if (candidatePath.startsWith('user://')) {
    return null;
  }

  if (candidatePath.startsWith('res://')) {
    return join(projectPath, candidatePath.slice('res://'.length));
  }

  if (isAbsolute(candidatePath)) {
    return candidatePath;
  }

  return join(projectPath, candidatePath);
}

function formatConfigValue(value: ExportConfigValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value === null) return '""';

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function normalizeConfigValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}
