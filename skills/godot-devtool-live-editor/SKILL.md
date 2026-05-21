---
name: godot-devtool-live-editor
description: "Use with godot-devtool for live Godot editor operations through editor_ws, including selection, Inspector edits, UndoRedo scene changes, Dock status, and plugin reload."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool Live Editor

Load this when the user expects the open Godot editor to update directly.

## Start

Request focused schema:

    get_capabilities { "workflow": "live_editor", "includeSchemas": true }

Then confirm editor state:

    plugin_status
    list_bridge_sessions { "projectPath": "...", "context": "editor" }
    plugin_dock_status

If no editor client is connected, use `launch_editor` or ask the user to open Godot, then `plugin_reload` after addon changes.

## Tools

Read state:

    plugin_status
    plugin_dock_status
    editor_get_selection
    editor_inspector_get_properties

Modify the open scene through UndoRedo:

    editor_select_node
    editor_inspector_set_properties
    editor_add_node
    editor_delete_node
    editor_rename_node
    editor_move_node
    editor_duplicate_node
    editor_save_scene

Existing scene/node tools may use `mode: "editor_live"` with `autoSave` when the open editor scene must change without a disk reload.

## Proof

Use `plugin_dock_status` as the machine-readable substitute when editor screenshots are unavailable. Verify labels for MCP Server, Editor Bridge, Runtime Bridge, Connection, Current Scene, Selection, Activity, Reconnect, and Refresh.

Do not infer success from a connected dock alone. A live edit is proven by a completed editor receipt plus a follow-up read such as `editor_get_selection`, `editor_inspector_get_properties`, or `plugin_dock_status`.
