# godot-devtool 路线图

[English](ROADMAP.md) | 中文

已完成版本记录在 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。本文件只记录 `2.3.2` 之后的未来工作。

## 未来计划

### 2.4.0 运行时兼容能力补全

- 将只返回完成回执的 `simulate_key`、`simulate_mouse_click` 和 `simulate_mouse_move` 改成真正通过 `Input.parse_input_event` 注入 Godot 的 `InputEventKey`、`InputEventMouseButton` 和 `InputEventMouseMotion`。
- 加固 `simulate_action`：校验 Input Map 中的 action，覆盖按下/释放、strength 参数，并用回归测试证明目标游戏场景确实收到了该 action。
- 让 `simulate_sequence` 具备确定性：校验每个事件类型，保留每个事件的失败信息，正确处理帧延迟，并在运行中的 Godot 项目里验证 action/key/mouse 混合序列。
- 在已安装的运行时桥中注册并实现 `start_recording`、`stop_recording` 和 `replay_recording` 路由，包括 `_input(event)` 捕获、JSON 持久化、按时序回放，以及录制文件读写失败时的清晰错误。
- 更新能力元数据，让 `get_capabilities`、README 工具表和兼容路由描述能够区分“已完整实现的运行时路由”和“仍是兼容占位/回执型路由”。
- 增加端到端运行时 fixture：启动 Godot 项目、安装 bridge、启动 runtime autoload、执行每个运行时输入/录制工具，并验证可观察的场景状态或生成的文件，而不是只接受完成回执。

### 验证项目

- 使用 v2 WebSocket 插件和 MCP 路由分组，把 `E:/test` 开发成基于方块的 survivor-like 游戏。
- 验证 native 项目检查、headless 场景/资源编辑、实时编辑器命令、运行时输入/截图路由、导出检查和审计日志。
- 目标是一个可玩的主场景，包含玩家移动、敌人生成、自动攻击、经验/升级、简单 UI、音频占位和导出配置。

### 路由加固

- 为每个公开的 `editor_ws` 和 `runtime_ws` 路由扩展端到端 Godot fixture。
- 增加 UndoRedo 修改、运行时截图、运行时属性写入、运行时输入路由、录制/回放路由和 QA 断言的回归用例。
- 让 `get_capabilities` 继续作为路由支持状态的唯一事实来源；不能通过 native、headless、editor WebSocket 或 runtime WebSocket 实际执行的路由必须移除。
