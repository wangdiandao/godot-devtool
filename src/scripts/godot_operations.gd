#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

func _init():
    var args = OS.get_cmdline_args()
    
    # Check for debug flag
    debug_mode = "--debug-godot" in args
    
    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
    
    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3
    
    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)
    
    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))
    
    var operation = args[operation_index]
    var params_json = args[params_index]
    
    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)
    
    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null
    
    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)
    
    if not params:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
    
    log_info("Executing operation: " + operation)
    
    match operation:
        "create_scene":
            create_scene(params)
        "get_scene_tree":
            get_scene_tree(params)
        "get_node_properties":
            get_node_properties(params)
        "update_node_properties":
            update_node_properties(params)
        "node_get":
            node_get(params)
        "node_move":
            node_move(params)
        "node_duplicate":
            node_duplicate(params)
        "node_find":
            node_find(params)
        "script_attach":
            script_attach(params)
        "animation":
            animation(params)
        "animation_state_machine":
            animation_state_machine(params)
        "signal":
            signal_tool(params)
        "group":
            group_tool(params)
        "ui":
            ui_tool(params)
        "material":
            material_tool(params)
        "shader":
            shader_tool(params)
        "lighting":
            lighting_tool(params)
        "particle":
            particle_tool(params)
        "tilemap":
            tilemap_tool(params)
        "geometry":
            geometry_tool(params)
        "physics":
            physics_tool(params)
        "navigation":
            navigation_tool(params)
        "audio":
            audio_tool(params)
        "rename_node":
            rename_node(params)
        "delete_node":
            delete_node(params)
        "add_node":
            add_node(params)
        "load_sprite":
            load_sprite(params)
        "export_mesh_library":
            export_mesh_library(params)
        "save_scene":
            save_scene(params)
        "get_uid":
            get_uid(params)
        "resave_resources":
            resave_resources(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)
    
    quit()

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

func normalize_resource_path(path):
    if path.begins_with("res://"):
        return path
    return "res://" + path

func find_node_by_tool_path(scene_root, node_path):
    if not node_path or node_path == "." or node_path == "root" or node_path == str(scene_root.name):
        return scene_root

    var local_path = node_path
    if local_path.begins_with("root/"):
        local_path = local_path.substr(5)
    elif local_path.begins_with(str(scene_root.name) + "/"):
        local_path = local_path.substr(str(scene_root.name).length() + 1)

    if local_path.is_empty():
        return scene_root

    return scene_root.get_node_or_null(local_path)

func pack_and_save_scene(scene_root, scene_path):
    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    if pack_result != OK:
        printerr("Failed to pack scene: " + str(pack_result))
        quit(1)

    var save_result = ResourceSaver.save(packed_scene, scene_path)
    if save_result != OK:
        printerr("Failed to save scene: " + str(save_result))
        quit(1)

func serialize_variant(value):
    match typeof(value):
        TYPE_NIL:
            return null
        TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
            return value
        TYPE_VECTOR2:
            return {"type": "Vector2", "value": [value.x, value.y]}
        TYPE_VECTOR3:
            return {"type": "Vector3", "value": [value.x, value.y, value.z]}
        TYPE_COLOR:
            return {"type": "Color", "value": [value.r, value.g, value.b, value.a]}
        TYPE_NODE_PATH:
            return {"type": "NodePath", "value": str(value)}
        TYPE_OBJECT:
            if value is Resource:
                return {"type": value.get_class(), "path": value.resource_path}
            return {"type": value.get_class(), "value": str(value)}
        TYPE_ARRAY:
            var items = []
            for item in value:
                items.append(serialize_variant(item))
            return items
        TYPE_DICTIONARY:
            var result = {}
            for key in value.keys():
                result[str(key)] = serialize_variant(value[key])
            return result
        _:
            return str(value)

func variant_from_json(value):
    if typeof(value) == TYPE_DICTIONARY and value.has("type"):
        var value_type = value.type
        var raw_value = value.value if value.has("value") else null
        match value_type:
            "Vector2":
                return Vector2(float(raw_value[0]), float(raw_value[1]))
            "Vector3":
                return Vector3(float(raw_value[0]), float(raw_value[1]), float(raw_value[2]))
            "Color":
                return Color(float(raw_value[0]), float(raw_value[1]), float(raw_value[2]), float(raw_value[3]))
            "NodePath":
                return NodePath(str(raw_value))
            _:
                return raw_value
    return value

func serialize_node_tree(node, path):
    var children = []
    for child in node.get_children():
        children.append(serialize_node_tree(child, path + "/" + str(child.name)))

    return {
        "name": str(node.name),
        "type": node.get_class(),
        "path": path,
        "children": children
    }

func set_owner_recursive(node, owner):
    node.owner = owner
    for child in node.get_children():
        set_owner_recursive(child, owner)

func collect_matching_nodes(node, path, params, results):
    var matches = true
    if params.has("name") and str(params.name) != "" and str(node.name) != str(params.name):
        matches = false
    if params.has("type") and str(params.type) != "" and node.get_class() != str(params.type):
        matches = false
    if params.has("path_contains") and str(params.path_contains) != "" and not path.contains(str(params.path_contains)):
        matches = false

    if matches:
        results.append({
            "name": str(node.name),
            "type": node.get_class(),
            "path": path,
            "childCount": node.get_child_count()
        })

    for child in node.get_children():
        collect_matching_nodes(child, path + "/" + str(child.name), params, results)

func find_direct_child_by_name(parent, child_name):
    for child in parent.get_children():
        if str(child.name) == str(child_name):
            return child
    return null

func find_tool_path_by_reference(current, target, current_path):
    if current == target:
        return current_path
    for child in current.get_children():
        var found_path = find_tool_path_by_reference(child, target, current_path + "/" + str(child.name))
        if found_path != "":
            return found_path
    return ""

func object_has_property(object, property_name):
    for property in object.get_property_list():
        if str(property.name) == str(property_name):
            return true
    return false

