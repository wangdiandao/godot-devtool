# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is a Godot 4 MCP server for AI-assisted project inspection, editing, validation, and runtime automation. Version 2.2 keeps the stdio/headless MCP server plus optional localhost WebSocket bridge architecture, and expands the README into a practical install and capability guide.

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
- Native routes inspect and edit project files without opening the editor.
- Headless routes call Godot for scene/resource/script operations.
- Editor routes use the bundled WebSocket plugin for live selection, Inspector writes, UndoRedo, and plugin reload.
- Runtime routes use the installed autoload bridge for running-game scene tree, properties, input simulation, screenshots, and QA checks.

## Requirements

- Node.js 18 or newer.
- Godot 4.x. Set `GODOT_PATH` unless `godot` is already on `PATH`.
- An MCP client such as Codex, Claude Code, Cursor, Cline, Roo Code, VS Code Copilot, or another client that can launch stdio MCP servers.
- A Godot project containing `project.godot`.

## Install From Release Zip

1. Download the release build:

   [godot-devtool-build-2.2.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.2.0/godot-devtool-build-2.2.0.zip)

2. Extract it to a stable path, for example:

   ```powershell
   Expand-Archive .\godot-devtool-build-2.2.0.zip E:\godot-devtool -Force
   ```

3. Confirm the server entry exists:

   ```powershell
   Test-Path E:\godot-devtool\build\index.js
   Test-Path E:\godot-devtool\build\addons\godot_devtool\plugin.gd
   ```

4. Add this MCP server to your client configuration:

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

5. Restart the MCP client and ask it to call:

   ```text
   get_godot_version
   get_capabilities
   ```

`GODOT_DEVTOOL_WS_PORT` defaults to `8766`. Change it only if that port is already in use.

## Build From Source

```bash
git clone https://github.com/wangdiandao/godot-devtool.git
cd godot-devtool
npm install
npm run build
```

Use `build/index.js` as the MCP server entry. The bundled Godot addon is copied into `build/addons/godot_devtool` during `npm run build`.

## Install The Godot Plugin

The plugin is included in the release/build package. It still must be installed into each Godot project that needs live editor or runtime routes.

1. Start your MCP client with `godot-devtool` configured.
2. Ask the AI or call the tool directly:

   ```text
   plugin_install
   ```

   Arguments:

   ```json
   {
     "projectPath": "E:/my-godot-project",
     "overwrite": true,
     "websocketPort": 8766
   }
   ```

3. Open the Godot project.
4. Enable the plugin:

   ```text
   Project > Project Settings > Plugins > godot-devtool > Enable
   ```

5. Check installation and connection:

   ```text
   plugin_status
   ```

For runtime routes, `plugin_install` also registers:

```text
autoload/DevtoolRuntime = *res://addons/godot_devtool/runtime_bridge.gd
```

Run the project from Godot before using `runtime_ws` tools. The editor plugin connects while the editor is open; the runtime bridge connects while the game is running.

Compatibility names remain available:

- `install_editor_bridge` -> `plugin_install`
- `editor_bridge_status` -> `plugin_status`
- `reload_plugin` -> `plugin_reload`

## Ask AI To Install It

After adding the MCP server to your client, you can paste this prompt into the AI assistant:

```text
Use the godot-devtool MCP server to install and verify the Godot plugin for my project.

Project path: E:/my-godot-project
WebSocket port: 8766

Steps:
1. Call get_godot_version and get_capabilities.
2. Confirm plugin_install, plugin_status, and plugin_reload are available.
3. Call plugin_install with overwrite=true for the project path above.
4. Call plugin_status and summarize installed files, autoload registration, bridge mode, and WebSocket port.
5. Tell me exactly how to enable the plugin in Godot.
6. If runtime routes are needed, tell me to run the project and then verify runtime bridge status.
Do not edit unrelated files.
```

Chinese prompt:

```text
请使用 godot-devtool MCP server 帮我安装并验收 Godot 插件。

项目路径：E:/my-godot-project
WebSocket 端口：8766

步骤：
1. 调用 get_godot_version 和 get_capabilities。
2. 确认 plugin_install、plugin_status、plugin_reload 可用。
3. 对上述项目路径调用 plugin_install，overwrite=true。
4. 调用 plugin_status，总结已安装文件、autoload 注册、bridge mode 和 WebSocket 端口。
5. 告诉我在 Godot 编辑器里如何启用插件。
6. 如果需要 runtime 路由，提醒我运行项目后再验证 runtime bridge 状态。
不要修改无关文件。
```

## What It Can Do

Use `get_capabilities` as the source of truth. Every tool reports `routeGroup`, `transport`, `riskLevel`, `requiresEditor`, `requiresRuntime`, and `canonicalName`.

