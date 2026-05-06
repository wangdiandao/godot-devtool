# godot-devtool 鏇存柊鏃ュ織

[English](CHANGELOG.md) | 涓枃

杩欓噷璁板綍宸茬粡瀹屾垚鐨勭増鏈彉鏇淬€傛湭鏉ヨ鍒掕 [ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)銆?


## 1.7.1

补齐 1.7 兼容工具的事实可执行实现。

- 将弱兼容 fallback 替换为本地、headless Godot 或 bridge-backed 的真实处理链。
- Editor/runtime bridge 命令现在会等待完成回执，并返回真实结果、超时或环境错误，不再只返回 queued 成功。
- 补齐 TileMap、Theme/UI、Audio、AnimationTree、State Machine、Blend Tree、Testing/QA 和 profiling 相关实现。
- README 能力列表改为一个方法对应一句描述，并同步 `1.7.1` 发布元数据。
## 1.7.0

鎵╁睍宸ュ叿鍏煎闈㈢増鏈€?

- 涓哄凡鏈夐」鐩€佸満鏅€佽妭鐐广€佽剼鏈€佽祫婧愩€佽繍琛屻€佽皟璇曘€佸鍑哄拰 UID 宸ュ叿澧炲姞绮剧‘鍚嶇О鍏煎鍒悕銆?
- 涓?signal銆両nputMap銆乤nimation銆乻hader銆乵aterial銆乴ighting銆乸article銆乀ileMap銆乸hysics銆乶avigation銆乤udio銆乫ilesystem 鍜?dependency 宸ュ叿澧炲姞 action 璺敱鍖呰銆?
- 涓轰粛闇€瑕佸悗缁?bridge/runtime 鏀寔鐨?live editor銆乺unning-game automation銆乸rofiling銆丵A銆乤utoload 鍜?batch refactoring 宸ュ叿鍚嶅鍔犲彲鍙戠幇鐨勭粨鏋勫寲 unsupported 鍝嶅簲銆?
- 澧炲姞 1.7.0 瀹屾暣鍏煎宸ュ叿鍚嶉泦鍚堢殑楠岃瘉瑕嗙洊銆?
- 鏇存柊 `1.7.0` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.6.0

瀹夊叏涓庢仮澶嶇増鏈€?

- 澧炲姞椤圭洰鏈湴 safety policy锛屾敮鎸佸彲閰嶇疆鍐欏叆 allowlist 鍜?blocked path 瑙勫垯銆?
- 涓洪珮椋庨櫓鍐欏叆鍜屽垹闄ゆ搷浣滃鍔犵粨鏋勫寲 diff 鎽樿銆?
- 澧炲姞 audit replay 鎽樿锛屽寘鍚?operation 璁℃暟銆乧hanged file 璁℃暟鍜?risk highlights銆?
- 涓哄垱寤恒€佽鐩栥€佸垹闄ゃ€佽缃€亀orkflow 鍜?bridge 鍙樻洿澧炲姞 rollback 寤鸿銆?
- 鏇存柊 `1.6.0` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.5.0

瀵煎嚭銆丆I 鍜屽彂甯冭嚜鍔ㄥ寲鐗堟湰銆?

- 鎵╁睍 export preset 妫€鏌ワ紝澧炲姞 export template 鎸囧紩銆佸钩鍙扮鍚嶈鎯呫€乮con 鍜?metadata 妫€鏌ワ紝浠ュ強宸查厤缃?artifact 楠岃瘉銆?
- 澧炲姞 `generate_ci_snippet`锛岀敓鎴?GitHub Actions 鍜?GitLab CI 鐨?headless 妫€鏌ャ€佸鍑洪妫€銆乺elease export 鍜?artifact 褰掓。鐗囨銆?
- 鏀硅繘 `run_project_checks`锛屼负妫€鏌ョ粨鏋滃鍔犳満鍣ㄥ彲璇?code銆佸師鍥犲拰淇寤鸿銆?
- 澧炲姞 `release:github` 鍙戝竷鑷姩鍖栵紝GitHub Release 涓婁紶鎴愬姛鍚庝細鍒犻櫎鏈湴 release zip銆?
- 鏇存柊 `1.5.0` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.4.0

