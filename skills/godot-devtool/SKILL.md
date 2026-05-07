---
name: godot-devtool
description: "Teach MCP clients and connected AI assistants how to use the godot-devtool 2.6.1 MCP server for Godot 4 projects: map each common Godot operation to the right tool, use stdio/headless for repeatable edits, use WebSocket only for live editor/runtime state, and verify changes."
metadata:
  version: "2.6.1"
  mcp_server: "godot-devtool"
---

# Godot Devtool MCP

Use this skill when an AI assistant works on a Godot 4 project through `godot-devtool`.

The MCP client starts `godot-devtool` over stdio. Most project edits should use native or headless Godot tools. WebSocket is only for live editor state or a running game.

## First Call

Always begin with:

    get_godot_version   -> confirm Godot is visible to the MCP server
    get_capabilities    -> list available tools, schemas, transports, and bridge requirements

Then inspect the project before editing:

    get_project_info          -> project name, Godot version, renderer, main scene, project paths
    filesystem_list          -> directory tree or a specific folder
    get_resource_index       -> scenes, resources, scripts, textures, audio, and other assets
    get_script_index         -> GDScript classes, base classes, exported vars, and functions
    project_get_settings     -> project.godot settings by section or key
    resource_dependency_graph -> resource dependencies and orphan resources

If the project path is unknown:

    list_projects -> find Godot projects under a directory

## Transport Rules

Use these rules before choosing a tool:

    stdio             -> always the MCP client/server transport
    native            -> file, project, index, dependency, safety, and audit operations
    headless_godot    -> scene/resource/script operations that Godot must parse or serialize
    process_control   -> launch, stop, export, project checks, debug output
    editor_ws         -> live editor selection, Inspector, UndoRedo, plugin reload
    runtime_ws        -> running-game scene tree, input, screenshots, runtime properties, QA

Default to native/headless. Use WebSocket only when the current editor or running game state is required.

Before editor WebSocket tools:

    plugin_install -> install addons/godot_devtool and runtime autoload into the project
    plugin_status  -> confirm plugin files, autoload, port, and bridge clients
    plugin_reload  -> reload the live editor plugin through WebSocket

`editor_ws` needs the Godot editor open with the plugin enabled. `runtime_ws` needs the game running with `DevtoolRuntime` connected.

## Essential Workflows

### 1. Explore A Project

    get_project_info      -> project metadata and main scene
    filesystem_list       -> project folders and files
    filesystem_read       -> read project text files
    get_resource_index    -> asset inventory
    get_script_index      -> script inventory
    read_script_file      -> read one GDScript file
    project_get_settings  -> read project.godot settings
    scene_open            -> set a scene as the current MCP session scene
    get_scene_tree        -> inspect a saved scene's node hierarchy
    node_find             -> find nodes by name, type, or path substring
    node_get              -> inspect one node
    get_node_properties   -> inspect selected node properties

### 2. Build A 2D Scene

    create_scene           -> create a .tscn file with rootNodeType such as Node2D or CharacterBody2D
    add_node               -> add Sprite2D, CollisionShape2D, Camera2D, Area2D, Control, etc.
    resource_create        -> create .tres resources such as shapes or materials
    load_sprite            -> assign a texture to a Sprite2D
    update_node_properties -> set position, scale, modulate, visibility, exported values, collision data
    node_move              -> move or reparent a node
    rename_node            -> rename a node
    node_duplicate         -> duplicate a node
    delete_node            -> delete a non-root node
    script_create          -> create GDScript for behavior
    script_attach          -> attach GDScript to a node
    save_scene             -> persist the scene

Player scene pattern:

1. `create_scene` with `rootNodeType: "CharacterBody2D"`.
2. `add_node` Sprite2D.
3. `add_node` CollisionShape2D.
4. `resource_create` a RectangleShape2D/CircleShape2D resource when a reusable shape is needed.
5. `script_create` movement logic.
6. `script_attach` to the root node.
7. `save_scene`.

