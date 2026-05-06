import { existsSync } from 'fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';

import { isSafeProjectRelativePath } from './pathValidation.js';

const SAFETY_POLICY_PATH = '.godot-devtool/safety.json';
const AUDIT_LOG_PATH = '.godot-devtool/audit.jsonl';

export type SafetyRiskLevel = 'low' | 'write' | 'dangerous';
export type SafetyDecision = 'allowed' | 'blocked' | 'not_configured' | 'policy_disabled';
export type DiffAction = 'create' | 'modify' | 'delete' | 'missing' | 'unknown';

export interface SafetyPolicy {
  enabled: boolean;
  writeAllowlist: string[];
  blockedPaths: string[];
}

export interface SafetyPolicyReadResult {
  path: string;
  usingDefaultPolicy: boolean;
  policy: SafetyPolicy;
  parseError?: string;
}

export interface WriteSafetyRequest {
  operation: string;
  paths: string[];
  riskLevel?: SafetyRiskLevel;
}

export interface WriteSafetyResult {
  allowed: boolean;
  decision: SafetyDecision;
  policyPath: string;
  riskLevel: SafetyRiskLevel;
  operation: string;
  paths: Array<{
    path: string;
    allowed: boolean;
    decision: SafetyDecision;
    matchedRule: string | null;
    reason: string;
  }>;
  suggestions: string[];
}

export interface DiffChangeRequest {
  path: string;
  content?: string;
  delete?: boolean;
  recursive?: boolean;
  overwrite?: boolean;
}

export interface DiffSummaryRequest {
  operation: string;
  riskLevel?: SafetyRiskLevel;
  changes: DiffChangeRequest[];
}

export interface DiffSummary {
  operation: string;
  riskLevel: SafetyRiskLevel;
  files: Array<{
    path: string;
    action: DiffAction;
    exists: boolean;
    byteDelta: number | null;
    lineDelta: number | null;
    recursive: boolean;
    overwrite: boolean;
  }>;
  totals: {
    creates: number;
    modifies: number;
    deletes: number;
    missing: number;
    unknown: number;
    files: number;
  };
  policy: WriteSafetyResult;
}

export interface AuditReplayOptions {
  limit?: number;
}

export interface AuditReplaySummary {
  path: string;
  totalEntries: number;
  timeRange: { start: string | null; end: string | null };
  operationCounts: Record<string, number>;
  changedFileCounts: Record<string, number>;
  steps: Array<{
    index: number;
    timestamp: string;
    operation: string;
    changedFiles: string[];
    skippedFiles: string[];
    details?: Record<string, unknown>;
  }>;
  riskHighlights: Array<{
    timestamp: string;
    operation: string;
    changedFiles: string[];
    reason: string;
  }>;
  parseErrors: Array<{ line: number; error: string }>;
}

export interface RollbackSuggestionRequest {
  operation: string;
  changedFiles?: string[];
  skippedFiles?: string[];
  details?: Record<string, unknown>;
}

export interface RollbackSuggestionResult {
  supported: boolean;
  operation: string;
  changedFiles: string[];
  suggestions: string[];
}

export async function readSafetyPolicy(projectPath: string): Promise<SafetyPolicyReadResult> {
  const policyPath = join(projectPath, SAFETY_POLICY_PATH);
  if (!existsSync(policyPath)) {
    return {
      path: SAFETY_POLICY_PATH,
      usingDefaultPolicy: true,
      policy: defaultPolicy(),
    };
  }

  try {
    return {
      path: SAFETY_POLICY_PATH,
      usingDefaultPolicy: false,
      policy: normalizePolicy(JSON.parse(await readFile(policyPath, 'utf8'))),
    };
  } catch (error: any) {
    return {
      path: SAFETY_POLICY_PATH,
      usingDefaultPolicy: false,
      policy: defaultPolicy(),
      parseError: error?.message || 'Unable to parse safety policy',
    };
  }
}

