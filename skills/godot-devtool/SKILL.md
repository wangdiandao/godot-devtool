---
name: godot-devtool
description: "Teach MCP clients and connected AI assistants how to use the godot-devtool MCP server for Godot projects: inspect first, prefer structured tools, edit safely, validate changes, and prepare exports."
metadata:
  version: "1.7.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP

Use this skill as the operating guide for any MCP client or connected AI assistant using the `godot-devtool` MCP server with Godot 4 projects.

Compatibility: `godot-devtool` 1.7.0.

## Client Setup

Configure the MCP client to run the server entry point:

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

## Start Every Task

1. Confirm the server and tool surface.
   - `get_godot_version`
   - `get_capabilities` with schemas when unsure about arguments
2. Establish project context before writing.
   - `get_project_info`
   - `get_resource_index`
   - `get_script_index`
   - `resource_dependency_graph` for dependency-sensitive changes
3. If the user did not provide a path, use `list_projects` or ask for the Godot project path.

Do not edit blindly. Read the relevant scene, node, script, or resource state first.

## Common Workflows

### Inspect A Project

Use `get_project_info` for project metadata and main scene, `get_resource_index` for categorized assets, `get_script_index` for GDScript classes and functions, and `filesystem_list` / `filesystem_read` for direct project-local file inspection.

### Edit Scenes And Nodes

Prefer scene and node tools over raw `.tscn` editing:

- `create_scene`, `scene_open`, `scene_get_current`, `get_scene_tree`, `save_scene`
- `add_node`, `delete_node`, `rename_node`, `node_get`, `node_find`
- `node_get_property` / `get_node_properties`
- `node_set_property` / `update_node_properties`
- `node_move`, `node_duplicate`, `load_sprite`

After changing a scene, call `save_scene` when the change should persist.

### Write Scripts Safely

Read or index scripts before editing. Use:

- `script_create` for new scripts
- `script_write` for full content replacement
- `script_attach` to attach scripts to scene nodes
- `read_script_file` and `analyze_script_references` before changing existing code
- `check_gdscript_syntax` after writing GDScript

For GDScript, avoid clever dynamic code when typed data is unclear. Use explicit types for values coming from arrays or dictionaries when inference may fail.

### Configure Project Settings

Do not manually rewrite `project.godot` when a structured tool exists. Use:

- `project_get_settings`
- `project_set_setting`
- `project_input_action`

Use `dryRun` where available before committing broad settings changes.

### Work With Files And Resources

Stay inside the Godot project boundary:

- `filesystem_list`, `filesystem_read`, `filesystem_write`
- `filesystem_preview_delete` before `filesystem_delete`
- `resource_load`, `resource_create`, `resource_save`

Preview deletion impact before destructive operations.

### Use Safety And Recovery Tools

For broad or high-risk writes, inspect the project policy and preview the write impact:

- `get_safety_policy` to read the configured `.godot-devtool/safety.json` allowlist.
- `set_safety_policy` to enable write allowlists and blocked path rules.
- `preview_write_safety` to review policy decisions and diff summaries before writing.
- `get_audit_replay` to summarize recent audited operations.
- `get_rollback_suggestions` to get honest rollback guidance for changed files.

No configured policy keeps existing behavior compatible. When a policy is enabled, blocked writes should be resolved by narrowing the operation or updating the allowlist intentionally.

### Use The Editor Bridge

Install or use the editor bridge only when live editor state is needed:

- `install_editor_bridge`
- `editor_bridge_status`
- `editor_get_selection`
- `editor_select_node`
- `editor_undo_redo`
- `editor_inspector_get_properties`
- `editor_inspector_set_properties`

Prefer inspector/editor bridge tools for live selection, UndoRedo, and visible editor property changes.

### Build Visual Content

Use the grouped high-level tools instead of ad hoc scene file edits:

- `animation` and `animation_state_machine`
- `signal` and `group`
- `ui`
- `material`, `shader`, `lighting`, `particle`
- `tilemap`, `geometry`, `physics`, `navigation`, `audio`

Call `get_capabilities` with schemas when an action has nested arguments or enum values.

### Validate Before Finishing

For code or project edits, run the strongest available checks:

- `check_gdscript_syntax` for changed scripts
- `run_project_checks` for project-level validation with machine-readable failure codes, causes, and suggestions
- `get_export_presets`, `check_export_presets`, `export_matrix`, or `generate_ci_snippet` for release/export work
- `run_project`, then `get_debug_output`, when runtime behavior matters

Summarize actual check results, including failures and warnings.

## Safety Rules

- Read state before writing.
- Prefer structured tools over raw file edits.
- Use dry-run, preview, or audit-capable tools for broad changes.
- Do not delete files without `filesystem_preview_delete` unless the user explicitly asked for that exact path.
- Do not assume runtime screenshot/input tools exist; use only tools reported by `get_capabilities`.
- Keep user-authored project files intact unless the requested change requires modifying them.

## Version Sync

When updating the `godot-devtool` package version, update this skill's `metadata.version` and Compatibility line together with `package.json`, `package-lock.json`, README download links, and changelogs. Run the repo verification scripts before publishing.
