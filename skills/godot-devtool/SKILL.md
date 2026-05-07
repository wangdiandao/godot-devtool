---
name: godot-devtool
description: "Teach MCP clients and connected AI assistants how to use the godot-devtool 2.6.1 MCP server for Godot 4 projects: inspect first, understand each operation group, choose stdio/headless routes for repeatable project edits, use WebSocket only for live editor/runtime state, and verify changes."
metadata:
  version: "2.6.1"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP

Use this skill when an MCP client or connected AI assistant is working with a Godot 4 project through `godot-devtool`.

Compatibility: `godot-devtool` 2.6.1.

## Tool Coverage

This skill teaches operating strategy, route selection, and common workflows. It is not the complete catalog.

Use `get_capabilities` as the live source of truth for every available tool, input schema, route group, transport, risk level, editor/runtime requirement, and canonical route. The generated README tool table is the packaged reference list:

- `README.md` -> generated `## All 221 Tools` table
- `README.zh-CN.md` -> generated `## 全部 221 个工具` table

Do not treat a tool as unsupported just because it is not named here. Check `get_capabilities` or the README table first.

## Setup

Run the MCP server from the client over stdio:

```json
{
  "mcpServers": {
    "godot-devtool": {
      "command": "node",
      "args": ["E:/godot-devtool/build/index.js"],
      "env": {
        "GODOT_PATH": "D:/Program Files/Godot/Godot_v4.x.exe",
        "GODOT_DEVTOOL_WS_PORT": "8766"
      }
    }
  }
}
```

`GODOT_PATH` is required for headless Godot validation unless Godot is already in `PATH`. `GODOT_DEVTOOL_WS_PORT` only matters when editor or runtime WebSocket routes are used.

## Start Every Task

1. Confirm the server and environment:
   - `get_godot_version`
   - `get_capabilities`
2. Establish project state before edits:
   - `get_project_info`
   - `get_resource_index`
   - `get_script_index`
   - `resource_dependency_graph` when dependencies matter
3. If the project path is unknown, call `list_projects` or ask for the path.
4. Read the relevant scene, node, script, resource, editor state, or runtime state before writing.

Never start by guessing file paths or editing raw `.tscn`, `.tres`, `.gd`, or `project.godot` content when a structured MCP tool can inspect and mutate the same surface.

## Transport Decision

The MCP client always talks to `godot-devtool` over stdio. Inside the server, each tool then uses one of these execution paths:

- `native`: file/project/index/audit operations implemented by Node.js. Use for fast project inspection, file reads/writes, safety previews, dependency graphs, project settings, export metadata, and audit/recovery work.
- `headless_godot`: one-shot Godot CLI operations. Use when Godot must parse, load, validate, or serialize scenes, resources, scripts, animations, physics, navigation, TileMap, materials, or UI/theme data.
- `process_control`: launch/stop/check Godot processes. Use for `run_project`, `stop_project`, debug output, export execution, and project checks.
- `editor_ws`: WebSocket connection to the editor plugin. Use only when the current open editor state matters: selection, Inspector properties, UndoRedo-backed edits, or plugin reload.
- `runtime_ws`: WebSocket connection to the running game's `DevtoolRuntime` autoload. Use only after the game is running and the task needs live game scene tree, input simulation, screenshots, frame capture, runtime properties, UI text, navigation, monitors, recordings, or QA assertions.

Default to `native` or `headless_godot` for repeatable project construction and CI-friendly edits. Use WebSocket only for live state. Do not call WebSocket routes merely because the user is working on a Godot project.

## Operation Map

Use `routeGroup` from `get_capabilities` to choose the right family:

