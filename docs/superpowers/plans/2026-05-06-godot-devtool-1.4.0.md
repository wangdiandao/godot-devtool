# godot-devtool 1.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the `godot-devtool` 1.4.0 physics, navigation, and debug analysis release.

**Architecture:** Extend the existing `physics` and `navigation` tools rather than adding new top-level tools. Keep schemas in `src/tools/definitions/visual.ts`, request plumbing in `src/server/GodotServer.ts`, and Godot runtime behavior in the P11 operation fragment `src/scripts/godot_operations/60_tilemap_spatial_commands.gd`.

**Tech Stack:** TypeScript MCP server, generated Godot 4 GDScript operation bundle, Node verification scripts, bilingual Markdown release documentation.

---

### Task 1: Verification First

**Files:**
- Modify: `scripts/verify-roadmap-completion.js`

- [ ] Add assertions for the 1.4.0 `physics` and `navigation` action schemas.
- [ ] Add assertions that generated `build/scripts/godot_operations.gd` contains the new helper and operation functions.
- [ ] Run `npm run verify:roadmap` and confirm it fails before implementation.

### Task 2: Tool Schemas And Server Plumbing

**Files:**
- Modify: `src/tools/definitions/visual.ts`
- Modify: `src/server/GodotServer.ts`

- [ ] Add `physics` actions for layer updates, collision info, shape resources, templates, and scene analysis.
- [ ] Add `navigation` actions for bake configuration, baking, path queries, and debug geometry.
- [ ] Add schema fields and snake/camel mappings needed by those actions.
- [ ] Pass the new normalized fields through `handleP11SceneOperation`.

### Task 3: Godot Runtime Operations

**Files:**
- Modify: `src/scripts/godot_operations/10_visual_helpers.gd`
- Modify: `src/scripts/godot_operations/60_tilemap_spatial_commands.gd`

- [ ] Add reusable physics serialization and analysis helpers.
- [ ] Implement collision layer/mask update and collision info listing.
- [ ] Implement shape resource creation plus Area and CharacterBody templates.
- [ ] Implement scene physics analysis warnings for missing shapes, zero masks, overlapping areas, and navigation breaks.
- [ ] Implement navigation bake configuration, 3D bake call, straight-line path query, and Line2D debug geometry creation.

### Task 4: Release Sync

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

- [ ] Set package and skill versions to `1.4.0`.
- [ ] Move 1.4.0 details from roadmap to changelog.
- [ ] Update bilingual README tool descriptions and package download links.

### Task 5: Verification And Artifact

**Files:**
- Generated: `build/**`
- Generated: `godot-devtool-build-1.4.0.zip`

- [ ] Run `npm run build`.
- [ ] Run `npm run verify:tools`.
- [ ] Run `npm run verify:gdscripts`.
- [ ] Run `npm run verify:roadmap`.
- [ ] Run `npm pack` or the repo build packaging path and confirm a 1.4.0 artifact exists.
