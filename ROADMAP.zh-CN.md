# godot-devtool 路线图

[English](ROADMAP.md) | 中文

已完成版本记录在 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。本文件只记录 `2.5.1` 之后的未来工作。

## 未来计划

### 验证项目

- 使用 v2 WebSocket 插件和 MCP 路由分组，把 `E:/test` 开发成基于方块的 survivor-like 游戏。
- 验证 native 项目检查、headless 场景/资源编辑、实时编辑器命令、运行时输入/截图路由、导出检查和审计日志。
- 目标是一个可玩的主场景，包含玩家移动、敌人生成、自动攻击、经验/升级、简单 UI、音频占位和导出配置。

### 路由加固

- 为每个公开的 `editor_ws` 和 `runtime_ws` 路由扩展端到端 Godot fixture。
- 增加 UndoRedo 修改、运行时截图、运行时属性写入、运行时输入路由、录制/回放路由和 QA 断言的回归用例。
- 让 `get_capabilities` 继续作为路由支持状态的唯一事实来源；不能通过 native、headless、editor WebSocket 或 runtime WebSocket 实际执行的路由必须移除。
