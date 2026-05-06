# godot-devtool Roadmap

English | [中文](ROADMAP.zh-CN.md)

This document tracks future development plans only. Completed releases are tracked in [CHANGELOG.md](CHANGELOG.md).

## Future Versions

### 1.5.0 Export, CI, And Release Automation

- Add export template checks and optional setup guidance.
- Add platform signing detail checks.
- Add icon, metadata, and artifact validation.
- Generate CI snippets for headless checks, script syntax checks, export preflight, and artifact archiving.
- Improve `run_project_checks` with machine-readable failure causes and fix suggestions.

### 1.6.0 Safety And Recovery

- Add configurable write allowlists.
- Add batch diff summaries for high-risk write operations.
- Add audit replay summaries.
- Add rollback suggestions for supported write operations.

### 1.7.0 Expanded Tool Compatibility Surface

- Add exact-name compatibility wrappers or aliases for submitted tools that are currently covered only by differently named `godot-devtool` tools, including `get_project_settings`, `set_project_setting`, `open_scene`, `play_scene`, `stop_scene`, `duplicate_node`, `move_node`, `update_property`, `connect_signal`, `disconnect_signal`, `list_scripts`, `read_script`, `create_script`, `attach_script`, `validate_script`, `get_input_actions`, `set_input_action`, `list_animations`, `create_animation`, `tilemap_set_cell`, `tilemap_fill_rect`, `create_shader`, `read_shader`, `assign_shader_material`, `set_shader_param`, `get_shader_params`, `list_export_presets`, `read_resource`, `create_resource`, `setup_lighting`, `create_particles`, `setup_navigation_region`, `setup_navigation_agent`, `add_audio_player`, `get_audio_bus_layout`, and `create_animation_tree`.
- Add project, filesystem, UID, and scene utilities not yet present: `get_filesystem_tree`, `search_files`, `uid_to_project_path`, `project_path_to_uid`, `get_scene_file_content`, `delete_scene`, and `add_scene_instance`.
- Add node, script, signal, and group editing gaps: `add_resource`, `set_anchor_preset`, `get_node_groups`, `set_node_groups`, `find_nodes_in_group`, `edit_script`, `get_open_scripts`, and `search_in_files`.
- Add live editor inspection and control tools: `get_editor_errors`, `get_editor_screenshot`, `get_game_screenshot`, `execute_editor_script`, `clear_output`, `get_signals`, `reload_plugin`, `reload_project`, and `get_output_log`.
- Add input simulation and running-game automation tools: `simulate_key`, `simulate_mouse_click`, `simulate_mouse_move`, `simulate_action`, `simulate_sequence`, `get_game_scene_tree`, `get_game_node_properties`, `set_game_node_property`, `execute_game_script`, `capture_frames`, `monitor_properties`, `start_recording`, `stop_recording`, `replay_recording`, `find_nodes_by_script`, `get_autoload`, `batch_get_properties`, `find_ui_elements`, `click_button_by_text`, `wait_for_node`, `find_nearby_nodes`, `navigate_to`, and `move_to`.
- Add detailed animation, TileMap, theme, and profiling tools: `add_animation_track`, `set_animation_keyframe`, `get_animation_info`, `remove_animation`, `tilemap_get_cell`, `tilemap_clear`, `tilemap_get_info`, `tilemap_get_used_cells`, `create_theme`, `set_theme_color`, `set_theme_constant`, `set_theme_font_size`, `set_theme_stylebox`, `get_theme_info`, `get_performance_monitors`, and `get_editor_performance`.
- Add batch refactoring, dependency analysis, shader, export, resource, and autoload gaps: `find_nodes_by_type`, `find_signal_connections`, `batch_set_property`, `find_node_references`, `get_scene_dependencies`, `cross_scene_set_property`, `find_script_references`, `detect_circular_dependencies`, `edit_shader`, `get_export_info`, `edit_resource`, `get_resource_preview`, `add_autoload`, and `remove_autoload`.
- Add physics, 3D, particle, navigation, and audio configuration tools: `setup_physics_body`, `setup_collision`, `set_physics_layers`, `get_physics_layers`, `get_collision_info`, `add_raycast`, `add_mesh_instance`, `setup_camera_3d`, `setup_environment`, `add_gridmap`, `set_material_3d`, `set_particle_material`, `set_particle_color_gradient`, `apply_particle_preset`, `get_particle_info`, `bake_navigation_mesh`, `set_navigation_layers`, `get_navigation_info`, `add_audio_bus`, `add_audio_bus_effect`, `set_audio_bus`, and `get_audio_info`.
- Add AnimationTree, state machine, blend tree, analysis, and QA/testing tools: `get_animation_tree_structure`, `set_tree_parameter`, `add_state_machine_state`, `remove_state_machine_state`, `add_state_machine_transition`, `remove_state_machine_transition`, `set_blend_tree_node`, `analyze_scene_complexity`, `analyze_signal_flow`, `find_unused_resources`, `get_project_statistics`, `run_test_scenario`, `assert_node_state`, `assert_screen_text`, `compare_screenshots`, `run_stress_test`, and `get_test_report`.

### Validation Project

- Use the completed `godot-devtool` toolset to develop `E:/test` into a block-based survivor-like game.
- Keep art simple: player, enemies, bullets, pickups, and map elements should use blocks and basic geometry.
- Validate project understanding, scene/resource editing, script assistance, runtime debugging, checks, export, and audit logging.
- Target a playable main scene with player movement, enemy spawning, automatic attacks, experience/leveling, simple UI, audio placeholders, and export configuration.
