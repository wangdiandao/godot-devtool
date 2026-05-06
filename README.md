# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.3.1-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is a Godot 4 MCP server for AI-assisted project inspection, editing, validation, and runtime automation. Version 2.3.1 keeps the stdio/headless MCP server plus optional localhost WebSocket bridge architecture, and adds a compact `GDT` editor dock with bilingual status display.

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

   [godot-devtool-build-2.3.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.3.1/godot-devtool-build-2.3.1.zip)

2. Extract it to a stable path, for example:

   ```powershell
   Expand-Archive .\godot-devtool-build-2.3.1.zip E:\godot-devtool -Force
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

## All 249 Tools

### Project Tools (23)
| Tool | Description |
|------|-------------|
| `add_autoload` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `export_project` | Run a controlled Godot export for a configured preset |
| `get_autoload` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_input_actions` | Executable compatibility wrapper for project_input_action. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_project_info` | Retrieve metadata about a Godot project |
| `get_project_settings` | Compatibility alias for project_get_settings. Read Godot project.godot settings by section or section/key list |
| `get_project_statistics` | Executable compatibility wrapper for get_project_info. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `list_projects` | List Godot projects in a directory |
| `play_scene` | Compatibility alias for run_project. Run the Godot project and capture output |
| `project_get_info` | Compatibility alias for get_project_info. Retrieve metadata about a Godot project |
| `project_get_settings` | Read Godot project.godot settings by section or section/key list |
| `project_input_action` | List or update project InputMap actions in project.godot |
| `project_set_setting` | Update Godot project.godot settings with dry-run preview and audit logging |
| `reload_project` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `remove_autoload` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `run_project` | Run the Godot project and capture output |
| `run_project_checks` | Run stable project checks for CI, review, and release workflows |
| `set_input_action` | Executable compatibility wrapper for project_input_action. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_project_setting` | Compatibility alias for project_set_setting. Update Godot project.godot settings with dry-run preview and audit logging |
| `stop_project` | Stop the currently running Godot project |
| `stop_scene` | Compatibility alias for stop_project. Stop the currently running Godot project |
| `uid_to_project_path` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `update_project_uids` | Update UID references in a Godot project by resaving resources (for Godot 4.4+) |

### Scene Tools (55)
| Tool | Description |
|------|-------------|
| `add_animation_track` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_audio_bus` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_audio_bus_effect` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_audio_player` | Executable compatibility wrapper for audio. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_scene_instance` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `analyze_scene_complexity` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `analyze_signal_flow` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `animation` | Create, inspect, remove, and edit AnimationPlayer tracks and keyframes |
| `animation_state_machine` | Create, inspect, and configure AnimationTree state machines |
| `audio` | Create and list AudioStreamPlayer nodes with basic playback configuration |
| `bake_navigation_mesh` | Executable compatibility wrapper for navigation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `connect_signal` | Executable compatibility wrapper for signal. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_animation` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_animation_tree` | Executable compatibility wrapper for animation_state_machine. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_scene` | Create a new Godot scene file |
| `cross_scene_set_property` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `disconnect_signal` | Executable compatibility wrapper for signal. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_signal_connections` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_animation_info` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_animation_tree_structure` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_audio_bus_layout` | Executable compatibility wrapper for audio. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_audio_info` | Executable compatibility wrapper for audio. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_collision_info` | Executable compatibility wrapper for physics. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_navigation_info` | Executable compatibility wrapper for navigation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_physics_layers` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_scene_dependencies` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_scene_tree` | Return the node tree for a Godot scene |
| `get_signals` | Executable compatibility wrapper for signal. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `list_animations` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `navigation` | Create, inspect, configure, bake, query, and debug NavigationRegion and NavigationAgent nodes |
| `open_scene` | Compatibility alias for scene_open. Open a scene in the MCP session using headless/file-based scene access |
| `physics` | Create, inspect, configure, template, and analyze physics bodies, areas, collision layers, and shapes |
| `remove_animation` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `save_scene` | Save changes to a scene file |
| `scene_create` | Compatibility alias for create_scene. Create a new Godot scene file |
| `scene_get_current` | Return the current scene tracked by this MCP session, if one was opened |
| `scene_get_tree` | Compatibility alias for get_scene_tree. Return the node tree for a Godot scene |
| `scene_open` | Open a scene in the MCP session using headless/file-based scene access |
| `scene_save` | Compatibility alias for save_scene. Save changes to a scene file |
| `set_animation_keyframe` | Executable compatibility wrapper for animation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_audio_bus` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_navigation_layers` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_physics_layers` | Executable compatibility wrapper for physics. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_collision` | Executable compatibility wrapper for physics. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_navigation_agent` | Executable compatibility wrapper for navigation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_navigation_region` | Executable compatibility wrapper for navigation. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_physics_body` | Executable compatibility wrapper for physics. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `signal` | List, connect, or disconnect node signals in a scene |
| `tilemap` | Create, list, and edit TileMapLayer or legacy TileMap nodes |
| `tilemap_clear` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `tilemap_fill_rect` | Executable compatibility wrapper for tilemap. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `tilemap_get_cell` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `tilemap_get_info` | Executable compatibility wrapper for tilemap. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `tilemap_get_used_cells` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `tilemap_set_cell` | Executable compatibility wrapper for tilemap. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

