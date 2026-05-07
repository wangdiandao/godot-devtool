# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.5.2-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [涓枃](README.zh-CN.md)

`godot-devtool` is a Godot 4 MCP server for AI-assisted project inspection, editing, validation, and runtime automation. Version 2.5.2 completes the E:/test survivor-like validation project, adds runtime handshake diagnostics, and keeps the 2.5.x bridge hardening in place.

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

   [godot-devtool-build-2.5.2.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.5.2/godot-devtool-build-2.5.2.zip)

2. Extract it to a stable path, for example:

   ```powershell
   Expand-Archive ".\godot-devtool-build-2.5.2.zip" "E:\godot-devtool" -Force
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
璇蜂娇鐢?godot-devtool MCP server 甯垜瀹夎骞堕獙鏀?Godot 鎻掍欢銆?
椤圭洰璺緞锛?E:/my-godot-project"
WebSocket 绔彛锛?766

姝ラ锛?1. 璋冪敤 get_godot_version 鍜?get_capabilities銆?2. 纭 plugin_install銆乸lugin_status銆乸lugin_reload 鍙敤銆?3. 瀵逛笂杩伴」鐩矾寰勮皟鐢?plugin_install锛宱verwrite=true銆?4. 璋冪敤 plugin_status锛屾€荤粨宸插畨瑁呮枃浠躲€乤utoload 娉ㄥ唽銆乥ridge mode 鍜?WebSocket 绔彛銆?5. 鍛婅瘔鎴戝湪 Godot 缂栬緫鍣ㄩ噷濡備綍鍚敤鎻掍欢銆?6. 濡傛灉闇€瑕?runtime 璺敱锛屾彁閱掓垜杩愯椤圭洰鍚庡啀楠岃瘉 runtime bridge 鐘舵€併€?涓嶈淇敼鏃犲叧鏂囦欢銆?```

## What It Can Do

Use `get_capabilities` as the source of truth. Every tool reports `routeGroup`, `transport`, `riskLevel`, `requiresEditor`, `requiresRuntime`, and `canonicalName` when a tool is implemented through a shared capability.

Core project tools inspect `project.godot`, list projects, read and update project settings with dry-run support, configure InputMap actions with native Godot syntax, run the project, stop the current run, export configured presets, update Godot 4.4+ UIDs, and run release-friendly project checks. Scene and node tools create/open/save scenes, inspect scene trees, add/delete/rename/duplicate/move nodes, update properties with structured Variant values, manage groups, inspect dependencies, and apply cross-scene edits.

Script, filesystem, and resource tools index GDScript files, read/write scripts, create and attach scripts, run syntax checks, read/write/list/search/delete project files, load/save resources, build dependency graphs, inspect export presets, and preview resource content. Visual workflow tools cover shaders, materials, particles, UI themes/templates, physics bodies and collision layers, navigation regions/agents/meshes, lighting/environment setup, TileMap edits, animation tracks/keyframes, and AnimationTree state machine operations.

Editor tools install and verify the bundled `godot-devtool` plugin, reload it through the WebSocket bridge, read the live editor selection, select nodes, perform UndoRedo, and read/write Inspector properties. Runtime tools work while the game is running: they can read the live scene tree and node properties, set runtime properties, capture screenshots/frames, simulate input actions, inspect UI text/buttons, wait for nodes, navigate agents, monitor properties, record/replay interactions, and run QA-style assertions and stress checks.

The table below is generated from the actual tool definitions so the README stays aligned with the MCP server.

## All 217 Tools

