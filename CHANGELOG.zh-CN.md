# godot-devtool 更新日志

[English](CHANGELOG.md) | 中文

这里记录已经完成的版本变更。未来计划见 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)。

## 1.8.0

运行时桥接补齐版本。

- `install_editor_bridge` 现在会安装游戏运行时 autoload bridge，用于处理运行中项目的命令。
- 运行中场景树、节点属性、输入模拟、截图、连续帧捕获、属性监控、输入录制/回放、UI 操作、导航辅助和运行时表达式执行都通过运行时命令回执返回真实结果。
- 弱运行时/editor 占位响应被替换为真实运行时桥接派发，或在桥接未激活时返回明确环境错误。
- README 功能列表改为“路由 -> 功能描述”表格，并同步 `1.8.0` 发布元数据。

## 1.7.1

补齐 1.7 兼容工具的事实可执行实现。

- 将弱兼容 fallback 替换为本地、headless Godot 或 bridge-backed 的真实处理链。
- Editor/runtime bridge 命令会等待完成回执，并返回真实结果、超时或环境错误。
- 补齐 TileMap、Theme/UI、Audio、AnimationTree、State Machine、Blend Tree、Testing/QA 和 profiling 相关实现。
- README 能力列表改为一个方法对应一句描述，并同步 `1.7.1` 发布元数据。

## 1.7.0

- 增加 Godot MCP Pro 风格的兼容路由集合。
- 增加项目、场景、节点、脚本、资源、运行、调试、导出、UID、输入、运行时、动画、TileMap、UI、Shader、Physics、Navigation、Audio 和 QA 路由。

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

- 初始 `godot-devtool` 发布，包含项目分析、资源索引、脚本索引、场景/节点/脚本/资源/运行/导出等基础工具。