鐗╃悊銆佸鑸拰璋冭瘯鍒嗘瀽鐗堟湰銆?

- 鎵╁睍 `physics`锛屾敮鎸?collision layer/mask 鏇存柊銆佸懡鍚?layer 瑙ｆ瀽銆乧ollision info 妫€鏌ャ€佸彲澶嶇敤 Shape 璧勬簮鍒涘缓銆丄rea trigger 妯℃澘銆丆haracterBody controller 妯℃澘鍜?scene physics 鍒嗘瀽銆?
- 鎵╁睍 `navigation`锛屾敮鎸?bake 閰嶇疆銆丯avigationMesh bake 鎵ц銆乸ath query 杈撳嚭鍜?Line2D navigation debug geometry 鐢熸垚銆?
- 涓?1.4.0 宸ュ叿 schema 鍜岀敓鎴愮殑 Godot 鎿嶄綔鍑芥暟澧炲姞鍙戝竷楠岃瘉瑕嗙洊銆?
- 鏇存柊 `1.4.0` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.3.1

浠ｇ爜缁勭粐鍜屽彲缁存姢鎬х増鏈€?

- 灏?MCP 宸ュ叿瀹氫箟鎸夌被鍒媶鍒嗕负妯″潡锛屽悓鏃朵繚鐣欐墍鏈夊鍑虹殑宸ュ叿鍚嶅拰鍏煎鍒悕銆?
- 灏嗗崟涓湇鍔＄宸ュ叿 `switch` 鏇挎崲涓烘寜绫诲埆缁勭粐鐨?handler registry銆?
- 灏?Godot 鎿嶄綔婧愮爜鎷嗗垎涓烘湁搴忓垎绫荤墖娈碉紝鍚屾椂淇濇寔鐢熸垚鐨勮繍琛屾椂鑴氭湰涓庢鍓嶅崟鏂囦欢鑴氭湰瀛楄妭绾у吋瀹广€?
- 澧炲姞宸ュ叿瀹氫箟瑕嗙洊鍜?Godot 鎿嶄綔鑴氭湰鐢熸垚楠岃瘉鑴氭湰銆?
- 鏇存柊 `1.3.1` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.3.0

瑙嗚銆丼hader銆佸姩鐢诲拰 UI 澧炲己鐗堟湰銆?

- 澧炲姞 shader include 鎶ュ憡鍜?texture uniform 鎺ㄦ柇銆?
- 閫氳繃 `material` 鐨?`list_templates` 鍜?`create_from_template` 澧炲姞鍙鐢ㄦ潗璐ㄦā鏉裤€?
- 鎵╁睍 `animation`锛屽鍔?`add_track`銆乣set_keyframe`銆乣get_info` 鍜?`remove` action銆?
- 閫氳繃 `animation_state_machine` 澧炲姞 AnimationTree transition 鍙傛暟缂栬緫銆?
- 鎵╁睍 `ui`锛屽鍔?Theme 璧勬簮鍒涘缓銆乼heme 搴旂敤銆佸彲澶嶇敤 Control tree 妯℃澘鍜岃嚜鍔?signal 杩炴帴杈呭姪銆?
- 鏇存柊 `1.3.0` 鍙戝竷鏂囨。鍜屾瀯寤哄寘涓嬭浇閾炬帴銆?

## 1.2.1

鏂囨。鍜屽彂琛屽寘鏇存柊銆?