### Node Tools (26)
| Tool | Description |
|------|-------------|
| `add_node` | Add a node to an existing scene |
| `delete_node` | Delete a non-root node from a Godot scene |
| `duplicate_node` | Compatibility alias for node_duplicate. Duplicate a node in a Godot scene |
| `find_nearby_nodes` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_node_references` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_nodes_by_type` | Executable compatibility wrapper for node_find. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_nodes_in_group` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_node_groups` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_node_properties` | Read selected properties from a node in a Godot scene |
| `group` | List, add, or remove node groups |
| `move_node` | Compatibility alias for node_move. Move a node by setting its position in a Godot scene |
| `node_add` | Compatibility alias for add_node. Add a node to an existing scene |
| `node_delete` | Compatibility alias for delete_node. Delete a non-root node from a Godot scene |
| `node_duplicate` | Duplicate a node in a Godot scene |
| `node_find` | Find nodes in a scene by name, type, or path substring |
| `node_get` | Get node information from a Godot scene |
| `node_get_property` | Compatibility alias for reading selected node properties |
| `node_move` | Move a node by setting its position in a Godot scene |
| `node_rename` | Compatibility alias for rename_node. Rename a node in a Godot scene |
| `node_set_property` | Compatibility alias for updating node properties |
| `rename_node` | Rename a node in a Godot scene |
| `set_blend_tree_node` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_node_groups` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `update_node_properties` | Update properties on a node in a Godot scene |
| `update_property` | Compatibility alias for node_set_property. Compatibility alias for updating node properties |
| `wait_for_node` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

### Script Tools (15)
| Tool | Description |
|------|-------------|
| `analyze_script_references` | Analyze a GDScript file for class, functions, exports, node paths, and resource references |
| `attach_script` | Compatibility alias for script_attach. Attach a GDScript resource to a node in a scene |
| `check_gdscript_syntax` | Run Godot --check-only against a GDScript file and return diagnostics |
| `create_script` | Compatibility alias for script_create. Create a GDScript file inside a Godot project |
| `edit_script` | Executable compatibility wrapper for script_write. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `execute_editor_script` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_nodes_by_script` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_script_references` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_open_scripts` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_script_index` | Return GDScript files with class, base class, exported variables, and functions |
| `list_scripts` | Compatibility alias for get_script_index. Return GDScript files with class, base class, exported variables, and functions |
| `script_attach` | Attach a GDScript resource to a node in a scene |
| `script_create` | Create a GDScript file inside a Godot project |
| `script_write` | Write full GDScript content with overwrite protection |
| `validate_script` | Compatibility alias for check_gdscript_syntax. Run Godot --check-only against a GDScript file and return diagnostics |

