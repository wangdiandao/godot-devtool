# godot-devtool 路线图

[English](ROADMAP.md) | 中文

已完成版本记录在 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。本文件只记录 `3.1.0` 之后的未来工作。

3.0.0 的共享 broker、多 Agent MCP client、多游戏实例、上下文过滤、端口清理和拆分 addon 文件结构已经在本地完成；开发计划和分工记录见 [docs/superpowers/plans/2026-05-14-3.0.0-architecture.md](docs/superpowers/plans/2026-05-14-3.0.0-architecture.md)。

## 未来计划

### 路由加固

- 为每个公开的 `editor_ws` 和 `runtime_ws` 路由扩展端到端 Godot fixture。
- 增加实时 editor dock 状态、运行时截图、运行时属性写入、运行时输入路由、录制/回放路由和 QA 断言的更广泛回归用例。
- 让 `get_capabilities` 继续作为路由支持状态的唯一事实来源；不能通过 native、headless、editor WebSocket 或 runtime WebSocket 实际执行的路由必须移除。