- `core`: Godot version, capabilities, run/stop project, debug output, Browser visualizer, audit and safety helpers.
- `project`: project metadata, `project.godot` settings, InputMap, autoloads, physics layers, export presets, CI snippets, UID updates.
- `filesystem`: project-local list/read/write/search/delete-preview operations.
- `resource`: resource index, dependency graph, load/save/preview resources, unused resource checks, export metadata.
- `script`: script index, read/write/create/edit/attach GDScript, syntax checks, open-script/reference helpers.
- `scene`: create/open/save scenes; add/delete/rename/duplicate/move nodes; groups; signals; animations; TileMap; physics; navigation; audio; cross-scene edits.
- `node`: inspect and mutate node properties, paths, groups, references, and runtime node lookup helpers.
- `visual`: shaders, materials, sprites, lighting, environment, particles, UI templates, Control theme overrides, camera, geometry/debug helpers.
- `editor`: plugin install/status/reload, live selection, live Inspector reads/writes, UndoRedo.
- `runtime`: game screenshots, frame capture, runtime scene tree, node properties, input simulation, UI assertions, wait/monitor/record/replay, navigation movement, stress and scenario tests.

When several tools could work, prefer the most structured tool for the domain. For example, use project settings tools instead of editing `project.godot`; scene/node tools instead of string-editing `.tscn`; script tools plus syntax validation instead of blind file replacement.

## WebSocket Plugin And Runtime Bridge

Install the Godot plugin only when live editor or runtime routes are required:

- `plugin_install`: copy `addons/godot_devtool` into the target Godot project and register the runtime autoload.
- `plugin_status`: verify installed files, autoload registration, WebSocket port, bridge mode, and editor/runtime connection state.
- `plugin_reload`: ask the live plugin to reload through the editor WebSocket bridge.

After `plugin_install`, enable the plugin in Godot:

```text
Project > Project Settings > Plugins > godot-devtool
```

For `editor_ws`, the Godot editor must be open, the plugin must be enabled, and the WebSocket port must match the MCP server environment.

For `runtime_ws`, run the project so the `DevtoolRuntime` autoload connects. Runtime routes should return real receipts or explicit bridge errors. Do not claim runtime behavior worked when the runtime bridge was not connected.

## Recommended Workflows

### Explore A Project

1. `get_project_info` to identify Godot version, renderer, paths, and main scene.
2. `get_resource_index` and `get_script_index` to map assets and scripts.
3. `filesystem_list` / `filesystem_read` for targeted files.
4. `resource_dependency_graph` when scene/resource dependencies affect the change.
5. `get_scene_tree` after opening or naming the scene that will be changed.

### Build Or Modify A 2D Scene

1. `create_scene` or `scene_open`.
2. `add_node`, `node_duplicate`, `node_move`, `rename_node`, `delete_node`.
3. `load_sprite`, `tilemap`, `tilemap_set_cell`, `geometry`, or UI/theme tools as needed.
4. `get_node_properties` or `node_get` before changing existing nodes.
5. `update_node_properties` for transforms, colors, collisions, exported values, visibility, and Inspector-visible configuration.
6. `script_create` / `script_write` / `script_attach` only for behavior that must be dynamic.
7. `save_scene`, then validate scripts and run project checks.

### Build Or Modify A 3D Scene

1. `create_scene` with a 3D root or `scene_open`.
2. Add meshes, cameras, lights, navigation regions, physics bodies, and collision using scene/visual/navigation/physics tools.
3. Use material and shader tools for PBR, emission, roughness, uniforms, and visual effects.
4. Use headless scene tools for persistent authoring; use runtime tools only to inspect or test a running instance.
5. `save_scene`, then run relevant validation.

### Write Or Edit Scripts

1. `get_script_index` or `read_script_file`.
2. Use `script_create`, `script_write`, or compatibility `edit_script` with targeted replacements when possible.
3. Use full-file replacement only when it is safer than a narrow patch.
4. `check_gdscript_syntax` after changes.
5. Use `run_project` and `get_debug_output` when behavior needs runtime validation.

After major script creation or broad script changes, reload/open the project if Godot has stale script state.

### Project Configuration

Use structured project tools:

- `project_set_setting` / `set_project_setting` for `project.godot`.
- `project_input_action` / `set_input_action` for InputMap.
- `add_autoload`, `remove_autoload`, and `get_autoload` for singletons.
- `set_physics_layers` and related physics helpers for collision layer names.
- `get_export_presets`, `check_export_presets`, `export_matrix`, `export_project`, and `generate_ci_snippet` for export work.

