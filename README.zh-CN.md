# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

[请我喝一杯咖啡（爱发电）](https://afdian.com/a/wangdiandao)，如果这个项目对你有帮助。

`godot-devtool` 是面向 Godot 4 的 MCP server，用于让 AI 助手检查、编辑、验证和自动化运行中的 Godot 项目。stdio MCP server 启动时不会占用 WebSocket bridge 端口；bridge 工具会按需打开本地 bridge，并在 `run_project` 仍有活跃进程或 runtime client 已连接时保持监听；其它情况下会在工具调用清理阶段释放端口。

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
- editor 路由通过内置 WebSocket 插件处理实时选择、Inspector 写入、UndoRedo 场景修改、场景保存和插件重载。
- runtime 路由通过已安装的 autoload bridge 处理运行中场景树、属性、输入模拟、截图和 QA 检查。
- Browser visualizer 路由提供本地只读 HTTP 仪表盘，用于查看 bridge/client 状态和实时路由提示。
- 本地 WebSocket listener 是共享 broker，多个 MCP client 或 AI Agent 可以复用同一个 bridge 端口，而不是各自独占启动 listener。
- editor 和 runtime session 使用 `projectPath`、`context`、`sessionId`、`runId` 定位；实时目标不唯一时会返回候选项，不会静默猜测。
- `run_project` 会创建可追踪的运行实例。多游戏实例并行时，使用 `list_run_instances`、`get_debug_output`、`stop_project` 和 `stop_run_instance` 配合 `runId` 定位。
- `get_capabilities` 支持 `project_setup`、`live_editor`、`runtime_test`、`multi_instance`、`release_verify` 等 workflow 过滤，减少助手上下文占用。

## 环境要求

- Node.js 18 或更新版本。
- Godot 4.x。除非 `godot` 已经在 `PATH` 中，否则需要设置 `GODOT_PATH`。
- 支持 stdio MCP server 的客户端，例如 Codex、Claude Code、Cursor、Cline、Roo Code、VS Code Copilot 或其它 MCP 客户端。
- 一个包含 `project.godot` 的 Godot 项目。

## 从本地构建安装

1. 从源码构建，或把已发布的 release zip 解压到稳定路径。本版本的 release asset 名称是 `godot-devtool-build-3.0.0.zip`。

   ```powershell
   Expand-Archive ".\godot-devtool-build-3.0.0.zip" "E:\godot-devtool" -Force
   ```

2. 确认 server 入口和插件文件存在：

   ```powershell
   Test-Path "E:\godot-devtool\build\index.js"
   Test-Path "E:\godot-devtool\build\addons\godot_devtool\plugin.gd"
   ```

3. 把 MCP server 加入客户端配置：

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

   Codex Desktop 使用 `config.toml` 的 TOML 格式：

   ```toml
   [mcp_servers.godot-devtool]
   command = "node"
   args = ["E:/godot-devtool/build/index.js"]
   env = { GODOT_PATH = "D:/Program Files/Godot/Godot_v4.x.exe", GODOT_DEVTOOL_WS_PORT = "8766" }
   ```

4. 重启 MCP 客户端，并让它调用：

   ```text
   get_godot_version
   get_capabilities
   get_capabilities {"toolNames":["plugin_install","plugin_status","plugin_cleanup_port"],"includeSchemas":true}
   ```

`GODOT_DEVTOOL_WS_PORT` 默认是 `8766`。stdio MCP server 仍会启动但不会立即打开该端口。bridge 工具按需打开端口；纯 editor 调用会在清理阶段释放监听，而通过 `run_project` 启动的项目或已经连接的 runtime client 会保持 listener，避免 runtime 命令依赖单次调用窗口内的重连。如果另一个 `godot-devtool` 进程已经占用同一端口，broker-aware 调用可以通过已有 listener 转发，而不是杀掉它。

如果某个 bridge 工具运行时发现端口已被其它监听进程占用，使用 `plugin_status` 和 `plugin_cleanup_port` 检查监听者。只有确认监听进程已经过期时，才调用带 `kill=true` 的 `plugin_cleanup_port`；单纯换端口会创建另一套 bridge，不能接管已经连接到旧 bridge 的 editor client。

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
1. 调用 get_godot_version 和 get_capabilities，先获取轻量工具目录。
2. 确认 plugin_install、plugin_status、plugin_reload、plugin_cleanup_port 可用。
3. 如果需要输入 schema，调用 get_capabilities，传入 toolNames=["plugin_install","plugin_status","plugin_reload","plugin_cleanup_port"] 和 includeSchemas=true。
4. 对上述项目路径调用 plugin_install，overwrite=true。
5. 调用 plugin_status，总结已安装文件、autoload 注册、bridge mode 和 WebSocket 端口。
6. 告诉我在 Godot 编辑器里如何启用插件。
7. 如果需要 runtime 路由，提醒我运行项目后再验证 runtime bridge 状态。
不要修改无关文件。
```

English prompt:

```text
Use the godot-devtool MCP server to install and verify the Godot plugin for my project.

Project path: "E:/my-godot-project"
WebSocket port: 8766

Steps:
1. Call get_godot_version and get_capabilities for the lightweight tool catalog.
2. Confirm plugin_install, plugin_status, plugin_reload, and plugin_cleanup_port are available.
3. If you need input schemas, call get_capabilities with toolNames=["plugin_install","plugin_status","plugin_reload","plugin_cleanup_port"] and includeSchemas=true.
4. Call plugin_install with overwrite=true for the project path above.
5. Call plugin_status and summarize installed files, autoload registration, bridge mode, and WebSocket port.
6. Tell me exactly how to enable the plugin in Godot.
7. If runtime routes are needed, tell me to run the project and then verify runtime bridge status.
Do not edit unrelated files.
```

## 能做什么

请把 `get_capabilities` 当作真实能力来源。默认调用只返回轻量工具目录，包括 `routeGroup`、`transport`、`riskLevel`、`requiresEditor`、`requiresRuntime`；当某个工具复用共享能力实现时，也会返回 `canonicalName`。默认响应不包含输入 schema。需要 schema 时，先用 `routeGroup`、`transport`、`riskLevel`、`toolNames` 或 `query` 缩小范围，再设置 `includeSchemas=true`；未过滤的 schema 请求会被拒绝，避免返回体过大。

项目工具可以检查 `project.godot`、列出项目、读取和修改项目设置、用 Godot 原生格式配置 InputMap、运行/停止项目、按 export preset 导出、更新 Godot 4.4+ UID，并执行适合 CI、审查和发布流程的项目检查。场景和节点工具可以创建/打开/保存场景，读取场景树，添加、删除、重命名、复制和移动节点，用结构化 Variant 写入属性，管理节点分组，检查依赖，并执行跨场景属性修改。

脚本、文件系统和资源工具可以索引 GDScript、读写脚本、创建并挂载脚本、运行语法检查、读写/列出/搜索/删除项目文件、加载和保存资源、生成依赖图、检查导出预设，并预览资源内容。视觉工作流覆盖 shader、material、particle、UI theme/template、physics body、collision layer、navigation region/agent/mesh、lighting/environment、TileMap、animation track/keyframe 和 AnimationTree 状态机。

编辑器工具负责安装和检查内置 `godot-devtool` 插件，通过 WebSocket bridge 重载插件，读取实时编辑器选择，选择节点，执行 UndoRedo，读写 Inspector 属性，并在当前打开的场景里添加、删除、重命名、移动、复制节点，不再要求从外部磁盘重新加载场景。`GDT` dock 会显示连接状态、当前编辑场景、选择、实时编辑可用性、保存模式、runtime session 诊断和最近命令结果。Runtime 工具在游戏运行时工作：可以读取实时场景树和节点属性、写入运行时属性、截图/录帧、模拟输入 action、检查 UI 文本和按钮、等待节点、驱动导航、监控属性、录制/回放交互，并执行 QA 断言和压力检查。

Browser visualizer 工具用于启动、查看和停止本地只读仪表盘。调用 `browser_visualizer_start` 后会得到 `http://127.0.0.1:<port>/` 页面，页面会刷新 bridge 状态、已连接 editor/runtime client、待处理命令数量，以及可继续从 MCP client 调用的截图、场景树和输入路由名称。

更多使用约定见 [skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)。

## 全部 234 个工具

### 项目工具 (18)
| 工具 | 描述 |
|------|-------------|
| `add_autoload` | 添加自动加载。 |
| `export_project` | 导出项目。 |
| `get_autoload` | 获取自动加载。 |
| `get_input_actions` | 获取输入操作。 |
| `get_project_info` | 获取项目元数据、版本、视口和 autoload 信息。 |
| `get_project_statistics` | 获取项目统计。 |
| `list_projects` | 列出项目。 |
| `project_get_settings` | 读取 project.godot 设置。 |
| `project_input_action` | 列出或更新项目 InputMap 操作。 |
| `project_set_setting` | 更新 project.godot 设置，并提供 dry-run 预览和审计记录。 |
| `reload_project` | 重载项目。 |
| `remove_autoload` | 移除自动加载。 |
| `run_project` | 运行项目。 |
| `run_project_checks` | 运行稳定的项目检查，用于 CI、评审和发布流程。 |
| `set_input_action` | 设置输入操作。 |
| `stop_project` | 停止项目。 |
| `uid_to_project_path` | UIDUIDto项目路径。 |
| `update_project_uids` | 更新项目UID。 |

### 场景工具 (51)
| 工具 | 描述 |
|------|-------------|
| `add_animation_track` | 添加动画track。 |
| `add_audio_bus` | 添加音频总线。 |
| `add_audio_bus_effect` | 添加音频总线效果。 |
| `add_audio_player` | 添加音频player。 |
| `add_scene_instance` | 添加场景实例。 |
| `analyze_scene_complexity` | 分析场景complexity。 |
| `analyze_signal_flow` | 分析信号flow。 |
| `animation` | 动画动画。 |
| `animation_state_machine` | 动画动画状态机。 |
| `audio` | 音频音频。 |
| `bake_navigation_mesh` | 烘焙导航网格。 |
| `connect_signal` | 连接信号。 |
| `create_animation` | 创建动画。 |
| `create_animation_tree` | 创建动画树。 |
| `create_scene` | 创建新的 Godot 场景文件。 |
| `cross_scene_set_property` | 跨场景场景设置属性。 |
| `disconnect_signal` | 断开信号。 |
| `find_signal_connections` | 查找信号connections。 |
| `get_animation_info` | 获取动画信息。 |
| `get_animation_tree_structure` | 获取动画树structure。 |
| `get_audio_bus_layout` | 获取音频总线布局。 |
| `get_audio_info` | 获取音频信息。 |
| `get_collision_info` | 获取碰撞信息。 |
| `get_navigation_info` | 获取导航信息。 |
| `get_physics_layers` | 获取物理层。 |
| `get_scene_dependencies` | 获取场景依赖。 |
| `get_scene_tree` | 获取场景树结构。 |
| `get_signals` | 获取信号。 |
| `list_animations` | 列出动画。 |
| `navigation` | 导航导航。 |
| `physics` | 物理物理。 |
| `remove_animation` | 移除动画。 |
| `save_scene` | 保存场景到磁盘。 |
| `scene_get_current` | 场景场景获取当前。 |
| `scene_open` | 场景场景打开。 |
| `set_animation_keyframe` | 设置动画keyframe。 |
| `set_audio_bus` | 设置音频总线。 |
| `set_navigation_layers` | 设置导航层。 |
| `set_physics_layers` | 设置物理层。 |
| `setup_collision` | 配置碰撞。 |
| `setup_navigation_agent` | 配置导航agent。 |
| `setup_navigation_region` | 配置导航region。 |
| `setup_physics_body` | 配置物理body。 |
| `signal` | 信号信号。 |
| `tilemap` | 创建、列出并编辑 TileMapLayer 或旧版 TileMap 节点。 |
| `tilemap_clear` | 清空 TileMap 单元格。 |
| `tilemap_fill_rect` | 用指定图块填充 TileMap 矩形区域。 |
| `tilemap_get_cell` | 读取 TileMap 指定单元格。 |
| `tilemap_get_info` | 列出场景中的 TileMap 信息。 |
| `tilemap_get_used_cells` | 列出 TileMap 已使用单元格。 |
| `tilemap_set_cell` | 设置 TileMap 指定单元格。 |

### 节点工具 (17)
| 工具 | 描述 |
|------|-------------|
| `add_node` | 添加节点。 |
| `delete_node` | 删除节点。 |
| `find_node_references` | 查找节点引用。 |
| `find_nodes_by_type` | 查找节点by类型。 |
| `find_nodes_in_group` | 查找节点in分组。 |
| `get_node_groups` | 获取节点分组。 |
| `get_node_properties` | 获取节点属性。 |
| `group` | 分组分组。 |
| `move_node` | 移动或重新挂载节点。 |
| `node_duplicate` | 节点节点复制。 |
| `node_find` | 节点节点查找。 |
| `node_get` | 节点节点获取。 |
| `node_move` | 移动或重新挂载节点。 |
| `rename_node` | 重命名节点。 |
| `set_blend_tree_node` | 设置混合树节点。 |
| `set_node_groups` | 设置节点分组。 |
| `update_node_properties` | 更新节点属性。 |

### 脚本工具 (11)
| 工具 | 描述 |
|------|-------------|
| `analyze_script_references` | 分析脚本引用。 |
| `check_gdscript_syntax` | 执行checkgdscript语法。 |
| `edit_script` | 编辑脚本。 |
| `execute_editor_script` | 执行编辑器脚本。 |
| `find_nodes_by_script` | 查找节点by脚本。 |
| `find_script_references` | 查找脚本引用。 |
| `get_open_scripts` | 获取打开脚本。 |
| `get_script_index` | 列出 GDScript 文件及类、基类、导出变量和函数信息。 |
| `script_attach` | 脚本脚本挂载。 |
| `script_create` | 脚本脚本创建。 |
| `script_write` | 脚本脚本write。 |

### 编辑器工具 (16)
| 工具 | 描述 |
|------|-------------|
| `editor_add_node` | 通过实时编辑器 bridge 和 UndoRedo 向当前打开的场景添加节点。 |
| `editor_delete_node` | 通过实时编辑器 bridge 和 UndoRedo 删除当前打开场景中的非根节点。 |
| `editor_duplicate_node` | 通过实时编辑器 bridge 和 UndoRedo 复制当前打开场景中的节点。 |
| `editor_get_selection` | 编辑器编辑器获取selection。 |
| `editor_inspector_get_properties` | 编辑器编辑器inspector获取属性。 |
| `editor_inspector_set_properties` | 编辑器编辑器inspector设置属性。 |
| `editor_move_node` | 通过实时编辑器 bridge 和 UndoRedo 移动或重新挂载当前打开场景中的节点。 |
| `editor_rename_node` | 通过实时编辑器 bridge 和 UndoRedo 重命名当前打开场景中的节点。 |
| `editor_save_scene` | 通过实时编辑器 bridge 保存当前打开的场景。 |
| `editor_select_node` | 编辑器编辑器select节点。 |
| `editor_undo_redo` | 编辑器编辑器undoredo。 |
| `plugin_cleanup_port` | 显式检查并可选择停止指定端口上的旧 godot-devtool WebSocket bridge 监听进程。 |
| `plugin_install` | 把 godot-devtool WebSocket 编辑器/运行时插件安装到 Godot 项目。 |
| `plugin_reload` | 通过 WebSocket bridge 重载 godot-devtool 编辑器插件。 |
| `plugin_status` | 读取插件安装状态、WebSocket 配置和连接状态。 |
| `reload_plugin` | 重载plugin。 |

### 文件系统工具 (11)
| 工具 | 描述 |
|------|-------------|
| `delete_scene` | 删除场景。 |
| `filesystem_delete` | 文件系统文件系统删除。 |
| `filesystem_list` | 列出项目内文件和目录。 |
| `filesystem_preview_delete` | 文件系统文件系统预览删除。 |
| `filesystem_read` | 读取项目内 UTF-8 文本文件。 |
| `filesystem_write` | 写入项目内 UTF-8 文本文件。 |
| `get_filesystem_tree` | 获取文件系统树。 |
| `get_scene_file_content` | 获取场景文件内容。 |
| `read_script_file` | 读取脚本文件。 |
| `search_files` | 搜索文件。 |
| `search_in_files` | 搜索in文件。 |

### 资源工具 (16)
| 工具 | 描述 |
|------|-------------|
| `add_resource` | 添加资源。 |
| `check_export_presets` | 执行check导出预设。 |
| `edit_resource` | 编辑资源。 |
| `export_matrix` | 导出matrix。 |
| `export_mesh_library` | 导出网格library。 |
| `find_unused_resources` | 查找未使用资源。 |
| `get_export_info` | 获取导出信息。 |
| `get_export_presets` | 获取导出预设。 |
| `get_resource_index` | 获取资源index。 |
| `get_resource_preview` | 获取资源预览。 |
| `get_uid` | 获取UID。 |
| `resource_create` | 资源资源创建。 |
| `resource_dependency_graph` | 构建资源依赖图并识别孤立资源。 |
| `resource_load` | 资源资源load。 |
| `resource_save` | 资源资源保存。 |
| `update_export_preset` | 更新导出预设。 |

### 视觉工具 (25)
| 工具 | 描述 |
|------|-------------|
| `apply_particle_preset` | 应用粒子预设。 |
| `assign_shader_material` | 分配着色器材质。 |
| `create_particles` | 创建粒子。 |
| `create_shader` | 创建着色器。 |
| `create_theme` | 创建主题。 |
| `edit_shader` | 编辑着色器。 |
| `get_particle_info` | 获取粒子信息。 |
| `get_shader_params` | 获取着色器参数。 |
| `get_theme_info` | 获取主题信息。 |
| `lighting` | 灯光灯光。 |
| `material` | 材质材质。 |
| `particle` | 粒子粒子。 |
| `read_shader` | 读取着色器。 |
| `set_material_3d` | 设置材质3d。 |
| `set_particle_color_gradient` | 设置粒子颜色gradient。 |
| `set_particle_material` | 设置粒子材质。 |
| `set_shader_param` | 设置着色器参数。 |
| `set_theme_color` | 设置主题颜色。 |
| `set_theme_constant` | 设置主题常量。 |
| `set_theme_font_size` | 设置主题字体大小。 |
| `set_theme_stylebox` | 设置主题StyleBox。 |
| `setup_environment` | 配置环境。 |
| `setup_lighting` | 配置灯光。 |
| `shader` | 着色器着色器。 |
| `ui` | UIUI。 |

### 运行时工具 (30)
| 工具 | 描述 |
|------|-------------|
| `assert_node_state` | 断言节点状态。 |
| `assert_screen_text` | 断言屏幕文本。 |
| `capture_frames` | 捕获帧。 |
| `click_button_by_text` | 执行click按钮by文本。 |
| `compare_screenshots` | 对比截图。 |
| `create_workflow_test_scene` | 创建workflowtest场景。 |
| `execute_game_script` | 执行游戏脚本。 |
| `find_nearby_nodes` | 查找附近节点。 |
| `find_ui_elements` | 查找UIelements。 |
| `get_editor_screenshot` | 截取 Godot 编辑器画面。 |
| `get_game_node_properties` | 读取运行中游戏节点属性。 |
| `get_game_scene_tree` | 获取运行中游戏的场景树。 |
| `get_game_screenshot` | 截取运行中游戏画面。 |
| `get_performance_monitors` | 获取性能监视器。 |
| `get_test_report` | 获取test报告。 |
| `monitor_properties` | 监控属性。 |
| `move_to` | 移动to。 |
| `navigate_to` | 导航导航to。 |
| `replay_recording` | 回放录制。 |
| `run_stress_test` | 运行压力test。 |
| `run_test_scenario` | 运行test场景测试。 |
| `set_game_node_property` | 写入运行中游戏节点属性。 |
| `simulate_action` | 模拟操作。 |
| `simulate_key` | 模拟按键。 |
| `simulate_mouse_click` | 模拟鼠标click。 |
| `simulate_mouse_move` | 模拟鼠标移动。 |
| `simulate_sequence` | 模拟序列。 |
| `start_recording` | 开始录制。 |
| `stop_recording` | 停止录制。 |
| `wait_for_node` | 等待等待for节点。 |

### 核心工具 (39)
| 工具 | 描述 |
|------|-------------|
| `add_gridmap` | 添加GridMap。 |
| `add_mesh_instance` | 添加网格实例。 |
| `add_raycast` | 添加RayCast。 |
| `add_state_machine_state` | 添加状态机状态。 |
| `add_state_machine_transition` | 添加状态机transition。 |
| `batch_get_properties` | 批量获取属性。 |
| `batch_set_property` | 批量设置属性。 |
| `broker_cleanup_idle` | 执行brokercleanupidle。 |
| `broker_status` | 执行broker状态。 |
| `browser_visualizer_start` | 启动本地只读 Browser visualizer 仪表盘。 |
| `browser_visualizer_status` | 读取 Browser visualizer URL、项目过滤器和已连接 bridge client。 |
| `browser_visualizer_stop` | 停止本地 Browser visualizer HTTP 仪表盘。 |
| `clear_debug_output` | 清理调试输出。 |
| `create_gameplay_prototype` | 创建gameplayprototype。 |
| `detect_circular_dependencies` | 检测循环依赖。 |
| `generate_ci_snippet` | 生成 GitHub Actions 或 GitLab CI 片段。 |
| `geometry` | 执行geometry。 |
| `get_audit_log` | 获取审计日志。 |
| `get_audit_replay` | 获取审计回放。 |
| `get_capabilities` | 默认返回轻量 MCP 工具目录，并可按路由分组、传输方式、风险等级、工具名或查询词返回过滤后的输入 schema。 |
| `get_debug_output` | 获取调试输出。 |
| `get_editor_errors` | 获取编辑器错误。 |
| `get_editor_performance` | 获取编辑器性能。 |
| `get_godot_version` | 获取 Godot 可执行文件版本。 |
| `get_rollback_suggestions` | 获取回滚suggestions。 |
| `get_safety_policy` | 获取安全策略。 |
| `launch_editor` | 执行launch编辑器。 |
| `list_bridge_sessions` | 列出bridgesessions。 |
| `list_run_instances` | 列出运行instances。 |
| `load_sprite` | 执行loadsprite。 |
| `preview_write_safety` | 预览write安全。 |
| `remove_state_machine_state` | 移除状态机状态。 |
| `remove_state_machine_transition` | 移除状态机transition。 |
| `resolve_bridge_target` | 执行resolvebridgetarget。 |
| `set_anchor_preset` | 设置anchor预设。 |
| `set_safety_policy` | 设置安全策略。 |
| `set_tree_parameter` | 设置树参数。 |
| `setup_camera_3d` | 配置摄像机3d。 |
| `stop_run_instance` | 停止运行实例。 |

## 应该用哪种路由？

- 默认使用 `native` 文件系统和项目分析工具。
- 场景、节点、资源或脚本需要 Godot 解析时，使用 `headless_godot`。
- 只有当前编辑器状态重要时，才使用 `editor_ws`。
- 只有游戏正在运行，并且需要实时游戏状态、输入、截图或 QA 断言时，才使用 `runtime_ws`。
- 不熟悉工作流前，先调用 `get_capabilities`。只为当前路由分组或精确工具名请求 schema。

## 验证

静态和打包检查：

```bash
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:visualizer
npm.cmd run verify:plugin
```

完整发布检查需要 `GODOT_PATH` 和本地 Godot runtime：

```bash
npm.cmd run verify:runtime
npm.cmd run verify:process
npm.cmd run verify:security
npm.cmd run verify:all
npm.cmd run check:project -- "C:/path/to/your-godot-project"
```

开发分支完成并通过必要验证后，必须合并到 `main`，然后才视为该分支完成。

## 故障排查

- 找不到 Godot：在 MCP client env 中设置 `GODOT_PATH`，然后调用 `get_godot_version`。
- 编辑器路由超时：打开 Godot 项目并启用插件。
- Runtime 路由超时：运行游戏，让 `DevtoolRuntime` autoload 连接。
- Browser visualizer 页面没有 client：先启动 MCP server，再打开 Godot 编辑器或运行项目。
- 端口冲突：先用 `plugin_cleanup_port` 检查监听者；只停止确认过期的监听进程，或在确实需要隔离 bridge 时设置匹配的备用 `GODOT_DEVTOOL_WS_PORT` 并用同一个 `websocketPort` 重新安装插件。
- MCP client 无法启动 server：确认 `node` 可用，并且 `build/index.js` 存在。

## Skill

本包包含 [skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)，供 Codex、ChatGPT、Claude、Cursor、Gemini、Qwen、VS Code、Cline、Continue、Roo Code、LM Studio、Windsurf、Zed 等支持 MCP 的客户端读取。

在让 AI 操作 Godot 项目前，先把这个 `SKILL.md` 喂给 AI。支持文件上下文的客户端可以直接附加或引用该文件；不支持时，把文件内容粘贴到对话里，并要求 AI 按照它使用 `godot-devtool` MCP server。

该 Skill 会把常见 Godot 操作对应到正确的 MCP 工具，提醒助手先检查项目状态，默认使用 stdio/headless 路由完成可重复编辑，只在需要实时 editor/runtime 状态时安装和使用 WebSocket 插件，并在结束前验证变更。
