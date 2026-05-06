# godot-devtool 1.6.0 Safety And Recovery Design

## Goal

Implement the ROADMAP 1.6.0 Safety And Recovery release:

- Configurable write allowlists.
- Batch diff summaries for high-risk write operations.
- Audit replay summaries.
- Rollback suggestions for supported write operations.

The release must preserve existing behavior for projects that have no safety policy configured, while exposing stronger safety controls for users who opt in.

## Current Context

The project is currently released as `1.5.0`. Existing write-capable tools already use project-relative path validation, explicit overwrite flags, delete confirmation, and `.godot-devtool/audit.jsonl` audit logging. The new work should build on those mechanisms instead of replacing them.

Existing high-risk surfaces include:

- Direct file writes and deletes through `filesystem_write` and `filesystem_delete`.
- Generated workflow files from gameplay prototype and workflow test scene helpers.
- Project settings edits and deletes.
- Script and resource creation or replacement.
- Editor bridge installation and queued editor commands.
- Scene, node, visual, animation, physics, navigation, audio, export, and other Godot operation wrappers that write through the generated Godot script.

## Recommended Architecture

Add a focused `src/godot/safetyRecovery.ts` module that owns safety policy parsing, allowlist checks, diff summaries, audit replay summaries, and rollback suggestion generation.

The module should expose small functions used by existing write paths:

- `readSafetyPolicy(projectPath)`
- `writeSafetyPolicy(projectPath, policy)`
- `evaluateWriteSafety(projectPath, request)`
- `buildDiffSummary(projectPath, changes)`
- `buildAuditReplay(projectPath, options)`
- `suggestRollback(projectPath, request)`

Existing write modules should call this module at the point where they already know the changed project-relative paths and operation name. This keeps the public MCP tool behavior consistent while avoiding a broad rewrite of the server.

## Safety Policy

Use `.godot-devtool/safety.json` as the project-local policy file.

Default behavior:

- If the file is missing, writes remain allowed for backward compatibility.
- Responses still include safety metadata where practical.

Policy shape:

```json
{
  "enabled": true,
  "writeAllowlist": [
    "scenes/**",
    "scripts/**",
    "resources/**",
    "addons/godot_devtool_bridge/**",
    ".godot-devtool/**"
  ],
  "blockedPaths": [
    "project.godot"
  ]
}
```

Allowlist matching should support simple project-relative glob patterns. Blocked paths take precedence over allowlist matches. Paths must still pass the existing project-relative path validation and root-escape checks.

## Public Tools

Add these top-level tools:

- `get_safety_policy`: read the resolved project safety policy and indicate whether defaults are in use.
- `set_safety_policy`: update `.godot-devtool/safety.json` with validation and audit logging.
- `preview_write_safety`: preview allowlist and diff information for a proposed set of writes or deletes without modifying files.
- `get_audit_replay`: summarize `.godot-devtool/audit.jsonl` into replayable operational history.
- `get_rollback_suggestions`: return rollback guidance for an operation, audit entry, or path.

These tools should live in the project/tooling surface because they apply across filesystem, project settings, resources, scripts, and generated Godot operations.

## Diff Summary

Diff summaries are structured metadata, not raw patches. They should report:

- Operation name.
- Affected files.
- For each file: action (`create`, `modify`, `delete`, `missing`, `unknown`), byte change, line change where text is available, and whether overwrite or recursive delete is involved.
- Aggregate counts.
- Risk level (`low`, `write`, `dangerous`) using existing tool risk conventions.
- Policy decision (`allowed`, `blocked`, `not_configured`) and matching rule.

For delete previews, directory operations should reuse existing recursive target enumeration so users can see all paths before deletion.

## Audit Replay

`get_audit_replay` should read recent audit entries and return:

- Total entries considered.
- Time range.
- Counts by operation.
- Counts by changed file.
- Chronological replay steps with operation, timestamp, changed files, skipped files, and important details.
- Risk highlights such as deletes, overwrites, project settings changes, and generated editor bridge commands.

Invalid audit lines should not crash the whole replay. They should be returned as parse errors with line numbers.

## Rollback Suggestions

Rollback suggestions must be honest about what the system can actually restore.

Supported guidance:

- For created files: suggest deleting the created path after previewing the delete.
- For deleted files: explain that automatic restore is unavailable unless the user has VCS or external backups.
- For overwritten text files: suggest checking VCS diff/history because 1.6.0 does not introduce content snapshot storage.
- For project settings edits: suggest restoring previous values if the audit entry includes enough preview/detail data; otherwise use VCS.
- For generated workflow or bridge files: suggest rerunning generation with known options or reverting with VCS.

Do not claim automatic rollback unless a later version adds stored backups.

## Error Handling

Safety failures should return normal MCP error responses with concrete suggestions:

- Show which path was blocked.
- Show the policy file path.
- Show the allowlist or blocked rule that caused the decision.
- Suggest using `get_safety_policy`, `set_safety_policy`, or `preview_write_safety`.

Malformed policy files should fail closed when policy loading is required for a write. Read-only policy inspection should report the parse error without modifying files.

## Testing And Verification

Update `scripts/verify-roadmap-completion.js` to cover 1.6.0:

- Assert package version is `1.6.0`.
- Assert all new tool definitions exist with expected schema fields.
- Create a temporary Godot project and verify default policy compatibility.
- Enable an allowlist policy and verify allowed writes pass.
- Verify blocked writes fail with path and policy details.
- Verify delete preview produces diff summary metadata.
- Verify audit replay summarizes entries and tolerates malformed lines.
- Verify rollback suggestions match create, modify, delete, and project setting cases.
- Verify README, Chinese README, CHANGELOG, Chinese CHANGELOG, ROADMAP, Chinese ROADMAP, and skill metadata are synchronized for `1.6.0`.

Run the existing release checks after implementation:

- `npm run build`
- `npm run verify:tools`
- `npm run verify:gdscripts`
- `npm run verify:roadmap`

## Documentation And Release Sync

Update release documentation in the same implementation pass:

- Set `package.json`, `package-lock.json`, and skill metadata to `1.6.0`.
- Add `1.6.0 Safety And Recovery` to both changelogs.
- Move completed 1.6.0 items out of both roadmaps.
- Update README and README.zh-CN badges and download links to `1.6.0`.
- Document the new safety/recovery tools in both README files.

## Out Of Scope

- Automatic content backup storage.
- Full transactional rollback.
- A new permissions UI.
- Networked policy management.
- Broad 1.7.0 compatibility wrapper work.
