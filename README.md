# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.7.1-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is an MCP server for AI-assisted Godot Engine workflows. It lets MCP-compatible assistants inspect, edit, run, debug, validate, and package Godot projects through a controlled tool interface.

This project was initially inspired by [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp), then repackaged and extended as `godot-devtool`.

## Quick Start

### 1. Download A Prebuilt Package

Latest release package:

[godot-devtool-build-1.7.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.7.1/godot-devtool-build-1.7.1.zip)

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

## All Supported Tools

Every method below is backed by a real local implementation or by the Godot editor/runtime bridge. Bridge-backed tools wait for a completion receipt and return a real result, timeout, or environment error.

### Project Tools (7)

Tool Description
`get_project_info` Project metadata, version, viewport, autoloads
`get_filesystem_tree` Recursive file tree with filtering
`search_files` Fuzzy/glob file search
`get_project_settings` Read project.godot settings
`set_project_setting` Set project settings via editor API
`uid_to_project_path` UID to res:// conversion
`project_path_to_uid` res:// to UID conversion

### Scene Tools (9)

Tool Description
`get_scene_tree` Live scene tree with hierarchy
`get_scene_file_content` Raw .tscn file content
`create_scene` Create new scene files
`open_scene` Open scene in editor
`delete_scene` Delete scene file
`add_scene_instance` Instance scene as child node
`play_scene` Run scene (main/current/custom)
`stop_scene` Stop running scene
`save_scene` Save current scene to disk

### Node Tools (14)

Tool Description
`add_node` Add node with type and properties
`delete_node` Delete node with undo support
`duplicate_node` Duplicate node and children
`move_node` Move/reparent node
`update_property` Set any property with automatic type parsing
`get_node_properties` Get all node properties
`add_resource` Add Shape/Material/etc. to node
`set_anchor_preset` Set Control anchor preset
`rename_node` Rename a node in the scene
`connect_signal` Connect signal between nodes
`disconnect_signal` Disconnect signal connection
`get_node_groups` Get groups a node belongs to
`set_node_groups` Set node group membership
`find_nodes_in_group` Find all nodes in a group

### Script Tools (8)

Tool Description
`list_scripts` List all scripts with class info
`read_script` Read script content
`create_script` Create new script with template
`edit_script` Search/replace or full edit
`attach_script` Attach script to node
`get_open_scripts` List scripts open in editor
`validate_script` Validate GDScript syntax
`search_in_files` Search content in project files

### Editor Tools (9)

Tool Description
`get_editor_errors` Get errors and stack traces
`get_editor_screenshot` Capture editor viewport
`get_game_screenshot` Capture running game or bridge viewport
`execute_editor_script` Run an editor expression through the bridge
`clear_output` Clear output panel
`get_signals` Get all signals of a node with connections
`reload_plugin` Reload or acknowledge the MCP plugin bridge
`reload_project` Rescan filesystem and reload scripts
`get_output_log` Get output panel content

### Input Tools (7)

Tool Description
`simulate_key` Simulate keyboard key press/release
`simulate_mouse_click` Simulate mouse click at position
`simulate_mouse_move` Simulate mouse movement
`simulate_action` Simulate Godot Input Action
`simulate_sequence` Sequence of input events with frame delays
`get_input_actions` List all input actions
`set_input_action` Create/modify input action

### Runtime Tools (19)

Tool Description
`get_game_scene_tree` Scene tree of running game or bridge context
`get_game_node_properties` Node properties in running game or bridge context
`set_game_node_property` Set node property in running game or bridge context
`execute_game_script` Run GDScript in game context when runtime IPC is attached
`capture_frames` Multi-frame screenshot capture
`monitor_properties` Record property values over time
`start_recording` Start input recording
`stop_recording` Stop input recording
`replay_recording` Replay recorded input
`find_nodes_by_script` Find game nodes by script
`get_autoload` Get autoload node properties
`batch_get_properties` Batch get multiple node properties
`find_ui_elements` Find UI elements in game or bridge context
`click_button_by_text` Click button by text content
`wait_for_node` Wait for node to appear
`find_nearby_nodes` Find nodes near position
`navigate_to` Navigate to target position
`move_to` Walk character to target

### Animation Tools (6)

Tool Description
`list_animations` List all animations in AnimationPlayer
`create_animation` Create new animation
`add_animation_track` Add track (value/position/rotation/method/bezier)
`set_animation_keyframe` Insert keyframe into track
`get_animation_info` Detailed animation info with all tracks/keys
`remove_animation` Remove an animation

### TileMap Tools (6)

