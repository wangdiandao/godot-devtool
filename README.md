# godot-devtool

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.1-blue.svg)](CHANGELOG.md)
[![Godot](https://img.shields.io/badge/Godot-4.x-478cbf.svg)](https://godotengine.org/)
[![MCP](https://img.shields.io/badge/MCP-server-111827.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

English | [中文](README.zh-CN.md)

`godot-devtool` is an MCP server for AI-assisted Godot Engine workflows. It lets MCP-compatible assistants inspect, edit, run, debug, validate, and package Godot projects through a controlled tool interface.

This project was initially inspired by [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp), then repackaged and extended as `godot-devtool`.

## Quick Start

### 1. Download A Prebuilt Package

Latest release package:

[godot-devtool-build-1.3.1.zip](https://github.com/wangdiandao/godot-devtool/releases/download/v1.3.1/godot-devtool-build-1.3.1.zip)

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
6. Run `run_project`, `get_debug_output`, `check_gdscript_syntax`, `run_project_checks`, and export checks before release.

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
| `run_project_checks` | Stable project checks for CI, review, and release workflows |
| `get_audit_log` | Read project audit log entries |
| `create_workflow_test_scene` | Generate a workflow validation scene |
| `create_gameplay_prototype` | Generate a block-based survivors prototype |
| `get_export_presets` | Read export presets |
| `check_export_presets` | Inspect export preset issues |
| `export_matrix` | Summarize platform family, signing/template status, issues, and CI suggestions |
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
| `physics` | Create and list physics bodies, areas, and collision shapes |
| `navigation` | Create/list NavigationRegion, NavigationAgent, NavigationObstacle nodes, and write NavigationRegion2D polygons |
| `audio` | Create/list AudioStreamPlayer nodes and inspect audio buses |

## Project Layout

```text
src/
  index.ts                    # MCP stdio CLI entry
  server/GodotServer.ts        # MCP server lifecycle, registration, and dispatch
  tools/toolDefinitions.ts     # MCP tool schemas and compatibility aliases
  godot/                       # Godot project analysis, paths, files, resources, export, and workflows
  scripts/godot_operations.gd  # Headless Godot operation bridge
scripts/
  build.js                     # Copies Godot operation scripts after TypeScript build
  check-project.js             # Project health check entry
  verify-roadmap-completion.js # Local regression verification for released capabilities
```

## Release Notes And Roadmap

- Completed changes: [CHANGELOG.md](CHANGELOG.md)
- Future plans: [ROADMAP.md](ROADMAP.md)

## License

MIT. See [LICENSE](LICENSE).
