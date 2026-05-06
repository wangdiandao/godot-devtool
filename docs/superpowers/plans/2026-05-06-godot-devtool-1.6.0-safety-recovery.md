# godot-devtool 1.6.0 Safety Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 1.6.0 Safety And Recovery release from the approved ROADMAP design, then add the Godot Chinese community QR code to the Chinese README before pushing.

**Architecture:** Add `src/godot/safetyRecovery.ts` as the shared policy, diff, audit replay, and rollback module. Wire it into existing filesystem, workflow, script, resource, project, and public MCP project tools without changing the existing handler split. Keep no-policy projects backward compatible.

**Tech Stack:** TypeScript MCP server, Node verification scripts, Markdown release docs, GitHub release packaging.

---

### Task 1: Verification First

**Files:**
- Modify: `scripts/verify-roadmap-completion.js`

- [ ] Change the release version assertion from `1.5.0` to `1.6.0`.
- [ ] Add tool definition assertions for `get_safety_policy`, `set_safety_policy`, `preview_write_safety`, `get_audit_replay`, and `get_rollback_suggestions`.
- [ ] Add temporary-project assertions for default policy compatibility, allowlist pass, blocked write failure, diff summary metadata, tolerant audit replay, and rollback suggestions.
- [ ] Run `npm run verify:roadmap`.
- [ ] Confirm the command fails because 1.6.0 implementation and docs are not present yet.

### Task 2: Safety Recovery Core

**Files:**
- Create: `src/godot/safetyRecovery.ts`
- Modify: `src/godot/workflowAutomation.ts`
- Modify: `src/godot/filesystemTools.ts`
- Modify: `src/godot/scriptTools.ts`
- Modify: `src/godot/resourceTools.ts`
- Modify: `src/godot/projectSettings.ts`
- Modify: `src/godot/editorBridge.ts`

- [ ] Implement project-relative policy loading for `.godot-devtool/safety.json`.
- [ ] Implement simple allowlist glob matching with blocked-path precedence.
- [ ] Implement `evaluateWriteSafety` with default-compatible `not_configured` decisions.
- [ ] Implement `buildDiffSummary` for create, modify, delete, missing, and unknown actions.
- [ ] Implement tolerant audit replay parsing with operation and file counters.
- [ ] Implement rollback suggestions for create, modify, delete, settings, workflow, and bridge operations.
- [ ] Add safety checks and diff summaries to direct file writes/deletes.
- [ ] Add safety checks to generated workflow files, scripts, resources, project settings, and editor bridge writes.

### Task 3: Public MCP Tools

**Files:**
- Modify: `src/tools/definitions/project.ts`
- Modify: `src/server/handlers/project.ts`
- Modify: `src/server/GodotServer.ts`

- [ ] Add schemas for the five new Safety And Recovery tools.
- [ ] Route the new tools through project handlers.
- [ ] Add handler methods returning structured JSON responses.
- [ ] Mark safety write tools with correct write risk and preview/replay tools as read.

### Task 4: Release Docs, Skill, And QR Asset

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.zh-CN.md`
- Modify: `ROADMAP.md`
- Modify: `ROADMAP.zh-CN.md`
- Modify: `skills/godot-devtool/SKILL.md`
- Create: `docs/assets/godot-chinese-community-qq-qrcode.jpg`

- [ ] Copy the attached QR image from `C:/Users/Lenovo/Desktop/qrcode_1778064701897.jpg` into `docs/assets/godot-chinese-community-qq-qrcode.jpg`.
- [ ] Set package and lockfile versions to `1.6.0`.
- [ ] Update skill metadata and safety guidance for 1.6.0.
- [ ] Add 1.6.0 Safety And Recovery entries to both changelogs.
- [ ] Move completed 1.6.0 items out of both roadmaps.
- [ ] Update README badges, download links, and tool tables to 1.6.0 in English and Chinese.
- [ ] Add the QR image to `README.zh-CN.md` in a Godot Chinese community section before publishing.

### Task 5: Verification And Publish Prep

**Files:**
- Generated: `build/**`
- Generated: `godot-devtool-build-1.6.0.zip`

- [ ] Run `npm run build`.
- [ ] Run `npm run verify:tools`.
- [ ] Run `npm run verify:gdscripts`.
- [ ] Run `npm run verify:roadmap`.
- [ ] Run the packaging/release script path and verify a 1.6.0 package exists.
- [ ] Re-open `README.zh-CN.md` and verify the QR image reference is present before any push.
- [ ] Commit implementation changes.
- [ ] Push to `origin main` after verification and QR inclusion.