### 3. Build A 3D Scene

    create_scene        -> create a Node3D scene
    add_node            -> add Node3D, MeshInstance3D, Camera3D, lights, bodies, areas
    add_mesh_instance   -> compatibility route for adding primitive/imported mesh instances
    lighting            -> create/list DirectionalLight3D, PointLight3D, SpotLight3D, WorldEnvironment
    setup_lighting      -> compatibility route for lighting create
    material            -> create/read/update/apply Godot material resources
    set_material_3d     -> compatibility route for applying 3D material
    physics             -> create/list/configure physics bodies, areas, collision layers, shapes
    setup_physics_body  -> compatibility route for physics body creation
    setup_collision     -> compatibility route for collision setup
    navigation          -> create/list/configure/bake/query/debug navigation nodes
    setup_camera_3d     -> compatibility route for camera setup
    save_scene          -> persist the scene

Use headless tools for authoring saved 3D scenes. Use runtime tools only to test a running instance.

### 4. Write And Edit Scripts

    get_script_index        -> find scripts and classes
    read_script_file        -> read current script content
    script_create           -> create a new .gd file
    script_write            -> replace full GDScript content with overwrite protection
    edit_script             -> compatibility route for script_write / targeted script edits
    script_attach           -> attach a script to a scene node
    analyze_script_references -> inspect class, exports, node paths, and resource references
    check_gdscript_syntax   -> run Godot --check-only diagnostics
    reload_project          -> compatibility route to refresh Godot after broad script changes

For targeted script edits, read first, edit the smallest safe region, then run `check_gdscript_syntax`.

### 5. Playtest And Debug

    run_project              -> launch main scene, current scene, or a specified scene
    get_game_screenshot      -> runtime_ws screenshot of the running game
    capture_frames           -> runtime_ws frame capture for motion/animation
    get_game_scene_tree      -> runtime_ws live scene tree
    get_game_node_properties -> runtime_ws live node values
    set_game_node_property   -> runtime_ws live property mutation
    simulate_key             -> runtime_ws key press with duration
    simulate_mouse_click     -> runtime_ws mouse click
    simulate_mouse_move      -> runtime_ws mouse movement
    simulate_action          -> runtime_ws InputMap action
    simulate_sequence        -> runtime_ws sequence of inputs
    get_debug_output         -> stdout/stderr/debug buffer from the running project
    get_editor_errors        -> compatibility route for editor/runtime errors
    stop_project             -> stop the current run

Playtesting loop:

1. `run_project`.
2. `plugin_status` and confirm runtime bridge connection if using runtime tools.
3. `get_game_screenshot`.
4. `simulate_action` or `simulate_key`.
5. `capture_frames`.
6. `get_game_node_properties`.
7. `get_debug_output` / `get_editor_errors`.
8. `stop_project`.
9. Fix scripts/scenes and repeat.

### 6. Animations

    animation                     -> list/create/add_track/set_keyframe/get_info/remove AnimationPlayer data
    create_animation              -> compatibility route for animation create
    add_animation_track           -> compatibility route for animation add_track
    set_animation_keyframe        -> compatibility route for animation set_keyframe
    get_animation_info            -> compatibility route for animation get_info
    animation_state_machine       -> create/list/configure AnimationTree state machines
    create_animation_tree         -> compatibility route for AnimationTree creation
    get_animation_tree_structure  -> compatibility route for AnimationTree inspection
    add_state_machine_state       -> compatibility route for adding states
    add_state_machine_transition  -> compatibility route for adding transitions
    set_tree_parameter            -> compatibility route for blend/tree parameters
    set_blend_tree_node           -> compatibility route for blend tree node setup

Bouncing sprite pattern:

1. `animation` action `create`, name `bounce`, length `1.0`.
2. `animation` action `add_track`, track path such as `Sprite2D:position`.
3. `animation` action `set_keyframe` at `0.0`, `0.5`, `1.0`.
4. `save_scene`.

### 7. UI And HUD

    ui                    -> create Control nodes, themes, templates, and signal wiring
    add_node              -> add Control, Label, Button, TextureRect, Panel, etc.
    set_anchor_preset     -> compatibility route for Control anchors
    set_theme_color       -> compatibility route for theme colors
    set_theme_constant    -> compatibility route for theme constants
    set_theme_font_size   -> compatibility route for font sizes
    set_theme_stylebox    -> compatibility route for backgrounds, borders, and styleboxes
    create_theme          -> compatibility route for UI theme creation
    get_theme_info        -> compatibility route for UI theme inspection
    signal                -> list/connect/disconnect signals
    connect_signal        -> compatibility route for connecting signals
    disconnect_signal     -> compatibility route for disconnecting signals
    click_button_by_text  -> runtime_ws click a visible UI button by text
    assert_screen_text    -> runtime_ws verify text on screen

