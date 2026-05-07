# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.6.1-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

[Buy me a coffee on Patreon](https://www.patreon.com/cw/wangdiandao) if this project helps you. I am not very familiar with editing Patreon pages yet; thanks for your understanding.

`godot-devtool` is a Godot 4 MCP server for AI-assisted project inspection, editing, validation, and runtime automation. Version 2.6.1 adds a local Browser visualizer for WebSocket bridge status, connected editor/runtime clients, and live-route guidance.

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
- Browser visualizer routes serve a local read-only HTTP dashboard for bridge/client status and live-route orientation.

## Requirements

- Node.js 18 or newer.
- Godot 4.x. Set `GODOT_PATH` unless `godot` is already on `PATH`.
- An MCP client such as Codex, Claude Code, Cursor, Cline, Roo Code, VS Code Copilot, or another client that can launch stdio MCP servers.
- A Godot project containing `project.godot`.

## Install From Release Zip

1. Download the release build:

   [godot-devtool-build-2.6.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.6.1/godot-devtool-build-2.6.1.zip)

2. Extract it to a stable path, for example:

   ```powershell
   Expand-Archive ".\godot-devtool-build-2.6.1.zip" "E:\godot-devtool" -Force
   ```

3. Confirm the server entry exists:

   ```powershell
   Test-Path "E:\godot-devtool\build\index.js"
   Test-Path "E:\godot-devtool\build\addons\godot_devtool\plugin.gd"
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

## Ask AI To Install It

After adding the MCP server to your client, you can paste this prompt into the AI assistant:

```text
Use the godot-devtool MCP server to install and verify the Godot plugin for my project.

Project path: "E:/my-godot-project"
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
请使用 `godot-devtool` MCP server 帮我安装并验收 Godot 插件。

项目路径: "E:/my-godot-project"
WebSocket 端口: 8766

步骤:
1. 调用 get_godot_version 和 get_capabilities。
2. 确认 plugin_install、plugin_status、plugin_reload 可用。
3. 对上述项目路径调用 plugin_install，overwrite=true。
4. 调用 plugin_status，总结已安装文件、autoload 注册、bridge mode 和 WebSocket 端口。
5. 告诉我在 Godot 编辑器里如何启用插件。
6. 如果需要 runtime 路由，提醒我运行项目后再验证 runtime bridge 状态。
不要修改无关文件。
```

## What It Can Do

Use `get_capabilities` as the source of truth. Every tool reports `routeGroup`, `transport`, `riskLevel`, `requiresEditor`, `requiresRuntime`, and `canonicalName` when a tool is implemented through a shared capability.

Core project tools inspect `project.godot`, list projects, read and update project settings with dry-run support, configure InputMap actions with native Godot syntax, run the project, stop the current run, export configured presets, update Godot 4.4+ UIDs, and run release-friendly project checks. Scene and node tools create/open/save scenes, inspect scene trees, add/delete/rename/duplicate/move nodes, update properties with structured Variant values, manage groups, inspect dependencies, and apply cross-scene edits.

Script, filesystem, and resource tools index GDScript files, read/write scripts, create and attach scripts, run syntax checks, read/write/list/search/delete project files, load/save resources, build dependency graphs, inspect export presets, and preview resource content. Visual workflow tools cover shaders, materials, particles, UI themes/templates, physics bodies and collision layers, navigation regions/agents/meshes, lighting/environment setup, TileMap edits, animation tracks/keyframes, and AnimationTree state machine operations.

Editor tools install and verify the bundled `godot-devtool` plugin, reload it through the WebSocket bridge, read the live editor selection, select nodes, perform UndoRedo, and read/write Inspector properties. Runtime tools work while the game is running: they can read the live scene tree and node properties, set runtime properties, capture screenshots/frames, simulate input actions, inspect UI text/buttons, wait for nodes, navigate agents, monitor properties, record/replay interactions, and run QA-style assertions and stress checks.

Browser visualizer tools start, inspect, and stop a local read-only dashboard. Use `browser_visualizer_start` to open a `http://127.0.0.1:<port>/` page that refreshes bridge status, connected editor/runtime clients, pending command count, and the existing screenshot/scene/input route names to call from the MCP client.

The table below is generated from the actual tool definitions so the README stays aligned with the MCP server.

## All 221 Tools

### Project Tools (18)
| Tool | Description |
|------|-------------|
| `add_autoload` | Exact-name compatibility route for add_autoload. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `export_project` | Run a controlled Godot export for a configured preset |
| `get_autoload` | Exact-name compatibility route for get_autoload. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_input_actions` | Get input actions using the project_input_action implementation. |
| `get_project_info` | Retrieve metadata about a Godot project |
| `get_project_statistics` | Get project statistics using the get_project_info implementation. |
| `list_projects` | List Godot projects in a directory |
| `project_get_settings` | Read Godot project.godot settings by section or section/key list |
| `project_input_action` | List or update project InputMap actions in project.godot |
| `project_set_setting` | Update Godot project.godot settings with dry-run preview and audit logging |
| `reload_project` | Exact-name compatibility route for reload_project. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `remove_autoload` | Exact-name compatibility route for remove_autoload. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `run_project` | Run the Godot project and capture output |
| `run_project_checks` | Run stable project checks for CI, review, and release workflows |
| `set_input_action` | Set input action using the project_input_action implementation. |
| `stop_project` | Stop the currently running Godot project |
| `uid_to_project_path` | Exact-name compatibility route for uid_to_project_path. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `update_project_uids` | Update UID references in a Godot project by resaving resources (for Godot 4.4+) |

### Scene Tools (51)
| Tool | Description |
|------|-------------|
| `add_animation_track` | Add animation track using the animation implementation. |
| `add_audio_bus` | Exact-name compatibility route for add_audio_bus. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_audio_bus_effect` | Exact-name compatibility route for add_audio_bus_effect. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_audio_player` | Add audio player using the audio implementation. |
| `add_scene_instance` | Exact-name compatibility route for add_scene_instance. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `analyze_scene_complexity` | Exact-name compatibility route for analyze_scene_complexity. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `analyze_signal_flow` | Exact-name compatibility route for analyze_signal_flow. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `animation` | Create, inspect, remove, and edit AnimationPlayer tracks and keyframes |
| `animation_state_machine` | Create, inspect, and configure AnimationTree state machines |
| `audio` | Create and list AudioStreamPlayer nodes with basic playback configuration |
| `bake_navigation_mesh` | Bake navigation mesh using the navigation implementation. |
| `connect_signal` | Connect signal using the signal implementation. |
| `create_animation` | Create animation using the animation implementation. |
| `create_animation_tree` | Create animation tree using the animation_state_machine implementation. |
| `create_scene` | Create a new Godot scene file |
| `cross_scene_set_property` | Exact-name compatibility route for cross_scene_set_property. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `disconnect_signal` | Disconnect signal using the signal implementation. |
| `find_signal_connections` | Exact-name compatibility route for find_signal_connections. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_animation_info` | Get animation info using the animation implementation. |
| `get_animation_tree_structure` | Exact-name compatibility route for get_animation_tree_structure. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_audio_bus_layout` | Get audio bus layout using the audio implementation. |
| `get_audio_info` | Get audio info using the audio implementation. |
| `get_collision_info` | Get collision info using the physics implementation. |
| `get_navigation_info` | Get navigation info using the navigation implementation. |
| `get_physics_layers` | Exact-name compatibility route for get_physics_layers. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_scene_dependencies` | Exact-name compatibility route for get_scene_dependencies. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_scene_tree` | Return the node tree for a Godot scene |
| `get_signals` | Get signals using the signal implementation. |
| `list_animations` | List animations using the animation implementation. |
| `navigation` | Create, inspect, configure, bake, query, and debug NavigationRegion and NavigationAgent nodes |
| `physics` | Create, inspect, configure, template, and analyze physics bodies, areas, collision layers, and shapes |
| `remove_animation` | Remove animation using the animation implementation. |
| `save_scene` | Save changes to a scene file |
| `scene_get_current` | Return the current scene tracked by this MCP session, if one was opened |
| `scene_open` | Open a scene in the MCP session using headless/file-based scene access |
| `set_animation_keyframe` | Set animation keyframe using the animation implementation. |
| `set_audio_bus` | Exact-name compatibility route for set_audio_bus. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_navigation_layers` | Exact-name compatibility route for set_navigation_layers. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_physics_layers` | Set physics layers using the physics implementation. |
| `setup_collision` | Set up collision using the physics implementation. |
| `setup_navigation_agent` | Set up navigation agent using the navigation implementation. |
| `setup_navigation_region` | Set up navigation region using the navigation implementation. |
| `setup_physics_body` | Set up physics body using the physics implementation. |
| `signal` | List, connect, or disconnect node signals in a scene |
| `tilemap` | Create, list, and edit TileMapLayer or legacy TileMap nodes |
| `tilemap_clear` | Clear TileMap using the tilemap implementation. |
| `tilemap_fill_rect` | Fill TileMap rect using the tilemap implementation. |
| `tilemap_get_cell` | Get TileMap cell using the tilemap implementation. |
| `tilemap_get_info` | Get TileMap info using the tilemap implementation. |
| `tilemap_get_used_cells` | Get TileMap used cells using the tilemap implementation. |
| `tilemap_set_cell` | Set TileMap cell using the tilemap implementation. |

### Node Tools (19)
| Tool | Description |
|------|-------------|
| `add_node` | Add a node to an existing scene |
| `delete_node` | Delete a non-root node from a Godot scene |
| `find_nearby_nodes` | Runtime WebSocket compatibility route. Executes find_nearby_nodes through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `find_node_references` | Exact-name compatibility route for find_node_references. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `find_nodes_by_type` | Find nodes by type using the node_find implementation. |
| `find_nodes_in_group` | Exact-name compatibility route for find_nodes_in_group. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_node_groups` | Exact-name compatibility route for get_node_groups. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_node_properties` | Read selected properties from a node in a Godot scene |
| `group` | List, add, or remove node groups |
| `move_node` | Move node using the node_move implementation. |
| `node_duplicate` | Duplicate a node in a Godot scene |
| `node_find` | Find nodes in a scene by name, type, or path substring |
| `node_get` | Get node information from a Godot scene |
| `node_move` | Move a node by setting its position or reparenting it in a Godot scene |
| `rename_node` | Rename a node in a Godot scene |
| `set_blend_tree_node` | Exact-name compatibility route for set_blend_tree_node. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_node_groups` | Exact-name compatibility route for set_node_groups. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `update_node_properties` | Update properties on a node in a Godot scene |
| `wait_for_node` | Runtime WebSocket compatibility route. Executes wait_for_node through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |

### Script Tools (11)
| Tool | Description |
|------|-------------|
| `analyze_script_references` | Analyze a GDScript file for class, functions, exports, node paths, and resource references |
| `check_gdscript_syntax` | Run Godot --check-only against a GDScript file and return diagnostics |
| `edit_script` | Edit script using the script_write implementation. |
| `execute_editor_script` | Exact-name compatibility route for execute_editor_script. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `find_nodes_by_script` | Exact-name compatibility route for find_nodes_by_script. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `find_script_references` | Exact-name compatibility route for find_script_references. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_open_scripts` | Exact-name compatibility route for get_open_scripts. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_script_index` | Return GDScript files with class, base class, exported variables, and functions |
| `script_attach` | Attach a GDScript resource to a node in a scene |
| `script_create` | Create a GDScript file inside a Godot project |
| `script_write` | Write full GDScript content with overwrite protection |

### Editor Tools (9)
| Tool | Description |
|------|-------------|
| `editor_get_selection` | Return the current editor selection when a live editor bridge is available |
| `editor_inspector_get_properties` | Read Inspector properties from the selected or addressed node through the live editor bridge |
| `editor_inspector_set_properties` | Write Inspector properties on the selected or addressed node through the live editor bridge |
| `editor_select_node` | Select a node in the live Godot editor when an editor bridge is available |
| `editor_undo_redo` | Perform undo or redo in the live Godot editor when an editor bridge is available |
| `plugin_install` | Install the godot-devtool v2 WebSocket editor/runtime plugin into a Godot project |
| `plugin_reload` | Reload the godot-devtool v2 editor plugin through the WebSocket bridge |
| `plugin_status` | Read godot-devtool v2 plugin installation status and WebSocket bridge configuration |
| `reload_plugin` | Exact-name compatibility route for reload_plugin. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |

### Filesystem Tools (11)
| Tool | Description |
|------|-------------|
| `delete_scene` | Delete scene using the filesystem_delete implementation. |
| `filesystem_delete` | Delete a project-local file or directory with explicit confirmation |
| `filesystem_list` | List files and directories inside a Godot project |
| `filesystem_preview_delete` | Preview a project-local delete operation without deleting files |
| `filesystem_read` | Read a UTF-8 text file inside a Godot project |
| `filesystem_write` | Write a UTF-8 text file inside a Godot project |
| `get_filesystem_tree` | Get filesystem tree using the filesystem_list implementation. |
| `get_scene_file_content` | Get scene file content using the filesystem_read implementation. |
| `read_script_file` | Read a GDScript file from a Godot project |
| `search_files` | Exact-name compatibility route for search_files. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `search_in_files` | Exact-name compatibility route for search_in_files. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |

### Resource Tools (16)
| Tool | Description |
|------|-------------|
| `add_resource` | Add resource using the resource_create implementation. |
| `check_export_presets` | Inspect Godot export presets and report pre-export issues |
| `edit_resource` | Edit resource using the resource_save implementation. |
| `export_matrix` | Summarize export targets, platform families, signing/template status, and CI steps |
| `export_mesh_library` | Export a scene as a MeshLibrary resource |
| `find_unused_resources` | Find unused resources using the resource_dependency_graph implementation. |
| `get_export_info` | Get export info using the export_matrix implementation. |
| `get_export_presets` | Read configured Godot export presets |
| `get_resource_index` | Return a categorized resource index for a Godot project |
| `get_resource_preview` | Exact-name compatibility route for get_resource_preview. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_uid` | Get the UID for a specific file in a Godot project (for Godot 4.4+) |
| `resource_create` | Create a simple structured Godot resource file |
| `resource_dependency_graph` | Build a resource dependency graph and identify orphan resources |
| `resource_load` | Load a text-based Godot resource from the project |
| `resource_save` | Save text-based Godot resource content with overwrite protection |
| `update_export_preset` | Update fields or options for a configured Godot export preset |

### Visual Tools (26)
| Tool | Description |
|------|-------------|
| `apply_particle_preset` | Exact-name compatibility route for apply_particle_preset. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `assign_shader_material` | Assign shader material using the material implementation. |
| `create_particles` | Create particles using the particle implementation. |
| `create_shader` | Create shader using the shader implementation. |
| `create_theme` | Create theme using the ui implementation. |
| `edit_shader` | Exact-name compatibility route for edit_shader. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `find_ui_elements` | Runtime WebSocket compatibility route. Executes find_ui_elements through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_particle_info` | Exact-name compatibility route for get_particle_info. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_shader_params` | Get shader params using the shader implementation. |
| `get_theme_info` | Exact-name compatibility route for get_theme_info. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `lighting` | Create and list basic Godot light and environment nodes |
| `material` | Create, read, update, and apply Godot material resources |
| `particle` | Create and list basic Godot particle emitter nodes |
| `read_shader` | Read shader using the shader implementation. |
| `set_material_3d` | Set material 3d using the material implementation. |
| `set_particle_color_gradient` | Exact-name compatibility route for set_particle_color_gradient. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_particle_material` | Exact-name compatibility route for set_particle_material. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_shader_param` | Set shader param using the shader implementation. |
| `set_theme_color` | Exact-name compatibility route for set_theme_color. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_theme_constant` | Exact-name compatibility route for set_theme_constant. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_theme_font_size` | Exact-name compatibility route for set_theme_font_size. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_theme_stylebox` | Exact-name compatibility route for set_theme_stylebox. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `setup_environment` | Set up environment using the lighting implementation. |
| `setup_lighting` | Set up lighting using the lighting implementation. |
| `shader` | Create, read, inspect, and configure ShaderMaterial parameters |
| `ui` | Create Control nodes, reusable UI templates, themes, and automatic signal wiring |

### Runtime Tools (21)
| Tool | Description |
|------|-------------|
| `assert_node_state` | Exact-name compatibility route for assert_node_state. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `assert_screen_text` | Exact-name compatibility route for assert_screen_text. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `compare_screenshots` | Exact-name compatibility route for compare_screenshots. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `create_workflow_test_scene` | Create a small Godot scene for validating MCP scene/script/check workflows |
| `execute_game_script` | Runtime WebSocket compatibility route. Executes execute_game_script through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_editor_screenshot` | Exact-name compatibility route for get_editor_screenshot. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_game_node_properties` | Runtime WebSocket compatibility route. Executes get_game_node_properties through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_game_scene_tree` | Runtime WebSocket compatibility route. Executes get_game_scene_tree through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_game_screenshot` | Runtime WebSocket compatibility route. Executes get_game_screenshot through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_test_report` | Exact-name compatibility route for get_test_report. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `replay_recording` | Runtime WebSocket compatibility route. Executes replay_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `run_stress_test` | Exact-name compatibility route for run_stress_test. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `run_test_scenario` | Exact-name compatibility route for run_test_scenario. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_game_node_property` | Runtime WebSocket compatibility route. Executes set_game_node_property through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_action` | Runtime WebSocket compatibility route. Executes simulate_action through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_key` | Runtime WebSocket compatibility route. Executes simulate_key through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_mouse_click` | Runtime WebSocket compatibility route. Executes simulate_mouse_click through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_mouse_move` | Runtime WebSocket compatibility route. Executes simulate_mouse_move through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_sequence` | Runtime WebSocket compatibility route. Executes simulate_sequence through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `start_recording` | Runtime WebSocket compatibility route. Executes start_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `stop_recording` | Runtime WebSocket compatibility route. Executes stop_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |

### Core Tools (39)
| Tool | Description |
|------|-------------|
| `add_gridmap` | Exact-name compatibility route for add_gridmap. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_mesh_instance` | Exact-name compatibility route for add_mesh_instance. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_raycast` | Exact-name compatibility route for add_raycast. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_state_machine_state` | Exact-name compatibility route for add_state_machine_state. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `add_state_machine_transition` | Exact-name compatibility route for add_state_machine_transition. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `batch_get_properties` | Exact-name compatibility route for batch_get_properties. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `batch_set_property` | Exact-name compatibility route for batch_set_property. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `browser_visualizer_start` | Start a local read-only browser dashboard for Godot editor/runtime bridge status and live-route guidance |
| `browser_visualizer_status` | Read the local Browser visualizer URL, project filter, and connected editor/runtime bridge clients |
| `browser_visualizer_stop` | Stop the local Browser visualizer HTTP dashboard |
| `capture_frames` | Runtime WebSocket compatibility route. Executes capture_frames through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `clear_debug_output` | Clear buffered output for the currently running Godot project |
| `click_button_by_text` | Runtime WebSocket compatibility route. Executes click_button_by_text through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `create_gameplay_prototype` | Create a high-level block-based gameplay prototype scaffold in a Godot project |
| `detect_circular_dependencies` | Exact-name compatibility route for detect_circular_dependencies. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `generate_ci_snippet` | Generate GitHub Actions or GitLab CI snippets for Godot headless checks, export preflight, release export, and artifact archiving |
| `geometry` | Create and list basic 2D geometry/debug drawing nodes |
| `get_audit_log` | Read godot-devtool project audit log entries |
| `get_audit_replay` | Summarize godot-devtool audit log entries into replay steps, counters, and risk highlights |
| `get_capabilities` | Return supported godot-devtool MCP tools, run modes, risk levels, bridge requirements, and input schemas |
| `get_debug_output` | Get the current debug output and errors |
| `get_editor_errors` | Exact-name compatibility route for get_editor_errors. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_editor_performance` | Exact-name compatibility route for get_editor_performance. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `get_godot_version` | Get the installed Godot version |
| `get_performance_monitors` | Runtime WebSocket compatibility route. Executes get_performance_monitors through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_rollback_suggestions` | Return honest rollback guidance for an operation, audit entry, or changed paths |
| `get_safety_policy` | Read the project-local godot-devtool safety policy and default enforcement state |
| `launch_editor` | Launch Godot editor for a specific project |
| `load_sprite` | Load a sprite into a Sprite2D node |
| `monitor_properties` | Runtime WebSocket compatibility route. Executes monitor_properties through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `move_to` | Runtime WebSocket compatibility route. Executes move_to through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `navigate_to` | Runtime WebSocket compatibility route. Executes navigate_to through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `preview_write_safety` | Preview safety policy and diff summary metadata for proposed writes or deletes |
| `remove_state_machine_state` | Exact-name compatibility route for remove_state_machine_state. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `remove_state_machine_transition` | Exact-name compatibility route for remove_state_machine_transition. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_anchor_preset` | Exact-name compatibility route for set_anchor_preset. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `set_safety_policy` | Configure project write allowlists and blocked paths in .godot-devtool/safety.json |
| `set_tree_parameter` | Exact-name compatibility route for set_tree_parameter. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |
| `setup_camera_3d` | Exact-name compatibility route for setup_camera_3d. Executes through its registered compatibility implementation and returns a structured error when required project, editor, or runtime state is unavailable. |

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
npm.cmd run check:project -- "E:/test"
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

Feed this `SKILL.md` to your AI assistant before asking it to operate on a Godot project. In clients that support file context, attach or reference the file directly; otherwise paste its contents into the chat and tell the AI to follow it when using the `godot-devtool` MCP server.

The skill maps common Godot operations to the correct MCP tools, teaches assistants to inspect project state first, use stdio/headless routes for repeatable edits, install/use the WebSocket plugin only when live editor or runtime state is required, and validate changes before finishing.

