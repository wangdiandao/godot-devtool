# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.7.1-blue.svg)](CHANGELOG.zh-CN.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

[English](README.md) | 涓枃

`godot-devtool` 鏄潰鍚?Godot Engine 宸ヤ綔娴佺殑 MCP server銆傚畠璁╂敮鎸?MCP 鐨?AI 鍔╂墜鍙互閫氳繃鍙楁帶宸ュ叿鎺ュ彛妫€鏌ャ€佺紪杈戙€佽繍琛屻€佽皟璇曘€侀獙璇佸拰鎵撳寘 Godot 椤圭洰銆?

鏈」鐩渶鍒濆彈鍒?[Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) 鍚彂锛岄殢鍚庝互 `godot-devtool` 閲嶆柊鎵撳寘骞舵墿灞曘€?

## 蹇€熷紑濮?

### 1. 涓嬭浇棰勬瀯寤哄寘

最新发行包：

[godot-devtool-build-1.7.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.7.1/godot-devtool-build-1.7.1.zip)

瑙ｅ帇 zip锛岀劧鍚庤 MCP 瀹㈡埛绔寚鍚戣В鍘嬪悗鐨?`build/index.js`銆?

```json
{
  "mcpServers": {
    "godot-devtool": {
      "command": "node",
      "args": ["E:/godot-devtool/build/index.js"],
      "env": {
        "GODOT_PATH": "D:/Program Files/Godot/Godot_v4.x.exe"
      }
    }
  }
}
```

濡傛灉 Godot 宸茬粡鍦ㄧ郴缁?`PATH` 涓紝鍙互鐪佺暐 `GODOT_PATH`銆?

### 2. 浠庢簮鐮佹瀯寤?

```bash
npm install
npm run build
```

MCP server 鍏ュ彛锛?

```text
build/index.js
```

### 3. 楠岃瘉瀹夎

```text
get_godot_version
get_capabilities
```

鏈湴椤圭洰妫€鏌ワ細

```bash
npm run check:project -- E:/test
```

### 4. 缁?MCP 瀹㈡埛绔彁渚涙搷浣滄寚寮?

鏈粨搴撳彧鍖呭惈涓€涓?Skill 鏂囦欢锛岀敤鏉ュ憡璇?MCP 瀹㈡埛绔拰鎺ュ叆鐨?AI 鍔╂墜濡備綍瀹夊叏浣跨敤杩欎釜鏈嶅姟绔細

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

璇?Skill 浼氭寚瀵煎鎴风鍏堟鏌ラ」鐩姸鎬侊紝浼樺厛浣跨敤缁撴瀯鍖?MCP 宸ュ叿鑰屼笉鏄洿鎺ユ敼鏂囦欢锛屽楂橀闄╂搷浣滀娇鐢?preview/dry-run锛屽苟鍦ㄧ粨鏉熷墠杩愯楠岃瘉銆?

## 鐜瑕佹眰

- Godot Engine 4.x銆?
- Node.js >= 18.0.0銆?
- 浠庢簮鐮佹瀯寤烘椂闇€瑕?npm銆?
- 鏀寔 MCP 鐨勫鎴风锛屼緥濡?Claude Desktop銆丮CP Inspector銆丆line銆丆ursor銆乂S Code Copilot 鎴栧叾浠?MCP client銆?

## 甯歌宸ヤ綔娴?

