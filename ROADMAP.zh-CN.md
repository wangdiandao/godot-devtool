# godot-devtool 路线图

[English](ROADMAP.md) | 中文

已完成版本记录在 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。本文件只记录 `2.6.4` 之后的未来工作。

## 未来计划

### 路由加固

- 为每个公开的 `editor_ws` 和 `runtime_ws` 路由扩展端到端 Godot fixture。
- 增加 UndoRedo 修改、运行时截图、运行时属性写入、运行时输入路由、录制/回放路由和 QA 断言的回归用例。
- 让 `get_capabilities` 继续作为路由支持状态的唯一事实来源；不能通过 native、headless、editor WebSocket 或 runtime WebSocket 实际执行的路由必须移除。
