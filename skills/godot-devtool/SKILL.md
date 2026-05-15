---
name: godot-devtool
description: "Use when MCP clients and connected AI assistants work on a Godot 4 project through the godot-devtool 3.0.1 MCP server."
metadata:
  version: "3.0.1"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP

Compatibility: `godot-devtool` 3.0.1.

Tool catalog: All 234 tools are discoverable through `get_capabilities`. The default response is a lightweight index without input schemas. Request schemas only for the active `workflow`, `routeGroup`, exact `toolNames`, or another narrow filter with `includeSchemas: true`.

Use this skill when an AI assistant works on a Godot 4 project through `godot-devtool`.

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

## MCP Server Lifetime

Starting `godot-devtool` MCP is not a one-shot probe. Keep the `node E:/godot-devtool/build/index.js` MCP process running while the MCP client needs tools.

The MCP process does not bind `GODOT_DEVTOOL_WS_PORT` (default `8766`) at startup. Bridge-backed tools open the WebSocket bridge on demand. Editor-only calls release the listener in cleanup; a project launched through `run_project` or an already connected runtime client keeps the listener alive so `DevtoolRuntime` can stay connected.

In 3.0 the WebSocket listener is a shared broker. Multiple MCP clients or AI agents can use the same port; editor and runtime bridge clients are identified by `projectPath`, `context`, `sessionId`, and `runId`. When a target is ambiguous, call `list_bridge_sessions` or `resolve_bridge_target` and pass the chosen `sessionId` or `runId` instead of guessing.

Multiple game instances are tracked by `runId`. `run_project` returns the id, `list_run_instances` reports active and recent runs, and `get_debug_output`, `clear_debug_output`, `stop_project`, and `stop_run_instance` accept `runId` when more than one instance matches.

The `GDT` dock can briefly return to `Unregistered` between editor-only calls because the listener was intentionally closed. Runtime calls should stay registered while the `run_project` process is active or a runtime client is attached; if they do not, treat that as a runtime bridge lifecycle bug rather than proof from `plugin_status` alone.

If a bridge tool reports that the WebSocket bridge port is occupied, the stdio MCP server can still be available for native tools, `plugin_status`, and `plugin_cleanup_port`. Do not solve that by launching a second editor or picking a new port unless you intentionally want an isolated bridge and will reinstall/reload the plugin with the same `websocketPort`.

If the dock shows `Unregistered` or runtime state stops updating, check the listener before changing project code:

    plugin_status -> confirms installed plugin files, WebSocket port, and active bridge clients
    PowerShell: Get-NetTCPConnection -LocalPort 8766

Do not treat a short-lived `hello_ack` as persistent MCP availability. A successful probe only proves the handshake path; require a real `runtime_ws` command receipt for runtime success.

Distinguish the two live pieces:

    MCP stdio server -> the real tool server launched by the MCP client
    WebSocket bridge -> on-demand editor/runtime listener opened by bridge tools

A detached WebSocket keepalive can keep the dock registered for diagnosis, but it is not a replacement for real MCP tool calls. Use real MCP calls to prove tool availability.

If `GODOT_DEVTOOL_WS_PORT` is busy, identify the owner before changing code:

    PowerShell: Get-NetTCPConnection -LocalPort 8766 | Select-Object LocalAddress,LocalPort,State,OwningProcess
    fallback:   netstat -ano | Select-String ':8766'
    plugin_cleanup_port { "port": 8766 } -> dry-run inspect listener candidates
    plugin_cleanup_port { "port": 8766, "pid": <pid>, "kill": true } -> explicitly stop a verified stale godot-devtool listener

Stop only a listener you started. If the listener is the active `godot-devtool` MCP process for the already-open editor, keep using that same MCP session; a new MCP process cannot command editor clients connected to the old listener. If Windows cannot expose the command line, use `allowUnverified: true` only with the exact PID shown by the dry-run result.

## Context Budget Rules

- Start with `get_capabilities` for the lightweight catalog. Do not request schemas until you know the active workflow.
- Prefer workflow filters first: `project_setup`, `live_editor`, `runtime_test`, `multi_instance`, or `release_verify`.
- When schemas are needed, call `get_capabilities` with `includeSchemas: true` plus `routeGroup`, `transport`, `riskLevel`, `toolNames`, or `query`. Unfiltered schema requests are rejected.
- Keep only the active workflow in context. Do not paste the complete tool catalog, generated README tables, or Godot source unless the task needs internal Godot behavior.
- Prefer primary operation tools. Use older route names only when an existing client, prompt, or project already depends on them.
- When the task changes domains, call `get_capabilities` again for that domain instead of carrying unrelated schema details forward.

## First Calls

Always begin with:

    get_godot_version -> confirm Godot is visible to the MCP server
    get_capabilities  -> discover current tools, route groups, transports, and bridge requirements

Then request focused schemas only when needed:

    get_capabilities { "routeGroup": "scene", "includeSchemas": true }
    get_capabilities { "toolNames": ["plugin_install", "plugin_status", "plugin_cleanup_port"], "includeSchemas": true }

