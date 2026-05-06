# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.7.0-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is an MCP server for AI-assisted Godot Engine workflows. It lets MCP-compatible assistants inspect, edit, run, debug, validate, and package Godot projects through a controlled tool interface.

This project was initially inspired by [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp), then repackaged and extended as `godot-devtool`.

## Quick Start

### 1. Download A Prebuilt Package

Latest release package:

[godot-devtool-build-1.7.0.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.7.0/godot-devtool-build-1.7.0.zip)

Extract the zip and point your MCP client at the extracted `build/index.js`.

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

If Godot is already available in `PATH`, `GODOT_PATH` can be omitted.

### 2. Build From Source

```bash
npm install
npm run build
```

The MCP server entry point is:

```text
build/index.js
```

### 3. Verify The Setup

```text
get_godot_version
get_capabilities
```

For a local project check:

```bash
npm run check:project -- E:/test
```

### 4. Give MCP Clients Operating Guidance

This repository includes a single skill file that tells MCP clients and connected AI assistants how to use this server safely:

[skills/godot-devtool/SKILL.md](skills/godot-devtool/SKILL.md)

The skill teaches clients to inspect project state first, prefer structured MCP tools over raw file edits, use preview/dry-run flows for risky operations, and run validation before finishing.

## Requirements

- Godot Engine 4.x.
- Node.js >= 18.0.0.
- npm when building from source.
- An MCP-compatible client such as Claude Desktop, MCP Inspector, Cline, Cursor, VS Code Copilot, or another MCP client.

## Common Workflow

1. Call `get_godot_version` to confirm Godot is available.
2. Call `list_projects`, or pass a known project path directly.
3. Call `get_project_info`, `get_resource_index`, and `get_script_index` to understand the project.
4. Use scene, node, script, resource, animation, visual, TileMap, physics, navigation, and audio tools to edit the project.
5. Install the editor bridge with `install_editor_bridge` when live editor selection, undo/redo, or Inspector property commands are needed.
6. Use `get_safety_policy`, `preview_write_safety`, `get_audit_replay`, and `get_rollback_suggestions` for high-risk writes.
7. Run `run_project`, `get_debug_output`, `check_gdscript_syntax`, `run_project_checks`, export checks, and generated CI snippets before release.

## All Tools

### Core And Project Tools

| Tool | Description |
| --- | --- |
| `get_capabilities` | Tool discovery with schemas, aliases, run modes, and risk levels |
| `get_godot_version` | Detect the installed Godot version |
| `list_projects` | Find Godot projects in a directory |
| `get_project_info` | Project metadata, main scene, autoloads, input actions, rendering, and resource counts |
| `project_get_settings` | Read `project.godot` settings |
| `project_set_setting` | Update `project.godot` settings with dry-run and audit logging |
| `project_input_action` | List, create, update, or delete InputMap actions |
| `get_safety_policy` | Read `.godot-devtool/safety.json` and default safety state |
| `set_safety_policy` | Configure write allowlists and blocked path rules |
| `preview_write_safety` | Preview policy decisions and diff summary metadata |
| `get_audit_replay` | Summarize audit entries into replay steps and risk highlights |
| `get_rollback_suggestions` | Return rollback guidance for changed files or audit entries |
| `get_resource_index` | Categorized scenes, scripts, textures, audio, models, resources, shaders, and other files |
| `resource_dependency_graph` | `res://` dependency graph with orphan resource detection |
| `get_script_index` | GDScript files with class, base class, exports, and functions |

### Scene And Node Tools

| Tool | Description |
| --- | --- |
| `create_scene` | Create a scene file |
| `scene_open` | Open a scene in the MCP session |
| `scene_get_current` | Return the current MCP-tracked scene |
| `get_scene_tree` | Read a scene node tree |
| `save_scene` | Save a scene or save a variant |
| `add_node` | Add a node with optional properties |
| `delete_node` | Delete a non-root node |
| `rename_node` | Rename a node |
| `node_get` | Read node information |
| `node_get_property` / `get_node_properties` | Read selected node properties |
| `node_set_property` / `update_node_properties` | Update node properties |
| `node_move` | Move a node by setting position |
| `node_duplicate` | Duplicate a node |
| `node_find` | Find nodes by name, type, or path substring |
| `load_sprite` | Assign a texture to a sprite-like node |

### Script, File, And Resource Tools

