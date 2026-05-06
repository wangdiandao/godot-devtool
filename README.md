# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is a Godot 4 MCP server for AI-assisted project inspection, editing, validation, and runtime automation. Version 2.0 is designed as a stdio/headless MCP server with an optional localhost WebSocket bridge to a bundled Godot editor plugin.

## Architecture

```text
MCP client
  -> node build/index.js over stdio
  -> native/headless Godot tools
  -> optional ws://127.0.0.1:8766 bridge
  -> addons/godot_devtool editor plugin
  -> runtime autoload bridge
```

- The MCP server always runs over stdio.
- Native routes inspect and edit project files safely without the editor.
- Headless routes call Godot for scene/resource operations.
- Editor routes use the WebSocket plugin for live selection, Inspector property writes, UndoRedo, and plugin reload.
- Runtime routes use the autoload bridge for running-game scene tree, properties, input simulation, screenshots, and QA checks.

## Quick Start

### Prebuilt Package

Download the v2 package from GitHub Releases:

[godot-devtool-build-2.0.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.0.0/godot-devtool-build-2.0.0.zip)

Configure your MCP client:

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

`GODOT_PATH` can be omitted when Godot is already available in `PATH`.

### Build From Source

```bash
npm install
npm run build
```

The MCP server entry point is `build/index.js`. The bundled Godot addon is copied to `build/addons/godot_devtool`.

## Plugin Setup

Install the v2 WebSocket plugin into a Godot project:

```text
plugin_install
```

Required argument:

```json
{
  "projectPath": "E:/my-godot-project",
  "overwrite": true,
  "websocketPort": 8766
}
```

Then enable the plugin in Godot:

```text
Project > Project Settings > Plugins > godot-devtool
```

For runtime routes, the installer also registers:

```text
autoload/DevtoolRuntime = *res://addons/godot_devtool/runtime_bridge.gd
```

Use `plugin_status` to check installation and WebSocket connection state. Existing `install_editor_bridge` and `editor_bridge_status` names remain compatibility entries for older clients.

## Route Groups

Use `get_capabilities` first when unsure. Each tool reports `routeGroup`, `transport`, `riskLevel`, `requiresEditor`, and `requiresRuntime`.

Common route examples include `plugin_install`, `plugin_status`, `get_project_info`, `filesystem_read`, `resource_dependency_graph`, `generate_ci_snippet`, `get_safety_policy`, `create_scene`, `add_node`, `editor_inspector_set_properties`, and `get_game_scene_tree`.

| Route group | Transport | Use for |
| --- | --- | --- |
| `core` | `native` / `process_control` | Godot version, project launch, logs, server capabilities |
| `project` | `native` | `project.godot`, InputMap, autoloads, project metadata |
| `filesystem` | `native` | Project-local file listing, reading, writing, deletion preview |
| `resource` | `native` | Resource index, dependency graph, export presets, CI snippets |
| `script` | `native` / `headless_godot` | Script index, read/write, syntax checks |
| `scene` | `headless_godot` | Scenes, nodes, animation, tilemap, physics, navigation, audio |
| `visual` | `headless_godot` | Shader, material, lighting, particle, UI/theme workflows |
| `editor` | `editor_ws` | Live editor selection, Inspector, UndoRedo, plugin reload |
| `runtime` | `runtime_ws` | Running game scene tree, input, screenshots, runtime QA |

## Verification

Static and package checks:

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:v2:capabilities
npm.cmd run verify:v2:plugin
npm.cmd run verify:v2:runtime
```

Godot-backed checks require `GODOT_PATH`:

```bash
npm.cmd run verify:runtime
npm.cmd run check:project -- E:/test
```

## Skill

Agent operating guidance is bundled at:

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

The skill teaches assistants to inspect project state first, choose the right route group, install/use the WebSocket plugin only when live editor or runtime state is required, and validate changes before finishing.