The feature display references the public [godot-mcp-pro README](https://github.com/youichi-uda/godot-mcp-pro/tree/master) only in presentation style: capabilities are grouped in tables, and each group maps directly to its description.

| Group | Transport | Main capabilities |
| --- | --- | --- |
| `core` | `native` / `process_control` | Godot version detection, launch/stop project, debug output, capability discovery |
| `project` | `native` | Project metadata, project settings, InputMap, autoloads, resource/script indexes, export presets, CI snippets, safety policy, project checks |
| `filesystem` | `native` | Project-local file list/read/write/delete preview/delete with path validation |
| `resource` | `native` | Load/create/save `.tres` resources, dependency graph, resource preview |
| `script` | `native` / `headless_godot` | Script create/read/write/attach, project script index, GDScript syntax checks |
| `scene` | `headless_godot` | Scene open/create/save, scene tree inspection, node add/delete/rename/move/duplicate, node properties |
| `node` | `headless_godot` | Node lookup, property inspection, property updates, sprite loading, MeshLibrary export |
| `visual` | `headless_godot` | Shader, material, lighting, particles, 3D meshes, camera/environment setup |
| `editor` | `editor_ws` | Live editor selection, selecting nodes, Inspector reads/writes, UndoRedo, plugin reload |
| `runtime` | `runtime_ws` | Running-game scene tree, node properties, property writes, input simulation, screenshots, frame capture |
| `animation` | `headless_godot` | AnimationPlayer creation, animation listing, tracks, keyframes, removal |
| `tilemap` | `headless_godot` | Set/fill/query/clear TileMap cells, inspect used cells and tile data |
| `ui/theme` | `headless_godot` | Theme resources, colors, constants, font sizes, StyleBoxFlat values, UI element discovery |
| `physics` | `headless_godot` | Physics bodies, collision shapes, layer/mask setup, collision info, RayCast nodes |
| `navigation` | `headless_godot` / `runtime_ws` | NavigationRegion/NavigationAgent setup, bake configuration, path helpers |
| `audio` | `headless_godot` | Audio players, bus layout inspection, bus/effect setup, audio node info |
| `analysis/qa` | `native` / `runtime_ws` | Scene complexity, signal flow, unused resources, project statistics, assertions, screenshot comparison, stress reports |
| `compatibility` | mixed | Existing legacy tool names and aliases mapped to canonical executable routes |

Common tools include:

- Project: `get_project_info`, `project_get_settings`, `project_set_setting`, `project_input_action`, `run_project_checks`.
- Files/resources: `filesystem_list`, `filesystem_read`, `filesystem_write`, `filesystem_preview_delete`, `resource_dependency_graph`, `resource_create`.
- Scripts: `get_script_index`, `read_script_file`, `script_create`, `script_write`, `script_attach`, `check_gdscript_syntax`.
- Scenes/nodes: `create_scene`, `scene_open`, `get_scene_tree`, `add_node`, `delete_node`, `rename_node`, `node_find`, `node_get`, `node_move`.
- Live editor: `plugin_install`, `plugin_status`, `plugin_reload`, `editor_get_selection`, `editor_select_node`, `editor_inspector_get_properties`, `editor_inspector_set_properties`.
- Runtime: `get_game_scene_tree`, `get_game_node_properties`, `set_game_node_property`, `simulate_action`, `simulate_key`, `simulate_mouse_click`, `get_game_screenshot`, `assert_node_state`.
- Export/safety: `get_export_presets`, `check_export_presets`, `export_matrix`, `generate_ci_snippet`, `get_safety_policy`, `set_safety_policy`, `get_audit_replay`, `get_rollback_suggestions`.

## Which Route Should I Use?

- Use `native` routes for project inspection, file edits, settings, indexes, safety policy, and dependency checks.
- Use `headless_godot` routes when Godot must load or mutate scenes/resources/scripts correctly.
- Use `editor_ws` only when the current open editor state matters.
- Use `runtime_ws` only after the game is running and you need live game state, input, screenshots, or QA assertions.
- Use `get_capabilities` before automating unfamiliar workflows.

## Verification

Static and package checks:

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:plugin
npm.cmd run verify:all
```

Godot-backed checks require `GODOT_PATH`:

```bash
npm.cmd run verify:runtime
npm.cmd run check:project -- E:/test
```

## Troubleshooting

- `get_godot_version` fails: set `GODOT_PATH` to the exact Godot executable.
- `plugin_status` says not installed: run `plugin_install` for the correct project path.
- Editor routes time out: open the project in Godot and enable the plugin.
- Runtime routes time out: run the game so the `DevtoolRuntime` autoload can connect.
- Port conflict: change `GODOT_DEVTOOL_WS_PORT` and reinstall with the same `websocketPort`.
- MCP client cannot start the server: confirm `node` is available and `build/index.js` exists.

## Skill

Agent operating guidance is bundled at:

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

The skill teaches assistants to inspect project state first, choose the right route group, install/use the WebSocket plugin only when live editor or runtime state is required, and validate changes before finishing.