### Editor Tools (11)
| Tool | Description |
|------|-------------|
| `editor_bridge_status` | Compatibility alias for plugin_status. Read live editor bridge installation and WebSocket connection status |
| `editor_get_selection` | Return the current editor selection when a live editor bridge is available |
| `editor_inspector_get_properties` | Read Inspector properties from the selected or addressed node through the live editor bridge |
| `editor_inspector_set_properties` | Write Inspector properties on the selected or addressed node through the live editor bridge |
| `editor_select_node` | Select a node in the live Godot editor when an editor bridge is available |
| `editor_undo_redo` | Perform undo or redo in the live Godot editor when an editor bridge is available |
| `install_editor_bridge` | Compatibility alias for plugin_install. Install the godot-devtool v2 WebSocket editor/runtime plugin into a Godot project |
| `plugin_install` | Install the godot-devtool v2 WebSocket editor/runtime plugin into a Godot project |
| `plugin_reload` | Reload the godot-devtool v2 editor plugin through the WebSocket bridge |
| `plugin_status` | Read godot-devtool v2 plugin installation status and WebSocket bridge configuration |
| `reload_plugin` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

### Filesystem Tools (13)
| Tool | Description |
|------|-------------|
| `delete_scene` | Executable compatibility wrapper for filesystem_delete. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `filesystem_delete` | Delete a project-local file or directory with explicit confirmation |
| `filesystem_list` | List files and directories inside a Godot project |
| `filesystem_preview_delete` | Preview a project-local delete operation without deleting files |
| `filesystem_read` | Read a UTF-8 text file inside a Godot project |
| `filesystem_write` | Write a UTF-8 text file inside a Godot project |
| `get_filesystem_tree` | Executable compatibility wrapper for filesystem_list. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_scene_file_content` | Executable compatibility wrapper for filesystem_read. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `read_script` | Compatibility alias for read_script_file. Read a GDScript file from a Godot project |
| `read_script_file` | Read a GDScript file from a Godot project |
| `script_read` | Compatibility alias for read_script_file. Read a GDScript file from a Godot project |
| `search_files` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `search_in_files` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

### Resource Tools (20)
| Tool | Description |
|------|-------------|
| `add_resource` | Executable compatibility wrapper for resource_create. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `check_export_presets` | Inspect Godot export presets and report pre-export issues |
| `create_resource` | Compatibility alias for resource_create. Create a simple structured Godot resource file |
| `edit_resource` | Executable compatibility wrapper for resource_save. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `export_matrix` | Summarize export targets, platform families, signing/template status, and CI steps |
| `export_mesh_library` | Export a scene as a MeshLibrary resource |
| `find_unused_resources` | Executable compatibility wrapper for resource_dependency_graph. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_export_info` | Executable compatibility wrapper for export_matrix. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_export_presets` | Read configured Godot export presets |
| `get_resource_index` | Return a categorized resource index for a Godot project |
| `get_resource_preview` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_uid` | Get the UID for a specific file in a Godot project (for Godot 4.4+) |
| `list_export_presets` | Compatibility alias for get_export_presets. Read configured Godot export presets |
| `project_path_to_uid` | Compatibility alias for get_uid. Get the UID for a specific file in a Godot project (for Godot 4.4+) |
| `read_resource` | Compatibility alias for resource_load. Load a text-based Godot resource from the project |
| `resource_create` | Create a simple structured Godot resource file |
| `resource_dependency_graph` | Build a resource dependency graph and identify orphan resources |
| `resource_load` | Load a text-based Godot resource from the project |
| `resource_save` | Save text-based Godot resource content with overwrite protection |
| `update_export_preset` | Update fields or options for a configured Godot export preset |

