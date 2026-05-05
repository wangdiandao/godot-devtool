# godot-devtool 路线图

[English](ROADMAP.md) | 中文

本文档只记录未来开发计划。已完成版本见 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。

## 未来计划

### 1.3.0 视觉、Shader、动画和 UI 增强

- 增加 texture uniform 推断和 shader include 感知。
- 增加可复用材质和视觉模板。
- 增强 AnimationPlayer track 和 keyframe 编辑。
- 增加 AnimationTree transition 参数工具。
- 增加 theme resource、Control tree 模板和 UI 自动 signal 连接辅助。

### 1.4.0 物理、导航和调试分析

- 增加命名 collision layer/mask 管理。
- 增加可复用 Shape resource 和 Area trigger 模板。
- 增加 CharacterBody controller 模板。
- 增加 NavigationMesh/NavigationPolygon bake 配置。
- 增加 path query 和 navigation debug geometry 生成。
- 增加 scene physics 检查，用于发现缺失 shape、无效 mask、重叠 area 和 navigation 断点。

### 1.5.0 导出、CI 和发布自动化

- 增加 export template 检查和可选安装指导。
- 增加平台签名细节检查。
- 增加 icon、metadata 和 artifact 验证。
- 生成用于 headless check、script syntax check、export preflight 和 artifact archiving 的 CI 片段。
- 改进 `run_project_checks`，提供机器可读的失败原因和修复建议。

### 1.6.0 安全和恢复

- 增加可配置写入 allowlist。
- 增加高风险写操作的批量 diff 摘要。
- 增加 audit replay 摘要。
- 增加受支持写操作的 rollback 建议。

### 1.7.0 扩展工具兼容面

- 为目前仅由不同名称 `godot-devtool` 工具覆盖的提交工具增加精确名称 wrapper 或 alias，包括 `get_project_settings`、`set_project_setting`、`open_scene`、`play_scene`、`stop_scene`、`duplicate_node`、`move_node`、`update_property`、`connect_signal`、`disconnect_signal`、`list_scripts`、`read_script`、`create_script`、`attach_script`、`validate_script`、`get_input_actions`、`set_input_action`、`list_animations`、`create_animation`、`tilemap_set_cell`、`tilemap_fill_rect`、`create_shader`、`read_shader`、`assign_shader_material`、`set_shader_param`、`get_shader_params`、`list_export_presets`、`read_resource`、`create_resource`、`setup_lighting`、`create_particles`、`setup_navigation_region`、`setup_navigation_agent`、`add_audio_player`、`get_audio_bus_layout` 和 `create_animation_tree`。
- 增加尚未存在的 project、filesystem、UID 和 scene 工具：`get_filesystem_tree`、`search_files`、`uid_to_project_path`、`project_path_to_uid`、`get_scene_file_content`、`delete_scene` 和 `add_scene_instance`。
- 增加 node、script、signal 和 group 编辑缺口：`add_resource`、`set_anchor_preset`、`get_node_groups`、`set_node_groups`、`find_nodes_in_group`、`edit_script`、`get_open_scripts` 和 `search_in_files`。
- 增加 live editor inspection 和 control 工具：`get_editor_errors`、`get_editor_screenshot`、`get_game_screenshot`、`execute_editor_script`、`clear_output`、`get_signals`、`reload_plugin`、`reload_project` 和 `get_output_log`。
- 增加 input simulation 和 running-game automation 工具：`simulate_key`、`simulate_mouse_click`、`simulate_mouse_move`、`simulate_action`、`simulate_sequence`、`get_game_scene_tree`、`get_game_node_properties`、`set_game_node_property`、`execute_game_script`、`capture_frames`、`monitor_properties`、`start_recording`、`stop_recording`、`replay_recording`、`find_nodes_by_script`、`get_autoload`、`batch_get_properties`、`find_ui_elements`、`click_button_by_text`、`wait_for_node`、`find_nearby_nodes`、`navigate_to` 和 `move_to`。
- 增加详细 animation、TileMap、theme 和 profiling 工具：`add_animation_track`、`set_animation_keyframe`、`get_animation_info`、`remove_animation`、`tilemap_get_cell`、`tilemap_clear`、`tilemap_get_info`、`tilemap_get_used_cells`、`create_theme`、`set_theme_color`、`set_theme_constant`、`set_theme_font_size`、`set_theme_stylebox`、`get_theme_info`、`get_performance_monitors` 和 `get_editor_performance`。
- 增加 batch refactoring、dependency analysis、shader、export、resource 和 autoload 缺口：`find_nodes_by_type`、`find_signal_connections`、`batch_set_property`、`find_node_references`、`get_scene_dependencies`、`cross_scene_set_property`、`find_script_references`、`detect_circular_dependencies`、`edit_shader`、`get_export_info`、`edit_resource`、`get_resource_preview`、`add_autoload` 和 `remove_autoload`。
- 增加 physics、3D、particle、navigation 和 audio 配置工具：`setup_physics_body`、`setup_collision`、`set_physics_layers`、`get_physics_layers`、`get_collision_info`、`add_raycast`、`add_mesh_instance`、`setup_camera_3d`、`setup_environment`、`add_gridmap`、`set_material_3d`、`set_particle_material`、`set_particle_color_gradient`、`apply_particle_preset`、`get_particle_info`、`bake_navigation_mesh`、`set_navigation_layers`、`get_navigation_info`、`add_audio_bus`、`add_audio_bus_effect`、`set_audio_bus` 和 `get_audio_info`。
- 增加 AnimationTree、state machine、blend tree、analysis 和 QA/testing 工具：`get_animation_tree_structure`、`set_tree_parameter`、`add_state_machine_state`、`remove_state_machine_state`、`add_state_machine_transition`、`remove_state_machine_transition`、`set_blend_tree_node`、`analyze_scene_complexity`、`analyze_signal_flow`、`find_unused_resources`、`get_project_statistics`、`run_test_scenario`、`assert_node_state`、`assert_screen_text`、`compare_screenshots`、`run_stress_test` 和 `get_test_report`。

### 验证项目

- 使用完成后的 `godot-devtool` 工具集将 `E:/test` 开发成基于方块的 survivor-like 游戏。
- 美术保持简单：player、enemy、bullet、pickup 和 map element 使用方块和基础几何体。
- 验证项目理解、scene/resource 编辑、script 辅助、runtime debugging、checks、export 和 audit logging。
- 目标是一个可玩的 main scene，包含 player movement、enemy spawning、automatic attacks、experience/leveling、simple UI、audio placeholder 和 export configuration。