export async function writeSafetyPolicy(projectPath: string, policy: Partial<SafetyPolicy>): Promise<SafetyPolicyReadResult> {
  const normalized = normalizePolicy(policy);
  const policyPath = join(projectPath, SAFETY_POLICY_PATH);
  await mkdir(dirname(policyPath), { recursive: true });
  await writeFile(policyPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await appendSafetyAudit(projectPath, {
    operation: 'set_safety_policy',
    changedFiles: [SAFETY_POLICY_PATH],
    skippedFiles: [],
    details: {
      enabled: normalized.enabled,
      writeAllowlist: normalized.writeAllowlist,
      blockedPaths: normalized.blockedPaths,
    },
  });

  return readSafetyPolicy(projectPath);
}

export async function evaluateWriteSafety(
  projectPath: string,
  request: WriteSafetyRequest
): Promise<WriteSafetyResult> {
  const riskLevel = request.riskLevel ?? 'write';
  const policyResult = await readSafetyPolicy(projectPath);
  if (policyResult.parseError) {
    return buildSafetyResult(request, riskLevel, 'blocked', request.paths.map((path) => ({
      path: normalizeProjectPath(path),
      allowed: false,
      decision: 'blocked',
      matchedRule: SAFETY_POLICY_PATH,
      reason: `Safety policy is malformed: ${policyResult.parseError}`,
    })), ['Fix .godot-devtool/safety.json or disable the policy with set_safety_policy.']);
  }

  if (policyResult.usingDefaultPolicy) {
    return buildSafetyResult(request, riskLevel, 'not_configured', request.paths.map((path) => ({
      path: normalizeProjectPath(path),
      allowed: true,
      decision: 'not_configured',
      matchedRule: null,
      reason: 'No safety policy is configured; write is allowed for backward compatibility.',
    })), ['Use set_safety_policy to configure project write allowlists.']);
  }

  if (!policyResult.policy.enabled) {
    return buildSafetyResult(request, riskLevel, 'policy_disabled', request.paths.map((path) => ({
      path: normalizeProjectPath(path),
      allowed: true,
      decision: 'policy_disabled',
      matchedRule: null,
      reason: 'Safety policy exists but is disabled.',
    })), ['Set enabled=true in .godot-devtool/safety.json to enforce write allowlists.']);
  }

  const decisions = request.paths.map((path) => decidePath(policyResult.policy, normalizeProjectPath(path)));
  return buildSafetyResult(
    request,
    riskLevel,
    decisions.every((decision) => decision.allowed) ? 'allowed' : 'blocked',
    decisions,
    decisions.every((decision) => decision.allowed)
      ? ['Write matches the configured safety policy.']
      : [
          'Use preview_write_safety to inspect the blocked paths.',
          'Update .godot-devtool/safety.json with set_safety_policy if this write is intentional.',
        ]
  );
}

export async function assertWriteAllowed(projectPath: string, request: WriteSafetyRequest): Promise<WriteSafetyResult> {
  const safety = await evaluateWriteSafety(projectPath, request);
  if (!safety.allowed) {
    const blocked = safety.paths.filter((path) => !path.allowed);
    throw new Error(
      `Write blocked by safety policy: ${blocked.map((path) => `${path.path} (${path.reason})`).join(', ')}`
    );
  }

  return safety;
}

export async function buildDiffSummary(
  projectPath: string,
  request: DiffSummaryRequest
): Promise<DiffSummary> {
  const files = await Promise.all(request.changes.map((change) => summarizeChange(projectPath, change)));
  const totals = {
    creates: files.filter((file) => file.action === 'create').length,
    modifies: files.filter((file) => file.action === 'modify').length,
    deletes: files.filter((file) => file.action === 'delete').length,
    missing: files.filter((file) => file.action === 'missing').length,
    unknown: files.filter((file) => file.action === 'unknown').length,
    files: files.length,
  };
  const policy = await evaluateWriteSafety(projectPath, {
    operation: request.operation,
    riskLevel: request.riskLevel,
    paths: request.changes.map((change) => change.path),
  });

  return {
    operation: request.operation,
    riskLevel: request.riskLevel ?? 'write',
    files,
    totals,
    policy,
  };
}

export async function buildAuditReplay(
  projectPath: string,
  options: AuditReplayOptions = {}
): Promise<AuditReplaySummary> {
  const auditPath = join(projectPath, AUDIT_LOG_PATH);
  if (!existsSync(auditPath)) {
    return emptyReplay();
  }

  const parseErrors: AuditReplaySummary['parseErrors'] = [];
  const entries: AuditReplaySummary['steps'] = [];
  const lines = (await readFile(auditPath, 'utf8')).split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);
      entries.push({
        index: lineIndex + 1,
        timestamp: String(parsed.timestamp ?? ''),
        operation: String(parsed.operation ?? 'unknown'),
        changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles.map(String) : [],
        skippedFiles: Array.isArray(parsed.skippedFiles) ? parsed.skippedFiles.map(String) : [],
        details: isRecord(parsed.details) ? parsed.details : undefined,
      });
    } catch (error: any) {
      parseErrors.push({ line: lineIndex + 1, error: error?.message || 'Invalid JSON audit line' });
    }
  }

  const limited = Number.isInteger(options.limit) && options.limit! > 0 ? entries.slice(-options.limit!) : entries;
  const operationCounts: Record<string, number> = {};
  const changedFileCounts: Record<string, number> = {};
  const riskHighlights: AuditReplaySummary['riskHighlights'] = [];

  for (const entry of limited) {
    operationCounts[entry.operation] = (operationCounts[entry.operation] ?? 0) + 1;
    for (const changedFile of entry.changedFiles) {
      changedFileCounts[changedFile] = (changedFileCounts[changedFile] ?? 0) + 1;
    }
    if (entry.operation.includes('delete') || entry.operation.includes('uid') || entry.operation.includes('setting')) {
      riskHighlights.push({
        timestamp: entry.timestamp,
        operation: entry.operation,
        changedFiles: entry.changedFiles,
        reason: riskReason(entry.operation),
      });
    }
  }

  return {
    path: AUDIT_LOG_PATH,
    totalEntries: limited.length,
    timeRange: {
      start: limited[0]?.timestamp ?? null,
      end: limited.at(-1)?.timestamp ?? null,
    },
    operationCounts,
    changedFileCounts,
    steps: limited,
    riskHighlights,
    parseErrors,
  };
}

