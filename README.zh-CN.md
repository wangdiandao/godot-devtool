# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot 4 的 MCP server，用于让 AI 助手检查、编辑、验证和自动化运行中的 Godot 项目。2.0 版本明确采用 stdio/headless MCP server + 可选 localhost WebSocket Godot 编辑器插件桥接架构。

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
- native 路由用于安全检查和编辑项目文件。
- headless 路由调用 Godot 完成场景、资源和可视化操作。
- editor 路由通过 WebSocket 插件处理实时选择、Inspector 属性、UndoRedo 和插件重载。
- runtime 路由通过 autoload bridge 处理运行中场景树、属性、输入模拟、截图和 QA 检查。

## 快速开始

### 预构建包

从 GitHub Releases 下载 v2 包：

[godot-devtool-build-2.0.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v2.0.0/godot-devtool-build-2.0.0.zip)

MCP 客户端配置：

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

如果 Godot 已在 `PATH` 中，可以省略 `GODOT_PATH`。

### 从源码构建

```bash
npm install
npm run build
```

MCP server 入口是 `build/index.js`。Godot 插件会复制到 `build/addons/godot_devtool`。

## 插件设置

把 v2 WebSocket 插件安装到 Godot 项目：

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

然后在 Godot 中启用插件：

```text
Project > Project Settings > Plugins > godot-devtool
```

运行时路由还会注册：

```text
autoload/DevtoolRuntime = *res://addons/godot_devtool/runtime_bridge.gd
```

使用 `plugin_status` 检查安装和 WebSocket 连接状态。旧的 `install_editor_bridge` 和 `editor_bridge_status` 名称仍作为兼容入口保留。

## 路由分组

不确定参数或能力时先调用 `get_capabilities`。每个工具都会返回 `routeGroup`、`transport`、`riskLevel`、`requiresEditor` 和 `requiresRuntime`。

常用路由示例包括 `plugin_install`、`plugin_status`、`get_project_info`、`filesystem_read`、`resource_dependency_graph`、`generate_ci_snippet`、`get_safety_policy`、`create_scene`、`add_node`、`editor_inspector_set_properties` 和 `get_game_scene_tree`。

| 路由分组 | 传输 | 用途 |
| --- | --- | --- |
| `core` | `native` / `process_control` | Godot 版本、项目启动、日志、能力发现 |
| `project` | `native` | `project.godot`、InputMap、autoload、项目元数据 |
| `filesystem` | `native` | 项目内文件列表、读取、写入、删除预览 |
| `resource` | `native` | 资源索引、依赖图、导出预设、CI 片段 |
| `script` | `native` / `headless_godot` | 脚本索引、读写、语法检查 |
| `scene` | `headless_godot` | 场景、节点、动画、TileMap、物理、导航、音频 |
| `visual` | `headless_godot` | Shader、Material、Lighting、Particle、UI/Theme |
| `editor` | `editor_ws` | 实时编辑器选择、Inspector、UndoRedo、插件重载 |
| `runtime` | `runtime_ws` | 运行中游戏场景树、输入、截图、运行时 QA |

## 验证

静态和打包检查：

```bash
npm.cmd run build
npm.cmd run verify:tools
npm.cmd run verify:gdscripts
npm.cmd run verify:v2:capabilities
npm.cmd run verify:v2:plugin
npm.cmd run verify:v2:runtime
```

依赖 Godot 的检查需要 `GODOT_PATH`：

```bash
npm.cmd run verify:runtime
npm.cmd run check:project -- E:/test
```

## Skill

Agent 使用指南位于：

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

该 Skill 会教 AI 助手先检查项目状态，再选择合适路由；只有需要实时编辑器或运行时状态时才安装/使用 WebSocket 插件，并在结束前执行验证。
