---
name: godot-devtool-runtime-test
description: "Use with godot-devtool for running Godot projects, runtime_ws game inspection, input simulation, screenshots, debug output, and run cleanup."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool Runtime Test

Load this when validating running-game behavior.

## Start

Request focused schema:

    get_capabilities { "workflow": "runtime_test", "includeSchemas": true }

Run and identify the target:

    run_project
    plugin_status
    list_run_instances
    list_bridge_sessions
    resolve_bridge_target

Pass `runId` or `sessionId` when more than one runtime matches.

## Runtime Proof Loop

Use a before/after state check:

1. `run_project { "projectPath": "...", "headless": true }`
2. Poll `plugin_status` until a runtime client is connected.
3. Read state with `get_game_scene_tree`, `get_game_node_properties`, or `get_game_screenshot`.
4. Simulate input with `simulate_action`, `simulate_key`, `simulate_mouse_click`, or `simulate_sequence`.
5. Read the same state again and compare.
6. Read `get_debug_output` for errors.
7. Stop with `stop_project` or `stop_run_instance`.

For movement and gameplay, prefer `simulate_action` over raw keys when the project has InputMap actions.

## Completion

After stopping, call `plugin_status`. Runtime clients should drop to zero and runtime-state should not remain actively connected. Treat stale connected state after exit as a bridge lifecycle bug.