export async function suggestRollback(
  _projectPath: string,
  request: RollbackSuggestionRequest
): Promise<RollbackSuggestionResult> {
  const changedFiles = request.changedFiles ?? [];
  const suggestions: string[] = [];
  let supported = false;

  if (request.operation.includes('delete')) {
    suggestions.push('Automatic restore is unavailable for deleted files; restore from VCS, editor history, or external backups.');
    suggestions.push(`Before deleting related paths again, run filesystem_preview_delete for: ${changedFiles.join(', ')}`);
  } else if (request.operation.includes('create')) {
    supported = changedFiles.length > 0;
    suggestions.push(`Created files can usually be rolled back by previewing and deleting: ${changedFiles.join(', ')}`);
  } else if (request.operation.includes('setting')) {
    suggestions.push('Restore project.godot settings from the preview values in the audit details when present.');
    suggestions.push('Use VCS history when audit details do not include the previous values.');
  } else if (request.operation.includes('bridge') || request.operation.includes('workflow')) {
    suggestions.push('Regenerate workflow or bridge files with the original options, or revert the changed files with VCS.');
  } else if (request.details?.overwrite === true || request.operation.includes('write') || request.operation.includes('save')) {
    suggestions.push('Overwritten file content is not snapshotted by 1.6.0; inspect VCS diff/history before changing it again.');
    suggestions.push(`Review affected paths: ${changedFiles.join(', ')}`);
  } else {
    suggestions.push('Review the audit replay and use VCS or editor history for rollback.');
  }

  return {
    supported,
    operation: request.operation,
    changedFiles,
    suggestions,
  };
}