Then inspect the project before editing:

    get_project_info          -> project metadata and paths
    filesystem_list          -> focused folder tree
    get_resource_index       -> scenes, resources, textures, audio
    get_script_index         -> GDScript classes, exports, functions
    project_get_settings     -> project.godot sections or keys
    resource_dependency_graph -> dependencies and orphan resources

If the project path is unknown:

    list_projects -> find Godot projects under a directory

## Transport Choice

The MCP client talks to `godot-devtool` over stdio. Choose the operation transport by state needed:

    native          -> file, project, index, dependency, safety, audit
    headless_godot  -> scene/resource/script operations Godot must parse or serialize
    process_control -> launch, stop, export, project checks, debug output
    editor_ws       -> live editor selection, Inspector, UndoRedo scene edits, scene save, plugin reload
    runtime_ws      -> running-game scene tree, input, screenshots, runtime properties, QA

Default to native/headless. Use WebSocket only when current editor or running game state is required.

Before editor or runtime WebSocket work:

    plugin_install -> install addons/godot_devtool and runtime autoload into the project
    plugin_status  -> confirm plugin files, autoload, port, and bridge clients
    plugin_reload  -> reload the live editor plugin when the editor is open
    plugin_cleanup_port -> explicitly inspect or stop stale bridge port listeners

For a read-only browser status surface:

    browser_visualizer_start  -> start the Browser visualizer
    browser_visualizer_status -> inspect URL, port, and current status
    browser_visualizer_stop   -> stop the visualizer

`editor_ws` needs the Godot editor open with the plugin enabled. `runtime_ws` needs the game running with `DevtoolRuntime` connected.

## Fresh Install Connection Smoke

When validating an install, upgrade, bridge bug, dock state, or runtime input issue, use a fresh temporary Godot project when possible. This separates install bugs from target-project state.

Run the chain through an actual MCP stdio client, not only a raw WebSocket probe:

1. `get_godot_version` -> confirms the MCP process can see Godot.
2. `get_capabilities` -> confirms the lightweight tool catalog and bridge requirements.
3. `plugin_install` with `{ "projectPath": "...", "overwrite": true, "websocketPort": 8766 }`.
4. `plugin_status` -> require `installed: true`, matching bridge port, runtime autoload, and no unexpected stale state.
5. `run_project` with `{ "projectPath": "...", "headless": true }` for runtime validation.
6. Poll `plugin_status` until `lastState.websocket.clients` contains a `runtime` client.
7. Prove runtime commands with `get_game_node_properties`, `simulate_action`, then `get_game_node_properties` again.
8. `stop_project`.

For input proof, read a property before and after the input instead of relying only on screenshots. A minimal fixture can increment an exported counter in `_process()` while `Input.is_action_pressed("ui_accept")`; `simulate_action` should make that counter increase.

For an existing target project such as `E:/test`, verify the installed copy directly after sync:

    plugin_status
    npm.cmd run check:project -- "E:/test"
    Select-String -Path E:\test\addons\godot_devtool\plugin.gd,E:\test\addons\godot_devtool\runtime_bridge.gd -Pattern 'PLUGIN_VERSION'

If the dock still shows `Unregistered`, check the current listener and project bridge config before editing plugin code:

    Get-Content E:\test\.godot-devtool\bridge-config.json
    Get-Content E:\test\.godot-devtool\runtime-state.json
    netstat -ano | Select-String ':8766'

`hello_ack` plus `heartbeat_ack` proves auth and the bridge listener. It does not prove the MCP tool server is usable unless the same run also completed MCP tool calls.

## Workflow Router

Use one workflow group at a time. If a needed operation is not listed here, query `get_capabilities` for that category and load only that schema.

### Explore A Project

Use this before planning or editing:

    get_project_info, filesystem_list, filesystem_read
    get_resource_index, get_script_index, project_get_settings
    scene_open, get_scene_tree, node_find, node_get, get_node_properties

### Build Or Edit Scenes

Use headless scene tools for saved scene authoring:

    create_scene, scene_open, add_node, update_node_properties
    node_move, rename_node, node_duplicate, delete_node, save_scene
    resource_create, load_sprite, material, shader

Use live editor tools when the scene is already open in Godot and the user expects the editor to update without a disk reload:

    editor_add_node, editor_delete_node, editor_rename_node
    editor_move_node, editor_duplicate_node, editor_save_scene
    editor_inspector_get_properties, editor_inspector_set_properties

Existing node mutation tools can also use `mode: "editor_live"` with `autoSave` when the open editor scene should be modified through UndoRedo instead of rewriting the scene file headlessly.

Prefer Inspector-visible node/resource properties for visual values, tuning values, materials, collision masks, anchors, margins, visibility, and exported values.

### Write Scripts

Read first, edit the smallest safe region, then validate:

    get_script_index, read_script_file, script_create, script_write
    script_attach, analyze_script_references, check_gdscript_syntax
    reload_project