1. 璋冪敤 `get_godot_version` 纭 Godot 鍙敤銆?
2. 璋冪敤 `list_projects`锛屾垨鐩存帴浼犲叆宸茬煡椤圭洰璺緞銆?
3. 璋冪敤 `get_project_info`銆乣get_resource_index`銆乣get_script_index` 鐞嗚В椤圭洰銆?
4. 浣跨敤鍦烘櫙銆佽妭鐐广€佽剼鏈€佽祫婧愩€佸姩鐢汇€佽瑙夈€乀ileMap銆佺墿鐞嗐€佸鑸拰闊抽宸ュ叿缂栬緫椤圭洰銆?
5. 闇€瑕?live editor selection銆乽ndo/redo 鎴?Inspector 灞炴€у懡浠ゆ椂锛岀敤 `install_editor_bridge` 瀹夎 editor bridge銆?
6. 鍙戝竷鍓嶈繍琛?`run_project`銆乣get_debug_output`銆乣check_gdscript_syntax`銆乣run_project_checks`銆佸鍑烘鏌ュ拰鐢熸垚鐨?CI 鐗囨銆?

## 鍏ㄩ儴宸ュ叿

### 鏍稿績鍜岄」鐩伐鍏?

| Tool | 璇存槑 |
| --- | --- |
| `get_capabilities` | 鍙戠幇宸ュ叿 schema銆乤lias銆乺un mode 鍜?risk level |
| `get_godot_version` | 妫€娴嬫湰鏈?Godot 鐗堟湰 |
| `list_projects` | 鍦ㄧ洰褰曚腑鏌ユ壘 Godot 椤圭洰 |
| `get_project_info` | 椤圭洰鍏冧俊鎭€佷富鍦烘櫙銆乤utoload銆乮nput action銆乺endering 鍜岃祫婧愮粺璁?|
| `project_get_settings` | 璇诲彇 `project.godot` 璁剧疆 |
| `project_set_setting` | 鏇存柊 `project.godot` 璁剧疆锛屾敮鎸?dry-run 鍜?audit logging |
| `project_input_action` | 鍒楀嚭銆佸垱寤恒€佹洿鏂版垨鍒犻櫎 InputMap action |
| `get_safety_policy` | 璇诲彇 `.godot-devtool/safety.json` 鍜岄粯璁ゅ畨鍏ㄧ姸鎬?|
| `set_safety_policy` | 閰嶇疆鍐欏叆 allowlist 鍜?blocked path 瑙勫垯 |
| `preview_write_safety` | 棰勮 policy decision 鍜?diff summary metadata |
| `get_audit_replay` | 灏?audit entries 姹囨€讳负 replay steps 鍜?risk highlights |
| `get_rollback_suggestions` | 閽堝 changed files 鎴?audit entries 杩斿洖 rollback 寤鸿 |
| `get_resource_index` | 鍒嗙被鍒楀嚭 scene銆乻cript銆乼exture銆乤udio銆乵odel銆乺esource銆乻hader 鍜屽叾浠栨枃浠?|
| `resource_dependency_graph` | 鏋勫缓 `res://` 渚濊禆鍥惧苟妫€娴嬪绔嬭祫婧?|
| `get_script_index` | GDScript 鏂囦欢绱㈠紩锛屽寘鍚?class銆乥ase class銆乪xport 鍜?function |

### 鍦烘櫙鍜岃妭鐐瑰伐鍏?

| Tool | 璇存槑 |
| --- | --- |
| `create_scene` | 鍒涘缓 scene 鏂囦欢 |
| `scene_open` | 鍦?MCP session 涓墦寮€ scene |
| `scene_get_current` | 杩斿洖 MCP 褰撳墠璺熻釜鐨?scene |
| `get_scene_tree` | 璇诲彇 scene node tree |
| `save_scene` | 淇濆瓨 scene 鎴栧彟瀛樹负鍙樹綋 |
| `add_node` | 娣诲姞鑺傜偣骞跺彲璁剧疆灞炴€?|
| `delete_node` | 鍒犻櫎闈?root 鑺傜偣 |
| `rename_node` | 閲嶅懡鍚嶈妭鐐?|
| `node_get` | 璇诲彇鑺傜偣淇℃伅 |
| `node_get_property` / `get_node_properties` | 璇诲彇鎸囧畾鑺傜偣灞炴€?|
| `node_set_property` / `update_node_properties` | 鏇存柊鑺傜偣灞炴€?|
| `node_move` | 閫氳繃 position 绉诲姩鑺傜偣 |
| `node_duplicate` | 澶嶅埗鑺傜偣 |
| `node_find` | 鎸?name銆乼ype 鎴?path substring 鏌ユ壘鑺傜偣 |
| `load_sprite` | 缁?sprite 绫昏妭鐐瑰垎閰?texture |

### 鑴氭湰銆佹枃浠跺拰璧勬簮宸ュ叿

