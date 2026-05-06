# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot 4 的 MCP server，用于让 AI 助手检查、编辑、验证和自动化运行中的 Godot 项目。2.2 版本继续采用 stdio/headless MCP server + 可选 localhost WebSocket bridge 架构，并把 README 扩展为更实用的安装和功能指南。

架构和 README 组织方式参考了 [godot-mcp-pro](https://github.com/youichi-uda/godot-mcp-pro/tree/master) 公开仓库的表达：AI client 通过 stdio 连接 Node MCP server，再通过 WebSocket 连接 Godot 编辑器插件，并按 project、scene、node、script、editor、input、runtime、animation、tilemap、UI/theme、physics、navigation、audio、QA 等功能分组说明。本项目使用自己的实现和包结构。

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

   [godot-devtool-build-2.2.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.2.0/godot-devtool-build-2.2.0.zip)

2. 解压到稳定路径，例如：

   ```powershell
   Expand-Archive .\godot-devtool-build-2.2.0.zip E:\godot-devtool -Force
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

| 分组 | 传输 | 主要功能 |
| --- | --- | --- |
| `core` | `native` / `process_control` | Godot 版本检测、启动/停止项目、调试输出、能力发现 |
| `project` | `native` | 项目元数据、项目设置、InputMap、autoload、资源/脚本索引、导出预设、CI 片段、安全策略、项目检查 |
| `filesystem` | `native` | 项目内文件列表、读取、写入、删除预览、路径校验 |
| `resource` | `native` | 读取/创建/保存 `.tres` 资源、依赖图、资源预览 |
| `script` | `native` / `headless_godot` | 创建/读取/写入/挂载脚本、脚本索引、GDScript 语法检查 |
| `scene` | `headless_godot` | 打开/创建/保存场景、场景树检查、节点增删改查、节点属性 |
| `node` | `headless_godot` | 节点查找、属性检查、属性更新、加载 Sprite、导出 MeshLibrary |
| `visual` | `headless_godot` | Shader、Material、Lighting、Particle、3D Mesh、Camera、Environment |
| `editor` | `editor_ws` | 实时编辑器选择、选择节点、Inspector 读写、UndoRedo、插件重载 |
| `runtime` | `runtime_ws` | 运行中游戏场景树、节点属性、属性写入、输入模拟、截图、帧捕获 |
| `animation` | `headless_godot` | AnimationPlayer 创建、动画列表、轨道、关键帧、删除动画 |
| `tilemap` | `headless_godot` | 设置/填充/查询/清空 TileMap 单元格、读取 used cells 和 tile 数据 |
| `ui/theme` | `headless_godot` | Theme 资源、颜色、常量、字体大小、StyleBoxFlat、UI 元素发现 |
| `physics` | `headless_godot` | 物理体、碰撞形状、layer/mask 设置、碰撞信息、RayCast 节点 |
| `navigation` | `headless_godot` / `runtime_ws` | NavigationRegion/NavigationAgent 设置、bake 配置、路径辅助 |
| `audio` | `headless_godot` | Audio player、音频总线布局、bus/effect 设置、音频节点信息 |
| `analysis/qa` | `native` / `runtime_ws` | 场景复杂度、信号流、未使用资源、项目统计、断言、截图对比、压力报告 |
| `compatibility` | mixed | 旧工具名和 alias 映射到可执行 canonical 路由 |

常用工具包括：

- 项目：`get_project_info`、`project_get_settings`、`project_set_setting`、`project_input_action`、`run_project_checks`。
- 文件/资源：`filesystem_list`、`filesystem_read`、`filesystem_write`、`filesystem_preview_delete`、`resource_dependency_graph`、`resource_create`。
- 脚本：`get_script_index`、`read_script_file`、`script_create`、`script_write`、`script_attach`、`check_gdscript_syntax`。
- 场景/节点：`create_scene`、`scene_open`、`get_scene_tree`、`add_node`、`delete_node`、`rename_node`、`node_find`、`node_get`、`node_move`。
- 实时编辑器：`plugin_install`、`plugin_status`、`plugin_reload`、`editor_get_selection`、`editor_select_node`、`editor_inspector_get_properties`、`editor_inspector_set_properties`。
- 运行时：`get_game_scene_tree`、`get_game_node_properties`、`set_game_node_property`、`simulate_action`、`simulate_key`、`simulate_mouse_click`、`get_game_screenshot`、`assert_node_state`。
- 导出/安全：`get_export_presets`、`check_export_presets`、`export_matrix`、`generate_ci_snippet`、`get_safety_policy`、`set_safety_policy`、`get_audit_replay`、`get_rollback_suggestions`。

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