### Project Tools (18)
| Tool | Description |
|------|-------------|
| `add_autoload` | Exact-name compatibility route for add_autoload. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `export_project` | Run a controlled Godot export for a configured preset |
| `get_autoload` | Exact-name compatibility route for get_autoload. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_input_actions` | Get input actions using the project_input_action implementation. |
| `get_project_info` | Retrieve metadata about a Godot project |
| `get_project_statistics` | Get project statistics using the get_project_info implementation. |
| `list_projects` | List Godot projects in a directory |
| `project_get_settings` | Read Godot project.godot settings by section or section/key list |
| `project_input_action` | List or update project InputMap actions in project.godot |
| `project_set_setting` | Update Godot project.godot settings with dry-run preview and audit logging |
| `reload_project` | Exact-name compatibility route for reload_project. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `remove_autoload` | Exact-name compatibility route for remove_autoload. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `run_project` | Run the Godot project and capture output |
| `run_project_checks` | Run stable project checks for CI, review, and release workflows |
| `set_input_action` | Set input action using the project_input_action implementation. |
| `stop_project` | Stop the currently running Godot project |
| `uid_to_project_path` | Exact-name compatibility route for uid_to_project_path. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `update_project_uids` | Update UID references in a Godot project by resaving resources (for Godot 4.4+) |

### Scene Tools (51)
| Tool | Description |
|------|-------------|
| `add_animation_track` | Add animation track using the animation implementation. |
| `add_audio_bus` | Exact-name compatibility route for add_audio_bus. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_audio_bus_effect` | Exact-name compatibility route for add_audio_bus_effect. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_audio_player` | Add audio player using the audio implementation. |
| `add_scene_instance` | Exact-name compatibility route for add_scene_instance. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `analyze_scene_complexity` | Exact-name compatibility route for analyze_scene_complexity. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `analyze_signal_flow` | Exact-name compatibility route for analyze_signal_flow. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `animation` | Create, inspect, remove, and edit AnimationPlayer tracks and keyframes |
| `animation_state_machine` | Create, inspect, and configure AnimationTree state machines |
| `audio` | Create and list AudioStreamPlayer nodes with basic playback configuration |
| `bake_navigation_mesh` | Bake navigation mesh using the navigation implementation. |
| `connect_signal` | Connect signal using the signal implementation. |
| `create_animation` | Create animation using the animation implementation. |
| `create_animation_tree` | Create animation tree using the animation_state_machine implementation. |
| `create_scene` | Create a new Godot scene file |
| `cross_scene_set_property` | Exact-name compatibility route for cross_scene_set_property. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `disconnect_signal` | Disconnect signal using the signal implementation. |
| `find_signal_connections` | Exact-name compatibility route for find_signal_connections. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_animation_info` | Get animation info using the animation implementation. |
| `get_animation_tree_structure` | Exact-name compatibility route for get_animation_tree_structure. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_audio_bus_layout` | Get audio bus layout using the audio implementation. |
| `get_audio_info` | Get audio info using the audio implementation. |
| `get_collision_info` | Get collision info using the physics implementation. |
| `get_navigation_info` | Get navigation info using the navigation implementation. |
| `get_physics_layers` | Exact-name compatibility route for get_physics_layers. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_scene_dependencies` | Exact-name compatibility route for get_scene_dependencies. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
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
| `set_audio_bus` | Exact-name compatibility route for set_audio_bus. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_navigation_layers` | Exact-name compatibility route for set_navigation_layers. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_physics_layers` | Set physics layers using the physics implementation. |
| `setup_collision` | Set up collision using the physics implementation. |
| `setup_navigation_agent` | Set up navigation agent using the navigation implementation. |
| `setup_navigation_region` | Set up navigation region using the navigation implementation. |
| `setup_physics_body` | Set up physics body using the physics implementation. |
| `signal` | List, connect, or disconnect node signals in a scene |
| `tilemap` | Create, list, and edit TileMapLayer or legacy TileMap nodes |
| `tilemap_clear` | Exact-name compatibility route for tilemap_clear. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `tilemap_fill_rect` | Update fill rect using the tilemap implementation. |
| `tilemap_get_cell` | Exact-name compatibility route for tilemap_get_cell. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `tilemap_get_info` | Update get info using the tilemap implementation. |
| `tilemap_get_used_cells` | Exact-name compatibility route for tilemap_get_used_cells. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `tilemap_set_cell` | Update set cell using the tilemap implementation. |

