import { existsSync, statSync, type Stats } from 'fs';
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
  code: string;
  preset?: string;
  message: string;
  cause: string;
  suggestion: string;
}

export interface GodotExportInspection {
  hasExportPresets: boolean;
  presets: GodotExportPreset[];
  issues: GodotExportIssue[];
  metadata: GodotExportProjectMetadata;
}

export interface GodotExportMatrixTarget extends GodotExportPreset {
  platformFamily: 'desktop' | 'mobile' | 'web' | 'unknown';
  outputDirectory: string | null;
  signingConfigured: boolean;
  templatesConfigured: boolean;
  templateChecks: GodotExportTemplateCheck[];
  signingDetails: GodotExportSigningDetail[];
  artifact: GodotExportArtifact | null;
  issues: GodotExportIssue[];
}

export interface GodotExportMatrix {
  targets: GodotExportMatrixTarget[];
  issues: GodotExportIssue[];
  recommendedCiSteps: string[];
  generatedCiSnippets: GodotCiSnippets;
}

export interface GodotExportProjectMetadata {
  projectName: string | null;
  projectVersion: string | null;
  projectIcon: string | null;
}

export interface GodotExportTemplateCheck {
  key: string;
  configured: boolean;
  path: string | null;
  exists: boolean | null;
  guidance: string;
}

export interface GodotExportSigningDetail {
  requirement: string;
  configured: boolean;
  optionKeys: string[];
  guidance: string;
}

export interface GodotExportArtifact {
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
  expectedExtension: string | null;
}

export interface GodotCiSnippetOptions {
  provider?: 'github_actions' | 'gitlab_ci' | 'all';
  includeExport?: boolean;
  includeArtifactUpload?: boolean;
  presetName?: string;
  outputPath?: string;
}

export interface GodotCiSnippets {
  githubActions: string;
  gitlabCi: string;
  commands: string[];
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
  const metadata = await readProjectMetadata(projectPath);
  if (!existsSync(exportConfigPath)) {
    return {
      hasExportPresets: false,
      presets: [],
      issues: [
        createIssue(
          'error',
          'missing_export_presets',
          'Missing export_presets.cfg',
          'The project has no export preset configuration file.',
          'Create export presets in Godot with Project > Export before running release checks.'
        ),
      ],
      metadata,
    };
  }

  const content = await readFile(exportConfigPath, 'utf8');
  const sections = parseIniLikeConfig(content);
  const presets = parsePresets(sections);
  const issues = await inspectPresets(projectPath, presets, metadata);

  return {
    hasExportPresets: true,
    presets,
    issues,
    metadata,
  };
}

export async function buildExportMatrix(projectPath: string): Promise<GodotExportMatrix> {
  const inspection = await inspectExportPresets(projectPath);
  const targets = inspection.presets.map((preset) => {
    const presetIssues = inspection.issues.filter((issue) => issue.preset === preset.name);
    const templateChecks = inspectTemplateChecks(projectPath, preset);
    const signingDetails = inspectSigningDetails(preset);
    return {
      ...preset,
      platformFamily: platformFamilyFor(preset.platform),
      outputDirectory: preset.exportPath ? dirname(preset.exportPath).replace(/\\/g, '/') : null,
      signingConfigured: signingDetails.some((detail) => detail.configured),
      templatesConfigured: templateChecks.some((check) => check.configured),
      templateChecks,
      signingDetails,
      artifact: preset.exportPath ? inspectArtifact(projectPath, preset) : null,
      issues: presetIssues,
    };
  });

  return {
    targets,
    issues: inspection.issues,
    recommendedCiSteps: [
      'npm run check:project -- <projectPath>',
      'godot --headless --path <projectPath> --check-only',
      'godot --headless --path <projectPath> --export-release <preset> <outputPath>',
      'Upload export artifacts from <outputDirectory>',
    ],
    generatedCiSnippets: generateCiSnippets(projectPath, {
      includeExport: true,
      includeArtifactUpload: true,
      presetName: targets[0]?.name,
      outputPath: targets[0]?.exportPath ?? undefined,
    }),
  };
}

