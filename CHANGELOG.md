# godot-devtool Changelog

English | [中文](CHANGELOG.zh-CN.md)

All notable completed changes are tracked here. Future work is tracked in [ROADMAP.md](ROADMAP.md).

## Version 1.6.0

Safety and recovery release.

- Added project-local safety policy support with configurable write allowlists and blocked path rules.
- Added structured diff summaries for high-risk write and delete operations.
- Added audit replay summaries with operation counters, changed-file counters, and risk highlights.
- Added rollback suggestion guidance for created, overwritten, deleted, settings, workflow, and bridge changes.
- Updated release documentation and package download links for `1.6.0`.

## Version 1.5.0

Export, CI, and release automation release.

- Expanded export preset inspection with export template guidance, platform signing details, icon and metadata checks, and configured artifact validation.
- Added `generate_ci_snippet` for GitHub Actions and GitLab CI headless checks, export preflight, release export, and artifact archiving snippets.
- Improved `run_project_checks` with machine-readable check codes, root causes, and fix suggestions.
- Added `release:github` publishing automation that deletes the local release zip after a successful GitHub Release upload.
- Updated release documentation and package download links for `1.5.0`.

## Version 1.4.0

Physics, navigation, and debug analysis release.

- Expanded `physics` with collision layer/mask updates, named layer resolution, collision info inspection, reusable Shape resource creation, Area trigger templates, CharacterBody controller templates, and scene physics analysis.
- Expanded `navigation` with bake configuration, NavigationMesh bake execution, path query output, and Line2D navigation debug geometry generation.
- Added release verification coverage for the 1.4.0 tool schemas and generated Godot operation functions.
- Updated release documentation and package download links for `1.4.0`.

## Version 1.3.1

Code organization and maintainability release.

- Split MCP tool definitions into category modules while preserving all exported tool names and compatibility aliases.
- Replaced the monolithic server tool switch with categorized handler registries.
- Split Godot operation source into ordered category fragments while keeping the generated runtime script byte-for-byte compatible with the previous single-file script.
- Added verification scripts for tool definition coverage and Godot operation script generation.
- Updated release documentation and package download links for `1.3.1`.

## Version 1.3.0

Visual, shader, animation, and UI enhancement release.

- Added shader include reporting and texture uniform inference for shader inspection.
- Added reusable material templates through `material` `list_templates` and `create_from_template`.
- Expanded `animation` with `add_track`, `set_keyframe`, `get_info`, and `remove` actions.
- Added AnimationTree transition parameter editing through `animation_state_machine`.
- Expanded `ui` with Theme resource creation, theme application, reusable Control tree templates, and automatic signal connection helpers.
- Updated release documentation and package download links for `1.3.0`.

## Version 1.2.1

Documentation and release packaging update.

- Added English and Chinese changelogs.
- Moved completed release history out of ROADMAP so ROADMAP only tracks future plans.
- Added English and Chinese ROADMAP pages with language switching.
- Replaced the license file with the project owner's MIT license notice.
- Updated README structure and capability lists to use grouped tool tables.
- Added direct download instructions for prebuilt release packages.

## Version 1.2.0

TileSet and map generation release.

- Added TileSet atlas source management through the `tilemap` `add_atlas_source` action.
- Added tile custom metadata, collision polygon, navigation polygon, and terrain configuration actions.
- Added deterministic randomized map painting with weighted tile choices.
- Added reusable map templates, including `survivor_arena` for terrain and obstacle layout generation.

## Version 1.1.0

Editor bridge hardening release.

- Added command execution receipts with queued, completed, failed, and expired command states.
- Added command timeouts and editor-side error details for bridge command processing.
- Added Inspector property read/write commands through `editor_inspector_get_properties` and `editor_inspector_set_properties`.
- Added bridge mode metadata for file, HTTP, and WebSocket bridge sessions.
- Added stable editor instance metadata for multi-editor and multi-project identification.
- Expanded `editor_bridge_status` with instance, bridge, pending command, expired command, and recent receipt details.

## Version 1.0.0

Initial `godot-devtool` release.

- Repackaged the project as `godot-devtool`.
- Reorganized the codebase around `src/server`, `src/godot`, `src/tools`, and `src/scripts`.
- Added `get_capabilities` for tool discovery, schemas, aliases, run modes, and risk levels.
- Added project metadata analysis, categorized resource indexes, GDScript indexing, and resource dependency analysis.
- Added project settings, InputMap, filesystem, resource, scene, node, script, editor bridge, animation, visual, TileMap, physics, navigation, audio, export, UID, workflow, and verification tools.
- Added `scripts/check-project.js` and `scripts/verify-roadmap-completion.js` for local validation.