### Node Tools (18)
| Tool | Description |
|------|-------------|
| `add_node` | Add a node to an existing scene |
| `delete_node` | Delete a non-root node from a Godot scene |
| `find_nearby_nodes` | Runtime WebSocket compatibility route. Executes find_nearby_nodes through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `find_node_references` | Exact-name compatibility route for find_node_references. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `find_nodes_by_type` | Find nodes by type using the node_find implementation. |
| `find_nodes_in_group` | Exact-name compatibility route for find_nodes_in_group. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_node_groups` | Exact-name compatibility route for get_node_groups. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_node_properties` | Read selected properties from a node in a Godot scene |
| `group` | List, add, or remove node groups |
| `node_duplicate` | Duplicate a node in a Godot scene |
| `node_find` | Find nodes in a scene by name, type, or path substring |
| `node_get` | Get node information from a Godot scene |
| `node_move` | Move a node by setting its position in a Godot scene |
| `rename_node` | Rename a node in a Godot scene |
| `set_blend_tree_node` | Exact-name compatibility route for set_blend_tree_node. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_node_groups` | Exact-name compatibility route for set_node_groups. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `update_node_properties` | Update properties on a node in a Godot scene |
| `wait_for_node` | Runtime WebSocket compatibility route. Executes wait_for_node through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |

### Script Tools (11)
| Tool | Description |
|------|-------------|
| `analyze_script_references` | Analyze a GDScript file for class, functions, exports, node paths, and resource references |
| `check_gdscript_syntax` | Run Godot --check-only against a GDScript file and return diagnostics |
| `edit_script` | Edit script using the script_write implementation. |
| `execute_editor_script` | Exact-name compatibility route for execute_editor_script. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `find_nodes_by_script` | Exact-name compatibility route for find_nodes_by_script. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `find_script_references` | Exact-name compatibility route for find_script_references. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_open_scripts` | Exact-name compatibility route for get_open_scripts. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
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
| `reload_plugin` | Exact-name compatibility route for reload_plugin. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |

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
| `search_files` | Exact-name compatibility route for search_files. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `search_in_files` | Exact-name compatibility route for search_in_files. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |

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
| `get_resource_preview` | Exact-name compatibility route for get_resource_preview. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_uid` | Get the UID for a specific file in a Godot project (for Godot 4.4+) |
| `resource_create` | Create a simple structured Godot resource file |
| `resource_dependency_graph` | Build a resource dependency graph and identify orphan resources |
| `resource_load` | Load a text-based Godot resource from the project |
| `resource_save` | Save text-based Godot resource content with overwrite protection |
| `update_export_preset` | Update fields or options for a configured Godot export preset |

### Visual Tools (26)
| Tool | Description |
|------|-------------|
| `apply_particle_preset` | Exact-name compatibility route for apply_particle_preset. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `assign_shader_material` | Assign shader material using the material implementation. |
| `create_particles` | Create particles using the particle implementation. |
| `create_shader` | Create shader using the shader implementation. |
| `create_theme` | Create theme using the ui implementation. |
| `edit_shader` | Exact-name compatibility route for edit_shader. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `find_ui_elements` | Runtime WebSocket compatibility route. Executes find_ui_elements through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_particle_info` | Exact-name compatibility route for get_particle_info. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_shader_params` | Get shader params using the shader implementation. |
| `get_theme_info` | Exact-name compatibility route for get_theme_info. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `lighting` | Create and list basic Godot light and environment nodes |
| `material` | Create, read, update, and apply Godot material resources |
| `particle` | Create and list basic Godot particle emitter nodes |
| `read_shader` | Read shader using the shader implementation. |
| `set_material_3d` | Set material 3d using the material implementation. |
| `set_particle_color_gradient` | Exact-name compatibility route for set_particle_color_gradient. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_particle_material` | Exact-name compatibility route for set_particle_material. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_shader_param` | Set shader param using the shader implementation. |
| `set_theme_color` | Exact-name compatibility route for set_theme_color. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_theme_constant` | Exact-name compatibility route for set_theme_constant. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_theme_font_size` | Exact-name compatibility route for set_theme_font_size. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_theme_stylebox` | Exact-name compatibility route for set_theme_stylebox. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `setup_environment` | Set up environment using the lighting implementation. |
| `setup_lighting` | Set up lighting using the lighting implementation. |
| `shader` | Create, read, inspect, and configure ShaderMaterial parameters |
| `ui` | Create Control nodes, reusable UI templates, themes, and automatic signal wiring |

