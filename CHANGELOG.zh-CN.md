# godot-devtool 更新日志

[English](CHANGELOG.md) | 中文

这里记录已经完成的版本变更。未来计划见 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)。

## 未发布

Runtime bridge listener 生命周期加固。

- 当 `run_project` 仍有活跃进程或 runtime client 已连接时保持 WebSocket bridge listener，并在没有 runtime 状态、`stop_project`、替代运行、进程退出或 server cleanup 时关闭它。
- 修改 runtime compatibility 工具：不再因为初始 `plugin_status` stale 快照直接失败，而是等待 `DevtoolRuntime` 重新连接并返回真实命令 receipt。
- 增加进程回归覆盖，验证 runtime 重连派发和项目运行期间 listener 持续存在。

## 2.8.5

按 MCP 调用清理 WebSocket bridge 的小版本。

- 移除 WebSocket bridge 的会话级兼容模式，MCP 启动后不再默认保持配置端口打开。
- 保持 bridge 工具可用：当命令启动临时监听时，短暂等待 Godot editor/runtime bridge 重新连接。
- 增加进程和工具定义回归覆盖，验证启动不会绑定 bridge 端口，并且每次 MCP 工具调用结束都会清理端口。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.5`。

## 2.8.4

已打开编辑器 bridge 接管诊断版本。

- 修改 MCP 启动流程：WebSocket bridge 端口已被占用时，不再阻止 stdio MCP server 启动；native 诊断工具和 `plugin_cleanup_port` 仍可使用。
- 修改 `plugin_status`：bridge 端口冲突会作为结构化状态返回，并附带复用和清理指引，不再只给出笼统的安装错误。
- 修改 `launch_editor`：当配置的 bridge 端口已被其它监听进程占用时，拒绝再打开替代编辑器，避免误开第二个 Godot 编辑器会话。
- 改进 WebSocket bridge 端口冲突提示，明确说明换端口会创建另一套 bridge，不能接管已经连到其它 MCP 进程的 editor client。
- 增加进程回归覆盖，验证端口占用下的启动、`plugin_status` 诊断和 `launch_editor` 拒绝行为。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.4`。

## 2.8.3

编辑器启动复用安全版本。

- 修改 `launch_editor`，让它先复用请求项目中已经连接的 editor bridge，而不是再启动第二个 Godot 编辑器进程。
- 将 Godot 可执行文件检测移动到现有编辑器检查之后；如果项目已经有打开的编辑器，就不需要为了新启动流程先依赖 `GODOT_PATH`。
- 增加进程回归覆盖，模拟已经连接的 editor client，并验证 `launch_editor` 不会启动替代进程。
- 更新公开工具描述，明确复用或启动的行为。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.3`。

## 2.8.2

能力目录上下文预算优化版本。

- 修改 `get_capabilities`，默认只返回不含输入 schema 的轻量工具目录。
- 增加按 `routeGroup`、`transport`、`riskLevel`、`toolNames` 和 `query` 过滤的聚焦 schema 发现能力，并默认使用 compact JSON 输出。
- 新增 `plugin_cleanup_port`，旧 WebSocket bridge 监听进程可以先 dry-run 检查，只在显式清理请求下停止。
- 拒绝未过滤的 `includeSchemas=true` 请求，避免再次把 900 KB 级别响应拉进助手上下文。
- 更新 README 和内置 Skill，明确两阶段发现流程：先取轻量目录，只在需要时取聚焦 schema。
- 增加 roadmap 验证覆盖，检查 payload 大小、过滤 schema 获取、未过滤 schema 拒绝，以及文档/Skill 指引。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.2`。

## 2.8.1

WebSocket bridge 端口冲突安全版本。

