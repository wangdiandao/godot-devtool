# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.8.0-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 中文

`godot-devtool` 是面向 Godot Engine 的 MCP server，用于让兼容 MCP 的 AI 助手通过受控工具接口检查、编辑、运行、调试、验证和打包 Godot 项目。

本项目最初受 [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) 启发，随后重新打包并扩展为 `godot-devtool`。

## 快速开始

### 1. 下载预构建包

最新发布包：

[godot-devtool-build-1.8.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.8.0/godot-devtool-build-1.8.0.zip)

解压 zip 后，将 MCP 客户端指向解压目录中的 `build/index.js`。

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

如果 Godot 已经在 `PATH` 中，可以省略 `GODOT_PATH`。

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

### 4. 运行时桥接

运行中游戏相关路由使用 game-side autoload bridge。每个 Godot 项目安装一次 bridge，需要编辑器能力时启用插件，然后运行游戏：

```text
install_editor_bridge
run_project
editor_bridge_status
```

bridge 会把编辑器命令写入 `.godot-devtool/editor-commands`，把运行时命令写入 `.godot-devtool/runtime-commands`。运行时路由会返回真实回执、超时，或在运行时 bridge 未激活时返回明确环境错误。

### 5. AI 助手使用指南

仓库包含一个 skill 文件，用来告诉 MCP 客户端和连接的 AI 助手如何安全使用本 server：

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

该 skill 要求先检查项目状态，优先使用结构化 MCP 工具而不是直接改文件，对高风险操作使用 preview/dry-run，并在结束前运行验证。

## Godot 中文社区群

欢迎加入 Godot 中文社区群交流使用经验：

![Godot 中文社区群二维码](docs/assets/godot-chinese-community-qq-qrcode.jpg)

二维码路径：`docs/assets/godot-chinese-community-qq-qrcode.jpg`

## 环境要求

- Godot Engine 4.x。
- Node.js >= 18.0.0。
- 从源码构建时需要 npm。
- 兼容 MCP 的客户端，例如 Claude Desktop、MCP Inspector、Cline、Cursor、VS Code Copilot 或其他 MCP client。

## 常见工作流

1. 调用 `get_godot_version` 确认 Godot 可用。
2. 调用 `list_projects`，或直接传入已知项目路径。
3. 调用 `get_project_info`、`get_resource_index` 和 `get_script_index` 理解项目。
4. 使用 scene、node、script、resource、animation、visual、TileMap、physics、navigation 和 audio 工具编辑项目。
5. 需要 live editor selection、undo/redo、Inspector 属性或 running-game runtime routes 时，调用 `install_editor_bridge`。
6. 对高风险写入使用 `get_safety_policy`、`preview_write_safety`、`get_audit_replay` 和 `get_rollback_suggestions`。
7. 发布前运行 `run_project`、`get_debug_output`、`check_gdscript_syntax`、`run_project_checks`、export 检查和 CI 片段。

## 全部工具

下面每个路由都对应本地实现、headless Godot 操作、editor bridge 命令或 runtime bridge 命令。Bridge-backed 工具会等待完成回执，并返回真实结果、超时或环境错误。

### 核心原生工具

Tool Description
`get_capabilities` 工具发现，包含 schema、alias、run mode 和 risk level
`get_godot_version` 检测已安装的 Godot 版本
`list_projects` 在目录中查找 Godot 项目
`project_get_settings` 读取 `project.godot` 设置
`project_set_setting` 更新 `project.godot` 设置，支持 dry-run 和 audit logging
`project_input_action` 列出、创建、更新或删除 InputMap action
`get_resource_index` 按类型索引 scenes、scripts、textures、audio、models、resources、shaders 等文件
`resource_dependency_graph` 构建 `res://` 依赖图并识别孤立资源
`get_script_index` 返回 GDScript 文件、class、base class、exports 和 functions
`filesystem_list` 列出项目内文件和目录
`filesystem_read` 读取项目内文本文件
`filesystem_write` 写入项目内文本文件
`filesystem_preview_delete` 预览删除影响
`filesystem_delete` 带确认删除项目内文件或目录
`resource_load` 读取文本型 Godot resource
`resource_create` 创建结构化 `.tres` 或 `.res` resource
`resource_save` 保存文本型 resource 内容
`generate_ci_snippet` 生成 GitHub Actions 或 GitLab CI 片段
`get_safety_policy` 读取 `.godot-devtool/safety.json` 和默认 safety 状态
`set_safety_policy` 配置写入 allowlist 和 blocked path 规则
`preview_write_safety` 预览 policy decision 和 diff summary metadata
`get_audit_replay` 将 audit entries 汇总为 replay steps 和 risk highlights
`get_rollback_suggestions` 返回 changed files 或 audit entries 的 rollback 建议
`install_editor_bridge` 安装 editor bridge 和 runtime bridge 文件
`editor_bridge_status` 读取 editor/runtime bridge 安装、状态、命令和回执详情

### 项目工具

Tool Description
`get_project_info` 项目元数据、版本、viewport 和 autoload
`get_filesystem_tree` 递归文件树和过滤
`search_files` 文件名模糊搜索和 glob 搜索
`get_project_settings` 读取 project.godot 设置
`set_project_setting` 通过 editor API 设置项目配置
`uid_to_project_path` UID 转换为 res:// 路径
`project_path_to_uid` res:// 路径转换为 UID

### 场景工具