func load_scene_instance(scene_path):
    var full_scene_path = normalize_resource_path(scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    return {
        "path": full_scene_path,
        "root": scene.instantiate()
    }

func collect_animation_players(node, path, results):
    if node is AnimationPlayer:
        var animations = []
        for animation_name in node.get_animation_list():
            var animation_resource = node.get_animation(animation_name)
            animations.append({
                "name": str(animation_name),
                "length": animation_resource.length if animation_resource else null,
                "trackCount": animation_resource.get_track_count() if animation_resource else 0
            })
        results.append({
            "name": str(node.name),
            "path": path,
            "animations": animations
        })

    for child in node.get_children():
        collect_animation_players(child, path + "/" + str(child.name), results)

func collect_animation_trees(node, path, results):
    if node is AnimationTree:
        var tree_root = node.tree_root
        var states = []
        var transitions = []
        if tree_root is AnimationNodeStateMachine:
            for state_name in tree_root.get_node_list():
                states.append(str(state_name))
            for transition_index in range(tree_root.get_transition_count()):
                transitions.append({
                    "from": str(tree_root.get_transition_from(transition_index)),
                    "to": str(tree_root.get_transition_to(transition_index))
                })
        results.append({
            "name": str(node.name),
            "path": path,
            "active": node.active,
            "animPlayer": str(node.get("anim_player")),
            "states": states,
            "transitions": transitions
        })

    for child in node.get_children():
        collect_animation_trees(child, path + "/" + str(child.name), results)

func state_machine_has_node(machine, state_name):
    for existing_name in machine.get_node_list():
        if str(existing_name) == str(state_name):
            return true
    return false

func ensure_resource_directory(resource_path):
    var full_path = normalize_resource_path(resource_path)
    var absolute_path = ProjectSettings.globalize_path(full_path)
    var directory_path = absolute_path.get_base_dir()
    var make_result = DirAccess.make_dir_recursive_absolute(directory_path)
    if make_result != OK:
        printerr("Failed to create resource directory: " + directory_path + " (" + str(make_result) + ")")
        quit(1)
    return full_path

func save_resource_checked(resource, resource_path):
    var full_path = ensure_resource_directory(resource_path)
    var save_result = ResourceSaver.save(resource, full_path)
    if save_result != OK:
        printerr("Failed to save resource: " + full_path + " (" + str(save_result) + ")")
        quit(1)
    return full_path

func apply_properties_to_object(target, properties):
    if not properties or not (properties is Dictionary):
        return
    for property_name in properties.keys():
        target.set(str(property_name), variant_from_json(properties[property_name]))

func collect_shader_uniforms(shader_code):
    var uniforms = []
    for raw_line in shader_code.split("\n"):
        var line = raw_line.strip_edges()
        if not line.begins_with("uniform "):
            continue
        if line.ends_with(";"):
            line = line.substr(0, line.length() - 1)
        var declaration = line.substr("uniform ".length()).strip_edges()
        var assignment_parts = declaration.split("=")
        var left_side = str(assignment_parts[0]).strip_edges()
        var hint_parts = left_side.split(":")
        var type_and_name = str(hint_parts[0]).strip_edges().split(" ")
        if type_and_name.size() < 2:
            continue
        uniforms.append({
            "type": str(type_and_name[0]),
            "name": str(type_and_name[type_and_name.size() - 1]),
            "hint": str(hint_parts[1]).strip_edges() if hint_parts.size() > 1 else ""
        })
    return uniforms

func collect_shader_includes(shader_code, extra_include_paths = []):
    var includes = []
    for raw_line in shader_code.split("\n"):
        var line = raw_line.strip_edges()
        if not line.begins_with("#include"):
            continue
        var include_path = line.replace("#include", "").strip_edges()
        if include_path.length() >= 2 and include_path.begins_with("\"") and include_path.ends_with("\""):
            include_path = include_path.substr(1, include_path.length() - 2)
        elif include_path.length() >= 2 and include_path.begins_with("<") and include_path.ends_with(">"):
            include_path = include_path.substr(1, include_path.length() - 2)
        if include_path != "":
            includes.append(include_path)
    if extra_include_paths is Array:
        for include_path in extra_include_paths:
            if not includes.has(str(include_path)):
                includes.append(str(include_path))
    return includes

func collect_shader_texture_uniforms(shader_code, texture_defaults = {}):
    var texture_uniforms = []
    for uniform in collect_shader_uniforms(shader_code):
        var uniform_type = str(uniform.type).to_lower()
        if not uniform_type.begins_with("sampler"):
            continue
        var uniform_name = str(uniform.name)
        texture_uniforms.append({
            "name": uniform_name,
            "type": str(uniform.type),
            "hint": str(uniform.hint),
            "defaultTexture": texture_defaults.get(uniform_name, null) if texture_defaults is Dictionary else null
        })
    return texture_uniforms

func shader_inspection_payload(action, shader_path, shader_code, include_paths = [], texture_defaults = {}):
    return {
        "action": action,
        "shaderPath": shader_path,
        "code": shader_code,
        "uniforms": collect_shader_uniforms(shader_code),
        "includes": collect_shader_includes(shader_code, include_paths),
        "textureUniforms": collect_shader_texture_uniforms(shader_code, texture_defaults)
    }

func serialize_material_resource(material):
    var result = {
        "type": material.get_class(),
        "resourcePath": material.resource_path
    }
    for property_name in ["albedo_color", "emission_enabled", "emission", "roughness", "metallic", "blend_mode", "light_mode"]:
        if object_has_property(material, property_name):
            result[property_name] = serialize_variant(material.get(property_name))
    if material is ShaderMaterial:
        result["shader"] = serialize_variant(material.shader)
        var parameters = {}
        if material.shader:
            for uniform in collect_shader_uniforms(material.shader.code):
                var uniform_name = str(uniform.name)
                parameters[uniform_name] = serialize_variant(material.get_shader_parameter(uniform_name))
        result["parameters"] = parameters
    return result

func material_template_names():
    return ["block_unlit", "emissive_pickup", "transparent_ghost", "ui_canvas"]

func create_material_from_template(template_name):
    var material = null
    match template_name:
        "block_unlit":
            material = StandardMaterial3D.new()
            material.albedo_color = Color(0.36, 0.72, 1.0, 1.0)
            if object_has_property(material, "shading_mode"):
                material.set("shading_mode", BaseMaterial3D.SHADING_MODE_UNSHADED)
            material.roughness = 0.85
        "emissive_pickup":
            material = StandardMaterial3D.new()
            material.albedo_color = Color(1.0, 0.84, 0.22, 1.0)
            material.emission_enabled = true
            material.emission = Color(1.0, 0.72, 0.12, 1.0)
            material.roughness = 0.35
        "transparent_ghost":
            material = StandardMaterial3D.new()
            material.albedo_color = Color(0.7, 0.95, 1.0, 0.38)
            if object_has_property(material, "transparency"):
                material.set("transparency", BaseMaterial3D.TRANSPARENCY_ALPHA)
            material.roughness = 0.2
        "ui_canvas":
            material = CanvasItemMaterial.new()
            if object_has_property(material, "blend_mode"):
                material.set("blend_mode", CanvasItemMaterial.BLEND_MODE_MIX)
            if object_has_property(material, "light_mode"):
                material.set("light_mode", CanvasItemMaterial.LIGHT_MODE_UNSHADED)
        _:
            printerr("Unsupported material template: " + template_name)
            quit(1)
    return material

func collect_lighting_nodes(node, path, results):
    if node is Light3D or node is Light2D or node is WorldEnvironment:
        results.append({
            "name": str(node.name),
            "type": node.get_class(),
            "path": path,
            "visible": serialize_variant(node.get("visible")) if object_has_property(node, "visible") else null,
            "energy": serialize_variant(node.get("light_energy")) if object_has_property(node, "light_energy") else null
        })
    for child in node.get_children():
        collect_lighting_nodes(child, path + "/" + str(child.name), results)

func collect_particle_nodes(node, path, results):
    if node is GPUParticles2D or node is GPUParticles3D or node is CPUParticles2D or node is CPUParticles3D:
        results.append({
            "name": str(node.name),
            "type": node.get_class(),
            "path": path,
            "amount": serialize_variant(node.get("amount")) if object_has_property(node, "amount") else null,
            "lifetime": serialize_variant(node.get("lifetime")) if object_has_property(node, "lifetime") else null,
            "emitting": serialize_variant(node.get("emitting")) if object_has_property(node, "emitting") else null
        })
    for child in node.get_children():
        collect_particle_nodes(child, path + "/" + str(child.name), results)

func vector2i_from_json(value):
    if typeof(value) == TYPE_DICTIONARY and value.has("value"):
        return Vector2i(int(value.value[0]), int(value.value[1]))
    if value is Array:
        return Vector2i(int(value[0]), int(value[1]))
    return Vector2i.ZERO

func vector2_from_json(value):
    if typeof(value) == TYPE_DICTIONARY and value.has("value"):
        return Vector2(float(value.value[0]), float(value.value[1]))
    if value is Array:
        return Vector2(float(value[0]), float(value[1]))
    if typeof(value) == TYPE_DICTIONARY and value.has("x") and value.has("y"):
        return Vector2(float(value.x), float(value.y))
    return Vector2.ZERO

func rect2i_from_json(value):
    if typeof(value) != TYPE_DICTIONARY:
        return Rect2i(Vector2i.ZERO, Vector2i.ZERO)
    if value.has("position") and value.has("size"):
        return Rect2i(vector2i_from_json(value.position), vector2i_from_json(value.size))
    return Rect2i(
        Vector2i(int(value.get("x", 0)), int(value.get("y", 0))),
        Vector2i(int(value.get("width", 0)), int(value.get("height", 0)))
    )

func set_tile_cell(tile_node, coords, source_id, atlas_coords, alternative_tile):
    if tile_node.get_class() == "TileMapLayer":
        tile_node.call("set_cell", coords, source_id, atlas_coords, alternative_tile)
    else:
        tile_node.call("set_cell", 0, coords, source_id, atlas_coords, alternative_tile)

func tilemap_vector2i_param(params, key, default_value):
    if not params.has(key):
        return default_value
    var value = params.get(key)
    if typeof(value) == TYPE_DICTIONARY and value.has("width") and value.has("height"):
        return Vector2i(int(value.width), int(value.height))
    if typeof(value) == TYPE_DICTIONARY and value.has("x") and value.has("y"):
        return Vector2i(int(value.x), int(value.y))
    return vector2i_from_json(value)

func tilemap_load_tileset(params):
    if not params.has("tile_set_path") or str(params.tile_set_path) == "":
        printerr("tile_set_path is required")
        quit(1)
    var tile_set_path = normalize_resource_path(params.tile_set_path)
    var tile_set = load(tile_set_path)
    if not tile_set or not (tile_set is TileSet):
        printerr("Failed to load TileSet: " + str(params.tile_set_path))
        quit(1)
    return tile_set

func tilemap_get_atlas_source(tile_set, params):
    var source_id = int(params.atlas_source_id) if params.has("atlas_source_id") else int(params.get("source_id", 0))
    if not tile_set.has_source(source_id):
        printerr("TileSet atlas source not found: " + str(source_id))
        quit(1)
    var source = tile_set.get_source(source_id)
    if not source or not (source is TileSetAtlasSource):
        printerr("TileSet source is not an atlas source: " + str(source_id))
        quit(1)
    return {"id": source_id, "source": source}

func tilemap_get_tile_data(source, params):
    var atlas_coords = vector2i_from_json(params.atlas_coords) if params.has("atlas_coords") else Vector2i.ZERO
    var alternative_tile = int(params.alternative_tile) if params.has("alternative_tile") else 0
    if not source.has_tile(atlas_coords):
        source.create_tile(atlas_coords)
    var tile_data = source.get_tile_data(atlas_coords, alternative_tile)
    if not tile_data:
        printerr("Failed to read tile data at atlas coords: " + str(atlas_coords))
        quit(1)
    return {"atlasCoords": atlas_coords, "alternativeTile": alternative_tile, "tileData": tile_data}

func tilemap_variant_type_from_name(type_name):
    match str(type_name).to_lower():
        "bool", "boolean":
            return TYPE_BOOL
        "int", "integer":
            return TYPE_INT
        "float", "number":
            return TYPE_FLOAT
        "vector2":
            return TYPE_VECTOR2
        "vector3":
            return TYPE_VECTOR3
        "color":
            return TYPE_COLOR
        "dictionary", "object":
            return TYPE_DICTIONARY
        "array":
            return TYPE_ARRAY
        _:
            return TYPE_STRING

func tilemap_ensure_custom_data_layer(tile_set, layer_name, type_name):
    var layer_count = tile_set.get_custom_data_layers_count()
    for index in range(layer_count):
        if tile_set.get_custom_data_layer_name(index) == layer_name:
            if type_name != "":
                tile_set.set_custom_data_layer_type(index, tilemap_variant_type_from_name(type_name))
            return index
    tile_set.add_custom_data_layer(-1)
    var new_index = tile_set.get_custom_data_layers_count() - 1
    tile_set.set_custom_data_layer_name(new_index, layer_name)
    tile_set.set_custom_data_layer_type(new_index, tilemap_variant_type_from_name(type_name))
    return new_index

func tilemap_ensure_physics_layer(tile_set, physics_layer):
    while tile_set.get_physics_layers_count() <= physics_layer:
        tile_set.add_physics_layer(-1)

func tilemap_ensure_navigation_layer(tile_set, navigation_layer):
    while tile_set.get_navigation_layers_count() <= navigation_layer:
        tile_set.add_navigation_layer(-1)

func tilemap_ensure_terrain(tile_set, terrain_set, terrain, terrain_name):
    while tile_set.get_terrain_sets_count() <= terrain_set:
        tile_set.add_terrain_set(-1)
    while tile_set.get_terrains_count(terrain_set) <= terrain:
        tile_set.add_terrain(terrain_set, -1)
    if terrain_name != "":
        tile_set.set_terrain_name(terrain_set, terrain, terrain_name)

func tilemap_points_to_packed(points):
    var packed = PackedVector2Array()
    for point in points:
        packed.append(vector2_from_json(point))
    return packed

func tilemap_tile_entry_source_id(entry):
    if typeof(entry) == TYPE_DICTIONARY and entry.has("source_id"):
        return int(entry.source_id)
    if typeof(entry) == TYPE_DICTIONARY and entry.has("sourceId"):
        return int(entry.sourceId)
    return -1

func tilemap_tile_entry_atlas_coords(entry):
    if typeof(entry) == TYPE_DICTIONARY and entry.has("atlas_coords"):
        return vector2i_from_json(entry.atlas_coords)
    if typeof(entry) == TYPE_DICTIONARY and entry.has("atlasCoords"):
        return vector2i_from_json(entry.atlasCoords)
    return Vector2i(-1, -1)

func tilemap_tile_entry_alternative(entry):
    if typeof(entry) == TYPE_DICTIONARY and entry.has("alternative_tile"):
        return int(entry.alternative_tile)
    if typeof(entry) == TYPE_DICTIONARY and entry.has("alternativeTile"):
        return int(entry.alternativeTile)
    return 0

func tilemap_apply_tile_entry(tile_node, coords, entry):
    set_tile_cell(
        tile_node,
        coords,
        tilemap_tile_entry_source_id(entry),
        tilemap_tile_entry_atlas_coords(entry),
        tilemap_tile_entry_alternative(entry)
    )

func tilemap_weighted_choice(weighted_tiles, coords, seed):
    var total_weight = 0.0
    for entry in weighted_tiles:
        if typeof(entry) == TYPE_DICTIONARY:
            total_weight += max(0.0, float(entry.get("weight", 1.0)))
    if total_weight <= 0.0:
        return weighted_tiles[0]
    var rng = RandomNumberGenerator.new()
    rng.seed = int(seed) + coords.x * 73856093 + coords.y * 19349663
    var roll = rng.randf() * total_weight
    var cursor = 0.0
    for entry in weighted_tiles:
        var weight = max(0.0, float(entry.get("weight", 1.0))) if typeof(entry) == TYPE_DICTIONARY else 0.0
        cursor += weight
        if roll <= cursor:
            return entry
    return weighted_tiles[weighted_tiles.size() - 1]

func tilemap_palette_tile(params, name, fallback):
    if params.has("tile_palette") and typeof(params.tile_palette) == TYPE_DICTIONARY and params.tile_palette.has(name):
        return params.tile_palette.get(name)
    return fallback

func tilemap_add_atlas_source(params):
    var tile_set = tilemap_load_tileset(params)
    if not params.has("texture_path") or str(params.texture_path) == "":
        printerr("texture_path is required")
        quit(1)
    var texture = load(normalize_resource_path(params.texture_path))
    if not texture:
        printerr("Failed to load atlas texture: " + str(params.texture_path))
        quit(1)
    var source = TileSetAtlasSource.new()
    source.texture = texture
    source.texture_region_size = tilemap_vector2i_param(params, "tile_size", Vector2i(16, 16))
    source.margins = tilemap_vector2i_param(params, "margin", Vector2i.ZERO)
    source.separation = tilemap_vector2i_param(params, "separation", Vector2i.ZERO)
    var source_id = int(params.atlas_source_id) if params.has("atlas_source_id") else -1
    source_id = tile_set.add_source(source, source_id)
    var created_tiles = []
    if params.has("tiles") and params.tiles is Array:
        for tile in params.tiles:
            var atlas_coords = tilemap_tile_entry_atlas_coords(tile)
            if atlas_coords == Vector2i(-1, -1):
                atlas_coords = vector2i_from_json(tile.get("atlas_coords", Vector2i.ZERO)) if typeof(tile) == TYPE_DICTIONARY else Vector2i.ZERO
            if not source.has_tile(atlas_coords):
                source.create_tile(atlas_coords)
            created_tiles.append({"type": "Vector2i", "value": [atlas_coords.x, atlas_coords.y]})
    var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
    print(JSON.stringify({
        "action": "add_atlas_source",
        "tileSetPath": full_tile_set_path,
        "texturePath": normalize_resource_path(params.texture_path),
        "sourceId": source_id,
        "tileSize": {"type": "Vector2i", "value": [source.texture_region_size.x, source.texture_region_size.y]},
        "createdTiles": created_tiles
    }))

func tilemap_set_tile_metadata(params):
    var tile_set = tilemap_load_tileset(params)
    var source_data = tilemap_get_atlas_source(tile_set, params)
    var tile_data_result = tilemap_get_tile_data(source_data.source, params)
    var tile_data = tile_data_result.tileData
    if params.has("custom_data_layers") and params.custom_data_layers is Array:
        for layer in params.custom_data_layers:
            if typeof(layer) == TYPE_DICTIONARY and layer.has("name"):
                tilemap_ensure_custom_data_layer(tile_set, str(layer.name), str(layer.get("type", "string")))
    if params.has("metadata") and typeof(params.metadata) == TYPE_DICTIONARY:
        for key in params.metadata.keys():
            tilemap_ensure_custom_data_layer(tile_set, str(key), "")
            tile_data.set_custom_data(str(key), params.metadata[key])
    var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
    print(JSON.stringify({
        "action": "set_tile_metadata",
        "tileSetPath": full_tile_set_path,
        "sourceId": source_data.id,
        "atlasCoords": {"type": "Vector2i", "value": [tile_data_result.atlasCoords.x, tile_data_result.atlasCoords.y]},
        "metadata": params.get("metadata", {})
    }))

func tilemap_set_tile_collision(params):
    var tile_set = tilemap_load_tileset(params)
    var source_data = tilemap_get_atlas_source(tile_set, params)
    var tile_data_result = tilemap_get_tile_data(source_data.source, params)
    var tile_data = tile_data_result.tileData
    var physics_layer = int(params.physics_layer) if params.has("physics_layer") else 0
    tilemap_ensure_physics_layer(tile_set, physics_layer)
    if params.has("polygons") and params.polygons is Array:
        var polygon_index = 0
        for polygon in params.polygons:
            if tile_data.has_method("add_collision_polygon"):
                tile_data.add_collision_polygon(physics_layer)
                tile_data.set_collision_polygon_points(physics_layer, polygon_index, tilemap_points_to_packed(polygon))
                polygon_index += 1
    var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
    print(JSON.stringify({
        "action": "set_tile_collision",
        "tileSetPath": full_tile_set_path,
        "sourceId": source_data.id,
        "physicsLayer": physics_layer,
        "polygonCount": params.polygons.size() if params.has("polygons") and params.polygons is Array else 0
    }))

func tilemap_set_tile_navigation(params):
    var tile_set = tilemap_load_tileset(params)
    var source_data = tilemap_get_atlas_source(tile_set, params)
    var tile_data_result = tilemap_get_tile_data(source_data.source, params)
    var tile_data = tile_data_result.tileData
    var navigation_layer = int(params.navigation_layer) if params.has("navigation_layer") else 0
    tilemap_ensure_navigation_layer(tile_set, navigation_layer)
    var polygon_count = 0
    if params.has("polygons") and params.polygons is Array and params.polygons.size() > 0:
        var navigation_polygon = NavigationPolygon.new()
        var vertices = tilemap_points_to_packed(params.polygons[0])
        navigation_polygon.vertices = vertices
        var indices = PackedInt32Array()
        for index in range(vertices.size()):
            indices.append(index)
        navigation_polygon.add_polygon(indices)
        tile_data.set_navigation_polygon(navigation_layer, navigation_polygon)
        polygon_count = 1
    var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
    print(JSON.stringify({
        "action": "set_tile_navigation",
        "tileSetPath": full_tile_set_path,
        "sourceId": source_data.id,
        "navigationLayer": navigation_layer,
        "polygonCount": polygon_count
    }))

func tilemap_set_terrain(params):
    var tile_set = tilemap_load_tileset(params)
    var source_data = tilemap_get_atlas_source(tile_set, params)
    var tile_data_result = tilemap_get_tile_data(source_data.source, params)
    var tile_data = tile_data_result.tileData
    var terrain_set = int(params.terrain_set) if params.has("terrain_set") else 0
    var terrain = int(params.terrain) if params.has("terrain") else 0
    tilemap_ensure_terrain(tile_set, terrain_set, terrain, str(params.get("terrain_name", "")))
    tile_data.terrain_set = terrain_set
    tile_data.terrain = terrain
    if params.has("terrain_bits") and typeof(params.terrain_bits) == TYPE_DICTIONARY:
        for bit in params.terrain_bits.keys():
            tile_data.set_terrain_peering_bit(int(bit), int(params.terrain_bits[bit]))
    var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
    print(JSON.stringify({
        "action": "set_terrain",
        "tileSetPath": full_tile_set_path,
        "sourceId": source_data.id,
        "terrainSet": terrain_set,
        "terrain": terrain,
        "terrainName": str(params.get("terrain_name", ""))
    }))

func tilemap_paint_random(params, scene_root, scene_data):
    if not params.has("node_path") or not params.has("rect") or not params.has("weighted_tiles") or not (params.weighted_tiles is Array) or params.weighted_tiles.is_empty():
        printerr("node_path, rect, and weighted_tiles are required")
        quit(1)
    var random_tile_node = find_node_by_tool_path(scene_root, params.node_path)
    if not random_tile_node or not (random_tile_node is TileMap or random_tile_node.get_class() == "TileMapLayer"):
        printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
        quit(1)
    var random_rect = rect2i_from_json(params.rect)
    var random_seed = int(params.seed) if params.has("seed") else 1
    var random_changed_cells = []
    for y in range(random_rect.position.y, random_rect.position.y + random_rect.size.y):
        for x in range(random_rect.position.x, random_rect.position.x + random_rect.size.x):
            var coords = Vector2i(x, y)
            var choice = tilemap_weighted_choice(params.weighted_tiles, coords, random_seed)
            tilemap_apply_tile_entry(random_tile_node, coords, choice)
            random_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": "paint_random",
        "scenePath": params.scene_path,
        "nodePath": params.node_path,
        "rect": {
            "x": random_rect.position.x,
            "y": random_rect.position.y,
            "width": random_rect.size.x,
            "height": random_rect.size.y
        },
        "seed": random_seed,
        "changedCells": random_changed_cells
    }))