export function generateCiSnippets(
  projectPath: string,
  options: GodotCiSnippetOptions = {}
): GodotCiSnippets {
  const includeExport = options.includeExport !== false;
  const includeArtifactUpload = options.includeArtifactUpload !== false;
  const presetName = options.presetName ?? '<preset>';
  const outputPath = options.outputPath ?? 'builds/release/game.zip';
  const normalizedProjectPath = projectPath.replace(/\\/g, '/');
  const artifactDirectory = dirname(outputPath).replace(/\\/g, '/');
  const commands = [
    'npm ci',
    `npm run check:project -- "${normalizedProjectPath}"`,
    `godot --headless --path "${normalizedProjectPath}" --check-only`,
  ];

  if (includeExport) {
    commands.push(`godot --headless --path "${normalizedProjectPath}" --export-release "${presetName}" "${outputPath}"`);
  }

  const githubActions = [
    'name: Godot Export Preflight',
    '',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main]',
    '',
    'jobs:',
    '  export-preflight:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    '      - name: Install dependencies',
    '        run: npm ci',
    '      - name: Run godot-devtool checks',
    `        run: npm run check:project -- "${normalizedProjectPath}"`,
    '      - name: Run Godot syntax check',
    `        run: godot --headless --path "${normalizedProjectPath}" --check-only`,
    ...(includeExport
      ? [
          '      - name: Export release build',
          `        run: godot --headless --path "${normalizedProjectPath}" --export-release "${presetName}" "${outputPath}"`,
        ]
      : []),
    ...(includeArtifactUpload
      ? [
          '      - uses: actions/upload-artifact@v4',
          '        with:',
          '          name: godot-export',
          `          path: ${artifactDirectory}`,
        ]
      : []),
  ].join('\n');

  const gitlabCi = [
    'stages: [check, export]',
    '',
    'godot_preflight:',
    '  stage: check',
    '  script:',
    '    - npm ci',
    `    - npm run check:project -- "${normalizedProjectPath}"`,
    `    - godot --headless --path "${normalizedProjectPath}" --check-only`,
    ...(includeExport
      ? [
          '',
          'godot_export:',
          '  stage: export',
          '  script:',
          `    - godot --headless --path "${normalizedProjectPath}" --export-release "${presetName}" "${outputPath}"`,
          ...(includeArtifactUpload
            ? [
                '  artifacts:',
                `    paths: [${artifactDirectory}]`,
              ]
            : []),
        ]
      : []),
  ].join('\n');

  return {
    githubActions,
    gitlabCi,
    commands,
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

async function inspectPresets(
  projectPath: string,
  presets: GodotExportPreset[],
  metadata: GodotExportProjectMetadata
): Promise<GodotExportIssue[]> {
  const issues: GodotExportIssue[] = [];

  if (presets.length === 0) {
    issues.push(createIssue(
      'error',
      'no_export_presets',
      'No export presets are defined',
      'export_presets.cfg exists but does not define any preset.N sections.',
      'Add at least one export preset in Godot before preparing a release.'
    ));
  }

  for (const preset of presets) {
    if (!preset.exportPath) {
      issues.push(createIssue(
        'warning',
        'missing_export_path',
        'Preset does not define export_path',
        'The preset cannot produce a stable release artifact path.',
        'Set export_path for this preset, for example builds/windows/game.exe.',
        preset.name
      ));
      continue;
    }

    const outputDirectory = dirname(join(projectPath, preset.exportPath));
    if (!(await directoryExists(outputDirectory))) {
      issues.push(createIssue(
        'warning',
        'missing_output_directory',
        `Export output directory does not exist: ${dirname(preset.exportPath).replace(/\\/g, '/')}`,
        'The configured export_path points to a directory that is not present yet.',
        'Create the output directory before export or call export_project with createOutputDirectory=true.',
        preset.name
      ));
    }

    const iconPath = preset.options['application/icon'];
    const effectiveIconPath = iconPath || metadata.projectIcon;
    if (!effectiveIconPath) {
      issues.push(createIssue(
        'warning',
        'missing_icon',
        'No application icon is configured',
        'Neither the export preset nor project settings define an application icon.',
        'Set application/icon in the export preset or application/config/icon in project.godot.',
        preset.name
      ));
    } else if (!(await projectPathExists(projectPath, effectiveIconPath))) {
      issues.push(createIssue(
        'warning',
        'missing_icon',
        `Preset icon does not exist: ${effectiveIconPath}`,
        'The configured icon path does not resolve to an existing project file.',
        'Create the icon asset or update application/icon to a valid res:// path.',
        preset.name
      ));
    }

    const templateKeys = ['custom_template/debug', 'custom_template/release'];
    if (!templateKeys.some((templateKey) => preset.options[templateKey])) {
      issues.push(createIssue(
        'warning',
        'missing_export_template',
        'No custom export templates are configured',
        'Godot can use globally installed export templates, but the project does not pin custom template files.',
        'Install matching Godot export templates globally or configure custom_template/debug and custom_template/release.',
        preset.name
      ));
    }
    for (const templateKey of templateKeys) {
      const templatePath = preset.options[templateKey];
      if (templatePath && !(await projectPathExists(projectPath, templatePath))) {
        issues.push(createIssue(
          'warning',
          'missing_export_template',
          `Custom export template does not exist: ${templatePath}`,
          `The ${templateKey} option points to a missing template file.`,
          'Install the matching template or update the custom_template path.',
          preset.name
        ));
      }
    }

    if (/android/i.test(preset.platform) && !preset.options['package/unique_name']) {
      issues.push(createIssue(
        'warning',
        'missing_android_package_id',
        'Android package/unique_name is not configured',
        'Android exports need a stable package identifier for release builds.',
        'Set package/unique_name to a reverse-DNS identifier such as com.example.game.',
        preset.name
      ));
    }

    for (const signingDetail of inspectSigningDetails(preset)) {
      if (!signingDetail.configured) {
        issues.push(createIssue(
          'warning',
          'missing_signing_detail',
          `${signingDetail.requirement} is not configured`,
          `The ${preset.platform} preset is missing signing metadata used by release builds.`,
          signingDetail.guidance,
          preset.name
        ));
      }
    }

    const resolvedArtifactPath = resolveProjectPath(projectPath, preset.exportPath);
    if (resolvedArtifactPath && (await directoryOrFileExists(resolvedArtifactPath)) === false) {
      issues.push(createIssue(
        'warning',
        'missing_export_artifact',
        `Export artifact does not exist yet: ${preset.exportPath}`,
        'No file currently exists at the configured export_path.',
        'Run export_project or your CI export job, then archive the produced artifact.',
        preset.name
      ));
    }
  }

  return issues;
}

async function readProjectMetadata(projectPath: string): Promise<GodotExportProjectMetadata> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    return {
      projectName: null,
      projectVersion: null,
      projectIcon: null,
    };
  }

  const sections = parseIniLikeConfig(await readFile(projectFilePath, 'utf8'));
  const application = sections.application ?? {};
  return {
    projectName: application['config/name'] ?? null,
    projectVersion: application['config/version'] ?? application['application/version'] ?? null,
    projectIcon: application['config/icon'] ?? null,
  };
}

