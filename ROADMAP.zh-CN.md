# godot-devtool 路线图

[English](ROADMAP.md) | 中文

本文档只记录未来开发计划。已完成版本见 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。

## 未来计划

### 1.6.0 安全与恢复

- 增加可配置写入 allowlist。
- 增加高风险写操作的批量 diff 摘要。
- 增加 audit replay 摘要。
- 增加受支持写操作的 rollback 建议。

### 1.7.0 扩展工具兼容面

- 为当前仅由不同名称 `godot-devtool` 工具覆盖的提交工具增加精确名称 wrapper 或 alias。
- 增加项目、文件系统、UID、scene、node、script、signal、group、live editor、input、runtime、animation、TileMap、theme、profiling、batch refactoring、dependency analysis、shader、export、resource、autoload、physics、3D、particle、navigation、audio、AnimationTree、state machine、blend tree、analysis 和 QA/testing 缺口。

### 验证项目

- 使用完成后的 `godot-devtool` 工具集将 `E:/test` 开发成基于方块的 survivor-like 游戏。
- 美术保持简单：player、enemy、bullet、pickup 和 map element 使用方块和基础几何体。
- 验证项目理解、scene/resource 编辑、script 辅助、runtime debugging、checks、export 和 audit logging。
- 目标是一个可玩的 main scene，包含 player movement、enemy spawning、automatic attacks、experience/leveling、simple UI、audio placeholder 和 export configuration。