Prefer Inspector-visible node properties and theme tools for layout/visual values. Write GDScript only for behavior.

### 8. TileMap

    tilemap                -> create/list/create_tileset/add_atlas_source/set_cell/batch_set_cells/fill_rect/paint_random/apply_template
    tilemap_get_info       -> compatibility route for TileMap info
    tilemap_set_cell       -> compatibility route for setting one tile
    tilemap_fill_rect      -> compatibility route for rectangular fill
    tilemap_get_used_cells -> compatibility route for used-cell inspection
    tilemap_clear          -> compatibility route for clearing cells

Inspect tile sources before painting. Prefer batch operations for large regions.

### 9. Audio

    audio                -> create/list/list_buses AudioStreamPlayer nodes and buses
    add_audio_player     -> compatibility route for adding AudioStreamPlayer, AudioStreamPlayer2D, AudioStreamPlayer3D
    get_audio_info       -> compatibility route for audio node info
    get_audio_bus_layout -> compatibility route for bus layout
    add_audio_bus        -> compatibility route for creating buses
    set_audio_bus        -> compatibility route for volume/mute/solo changes
    add_audio_bus_effect -> compatibility route for reverb, delay, compressor, etc.

### 10. Project Configuration

    project_get_settings -> read project.godot sections or keys
    project_set_setting  -> update project.godot with dry-run and audit support
    project_input_action -> list/create/update/delete InputMap actions
    set_project_setting  -> compatibility route for project_set_setting
    set_input_action     -> compatibility route for project_input_action
    get_autoload         -> compatibility route for reading autoloads
    add_autoload         -> compatibility route for registering autoload singletons
    remove_autoload      -> compatibility route for removing autoloads
    get_physics_layers   -> compatibility route for layer inspection
    set_physics_layers   -> compatibility route for collision layer names/masks
    get_export_presets   -> read export presets
    check_export_presets -> report export preset issues
    update_export_preset -> edit an export preset
    export_matrix        -> summarize export targets and CI steps
    generate_ci_snippet  -> generate CI config
    export_project       -> run Godot export

Never hand-edit `project.godot` when a project tool can make the change.

## Analysis And Debugging

    get_debug_output             -> print output, warnings, and errors from a run
    clear_debug_output           -> clear buffered run output
    get_editor_errors            -> compatibility route for editor/runtime errors
    get_editor_performance       -> compatibility route for editor performance
    get_performance_monitors     -> runtime_ws FPS, memory, draw calls, physics stats
    analyze_scene_complexity     -> compatibility route for scene complexity
    analyze_signal_flow          -> compatibility route for signal flow
    detect_circular_dependencies -> compatibility route for circular dependencies
    find_unused_resources        -> compatibility route using dependency graph/orphans
    find_node_references         -> compatibility route for node reference search
    find_script_references       -> compatibility route for script reference search
    get_scene_dependencies       -> compatibility route for scene dependencies
    search_in_files              -> compatibility route for text search

## Testing And QA

    run_project_checks  -> CI/review-friendly project checks
    run_test_scenario   -> compatibility route for runtime QA scenarios
    assert_node_state   -> compatibility route for runtime node property assertions
    assert_screen_text  -> compatibility route for runtime text assertions
    compare_screenshots -> compatibility route for visual comparison
    run_stress_test     -> compatibility route for stress checks
    get_test_report     -> compatibility route for test summaries
    wait_for_node       -> runtime_ws wait for node existence/state
    monitor_properties  -> runtime_ws watch properties over time
    start_recording     -> runtime_ws start interaction recording
    stop_recording      -> runtime_ws stop interaction recording
    replay_recording    -> runtime_ws replay recorded interactions

## Advanced Patterns

### Cross-Scene Operations

    cross_scene_set_property -> compatibility route for changing nodes in other scenes
    batch_get_properties     -> compatibility route for reading many nodes
    batch_set_property       -> compatibility route for writing many nodes
    find_nodes_by_type       -> compatibility route for node_find by type
    find_nodes_in_group      -> compatibility route for group lookup
    get_node_groups          -> compatibility route for group inspection
    set_node_groups          -> compatibility route for group assignment

