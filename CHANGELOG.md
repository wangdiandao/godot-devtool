# godot-devtool Changelog

English | [中文](CHANGELOG.zh-CN.md)

All notable completed changes are tracked here. Future work is tracked in [ROADMAP.md](ROADMAP.md).

## Version 2.4.1

WebSocket bridge lifecycle and dock refresh release.

- Kept the localhost WebSocket bridge tied to the MCP server lifecycle so the Godot editor plugin can reconnect to a stable listener while the server is running.
- Added a `Refresh` / `刷新状态` action to the `GDT` editor dock for immediate status polling and reconnect attempts without waiting for the next process tick.
- Added regression checks for server bridge lifecycle startup/shutdown and the dock refresh UI.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.4.1`.

## Version 2.4.0

Runtime compatibility completion release.

- Replaced receipt-only runtime input compatibility routes with `Input.parse_input_event` injection for keys, mouse clicks, and mouse motion.
- Hardened `simulate_action` and `simulate_sequence` with InputMap validation, strength clamping, per-event failures, and frame-delay handling.
- Added runtime bridge recording routes for `start_recording`, `stop_recording`, and `replay_recording`, including `_input(event)` capture and JSON persistence.
- Updated compatibility metadata and README tool tables so runtime bridge routes are distinguished from generic compatibility wrappers.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.4.0`.

## Version 2.3.2

Editor locale detection and runtime compatibility roadmap release.

- Fixed the `GDT` editor dock locale detection so Godot editor language values such as `zh` show the Simplified Chinese status UI, while Traditional Chinese locales continue to fall back to English.
- Added the `2.4.0 Runtime Compatibility Completion` roadmap section for receipt-only input routes, runtime recording/replay routes, capability metadata, and end-to-end Godot runtime fixtures.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.3.2`.

## Version 2.3.1

Editor dock title and bilingual status display release.

- Renamed the bundled Godot editor dock tab and status heading to `GDT`.
- Localized the editor dock status labels, status values, reconnect button, and tooltip for Simplified Chinese engine/editor locales while keeping English for all other locales.
- Updated plugin, package, Skill, README, roadmap, and verification metadata to `2.3.1`.

## Version 2.3.0

Editor status dock and all-tools README release.

- Added a Godot editor dock for `godot-devtool` that shows MCP WebSocket connection state, URL, last command, last receipt, last error, and a manual reconnect button.
- Updated the bundled Godot plugin metadata and package metadata to `2.3.0`.
- Reworked README and Chinese README capability display into `All 249 Tools` grouped tool-description tables.
- Added verification coverage for the editor status dock and the all-tools README table format.

## Version 2.2.0

README installation and capability guide release.

- Expanded README and Chinese README with detailed release-zip, source-build, MCP client, and Godot plugin installation steps.
- Added copy-ready prompts that ask an AI assistant to install and verify the bundled Godot plugin through MCP tools.
- Added a fuller capability guide covering project, filesystem, resource, script, scene, node, visual, editor, runtime, animation, tilemap, UI/theme, physics, navigation, audio, analysis/QA, and compatibility routes.
- Documented when to choose native, headless Godot, editor WebSocket, or runtime WebSocket transports.

## Version 2.1.0

Server and verification structure cleanup release.

- Reduced `src/server/GodotServer.ts` from a multi-thousand-line implementation file to a compact server state and lifecycle entry point.
- Moved legacy native/headless/editor/runtime tool implementations into `src/server/GodotServer.methods.ts` while keeping public MCP behavior unchanged.
- Merged v2 capability checks into `verify-tool-definitions.js`.
- Merged plugin router and runtime bridge installation checks into `verify-godot-plugin.js`.
- Removed obsolete standalone `verify-v2-*` scripts and replaced the npm surface with `verify:plugin` and `verify:all`.

## Version 2.0.0

WebSocket plugin architecture release.

- Reframed the package as a stdio/headless MCP server with an optional localhost WebSocket editor/runtime bridge.
- Added a bundled Godot editor plugin under `addons/godot_devtool` with a central `command_router.gd` and focused command modules.
- Added `plugin_install`, `plugin_status`, and `plugin_reload` while keeping existing editor bridge names as compatibility entries.
- Added v2 verification scripts for capability metadata, plugin router packaging, and runtime bridge installation.
- Updated README, roadmap, package metadata, server metadata, and skill guidance for the 2.0 architecture.

## Version 1.8.0

Runtime bridge completion release.

- Added a game-runtime autoload bridge installed by `install_editor_bridge` for runtime command processing.
- Routed running-game inspection, input simulation, screenshots, frame capture, property monitoring, input recording/replay, UI actions, navigation helpers, and runtime expression execution through runtime command receipts.
- Replaced weak runtime/editor placeholder responses with real runtime bridge dispatch or precise environment errors when the bridge is not active.
- Updated README feature listings to route-to-description tables and synchronized release metadata for `1.8.0`.

## Version 1.7.1

Factually executable 1.7 compatibility completion release.

- Replaced weak 1.7 compatibility fallbacks with executable local, headless Godot, or bridge-backed handlers.
- Editor/runtime bridge commands now wait for completion receipts and return real results, timeouts, or environment errors instead of queue-only success.
- Expanded TileMap, Theme/UI, Audio, AnimationTree, State Machine, Blend Tree, Testing/QA, and profiling implementations.
- Updated README capability lists to the one-method-one-description style and synchronized release metadata for `1.7.1`.

## Version 1.7.0

Expanded tool compatibility surface release.

- Added exact-name compatibility aliases for existing project, scene, node, script, resource, run, debug, export, and UID tools.
- Added action-routed compatibility wrappers for signal, InputMap, animation, shader, material, lighting, particle, TileMap, physics, navigation, audio, filesystem, and dependency tools.
- Added discoverable structured unsupported responses for live editor, running-game automation, profiling, QA, autoload, and batch-refactoring tool names that need future bridge/runtime support.
- Updated verification coverage for the full 1.7.0 compatibility tool name set.
- Updated release documentation and package download links for `1.7.0`.

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