func tilemap_apply_template(params, scene_root, scene_data):
    if not params.has("node_path") or not params.has("rect"):
        printerr("node_path and rect are required")
        quit(1)
    var template_tile_node = find_node_by_tool_path(scene_root, params.node_path)
    if not template_tile_node or not (template_tile_node is TileMap or template_tile_node.get_class() == "TileMapLayer"):
        printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
        quit(1)
    var template_name = str(params.template_name) if params.has("template_name") and str(params.template_name) != "" else "survivor_arena"
    var template_rect = rect2i_from_json(params.rect)
    var template_changed_cells = []
    var floor_tile = tilemap_palette_tile(params, "floor", {"source_id": int(params.get("source_id", -1)), "atlas_coords": params.get("atlas_coords", [-1, -1]), "alternative_tile": int(params.get("alternative_tile", 0))})
    var wall_tile = tilemap_palette_tile(params, "wall", floor_tile)
    var obstacle_tile = tilemap_palette_tile(params, "obstacle", wall_tile)

    if template_name == "survivor_arena":
        for y in range(template_rect.position.y, template_rect.position.y + template_rect.size.y):
            for x in range(template_rect.position.x, template_rect.position.x + template_rect.size.x):
                var coords = Vector2i(x, y)
                var is_border = x == template_rect.position.x or y == template_rect.position.y or x == template_rect.position.x + template_rect.size.x - 1 or y == template_rect.position.y + template_rect.size.y - 1
                var is_obstacle = not is_border and ((x + y) % 7 == 0)
                tilemap_apply_tile_entry(template_tile_node, coords, wall_tile if is_border else obstacle_tile if is_obstacle else floor_tile)
                template_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
    elif template_name == "room_grid":
        for y in range(template_rect.position.y, template_rect.position.y + template_rect.size.y):
            for x in range(template_rect.position.x, template_rect.position.x + template_rect.size.x):
                var coords = Vector2i(x, y)
                var is_wall = x == template_rect.position.x or y == template_rect.position.y or x == template_rect.position.x + template_rect.size.x - 1 or y == template_rect.position.y + template_rect.size.y - 1 or x % 6 == 0 or y % 6 == 0
                tilemap_apply_tile_entry(template_tile_node, coords, wall_tile if is_wall else floor_tile)
                template_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
    else:
        printerr("Unsupported tilemap template: " + template_name)
        quit(1)

    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": "apply_template",
        "scenePath": params.scene_path,
        "nodePath": params.node_path,
        "templateName": template_name,
        "rect": {
            "x": template_rect.position.x,
            "y": template_rect.position.y,
            "width": template_rect.size.x,
            "height": template_rect.size.y
        },
        "changedCells": template_changed_cells
    }))

func apply_material_preset(material, preset_name):
    match preset_name:
        "unlit":
            if object_has_property(material, "shading_mode"):
                material.set("shading_mode", BaseMaterial3D.SHADING_MODE_UNSHADED)
        "lit":
            if object_has_property(material, "shading_mode"):
                material.set("shading_mode", BaseMaterial3D.SHADING_MODE_PER_PIXEL)
        "emissive":
            if object_has_property(material, "emission_enabled"):
                material.set("emission_enabled", true)
            if object_has_property(material, "emission"):
                material.set("emission", Color(1.0, 0.85, 0.25, 1.0))
        "transparent":
            if object_has_property(material, "transparency"):
                material.set("transparency", BaseMaterial3D.TRANSPARENCY_ALPHA)
            if object_has_property(material, "albedo_color"):
                var color = material.get("albedo_color")
                if color is Color:
                    color.a = 0.5
                    material.set("albedo_color", color)

func collect_tilemap_nodes(node, path, results):
    var is_tilemap_layer = ClassDB.class_exists("TileMapLayer") and node.get_class() == "TileMapLayer"
    if node is TileMap or is_tilemap_layer:
        results.append({
            "name": str(node.name),
            "type": node.get_class(),
            "path": path,
            "hasTileSet": node.get("tile_set") != null if object_has_property(node, "tile_set") else false
        })
    for child in node.get_children():
        collect_tilemap_nodes(child, path + "/" + str(child.name), results)

func collect_nodes_by_types(node, path, types, results):
    if types.has(node.get_class()):
        results.append({
            "name": str(node.name),
            "type": node.get_class(),
            "path": path,
            "childCount": node.get_child_count()
        })
    for child in node.get_children():
        collect_nodes_by_types(child, path + "/" + str(child.name), types, results)

func shape_resource_for_type(shape_type):
    var shape = instantiate_class(shape_type)
    if not shape or not (shape is Shape2D or shape is Shape3D):
        printerr("Failed to create shape type: " + shape_type)
        quit(1)
    return shape

# Get a script by registered class name.
# Only looks up names via the project's global class registry. Raw paths
# (e.g. "res://evil.gd") are intentionally not accepted here to prevent
# arbitrary script instantiation from agent-supplied input.
func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)

    # Search for it in the global class registry if it's a class name
    var global_classes = ProjectSettings.get_global_class_list()
    if debug_mode:
        print("Searching through " + str(global_classes.size()) + " global classes")
    
    for global_class in global_classes:
        var found_name_of_class = global_class["class"]
        var found_path = global_class["path"]
        
        if found_name_of_class == name_of_class:
            if debug_mode:
                print("Found matching class in registry: " + found_name_of_class + " at path: " + found_path)
            var script = load(found_path) as Script
            if script:
                if debug_mode:
                    print("Successfully loaded script from registry")
                return script
            else:
                printerr("Failed to load script from registry path: " + found_path)
                break
    
    printerr("Could not find script for class: " + name_of_class)
    return null

# Instantiate a class by name
func instantiate_class(name_of_class):
    if name_of_class.is_empty():
        printerr("Cannot instantiate class: name is empty")
        return null
    
    var result = null
    if debug_mode:
        print("Attempting to instantiate class: " + name_of_class)
    
    # Check if it's a built-in class
    if ClassDB.class_exists(name_of_class):
        if debug_mode:
            print("Class exists in ClassDB, using ClassDB.instantiate()")
        if ClassDB.can_instantiate(name_of_class):
            result = ClassDB.instantiate(name_of_class)
            if result == null:
                printerr("ClassDB.instantiate() returned null for class: " + name_of_class)
        else:
            printerr("Class exists but cannot be instantiated: " + name_of_class)
            printerr("This may be an abstract class or interface that cannot be directly instantiated")
    else:
        # Try to get the script
        if debug_mode:
            print("Class not found in ClassDB, trying to get script")
        var script = get_script_by_name(name_of_class)
        if script is GDScript:
            if debug_mode:
                print("Found GDScript, creating instance")
            result = script.new()
        else:
            printerr("Failed to get script for class: " + name_of_class)
            return null
    
    if result == null:
        printerr("Failed to instantiate class: " + name_of_class)
    elif debug_mode:
        print("Successfully instantiated class: " + name_of_class + " of type: " + result.get_class())
    
    return result