| Tool | 璇存槑 |
| --- | --- |
| `script_create` | 鍒涘缓 GDScript 鏂囦欢 |
| `script_write` | 鍐欏叆瀹屾暣 GDScript 鍐呭 |
| `script_attach` | 灏?GDScript resource 鎸傚埌 scene 鑺傜偣 |
| `read_script_file` | 璇诲彇 GDScript 鏂囦欢 |
| `analyze_script_references` | 鍒嗘瀽 script class銆乫unction銆乪xport銆乶ode path 鍜?resource 寮曠敤 |
| `check_gdscript_syntax` | 杩愯 Godot 鑴氭湰璇硶璇婃柇 |
| `filesystem_list` | 鍒楀嚭椤圭洰鍐呮枃浠跺拰鐩綍 |
| `filesystem_read` | 璇诲彇椤圭洰鍐呮枃鏈枃浠?|
| `filesystem_write` | 鍐欏叆椤圭洰鍐呮枃鏈枃浠?|
| `filesystem_delete` | 甯︾‘璁ゅ垹闄ら」鐩唴鏂囦欢鎴栫洰褰?|
| `filesystem_preview_delete` | 棰勮鍒犻櫎褰卞搷 |
| `resource_load` | 璇诲彇鏂囨湰鍨?Godot resource |
| `resource_create` | 鍒涘缓缁撴瀯鍖?`.tres` 鎴?`.res` resource |
| `resource_save` | 淇濆瓨鏂囨湰鍨?resource 鍐呭 |

### Editor Bridge 宸ュ叿

| Tool | 璇存槑 |
| --- | --- |
| `launch_editor` | 鍚姩鎸囧畾椤圭洰鐨?Godot editor |
| `install_editor_bridge` | 瀹夎 editor bridge plugin |
| `editor_bridge_status` | 璇诲彇瀹夎銆乮nstance銆乸ending command銆乪xpired command 鍜?receipt 淇℃伅 |
| `editor_get_selection` | 璇诲彇褰撳墠 editor selection 鍜?edited scene |
| `editor_select_node` | 鍦?live editor 涓€変腑鑺傜偣 |
| `editor_undo_redo` | 鍏ラ槦 editor undo 鎴?redo |
| `editor_inspector_get_properties` | 浠庨€変腑鎴栨寚瀹氳妭鐐硅鍙?Inspector 灞炴€?|
| `editor_inspector_set_properties` | 閫氳繃 editor bridge 鍐欏叆 Inspector 灞炴€?|

### 杩愯銆佽皟璇曘€佸鍑哄拰宸ヤ綔娴佸伐鍏?

| Tool | 璇存槑 |
| --- | --- |
| `run_project` | 杩愯 Godot 椤圭洰骞舵崟鑾疯緭鍑?|
| `stop_project` | 鍋滄姝ｅ湪杩愯鐨?Godot 椤圭洰 |
| `get_debug_output` | 璇诲彇缂撳瓨 stdout/stderr 鍜?error |
| `clear_debug_output` | 娓呯┖ debug output buffer |
| `run_project_checks` | 甯︽満鍣ㄥ彲璇?code銆乧ause 鍜屼慨澶嶅缓璁殑绋冲畾椤圭洰妫€鏌?|
| `get_audit_log` | 璇诲彇椤圭洰 audit log |
| `create_workflow_test_scene` | 鐢熸垚宸ヤ綔娴侀獙璇?scene |
| `create_gameplay_prototype` | 鐢熸垚 block-based survivors 鍘熷瀷 |
| `get_export_presets` | 璇诲彇 export preset |
| `check_export_presets` | 妫€鏌?export preset 闂 |
| `export_matrix` | 姹囨€诲钩鍙版棌銆佺鍚?template 鐘舵€併€乵etadata銆乤rtifact銆侀棶棰樺拰 CI 寤鸿 |
| `generate_ci_snippet` | 鐢熸垚 GitHub Actions 鎴?GitLab CI 鐗囨锛岀敤浜?headless 妫€鏌ャ€佸鍑洪妫€銆乺elease export 鍜?artifact 褰掓。 |
| `update_export_preset` | 鏇存柊 export preset field 鎴?option |
| `export_project` | 鎵ц鍙楁帶 Godot export |
| `export_mesh_library` | 灏?3D scene 瀵煎嚭涓?MeshLibrary resource |
| `get_uid` | 璇诲彇 Godot 4.4+ resource UID |
| `update_project_uids` | 閲嶆柊淇濆瓨 resource 浠ユ洿鏂?UID 寮曠敤 |

### 鍔ㄧ敾銆乁I銆佽瑙夊拰鏉愯川宸ュ叿

