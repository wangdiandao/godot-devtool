# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot Engine 工作流的 MCP server。它让支持 MCP 的 AI 助手可以通过受控工具接口检查、编辑、运行、调试、验证和打包 Godot 项目。

本项目最初受到 [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) 启发，随后以 `godot-devtool` 重新打包并扩展。

## 快速开始

### 1. 下载预构建包

最新发行包：

[godot-devtool-build-1.3.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.3.0/godot-devtool-build-1.3.0.zip)

解压 zip，然后让 MCP 客户端指向解压后的 `build/index.js`。

```json
{
  "mcpServers": {
    "godot-devtool": {
      "command": "node",
      "args": ["E:/godot-devtool/build/index.js"],
      "env": {
        "GODOT_PATH": "D:/Program Files/Godot/Godot_v4.x.exe"
      }
    }
  }
}
```

如果 Godot 已经在系统 `PATH` 中，可以省略 `GODOT_PATH`。

### 2. 从源码构建

```bash
npm install
npm run build
```

MCP server 入口：

```text
build/index.js
```

### 3. 验证安装

```text
get_godot_version
get_capabilities
```

本地项目检查：

```bash
npm run check:project -- E:/test
```

## 环境要求

- Godot Engine 4.x。
- Node.js >= 18.0.0。
- 从源码构建时需要 npm。
- 支持 MCP 的客户端，例如 Claude Desktop、MCP Inspector、Cline、Cursor、VS Code Copilot 或其他 MCP client。

## 常见工作流

1. 调用 `get_godot_version` 确认 Godot 可用。
2. 调用 `list_projects`，或直接传入已知项目路径。
3. 调用 `get_project_info`、`get_resource_index`、`get_script_index` 理解项目。
4. 使用场景、节点、脚本、资源、动画、视觉、TileMap、物理、导航和音频工具编辑项目。
5. 需要 live editor selection、undo/redo 或 Inspector 属性命令时，用 `install_editor_bridge` 安装 editor bridge。
6. 发布前运行 `run_project`、`get_debug_output`、`check_gdscript_syntax`、`run_project_checks` 和导出检查。

## 全部工具

### 核心和项目工具

| Tool | 说明 |
| --- | --- |
| `get_capabilities` | 发现工具 schema、alias、run mode 和 risk level |
| `get_godot_version` | 检测本机 Godot 版本 |
| `list_projects` | 在目录中查找 Godot 项目 |
| `get_project_info` | 项目元信息、主场景、autoload、input action、rendering 和资源统计 |
| `project_get_settings` | 读取 `project.godot` 设置 |
| `project_set_setting` | 更新 `project.godot` 设置，支持 dry-run 和 audit logging |
| `project_input_action` | 列出、创建、更新或删除 InputMap action |
| `get_resource_index` | 分类列出 scene、script、texture、audio、model、resource、shader 和其他文件 |
| `resource_dependency_graph` | 构建 `res://` 依赖图并检测孤立资源 |
| `get_script_index` | GDScript 文件索引，包含 class、base class、export 和 function |

### 场景和节点工具

| Tool | 说明 |
| --- | --- |
| `create_scene` | 创建 scene 文件 |
| `scene_open` | 在 MCP session 中打开 scene |
| `scene_get_current` | 返回 MCP 当前跟踪的 scene |
| `get_scene_tree` | 读取 scene node tree |
| `save_scene` | 保存 scene 或另存为变体 |
| `add_node` | 添加节点并可设置属性 |
| `delete_node` | 删除非 root 节点 |
| `rename_node` | 重命名节点 |
| `node_get` | 读取节点信息 |
| `node_get_property` / `get_node_properties` | 读取指定节点属性 |
| `node_set_property` / `update_node_properties` | 更新节点属性 |
| `node_move` | 通过 position 移动节点 |
| `node_duplicate` | 复制节点 |
| `node_find` | 按 name、type 或 path substring 查找节点 |
| `load_sprite` | 给 sprite 类节点分配 texture |

### 脚本、文件和资源工具

| Tool | 说明 |
| --- | --- |
| `script_create` | 创建 GDScript 文件 |
| `script_write` | 写入完整 GDScript 内容 |
| `script_attach` | 将 GDScript resource 挂到 scene 节点 |
| `read_script_file` | 读取 GDScript 文件 |
| `analyze_script_references` | 分析 script class、function、export、node path 和 resource 引用 |
| `check_gdscript_syntax` | 运行 Godot 脚本语法诊断 |
| `filesystem_list` | 列出项目内文件和目录 |
| `filesystem_read` | 读取项目内文本文件 |
| `filesystem_write` | 写入项目内文本文件 |
| `filesystem_delete` | 带确认删除项目内文件或目录 |
| `filesystem_preview_delete` | 预览删除影响 |
| `resource_load` | 读取文本型 Godot resource |
| `resource_create` | 创建结构化 `.tres` 或 `.res` resource |
| `resource_save` | 保存文本型 resource 内容 |