function createIssue(
  severity: GodotExportIssue['severity'],
  code: string,
  message: string,
  cause: string,
  suggestion: string,
  preset?: string
): GodotExportIssue {
  return {
    severity,
    code,
    preset,
    message,
    cause,
    suggestion,
  };
}

function inspectTemplateChecks(projectPath: string, preset: GodotExportPreset): GodotExportTemplateCheck[] {
  const checks = ['custom_template/debug', 'custom_template/release'].map((key) => {
    const templatePath = preset.options[key] ?? null;
    const resolvedPath = templatePath ? resolveProjectPath(projectPath, templatePath) : null;
    return {
      key,
      configured: Boolean(templatePath),
      path: templatePath,
      exists: resolvedPath ? existsSync(resolvedPath) : null,
      guidance: templatePath
        ? 'Keep custom templates aligned with the Godot editor version used by CI.'
        : 'Install matching Godot export templates globally or pin a custom template path for reproducible release exports.',
    };
  });

  return checks;
}

function inspectSigningDetails(preset: GodotExportPreset): GodotExportSigningDetail[] {
  if (/android/i.test(preset.platform)) {
    return [
      {
        requirement: 'Android release keystore',
        configured: Boolean(preset.options['keystore/release'] || preset.options['keystore/debug']),
        optionKeys: ['keystore/release', 'keystore/debug'],
        guidance: 'Configure keystore/release and related password values for signed Android release builds.',
      },
      {
        requirement: 'Android package identifier',
        configured: Boolean(preset.options['package/unique_name']),
        optionKeys: ['package/unique_name'],
        guidance: 'Set package/unique_name to a stable reverse-DNS package identifier.',
      },
    ];
  }

  if (/ios/i.test(preset.platform)) {
    return [
      {
        requirement: 'iOS bundle identifier',
        configured: Boolean(preset.options['application/bundle_identifier']),
        optionKeys: ['application/bundle_identifier'],
        guidance: 'Set application/bundle_identifier before release signing.',
      },
      {
        requirement: 'iOS provisioning profile or team ID',
        configured: Boolean(preset.options['application/provisioning_profile_uuid'] || preset.options['codesign/apple_team_id']),
        optionKeys: ['application/provisioning_profile_uuid', 'codesign/apple_team_id'],
        guidance: 'Configure a provisioning profile UUID or Apple team ID for iOS release builds.',
      },
    ];
  }

  if (/macos|mac os/i.test(preset.platform)) {
    return [
      {
        requirement: 'macOS signing identity or Apple team ID',
        configured: Boolean(preset.options['codesign/identity'] || preset.options['codesign/apple_team_id']),
        optionKeys: ['codesign/identity', 'codesign/apple_team_id'],
        guidance: 'Configure codesign/identity or codesign/apple_team_id for notarized macOS releases.',
      },
    ];
  }

  if (/windows/i.test(preset.platform)) {
    return [
      {
        requirement: 'Windows code signing certificate',
        configured: Boolean(preset.options['codesign/certificate_file'] || preset.options['codesign/identity']),
        optionKeys: ['codesign/certificate_file', 'codesign/identity'],
        guidance: 'Configure a certificate file or signing identity when distributing signed Windows builds.',
      },
    ];
  }

  return [
    {
      requirement: 'Platform signing metadata',
      configured: hasSigningConfigured(preset),
      optionKeys: ['codesign/identity', 'codesign/certificate_file', 'codesign/apple_team_id'],
      guidance: 'Review platform-specific signing requirements before publishing release builds.',
    },
  ];
}