| Tool | 璇存槑 |
| --- | --- |
| `animation` | 鍒楀嚭銆佸垱寤恒€佹鏌ャ€佸垹闄ゅ拰缂栬緫 AnimationPlayer tracks/keyframes |
| `animation_state_machine` | 鍒涘缓銆佹鏌ュ拰閰嶇疆 AnimationTree state machine transition |
| `signal` | 鍒楀嚭銆佽繛鎺ユ垨鏂紑鑺傜偣 signal |
| `group` | 鍒楀嚭銆佹坊鍔犳垨绉婚櫎鑺傜偣 group |
| `ui` | 鍒涘缓 Control 鑺傜偣銆乁I tree 妯℃澘銆乀heme 璧勬簮銆乼heme 搴旂敤鍜岃嚜鍔?signal wiring |
| `material` | 鍒涘缓銆佽鍙栥€佹洿鏂般€佸簲鐢ㄣ€佸垪鍑烘ā鏉垮苟浠庡彲澶嶇敤鏉愯川妯℃澘鍒涘缓 material |
| `shader` | 鍒涘缓/璇诲彇 shader锛屾鏌?include 鍜?texture uniform锛屽苟閰嶇疆 ShaderMaterial 鍙傛暟 |
| `lighting` | 鍒涘缓鍜屽垪鍑?Godot light/environment 鑺傜偣 |
| `particle` | 鍒涘缓鍜屽垪鍑?particle emitter 鑺傜偣 |

### TileMap銆佺墿鐞嗐€佸鑸拰闊抽宸ュ叿

| Tool | 璇存槑 |
| --- | --- |
| `tilemap` | 鍒涘缓/鍒楀嚭 TileMap 鑺傜偣銆佸垱寤?TileSet銆佺紪杈?cell銆佹坊鍔?atlas source銆侀厤缃?metadata/collision/navigation/terrain銆侀殢鏈虹粯鍒跺拰搴旂敤妯℃澘 |
| `geometry` | 鍒涘缓鍜屽垪鍑哄熀纭€ 2D geometry/debug drawing 鑺傜偣 |
| `physics` | 鍒涘缓/鍒楀嚭 physics body锛岄厤缃懡鍚?collision layer/mask锛屽垱寤?Shape 璧勬簮鍜屾ā鏉匡紝妫€鏌?collision info锛屽苟鍒嗘瀽 scene physics 闂 |
| `navigation` | 鍒涘缓/鍒楀嚭 NavigationRegion銆丯avigationAgent銆丯avigationObstacle锛岄厤缃?bake navigation 璧勬簮锛屾煡璇?path锛屽苟鐢熸垚 debug geometry |
| `audio` | 鍒涘缓/鍒楀嚭 AudioStreamPlayer 鑺傜偣骞舵鏌?audio bus |

## 全部工具

## 全部支持的工具

下面每个方法都对应真实的本地实现或 Godot editor/runtime bridge。Bridge 类工具会等待完成回执，并返回真实结果、超时或环境错误。

### Project Tools (7)

Tool Description
`get_project_info` 项目元数据、版本、视口和 autoload
`get_filesystem_tree` 带过滤的递归文件树
`search_files` 模糊/glob 文件搜索
`get_project_settings` 读取 project.godot 设置
`set_project_setting` 通过编辑器 API 设置项目配置
`uid_to_project_path` UID 转 res:// 路径
`project_path_to_uid` res:// 路径转 UID

### Scene Tools (9)

Tool Description
`get_scene_tree` 带层级的实时场景树
`get_scene_file_content` 原始 .tscn 文件内容
`create_scene` 创建新场景文件
`open_scene` 在编辑器中打开场景
`delete_scene` 删除场景文件
`add_scene_instance` 将场景实例化为子节点
`play_scene` 运行主场景/当前场景/指定场景
`stop_scene` 停止正在运行的场景
`save_scene` 保存当前场景到磁盘

### Node Tools (14)

Tool Description
`add_node` 按类型和属性添加节点
`delete_node` 删除节点并支持 undo
`duplicate_node` 复制节点及其子节点
`move_node` 移动或重挂节点
`update_property` 设置任意属性并自动解析类型
`get_node_properties` 获取节点属性
`add_resource` 给节点添加 Shape/Material 等资源
`set_anchor_preset` 设置 Control 锚点预设
`rename_node` 重命名场景节点
`connect_signal` 连接节点信号
`disconnect_signal` 断开信号连接
`get_node_groups` 获取节点所属分组
`set_node_groups` 设置节点分组
`find_nodes_in_group` 查找指定分组中的全部节点

### Script Tools (8)

Tool Description
`list_scripts` 列出脚本及 class 信息
`read_script` 读取脚本内容
`create_script` 按模板创建脚本
`edit_script` 搜索替换或完整编辑脚本
`attach_script` 将脚本挂到节点
`get_open_scripts` 列出编辑器中打开的脚本
`validate_script` 校验 GDScript 语法
`search_in_files` 搜索项目文件内容

