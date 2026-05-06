---
name: godot-devtool
description: "Teach MCP clients and connected AI assistants how to use the godot-devtool 2.3 MCP server for Godot 4 projects: inspect first, choose the right route group, use the WebSocket plugin only for live editor/runtime state, and verify changes."
metadata:
  version: "2.3.2"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP

Use this skill when an MCP client or connected AI assistant is working with a Godot 4 project through `godot-devtool`.

Compatibility: `godot-devtool` 2.3.2.

## Setup

Run the stdio MCP server:

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

`GODOT_PATH` is required for headless Godot validation unless Godot is already in `PATH`.

## Start Every Task

1. Confirm the server and tools:
   - `get_godot_version`
   - `get_capabilities`
2. Establish project state before edits:
   - `get_project_info`
   - `get_resource_index`
   - `get_script_index`
   - `resource_dependency_graph` when dependencies matter
3. If the project path is unknown, call `list_projects` or ask for the path.

Do not edit blindly. Read the relevant scene, node, script, resource, or runtime state first.

## Choose The Route

`get_capabilities` reports `routeGroup`, `transport`, `riskLevel`, `requiresEditor`, and `requiresRuntime`.

- `core`: Godot version, run/stop project, debug output, tool discovery.
- `project`: `project.godot`, InputMap, autoloads, project metadata.
- `filesystem`: project-local list/read/write/delete preview.
- `resource`: resource index, dependency graph, export presets, CI snippets.
- `script`: script index/read/write/attach/syntax checks.
- `scene`: scene and node creation, node movement, animation, tilemap, physics, navigation, audio.
- `visual`: shader, material, lighting, particle, UI/theme.
- `editor`: live editor selection, Inspector, UndoRedo, plugin reload through WebSocket.
- `runtime`: running-game scene tree, input simulation, screenshots, property reads/writes, QA through WebSocket.

Transports named by capabilities include `native`, `headless_godot`, `process_control`, `editor_ws`, and `runtime_ws`.

Prefer native or headless tools unless the task truly needs live editor or running-game state.

## Plugin And Runtime Bridge

Install the Godot plugin only when live editor or runtime state is needed:

- `plugin_install` to install `addons/godot_devtool` and the runtime autoload.
- `plugin_status` to confirm installation and WebSocket connection state.
- `plugin_reload` to ask the live plugin to reload.

Compatibility names remain available:

- `install_editor_bridge` -> `plugin_install`
- `editor_bridge_status` -> `plugin_status`
- `reload_plugin` -> `plugin_reload`

After `plugin_install`, enable the plugin in Godot:

```text
Project > Project Settings > Plugins > godot-devtool
```

For runtime routes, run the project so the `DevtoolRuntime` autoload can connect to the WebSocket bridge.

## Common Workflows

### Inspect A Project

Use `get_project_info`, `get_resource_index`, `get_script_index`, `filesystem_list`, `filesystem_read`, and `resource_dependency_graph`.

### Edit Scenes And Nodes

Prefer structured scene/node tools over raw `.tscn` edits:

- `create_scene`, `scene_open`, `get_scene_tree`, `save_scene`
- `add_node`, `delete_node`, `rename_node`, `node_get`, `node_find`
- `node_get_property`, `node_set_property`, `node_move`, `node_duplicate`

Save scenes when changes should persist.

### Write Scripts

Read or index scripts before editing. Use `script_create`, `script_write`, `script_attach`, `read_script_file`, and `check_gdscript_syntax`.

### Use The Live Editor

Use editor WebSocket routes for live state:

- `editor_get_selection`
- `editor_select_node`
- `editor_undo_redo`
- `editor_inspector_get_properties`
- `editor_inspector_set_properties`

Editor mutations should use UndoRedo-backed routes.

### Use Running Runtime State

Use runtime WebSocket routes only after the project is running:

- `get_game_scene_tree`
- `get_game_node_properties`
- `set_game_node_property`
- `simulate_action`, `simulate_key`, `simulate_mouse_click`, `simulate_sequence`
- `get_game_screenshot`, `capture_frames`
- `run_test_scenario`, `assert_node_state`, `assert_screen_text`

If a runtime route reports no active runtime bridge, start or focus the Godot project and retry.

## Safety Rules

- Read state before writing.
- Prefer structured MCP tools over raw file edits.
- Use dry-run, preview, or audit-capable tools for broad changes.
- Do not delete without `filesystem_preview_delete` unless the user explicitly named the exact path.
- Do not claim runtime/editor behavior worked unless the corresponding WebSocket route returned a real receipt.

## Validate Before Finishing

Use the strongest relevant checks:

- `check_gdscript_syntax` for changed scripts.
- `run_project_checks` for project-level validation.
- `get_export_presets`, `check_export_presets`, `export_matrix`, or `generate_ci_snippet` for export work.
- `run_project` plus `get_debug_output` for runtime behavior.

For this MCP package itself, use:

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:plugin
npm.cmd run verify:all
```

Summarize actual check results, including failures and skipped Godot-dependent checks.