Tool Description
`tilemap_set_cell` Set a single tile cell
`tilemap_fill_rect` Fill rectangular region with tiles
`tilemap_get_cell` Get tile data at cell
`tilemap_clear` Clear all cells
`tilemap_get_info` TileMapLayer info and tile set sources
`tilemap_get_used_cells` List of used cells

### Theme & UI Tools (6)

Tool Description
`create_theme` Create Theme resource file
`set_theme_color` Set theme color override
`set_theme_constant` Set theme constant override
`set_theme_font_size` Set theme font size override
`set_theme_stylebox` Set StyleBoxFlat override
`get_theme_info` Get theme overrides info

### Profiling Tools (2)

Tool Description
`get_performance_monitors` All performance monitors (FPS, memory, physics, etc.)
`get_editor_performance` Quick performance summary

### Batch & Refactoring Tools (8)

Tool Description
`find_nodes_by_type` Find all nodes of a type
`find_signal_connections` Find all signal connections in scene
`batch_set_property` Set property on all nodes of a type
`find_node_references` Search project files for pattern
`get_scene_dependencies` Get resource dependencies
`cross_scene_set_property` Set property across all scenes
`find_script_references` Find where script/resource is used
`detect_circular_dependencies` Find circular scene dependencies

### Shader Tools (6)

Tool Description
`create_shader` Create shader with template
`read_shader` Read shader file
`edit_shader` Edit shader (replace/search-replace)
`assign_shader_material` Assign ShaderMaterial to node
`set_shader_param` Set shader parameter
`get_shader_params` Get all shader parameters

### Export Tools (3)

Tool Description
`list_export_presets` List export presets
`export_project` Get export command for preset
`get_export_info` Export-related project info

### Resource Tools (6)

Tool Description
`read_resource` Read .tres resource properties
`edit_resource` Edit resource properties
`create_resource` Create new .tres resource
`get_resource_preview` Get resource thumbnail/preview data
`add_autoload` Register autoload singleton
`remove_autoload` Remove autoload singleton

### Physics Tools (6)

Tool Description
`setup_physics_body` Configure physics body properties
`setup_collision` Add collision shapes to nodes
`set_physics_layers` Set collision layer/mask
`get_physics_layers` Get collision layer/mask info
`get_collision_info` Get collision shape details
`add_raycast` Add RayCast2D/3D node

### 3D Scene Tools (6)

Tool Description
`add_mesh_instance` Add MeshInstance3D with primitive mesh
`setup_camera_3d` Configure Camera3D properties
`setup_lighting` Add/configure light nodes
`setup_environment` Configure WorldEnvironment
`add_gridmap` Set up GridMap node
`set_material_3d` Set StandardMaterial3D properties

### Particle Tools (5)

Tool Description
`create_particles` Create GPUParticles2D/3D
`set_particle_material` Configure ParticleProcessMaterial
`set_particle_color_gradient` Set color gradient for particles
`apply_particle_preset` Apply preset (fire, smoke, sparks, etc.)
`get_particle_info` Get particle system details

### Navigation Tools (5)

Tool Description
`setup_navigation_region` Configure NavigationRegion
`setup_navigation_agent` Configure NavigationAgent
`bake_navigation_mesh` Bake navigation mesh
`set_navigation_layers` Set navigation layers
`get_navigation_info` Get navigation setup info

### Audio Tools (6)

Tool Description
`add_audio_player` Add AudioStreamPlayer node
`add_audio_bus` Add audio bus
`add_audio_bus_effect` Add effect to audio bus
`set_audio_bus` Configure audio bus properties
`get_audio_bus_layout` Get audio bus layout info
`get_audio_info` Get audio-related node info

### AnimationTree Tools (4)

Tool Description
`create_animation_tree` Create AnimationTree
`get_animation_tree_structure` Get tree structure
`set_tree_parameter` Set AnimationTree parameter
`add_state_machine_state` Add state to state machine

### State Machine Tools (3)

Tool Description
`remove_state_machine_state` Remove state from state machine
`add_state_machine_transition` Add transition between states
`remove_state_machine_transition` Remove state transition

### Blend Tree Tools (1)

Tool Description
`set_blend_tree_node` Configure blend tree nodes

### Analysis & Search Tools (4)

Tool Description
`analyze_scene_complexity` Analyze scene performance
`analyze_signal_flow` Map signal connections
`find_unused_resources` Find unreferenced resources
`get_project_statistics` Get project-wide statistics

### Testing & QA Tools (6)

Tool Description
`run_test_scenario` Run automated test scenario
`assert_node_state` Assert node property values
`assert_screen_text` Check for text on screen
`compare_screenshots` Compare two screenshots
`run_stress_test` Run performance stress test
`get_test_report` Get test results report

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