function inspectArtifact(projectPath: string, preset: GodotExportPreset): GodotExportArtifact | null {
  if (!preset.exportPath) return null;

  const resolvedPath = resolveProjectPath(projectPath, preset.exportPath);
  if (!resolvedPath) {
    return {
      path: preset.exportPath,
      exists: false,
      sizeBytes: null,
      modifiedAt: null,
      expectedExtension: expectedArtifactExtension(preset.platform),
    };
  }

  try {
    const artifactStat = statSyncSafe(resolvedPath);
    return {
      path: preset.exportPath,
      exists: Boolean(artifactStat),
      sizeBytes: artifactStat?.size ?? null,
      modifiedAt: artifactStat?.mtime.toISOString() ?? null,
      expectedExtension: expectedArtifactExtension(preset.platform),
    };
  } catch {
    return {
      path: preset.exportPath,
      exists: false,
      sizeBytes: null,
      modifiedAt: null,
      expectedExtension: expectedArtifactExtension(preset.platform),
    };
  }
}

function statSyncSafe(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function expectedArtifactExtension(platform: string): string | null {
  if (/windows/i.test(platform)) return '.exe';
  if (/linux/i.test(platform)) return '.x86_64';
  if (/macos|mac os/i.test(platform)) return '.zip';
  if (/android/i.test(platform)) return '.apk';
  if (/ios/i.test(platform)) return '.zip';
  if (/web|html5/i.test(platform)) return '.zip';
  return null;
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