### Editor Bridge 工具

| Tool | 说明 |
| --- | --- |
| `launch_editor` | 启动指定项目的 Godot editor |
| `install_editor_bridge` | 安装 editor bridge plugin |
| `editor_bridge_status` | 读取安装、instance、pending command、expired command 和 receipt 信息 |
| `editor_get_selection` | 读取当前 editor selection 和 edited scene |
| `editor_select_node` | 在 live editor 中选中节点 |
| `editor_undo_redo` | 入队 editor undo 或 redo |
| `editor_inspector_get_properties` | 从选中或指定节点读取 Inspector 属性 |
| `editor_inspector_set_properties` | 通过 editor bridge 写入 Inspector 属性 |

### 运行、调试、导出和工作流工具

| Tool | 说明 |
| --- | --- |
| `run_project` | 运行 Godot 项目并捕获输出 |
| `stop_project` | 停止正在运行的 Godot 项目 |
| `get_debug_output` | 读取缓存 stdout/stderr 和 error |
| `clear_debug_output` | 清空 debug output buffer |
| `run_project_checks` | 面向 CI、review 和 release 的稳定项目检查 |
| `get_audit_log` | 读取项目 audit log |
| `create_workflow_test_scene` | 生成工作流验证 scene |
| `create_gameplay_prototype` | 生成 block-based survivors 原型 |
| `get_export_presets` | 读取 export preset |
| `check_export_presets` | 检查 export preset 问题 |
| `export_matrix` | 汇总平台族、签名/template 状态、问题和 CI 建议 |
| `update_export_preset` | 更新 export preset field 或 option |
| `export_project` | 执行受控 Godot export |
| `export_mesh_library` | 将 3D scene 导出为 MeshLibrary resource |
| `get_uid` | 读取 Godot 4.4+ resource UID |
| `update_project_uids` | 重新保存 resource 以更新 UID 引用 |

### 动画、UI、视觉和材质工具

| Tool | 说明 |
| --- | --- |
| `animation` | 列出、创建、检查、删除和编辑 AnimationPlayer tracks/keyframes |
| `animation_state_machine` | 创建、检查和配置 AnimationTree state machine transition |
| `signal` | 列出、连接或断开节点 signal |
| `group` | 列出、添加或移除节点 group |
| `ui` | 创建 Control 节点、UI tree 模板、Theme 资源、theme 应用和自动 signal wiring |
| `material` | 创建、读取、更新、应用、列出模板并从可复用材质模板创建 material |
| `shader` | 创建/读取 shader，检查 include 和 texture uniform，并配置 ShaderMaterial 参数 |
| `lighting` | 创建和列出 Godot light/environment 节点 |
| `particle` | 创建和列出 particle emitter 节点 |

### TileMap、物理、导航和音频工具

| Tool | 说明 |
| --- | --- |
| `tilemap` | 创建/列出 TileMap 节点、创建 TileSet、编辑 cell、添加 atlas source、配置 metadata/collision/navigation/terrain、随机绘制和应用模板 |
| `geometry` | 创建和列出基础 2D geometry/debug drawing 节点 |
| `physics` | 创建和列出 physics body、area 和 collision shape |
| `navigation` | 创建/列出 NavigationRegion、NavigationAgent、NavigationObstacle，并写入 NavigationRegion2D polygon |
| `audio` | 创建/列出 AudioStreamPlayer 节点并检查 audio bus |

## 项目结构

```text
src/
  index.ts                    # MCP stdio CLI 入口
  server/GodotServer.ts        # MCP server 生命周期、注册和分发
  tools/toolDefinitions.ts     # MCP tool schema 和兼容 alias
  godot/                       # Godot 项目分析、路径、文件、资源、导出和工作流
  scripts/godot_operations.gd  # Headless Godot 操作桥
scripts/
  build.js                     # TypeScript 构建后复制 Godot 操作脚本
  check-project.js             # 项目健康检查入口
  verify-roadmap-completion.js # 已发布能力本地回归验证
```

## 更新日志和路线图

- 已完成变更：[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)
- 未来计划：[ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)

## 许可证

MIT。见 [LICENSE](LICENSE)。