| Tool | Description |
| --- | --- |
| `script_create` | Create a GDScript file |
| `script_write` | Write full GDScript content |
| `script_attach` | Attach a GDScript resource to a scene node |
| `read_script_file` | Read a GDScript file |
| `analyze_script_references` | Analyze script class, functions, exports, node paths, and resources |
| `check_gdscript_syntax` | Run Godot syntax diagnostics for a script |
| `filesystem_list` | List files and directories inside a project |
| `filesystem_read` | Read a project-local text file |
| `filesystem_write` | Write a project-local text file |
| `filesystem_delete` | Delete a project-local file or directory with confirmation |
| `filesystem_preview_delete` | Preview deletion impact |
| `resource_load` | Read a text-based Godot resource |
| `resource_create` | Create a structured `.tres` or `.res` resource |
| `resource_save` | Save text-based resource content |

### Editor Bridge Tools

| Tool | Description |
| --- | --- |
| `launch_editor` | Launch the Godot editor for a project |
| `install_editor_bridge` | Install the editor bridge plugin |
| `editor_bridge_status` | Read installation, instance, pending command, expired command, and receipt details |
| `editor_get_selection` | Read current editor selection and edited scene |
| `editor_select_node` | Select a node in the live editor |
| `editor_undo_redo` | Enqueue editor undo or redo |
| `editor_inspector_get_properties` | Read Inspector properties from selected or addressed nodes |
| `editor_inspector_set_properties` | Write Inspector properties through the editor bridge |

### Run, Debug, Export, And Workflow Tools

| Tool | Description |
| --- | --- |
| `run_project` | Run a Godot project and capture output |
| `stop_project` | Stop the running Godot project |
| `get_debug_output` | Read buffered stdout/stderr and errors |
| `clear_debug_output` | Clear debug output buffers |
| `run_project_checks` | Stable project checks with machine-readable codes, causes, and fix suggestions |
| `get_audit_log` | Read project audit log entries |
| `create_workflow_test_scene` | Generate a workflow validation scene |
| `create_gameplay_prototype` | Generate a block-based survivors prototype |
| `get_export_presets` | Read export presets |
| `check_export_presets` | Inspect export preset issues |
| `export_matrix` | Summarize platform family, signing/template status, metadata, artifacts, issues, and CI suggestions |
| `generate_ci_snippet` | Generate GitHub Actions or GitLab CI snippets for headless checks, export preflight, release export, and artifact archiving |
| `update_export_preset` | Update export preset fields or options |
| `export_project` | Run a controlled Godot export |
| `export_mesh_library` | Export a 3D scene as a MeshLibrary resource |
| `get_uid` | Read Godot 4.4+ resource UID |
| `update_project_uids` | Resave resources to update UID references |

### Animation, UI, Visual, And Material Tools

| Tool | Description |
| --- | --- |
| `animation` | List, create, inspect, remove, and edit AnimationPlayer tracks/keyframes |
| `animation_state_machine` | Create, inspect, and configure AnimationTree state machine transitions |
| `signal` | List, connect, or disconnect node signals |
| `group` | List, add, or remove node groups |
| `ui` | Create Control nodes, reusable UI trees, Theme resources, theme assignments, and automatic signal wiring |
| `material` | Create, read, update, apply, list templates, and create reusable material templates |
| `shader` | Create/read shaders, inspect includes and texture uniforms, and configure ShaderMaterial parameters |
| `lighting` | Create and list Godot light and environment nodes |
| `particle` | Create and list particle emitter nodes |

### TileMap, Physics, Navigation, And Audio Tools

| Tool | Description |
| --- | --- |
| `tilemap` | Create/list TileMap nodes, create TileSets, edit cells, add atlas sources, configure metadata/collision/navigation/terrain, random paint, and apply templates |
| `geometry` | Create and list basic 2D geometry/debug drawing nodes |
| `physics` | Create/list physics bodies, configure named collision layers and masks, create Shape resources and templates, inspect collision info, and analyze scene physics issues |
| `navigation` | Create/list NavigationRegion, NavigationAgent, NavigationObstacle nodes, configure/bake navigation resources, query paths, and generate debug geometry |
| `audio` | Create/list AudioStreamPlayer nodes and inspect audio buses |

### Exact-Name Compatibility Tools

These tool names are supported for clients that expect a broader Godot automation surface. Some names route directly to canonical tools, some route to fixed actions on grouped tools, and live editor/runtime automation names enqueue structured bridge commands for the Godot editor/runtime bridge.