Tool Description
`get_scene_tree` 带层级的场景树
`get_scene_file_content` 原始 .tscn 文件内容
`create_scene` 创建场景文件
`open_scene` 在编辑器中打开场景
`delete_scene` 删除场景文件
`add_scene_instance` 将场景实例化为子节点
`play_scene` 运行场景
`stop_scene` 停止运行场景
`save_scene` 保存当前场景到磁盘

### 节点工具

Tool Description
`add_node` 按类型和属性添加节点
`delete_node` 删除节点
`duplicate_node` 复制节点和子节点
`move_node` 移动或重挂载节点
`update_property` 设置任意属性并自动解析类型
`get_node_properties` 获取节点属性
`add_resource` 给节点添加 Shape、Material 等资源
`set_anchor_preset` 设置 Control anchor preset
`rename_node` 重命名节点
`connect_signal` 连接节点信号
`disconnect_signal` 断开信号连接
`get_node_groups` 获取节点所在 group
`set_node_groups` 设置节点 group
`find_nodes_in_group` 查找 group 内节点

### 脚本工具

Tool Description
`list_scripts` 列出脚本和 class 信息
`read_script` 读取脚本内容
`create_script` 用模板创建脚本
`edit_script` 搜索替换或完整编辑脚本
`attach_script` 将脚本挂到节点
`get_open_scripts` 列出编辑器中打开的脚本
`validate_script` 验证 GDScript 语法
`search_in_files` 搜索项目文件内容

### 编辑器工具

Tool Description
`get_editor_errors` 从最近 Godot 进程输出中获取诊断
`get_editor_screenshot` 捕获 editor viewport
`get_game_screenshot` 通过 runtime bridge 捕获运行中游戏 viewport
`execute_editor_script` 通过 editor bridge 执行 editor expression
`clear_output` 清空输出缓冲
`get_signals` 获取节点信号和连接
`reload_plugin` 确认当前 editor bridge plugin
`reload_project` 重新扫描文件系统和脚本
`get_output_log` 获取捕获的 Godot 输出

### 输入和运行时工具

Tool Description
`simulate_key` 在运行中游戏模拟键盘按下/释放
`simulate_mouse_click` 在运行中游戏模拟鼠标点击
`simulate_mouse_move` 在运行中游戏模拟鼠标移动
`simulate_action` 在运行中游戏模拟 Godot Input Action
`simulate_sequence` 按帧延迟执行输入事件序列
`get_game_scene_tree` 获取运行中游戏场景树
`get_game_node_properties` 获取运行中游戏节点属性
`set_game_node_property` 设置运行中游戏节点属性
`execute_game_script` 在节点或场景上下文执行 runtime expression
`capture_frames` 捕获多帧截图
`monitor_properties` 按时间采样节点属性
`start_recording` 开始输入录制
`stop_recording` 停止录制并写入 JSON
`replay_recording` 回放录制输入
`find_ui_elements` 查找运行中 UI 元素
`click_button_by_text` 根据文本触发按钮 pressed 信号
`wait_for_node` 等待节点出现
`find_nearby_nodes` 查找指定位置附近节点
`navigate_to` 将节点设到目标位置
`move_to` 移动节点到目标位置

### 其他功能组

Tool Description
`list_animations` 列出 AnimationPlayer 动画
`create_animation` 创建动画
`tilemap_set_cell` 设置单个 TileMap cell
`tilemap_fill_rect` 填充矩形 tile 区域
`create_theme` 创建 Theme resource
`set_theme_color` 设置 theme color override
`get_performance_monitors` 获取 runtime performance monitors
`get_editor_performance` 获取 editor/server performance summary
`find_nodes_by_type` 按类型查找节点
`find_signal_connections` 查找 scene 中所有 signal connection
`create_shader` 创建 shader
`read_shader` 读取 shader 文件
`edit_shader` 编辑 shader
`list_export_presets` 列出 export preset
`export_project` 执行受控 Godot export
`get_export_info` 获取 export 相关项目信息
`read_resource` 读取 `.tres` resource 属性
`edit_resource` 编辑 resource 属性
`create_resource` 创建 `.tres` resource
`setup_physics_body` 配置 physics body
`setup_collision` 添加 collision shapes
`setup_navigation_region` 配置 NavigationRegion
`setup_navigation_agent` 配置 NavigationAgent
`add_audio_player` 添加 AudioStreamPlayer node
`add_audio_bus` 添加 audio bus
`create_animation_tree` 创建 AnimationTree
`add_state_machine_transition` 添加 state machine transition
`set_blend_tree_node` 配置 blend tree node
`run_test_scenario` 运行自动测试场景
`assert_node_state` 断言节点属性值
`compare_screenshots` 比较两张截图
`get_test_report` 获取测试报告

## 项目结构

```text
src/
  index.ts                    # MCP stdio CLI 入口
  server/GodotServer.ts        # MCP server 生命周期、注册和分发
  tools/toolDefinitions.ts     # MCP tool schemas 和兼容 alias
  godot/                       # Godot 项目分析、路径、文件、资源、导出和 workflow
  scripts/godot_operations/    # 生成 headless Godot operation bridge 的源码片段
skills/
  godot-devtool/SKILL.md       # 本 MCP server 的 AI assistant workflow guidance
scripts/
  build.js                     # TypeScript build 后生成 build/scripts/godot_operations.gd
  check-project.js             # 项目健康检查入口
  publish-github-release.js    # 构建、上传并在成功后删除本地 release package
  verify-roadmap-completion.js # 已发布能力的本地回归验证
```

## 发布记录和路线图

- 已完成变更：[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)
- 未来计划：[ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)

## License

MIT。见 [LICENSE](LICENSE)。