# Create a new scene with a specified root node type
func create_scene(params):
    print("Creating scene: " + params.scene_path)
    
    # Get project paths and log them for debugging
    var project_res_path = "res://"
    var project_user_path = "user://"
    var global_res_path = ProjectSettings.globalize_path(project_res_path)
    var global_user_path = ProjectSettings.globalize_path(project_user_path)
    
    if debug_mode:
        print("Project paths:")
        print("- res:// path: " + project_res_path)
        print("- user:// path: " + project_user_path)
        print("- Globalized res:// path: " + global_res_path)
        print("- Globalized user:// path: " + global_user_path)
        
        # Print some common environment variables for debugging
        print("Environment variables:")
        var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
        for env_var in env_vars:
            if OS.has_environment(env_var):
                print("  " + env_var + " = " + OS.get_environment(env_var))
    
    # Normalize the scene path
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    # Convert resource path to an absolute path
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    # Get the scene directory paths
    var scene_dir_res = full_scene_path.get_base_dir()
    var scene_dir_abs = absolute_scene_path.get_base_dir()
    if debug_mode:
        print("Scene directory (resource path): " + scene_dir_res)
        print("Scene directory (absolute path): " + scene_dir_abs)
    
    # Only do extensive testing in debug mode
    if debug_mode:
        # Try to create a simple test file in the project root to verify write access
        var initial_test_file_path = "res://godot_mcp_test_write.tmp"
        var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
        if initial_test_file:
            initial_test_file.store_string("Test write access")
            initial_test_file.close()
            print("Successfully wrote test file to project root: " + initial_test_file_path)
            
            # Verify the test file exists
            var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
            print("Test file exists check: " + str(initial_test_file_exists))
            
            # Clean up the test file
            if initial_test_file_exists:
                var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
                print("Test file removal result: " + str(remove_error))
        else:
            var write_error = FileAccess.get_open_error()
            printerr("Failed to write test file to project root: " + str(write_error))
            printerr("This indicates a serious permission issue with the project directory")
    
    # Use traditional if-else statement for better compatibility
    var root_node_type = "Node2D"  # Default value
    if params.has("root_node_type"):
        root_node_type = params.root_node_type
    if debug_mode:
        print("Root node type: " + root_node_type)
    
    # Create the root node
    var scene_root = instantiate_class(root_node_type)
    if not scene_root:
        printerr("Failed to instantiate node of type: " + root_node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    
    scene_root.name = "root"
    if debug_mode:
        print("Root node created with name: " + scene_root.name)
    
    # Set the owner of the root node to itself (important for scene saving)
    scene_root.owner = scene_root
    
    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        # Only do extensive testing in debug mode
        if debug_mode:
            # First, let's verify we can write to the project directory
            print("Testing write access to project directory...")
            var test_write_path = "res://test_write_access.tmp"
            var test_write_abs = ProjectSettings.globalize_path(test_write_path)
            var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
            
            if test_file:
                test_file.store_string("Write test")
                test_file.close()
                print("Successfully wrote test file to project directory")
                
                # Clean up test file
                if FileAccess.file_exists(test_write_path):
                    var remove_error = DirAccess.remove_absolute(test_write_abs)
                    print("Test file removal result: " + str(remove_error))
            else:
                var write_error = FileAccess.get_open_error()
                printerr("Failed to write test file to project directory: " + str(write_error))
                printerr("This may indicate permission issues with the project directory")
                # Continue anyway, as the scene directory might still be writable
        
        # Ensure the scene directory exists using DirAccess
        if debug_mode:
            print("Ensuring scene directory exists...")
        
        # Get the scene directory relative to res://
        var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
        if debug_mode:
            print("Scene directory (relative to res://): " + scene_dir_relative)
        
        # Create the directory if needed
        if not scene_dir_relative.is_empty():
            # First check if it exists
            var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
            if debug_mode:
                print("Directory exists check (absolute): " + str(dir_exists))
            
            if not dir_exists:
                if debug_mode:
                    print("Directory doesn't exist, creating: " + scene_dir_relative)
                
                # Try to create the directory using DirAccess
                var dir = DirAccess.open("res://")
                if dir == null:
                    var open_error = DirAccess.get_open_error()
                    printerr("Failed to open res:// directory: " + str(open_error))
                    
                    # Try alternative approach with absolute path
                    if debug_mode:
                        print("Trying alternative directory creation approach...")
                    var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
                    if debug_mode:
                        print("Make directory result (absolute): " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory using absolute path")
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                else:
                    # Create the directory using the DirAccess instance
                    if debug_mode:
                        print("Creating directory using DirAccess: " + scene_dir_relative)
                    var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
                    if debug_mode:
                        print("Make directory result: " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory: " + scene_dir_relative)
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                
                # Verify the directory was created
                dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
                if debug_mode:
                    print("Directory exists check after creation: " + str(dir_exists))
                
                if not dir_exists:
                    printerr("Directory reported as created but does not exist: " + scene_dir_abs)
                    printerr("This may indicate a problem with path resolution or permissions")
                    quit(1)
            elif debug_mode:
                print("Directory already exists: " + scene_dir_abs)
        
        # Save the scene
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
            # Only do extensive testing in debug mode
            if debug_mode:
                # Wait a moment to ensure file system has time to complete the write
                print("Waiting for file system to complete write operation...")
                OS.delay_msec(500)  # 500ms delay
                
                # Verify the file was actually created using multiple methods
                var file_check_abs = FileAccess.file_exists(absolute_scene_path)
                print("File exists check (absolute path): " + str(file_check_abs))
                
                var file_check_res = FileAccess.file_exists(full_scene_path)
                print("File exists check (resource path): " + str(file_check_res))
                
                var res_exists = ResourceLoader.exists(full_scene_path)
                print("Resource exists check: " + str(res_exists))
                
                # If file doesn't exist by absolute path, try to create a test file in the same directory
                if not file_check_abs and not file_check_res:
                    printerr("Scene file not found after save. Trying to diagnose the issue...")
                    
                    # Try to write a test file to the same directory
                    var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
                    var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
                    
                    if test_scene_file:
                        test_scene_file.store_string("Test scene directory write")
                        test_scene_file.close()
                        print("Successfully wrote test file to scene directory: " + test_scene_file_path)
                        
                        # Check if the test file exists
                        var test_file_exists = FileAccess.file_exists(test_scene_file_path)
                        print("Test file exists: " + str(test_file_exists))
                        
                        if test_file_exists:
                            # Directory is writable, so the issue is with scene saving
                            printerr("Directory is writable but scene file wasn't created.")
                            printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
                            
                            # Try saving with a different approach
                            print("Trying alternative save approach...")
                            var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
                            print("Alternative save result: " + str(alt_save_error))
                            
                            # Clean up test files
                            DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
                            if alt_save_error == OK:
                                DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
                        else:
                            printerr("Test file couldn't be verified. This suggests filesystem access issues.")
                    else:
                        var write_error = FileAccess.get_open_error()
                        printerr("Failed to write test file to scene directory: " + str(write_error))
                        printerr("This confirms there are permission or path issues with the scene directory.")
                    
                    # Return error since we couldn't create the scene file
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
                
                # If we get here, at least one of our file checks passed
                if file_check_abs or file_check_res or res_exists:
                    print("Scene file verified to exist!")
                    
                    # Try to load the scene to verify it's valid
                    var test_load = ResourceLoader.load(full_scene_path)
                    if test_load:
                        print("Scene created and verified successfully at: " + params.scene_path)
                        print("Scene file can be loaded correctly.")
                    else:
                        print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
                        # Continue anyway since the file exists
                    
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("All file existence checks failed despite successful save operation.")
                    printerr("This indicates a serious issue with file system access or path resolution.")
                    quit(1)
            else:
                # In non-debug mode, just check if the file exists
                var file_exists = FileAccess.file_exists(full_scene_path)
                if file_exists:
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
        else:
            # Handle specific error codes
            var error_message = "Failed to save scene. Error code: " + str(save_error)
            
            if save_error == ERR_CANT_CREATE:
                error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
            elif save_error == ERR_CANT_OPEN:
                error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
            elif save_error == ERR_FILE_CANT_WRITE:
                error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
            elif save_error == ERR_FILE_NO_PERMISSION:
                error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
            
            printerr(error_message)
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        printerr("Error code: " + str(result))
        quit(1)

# Add a node to an existing scene
func get_scene_tree(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var result = serialize_node_tree(scene_root, "root")
    print(JSON.stringify(result))

func get_node_properties(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    var property_names = ["name", "type", "path", "position", "global_position", "visible", "script"]
    if params.has("property_names") and params.property_names is Array and params.property_names.size() > 0:
        property_names = params.property_names

    var properties = {}
    for property_name in property_names:
        match property_name:
            "name":
                properties[property_name] = str(node.name)
            "type":
                properties[property_name] = node.get_class()
            "path":
                properties[property_name] = str(node.get_path())
            _:
                properties[property_name] = serialize_variant(node.get(property_name))

    print(JSON.stringify({
        "nodePath": params.node_path,
        "name": str(node.name),
        "type": node.get_class(),
        "properties": properties
    }))

func update_node_properties(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    if not params.has("properties") or not (params.properties is Dictionary):
        printerr("Properties dictionary is required")
        quit(1)

    for property_name in params.properties.keys():
        if property_name == "name":
            printerr("Use rename_node to rename nodes")
            quit(1)
        node.set(property_name, variant_from_json(params.properties[property_name]))

    pack_and_save_scene(scene_root, full_scene_path)
    print("Updated properties for node: " + params.node_path)

func node_get(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    print(JSON.stringify({
        "nodePath": params.node_path,
        "name": str(node.name),
        "type": node.get_class(),
        "path": str(node.get_path()),
        "childCount": node.get_child_count(),
        "parent": str(node.get_parent().name) if node.get_parent() else null,
        "position": serialize_variant(node.get("position")),
        "script": serialize_variant(node.get_script())
    }))

func node_move(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    if not params.has("position"):
        printerr("Position is required")
        quit(1)

    node.set("position", variant_from_json(params.position))
    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "nodePath": params.node_path,
        "position": serialize_variant(node.get("position"))
    }))

func node_duplicate(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    var parent = node.get_parent()
    if params.has("parent_node_path") and str(params.parent_node_path) != "":
        parent = find_node_by_tool_path(scene_root, params.parent_node_path)
    if not parent:
        printerr("Failed to find duplicate parent")
        quit(1)

    var duplicate = node.duplicate()
    if params.has("new_name") and str(params.new_name) != "":
        duplicate.name = params.new_name
    else:
        duplicate.name = str(node.name) + "Copy"

    parent.add_child(duplicate)
    set_owner_recursive(duplicate, scene_root)
    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "sourceNodePath": params.node_path,
        "duplicateName": str(duplicate.name),
        "parentPath": str(parent.get_path())
    }))

func node_find(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var results = []
    collect_matching_nodes(scene_root, "root", params, results)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "matches": results
    }))

func script_attach(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var full_script_path = normalize_resource_path(params.script_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var script = load(full_script_path)
    if not script or not (script is Script):
        printerr("Failed to load script: " + full_script_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    node.set_script(script)
    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "nodePath": params.node_path,
        "scriptPath": full_script_path
    }))

func animation_track_type_from_name(track_type):
    match str(track_type).to_lower():
        "method":
            return Animation.TYPE_METHOD
        "bezier":
            return Animation.TYPE_BEZIER
        _:
            return Animation.TYPE_VALUE

func animation_update_mode_from_name(update_mode):
    match str(update_mode).to_lower():
        "discrete":
            return Animation.UPDATE_DISCRETE
        "capture":
            return Animation.UPDATE_CAPTURE
        _:
            return Animation.UPDATE_CONTINUOUS

func animation_find_player(scene_root, params):
    if params.has("animation_player_path") and str(params.animation_player_path) != "":
        var player_by_path = find_node_by_tool_path(scene_root, str(params.animation_player_path))
        if player_by_path and player_by_path is AnimationPlayer:
            return player_by_path
        printerr("Failed to find AnimationPlayer: " + str(params.animation_player_path))
        quit(1)
    var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find animation parent node: " + parent_path)
        quit(1)
    var player_name = str(params.player_name) if params.has("player_name") and str(params.player_name) != "" else "AnimationPlayer"
    var player = find_direct_child_by_name(parent, player_name)
    if player and player is AnimationPlayer:
        return player
    if player:
        printerr("Existing child is not an AnimationPlayer: " + player_name)
        quit(1)
    printerr("Failed to find AnimationPlayer child: " + player_name)
    quit(1)

func animation_get_library(player):
    if player.has_animation_library(""):
        return player.get_animation_library("")
    var library = AnimationLibrary.new()
    player.add_animation_library("", library)
    return library

func animation_get_resource(player, animation_name, create_if_missing = false):
    var library = animation_get_library(player)
    if library.has_animation(animation_name):
        return {"library": library, "animation": library.get_animation(animation_name)}
    if create_if_missing:
        var animation_resource = Animation.new()
        library.add_animation(animation_name, animation_resource)
        return {"library": library, "animation": animation_resource}
    printerr("Animation not found: " + animation_name)
    quit(1)

func serialize_animation_track(animation_resource, track_index):
    var keyframes = []
    for key_index in range(animation_resource.track_get_key_count(track_index)):
        keyframes.append({
            "index": key_index,
            "time": animation_resource.track_get_key_time(track_index, key_index),
            "value": serialize_variant(animation_resource.track_get_key_value(track_index, key_index))
        })
    return {
        "index": track_index,
        "type": animation_resource.track_get_type(track_index),
        "path": str(animation_resource.track_get_path(track_index)),
        "keyframes": keyframes
    }

func animation_get_info(player, animation_name):
    var animation_data = animation_get_resource(player, animation_name, false)
    var animation_resource = animation_data.animation
    var tracks = []
    for track_index in range(animation_resource.get_track_count()):
        tracks.append(serialize_animation_track(animation_resource, track_index))
    return {
        "animationName": animation_name,
        "length": animation_resource.length,
        "trackCount": animation_resource.get_track_count(),
        "tracks": tracks
    }

func animation_find_track(animation_resource, params):
    if params.has("track_index"):
        return int(params.track_index)
    if params.has("track_path"):
        var target_path = NodePath(str(params.track_path))
        for track_index in range(animation_resource.get_track_count()):
            if animation_resource.track_get_path(track_index) == target_path:
                return track_index
    return -1

func animation_add_track(scene_root, params):
    var player = animation_find_player(scene_root, params)
    var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
    var animation_data = animation_get_resource(player, animation_name, true)
    var animation_resource = animation_data.animation
    if params.has("length"):
        animation_resource.length = float(params.length)
    if not params.has("track_path"):
        printerr("track_path is required")
        quit(1)
    var track_index = animation_resource.add_track(animation_track_type_from_name(params.get("track_type", "value")))
    animation_resource.track_set_path(track_index, NodePath(str(params.track_path)))
    if animation_resource.track_get_type(track_index) == Animation.TYPE_VALUE:
        animation_resource.value_track_set_update_mode(track_index, animation_update_mode_from_name(params.get("update_mode", "continuous")))
    return {
        "playerPath": find_tool_path_by_reference(scene_root, player, "root"),
        "animation": animation_get_info(player, animation_name),
        "track": serialize_animation_track(animation_resource, track_index)
    }

func animation_set_keyframe(scene_root, params):
    var player = animation_find_player(scene_root, params)
    var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
    var animation_data = animation_get_resource(player, animation_name, true)
    var animation_resource = animation_data.animation
    var track_index = animation_find_track(animation_resource, params)
    if track_index < 0:
        if not params.has("track_path"):
            printerr("track_index or track_path is required")
            quit(1)
        track_index = animation_resource.add_track(animation_track_type_from_name(params.get("track_type", "value")))
        animation_resource.track_set_path(track_index, NodePath(str(params.track_path)))
    if not params.has("time") or not params.has("value"):
        printerr("time and value are required")
        quit(1)
    animation_resource.track_insert_key(track_index, float(params.time), variant_from_json(params.value))
    return {
        "playerPath": find_tool_path_by_reference(scene_root, player, "root"),
        "animation": animation_get_info(player, animation_name),
        "track": serialize_animation_track(animation_resource, track_index)
    }

func animation_remove(scene_root, params):
    var player = animation_find_player(scene_root, params)
    var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
    var library = animation_get_library(player)
    if not library.has_animation(animation_name):
        printerr("Animation not found: " + animation_name)
        quit(1)
    library.remove_animation(animation_name)
    return {
        "playerPath": find_tool_path_by_reference(scene_root, player, "root"),
        "removedAnimation": animation_name
    }

func animation(params):
    var scene_data = load_scene_instance(params.scene_path)
    var full_scene_path = scene_data.path
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var players = []
        collect_animation_players(scene_root, "root", players)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "players": players
        }))
        return

    if action == "get_info":
        var info_player = animation_find_player(scene_root, params)
        var info_animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "playerPath": find_tool_path_by_reference(scene_root, info_player, "root"),
            "animation": animation_get_info(info_player, info_animation_name)
        }))
        return

    if action == "add_track":
        var add_track_result = animation_add_track(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(add_track_result))
        return

    if action == "set_keyframe":
        var keyframe_result = animation_set_keyframe(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(keyframe_result))
        return

    if action == "remove":
        var remove_result = animation_remove(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(remove_result))
        return

    if action != "create":
        printerr("Unsupported animation action: " + action)
        quit(1)

    var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find animation parent node: " + parent_path)
        quit(1)

    var player_name = str(params.player_name) if params.has("player_name") and str(params.player_name) != "" else "AnimationPlayer"
    var player = find_direct_child_by_name(parent, player_name)
    if player and not (player is AnimationPlayer):
        printerr("Existing child is not an AnimationPlayer: " + player_name)
        quit(1)
    if not player:
        player = AnimationPlayer.new()
        player.name = player_name
        parent.add_child(player)
        set_owner_recursive(player, scene_root)

    var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
    var animation_length = float(params.length) if params.has("length") else 1.0
    var animation_resource = Animation.new()
    animation_resource.length = animation_length

    if params.has("tracks") and params.tracks is Array:
        for track in params.tracks:
            if not (track is Dictionary) or not track.has("path"):
                printerr("Animation track entries require path")
                quit(1)
            var track_index = animation_resource.add_track(Animation.TYPE_VALUE)
            animation_resource.track_set_path(track_index, NodePath(str(track.path)))
            if track.has("keyframes") and track.keyframes is Array:
                for keyframe in track.keyframes:
                    if not (keyframe is Dictionary) or not keyframe.has("time") or not keyframe.has("value"):
                        printerr("Animation keyframes require time and value")
                        quit(1)
                    animation_resource.track_insert_key(track_index, float(keyframe.time), variant_from_json(keyframe.value))

    var library = null
    if player.has_animation_library(""):
        library = player.get_animation_library("")
    else:
        library = AnimationLibrary.new()
        player.add_animation_library("", library)
    if library.has_animation(animation_name):
        library.remove_animation(animation_name)
    library.add_animation(animation_name, animation_resource)

    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "playerPath": find_tool_path_by_reference(scene_root, player, "root"),
        "playerName": str(player.name),
        "animationName": animation_name,
        "length": animation_resource.length,
        "trackCount": animation_resource.get_track_count()
    }))

