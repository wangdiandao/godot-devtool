# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.5.2-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot 4 的 MCP server，用于让 AI 助手检查、编辑、验证和自动化运行中的 Godot 项目。2.5.2 完成 `E:/test` survivor-like 验证项目，增加 runtime 握手诊断，并保留 2.5.x 的 bridge 加固。

## 架构

```text
MCP client
  -> node build/index.js over stdio
  -> native/headless Godot tools
  -> optional ws://127.0.0.1:8766 bridge
  -> addons/godot_devtool editor plugin
  -> runtime autoload bridge
```

- MCP server 始终通过 stdio 与客户端通信。
- native 路由不打开编辑器即可检查和编辑项目文件。
- headless 路由调用 Godot 完成场景、资源和脚本操作。
- editor 路由通过内置 WebSocket 插件处理实时选择、Inspector 写入、UndoRedo 和插件重载。
- runtime 路由通过已安装的 autoload bridge 处理运行中场景树、属性、输入模拟、截图和 QA 检查。

## 环境要求

- Node.js 18 或更新版本。
- Godot 4.x。除非 `godot` 已经在 `PATH` 中，否则需要设置 `GODOT_PATH`。
- 支持 stdio MCP server 的客户端，例如 Codex、Claude Code、Cursor、Cline、Roo Code、VS Code Copilot 或其它 MCP 客户端。
- 一个包含 `project.godot` 的 Godot 项目。

## 从 Release Zip 安装

1. 下载发布包：

   [godot-devtool-build-2.5.2.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.5.2/godot-devtool-build-2.5.2.zip)

2. 解压到稳定路径，例如：

   ```powershell
   Expand-Archive ".\godot-devtool-build-2.5.2.zip" "E:\godot-devtool" -Force
   ```

3. 确认 server 入口和插件文件存在：

   ```powershell
   Test-Path "E:\godot-devtool\build\index.js"
   Test-Path "E:\godot-devtool\build\addons\godot_devtool\plugin.gd"
   ```

4. 把 MCP server 加入客户端配置：

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

5. 重启 MCP 客户端，并让它调用：

   ```text
   get_godot_version
   get_capabilities
   ```

`GODOT_DEVTOOL_WS_PORT` 默认是 `8766`。只有端口冲突时才需要修改。

## 从源码构建

```bash
git clone https://github.com/wangdiandao/godot-devtool.git
cd godot-devtool
npm install
npm run build
```

MCP server 入口是 `build/index.js`。`npm run build` 会把内置 Godot 插件复制到 `build/addons/godot_devtool`。

## 安装 Godot 插件

插件已经包含在 release/build 包里。每个需要实时 editor 或 runtime 路由的 Godot 项目，都需要安装一次插件。

1. 启动已配置 `godot-devtool` 的 MCP 客户端。
2. 让 AI 调用工具，或直接调用：

   ```text
   plugin_install
   ```

   参数：

   ```json
   {
     "projectPath": "E:/my-godot-project",
     "overwrite": true,
     "websocketPort": 8766
   }
   ```

3. 打开 Godot 项目。
4. 启用插件：

   ```text
   Project > Project Settings > Plugins > godot-devtool > Enable
   ```

5. 检查安装和连接：

   ```text
   plugin_status
   ```

对于 runtime 路由，`plugin_install` 还会注册：

```text
autoload/DevtoolRuntime = *res://addons/godot_devtool/runtime_bridge.gd
```

使用 `runtime_ws` 工具前，需要先运行 Godot 项目。编辑器插件在编辑器打开时连接；runtime bridge 在游戏运行时连接，并将握手诊断写入 `.godot-devtool/runtime-state.json`。

## 让 AI 协助安装

把 MCP server 加入客户端后，可以直接把这段提示词发给 AI：

```text
请使用 godot-devtool MCP server 帮我安装并验收 Godot 插件。

项目路径："E:/my-godot-project"
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

English prompt:

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

## 能做什么

请把 `get_capabilities` 当作真实能力来源。每个工具都会返回 `routeGroup`、`transport`、`riskLevel`、`requiresEditor`、`requiresRuntime`；当某个工具复用共享能力实现时，也会返回 `canonicalName`。

项目工具可以检查 `project.godot`、列出项目、读取和修改项目设置、用 Godot 原生格式配置 InputMap、运行/停止项目、按 export preset 导出、更新 Godot 4.4+ UID，并执行适合 CI、审查和发布流程的项目检查。场景和节点工具可以创建/打开/保存场景，读取场景树，添加、删除、重命名、复制和移动节点，用结构化 Variant 写入属性，管理节点分组，检查依赖，并执行跨场景属性修改。

脚本、文件系统和资源工具可以索引 GDScript、读写脚本、创建并挂载脚本、运行语法检查、读写/列出/搜索/删除项目文件、加载和保存资源、生成依赖图、检查导出预设，并预览资源内容。视觉工作流覆盖 shader、material、particle、UI theme/template、physics body、collision layer、navigation region/agent/mesh、lighting/environment、TileMap、animation track/keyframe 和 AnimationTree 状态机。

编辑器工具负责安装和检查内置 `godot-devtool` 插件，通过 WebSocket bridge 重载插件，读取实时编辑器选择，选择节点，执行 UndoRedo，并读写 Inspector 属性。Runtime 工具在游戏运行时工作：可以读取实时场景树和节点属性、写入运行时属性、截图/录帧、模拟输入 action、检查 UI 文本和按钮、等待节点、驱动导航、监控属性、录制/回放交互，并执行 QA 断言和压力检查。

更多使用约定见 [skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)。

## 全部 217 个工具

### 项目工具 (18)
| 工具 | 描述 |
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

### 场景工具 (51)
| 工具 | 描述 |
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

### 节点工具 (18)
| 工具 | 描述 |
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

### 脚本工具 (11)
| 工具 | 描述 |
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

### 编辑器工具 (9)
| 工具 | 描述 |
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

### 文件系统工具 (11)
| 工具 | 描述 |
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

### 资源工具 (16)
| 工具 | 描述 |
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

### 视觉工具 (26)
| 工具 | 描述 |
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

### 运行时工具 (20)
| 工具 | 描述 |
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

### 核心工具 (37)
| 工具 | 描述 |
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

