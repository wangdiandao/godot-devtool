# godot-devtool 更新日志

[English](CHANGELOG.md) | 中文

这里记录已经完成的版本变更。未来计划见 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)。

## 2.3.0

编辑器状态面板与全量工具表格版本。

- 新增 `godot-devtool` Godot 编辑器 dock，用于显示 MCP WebSocket 连接状态、URL、最近命令、最近回执、最近错误，并提供手动重连按钮。
- 将内置 Godot 插件 metadata 和 package metadata 同步到 `2.3.0`。
- 将 README 和中文 README 的能力展示改为 `All 249 Tools` / `全部 249 个工具` 的分组工具描述表格。
- 增加编辑器状态 dock 和全量工具 README 表格格式的验证覆盖。

## 2.2.0

README 安装和能力指南版本。

- 扩展 README 和中文 README，写清 release zip、源码构建、MCP 客户端配置和 Godot 插件安装步骤。
- 增加可直接复制给 AI 助手的提示词，用 MCP 工具安装并验收内置 Godot 插件。
- 增加更完整的能力说明，覆盖 project、filesystem、resource、script、scene、node、visual、editor、runtime、animation、tilemap、UI/theme、physics、navigation、audio、analysis/QA 和 compatibility 路由。
- 说明什么时候应该选择 native、headless Godot、editor WebSocket 或 runtime WebSocket transport。

## 2.1.0

服务端与验证结构清理版本。

- 将 `src/server/GodotServer.ts` 从数千行实现文件削减为紧凑的服务端状态和生命周期入口。
- 将 legacy native/headless/editor/runtime 工具实现移动到 `src/server/GodotServer.methods.ts`，保持公开 MCP 行为不变。
- 将 v2 capability 检查合并进 `verify-tool-definitions.js`。
- 将插件路由和 runtime bridge 安装检查合并为 `verify-godot-plugin.js`。
- 删除过时的独立 `verify-v2-*` 脚本，并用 `verify:plugin`、`verify:all` 收敛 npm 验证入口。

## 2.0.0

WebSocket 插件架构版本。

- 将项目明确重构为 stdio/headless MCP server + 可选 localhost WebSocket 编辑器/运行时桥接。
- 新增打包的 Godot 编辑器插件 `addons/godot_devtool`，包含统一 `command_router.gd` 和按功能拆分的 command 模块。
- 新增 `plugin_install`、`plugin_status`、`plugin_reload`，并保留旧 editor bridge 名称作为兼容入口。
- 新增 v2 能力元数据、插件路由打包、运行时桥接安装验收脚本。
- 同步 README、ROADMAP、package metadata、server metadata 和 Skill 使用指南到 2.0 架构。

## 1.8.0

运行时桥接补齐版本。

- `install_editor_bridge` 增加运行时 autoload bridge，用于处理运行中项目命令。
- 运行中场景树、节点属性、输入模拟、截图、连续帧捕获、属性监控、输入录制/回放、UI 操作、导航辅助和运行时表达式执行通过运行时命令回执返回真实结果。
- 弱运行时/editor 占位响应被替换为真实运行时桥接派发，或在桥接未激活时返回明确环境错误。
- README 功能列表改为“路由 -> 功能描述”表格，并同步 `1.8.0` 发布元数据。

## 1.7.1

- 补齐 1.7 兼容工具的事实可执行实现。

## 1.7.0

- 增加兼容路由集合，并扩展项目、场景、节点、脚本、资源、运行、调试、导出、UID、输入、运行时、动画、TileMap、UI、Shader、Physics、Navigation、Audio 和 QA 路由。

## 1.6.0

- 增加项目本地 safety policy、写入 allowlist、blocked path、diff 预览、audit replay 和 rollback 建议。

## 1.5.0

- 增加 export preset 检查、CI 片段生成、发布导出建议和 GitHub Release 自动化。

## 1.4.0

- 扩展 Physics、Navigation 和调试分析工具。

## 1.3.1

- 拆分工具定义、服务端 handler 和 Godot 操作脚本片段。

## 1.3.0

- 扩展 Shader、Material、Animation、AnimationTree 和 UI 工具。

## 1.2.1

- 增加中英文 README、CHANGELOG、ROADMAP 和发布包下载说明。

## 1.2.0

- 增加 TileSet atlas、metadata、collision、navigation、terrain 和地图模板功能。

## 1.1.0

- 增强 editor bridge 回执、超时、Inspector 属性读写和 bridge 状态。

## 1.0.0

- 初始 `godot-devtool` 发布，包含项目分析、资源索引、脚本索引、场景、节点、脚本、资源、运行、导出等基础工具。