func animation_tree_find_node(scene_root, params):
    if params.has("tree_path") and str(params.tree_path) != "":
        var tree_by_path = find_node_by_tool_path(scene_root, str(params.tree_path))
        if tree_by_path and tree_by_path is AnimationTree:
            return tree_by_path
        printerr("Failed to find AnimationTree: " + str(params.tree_path))
        quit(1)
    var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find AnimationTree parent node: " + parent_path)
        quit(1)
    var tree_name = str(params.tree_name) if params.has("tree_name") and str(params.tree_name) != "" else "AnimationTree"
    var tree = find_direct_child_by_name(parent, tree_name)
    if tree and tree is AnimationTree:
        return tree
    printerr("Failed to find AnimationTree child: " + tree_name)
    quit(1)

func animation_tree_transition_index(machine, params):
    if params.has("transition_index"):
        return int(params.transition_index)
    var from_state = str(params.from_state) if params.has("from_state") else ""
    var to_state = str(params.to_state) if params.has("to_state") else ""
    for transition_index in range(machine.get_transition_count()):
        if str(machine.get_transition_from(transition_index)) == from_state and str(machine.get_transition_to(transition_index)) == to_state:
            return transition_index
    return -1

func animation_tree_set_transition_parameters(scene_root, params):
    var tree = animation_tree_find_node(scene_root, params)
    if not (tree.tree_root is AnimationNodeStateMachine):
        printerr("AnimationTree tree_root is not an AnimationNodeStateMachine")
        quit(1)
    if not params.has("transition_parameters") or not (params.transition_parameters is Dictionary):
        printerr("transition_parameters is required")
        quit(1)
    var machine = tree.tree_root
    var transition_index = animation_tree_transition_index(machine, params)
    if transition_index < 0 or transition_index >= machine.get_transition_count():
        printerr("Failed to find AnimationTree transition")
        quit(1)
    var transition = machine.get_transition(transition_index)
    apply_properties_to_object(transition, params.transition_parameters)
    return {
        "treePath": find_tool_path_by_reference(scene_root, tree, "root"),
        "transitionIndex": transition_index,
        "from": str(machine.get_transition_from(transition_index)),
        "to": str(machine.get_transition_to(transition_index)),
        "parameters": params.transition_parameters
    }

func animation_state_machine(params):
    var scene_data = load_scene_instance(params.scene_path)
    var full_scene_path = scene_data.path
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var trees = []
        collect_animation_trees(scene_root, "root", trees)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "trees": trees
        }))
        return

    if action == "set_transition_parameters":
        var transition_result = animation_tree_set_transition_parameters(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(transition_result))
        return

    if action != "create":
        printerr("Unsupported animation_state_machine action: " + action)
        quit(1)

    var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find AnimationTree parent node: " + parent_path)
        quit(1)

    var tree_name = str(params.tree_name) if params.has("tree_name") and str(params.tree_name) != "" else "AnimationTree"
    var tree = find_direct_child_by_name(parent, tree_name)
    if tree and not (tree is AnimationTree):
        printerr("Existing child is not an AnimationTree: " + tree_name)
        quit(1)
    if not tree:
        tree = AnimationTree.new()
        tree.name = tree_name
        parent.add_child(tree)
        set_owner_recursive(tree, scene_root)

    var state_machine = AnimationNodeStateMachine.new()
    if params.has("states") and params.states is Array:
        for state in params.states:
            if not (state is Dictionary) or not state.has("name"):
                printerr("State entries require name")
                quit(1)
            var state_name = str(state.name)
            if state_machine_has_node(state_machine, state_name):
                continue
            var state_node = AnimationNodeAnimation.new()
            if state.has("animation_name"):
                state_node.animation = str(state.animation_name)
            var position = Vector2.ZERO
            if state.has("position"):
                position = variant_from_json(state.position)
            state_machine.add_node(state_name, state_node, position)

    if params.has("transitions") and params.transitions is Array:
        for transition in params.transitions:
            if not (transition is Dictionary) or not transition.has("from") or not transition.has("to"):
                printerr("Transition entries require from and to")
                quit(1)
            var transition_resource = AnimationNodeStateMachineTransition.new()
            if transition.has("parameters") and transition.parameters is Dictionary:
                apply_properties_to_object(transition_resource, transition.parameters)
            state_machine.add_transition(str(transition.from), str(transition.to), transition_resource)

    tree.tree_root = state_machine
    if params.has("animation_player_path") and str(params.animation_player_path) != "":
        tree.set("anim_player", NodePath(str(params.animation_player_path)))
    tree.active = true

    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "treePath": find_tool_path_by_reference(scene_root, tree, "root"),
        "treeName": str(tree.name),
        "states": state_machine.get_node_list(),
        "transitionCount": state_machine.get_transition_count()
    }))

func signal_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var full_scene_path = scene_data.path
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find signal node: " + params.node_path)
        quit(1)

    if action == "list":
        var signals = []
        for signal_info in node.get_signal_list():
            var signal_name = str(signal_info.name)
            if params.has("signal_name") and str(params.signal_name) != "" and signal_name != str(params.signal_name):
                continue
            var args = []
            if signal_info.has("args"):
                for argument in signal_info.args:
                    args.append({
                        "name": str(argument.name) if argument.has("name") else "",
                        "type": int(argument.type) if argument.has("type") else 0
                    })
            var connections = []
            for connection in node.get_signal_connection_list(signal_name):
                var callable = connection.callable
                connections.append({
                    "target": find_tool_path_by_reference(scene_root, callable.get_object(), "root") if callable.get_object() and callable.get_object() is Node else "",
                    "method": str(callable.get_method())
                })
            signals.append({
                "name": signal_name,
                "args": args,
                "connections": connections
            })
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "signals": signals
        }))
        return

    if not params.has("signal_name") or not params.has("target_node_path") or not params.has("method_name"):
        printerr("signal_name, target_node_path, and method_name are required")
        quit(1)

    var target = find_node_by_tool_path(scene_root, params.target_node_path)
    if not target:
        printerr("Failed to find signal target node: " + params.target_node_path)
        quit(1)
    if not target.has_method(str(params.method_name)):
        printerr("Target method does not exist: " + str(params.method_name))
        quit(1)

    var callable = Callable(target, str(params.method_name))
    if action == "connect":
        if not node.is_connected(str(params.signal_name), callable):
            var connect_result = node.connect(str(params.signal_name), callable, CONNECT_PERSIST)
            if connect_result != OK:
                printerr("Failed to connect signal: " + str(connect_result))
                quit(1)
    elif action == "disconnect":
        if node.is_connected(str(params.signal_name), callable):
            node.disconnect(str(params.signal_name), callable)
    else:
        printerr("Unsupported signal action: " + action)
        quit(1)

    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "nodePath": params.node_path,
        "signalName": str(params.signal_name),
        "targetNodePath": str(params.target_node_path),
        "methodName": str(params.method_name),
        "action": action
    }))

func group_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var full_scene_path = scene_data.path
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find group node: " + params.node_path)
        quit(1)

    if action == "list":
        var groups = []
        for group_name in node.get_groups():
            groups.append(str(group_name))
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "groups": groups
        }))
        return

    if not params.has("group_name") or str(params.group_name) == "":
        printerr("group_name is required")
        quit(1)

    if action == "add":
        node.add_to_group(str(params.group_name), true)
    elif action == "remove":
        node.remove_from_group(str(params.group_name))
    else:
        printerr("Unsupported group action: " + action)
        quit(1)

    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "nodePath": params.node_path,
        "groupName": str(params.group_name),
        "action": action
    }))

func ui_apply_layout_preset(node, layout_preset):
    match str(layout_preset):
        "full_rect":
            node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
        "center":
            node.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
        "top_left":
            node.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
        _:
            printerr("Unsupported layout preset: " + str(layout_preset))
            quit(1)

func ui_apply_control_properties(node, params):
    if params.has("text") and object_has_property(node, "text"):
        node.set("text", str(params.text))
    if params.has("layout_preset"):
        ui_apply_layout_preset(node, params.layout_preset)
    if params.has("properties") and params.properties is Dictionary:
        for property_name in params.properties.keys():
            if property_name == "name":
                printerr("Use nodeName to name UI nodes")
                quit(1)
            node.set(property_name, variant_from_json(params.properties[property_name]))

func ui_theme_type_and_name(key):
    var parts = str(key).split("/")
    if parts.size() < 2:
        return {"type": "Control", "name": str(key)}
    return {"type": str(parts[0]), "name": str(parts[1])}

func ui_make_stylebox_flat(data):
    var box = StyleBoxFlat.new()
    if data is Dictionary:
        if data.has("bg_color"):
            box.bg_color = variant_from_json(data.bg_color)
        if data.has("border_color"):
            box.border_color = variant_from_json(data.border_color)
        if data.has("border_width_all"):
            box.set_border_width_all(int(data.border_width_all))
        if data.has("corner_radius_all"):
            box.set_corner_radius_all(int(data.corner_radius_all))
        if data.has("content_margin_all"):
            box.set_content_margin_all(float(data.content_margin_all))
    return box

func ui_create_theme(params):
    if not params.has("theme_path"):
        printerr("theme_path is required")
        quit(1)
    var theme = Theme.new()
    if params.has("colors") and params.colors is Dictionary:
        for key in params.colors.keys():
            var parsed = ui_theme_type_and_name(key)
            theme.set_color(parsed.name, parsed.type, variant_from_json(params.colors[key]))
    if params.has("constants") and params.constants is Dictionary:
        for key in params.constants.keys():
            var parsed_constant = ui_theme_type_and_name(key)
            theme.set_constant(parsed_constant.name, parsed_constant.type, int(params.constants[key]))
    if params.has("font_sizes") and params.font_sizes is Dictionary:
        for key in params.font_sizes.keys():
            var parsed_font_size = ui_theme_type_and_name(key)
            theme.set_font_size(parsed_font_size.name, parsed_font_size.type, int(params.font_sizes[key]))
    if params.has("styleboxes") and params.styleboxes is Dictionary:
        for key in params.styleboxes.keys():
            var parsed_stylebox = ui_theme_type_and_name(key)
            theme.set_stylebox(parsed_stylebox.name, parsed_stylebox.type, ui_make_stylebox_flat(params.styleboxes[key]))
    var saved_theme_path = save_resource_checked(theme, params.theme_path)
    return {
        "action": "create_theme",
        "themePath": saved_theme_path
    }

func ui_apply_theme(scene_root, params):
    if not params.has("theme_path") or not params.has("node_path"):
        printerr("theme_path and node_path are required")
        quit(1)
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node or not (node is Control):
        printerr("Failed to find Control node: " + str(params.node_path))
        quit(1)
    var theme = load(normalize_resource_path(params.theme_path))
    if not theme or not (theme is Theme):
        printerr("Failed to load Theme: " + str(params.theme_path))
        quit(1)
    node.theme = theme
    return {
        "action": "apply_theme",
        "nodePath": str(params.node_path),
        "themePath": normalize_resource_path(params.theme_path)
    }

