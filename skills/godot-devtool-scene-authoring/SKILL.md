---
name: godot-devtool-scene-authoring
description: "Use with godot-devtool for saved scene/resource/script authoring through native and headless Godot tools."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool Scene Authoring

Load this for saved-file scene, resource, script, visual, TileMap, UI, animation, audio, physics, or navigation work.

## Inspect First

Request focused schema by route group or exact tool names:

    get_capabilities { "routeGroup": "scene", "includeSchemas": true }
    get_capabilities { "routeGroup": "resource", "includeSchemas": true }
    get_capabilities { "routeGroup": "script", "includeSchemas": true }

Read project state before writing:

    filesystem_list
    filesystem_read
    get_resource_index
    get_script_index
    resource_dependency_graph
    scene_open
    get_scene_tree
    get_node_properties

## Author

Use structured tools:

    create_scene
    add_node
    update_node_properties
    node_move
    rename_node
    node_duplicate
    delete_node
    save_scene
    resource_create
    load_sprite
    material
    shader
    script_create
    script_write
    script_attach

For domain work, load only the needed schema:

    ui
    animation
    tilemap
    audio
    lighting
    physics
    navigation
    particle

## Validate

Run `check_gdscript_syntax` after script changes and `run_project_checks` after project-wide changes. Use `run_project` plus runtime tools when behavior must be proven in a running game.