### Runtime Tools (20)
| Tool | Description |
|------|-------------|
| `assert_node_state` | Exact-name compatibility route for assert_node_state. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `assert_screen_text` | Exact-name compatibility route for assert_screen_text. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `compare_screenshots` | Exact-name compatibility route for compare_screenshots. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `create_workflow_test_scene` | Create a small Godot scene for validating MCP scene/script/check workflows |
| `execute_game_script` | Runtime WebSocket compatibility route. Executes execute_game_script through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_editor_screenshot` | Exact-name compatibility route for get_editor_screenshot. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_game_node_properties` | Runtime WebSocket compatibility route. Executes get_game_node_properties through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_game_scene_tree` | Runtime WebSocket compatibility route. Executes get_game_scene_tree through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_game_screenshot` | Runtime WebSocket compatibility route. Executes get_game_screenshot through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `get_test_report` | Exact-name compatibility route for get_test_report. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `replay_recording` | Runtime WebSocket compatibility route. Executes replay_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `run_test_scenario` | Exact-name compatibility route for run_test_scenario. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_game_node_property` | Runtime WebSocket compatibility route. Executes set_game_node_property through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_action` | Runtime WebSocket compatibility route. Executes simulate_action through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_key` | Runtime WebSocket compatibility route. Executes simulate_key through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_mouse_click` | Runtime WebSocket compatibility route. Executes simulate_mouse_click through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_mouse_move` | Runtime WebSocket compatibility route. Executes simulate_mouse_move through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `simulate_sequence` | Runtime WebSocket compatibility route. Executes simulate_sequence through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `start_recording` | Runtime WebSocket compatibility route. Executes start_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `stop_recording` | Runtime WebSocket compatibility route. Executes stop_recording through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |

### Core Tools (37)
| Tool | Description |
|------|-------------|
| `add_gridmap` | Exact-name compatibility route for add_gridmap. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_mesh_instance` | Exact-name compatibility route for add_mesh_instance. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_raycast` | Exact-name compatibility route for add_raycast. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_state_machine_state` | Exact-name compatibility route for add_state_machine_state. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `add_state_machine_transition` | Exact-name compatibility route for add_state_machine_transition. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `batch_get_properties` | Exact-name compatibility route for batch_get_properties. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `batch_set_property` | Exact-name compatibility route for batch_set_property. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `capture_frames` | Runtime WebSocket compatibility route. Executes capture_frames through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `clear_debug_output` | Clear buffered output for the currently running Godot project |
| `click_button_by_text` | Runtime WebSocket compatibility route. Executes click_button_by_text through the running Godot runtime bridge and returns a failed receipt when DevtoolRuntime is not connected. |
| `create_gameplay_prototype` | Create a high-level block-based gameplay prototype scaffold in a Godot project |
| `detect_circular_dependencies` | Exact-name compatibility route for detect_circular_dependencies. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `generate_ci_snippet` | Generate GitHub Actions or GitLab CI snippets for Godot headless checks, export preflight, release export, and artifact archiving |
| `geometry` | Create and list basic 2D geometry/debug drawing nodes |
| `get_audit_log` | Read godot-devtool project audit log entries |
| `get_audit_replay` | Summarize godot-devtool audit log entries into replay steps, counters, and risk highlights |
| `get_capabilities` | Return supported godot-devtool MCP tools, run modes, risk levels, bridge requirements, and input schemas |
| `get_debug_output` | Get the current debug output and errors |
| `get_editor_errors` | Exact-name compatibility route for get_editor_errors. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `get_editor_performance` | Exact-name compatibility route for get_editor_performance. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
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
| `remove_state_machine_state` | Exact-name compatibility route for remove_state_machine_state. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `remove_state_machine_transition` | Exact-name compatibility route for remove_state_machine_transition. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `run_stress_test` | Exact-name compatibility route for run_stress_test. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_anchor_preset` | Exact-name compatibility route for set_anchor_preset. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `set_safety_policy` | Configure project write allowlists and blocked paths in .godot-devtool/safety.json |
| `set_tree_parameter` | Exact-name compatibility route for set_tree_parameter. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |
| `setup_camera_3d` | Exact-name compatibility route for setup_camera_3d. Uses native, headless Godot, editor bridge, or runtime bridge support when that execution path is available. |

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

The skill teaches assistants to inspect project state first, choose the right route group, install/use the WebSocket plugin only when live editor or runtime state is required, and validate changes before finishing.