### Visual Tools (26)
| Tool | Description |
|------|-------------|
| `apply_particle_preset` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `assign_shader_material` | Executable compatibility wrapper for material. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_particles` | Executable compatibility wrapper for particle. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_shader` | Executable compatibility wrapper for shader. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_theme` | Executable compatibility wrapper for ui. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `edit_shader` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `find_ui_elements` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_particle_info` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_shader_params` | Executable compatibility wrapper for shader. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_theme_info` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `lighting` | Create and list basic Godot light and environment nodes |
| `material` | Create, read, update, and apply Godot material resources |
| `particle` | Create and list basic Godot particle emitter nodes |
| `read_shader` | Executable compatibility wrapper for shader. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_material_3d` | Executable compatibility wrapper for material. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_particle_color_gradient` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_particle_material` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_shader_param` | Executable compatibility wrapper for shader. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_theme_color` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_theme_constant` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_theme_font_size` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_theme_stylebox` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_environment` | Executable compatibility wrapper for lighting. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_lighting` | Executable compatibility wrapper for lighting. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `shader` | Create, read, inspect, and configure ShaderMaterial parameters |
| `ui` | Create Control nodes, reusable UI templates, themes, and automatic signal wiring |

### Runtime Tools (20)
| Tool | Description |
|------|-------------|
| `assert_node_state` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `assert_screen_text` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `compare_screenshots` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_workflow_test_scene` | Create a small Godot scene for validating MCP scene/script/check workflows |
| `execute_game_script` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_editor_screenshot` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_game_node_properties` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_game_scene_tree` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_game_screenshot` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_test_report` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `replay_recording` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `run_test_scenario` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_game_node_property` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `simulate_action` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `simulate_key` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `simulate_mouse_click` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `simulate_mouse_move` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `simulate_sequence` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `start_recording` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `stop_recording` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

### Core Tools (40)
| Tool | Description |
|------|-------------|
| `add_gridmap` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_mesh_instance` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_raycast` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_state_machine_state` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `add_state_machine_transition` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `batch_get_properties` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `batch_set_property` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `capture_frames` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `clear_debug_output` | Clear buffered output for the currently running Godot project |
| `clear_output` | Compatibility alias for clear_debug_output. Clear buffered output for the currently running Godot project |
| `click_button_by_text` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `create_gameplay_prototype` | Create a high-level block-based gameplay prototype scaffold in a Godot project |
| `debug_get_logs` | Compatibility alias for get_debug_output. Get the current debug output and errors |
| `detect_circular_dependencies` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `generate_ci_snippet` | Generate GitHub Actions or GitLab CI snippets for Godot headless checks, export preflight, release export, and artifact archiving |
| `geometry` | Create and list basic 2D geometry/debug drawing nodes |
| `get_audit_log` | Read godot-devtool project audit log entries |
| `get_audit_replay` | Summarize godot-devtool audit log entries into replay steps, counters, and risk highlights |
| `get_capabilities` | Return supported godot-devtool MCP tools, compatibility aliases, run modes, risk levels, and input schemas |
| `get_debug_output` | Get the current debug output and errors |
| `get_editor_errors` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_editor_performance` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_godot_version` | Get the installed Godot version |
| `get_output_log` | Compatibility alias for get_debug_output. Get the current debug output and errors |
| `get_performance_monitors` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `get_rollback_suggestions` | Return honest rollback guidance for an operation, audit entry, or changed paths |
| `get_safety_policy` | Read the project-local godot-devtool safety policy and default enforcement state |
| `launch_editor` | Launch Godot editor for a specific project |
| `load_sprite` | Load a sprite into a Sprite2D node |
| `monitor_properties` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `move_to` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `navigate_to` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `preview_write_safety` | Preview safety policy and diff summary metadata for proposed writes or deletes |
| `remove_state_machine_state` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `remove_state_machine_transition` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `run_stress_test` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_anchor_preset` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `set_safety_policy` | Configure project write allowlists and blocked paths in .godot-devtool/safety.json |
| `set_tree_parameter` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |
| `setup_camera_3d` | Executable compatibility wrapper for compatibility_native. Routes exact-name client calls through a real godot-devtool implementation or a bridge command that returns a completion receipt. |

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
