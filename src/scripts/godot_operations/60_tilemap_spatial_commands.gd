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

