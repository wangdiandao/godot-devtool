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
