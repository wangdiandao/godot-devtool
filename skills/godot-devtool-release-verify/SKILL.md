---
name: godot-devtool-release-verify
description: "Use when changing or releasing the godot-devtool MCP package itself, including tool catalog, build output, Godot addon, docs, and local Skill sync."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool Release Verify

Load this when editing this MCP package rather than only using it on a Godot project.

## Required Static Gates

Run build-heavy verifiers sequentially:

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

For README tool table changes, run the generator after build and verify that English and Chinese tables stay in sync.

## API Regression

Use a real MCP stdio client or equivalent local MCP call chain:

    get_capabilities
    get_capabilities { "workflow": "live_editor", "includeSchemas": true }
    get_capabilities { "includeSchemas": true }

Default `get_capabilities` must remain lightweight, include workflow summaries, omit schemas, and reject unfiltered schema requests.

## Runtime And Dock Regression

Use `E:/test` or a fresh fixture:

    plugin_install
    plugin_status
    run_project
    get_game_node_properties
    simulate_action
    get_game_node_properties
    stop_project
    plugin_status

For editor validation, call `plugin_dock_status` and verify the structured `GDT` dock status instead of relying on editor screenshots.

## Local Skill Sync

After Skill edits:

    npm.cmd run sync:skill
    npm.cmd run verify:skill

The repo, build output, and installed Codex Skill copies must have matching version and content hashes.