func ui_create_template(scene_root, params):
    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find UI parent node: " + parent_path)
        quit(1)
    var template_name = str(params.template_name) if params.has("template_name") and str(params.template_name) != "" else "hud_bar"
    var root_name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else template_name.to_pascal_case()
    var root = Control.new()
    root.name = root_name
    match template_name:
        "hud_bar":
            root.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
            var label = Label.new()
            label.name = "ValueLabel"
            label.text = str(params.text) if params.has("text") else "HP 100"
            root.add_child(label)
            label.owner = scene_root
        "menu_panel":
            root.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
            var panel = PanelContainer.new()
            panel.name = "Panel"
            var box = VBoxContainer.new()
            box.name = "Actions"
            var title = Label.new()
            title.name = "Title"
            title.text = str(params.text) if params.has("text") else "Menu"
            var button = Button.new()
            button.name = "PrimaryButton"
            button.text = "Start"
            box.add_child(title)
            box.add_child(button)
            panel.add_child(box)
            root.add_child(panel)
            set_owner_recursive(panel, scene_root)
        "dialog_box":
            root.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
            var dialog = PanelContainer.new()
            dialog.name = "Dialog"
            var dialog_label = Label.new()
            dialog_label.name = "Message"
            dialog_label.text = str(params.text) if params.has("text") else "Message"
            dialog.add_child(dialog_label)
            root.add_child(dialog)
            set_owner_recursive(dialog, scene_root)
        _:
            printerr("Unsupported UI template: " + template_name)
            quit(1)
    if params.has("properties"):
        apply_properties_to_object(root, params.properties)
    parent.add_child(root)
    set_owner_recursive(root, scene_root)
    return {
        "action": "create_template",
        "templateName": template_name,
        "parentNodePath": parent_path,
        "path": find_tool_path_by_reference(scene_root, root, "root")
    }

func ui_collect_signal_candidates(node, path, mappings):
    if node is Button:
        mappings.append({
            "nodePath": path,
            "signalName": "pressed",
            "methodName": "_on_" + str(node.name).to_snake_case() + "_pressed"
        })
    for child in node.get_children():
        ui_collect_signal_candidates(child, path + "/" + str(child.name), mappings)

func ui_auto_connect_signals(scene_root, params):
    var source_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
    var source_root = find_node_by_tool_path(scene_root, source_path)
    if not source_root:
        printerr("Failed to find UI signal source: " + source_path)
        quit(1)
    var target_path = str(params.target_node_path) if params.has("target_node_path") and str(params.target_node_path) != "" else "root"
    var target = find_node_by_tool_path(scene_root, target_path)
    if not target:
        printerr("Failed to find UI signal target: " + target_path)
        quit(1)
    var mappings = params.signal_mappings if params.has("signal_mappings") and params.signal_mappings is Array else []
    if mappings.is_empty():
        ui_collect_signal_candidates(source_root, source_path, mappings)
    var connected = []
    var skipped = []
    for mapping in mappings:
        if not (mapping is Dictionary) or not mapping.has("node_path") or not mapping.has("signal_name") or not mapping.has("method_name"):
            skipped.append({"mapping": mapping, "reason": "missing node_path, signal_name, or method_name"})
            continue
        var signal_node = find_node_by_tool_path(scene_root, str(mapping.node_path))
        if not signal_node:
            skipped.append({"mapping": mapping, "reason": "source node not found"})
            continue
        if not target.has_method(str(mapping.method_name)):
            skipped.append({"mapping": mapping, "reason": "target method not found"})
            continue
        var callable = Callable(target, str(mapping.method_name))
        if not signal_node.is_connected(str(mapping.signal_name), callable):
            var result = signal_node.connect(str(mapping.signal_name), callable, CONNECT_PERSIST)
            if result != OK:
                skipped.append({"mapping": mapping, "reason": "connect failed: " + str(result)})
                continue
        connected.append(mapping)
    return {
        "action": "auto_connect_signals",
        "sourceNodePath": source_path,
        "targetNodePath": target_path,
        "connected": connected,
        "skipped": skipped
    }

func ui_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var full_scene_path = scene_data.path
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "create"

    if action == "create_theme":
        print(JSON.stringify(ui_create_theme(params)))
        return

    if action == "apply_theme":
        var theme_result = ui_apply_theme(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(theme_result))
        return

    if action == "create_template":
        var template_result = ui_create_template(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(template_result))
        return

    if action == "auto_connect_signals":
        var connect_result = ui_auto_connect_signals(scene_root, params)
        pack_and_save_scene(scene_root, full_scene_path)
        print(JSON.stringify(connect_result))
        return

    if action != "create":
        printerr("Unsupported ui action: " + action)
        quit(1)

    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find UI parent node: " + parent_path)
        quit(1)

    var node = instantiate_class(str(params.node_type))
    if not node:
        printerr("Failed to create UI node type: " + str(params.node_type))
        quit(1)
    if not (node is Control):
        printerr("UI tool only supports Control node types")
        quit(1)

    node.name = str(params.node_name)
    ui_apply_control_properties(node, params)

    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, full_scene_path)
    print(JSON.stringify({
        "scenePath": params.scene_path,
        "parentNodePath": parent_path,
        "nodeName": str(node.name),
        "nodeType": node.get_class(),
        "path": find_tool_path_by_reference(scene_root, node, "root")
    }))

func material_tool(params):
    var action = str(params.action) if params.has("action") else "read"

    if action == "list_templates":
        print(JSON.stringify({
            "action": action,
            "templates": material_template_names()
        }))
        return

    if action == "create_from_template":
        if not params.has("resource_path") or not params.has("template_name"):
            printerr("resource_path and template_name are required")
            quit(1)
        var template_material = create_material_from_template(str(params.template_name))
        if params.has("properties"):
            apply_properties_to_object(template_material, params.properties)
        var template_path = save_resource_checked(template_material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "templateName": str(params.template_name),
            "resourcePath": template_path,
            "material": serialize_material_resource(template_material)
        }))
        return

    if action == "create":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var material_type = str(params.material_type) if params.has("material_type") and str(params.material_type) != "" else "StandardMaterial3D"
        var material = instantiate_class(material_type)
        if not material or not (material is Material):
            printerr("Failed to create material type: " + material_type)
            quit(1)
        if material is ShaderMaterial:
            if params.has("shader_path") and str(params.shader_path) != "":
                var shader = load(normalize_resource_path(params.shader_path))
                if not shader or not (shader is Shader):
                    printerr("Failed to load shader: " + str(params.shader_path))
                    quit(1)
                material.shader = shader
        if params.has("preset_name") and str(params.preset_name) != "":
            apply_material_preset(material, str(params.preset_name))
        if params.has("properties"):
            apply_properties_to_object(material, params.properties)
        var full_resource_path = save_resource_checked(material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "resourcePath": full_resource_path,
            "material": serialize_material_resource(material)
        }))
        return

    if action == "read":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var material_resource = load(normalize_resource_path(params.resource_path))
        if not material_resource or not (material_resource is Material):
            printerr("Failed to load material: " + str(params.resource_path))
            quit(1)
        print(JSON.stringify({
            "action": action,
            "resourcePath": normalize_resource_path(params.resource_path),
            "material": serialize_material_resource(material_resource)
        }))
        return

    if action == "update":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var existing_material = load(normalize_resource_path(params.resource_path))
        if not existing_material or not (existing_material is Material):
            printerr("Failed to load material: " + str(params.resource_path))
            quit(1)
        if params.has("properties"):
            apply_properties_to_object(existing_material, params.properties)
        if params.has("preset_name") and str(params.preset_name) != "":
            apply_material_preset(existing_material, str(params.preset_name))
        var updated_path = save_resource_checked(existing_material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "resourcePath": updated_path,
            "material": serialize_material_resource(existing_material)
        }))
        return

    if action == "apply":
        if not params.has("scene_path") or not params.has("node_path") or not params.has("material_path"):
            printerr("scene_path, node_path, and material_path are required")
            quit(1)
        var scene_data = load_scene_instance(params.scene_path)
        var scene_root = scene_data.root
        var node = find_node_by_tool_path(scene_root, params.node_path)
        if not node:
            printerr("Failed to find material target node: " + params.node_path)
            quit(1)
        var material_to_apply = load(normalize_resource_path(params.material_path))
        if not material_to_apply or not (material_to_apply is Material):
            printerr("Failed to load material: " + str(params.material_path))
            quit(1)
        var property_name = str(params.property_name) if params.has("property_name") and str(params.property_name) != "" else ""
        if property_name == "":
            property_name = "material_override" if object_has_property(node, "material_override") else "material"
        if not object_has_property(node, property_name):
            printerr("Target node does not expose material property: " + property_name)
            quit(1)
        node.set(property_name, material_to_apply)
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "materialPath": normalize_resource_path(params.material_path),
            "propertyName": property_name
        }))
        return

    printerr("Unsupported material action: " + action)
    quit(1)

func shader_tool(params):
    var action = str(params.action) if params.has("action") else "read"

    if action == "create":
        if not params.has("shader_path"):
            printerr("shader_path is required")
            quit(1)
        var shader = Shader.new()
        var shader_type = str(params.shader_type) if params.has("shader_type") and str(params.shader_type) != "" else "canvas_item"
        var code = str(params.code) if params.has("code") and str(params.code) != "" else "shader_type " + shader_type + ";\nuniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);\n"
        shader.code = code
        var full_shader_path = save_resource_checked(shader, params.shader_path)
        print(JSON.stringify(shader_inspection_payload(
            action,
            full_shader_path,
            shader.code,
            params.include_paths if params.has("include_paths") else [],
            params.texture_defaults if params.has("texture_defaults") else {}
        )))
        return

    if action == "read" or action == "inspect":
        if not params.has("shader_path"):
            printerr("shader_path is required")
            quit(1)
        var loaded_shader = load(normalize_resource_path(params.shader_path))
        if not loaded_shader or not (loaded_shader is Shader):
            printerr("Failed to load shader: " + str(params.shader_path))
            quit(1)
        print(JSON.stringify(shader_inspection_payload(
            action,
            normalize_resource_path(params.shader_path),
            loaded_shader.code,
            params.include_paths if params.has("include_paths") else [],
            params.texture_defaults if params.has("texture_defaults") else {}
        )))
        return

    if action == "set_parameters":
        if not params.has("material_path") or not params.has("parameters"):
            printerr("material_path and parameters are required")
            quit(1)
        var shader_material = load(normalize_resource_path(params.material_path))
        if not shader_material or not (shader_material is ShaderMaterial):
            printerr("Failed to load ShaderMaterial: " + str(params.material_path))
            quit(1)
        if not (params.parameters is Dictionary):
            printerr("parameters must be a dictionary")
            quit(1)
        for parameter_name in params.parameters.keys():
            shader_material.set_shader_parameter(str(parameter_name), variant_from_json(params.parameters[parameter_name]))
        var full_material_path = save_resource_checked(shader_material, params.material_path)
        print(JSON.stringify({
            "action": action,
            "materialPath": full_material_path,
            "material": serialize_material_resource(shader_material)
        }))
        return

    printerr("Unsupported shader action: " + action)
    quit(1)