export function normalizeProjectPath(path: string): string {
  if (path === '.' || path === './') {
    return '.';
  }

  const normalized = path.replace(/^res:\/\//, '').replace(/\\/g, '/');
  if (!isSafeProjectRelativePath(normalized)) {
    throw new Error('Path must be project-relative and must not contain traversal or absolute path prefixes');
  }

  return normalized;
}

async function summarizeChange(projectPath: string, change: DiffChangeRequest): Promise<DiffSummary['files'][number]> {
  const safePath = normalizeProjectPath(change.path);
  const absolutePath = resolveProjectPath(projectPath, safePath);
  const exists = existsSync(absolutePath);

  if (change.delete === true) {
    return {
      path: safePath,
      action: exists ? 'delete' : 'missing',
      exists,
      byteDelta: exists ? -((await stat(absolutePath)).size) : 0,
      lineDelta: exists && (await stat(absolutePath)).isFile() ? -countLines(await readFile(absolutePath, 'utf8')) : null,
      recursive: change.recursive === true,
      overwrite: false,
    };
  }

  if (typeof change.content !== 'string') {
    return {
      path: safePath,
      action: exists ? 'unknown' : 'create',
      exists,
      byteDelta: null,
      lineDelta: null,
      recursive: false,
      overwrite: change.overwrite === true,
    };
  }

  if (!exists) {
    return {
      path: safePath,
      action: 'create',
      exists,
      byteDelta: Buffer.byteLength(change.content, 'utf8'),
      lineDelta: countLines(change.content),
      recursive: false,
      overwrite: change.overwrite === true,
    };
  }

  const before = await readFile(absolutePath, 'utf8');
  return {
    path: safePath,
    action: 'modify',
    exists,
    byteDelta: Buffer.byteLength(change.content, 'utf8') - Buffer.byteLength(before, 'utf8'),
    lineDelta: countLines(change.content) - countLines(before),
    recursive: false,
    overwrite: change.overwrite === true,
  };
}

function decidePath(policy: SafetyPolicy, path: string): WriteSafetyResult['paths'][number] {
  const blockedRule = policy.blockedPaths.find((rule) => matchesRule(rule, path));
  if (blockedRule) {
    return {
      path,
      allowed: false,
      decision: 'blocked',
      matchedRule: blockedRule,
      reason: `Path matches blockedPaths rule: ${blockedRule}`,
    };
  }

  const allowedRule = policy.writeAllowlist.find((rule) => matchesRule(rule, path));
  if (allowedRule) {
    return {
      path,
      allowed: true,
      decision: 'allowed',
      matchedRule: allowedRule,
      reason: `Path matches writeAllowlist rule: ${allowedRule}`,
    };
  }

  return {
    path,
    allowed: false,
    decision: 'blocked',
    matchedRule: null,
    reason: 'Path does not match any writeAllowlist rule',
  };
}

function matchesRule(rule: string, path: string): boolean {
  const normalizedRule = normalizeProjectPath(rule);
  const escaped = normalizedRule
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(path);
}

function buildSafetyResult(
  request: WriteSafetyRequest,
  riskLevel: SafetyRiskLevel,
  decision: SafetyDecision,
  paths: WriteSafetyResult['paths'],
  suggestions: string[]
): WriteSafetyResult {
  return {
    allowed: paths.every((path) => path.allowed),
    decision,
    policyPath: SAFETY_POLICY_PATH,
    riskLevel,
    operation: request.operation,
    paths,
    suggestions,
  };
}

function normalizePolicy(policy: any): SafetyPolicy {
  if (!isRecord(policy)) {
    throw new Error('Safety policy must be a JSON object');
  }

  return {
    enabled: policy.enabled === true,
    writeAllowlist: normalizeRuleList(policy.writeAllowlist),
    blockedPaths: normalizeRuleList(policy.blockedPaths),
  };
}

function normalizeRuleList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error('Safety policy writeAllowlist and blockedPaths must be arrays');
  }

  return value.map((entry) => {
    if (typeof entry !== 'string') {
      throw new Error('Safety policy rules must be strings');
    }
    return normalizeProjectPath(entry);
  });
}

function defaultPolicy(): SafetyPolicy {
  return {
    enabled: false,
    writeAllowlist: [],
    blockedPaths: [],
  };
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

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function riskReason(operation: string): string {
  if (operation.includes('delete')) return 'Delete operations can remove project files or settings.';
  if (operation.includes('setting')) return 'Project settings changes can affect runtime and export behavior.';
  if (operation.includes('uid')) return 'UID updates can rewrite multiple Godot resources.';
  return 'Operation changed project files.';
}

function emptyReplay(): AuditReplaySummary {
  return {
    path: AUDIT_LOG_PATH,
    totalEntries: 0,
    timeRange: { start: null, end: null },
    operationCounts: {},
    changedFileCounts: {},
    steps: [],
    riskHighlights: [],
    parseErrors: [],
  };
}

async function appendSafetyAudit(
  projectPath: string,
  entry: Omit<AuditReplaySummary['steps'][number], 'index' | 'timestamp'>
): Promise<void> {
  const auditPath = join(projectPath, AUDIT_LOG_PATH);
  await mkdir(dirname(auditPath), { recursive: true });
  const existing = existsSync(auditPath) ? await readFile(auditPath, 'utf8') : '';
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: entry.operation,
    changedFiles: entry.changedFiles,
    skippedFiles: entry.skippedFiles,
    details: entry.details,
  });
  await writeFile(auditPath, `${existing}${line}\n`, 'utf8');
}