### Shader And Material

    shader                 -> create/read/inspect/set_parameters for shaders
    create_shader          -> compatibility route for shader create
    read_shader            -> compatibility route for shader read
    edit_shader            -> compatibility route for shader edits
    get_shader_params      -> compatibility route for shader inspection
    set_shader_param       -> compatibility route for shader parameter writes
    material               -> create/read/update/apply/list_templates/create_from_template
    assign_shader_material -> compatibility route for applying ShaderMaterial
    set_material_3d        -> compatibility route for applying 3D material

### Navigation

    navigation                -> create/list/set_polygon/configure_bake/bake_navigation_mesh/query_path/create_debug_geometry
    setup_navigation_region   -> compatibility route for NavigationRegion creation
    setup_navigation_agent    -> compatibility route for NavigationAgent creation
    bake_navigation_mesh      -> compatibility route for navmesh bake
    get_navigation_info       -> compatibility route for navigation inspection
    set_navigation_layers     -> compatibility route for navigation layer configuration
    navigate_to               -> runtime_ws navigation command
    move_to                   -> runtime_ws movement command
    find_nearby_nodes         -> runtime_ws proximity search

### Code-To-Inspector Migration

Move hardcoded visual values from GDScript to scene/resource properties:

    read_script_file        -> find hardcoded assignments
    get_node_properties     -> inspect current Inspector values
    update_node_properties  -> set scene node values
    script_write/edit_script -> remove hardcoded script assignments
    save_scene              -> persist Inspector values
    check_gdscript_syntax   -> validate script after removal

Use this for colors, positions, sizes, theme overrides, material properties, visibility, anchors, margins, collision masks, and exported values that do not need runtime logic.

## Important Rules

- Read state before writing.
- Prefer structured tools over raw file edits.
- Prefer node/resource/Inspector properties over GDScript for visual and tuning values.
- Use `project_set_setting` / `project_input_action` instead of hand-editing `project.godot`.
- Use `filesystem_preview_delete` before delete operations unless the user explicitly named the exact path and asked to delete it.
- Save scenes after meaningful scene changes.
- Run `check_gdscript_syntax` after script changes.
- Runtime tools require an active running game and connected `DevtoolRuntime`.
- Editor WebSocket tools require the editor plugin to be enabled and connected.
- Do not claim live editor/runtime behavior worked unless the WebSocket route returned a real result or receipt.
- For runtime movement, prefer `simulate_action` over raw keys when InputMap actions exist.
- Use short key durations for precise movement.
- UI buttons usually need press and release; use click helpers or `simulate_mouse_click` with release behavior.

## Property Values

Use structured Godot Variant values when schemas accept them:

    Vector2 -> { "type": "Vector2", "value": [100, 200] }
    Vector3 -> { "type": "Vector3", "value": [1, 2, 3] }
    Color   -> { "type": "Color", "value": [1, 0, 0, 1] }
    bool    -> true / false
    number  -> 42 / 3.14
    enum    -> integer value expected by Godot

If using compatibility routes that accept strings, Godot-style strings such as `Vector2(100, 200)`, `Vector3(1, 2, 3)`, and `Color(1, 0, 0, 1)` are acceptable.

## Recommended Build Order

When building a new game or prototype:

1. Project setup: `get_project_info`, `project_set_setting`, `project_input_action`.
2. Main scene: `create_scene`, set main scene with `project_set_setting`.
3. Player: `create_scene`, `add_node`, `resource_create`, `script_create`, `script_attach`.
4. World: `tilemap`, `geometry`, `add_mesh_instance`, `lighting`, `navigation`, `physics`.
5. UI: `ui`, theme tools, `signal`.
6. Game logic: scripts, autoloads, groups, signals.
7. Audio: `audio`, audio bus compatibility routes.
8. Playtest: `run_project`, runtime WebSocket tools, debug output.
9. Polish: `animation`, particles, shader/material, UI themes.
10. Export: `check_export_presets`, `export_matrix`, `export_project`.

## Validate Before Finishing

    check_gdscript_syntax -> changed scripts
    run_project_checks    -> project-level checks
    run_project           -> smoke/run validation
    get_debug_output      -> runtime errors and warnings
    plugin_status         -> editor/runtime bridge status
    get_game_screenshot   -> visual runtime evidence when runtime bridge is connected

For this MCP package itself:

    npm.cmd run build
    npm.cmd run verify:tools
    npm.cmd run verify:gdscripts
    npm.cmd run verify:visualizer
    npm.cmd run verify:plugin
    npm.cmd run verify:all

Run build-heavy verifiers sequentially because they write the same build output.