func lighting_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var lights = []
        collect_lighting_nodes(scene_root, "root", lights)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "lights": lights
        }))
        return

    if action != "create":
        printerr("Unsupported lighting action: " + action)
        quit(1)

    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find lighting parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "PointLight2D"
    var node = instantiate_class(node_type)
    if not node or not (node is Light3D or node is Light2D or node is WorldEnvironment):
        printerr("Failed to create lighting node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if node is WorldEnvironment and not node.environment:
        node.environment = Environment.new()
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func particle_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var particles = []
        collect_particle_nodes(scene_root, "root", particles)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "particles": particles
        }))
        return

    if action != "create":
        printerr("Unsupported particle action: " + action)
        quit(1)

    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find particle parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "GPUParticles2D"
    var node = instantiate_class(node_type)
    if not node or not (node is GPUParticles2D or node is GPUParticles3D or node is CPUParticles2D or node is CPUParticles3D):
        printerr("Failed to create particle node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if params.has("amount"):
        node.set("amount", int(params.amount))
    if params.has("lifetime"):
        node.set("lifetime", float(params.lifetime))
    if params.has("emitting"):
        node.set("emitting", bool(params.emitting))
    if params.has("process_material_type") and str(params.process_material_type) == "ParticleProcessMaterial":
        if node is GPUParticles2D or node is GPUParticles3D:
            node.process_material = ParticleProcessMaterial.new()
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func tilemap_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var maps = []
        collect_tilemap_nodes(scene_root, "root", maps)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "tilemaps": maps,
            "supportsTileMapLayer": ClassDB.class_exists("TileMapLayer"),
            "supportsLegacyTileMap": ClassDB.class_exists("TileMap")
        }))
        return

    if action == "create_tileset":
        if not params.has("tile_set_path") or str(params.tile_set_path) == "":
            printerr("tile_set_path is required")
            quit(1)
        var tile_set = TileSet.new()
        if params.has("properties"):
            apply_properties_to_object(tile_set, params.properties)
        var full_tile_set_path = save_resource_checked(tile_set, params.tile_set_path)
        print(JSON.stringify({
            "action": action,
            "tileSetPath": full_tile_set_path,
            "type": tile_set.get_class()
        }))
        return

    if action == "add_atlas_source":
        tilemap_add_atlas_source(params)
        return

    if action == "set_tile_metadata":
        tilemap_set_tile_metadata(params)
        return

    if action == "set_tile_collision":
        tilemap_set_tile_collision(params)
        return

    if action == "set_tile_navigation":
        tilemap_set_tile_navigation(params)
        return

    if action == "set_terrain":
        tilemap_set_terrain(params)
        return

    if action == "create":
        var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
        var parent = find_node_by_tool_path(scene_root, parent_path)
        if not parent:
            printerr("Failed to find tilemap parent node: " + parent_path)
            quit(1)
        var requested_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "TileMapLayer"
        if requested_type == "TileMapLayer" and not ClassDB.class_exists("TileMapLayer"):
            requested_type = "TileMap"
        var node = instantiate_class(requested_type)
        if not node or not (node is TileMap or node.get_class() == "TileMapLayer"):
            printerr("Failed to create tilemap node type: " + requested_type)
            quit(1)
        node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else requested_type
        if object_has_property(node, "tile_set"):
            if params.has("tile_set_path") and str(params.tile_set_path) != "":
                var tile_set = load(normalize_resource_path(params.tile_set_path))
                if not tile_set or not (tile_set is TileSet):
                    printerr("Failed to load TileSet: " + str(params.tile_set_path))
                    quit(1)
                node.set("tile_set", tile_set)
            else:
                node.set("tile_set", TileSet.new())
        if params.has("properties"):
            apply_properties_to_object(node, params.properties)
        parent.add_child(node)
        set_owner_recursive(node, scene_root)
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
            "nodeType": node.get_class(),
            "nodeName": str(node.name)
        }))
        return

    if action == "set_cell":
        if not params.has("node_path") or not params.has("cell"):
            printerr("node_path and cell are required")
            quit(1)
        var tile_node = find_node_by_tool_path(scene_root, params.node_path)
        if not tile_node or not (tile_node is TileMap or tile_node.get_class() == "TileMapLayer"):
            printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
            quit(1)
        var coords = vector2i_from_json(params.cell)
        var source_id = int(params.source_id) if params.has("source_id") else -1
        var atlas_coords = vector2i_from_json(params.atlas_coords) if params.has("atlas_coords") else Vector2i(-1, -1)
        var alternative_tile = int(params.alternative_tile) if params.has("alternative_tile") else 0
        set_tile_cell(tile_node, coords, source_id, atlas_coords, alternative_tile)
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "nodeType": tile_node.get_class(),
            "cell": {"type": "Vector2i", "value": [coords.x, coords.y]},
            "sourceId": source_id,
            "atlasCoords": {"type": "Vector2i", "value": [atlas_coords.x, atlas_coords.y]},
            "alternativeTile": alternative_tile
        }))
        return

    if action == "batch_set_cells":
        if not params.has("node_path") or not params.has("cells") or not (params.cells is Array):
            printerr("node_path and cells array are required")
            quit(1)
        var batch_tile_node = find_node_by_tool_path(scene_root, params.node_path)
        if not batch_tile_node or not (batch_tile_node is TileMap or batch_tile_node.get_class() == "TileMapLayer"):
            printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
            quit(1)
        var changed_cells = []
        for cell_entry in params.cells:
            if typeof(cell_entry) != TYPE_DICTIONARY or not cell_entry.has("cell"):
                continue
            var batch_coords = vector2i_from_json(cell_entry.cell)
            var batch_source_id = int(cell_entry.source_id) if cell_entry.has("source_id") else -1
            var batch_atlas_coords = vector2i_from_json(cell_entry.atlas_coords) if cell_entry.has("atlas_coords") else Vector2i(-1, -1)
            var batch_alternative_tile = int(cell_entry.alternative_tile) if cell_entry.has("alternative_tile") else 0
            set_tile_cell(batch_tile_node, batch_coords, batch_source_id, batch_atlas_coords, batch_alternative_tile)
            changed_cells.append({"type": "Vector2i", "value": [batch_coords.x, batch_coords.y]})
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "nodeType": batch_tile_node.get_class(),
            "changedCells": changed_cells
        }))
        return

    if action == "fill_rect":
        if not params.has("node_path") or not params.has("rect"):
            printerr("node_path and rect are required")
            quit(1)
        var fill_tile_node = find_node_by_tool_path(scene_root, params.node_path)
        if not fill_tile_node or not (fill_tile_node is TileMap or fill_tile_node.get_class() == "TileMapLayer"):
            printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
            quit(1)
        var rect = rect2i_from_json(params.rect)
        var fill_source_id = int(params.source_id) if params.has("source_id") else -1
        var fill_atlas_coords = vector2i_from_json(params.atlas_coords) if params.has("atlas_coords") else Vector2i(-1, -1)
        var fill_alternative_tile = int(params.alternative_tile) if params.has("alternative_tile") else 0
        for y in range(rect.position.y, rect.position.y + rect.size.y):
            for x in range(rect.position.x, rect.position.x + rect.size.x):
                set_tile_cell(fill_tile_node, Vector2i(x, y), fill_source_id, fill_atlas_coords, fill_alternative_tile)
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "nodeType": fill_tile_node.get_class(),
            "rect": {
                "x": rect.position.x,
                "y": rect.position.y,
                "width": rect.size.x,
                "height": rect.size.y
            },
            "sourceId": fill_source_id
        }))
        return

    if action == "paint_random":
        if not params.has("node_path") or not params.has("rect") or not params.has("weighted_tiles") or not (params.weighted_tiles is Array) or params.weighted_tiles.is_empty():
            printerr("node_path, rect, and weighted_tiles are required")
            quit(1)
        var random_tile_node = find_node_by_tool_path(scene_root, params.node_path)
        if not random_tile_node or not (random_tile_node is TileMap or random_tile_node.get_class() == "TileMapLayer"):
            printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
            quit(1)
        var random_rect = rect2i_from_json(params.rect)
        var random_seed = int(params.seed) if params.has("seed") else 1
        var random_changed_cells = []
        for y in range(random_rect.position.y, random_rect.position.y + random_rect.size.y):
            for x in range(random_rect.position.x, random_rect.position.x + random_rect.size.x):
                var coords = Vector2i(x, y)
                var choice = tilemap_weighted_choice(params.weighted_tiles, coords, random_seed)
                tilemap_apply_tile_entry(random_tile_node, coords, choice)
                random_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "rect": {
                "x": random_rect.position.x,
                "y": random_rect.position.y,
                "width": random_rect.size.x,
                "height": random_rect.size.y
            },
            "seed": random_seed,
            "changedCells": random_changed_cells
        }))
        return

    if action == "apply_template":
        if not params.has("node_path") or not params.has("rect"):
            printerr("node_path and rect are required")
            quit(1)
        var template_tile_node = find_node_by_tool_path(scene_root, params.node_path)
        if not template_tile_node or not (template_tile_node is TileMap or template_tile_node.get_class() == "TileMapLayer"):
            printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
            quit(1)
        var template_name = str(params.template_name) if params.has("template_name") and str(params.template_name) != "" else "survivor_arena"
        var template_rect = rect2i_from_json(params.rect)
        var template_changed_cells = []
        var floor_tile = tilemap_palette_tile(params, "floor", {"source_id": int(params.get("source_id", -1)), "atlas_coords": params.get("atlas_coords", [-1, -1]), "alternative_tile": int(params.get("alternative_tile", 0))})
        var wall_tile = tilemap_palette_tile(params, "wall", floor_tile)
        var obstacle_tile = tilemap_palette_tile(params, "obstacle", wall_tile)

        if template_name == "survivor_arena":
            for y in range(template_rect.position.y, template_rect.position.y + template_rect.size.y):
                for x in range(template_rect.position.x, template_rect.position.x + template_rect.size.x):
                    var coords = Vector2i(x, y)
                    var is_border = x == template_rect.position.x or y == template_rect.position.y or x == template_rect.position.x + template_rect.size.x - 1 or y == template_rect.position.y + template_rect.size.y - 1
                    var is_obstacle = not is_border and ((x + y) % 7 == 0)
                    tilemap_apply_tile_entry(template_tile_node, coords, wall_tile if is_border else obstacle_tile if is_obstacle else floor_tile)
                    template_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
        elif template_name == "room_grid":
            for y in range(template_rect.position.y, template_rect.position.y + template_rect.size.y):
                for x in range(template_rect.position.x, template_rect.position.x + template_rect.size.x):
                    var coords = Vector2i(x, y)
                    var is_wall = x == template_rect.position.x or y == template_rect.position.y or x == template_rect.position.x + template_rect.size.x - 1 or y == template_rect.position.y + template_rect.size.y - 1 or x % 6 == 0 or y % 6 == 0
                    tilemap_apply_tile_entry(template_tile_node, coords, wall_tile if is_wall else floor_tile)
                    template_changed_cells.append({"type": "Vector2i", "value": [coords.x, coords.y]})
        else:
            printerr("Unsupported tilemap template: " + template_name)
            quit(1)

        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "templateName": template_name,
            "rect": {
                "x": template_rect.position.x,
                "y": template_rect.position.y,
                "width": template_rect.size.x,
                "height": template_rect.size.y
            },
            "changedCells": template_changed_cells
        }))
        return

    printerr("Unsupported tilemap action: " + action)
    quit(1)