| Group | Tools |
| --- | --- |
| Project | `get_project_info`, `get_filesystem_tree`, `search_files`, `get_project_settings`, `set_project_setting`, `uid_to_project_path`, `project_path_to_uid` |
| Scene | `get_scene_tree`, `get_scene_file_content`, `create_scene`, `open_scene`, `delete_scene`, `add_scene_instance`, `play_scene`, `stop_scene`, `save_scene` |
| Node | `add_node`, `delete_node`, `duplicate_node`, `move_node`, `update_property`, `get_node_properties`, `add_resource`, `set_anchor_preset`, `rename_node`, `connect_signal`, `disconnect_signal`, `get_node_groups`, `set_node_groups`, `find_nodes_in_group` |
| Script | `list_scripts`, `read_script`, `create_script`, `edit_script`, `attach_script`, `get_open_scripts`, `validate_script`, `search_in_files` |
| Editor | `get_editor_errors`, `get_editor_screenshot`, `get_game_screenshot`, `execute_editor_script`, `clear_output`, `get_signals`, `reload_plugin`, `reload_project`, `get_output_log` |
| Input | `simulate_key`, `simulate_mouse_click`, `simulate_mouse_move`, `simulate_action`, `simulate_sequence`, `get_input_actions`, `set_input_action` |
| Runtime | `get_game_scene_tree`, `get_game_node_properties`, `set_game_node_property`, `execute_game_script`, `capture_frames`, `monitor_properties`, `start_recording`, `stop_recording`, `replay_recording`, `find_nodes_by_script`, `get_autoload`, `batch_get_properties`, `find_ui_elements`, `click_button_by_text`, `wait_for_node`, `find_nearby_nodes`, `navigate_to`, `move_to` |
| Animation | `list_animations`, `create_animation`, `add_animation_track`, `set_animation_keyframe`, `get_animation_info`, `remove_animation` |
| TileMap | `tilemap_set_cell`, `tilemap_fill_rect`, `tilemap_get_cell`, `tilemap_clear`, `tilemap_get_info`, `tilemap_get_used_cells` |
| Theme And UI | `create_theme`, `set_theme_color`, `set_theme_constant`, `set_theme_font_size`, `set_theme_stylebox`, `get_theme_info` |
| Profiling | `get_performance_monitors`, `get_editor_performance` |
| Batch And Refactoring | `find_nodes_by_type`, `find_signal_connections`, `batch_set_property`, `find_node_references`, `get_scene_dependencies`, `cross_scene_set_property`, `find_script_references`, `detect_circular_dependencies` |
| Shader | `create_shader`, `read_shader`, `edit_shader`, `assign_shader_material`, `set_shader_param`, `get_shader_params` |
| Export | `list_export_presets`, `export_project`, `get_export_info` |
| Resource | `read_resource`, `edit_resource`, `create_resource`, `get_resource_preview`, `add_autoload`, `remove_autoload` |
| Physics | `setup_physics_body`, `setup_collision`, `set_physics_layers`, `get_physics_layers`, `get_collision_info`, `add_raycast` |
| 3D Scene | `add_mesh_instance`, `setup_camera_3d`, `setup_lighting`, `setup_environment`, `add_gridmap`, `set_material_3d` |
| Particle | `create_particles`, `set_particle_material`, `set_particle_color_gradient`, `apply_particle_preset`, `get_particle_info` |
| Navigation | `setup_navigation_region`, `setup_navigation_agent`, `bake_navigation_mesh`, `set_navigation_layers`, `get_navigation_info` |
| Audio | `add_audio_player`, `add_audio_bus`, `add_audio_bus_effect`, `set_audio_bus`, `get_audio_bus_layout`, `get_audio_info` |
| AnimationTree | `create_animation_tree`, `get_animation_tree_structure`, `set_tree_parameter`, `add_state_machine_state` |
| State Machine | `remove_state_machine_state`, `add_state_machine_transition`, `remove_state_machine_transition` |
| Blend Tree | `set_blend_tree_node` |
| Analysis And Search | `analyze_scene_complexity`, `analyze_signal_flow`, `find_unused_resources`, `get_project_statistics` |
| Testing And QA | `run_test_scenario`, `assert_node_state`, `assert_screen_text`, `compare_screenshots`, `run_stress_test`, `get_test_report` |

## Project Layout

```text
src/
  index.ts                    # MCP stdio CLI entry
  server/GodotServer.ts        # MCP server lifecycle, registration, and dispatch
  tools/toolDefinitions.ts     # MCP tool schemas and compatibility aliases
  godot/                       # Godot project analysis, paths, files, resources, export, and workflows
  scripts/godot_operations/    # Source fragments for the generated headless Godot operation bridge
skills/
  godot-devtool/SKILL.md       # AI assistant workflow guidance for this MCP server
scripts/
  build.js                     # Generates build/scripts/godot_operations.gd after TypeScript build
  check-project.js             # Project health check entry
  publish-github-release.js    # Builds, uploads, and deletes local release packages after GitHub upload
  verify-roadmap-completion.js # Local regression verification for released capabilities
```

## Release Notes And Roadmap

- Completed changes: [CHANGELOG.md](CHANGELOG.md)
- Future plans: [ROADMAP.md](ROADMAP.md)

## License

MIT. See [LICENSE](LICENSE).