- 移除 WebSocket bridge 端口已被其它进程占用时自动执行 `taskkill` / `kill -9` 的行为。
- 修复 bridge 监听失败后的 server 状态清理，避免 `status().running` 误报为 true。
- 增加进程回归覆盖，验证端口占用会被报告但不会终止端口 owner，且 owner 退出后 bridge 可以重新启动。
- 将内部维护和验证脚本移动到 `dev-scripts/`，确保仓库根目录的 `scripts/` 目录只包含 `build.js`。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.1`。

## 2.8.0

Server 模块化和进程处理加固版本。

- 将旧的 5k 行 `GodotServer.methods.ts` 实现拆分为聚焦的 `src/server/methods/*` 模块，同时保持公开工具面不变。
- 增加进程处理回归覆盖，验证失败的 headless Godot 操作、启动即退出以及停止运行后的 debug output 保留。
- 加固 Godot 操作错误传播，非零进程退出会作为工具失败报告，不再被误判为成功输出。
- 更新生成验证脚本，使 server 方法拆分后验证会扫描完整 `src/server` 源码树。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.8.0`。

## 2.7.3

稳定 MCP bridge 生命周期版本。

- 修复长时间运行的 MCP WebSocket bridge：editor/runtime `hello` 鉴权会按需读取已安装项目的 `.godot-devtool/bridge-config.json` token，不再要求同一进程里先调用过 `plugin_status`。
- 增加 security 回归覆盖，验证 lazy project-auth hello 路径，避免 fresh MCP server 启动后已安装项目一直处于 unauthorized。
- 更新内置 Skill，明确 `node E:/godot-devtool/build/index.js` 必须持续运行，dock `Registered`、`editor_ws` 和 `runtime_ws` 路由才能保持可用。
- 使用全新临时 Godot 项目验证 install-to-runtime 全链路，包括 MCP stdio 初始化、插件安装/status、WebSocket bridge 握手、项目运行和 runtime 路由 smoke checks。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.7.3`。

## 2.7.2

Dock 状态稳定性版本。

- 修复 `GDT` dock：状态刷新改为节流，Label、按钮和状态点只在值变化时更新，避免 Godot editor dock 持续闪烁。
- 修复 editor bridge 启动路径：`_enter_tree()` 会在创建状态 dock 前主动发起首次 WebSocket 连接。
- 修复 editor 和 runtime bridge 的重试节流逻辑，避免 Godot 快速启动时首次连接被跳过。
- 增加插件验证覆盖，检查 dock 刷新稳定性、editor 启动连接顺序，以及源插件和安装副本中的首次连接节流防护。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.7.2`。

## 2.7.1

Runtime bridge bugfix 版本。

- 修复 runtime autoload bridge：`_ready()` 会先加载 bridge config，并在写 runtime state 前立即发起首次 WebSocket 连接。
- 修复 headless 环境下的 `get_game_screenshot` 处理：viewport image 不可用时返回结构化 runtime 错误，不再超时或打断到 Godot debugger。
- 增加插件验证覆盖，检查 runtime bridge 启动顺序，以及源插件和安装副本中的截图 unavailable-image 防护。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.7.1`。

## 2.7.0

实时编辑器场景修改与 dock 架构版本。

- 增加显式实时 editor 工具，可通过 UndoRedo 在当前打开的 Godot 编辑器场景里添加、删除、重命名、移动、复制节点，并保存场景。
- 为现有节点修改工具增加 `mode: "editor_live"`，让助手可以在可重复的 headless 文件编辑和实时 editor 修改之间选择，不再强制依赖磁盘重载。
- 将 `GDT` dock 重新设计为连接、实时编辑器、运行时和活动四个区块，显示当前场景、选择、实时编辑就绪状态、手动保存策略、runtime session、状态新鲜度和最近命令结果。
- 保持内置 Skill 只使用英文，并调整 GitHub Release 打包，使顶层 `scripts/` 目录只包含 `build.js`。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.7.0`。

## 2.6.5

Skill 上下文预算优化版本。

- 将内置 `godot-devtool` Skill 从较长的逐工具列表压缩为工作流路由。
- 增加上下文预算规则，要求助手不要粘贴或长期携带完整工具目录、生成的 README 表格或 Godot 源码，除非任务确实需要。
- 强化 `get_capabilities` 作为全部 221 个公开工具的动态 schema 和分类入口。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP 和 release zip 链接同步到 `2.6.5`。

## 2.6.4

Steam Godot 启动兼容版本。

- 将显式可写 `--log-file` 规避逻辑扩展到 `launch_editor` 和非 headless `run_project`，不再只覆盖 headless 操作。
- 重命名内部日志参数 helper，让 editor、run、headless 和 export 启动共享同一套 Godot 日志路径行为。
- 增加回归检查，要求 `launch_editor` 和 `run_project` 在 `--path` 前插入 `--log-file`。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP 和 release zip 链接同步到 `2.6.4`。

## 2.6.3

Steam headless Godot 兼容版本。

- 修复 Windows 上 Steam Godot `4.6.2.stable.steam` 的 headless 启动问题：对 headless 语法检查、operation、项目运行和导出，在 `--path` 前显式加入可写的 `--log-file`。
- 增加 `GODOT_DEVTOOL_HEADLESS_LOG_DIR`，允许用户指定 headless Godot 日志目录；默认仍写入系统临时目录。
- 将 runtime 验证也切换到同样的显式日志文件路径，因此 `verify:runtime` 已可通过本机 Steam Godot tools 可执行文件。
- 增加安全回归检查，要求未来发布保留 headless 日志文件规避逻辑。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP 和 release zip 链接同步到 `2.6.3`。

## 2.6.2

安全加固版本。

- 为 editor/runtime WebSocket bridge peer 增加按项目生成的认证 token，并将命令回执绑定到已认证 client。
- 加固项目相对文件操作，拒绝 symlink/junction 逃逸和不安全路径穿越。
- 阻止 MCP 传入的 `project.godot` raw value 和普通字符串换行注入，同时保留内部可信 InputMap 序列化。
- 将 runtime 截图和录制输出限制在 `.godot-devtool` 下，并增加穿越与覆盖检查。
- 为 Godot 进程增加超时，修正 editor 启动 stdio 处理，并加强 `script_attach` 路径校验。
- 为发布脚本增加 clean tree、tag/HEAD 一致性、`verify:all` 和显式 clobber 开关。
- 增加 `verify:security`，将 `verify:runtime` 和 `verify:security` 纳入 `verify:all`，并将 package、插件、Skill、README、CHANGELOG、ROADMAP 和 release zip 链接同步到 `2.6.2`。

## 2.6.1

工具路由 metadata 与兼容层加固版本。

- 修正 TileMap 兼容路由，让 `tilemap_clear`、`tilemap_get_cell` 和 `tilemap_get_used_cells` 明确指向 headless `tilemap` 实现，不再显示泛化 native/bridge 路径。
- 修复已安装 editor 插件 command router 中的 `reload_project`，让已公开的 editor WebSocket 路由可注册并执行。
- 修正 `assert_screen_text`、`run_test_scenario` 和 `run_stress_test` 的 QA 兼容路由 metadata，避免把 native QA helper 误标为 runtime WebSocket 路由。
- 增加回归检查，对比已发布工具、handler、兼容路由、editor/runtime WebSocket 路由声明和已安装插件路由。
- 将 package、插件、Skill、README、CHANGELOG 和验证 metadata 同步到 `2.6.1`。

## 2.6.0

Browser visualizer 版本。

- 增加 `browser_visualizer_start`、`browser_visualizer_status` 和 `browser_visualizer_stop` 工具，用于启动本地只读 HTTP 仪表盘。
- 仪表盘会刷新 MCP WebSocket bridge 状态、已连接 editor/runtime client、待处理命令数量，以及截图、场景检查、输入、UI 和编辑器状态相关的实时路由提示。
- 增加 Browser visualizer 回归验证，并纳入 `verify:all`。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP 和验证 metadata 同步到 `2.6.0`。

## 2.5.2

运行时握手诊断版本。

- 让 runtime autoload bridge 读取 `.godot-devtool/bridge-config.json`，跟随安装时写入的 MCP WebSocket URL，不再依赖硬编码开发端口。
- 在 `.godot-devtool/runtime-state.json` 增加 runtime bridge 诊断状态，包含 socket 状态、hello ack、hello 尝试次数、bridge URL、session id 和最近连接错误。
- 增加回归验证，要求 runtime bridge 读取配置并暴露握手状态诊断。
- 将 package、插件、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.5.2`。

## 2.5.1

公开工具面清理版本。

- 从已发布 MCP 工具列表和工具调用分发路径中移除纯旧版兼容别名。
- 将公开工具目录从 249 个工具加 28 个别名收敛为 217 个 canonical 或明确实现的工具，别名数为 0。
- 更新 `get_capabilities`，不再返回 `aliasCount` 或 `aliases` payload。
- 扩写英文和中文 README 的能力说明，具体覆盖项目、场景、脚本、文件系统、资源、视觉、编辑器和 runtime 工作流。
- 重新生成 README 工具表，让兼容封装描述实际执行的工作流，不再宣传“转接”或别名式文案。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.5.1`。

## 2.5.0

MCP 验证加固版本。

- 让 `get_capabilities` 和 MCP server metadata 上报当前 package 版本，修复旧 `2.2.0` 版本残留。
- 通过顶层 `canonicalName` 暴露兼容路由真实目标，同时保留现有兼容别名。
- 增加可执行的 Godot 可执行文件配置提示，并把配置或检测到的 Godot 路径传播到 `GODOT_PATH`，便于 stdio 客户端继承。
- 修复 `project_input_action` 写入逻辑，保留 Godot project-setting 字面量和原生 `InputEvent*` 语法。
- 增加带 `context: "runtime"` 的 runtime `hello` 注册，并为 editor bridge 增加带 session id、重试、heartbeat 和 dock 状态的 `hello` -> `hello_ack` 握手。
- 让 WebSocket 封装器把失败的 editor/runtime 回执暴露为 MCP 错误，并让已公开 editor 路由与已安装插件实现对齐。
- 增加覆盖插件、工具、roadmap 和项目检查的 2.5.0 回归验证。

## 2.4.1

WebSocket bridge 生命周期和 dock 刷新版本。

- 将 localhost WebSocket bridge 绑定到 MCP server 生命周期，让 Godot 编辑器插件在 server 运行期间能重连到稳定监听端。
- 在 `GDT` 编辑器 dock 增加 `Refresh` / `刷新状态` 操作，可立即轮询状态并触发重连，不必等待下一次 process tick。
- 增加 server bridge 生命周期启动/关闭和 dock 刷新 UI 的回归检查。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.4.1`。

## 2.4.0

运行时兼容能力补全版本。

- 将只返回回执的运行时输入兼容路由改为通过 `Input.parse_input_event` 注入按键、鼠标点击和鼠标移动事件。
- 加固 `simulate_action` 和 `simulate_sequence`，加入 InputMap 校验、strength 限制、逐事件失败结果和帧延迟处理。
- 增加 `start_recording`、`stop_recording` 和 `replay_recording` 运行时 bridge 路由，支持 `_input(event)` 捕获和 JSON 持久化。
- 更新兼容能力元数据和 README 工具表，让 runtime bridge 路由与通用兼容封装区分开。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.4.0`。

## 2.3.2

编辑器语言检测与运行时兼容能力路线图版本。

- 修复 `GDT` 编辑器 dock 的语言检测，让 Godot 编辑器语言值为 `zh` 时也显示简体中文状态界面；繁体中文 locale 继续回退为英文。
- 新增 `2.4.0 运行时兼容能力补全` 路线图章节，覆盖只返回回执的输入路由、运行时录制/回放路由、能力元数据和端到端 Godot runtime fixture。
- 将 package、插件、Skill、README、CHANGELOG、ROADMAP、验证 metadata 和 release zip 链接同步到 `2.3.2`。

## 2.3.1

编辑器 dock 标题与双语状态显示版本。

- 将内置 Godot 编辑器 dock 标签和状态面板标题改为 `GDT`。
- 当引擎/编辑器 locale 为简体中文时，状态标签、状态值、重新连接按钮和 tooltip 显示中文；其它 locale 保持英文。
- 将插件、package、Skill、README、路线图和验证 metadata 同步到 `2.3.1`。

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