func geometry_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var types = ["Polygon2D", "Line2D", "Marker2D"]

    if action == "list":
        var nodes = []
        collect_nodes_by_types(scene_root, "root", types, nodes)
        print(JSON.stringify({"scenePath": params.scene_path, "geometry": nodes}))
        return

    if action != "create":
        printerr("Unsupported geometry action: " + action)
        quit(1)
    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find geometry parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "Polygon2D"
    if not types.has(node_type):
        printerr("Unsupported geometry node type: " + node_type)
        quit(1)
    var node = instantiate_class(node_type)
    if not node:
        printerr("Failed to create geometry node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func physics_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var types = ["CharacterBody2D", "RigidBody2D", "StaticBody2D", "Area2D", "CollisionShape2D", "CharacterBody3D", "RigidBody3D", "StaticBody3D", "Area3D", "CollisionShape3D"]

    if action == "list":
        var nodes = []
        collect_nodes_by_types(scene_root, "root", types, nodes)
        print(JSON.stringify({"scenePath": params.scene_path, "physics": nodes}))
        return

    if action != "create":
        printerr("Unsupported physics action: " + action)
        quit(1)
    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find physics parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "StaticBody2D"
    if not types.has(node_type):
        printerr("Unsupported physics node type: " + node_type)
        quit(1)
    var node = instantiate_class(node_type)
    if not node:
        printerr("Failed to create physics node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if node is CollisionShape2D or node is CollisionShape3D:
        var default_shape = "RectangleShape2D" if node is CollisionShape2D else "BoxShape3D"
        var shape_type = str(params.shape_type) if params.has("shape_type") and str(params.shape_type) != "" else default_shape
        node.shape = shape_resource_for_type(shape_type)
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func navigation_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var types = ["NavigationRegion2D", "NavigationAgent2D", "NavigationRegion3D", "NavigationAgent3D", "NavigationObstacle2D", "NavigationObstacle3D"]

    if action == "list":
        var nodes = []
        collect_nodes_by_types(scene_root, "root", types, nodes)
        print(JSON.stringify({"scenePath": params.scene_path, "navigation": nodes}))
        return

    if action == "set_polygon":
        if not params.has("node_path") or not params.has("points") or not (params.points is Array):
            printerr("node_path and points array are required")
            quit(1)
        var region_node = find_node_by_tool_path(scene_root, params.node_path)
        if not region_node or not (region_node is NavigationRegion2D):
            printerr("set_polygon currently requires a NavigationRegion2D node: " + params.node_path)
            quit(1)
        var polygon = NavigationPolygon.new()
        var vertices = PackedVector2Array()
        for point in params.points:
            vertices.append(vector2_from_json(point))
        polygon.vertices = vertices
        if vertices.size() >= 3:
            var outline = PackedInt32Array()
            for i in range(vertices.size()):
                outline.append(i)
            polygon.add_polygon(outline)
        region_node.navigation_polygon = polygon
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "points": vertices.size()
        }))
        return

    if action != "create":
        printerr("Unsupported navigation action: " + action)
        quit(1)
    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find navigation parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "NavigationRegion2D"
    if not types.has(node_type):
        printerr("Unsupported navigation node type: " + node_type)
        quit(1)
    var node = instantiate_class(node_type)
    if not node:
        printerr("Failed to create navigation node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if node is NavigationRegion2D and not node.navigation_polygon:
        node.navigation_polygon = NavigationPolygon.new()
    if node is NavigationRegion3D and not node.navigation_mesh:
        node.navigation_mesh = NavigationMesh.new()
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func audio_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"
    var types = ["AudioStreamPlayer", "AudioStreamPlayer2D", "AudioStreamPlayer3D"]

    if action == "list":
        var nodes = []
        collect_nodes_by_types(scene_root, "root", types, nodes)
        print(JSON.stringify({"scenePath": params.scene_path, "audio": nodes}))
        return

    if action == "list_buses":
        var buses = []
        for bus_index in range(AudioServer.get_bus_count()):
            buses.append({
                "index": bus_index,
                "name": AudioServer.get_bus_name(bus_index),
                "volumeDb": AudioServer.get_bus_volume_db(bus_index),
                "muted": AudioServer.is_bus_mute(bus_index),
                "solo": AudioServer.is_bus_solo(bus_index),
                "bypassEffects": AudioServer.is_bus_bypassing_effects(bus_index),
                "effects": AudioServer.get_bus_effect_count(bus_index)
            })
        print(JSON.stringify({"audioBuses": buses}))
        return

    if action != "create":
        printerr("Unsupported audio action: " + action)
        quit(1)
    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find audio parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "AudioStreamPlayer"
    if not types.has(node_type):
        printerr("Unsupported audio node type: " + node_type)
        quit(1)
    var node = instantiate_class(node_type)
    if not node:
        printerr("Failed to create audio node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if params.has("stream_path") and str(params.stream_path) != "":
        var stream = load(normalize_resource_path(params.stream_path))
        if not stream or not (stream is AudioStream):
            printerr("Failed to load audio stream: " + str(params.stream_path))
            quit(1)
        node.stream = stream
    if params.has("bus"):
        node.bus = str(params.bus)
    if params.has("volume_db"):
        node.volume_db = float(params.volume_db)
    if params.has("autoplay"):
        node.autoplay = bool(params.autoplay)
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func rename_node(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    node.name = params.new_name
    pack_and_save_scene(scene_root, full_scene_path)
    print("Renamed node to: " + params.new_name)

func delete_node(params):
    var full_scene_path = normalize_resource_path(params.scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = scene.instantiate()
    var node = find_node_by_tool_path(scene_root, params.node_path)
    if not node:
        printerr("Failed to find node: " + params.node_path)
        quit(1)

    if node == scene_root:
        printerr("Cannot delete the scene root node")
        quit(1)

    var parent = node.get_parent()
    if not parent:
        printerr("Cannot delete node without a parent: " + params.node_path)
        quit(1)

    parent.remove_child(node)
    node.free()
    pack_and_save_scene(scene_root, full_scene_path)
    print("Deleted node: " + params.node_path)

func add_node(params):
    print("Adding node to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Use traditional if-else statement for better compatibility
    var parent_path = "root"  # Default value
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    if debug_mode:
        print("Instantiating node of type: " + params.node_type)
    var new_node = instantiate_class(params.node_type)
    if not new_node:
        printerr("Failed to instantiate node of type: " + params.node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    new_node.name = params.node_name
    if debug_mode:
        print("New node created with name: " + new_node.name)
    
    if params.has("properties"):
        if debug_mode:
            print("Setting properties on node")
        var properties = params.properties
        for property in properties:
            if debug_mode:
                print("Setting property: " + property + " = " + str(properties[property]))
            var value = properties[property]
            if typeof(value) == TYPE_STRING and value.begins_with("res://"):
                value = load(value)
                if debug_mode:
                    print("Loaded resource for property: " + property + " -> " + str(value))
            new_node.set(property, value)
    
    parent.add_child(new_node)
    new_node.owner = scene_root
    if debug_mode:
        print("Node added to parent and ownership set")
    
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Load a sprite into a Sprite2D node
func load_sprite(params):
    print("Loading sprite into scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Ensure the texture path starts with res:// for Godot's resource system
    var full_texture_path = params.texture_path
    if not full_texture_path.begins_with("res://"):
        full_texture_path = "res://" + full_texture_path
    
    if debug_mode:
        print("Full texture path (with res://): " + full_texture_path)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Find the sprite node
    var node_path = params.node_path
    if debug_mode:
        print("Original node path: " + node_path)
    
    if node_path.begins_with("root/"):
        node_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Node path after removing 'root/' prefix: " + node_path)
    
    var sprite_node = null
    if node_path == "":
        # If no node path, assume root is the sprite
        sprite_node = scene_root
        if debug_mode:
            print("Using root node as sprite node")
    else:
        sprite_node = scene_root.get_node(node_path)
        if sprite_node and debug_mode:
            print("Found sprite node: " + sprite_node.name)
    
    if not sprite_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Check if the node is a Sprite2D or compatible type
    if debug_mode:
        print("Node class: " + sprite_node.get_class())
    if not (sprite_node is Sprite2D or sprite_node is Sprite3D or sprite_node is TextureRect):
        printerr("Node is not a sprite-compatible type: " + sprite_node.get_class())
        quit(1)
    
    # Load the texture
    if debug_mode:
        print("Loading texture from: " + full_texture_path)
    var texture = load(full_texture_path)
    if not texture:
        printerr("Failed to load texture: " + full_texture_path)
        quit(1)
    
    if debug_mode:
        print("Texture loaded successfully")
    
    # Set the texture on the sprite
    if sprite_node is Sprite2D or sprite_node is Sprite3D:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on Sprite2D/Sprite3D node")
    elif sprite_node is TextureRect:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on TextureRect node")
    
    # Save the modified scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_scene_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Sprite loaded successfully with texture: " + full_texture_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_scene_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_scene_path)
            else:
                print("Sprite loaded successfully with texture: " + full_texture_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Export a scene as a MeshLibrary resource
func export_mesh_library(params):
    print("Exporting MeshLibrary from scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Ensure the output path starts with res:// for Godot's resource system
    var full_output_path = params.output_path
    if not full_output_path.begins_with("res://"):
        full_output_path = "res://" + full_output_path
    
    if debug_mode:
        print("Full output path (with res://): " + full_output_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    if debug_mode:
        print("Loading scene from: " + full_scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Create a new MeshLibrary
    var mesh_library = MeshLibrary.new()
    if debug_mode:
        print("Created new MeshLibrary")
    
    # Get mesh item names if provided
    var mesh_item_names = params.mesh_item_names if params.has("mesh_item_names") else []
    var use_specific_items = mesh_item_names.size() > 0
    
    if debug_mode:
        if use_specific_items:
            print("Using specific mesh items: " + str(mesh_item_names))
        else:
            print("Using all mesh items in the scene")
    
    # Process all child nodes
    var item_id = 0
    if debug_mode:
        print("Processing child nodes...")
    
    for child in scene_root.get_children():
        if debug_mode:
            print("Checking child node: " + child.name)
        
        # Skip if not using all items and this item is not in the list
        if use_specific_items and not (child.name in mesh_item_names):
            if debug_mode:
                print("Skipping node " + child.name + " (not in specified items list)")
            continue
            
        # Check if the child has a mesh
        var mesh_instance = null
        if child is MeshInstance3D:
            mesh_instance = child
            if debug_mode:
                print("Node " + child.name + " is a MeshInstance3D")
        else:
            # Try to find a MeshInstance3D in the child's descendants
            if debug_mode:
                print("Searching for MeshInstance3D in descendants of " + child.name)
            for descendant in child.get_children():
                if descendant is MeshInstance3D:
                    mesh_instance = descendant
                    if debug_mode:
                        print("Found MeshInstance3D in descendant: " + descendant.name)
                    break
        
        if mesh_instance and mesh_instance.mesh:
            if debug_mode:
                print("Adding mesh: " + child.name)
            
            # Add the mesh to the library
            mesh_library.create_item(item_id)
            mesh_library.set_item_name(item_id, child.name)
            mesh_library.set_item_mesh(item_id, mesh_instance.mesh)
            if debug_mode:
                print("Added mesh to library with ID: " + str(item_id))
            
            # Add collision shape if available
            var collision_added = false
            for collision_child in child.get_children():
                if collision_child is CollisionShape3D and collision_child.shape:
                    mesh_library.set_item_shapes(item_id, [collision_child.shape])
                    if debug_mode:
                        print("Added collision shape from: " + collision_child.name)
                    collision_added = true
                    break
            
            if debug_mode and not collision_added:
                print("No collision shape found for mesh: " + child.name)
            
            # Add preview if available
            if mesh_instance.mesh:
                mesh_library.set_item_preview(item_id, mesh_instance.mesh)
                if debug_mode:
                    print("Added preview for mesh: " + child.name)
            
            item_id += 1
        elif debug_mode:
            print("Node " + child.name + " has no valid mesh")
    
    if debug_mode:
        print("Processed " + str(item_id) + " meshes")
    
    # Create directory if it doesn't exist
    var dir = DirAccess.open("res://")
    if dir == null:
        printerr("Failed to open res:// directory")
        printerr("DirAccess error: " + str(DirAccess.get_open_error()))
        quit(1)
        
    var output_dir = full_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
    
    if output_dir != "res://" and not dir.dir_exists(output_dir.substr(6)):  # Remove "res://" prefix
        if debug_mode:
            print("Creating directory: " + output_dir)
        var error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_output_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_output_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_output_path)
            else:
                print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
        else:
            printerr("Failed to save MeshLibrary: " + str(error))
    else:
        printerr("No valid meshes found in the scene")

# Find files with a specific extension recursively
func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)
            
            file_name = dir.get_next()
    
    return files

# Get UID for a specific file
func get_uid(params):
    if not params.has("file_path"):
        printerr("File path is required")
        quit(1)
    
    # Ensure the file path starts with res:// for Godot's resource system
    var file_path = params.file_path
    if not file_path.begins_with("res://"):
        file_path = "res://" + file_path
    
    print("Getting UID for file: " + file_path)
    if debug_mode:
        print("Full file path (with res://): " + file_path)
    
    # Get the absolute path for reference
    var absolute_path = ProjectSettings.globalize_path(file_path)
    if debug_mode:
        print("Absolute file path: " + absolute_path)
    
    # Ensure the file exists
    var file_check = FileAccess.file_exists(file_path)
    if debug_mode:
        print("File exists check: " + str(file_check))
    
    if not file_check:
        printerr("File does not exist at: " + file_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Check if the UID file exists
    var uid_path = file_path + ".uid"
    if debug_mode:
        print("UID file path: " + uid_path)
    
    var uid_check = FileAccess.file_exists(uid_path)
    if debug_mode:
        print("UID file exists check: " + str(uid_check))
    
    var f = FileAccess.open(uid_path, FileAccess.READ)
    
    if f:
        # Read the UID content
        var uid_content = f.get_as_text()
        f.close()
        if debug_mode:
            print("UID content read successfully")
        
        # Return the UID content
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "uid": uid_content.strip_edges(),
            "exists": true
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))
    else:
        if debug_mode:
            print("UID file does not exist or could not be opened")
        
        # UID file doesn't exist
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "exists": false,
            "message": "UID file does not exist for this file. Use resave_resources to generate UIDs."
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))

# Resave all resources to update UID references
func resave_resources(params):
    print("Resaving all resources to update UID references...")
    
    # Get project path if provided
    var project_path = "res://"
    if params.has("project_path"):
        project_path = params.project_path
        if not project_path.begins_with("res://"):
            project_path = "res://" + project_path
        if not project_path.ends_with("/"):
            project_path += "/"
    
    if debug_mode:
        print("Using project path: " + project_path)
    
    # Get all .tscn files
    if debug_mode:
        print("Searching for scene files in: " + project_path)
    var scenes = find_files(project_path, ".tscn")
    if debug_mode:
        print("Found " + str(scenes.size()) + " scenes")
    
    # Resave each scene
    var success_count = 0
    var error_count = 0
    
    for scene_path in scenes:
        if debug_mode:
            print("Processing scene: " + scene_path)
        
        # Check if the scene file exists
        var file_check = FileAccess.file_exists(scene_path)
        if debug_mode:
            print("Scene file exists check: " + str(file_check))
        
        if not file_check:
            printerr("Scene file does not exist at: " + scene_path)
            error_count += 1
            continue
        
        # Load the scene
        var scene = load(scene_path)
        if scene:
            if debug_mode:
                print("Scene loaded successfully, saving...")
            var error = ResourceSaver.save(scene, scene_path)
            if debug_mode:
                print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
            
            if error == OK:
                success_count += 1
                if debug_mode:
                    print("Scene saved successfully: " + scene_path)
                
                    # Verify the file was actually updated
                    var file_check_after = FileAccess.file_exists(scene_path)
                    print("File exists check after save: " + str(file_check_after))
                
                    if not file_check_after:
                        printerr("File reported as saved but does not exist at: " + scene_path)
            else:
                error_count += 1
                printerr("Failed to save: " + scene_path + ", error: " + str(error))
        else:
            error_count += 1
            printerr("Failed to load: " + scene_path)
    
    # Get all .gd and .shader files
    if debug_mode:
        print("Searching for script and shader files in: " + project_path)
    var scripts = find_files(project_path, ".gd") + find_files(project_path, ".shader") + find_files(project_path, ".gdshader")
    if debug_mode:
        print("Found " + str(scripts.size()) + " scripts/shaders")
    
    # Check for missing .uid files
    var missing_uids = 0
    var generated_uids = 0
    
    for script_path in scripts:
        if debug_mode:
            print("Checking UID for: " + script_path)
        var uid_path = script_path + ".uid"
        
        var uid_check = FileAccess.file_exists(uid_path)
        if debug_mode:
            print("UID file exists check: " + str(uid_check))
        
        var f = FileAccess.open(uid_path, FileAccess.READ)
        if not f:
            missing_uids += 1
            if debug_mode:
                print("Missing UID file for: " + script_path + ", generating...")
            
            # Force a save to generate UID
            var res = load(script_path)
            if res:
                var error = ResourceSaver.save(res, script_path)
                if debug_mode:
                    print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
                
                if error == OK:
                    generated_uids += 1
                    if debug_mode:
                        print("Generated UID for: " + script_path)
                    
                        # Verify the UID file was actually created
                        var uid_check_after = FileAccess.file_exists(uid_path)
                        print("UID file exists check after save: " + str(uid_check_after))
                    
                        if not uid_check_after:
                            printerr("UID file reported as generated but does not exist at: " + uid_path)
                else:
                    printerr("Failed to generate UID for: " + script_path + ", error: " + str(error))
            else:
                printerr("Failed to load resource: " + script_path)
        elif debug_mode:
            print("UID file already exists for: " + script_path)
    
    if debug_mode:
        print("Summary:")
        print("- Scenes processed: " + str(scenes.size()))
        print("- Scenes successfully saved: " + str(success_count))
        print("- Scenes with errors: " + str(error_count))
        print("- Scripts/shaders missing UIDs: " + str(missing_uids))
        print("- UIDs successfully generated: " + str(generated_uids))
    print("Resave operation complete")

# Save changes to a scene file
func save_scene(params):
    print("Saving scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Determine save path
    var save_path = params.new_path if params.has("new_path") else full_scene_path
    if params.has("new_path") and not save_path.begins_with("res://"):
        save_path = "res://" + save_path
    
    if debug_mode:
        print("Save path: " + save_path)
    
    # Create directory if it doesn't exist
    if params.has("new_path"):
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            printerr("DirAccess error: " + str(DirAccess.get_open_error()))
            quit(1)
            
        var scene_dir = save_path.get_base_dir()
        if debug_mode:
            print("Scene directory: " + scene_dir)
        
        if scene_dir != "res://" and not dir.dir_exists(scene_dir.substr(6)):  # Remove "res://" prefix
            if debug_mode:
                print("Creating directory: " + scene_dir)
            var error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created/updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(save_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Scene saved successfully to: " + save_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(save_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + save_path)
            else:
                print("Scene saved successfully to: " + save_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))