### Editor Tools (9)

Tool Description
`get_editor_errors` 获取编辑器错误和堆栈信息
`get_editor_screenshot` 捕获编辑器视口
`get_game_screenshot` 捕获运行中游戏或 bridge 视口
`execute_editor_script` 通过 bridge 执行编辑器表达式
`clear_output` 清空输出面板
`get_signals` 获取节点信号及连接
`reload_plugin` 重新加载或确认 MCP bridge 插件
`reload_project` 重新扫描文件系统并加载脚本
`get_output_log` 获取输出面板内容

### Input Tools (7)

Tool Description
`simulate_key` 模拟键盘按下/释放
`simulate_mouse_click` 模拟鼠标点击
`simulate_mouse_move` 模拟鼠标移动
`simulate_action` 模拟 Godot Input Action
`simulate_sequence` 按帧延迟执行输入序列
`get_input_actions` 列出所有输入动作
`set_input_action` 创建或修改输入动作

### Runtime Tools (19)

Tool Description
`get_game_scene_tree` 获取运行中游戏或 bridge 上下文的场景树
`get_game_node_properties` 获取运行时或 bridge 上下文节点属性
`set_game_node_property` 设置运行时或 bridge 上下文节点属性
`execute_game_script` 在 runtime IPC 可用时执行游戏上下文 GDScript
`capture_frames` 多帧截图捕获
`monitor_properties` 按时间记录属性值
`start_recording` 开始输入录制
`stop_recording` 停止输入录制
`replay_recording` 回放输入录制
`find_nodes_by_script` 按脚本查找节点
`get_autoload` 获取 autoload 节点属性
`batch_get_properties` 批量获取多个节点属性
`find_ui_elements` 查找 UI 元素
`click_button_by_text` 按文本点击按钮
`wait_for_node` 等待节点出现
`find_nearby_nodes` 查找附近节点
`navigate_to` 导航到目标位置
`move_to` 移动角色到目标位置

### Remaining Tool Groups

Animation、TileMap、Theme/UI、Profiling、Batch/Refactoring、Shader、Export、Resource、Physics、3D Scene、Particle、Navigation、Audio、AnimationTree、State Machine、Blend Tree、Analysis/Search、Testing/QA 的支持方法与英文 README 完全一致，并按“一个方法一行描述”的样式维护。
## 椤圭洰缁撴瀯

```text
src/
  index.ts                    # MCP stdio CLI 鍏ュ彛
  server/GodotServer.ts        # MCP server 鐢熷懡鍛ㄦ湡銆佹敞鍐屽拰鍒嗗彂
  tools/toolDefinitions.ts     # MCP tool schema 鍜屽吋瀹?alias
  godot/                       # Godot 椤圭洰鍒嗘瀽銆佽矾寰勩€佹枃浠躲€佽祫婧愩€佸鍑哄拰宸ヤ綔娴?
  scripts/godot_operations/    # 鐢ㄤ簬鐢熸垚 headless Godot 鎿嶄綔妗ョ殑婧愮爜鐗囨
skills/
  godot-devtool/SKILL.md       # 闈㈠悜姝?MCP server 鐨?AI 鍔╂墜宸ヤ綔娴佹寚寮?
scripts/
  build.js                     # TypeScript 鏋勫缓鍚庣敓鎴?build/scripts/godot_operations.gd
  check-project.js             # 椤圭洰鍋ュ悍妫€鏌ュ叆鍙?
  publish-github-release.js    # 鏋勫缓銆佷笂浼狅紝骞跺湪 GitHub 涓婁紶鎴愬姛鍚庡垹闄ゆ湰鍦板彂甯冨寘
  verify-roadmap-completion.js # 宸插彂甯冭兘鍔涙湰鍦板洖褰掗獙璇?
```

## 鏇存柊鏃ュ織鍜岃矾绾垮浘

- 宸插畬鎴愬彉鏇达細[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)
- 鏈潵璁″垝锛歔ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)

## Godot 涓枃绀惧尯缇?

鎵爜鍔犲叆 Godot 涓枃绀惧尯缇も憼锛堢兢鍙凤細1078844534锛夈€?

![Godot 涓枃绀惧尯缇や簩缁寸爜](docs/assets/godot-chinese-community-qq-qrcode.jpg)

## 璁稿彲璇?

MIT銆傝 [LICENSE](LICENSE)銆?


## Godot 中文社区群

群号：1078844534


