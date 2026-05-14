# godot-devtool Changelog

English | [中文](CHANGELOG.zh-CN.md)

All notable completed changes are tracked here. Future work is tracked in [ROADMAP.md](ROADMAP.md).

## Unreleased

No unreleased changes.

## Version 3.0.0

Shared broker, multi-agent, and multi-instance architecture release.

- Redesigned the live workflow around a shared WebSocket broker so multiple MCP clients and AI agents can use the same port without killing each other or opening replacement editors.
- Added bridge session targeting with `projectPath`, `context`, `sessionId`, `runId`, structured ambiguity errors, `broker_status`, `list_bridge_sessions`, `resolve_bridge_target`, and `broker_cleanup_idle`.
- Added multi-game-instance tracking with generated or caller-provided `runId`, `list_run_instances`, `stop_run_instance`, per-run debug output, duplicate `runId` protection, and cleanup that stops all active managed runs.
- Added focused `get_capabilities` workflow filters for `project_setup`, `live_editor`, `runtime_test`, `multi_instance`, and `release_verify` to reduce context usage without removing tools.
- Split the bundled Godot addon into thin entry scripts plus `editor/editor_bridge_client.gd`, `editor/status_dock.gd`, `runtime/runtime_client.gd`, and `runtime/runtime_state_store.gd` from the start of the 3.0 implementation.
- Extended editor/runtime hello, heartbeat, receipts, runtime state, and the `GDT` dock with `sessionId`, `runId`, `brokerId`, project path, plugin version, and protocol version diagnostics.
- Kept the WebSocket bridge listener alive while a `run_project` process is active or a runtime client is connected, then stopped it when no runtime state remains or on `stop_project`, replacement runs, process exit, or server cleanup.
- Changed runtime compatibility tools to wait for `DevtoolRuntime` to reconnect and return a real command receipt instead of failing on an initial `plugin_status` stale snapshot.
- Added process, tool-definition, plugin, runtime, and roadmap regression coverage for broker forwarding, target ambiguity, run selection, duplicate `runId` rejection, split addon files, and runtime listener persistence.
- Added the 3.0 development plan and sub-agent work distribution under `docs/superpowers/plans/2026-05-14-3.0.0-architecture.md`.
- Synchronized package, plugin, Skill, README, CHANGELOG, ROADMAP, verification metadata, and local build metadata to `3.0.0`; GitHub publication is intentionally not performed in this working tree.

## Version 2.8.5

Per-call WebSocket bridge cleanup release.

- Removed the session-lifetime WebSocket bridge compatibility mode so MCP startup never keeps the configured bridge port open by default.
- Kept bridge-backed tools usable by waiting briefly for the Godot editor/runtime bridge to reconnect when a command starts a transient listener.
- Added process and tool-definition regression coverage to prove startup does not bind the bridge port and each MCP tool call cleans it up.
- Synchronized package, plugin, Skill, README, CHANGELOG, ROADMAP, verification metadata, and release zip links to `2.8.5`.

## Version 2.8.4

Existing editor bridge adoption diagnostics release.

- Changed MCP startup so an occupied WebSocket bridge port no longer prevents the stdio MCP server from starting; native diagnostics and `plugin_cleanup_port` remain available.
- Changed `plugin_status` so bridge port conflicts are reported as structured status with reuse and cleanup guidance instead of a generic installation error.
- Changed `launch_editor` so it refuses to open a replacement editor when the configured bridge port is owned by another listener, preventing accidental second-editor sessions.
- Improved WebSocket bridge port-conflict guidance to explain that changing ports creates a separate bridge and does not adopt editor clients connected to another MCP process.
- Added process regression coverage for occupied-port startup, diagnostic `plugin_status`, and `launch_editor` refusal.
- Synchronized package, plugin, Skill, README, CHANGELOG, ROADMAP, verification metadata, and release zip links to `2.8.4`.

## Version 2.8.3

Editor launch reuse safety release.

- Changed `launch_editor` so it first reuses an already connected editor bridge for the requested project instead of launching a second Godot editor process.
- Moved Godot executable detection until after the existing-editor check, so projects with an open editor can be reused even when `GODOT_PATH` is not needed for a new launch.
- Added process regression coverage that simulates an already connected editor client and proves `launch_editor` does not spawn a replacement process.
- Updated the public tool description to make the reuse-or-launch behavior explicit.
- Synchronized package, plugin, Skill, README, CHANGELOG, ROADMAP, verification metadata, and release zip links to `2.8.3`.

## Version 2.8.2

Capability catalog context-budget release.

- Changed `get_capabilities` so the default response is a lightweight catalog without input schemas.
- Added focused schema discovery filters for `routeGroup`, `transport`, `riskLevel`, `toolNames`, and `query`, with compact JSON output by default.
- Added `plugin_cleanup_port` so stale WebSocket bridge listeners can be inspected by dry-run first and stopped only through an explicit cleanup request.
- Rejected unfiltered `includeSchemas=true` requests to prevent large 900 KB class responses from being pulled into assistant context.
- Updated README and the bundled Skill to document the two-stage discovery flow: lightweight catalog first, focused schemas only when needed.
- Added roadmap verification coverage for payload size, filtered schema retrieval, unfiltered schema rejection, and documentation/Skill guidance.
- Synchronized package, plugin, Skill, README, CHANGELOG, ROADMAP, verification metadata, and release zip links to `2.8.2`.