- 鏂板鑻辨枃鍜屼腑鏂?CHANGELOG銆?
- 灏嗗凡瀹屾垚鐗堟湰鍘嗗彶绉诲嚭 ROADMAP锛岃 ROADMAP 鍙繚鐣欐湭鏉ヨ鍒掋€?
- 鏂板鑻辨枃鍜屼腑鏂?ROADMAP锛屽苟鎻愪緵璇█鍒囨崲銆?
- 鏇挎崲 LICENSE 涓烘湰椤圭洰鎵€鏈夎€呯殑 MIT 璁稿彲璇佸０鏄庛€?
- 璋冩暣 README 缁撴瀯锛屼娇鐢ㄦ寜宸ュ叿鍒嗙粍鐨勫姛鑳借〃銆?
- 澧炲姞棰勬瀯寤哄彂琛屽寘鐨勭洿鎺ヤ笅杞藉拰浣跨敤璇存槑銆?

## 1.2.0

TileSet 鍜屽湴鍥剧敓鎴愮増鏈€?

- 閫氳繃 `tilemap` 鐨?`add_atlas_source` action 澧炲姞 TileSet atlas source 绠＄悊銆?
- 澧炲姞 tile 鑷畾涔?metadata銆乧ollision polygon銆乶avigation polygon 鍜?terrain 閰嶇疆 action銆?
- 澧炲姞甯︽潈閲嶇殑纭畾鎬ч殢鏈哄湴鍥剧粯鍒躲€?
- 澧炲姞鍙鐢ㄥ湴鍥炬ā鏉匡紝鍖呮嫭鐢ㄤ簬鍦板舰鍜岄殰纰嶅竷灞€鐢熸垚鐨?`survivor_arena`銆?

## 1.1.0

Editor bridge 寮哄寲鐗堟湰銆?

- 澧炲姞鍛戒护鎵ц receipt锛屾敮鎸?queued銆乧ompleted銆乫ailed 鍜?expired 鐘舵€併€?
- 澧炲姞鍛戒护 timeout 鍜?editor-side 閿欒璇︽儏銆?
- 澧炲姞 `editor_inspector_get_properties` 鍜?`editor_inspector_set_properties` 涓や釜 Inspector 灞炴€ц鍐欏懡浠ゃ€?
- 澧炲姞 file銆丠TTP銆乄ebSocket bridge session 鐨?mode metadata銆?
- 澧炲姞绋冲畾鐨?editor instance metadata锛岀敤浜庡尯鍒嗗缂栬緫鍣ㄥ拰澶氶」鐩疄渚嬨€?
- 鎵╁睍 `editor_bridge_status`锛岃繑鍥?instance銆乥ridge銆乸ending command銆乪xpired command 鍜?recent receipt 淇℃伅銆?

## 1.0.0

`godot-devtool` 鍒濆鐗堟湰銆?

- 灏嗛」鐩噸鏂版墦鍖呬负 `godot-devtool`銆?
- 鎸?`src/server`銆乣src/godot`銆乣src/tools` 鍜?`src/scripts` 閲嶇粍浠ｇ爜缁撴瀯銆?
- 澧炲姞 `get_capabilities`锛岀敤浜庡彂鐜?tool schema銆佸吋瀹瑰埆鍚嶃€佽繍琛屾ā寮忓拰椋庨櫓绛夌骇銆?
- 澧炲姞椤圭洰鍏冧俊鎭垎鏋愩€佸垎绫昏祫婧愮储寮曘€丟DScript 绱㈠紩鍜岃祫婧愪緷璧栧垎鏋愩€?
- 澧炲姞椤圭洰璁剧疆銆両nputMap銆佹枃浠剁郴缁熴€佽祫婧愩€佸満鏅€佽妭鐐广€佽剼鏈€佺紪杈戝櫒妗ャ€佸姩鐢汇€佽瑙夈€乀ileMap銆佺墿鐞嗐€佸鑸€侀煶棰戙€佸鍑恒€乁ID銆佸伐浣滄祦鍜岄獙璇佸伐鍏枫€?
- 澧炲姞 `scripts/check-project.js` 鍜?`scripts/verify-roadmap-completion.js` 鐢ㄤ簬鏈湴楠岃瘉銆?
