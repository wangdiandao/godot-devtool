# godot-devtool 更新日志

[English](CHANGELOG.md) | 中文

这里记录已经完成的版本变更。未来计划见 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)。

## 1.2.1

文档和发行包更新。

- 新增英文和中文 CHANGELOG。
- 将已完成版本历史移出 ROADMAP，让 ROADMAP 只保留未来计划。
- 新增英文和中文 ROADMAP，并提供语言切换。
- 替换 LICENSE 为本项目所有者的 MIT 许可证声明。
- 调整 README 结构，使用按工具分组的功能表。
- 增加预构建发行包的直接下载和使用说明。

## 1.2.0

TileSet 和地图生成版本。

- 通过 `tilemap` 的 `add_atlas_source` action 增加 TileSet atlas source 管理。
- 增加 tile 自定义 metadata、碰撞 polygon、导航 polygon 和 terrain 配置 action。
- 增加带权重的确定性随机地图绘制。
- 增加可复用地图模板，包括用于地形和障碍布局生成的 `survivor_arena`。

## 1.1.0

Editor bridge 强化版本。

- 增加命令执行 receipt，支持 queued、completed、failed 和 expired 状态。
- 增加命令 timeout 和 editor-side 错误详情。
- 增加 `editor_inspector_get_properties` 和 `editor_inspector_set_properties` 两个 Inspector 属性读写命令。
- 增加 file、HTTP、WebSocket bridge session 的 mode metadata。
- 增加稳定的 editor instance metadata，用于区分多编辑器和多项目实例。
- 扩展 `editor_bridge_status`，返回 instance、bridge、pending command、expired command 和 recent receipt 信息。

## 1.0.0

`godot-devtool` 初始版本。

- 将项目重新打包为 `godot-devtool`。
- 按 `src/server`、`src/godot`、`src/tools` 和 `src/scripts` 重组代码结构。
- 增加 `get_capabilities`，用于发现 tool schema、兼容别名、运行模式和风险等级。
- 增加项目元信息分析、分类资源索引、GDScript 索引和资源依赖分析。
- 增加项目设置、InputMap、文件系统、资源、场景、节点、脚本、编辑器桥、动画、视觉、TileMap、物理、导航、音频、导出、UID、工作流和验证工具。
- 增加 `scripts/check-project.js` 和 `scripts/verify-roadmap-completion.js` 用于本地验证。
