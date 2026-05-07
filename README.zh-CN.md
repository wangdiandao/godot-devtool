# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.4.1-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot 4 的 MCP server，用于让 AI 助手检查、编辑、验证和自动化运行中的 Godot 项目。2.3 版本继续采用 stdio/headless MCP server + 可选 localhost WebSocket bridge 架构，并把 README 扩展为更实用的安装和功能指南。

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
- 支持 stdio MCP server 的客户端，例如 Codex、Claude Code、Cursor、Cline、Roo Code、VS Code Copilot 或其他 MCP 客户端。
- 一个包含 `project.godot` 的 Godot 项目。

## 从 Release Zip 安装

1. 下载发布包：

   [godot-devtool-build-2.4.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.4.1/godot-devtool-build-2.4.1.zip)

2. 解压到稳定路径，例如：

   ```powershell
   Expand-Archive .\godot-devtool-build-2.4.1.zip E:\godot-devtool -Force
   ```

3. 确认 server 入口和插件文件存在：

   ```powershell
   Test-Path E:\godot-devtool\build\index.js
   Test-Path E:\godot-devtool\build\addons\godot_devtool\plugin.gd
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

插件已经包含在 release/build 包里。但每个需要实时 editor 或 runtime 路由的 Godot 项目，都需要安装一次插件。

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

使用 `runtime_ws` 工具前，需要先从 Godot 运行项目。编辑器插件在编辑器打开时连接；runtime bridge 在游戏运行时连接。

兼容名称仍然可用：

- `install_editor_bridge` -> `plugin_install`
- `editor_bridge_status` -> `plugin_status`
- `reload_plugin` -> `plugin_reload`

## 让 AI 协助安装

把 MCP server 加入客户端后，可以直接把这段提示词发给 AI：

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

英文提示词：

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

## 能做什么

请把 `get_capabilities` 当作真实能力来源。每个工具都会返回 `routeGroup`、`transport`、`riskLevel`、`requiresEditor`、`requiresRuntime` 和 `canonicalName`。

功能展示仅在呈现方式上参考公开的 [godot-mcp-pro README](https://github.com/youichi-uda/godot-mcp-pro/tree/master)：按表格展示功能分类，并让每个分类与说明一一对应。

## 全部 249 个工具

### 项目工具 (23)
| 工具 | 描述 |
|------|-------------|
| `add_autoload` | 添加自动加载。 |
| `export_project` | 导出项目。 |
| `get_autoload` | 获取自动加载。 |
| `get_input_actions` | 可执行兼容封装，转接到 `project_input_action` 路由并返回完成回执。 |
| `get_project_info` | 获取项目元数据、版本、视口和 autoload 信息。 |
| `get_project_settings` | 兼容别名，等同于 `project_get_settings`。 |
| `get_project_statistics` | 可执行兼容封装，转接到 `get_project_info` 路由并返回完成回执。 |
| `list_projects` | 列出项目。 |
| `play_scene` | 兼容别名，等同于 `run_project`。 |
| `project_get_info` | 兼容别名，等同于 `get_project_info`。 |
| `project_get_settings` | 读取 project.godot 设置。 |
| `project_input_action` | 列出或更新项目 InputMap 操作。 |
| `project_set_setting` | 更新 project.godot 设置，并提供 dry-run 预览和审计记录。 |
| `reload_project` | 重载项目。 |
| `remove_autoload` | 移除自动加载。 |
| `run_project` | 运行项目。 |
| `run_project_checks` | 运行稳定的项目检查，用于 CI、评审和发布流程。 |
| `set_input_action` | 可执行兼容封装，转接到 `project_input_action` 路由并返回完成回执。 |
| `set_project_setting` | 兼容别名，等同于 `project_set_setting`。 |
| `stop_project` | 停止项目。 |
| `stop_scene` | 兼容别名，等同于 `stop_project`。 |
| `uid_to_project_path` | UIDUIDto项目路径。 |
| `update_project_uids` | 更新项目UID。 |

### 场景工具 (55)
| 工具 | 描述 |
|------|-------------|
| `add_animation_track` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `add_audio_bus` | 添加音频总线。 |
| `add_audio_bus_effect` | 添加音频总线效果。 |
| `add_audio_player` | 可执行兼容封装，转接到 `audio` 路由并返回完成回执。 |
| `add_scene_instance` | 添加场景实例。 |
| `analyze_scene_complexity` | 分析场景complexity。 |
| `analyze_signal_flow` | 分析信号flow。 |
| `animation` | 动画动画。 |
| `animation_state_machine` | 动画动画状态机。 |
| `audio` | 音频音频。 |
| `bake_navigation_mesh` | 可执行兼容封装，转接到 `navigation` 路由并返回完成回执。 |
| `connect_signal` | 可执行兼容封装，转接到 `signal` 路由并返回完成回执。 |
| `create_animation` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `create_animation_tree` | 可执行兼容封装，转接到 `animation_state_machine` 路由并返回完成回执。 |
| `create_scene` | 创建新的 Godot 场景文件。 |
| `cross_scene_set_property` | 跨场景场景设置属性。 |
| `disconnect_signal` | 可执行兼容封装，转接到 `signal` 路由并返回完成回执。 |
| `find_signal_connections` | 查找信号connections。 |
| `get_animation_info` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `get_animation_tree_structure` | 获取动画树structure。 |
| `get_audio_bus_layout` | 可执行兼容封装，转接到 `audio` 路由并返回完成回执。 |
| `get_audio_info` | 可执行兼容封装，转接到 `audio` 路由并返回完成回执。 |
| `get_collision_info` | 可执行兼容封装，转接到 `physics` 路由并返回完成回执。 |
| `get_navigation_info` | 可执行兼容封装，转接到 `navigation` 路由并返回完成回执。 |
| `get_physics_layers` | 获取物理层。 |
| `get_scene_dependencies` | 获取场景依赖。 |
| `get_scene_tree` | 获取场景树结构。 |
| `get_signals` | 可执行兼容封装，转接到 `signal` 路由并返回完成回执。 |
| `list_animations` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `navigation` | 导航导航。 |
| `open_scene` | 兼容别名，等同于 `scene_open`。 |
| `physics` | 物理物理。 |
| `remove_animation` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `save_scene` | 保存场景到磁盘。 |
| `scene_create` | 兼容别名，等同于 `create_scene`。 |
| `scene_get_current` | 场景场景获取当前。 |
| `scene_get_tree` | 兼容别名，等同于 `get_scene_tree`。 |
| `scene_open` | 场景场景打开。 |
| `scene_save` | 兼容别名，等同于 `save_scene`。 |
| `set_animation_keyframe` | 可执行兼容封装，转接到 `animation` 路由并返回完成回执。 |
| `set_audio_bus` | 设置音频总线。 |
| `set_navigation_layers` | 设置导航层。 |
| `set_physics_layers` | 可执行兼容封装，转接到 `physics` 路由并返回完成回执。 |
| `setup_collision` | 可执行兼容封装，转接到 `physics` 路由并返回完成回执。 |
| `setup_navigation_agent` | 可执行兼容封装，转接到 `navigation` 路由并返回完成回执。 |
| `setup_navigation_region` | 可执行兼容封装，转接到 `navigation` 路由并返回完成回执。 |
| `setup_physics_body` | 可执行兼容封装，转接到 `physics` 路由并返回完成回执。 |
| `signal` | 信号信号。 |
| `tilemap` | TileMapTileMap。 |
| `tilemap_clear` | TileMapTileMap清理。 |
| `tilemap_fill_rect` | 可执行兼容封装，转接到 `tilemap` 路由并返回完成回执。 |
| `tilemap_get_cell` | TileMapTileMap获取cell。 |
| `tilemap_get_info` | 可执行兼容封装，转接到 `tilemap` 路由并返回完成回执。 |
| `tilemap_get_used_cells` | TileMapTileMap获取usedcells。 |
| `tilemap_set_cell` | 可执行兼容封装，转接到 `tilemap` 路由并返回完成回执。 |

### 节点工具 (26)
| 工具 | 描述 |
|------|-------------|
| `add_node` | 添加节点。 |
| `delete_node` | 删除节点。 |
| `duplicate_node` | 兼容别名，等同于 `node_duplicate`。 |
| `find_nearby_nodes` | 查找附近节点。 |
| `find_node_references` | 查找节点引用。 |
| `find_nodes_by_type` | 可执行兼容封装，转接到 `node_find` 路由并返回完成回执。 |
| `find_nodes_in_group` | 查找节点in分组。 |
| `get_node_groups` | 获取节点分组。 |
| `get_node_properties` | 获取节点属性。 |
| `group` | 分组分组。 |
| `move_node` | 兼容别名，等同于 `node_move`。 |
| `node_add` | 兼容别名，等同于 `add_node`。 |
| `node_delete` | 兼容别名，等同于 `delete_node`。 |
| `node_duplicate` | 节点节点复制。 |
| `node_find` | 节点节点查找。 |
| `node_get` | 节点节点获取。 |
| `node_get_property` | 节点节点获取属性。 |
| `node_move` | 节点节点移动。 |
| `node_rename` | 兼容别名，等同于 `rename_node`。 |
| `node_set_property` | 节点节点设置属性。 |
| `rename_node` | 重命名节点。 |
| `set_blend_tree_node` | 设置混合树节点。 |
| `set_node_groups` | 设置节点分组。 |
| `update_node_properties` | 更新节点属性。 |
| `update_property` | 兼容别名，等同于 `node_set_property`。 |
| `wait_for_node` | 等待等待for节点。 |

### 脚本工具 (15)
| 工具 | 描述 |
|------|-------------|
| `analyze_script_references` | 分析脚本引用。 |
| `attach_script` | 兼容别名，等同于 `script_attach`。 |
| `check_gdscript_syntax` | 执行checkgdscript语法。 |
| `create_script` | 兼容别名，等同于 `script_create`。 |
| `edit_script` | 可执行兼容封装，转接到 `script_write` 路由并返回完成回执。 |
| `execute_editor_script` | 执行编辑器脚本。 |
| `find_nodes_by_script` | 查找节点by脚本。 |
| `find_script_references` | 查找脚本引用。 |
| `get_open_scripts` | 获取打开脚本。 |
| `get_script_index` | 列出 GDScript 文件及类、基类、导出变量和函数信息。 |
| `list_scripts` | 兼容别名，等同于 `get_script_index`。 |
| `script_attach` | 脚本脚本挂载。 |
| `script_create` | 脚本脚本创建。 |
| `script_write` | 脚本脚本write。 |
| `validate_script` | 兼容别名，等同于 `check_gdscript_syntax`。 |

### 编辑器工具 (11)
| 工具 | 描述 |
|------|-------------|
| `editor_bridge_status` | 兼容别名，等同于 `plugin_status`。 |
| `editor_get_selection` | 编辑器编辑器获取selection。 |
| `editor_inspector_get_properties` | 编辑器编辑器inspector获取属性。 |
| `editor_inspector_set_properties` | 编辑器编辑器inspector设置属性。 |
| `editor_select_node` | 编辑器编辑器select节点。 |
| `editor_undo_redo` | 编辑器编辑器undoredo。 |
| `install_editor_bridge` | 兼容别名，等同于 `plugin_install`。 |
| `plugin_install` | 把 godot-devtool WebSocket 编辑器/运行时插件安装到 Godot 项目。 |
| `plugin_reload` | 通过 WebSocket bridge 重载 godot-devtool 编辑器插件。 |
| `plugin_status` | 读取插件安装状态、WebSocket 配置和连接状态。 |
| `reload_plugin` | 重载plugin。 |

### 文件系统工具 (13)
| 工具 | 描述 |
|------|-------------|
| `delete_scene` | 可执行兼容封装，转接到 `filesystem_delete` 路由并返回完成回执。 |
| `filesystem_delete` | 文件系统文件系统删除。 |
| `filesystem_list` | 列出项目内文件和目录。 |
| `filesystem_preview_delete` | 文件系统文件系统预览删除。 |
| `filesystem_read` | 读取项目内 UTF-8 文本文件。 |
| `filesystem_write` | 写入项目内 UTF-8 文本文件。 |
| `get_filesystem_tree` | 可执行兼容封装，转接到 `filesystem_list` 路由并返回完成回执。 |
| `get_scene_file_content` | 可执行兼容封装，转接到 `filesystem_read` 路由并返回完成回执。 |
| `read_script` | 兼容别名，等同于 `read_script_file`。 |
| `read_script_file` | 读取脚本文件。 |
| `script_read` | 兼容别名，等同于 `read_script_file`。 |
| `search_files` | 搜索文件。 |
| `search_in_files` | 搜索in文件。 |

### 资源工具 (20)
| 工具 | 描述 |
|------|-------------|
| `add_resource` | 可执行兼容封装，转接到 `resource_create` 路由并返回完成回执。 |
| `check_export_presets` | 执行check导出预设。 |
| `create_resource` | 兼容别名，等同于 `resource_create`。 |
| `edit_resource` | 可执行兼容封装，转接到 `resource_save` 路由并返回完成回执。 |
| `export_matrix` | 导出matrix。 |
| `export_mesh_library` | 导出网格library。 |
| `find_unused_resources` | 可执行兼容封装，转接到 `resource_dependency_graph` 路由并返回完成回执。 |
| `get_export_info` | 可执行兼容封装，转接到 `export_matrix` 路由并返回完成回执。 |
| `get_export_presets` | 获取导出预设。 |
| `get_resource_index` | 获取资源index。 |
| `get_resource_preview` | 获取资源预览。 |
| `get_uid` | 获取UID。 |
| `list_export_presets` | 兼容别名，等同于 `get_export_presets`。 |
| `project_path_to_uid` | 兼容别名，等同于 `get_uid`。 |
| `read_resource` | 兼容别名，等同于 `resource_load`。 |
| `resource_create` | 资源资源创建。 |
| `resource_dependency_graph` | 构建资源依赖图并识别孤立资源。 |
| `resource_load` | 资源资源load。 |
| `resource_save` | 资源资源保存。 |
| `update_export_preset` | 更新导出预设。 |

### 视觉工具 (26)
| 工具 | 描述 |
|------|-------------|
| `apply_particle_preset` | 应用粒子预设。 |
| `assign_shader_material` | 可执行兼容封装，转接到 `material` 路由并返回完成回执。 |
| `create_particles` | 可执行兼容封装，转接到 `particle` 路由并返回完成回执。 |
| `create_shader` | 可执行兼容封装，转接到 `shader` 路由并返回完成回执。 |
| `create_theme` | 可执行兼容封装，转接到 `ui` 路由并返回完成回执。 |
| `edit_shader` | 编辑着色器。 |
| `find_ui_elements` | 查找UIelements。 |
| `get_particle_info` | 获取粒子信息。 |
| `get_shader_params` | 可执行兼容封装，转接到 `shader` 路由并返回完成回执。 |
| `get_theme_info` | 获取主题信息。 |
| `lighting` | 灯光灯光。 |
| `material` | 材质材质。 |
| `particle` | 粒子粒子。 |
| `read_shader` | 可执行兼容封装，转接到 `shader` 路由并返回完成回执。 |
| `set_material_3d` | 可执行兼容封装，转接到 `material` 路由并返回完成回执。 |
| `set_particle_color_gradient` | 设置粒子颜色gradient。 |
| `set_particle_material` | 设置粒子材质。 |
| `set_shader_param` | 可执行兼容封装，转接到 `shader` 路由并返回完成回执。 |
| `set_theme_color` | 设置主题颜色。 |
| `set_theme_constant` | 设置主题常量。 |
| `set_theme_font_size` | 设置主题字体大小。 |
| `set_theme_stylebox` | 设置主题StyleBox。 |
| `setup_environment` | 可执行兼容封装，转接到 `lighting` 路由并返回完成回执。 |
| `setup_lighting` | 可执行兼容封装，转接到 `lighting` 路由并返回完成回执。 |
| `shader` | 着色器着色器。 |
| `ui` | UIUI。 |

### 运行时工具 (20)
| 工具 | 描述 |
|------|-------------|
| `assert_node_state` | 断言节点状态。 |
| `assert_screen_text` | 断言屏幕文本。 |
| `compare_screenshots` | 对比截图。 |
| `create_workflow_test_scene` | 创建workflowtest场景。 |
| `execute_game_script` | 执行游戏脚本。 |
| `get_editor_screenshot` | 截取 Godot 编辑器画面。 |
| `get_game_node_properties` | 读取运行中游戏节点属性。 |
| `get_game_scene_tree` | 获取运行中游戏的场景树。 |
| `get_game_screenshot` | 截取运行中游戏画面。 |
| `get_test_report` | 获取test报告。 |
| `replay_recording` | 回放录制。 |
| `run_test_scenario` | 运行test场景测试。 |
| `set_game_node_property` | 写入运行中游戏节点属性。 |
| `simulate_action` | 模拟操作。 |
| `simulate_key` | 模拟按键。 |
| `simulate_mouse_click` | 模拟鼠标click。 |
| `simulate_mouse_move` | 模拟鼠标移动。 |
| `simulate_sequence` | 模拟序列。 |
| `start_recording` | 开始录制。 |
| `stop_recording` | 停止录制。 |

### 核心工具 (40)
| 工具 | 描述 |
|------|-------------|
| `add_gridmap` | 添加GridMap。 |
| `add_mesh_instance` | 添加网格实例。 |
| `add_raycast` | 添加RayCast。 |
| `add_state_machine_state` | 添加状态机状态。 |
| `add_state_machine_transition` | 添加状态机transition。 |
| `batch_get_properties` | 批量获取属性。 |
| `batch_set_property` | 批量设置属性。 |
| `capture_frames` | 捕获帧。 |
| `clear_debug_output` | 清理调试输出。 |
| `clear_output` | 兼容别名，等同于 `clear_debug_output`。 |
| `click_button_by_text` | 执行click按钮by文本。 |
| `create_gameplay_prototype` | 创建gameplayprototype。 |
| `debug_get_logs` | 兼容别名，等同于 `get_debug_output`。 |
| `detect_circular_dependencies` | 检测循环依赖。 |
| `generate_ci_snippet` | 生成 GitHub Actions 或 GitLab CI 片段。 |
| `geometry` | 执行geometry。 |
| `get_audit_log` | 获取审计日志。 |
| `get_audit_replay` | 获取审计回放。 |
| `get_capabilities` | 列出 MCP 工具能力、路由分组、传输方式和风险等级。 |
| `get_debug_output` | 获取调试输出。 |
| `get_editor_errors` | 获取编辑器错误。 |
| `get_editor_performance` | 获取编辑器性能。 |
| `get_godot_version` | 获取 Godot 可执行文件版本。 |
| `get_output_log` | 兼容别名，等同于 `get_debug_output`。 |
| `get_performance_monitors` | 获取性能监视器。 |
| `get_rollback_suggestions` | 获取回滚suggestions。 |
| `get_safety_policy` | 获取安全策略。 |
| `launch_editor` | 执行launch编辑器。 |
| `load_sprite` | 执行loadsprite。 |
| `monitor_properties` | 监控属性。 |
| `move_to` | 移动to。 |
| `navigate_to` | 导航导航to。 |
| `preview_write_safety` | 预览write安全。 |
| `remove_state_machine_state` | 移除状态机状态。 |
| `remove_state_machine_transition` | 移除状态机transition。 |
| `run_stress_test` | 运行压力test。 |
| `set_anchor_preset` | 设置anchor预设。 |
| `set_safety_policy` | 设置安全策略。 |
| `set_tree_parameter` | 设置树参数。 |
| `setup_camera_3d` | 配置摄像机3d。 |

## 应该用哪个路由

- 项目检查、文件编辑、设置、索引、安全策略和依赖检查，优先用 `native`。
- 需要 Godot 正确加载或修改场景/资源/脚本时，用 `headless_godot`。
- 只有当前编辑器状态很重要时，才用 `editor_ws`。
- 只有游戏已经运行、且需要实时游戏状态、输入、截图或 QA 断言时，才用 `runtime_ws`。
- 自动化陌生流程前，先调用 `get_capabilities`。

## 验证

静态和打包检查：

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:plugin
npm.cmd run verify:all
```

依赖 Godot 的检查需要 `GODOT_PATH`：

```bash
npm.cmd run verify:runtime
npm.cmd run check:project -- E:/test
```

## 故障排查

- `get_godot_version` 失败：把 `GODOT_PATH` 设置为准确的 Godot 可执行文件路径。
- `plugin_status` 显示未安装：对正确项目路径运行 `plugin_install`。
- editor 路由超时：打开 Godot 项目并启用插件。
- runtime 路由超时：运行游戏，让 `DevtoolRuntime` autoload 连接。
- 端口冲突：修改 `GODOT_DEVTOOL_WS_PORT`，并用相同 `websocketPort` 重新安装插件。
- MCP 客户端无法启动 server：确认 `node` 可用，且 `build/index.js` 存在。

## Skill

Agent 使用指南位于：

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

该 Skill 会教 AI 助手先检查项目状态，再选择合适路由；只有需要实时编辑器或运行时状态时才安装/使用 WebSocket 插件，并在结束前执行验证。
