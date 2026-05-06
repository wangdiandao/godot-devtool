# godot-devtool 更新日志

[English](CHANGELOG.md) | 中文

这里记录已经完成的版本变更。未来计划见 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)。

## 1.5.0

导出、CI 和发布自动化版本。

- 扩展 export preset 检查，增加 export template 指引、平台签名详情、icon 和 metadata 检查，以及已配置 artifact 验证。
- 增加 `generate_ci_snippet`，生成 GitHub Actions 和 GitLab CI 的 headless 检查、导出预检、release export 和 artifact 归档片段。
- 改进 `run_project_checks`，为检查结果增加机器可读 code、原因和修复建议。
- 增加 `release:github` 发布自动化，GitHub Release 上传成功后会删除本地 release zip。
- 更新 `1.5.0` 发布文档和构建包下载链接。

## 1.4.0

物理、导航和调试分析版本。

- 扩展 `physics`，支持 collision layer/mask 更新、命名 layer 解析、collision info 检查、可复用 Shape 资源创建、Area trigger 模板、CharacterBody controller 模板和 scene physics 分析。
- 扩展 `navigation`，支持 bake 配置、NavigationMesh bake 执行、path query 输出和 Line2D navigation debug geometry 生成。
- 为 1.4.0 工具 schema 和生成的 Godot 操作函数增加发布验证覆盖。
- 更新 `1.4.0` 发布文档和构建包下载链接。

## 1.3.1

代码组织和可维护性版本。

- 将 MCP 工具定义按类别拆分为模块，同时保留所有导出的工具名和兼容别名。
- 将单个服务端工具 `switch` 替换为按类别组织的 handler registry。
- 将 Godot 操作源码拆分为有序分类片段，同时保持生成的运行时脚本与此前单文件脚本字节级兼容。
- 增加工具定义覆盖和 Godot 操作脚本生成验证脚本。
- 更新 `1.3.1` 发布文档和构建包下载链接。

## 1.3.0

视觉、Shader、动画和 UI 增强版本。

- 增加 shader include 报告和 texture uniform 推断。
- 通过 `material` 的 `list_templates` 和 `create_from_template` 增加可复用材质模板。
- 扩展 `animation`，增加 `add_track`、`set_keyframe`、`get_info` 和 `remove` action。
- 通过 `animation_state_machine` 增加 AnimationTree transition 参数编辑。
- 扩展 `ui`，增加 Theme 资源创建、theme 应用、可复用 Control tree 模板和自动 signal 连接辅助。
- 更新 `1.3.0` 发布文档和构建包下载链接。

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
- 增加 tile 自定义 metadata、collision polygon、navigation polygon 和 terrain 配置 action。
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