## Version 2.8.1

WebSocket bridge port-conflict safety release.

- Removed automatic `taskkill` / `kill -9` behavior when the WebSocket bridge port is already owned by another process.
- Fixed failed bridge listen attempts so they clear the failed server state and no longer report `status().running` as true.
- Added process regression coverage proving occupied bridge ports are reported without terminating the port owner and that the bridge can start after the owner exits.
- Moved internal maintenance and verification scripts to `dev-scripts/` so the repository root `scripts/` directory contains only `build.js`.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.8.1`.

## Version 2.8.0

Server modularization and process-handling hardening release.

- Split the legacy 5k-line `GodotServer.methods.ts` implementation into focused `src/server/methods/*` modules while keeping the public tool surface unchanged.
- Added process-handling regression coverage for failed headless Godot operations, startup exits, and stopped-run debug output preservation.
- Hardened Godot operation error propagation so non-zero process exits are reported as tool failures instead of being interpreted as successful output.
- Updated generated verification scripts to scan the full `src/server` source tree after the server method split.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.8.0`.

## Version 2.7.3

Stable MCP bridge lifecycle release.

- Fixed long-running MCP WebSocket bridge sessions so editor/runtime `hello` authentication can lazily load the installed project's `.godot-devtool/bridge-config.json` token instead of requiring a prior `plugin_status` call in the same process.
- Added security regression coverage for the lazy project-auth hello path to prevent installed projects from staying unauthorized after a fresh MCP server start.
- Updated the bundled Skill to state that `node E:/godot-devtool/build/index.js` must keep running for dock `Registered`, `editor_ws`, and `runtime_ws` routes to remain available.
- Verified the install-to-runtime chain with a fresh temporary Godot project, including MCP stdio initialization, plugin install/status, WebSocket bridge handshake, project run, and runtime route smoke checks.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.7.3`.

## Version 2.7.2

Dock status stability release.

- Fixed the `GDT` dock so status refresh is throttled and labels, buttons, and status dots are updated only when values change, preventing continuous dock flicker in the Godot editor.
- Fixed the editor bridge startup path so `_enter_tree()` initiates the first WebSocket connection before building the status dock.
- Fixed editor and runtime bridge retry throttling so the first connection attempt is never skipped during fast Godot startup.
- Added plugin verification coverage for dock refresh stability, editor startup connection order, and first-attempt throttle guards in both source and installed plugin copies.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.7.2`.

## Version 2.7.1

Runtime bridge bugfix release.

- Fixed the runtime autoload bridge so `_ready()` immediately loads the bridge config and starts the first WebSocket connection before writing runtime state.
- Fixed headless `get_game_screenshot` handling so unavailable viewport images return a structured runtime error instead of timing out or breaking in Godot's debugger.
- Added plugin verification coverage for the runtime bridge startup order and screenshot unavailable-image guards in both source and installed plugin copies.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.7.1`.

## Version 2.7.0

Live editor scene mutation and dock architecture release.

- Added explicit live editor tools for adding, deleting, renaming, moving, duplicating, and saving nodes/scenes in the currently open Godot editor scene through UndoRedo.
- Added `mode: "editor_live"` support to existing node mutation tools so assistants can choose between repeatable headless file edits and live editor edits without forcing a disk reload.
- Redesigned the `GDT` dock into connection, live editor, runtime, and activity sections with current scene, selection, live-edit readiness, manual-save strategy, runtime session, freshness, and latest-result diagnostics.
- Kept the bundled Skill English-only and changed GitHub Release packaging so the top-level `scripts/` directory includes only `build.js`.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.7.0`.

## Version 2.6.5

Skill context-budget release.

- Compressed the bundled `godot-devtool` Skill from a long per-tool listing into a workflow router.
- Added context-budget rules that tell assistants not to paste or carry the full tool catalog, generated README tables, or Godot source unless needed.
- Reinforced `get_capabilities` as the dynamic schema and category entry point for all 221 exposed tools.
- Synchronized package, plugin, Skill, README, changelog, roadmap, and release zip links to `2.6.5`.

## Version 2.6.4

Steam Godot launch compatibility release.

- Extended the explicit writable `--log-file` workaround to `launch_editor` and non-headless `run_project`, not only headless operations.
- Renamed the internal log argument helper so editor, run, headless, and export launches share the same Godot log path behavior.
- Added regression checks requiring `launch_editor` and `run_project` to insert `--log-file` before `--path`.
- Synchronized package, plugin, Skill, README, changelog, roadmap, and release zip links to `2.6.4`.

## Version 2.6.3

Steam headless Godot compatibility release.

- Fixed Steam Godot `4.6.2.stable.steam` headless launches on Windows by adding an explicit writable `--log-file` before `--path` for headless syntax checks, operations, project runs, and exports.
- Added `GODOT_DEVTOOL_HEADLESS_LOG_DIR` so users can choose where headless Godot logs are written while the default stays in the system temp directory.
- Updated runtime verification to use the same explicit log-file path, so `verify:runtime` now passes with the local Steam Godot tools executable.
- Added security regression coverage to require the headless log-file workaround before future releases.
- Synchronized package, plugin, Skill, README, changelog, roadmap, and release zip links to `2.6.3`.

## Version 2.6.2

Security hardening release.

- Added per-project WebSocket bridge authentication for editor/runtime peers and bound command receipts to the authenticated client.
- Hardened project-relative filesystem operations against symlink/junction escapes and unsafe traversal.
- Blocked MCP-supplied `project.godot` raw value and string line injection while preserving trusted internal InputMap serialization.
- Constrained runtime screenshot and recording outputs to `.godot-devtool` with traversal and overwrite checks.
- Added Godot process timeouts, safer editor launch stdio handling, and stricter script attach path validation.
- Added release publishing gates for clean tree, tag/HEAD consistency, `verify:all`, and explicit asset clobber opt-in.
- Added `verify:security`, included `verify:runtime` and `verify:security` in `verify:all`, and synchronized package, plugin, Skill, README, changelog, roadmap, and release zip links to `2.6.2`.

## Version 2.6.1

Tool route metadata and compatibility hardening release.

- Corrected TileMap compatibility routes so `tilemap_clear`, `tilemap_get_cell`, and `tilemap_get_used_cells` report the concrete headless `tilemap` implementation instead of a generic native/bridge path.
- Fixed `reload_project` in the installed editor plugin command router so the advertised editor WebSocket route is registered and executable.
- Corrected QA compatibility route metadata for `assert_screen_text`, `run_test_scenario`, and `run_stress_test` so native QA helpers are not advertised as runtime WebSocket routes.
- Added regression checks that compare published tools, handlers, compatibility routes, editor/runtime WebSocket route declarations, and installed plugin routes.
- Synchronized package, plugin, Skill, README, changelog, and verification metadata to `2.6.1`.

## Version 2.6.0

Browser visualizer release.

- Added `browser_visualizer_start`, `browser_visualizer_status`, and `browser_visualizer_stop` tools for a local read-only HTTP dashboard.
- The dashboard refreshes MCP WebSocket bridge state, connected editor/runtime clients, pending command count, and live-route guidance for screenshots, scene inspection, input, UI, and editor state.
- Added Browser visualizer regression coverage and included it in `verify:all`.
- Synchronized package, plugin, Skill, README, changelog, roadmap, and verification metadata to `2.6.0`.

## Version 2.5.2

Runtime handshake diagnostics release.

- Made the runtime autoload bridge read `.godot-devtool/bridge-config.json` so it follows the installed MCP WebSocket URL instead of relying on a hard-coded development port.
- Added runtime bridge diagnostics in `.godot-devtool/runtime-state.json`, including socket state, hello acknowledgement, hello attempt count, bridge URL, session id, and last connection error.
- Added regression coverage requiring runtime bridge config loading and handshake-state diagnostics.
- Synchronized package, plugin, README, changelog, roadmap, verification metadata, and release zip links to `2.5.2`.

## Version 2.5.1

Public tool surface cleanup release.

- Removed pure legacy compatibility aliases from the published MCP tool list and tool-call dispatch path.
- Reduced the public tool catalog from 249 tools plus 28 aliases to 217 canonical and explicitly implemented tools with 0 aliases.
- Updated `get_capabilities` so it reports the modern tool surface without `aliasCount` or `aliases` payloads.
- Expanded the English and Chinese README capability guide with concrete project, scene, script, filesystem, resource, visual, editor, and runtime workflows.
- Regenerated README tool tables so compatibility wrappers describe the implemented workflow instead of advertising "transfer" or alias-style wording.
- Synchronized package, plugin, Skill, README, changelog, roadmap, verification metadata, and release zip links to `2.5.1`.

## Version 2.5.0

MCP validation hardening release.

- Made `get_capabilities` and MCP server metadata report the live package version instead of the stale `2.2.0` value.
- Exposed canonical compatibility routing through top-level `canonicalName` metadata while preserving existing compatibility aliases.
- Added actionable Godot executable guidance and propagated configured/detected Godot paths into `GODOT_PATH` for stdio clients.
- Fixed `project_input_action` writes to preserve Godot project-setting literals and native `InputEvent*` syntax.
- Added runtime `hello` registration with `context: "runtime"` and a versioned editor `hello` -> `hello_ack` handshake with session id, retry, heartbeat, and dock status.
- Made WebSocket wrappers surface failed editor/runtime receipts as MCP errors and aligned advertised editor routes with installed plugin implementations.
- Added regression coverage for 2.5.0 validation hardening across plugin, tool, roadmap, and project checks.

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