Do not hand-edit `project.godot` unless no structured route exists and the user accepts the risk.

### Live Editor Work

Use `editor_ws` only for open-editor state:

1. `plugin_status` to confirm the editor client is connected.
2. `editor_get_selection` or `scene_get_current` to orient.
3. `editor_select_node` if the user wants a visible selection change.
4. `editor_inspector_get_properties` before Inspector edits.
5. `editor_inspector_set_properties` for live Inspector changes.
6. `editor_undo_redo` for undo/redo-backed editor mutations.

If editor routes time out, open the project in Godot, enable the plugin, confirm the port, then retry.

### Playtest And Runtime QA

Use `runtime_ws` only after the project is running:

1. `run_project` or ask the user to press Play in Godot.
2. `plugin_status` to confirm runtime bridge connection.
3. `get_game_screenshot` or `capture_frames` to see the live result.
4. `get_game_scene_tree` and `get_game_node_properties` to inspect runtime state.
5. `simulate_action`, `simulate_key`, `simulate_mouse_click`, or `simulate_sequence` to interact.
6. `assert_node_state`, `assert_screen_text`, `click_button_by_text`, `wait_for_node`, `monitor_properties`, or `run_test_scenario` for QA.
7. `get_debug_output` / `get_editor_errors` to capture errors.
8. `stop_project` when the run is no longer needed.

Prefer `simulate_action` over raw key presses when InputMap actions exist. Use short key durations for precise movement.

### Visual And Inspector-First Authoring

For visual, layout, and tuning values, prefer data in the scene/resource over hardcoded script assignments:

- Use `update_node_properties` for position, scale, visibility, modulate, exported variables, collision shapes, and node references.
- Use UI/theme tools for anchors, font sizes, colors, styleboxes, and templates.
- Use material/shader tools for albedo, roughness, emission, shader code, and uniforms.
- Use animation tools for tracks/keyframes instead of manually writing animation resources.

Write GDScript when behavior depends on runtime logic, not when the value can live in the Inspector.

### Browser Visualizer

Use `browser_visualizer_start` when a human wants to inspect bridge state in a browser. It serves a local read-only dashboard for WebSocket listener status, connected editor/runtime clients, pending command count, and live-route hints.

Use `browser_visualizer_status` to read the URL again, and `browser_visualizer_stop` when the dashboard is no longer needed.

## Rules And Pitfalls

- Read state before writing.
- Prefer structured MCP tools over raw file edits.
- Use dry-run, preview, or audit-capable tools before broad writes.
- Use `filesystem_preview_delete` before deletion unless the user named the exact path and explicitly requested removal.
- Save scenes after meaningful scene edits.
- Validate GDScript after script changes.
- Use Godot Variant syntax for property strings when schemas require it, such as `Vector2(100, 200)`, `Vector3(1, 2, 3)`, `Color(1, 0, 0, 1)`, `true`, `false`, `42`, and `3.14`.
- Treat enum values as Godot expects them; check docs or existing properties when unsure.
- Do not over-promise runtime/game automation: runtime tools require an active `DevtoolRuntime` bridge.
- Do not overuse WebSocket: headless tools are usually better for deterministic authoring and reviewable changes.
- For compatibility routes, check `canonicalName` and `implementationStatus` from `get_capabilities` when behavior is unclear.

## Validate Before Finishing

Use the strongest relevant checks:

- `check_gdscript_syntax` for changed scripts.
- `run_project_checks` for project-level validation.
- `get_export_presets`, `check_export_presets`, `export_matrix`, or `generate_ci_snippet` for export work.
- `run_project` plus `get_debug_output` for runtime behavior.
- `plugin_status` plus a successful editor/runtime route receipt for live WebSocket behavior.

For this MCP package itself, use:

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:visualizer
npm.cmd run verify:plugin
npm.cmd run verify:all
```

Run build-heavy verifiers sequentially because they write the same build output. Summarize actual check results, including failures and skipped Godot-dependent checks.
