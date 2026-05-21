---
name: godot-devtool
description: "Use when MCP clients and connected AI assistants work on a Godot 4 project through the godot-devtool 3.1.0 MCP server."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP Router

Compatibility: `godot-devtool` 3.1.0.

Tool catalog: All 235 tools are discoverable through `get_capabilities`. The default response is a lightweight index without input schemas. Request schemas only for the active `workflow`, `routeGroup`, exact `toolNames`, or another narrow filter with `includeSchemas: true`. Unfiltered schema requests are rejected.

Use this entry skill first. Then keep only the matching domain skill in context:

- `godot-devtool-project-setup`: install or upgrade the addon, inspect projects, configure InputMap/autoload/export settings.
- `godot-devtool-live-editor`: use the open Godot editor through `editor_ws`, including selection, Inspector, UndoRedo edits, Dock status, and `editor_save_scene`.
- `godot-devtool-runtime-test`: run the game, prove runtime bridge state through `runtime_ws`, simulate input, inspect node properties, and stop runs.
- `godot-devtool-scene-authoring`: author scenes/resources/scripts with native and headless Godot tools such as `add_node`, `get_node_properties`, and `update_node_properties`.
- `godot-devtool-release-verify`: validate this MCP package, docs, build output, and local Skill sync before release.

## Client Setup

Typical local release-zip MCP client configuration:

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

Codex Desktop uses TOML in `config.toml`:

```toml
[mcp_servers.godot-devtool]
command = "node"
args = ["E:/godot-devtool/build/index.js"]
env = { GODOT_PATH = "D:/Program Files/Godot/Godot_v4.x.exe", GODOT_DEVTOOL_WS_PORT = "8766" }
```

## First Calls

Always begin with:

    get_godot_version -> confirm Godot is visible to the MCP server
    get_capabilities  -> discover tools, workflows, route groups, transports, and bridge requirements

Then choose one focused schema surface:

    get_capabilities { "workflow": "project_setup", "includeSchemas": true }
    get_capabilities { "workflow": "live_editor", "includeSchemas": true }
    get_capabilities { "workflow": "runtime_test", "includeSchemas": true }
    get_capabilities { "routeGroup": "scene", "includeSchemas": true }
    get_capabilities { "toolNames": ["plugin_install", "plugin_status", "plugin_cleanup_port"], "includeSchemas": true }

Keep only the active workflow in context. When the task changes domains, call `get_capabilities` again for that domain instead of carrying unrelated schema details forward.

## Transport Choice

The MCP client talks to `godot-devtool` over stdio. Choose the operation transport by state needed:

    native          -> file, project, index, dependency, safety, audit
    headless_godot  -> saved scene/resource/script operations Godot must parse or serialize
    process_control -> launch, stop, export, project checks, debug output
    editor_ws       -> live editor selection, Inspector, UndoRedo scene edits, Dock status, plugin reload
    runtime_ws      -> running-game scene tree, input, screenshots, runtime properties, QA

Default to native/headless. Use WebSocket only when current editor state or running game state is required.

## Bridge Lifetime

Starting `godot-devtool` MCP is not a one-shot probe. Keep the `node E:/godot-devtool/build/index.js` MCP process running while the MCP client needs tools.

The stdio MCP process does not bind `GODOT_DEVTOOL_WS_PORT` at startup. Bridge-backed tools open the WebSocket bridge on demand. Editor-only calls release the listener in cleanup; `run_project` or an already connected runtime client keeps the listener alive so `DevtoolRuntime` can stay connected.

In 3.0 the WebSocket listener is a shared broker. Multiple MCP clients or AI agents can use the same port; editor and runtime bridge clients are identified by `projectPath`, `context`, `sessionId`, and `runId`. When a target is ambiguous, call `list_bridge_sessions` or `resolve_bridge_target` and pass the chosen `sessionId` or `runId`.

Multiple game instances are tracked by `runId`. `run_project` returns the id, `list_run_instances` reports active and recent runs, and `get_debug_output`, `clear_debug_output`, `stop_project`, and `stop_run_instance` accept `runId` when more than one instance matches.

If a bridge tool reports that the WebSocket bridge port is occupied, identify the owner before changing ports or launching another editor:

    plugin_status
    plugin_cleanup_port { "port": 8766 }
    PowerShell: Get-NetTCPConnection -LocalPort 8766

Stop only a listener you started. If the listener is the active `godot-devtool` MCP process for the already-open editor, keep using that same MCP session; a new MCP process cannot command editor clients connected to the old listener.

## Workflow Router

Project setup:

    plugin_install, plugin_status, plugin_cleanup_port
    get_project_info, project_get_settings, project_set_setting
    project_input_action, get_autoload, add_autoload, remove_autoload
    get_export_presets, check_export_presets, update_export_preset

Live editor:

    plugin_status, plugin_reload, plugin_dock_status
    editor_get_selection, editor_select_node
    editor_inspector_get_properties, editor_inspector_set_properties
    editor_add_node, editor_delete_node, editor_rename_node
    editor_move_node, editor_duplicate_node, editor_save_scene

Existing node mutation tools can also use `mode: "editor_live"` with `autoSave` when the open editor scene should be modified through UndoRedo instead of rewriting the scene file headlessly.

Runtime test:

    run_project, plugin_status, list_run_instances, list_bridge_sessions
    resolve_bridge_target, get_game_scene_tree, get_game_node_properties
    set_game_node_property, simulate_action, simulate_key, simulate_sequence
    get_game_screenshot, get_debug_output, stop_project, stop_run_instance

Scene authoring:

    filesystem_list, filesystem_read, get_resource_index, get_script_index
    scene_open, create_scene, add_node, update_node_properties
    get_node_properties, node_move, rename_node, node_duplicate, delete_node
    save_scene, resource_create, load_sprite, material, shader

Browser/status surface:

    browser_visualizer_start, browser_visualizer_status, browser_visualizer_stop

## Proof Rules

Read state before writing. Prefer structured tools over raw file edits. Save scenes after meaningful scene changes. For live editor edits, pass `autoSave: true` or call `editor_save_scene` when persistence is required.

Do not claim live editor/runtime behavior worked unless the WebSocket route returned a real result or receipt. For runtime input, capture state before and after input; a `simulate_action` receipt is necessary, but stronger proof is that `get_game_node_properties` changed as expected.

Use `run_project_checks` for project-level validation before finishing broad setup, export, or release work.

Use `plugin_dock_status` as the machine-readable Dock proof when editor screenshots are unavailable. It should report the `GDT` dock labels, tooltips, status-dot levels/colors, button text, visibility, and editor/runtime diagnostics.

For this MCP package itself, run build-heavy verifiers sequentially because they write the same build output:

    npm.cmd run build
    npm.cmd run verify:tools
    npm.cmd run verify:skill
    npm.cmd run verify:gdscripts
    npm.cmd run verify:visualizer
    npm.cmd run verify:plugin
    npm.cmd run verify:runtime
    npm.cmd run verify:process
    npm.cmd run verify:security
    npm.cmd run verify:all

After local Skill changes:

    npm.cmd run sync:skill
    npm.cmd run verify:skill

After a development branch passes the required verification gates, merge it into `main` before treating that branch as complete.