Use GDScript for behavior. Move hardcoded visual/tuning values into scene or resource properties when possible.

### Configure The Project

Use project tools instead of hand-editing `project.godot`:

    project_get_settings, project_set_setting, project_input_action
    get_autoload, add_autoload, remove_autoload
    get_export_presets, check_export_presets, update_export_preset
    export_matrix, generate_ci_snippet, export_project

### Playtest And Debug

Use process control plus runtime WebSocket tools:

    run_project, plugin_status, get_game_scene_tree, get_game_screenshot
    get_game_node_properties, set_game_node_property
    simulate_action, simulate_key, simulate_mouse_click, simulate_sequence
    get_debug_output, get_editor_errors, stop_project

Proof loop:

1. `run_project`.
2. Confirm runtime bridge with `plugin_status` if using runtime tools.
3. Capture the relevant state: screenshot, scene tree, node properties, or debug output.
4. Simulate input with `simulate_action` when InputMap actions exist.
5. Read state again with `get_game_node_properties` or assertions.
6. Stop the run, fix, and repeat.

Do not claim live editor/runtime behavior worked unless the WebSocket route returned a real result or receipt.

For runtime input specifically, capture a before/after state change. A successful command receipt is necessary, but the stronger proof is that the game state changed as expected after the input.

### UI, Animation, TileMap, Audio, 3D

Use the domain tool first, then query `get_capabilities` for that domain's filtered schema:

    ui        -> Control nodes, themes, templates, signal wiring, screen text checks
    animation -> AnimationPlayer tracks, keyframes, AnimationTree state machines
    tilemap   -> TileSet sources, cells, batch painting, fill rectangles, templates
    audio     -> players, buses, volume/mute/solo, bus effects
    lighting  -> lights and WorldEnvironment
    physics   -> bodies, areas, collision layers, shapes
    navigation -> nav regions, agents, bake/query/debug operations

For TileMap work, inspect tile sources before painting and prefer batch operations for large regions.

### Analysis And QA

Use focused diagnostics before broad changes:

    run_project_checks, get_debug_output, clear_debug_output
    get_editor_errors, get_performance_monitors
    analyze_scene_complexity, analyze_signal_flow
    detect_circular_dependencies, find_unused_resources
    find_node_references, find_script_references, get_scene_dependencies
    run_test_scenario, assert_node_state, assert_screen_text
    wait_for_node, monitor_properties, compare_screenshots

## Common Build Order

For a new game or prototype:

1. Project setup: settings, InputMap, main scene.
2. Player: scene, collision, script, camera.
3. World: TileMap or 3D geometry, lighting, physics, navigation.
4. UI: Control nodes, theme, signals.
5. Game logic: scripts, autoloads, groups, signals.
6. Audio and feedback: audio, animation, particles, shaders/materials.
7. Playtest: run, simulate input, inspect state, read debug output.
8. Export: presets, export matrix, export command.

## Important Rules

- Read state before writing.
- Prefer structured tools over raw file edits.
- Save scenes after meaningful scene changes. For live editor edits, either let the user save in Godot, pass `autoSave: true`, or call `editor_save_scene`; the dock intentionally does not add a constant Save Scene button.
- Run `check_gdscript_syntax` after script changes.
- Run `run_project_checks` for project-level validation.
- Use `filesystem_preview_delete` before delete operations unless the user explicitly named the exact path and asked to delete it.
- Runtime tools require an active running game and connected `DevtoolRuntime`.
- Editor WebSocket tools require the editor plugin to be enabled and connected.
- For runtime movement, prefer `simulate_action` over raw keys when InputMap actions exist.
- UI buttons usually need press and release; use click helpers or `simulate_mouse_click` with release behavior.

## Property Values

Use structured Godot Variant values when schemas accept them:

    Vector2 -> { "type": "Vector2", "value": [100, 200] }
    Vector3 -> { "type": "Vector3", "value": [1, 2, 3] }
    Color   -> { "type": "Color", "value": [1, 0, 0, 1] }
    bool    -> true / false
    number  -> 42 / 3.14
    enum    -> integer value expected by Godot

If a string-only route is required, Godot-style strings such as `Vector2(100, 200)`, `Vector3(1, 2, 3)`, and `Color(1, 0, 0, 1)` are acceptable.

## Validate Before Finishing

For a Godot project change, choose the smallest validation set that proves the changed behavior:

    check_gdscript_syntax -> changed scripts
    run_project_checks    -> project-level checks
    run_project           -> smoke/run validation
    get_debug_output      -> runtime errors and warnings
    plugin_status         -> editor/runtime bridge status
    get_game_screenshot   -> visual runtime evidence when runtime bridge is connected

For this MCP package itself, run build-heavy verifiers sequentially because they write the same build output:

    npm.cmd run build
    npm.cmd run verify:tools
    npm.cmd run verify:gdscripts
    npm.cmd run verify:visualizer
    npm.cmd run verify:plugin
    npm.cmd run verify:all

After a development branch passes the required verification gates, merge it into `main` before treating that branch as complete.
