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
	if action == "get_cell":
		if not params.has("node_path") or not params.has("cell"):
			printerr("node_path and cell are required")
			quit(1)
		var get_tile_node = find_node_by_tool_path(scene_root, params.node_path)
		if not get_tile_node or not (get_tile_node is TileMap or get_tile_node.get_class() == "TileMapLayer"):
			printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
			quit(1)
		var get_coords = vector2i_from_json(params.cell)
		var source_id = get_tile_source_id(get_tile_node, get_coords)
		var atlas_coords = get_tile_atlas_coords(get_tile_node, get_coords)
		var alternative_tile = get_tile_alternative_tile(get_tile_node, get_coords)
		print(JSON.stringify({
			"action": action,
			"scenePath": params.scene_path,
			"nodePath": params.node_path,
			"cell": {"type": "Vector2i", "value": [get_coords.x, get_coords.y]},
			"sourceId": source_id,
			"atlasCoords": {"type": "Vector2i", "value": [atlas_coords.x, atlas_coords.y]},
			"alternativeTile": alternative_tile
		}))
		return

	if action == "get_used_cells":
		if not params.has("node_path"):
			printerr("node_path is required")
			quit(1)
		var used_tile_node = find_node_by_tool_path(scene_root, params.node_path)
		if not used_tile_node or not (used_tile_node is TileMap or used_tile_node.get_class() == "TileMapLayer"):
			printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
			quit(1)
		var used_cells = []
		for used_cell in get_tile_used_cells(used_tile_node):
			used_cells.append({"type": "Vector2i", "value": [used_cell.x, used_cell.y]})
		print(JSON.stringify({
			"action": action,
			"scenePath": params.scene_path,
			"nodePath": params.node_path,
			"usedCells": used_cells
		}))
		return

	if action == "clear":
		if not params.has("node_path"):
			printerr("node_path is required")
			quit(1)
		var clear_tile_node = find_node_by_tool_path(scene_root, params.node_path)
		if not clear_tile_node or not (clear_tile_node is TileMap or clear_tile_node.get_class() == "TileMapLayer"):
			printerr("Failed to find TileMapLayer or TileMap node: " + params.node_path)
			quit(1)
		clear_tile_cells(clear_tile_node)
		pack_and_save_scene(scene_root, scene_data.path)
		print(JSON.stringify({
			"action": action,
			"scenePath": params.scene_path,
			"nodePath": params.node_path,
			"cleared": true
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

func physics_dimension_for_node(node):
	return "3d" if str(node.get_class()).ends_with("3D") else "2d"

func physics_mask_from_names(layer_names, dimension):
	if not (layer_names is Array):
		return -1
	var mask = 0
	var prefix = "layer_names/3d_physics/layer_" if dimension == "3d" else "layer_names/2d_physics/layer_"
	for layer_index in range(1, 33):
		var layer_name = str(ProjectSettings.get_setting(prefix + str(layer_index), ""))
		if layer_name == "":
			continue
		for requested_name in layer_names:
			if layer_name == str(requested_name):
				mask = mask | (1 << (layer_index - 1))
	return mask

func physics_apply_shape_dimensions(shape, params):
	if not shape:
		return

	if params.has("dimensions"):
		var dimensions = params.dimensions
		if shape is RectangleShape2D:
			if typeof(dimensions) == TYPE_DICTIONARY and dimensions.has("width") and dimensions.has("height"):
				shape.size = Vector2(float(dimensions.width), float(dimensions.height))
			else:
				shape.size = vector2_from_json(dimensions)
		elif shape is BoxShape3D:
			shape.size = vector3_from_json(dimensions)
	if params.has("radius") and object_has_property(shape, "radius"):
		shape.set("radius", float(params.radius))
	if params.has("height") and object_has_property(shape, "height"):
		shape.set("height", float(params.height))
	if params.has("properties"):
		apply_properties_to_object(shape, params.properties)

func physics_shape_from_params(params, is_3d):
	if params.has("shape_resource_path") and str(params.shape_resource_path) != "":
		var loaded_shape = load(normalize_resource_path(params.shape_resource_path))
		if loaded_shape and (loaded_shape is Shape2D or loaded_shape is Shape3D):
			return loaded_shape
		printerr("Failed to load shape resource: " + str(params.shape_resource_path))
		quit(1)
	var default_shape = "BoxShape3D" if is_3d else "RectangleShape2D"
	var shape_type = str(params.shape_type) if params.has("shape_type") and str(params.shape_type) != "" else default_shape
	var shape = shape_resource_for_type(shape_type)
	physics_apply_shape_dimensions(shape, params)
	return shape

func physics_apply_layers(node, params):
	if not object_has_property(node, "collision_layer") and not object_has_property(node, "collision_mask"):
		return
	var dimension = physics_dimension_for_node(node)
	if params.has("collision_layer_names"):
		var named_layer = physics_mask_from_names(params.collision_layer_names, dimension)
		if named_layer >= 0 and object_has_property(node, "collision_layer"):
			node.set("collision_layer", named_layer)
	if params.has("collision_mask_names"):
		var named_mask = physics_mask_from_names(params.collision_mask_names, dimension)
		if named_mask >= 0 and object_has_property(node, "collision_mask"):
			node.set("collision_mask", named_mask)
	if params.has("collision_layer") and object_has_property(node, "collision_layer"):
		node.set("collision_layer", int(params.collision_layer))
	if params.has("collision_mask") and object_has_property(node, "collision_mask"):
		node.set("collision_mask", int(params.collision_mask))

func physics_collision_shape_summary(node):
	var shapes = []
	for child in node.get_children():
		if child is CollisionShape2D or child is CollisionShape3D:
			shapes.append({
				"name": str(child.name),
				"type": child.get_class(),
				"disabled": bool(child.disabled),
				"shape": serialize_variant(child.shape)
			})
		shapes.append_array(physics_collision_shape_summary(child))
	return shapes

func collect_physics_info(node, path, results):
	var is_physics_node = object_has_property(node, "collision_layer") or node is CollisionShape2D or node is CollisionShape3D
	if is_physics_node:
		results.append({
			"name": str(node.name),
			"type": node.get_class(),
			"path": path,
			"collisionLayer": int(node.get("collision_layer")) if object_has_property(node, "collision_layer") else null,
			"collisionMask": int(node.get("collision_mask")) if object_has_property(node, "collision_mask") else null,
			"shapes": physics_collision_shape_summary(node)
		})
	for child in node.get_children():
		collect_physics_info(child, path + "/" + str(child.name), results)

func physics_get_collision_info(params, scene_root):
	var info = []
	if params.has("node_path") and str(params.node_path) != "":
		var info_node = find_node_by_tool_path(scene_root, params.node_path)
		if not info_node:
			printerr("Failed to find physics node: " + params.node_path)
			quit(1)
		collect_physics_info(info_node, params.node_path, info)
	else:
		collect_physics_info(scene_root, "root", info)
	print(JSON.stringify({"scenePath": params.scene_path, "physics": info}))

func physics_set_layers(params, scene_root, scene_data):
	if not params.has("node_path"):
		printerr("node_path is required")
		quit(1)
	var layer_node = find_node_by_tool_path(scene_root, params.node_path)
	if not layer_node:
		printerr("Failed to find physics node: " + params.node_path)
		quit(1)
	physics_apply_layers(layer_node, params)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "set_layers",
		"scenePath": params.scene_path,
		"nodePath": params.node_path,
		"collisionLayer": int(layer_node.get("collision_layer")) if object_has_property(layer_node, "collision_layer") else null,
		"collisionMask": int(layer_node.get("collision_mask")) if object_has_property(layer_node, "collision_mask") else null
	}))

func physics_create_shape_resource(params):
	if not params.has("shape_resource_path") or str(params.shape_resource_path) == "":
		printerr("shape_resource_path is required")
		quit(1)
	var shape_type = str(params.shape_type) if params.has("shape_type") and str(params.shape_type) != "" else "RectangleShape2D"
	var shape = shape_resource_for_type(shape_type)
	physics_apply_shape_dimensions(shape, params)
	var full_shape_path = save_resource_checked(shape, params.shape_resource_path)
	print(JSON.stringify({
		"action": "create_shape_resource",
		"shapeResourcePath": full_shape_path,
		"shapeType": shape.get_class()
	}))

func physics_add_collision_shape(parent, scene_root, params, is_3d):
	var shape_node = instantiate_class("CollisionShape3D" if is_3d else "CollisionShape2D")
	if not shape_node:
		printerr("Failed to create collision shape node")
		quit(1)
	shape_node.name = "CollisionShape"
	shape_node.shape = physics_shape_from_params(params, is_3d)
	parent.add_child(shape_node)
	set_owner_recursive(shape_node, scene_root)
	return shape_node

func physics_create_area_trigger_template(params, scene_root, scene_data):
	var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find physics parent node: " + parent_path)
		quit(1)
	var template_name = str(params.template_name) if params.has("template_name") and str(params.template_name) != "" else "area_trigger_2d"
	var is_3d = template_name == "area_trigger_3d" or str(params.get("node_type", "")) == "Area3D"
	var area = instantiate_class("Area3D" if is_3d else "Area2D")
	area.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else ("AreaTrigger3D" if is_3d else "AreaTrigger2D")
	physics_apply_layers(area, params)
	if params.has("properties"):
		apply_properties_to_object(area, params.properties)
	parent.add_child(area)
	set_owner_recursive(area, scene_root)
	var shape_node = physics_add_collision_shape(area, scene_root, params, is_3d)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "create_area_trigger_template",
		"scenePath": params.scene_path,
		"nodePath": find_tool_path_by_reference(scene_root, area, "root"),
		"shapePath": find_tool_path_by_reference(scene_root, shape_node, "root"),
		"nodeType": area.get_class()
	}))

func physics_create_character_controller_template(params, scene_root, scene_data):
	var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find physics parent node: " + parent_path)
		quit(1)
	var template_name = str(params.template_name) if params.has("template_name") and str(params.template_name) != "" else "character_controller_2d"
	var is_3d = template_name == "character_controller_3d" or str(params.get("node_type", "")) == "CharacterBody3D"
	var body = instantiate_class("CharacterBody3D" if is_3d else "CharacterBody2D")
	body.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else ("CharacterController3D" if is_3d else "CharacterController2D")
	physics_apply_layers(body, params)
	if params.has("properties"):
		apply_properties_to_object(body, params.properties)
	parent.add_child(body)
	set_owner_recursive(body, scene_root)
	var shape_node = physics_add_collision_shape(body, scene_root, params, is_3d)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "create_character_controller_template",
		"scenePath": params.scene_path,
		"nodePath": find_tool_path_by_reference(scene_root, body, "root"),
		"shapePath": find_tool_path_by_reference(scene_root, shape_node, "root"),
		"nodeType": body.get_class()
	}))

func physics_collect_analysis(node, path, issues, area_positions):
	var has_collision_bits = object_has_property(node, "collision_layer") or object_has_property(node, "collision_mask")
	if has_collision_bits:
		var shapes = physics_collision_shape_summary(node)
		if shapes.is_empty():
			issues.append({"severity": "warning", "path": path, "type": "missing_shape", "message": "Physics object has no CollisionShape descendant"})
		if int(node.get("collision_layer")) == 0 and int(node.get("collision_mask")) == 0:
			issues.append({"severity": "warning", "path": path, "type": "inactive_collision", "message": "Physics object has both collision_layer and collision_mask set to 0"})
	if node is Area2D or node is Area3D:
		var position_key = str(node.global_position)
		if area_positions.has(position_key):
			issues.append({"severity": "warning", "path": path, "type": "overlapping_area", "message": "Area shares a global position with " + str(area_positions[position_key])})
		else:
			area_positions[position_key] = path
	if node is NavigationRegion2D and not node.navigation_polygon:
		issues.append({"severity": "warning", "path": path, "type": "navigation_break", "message": "NavigationRegion2D has no navigation polygon"})
	if node is NavigationRegion3D and not node.navigation_mesh:
		issues.append({"severity": "warning", "path": path, "type": "navigation_break", "message": "NavigationRegion3D has no navigation mesh"})
	for child in node.get_children():
		physics_collect_analysis(child, path + "/" + str(child.name), issues, area_positions)

func physics_analyze_scene(params, scene_root):
	var issues = []
	physics_collect_analysis(scene_root, "root", issues, {})
	print(JSON.stringify({
		"action": "analyze_scene_physics",
		"scenePath": params.scene_path,
		"ok": issues.is_empty(),
		"issues": issues,
		"summary": {
			"warnings": issues.size(),
			"errors": 0
		}
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

	if action == "get_collision_info":
		physics_get_collision_info(params, scene_root)
		return

	if action == "set_layers":
		physics_set_layers(params, scene_root, scene_data)
		return

	if action == "create_shape_resource":
		physics_create_shape_resource(params)
		return

	if action == "create_area_trigger_template":
		physics_create_area_trigger_template(params, scene_root, scene_data)
		return

	if action == "create_character_controller_template":
		physics_create_character_controller_template(params, scene_root, scene_data)
		return

	if action == "analyze_scene_physics":
		physics_analyze_scene(params, scene_root)
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
		physics_apply_shape_dimensions(node.shape, params)
	physics_apply_layers(node, params)
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

func navigation_position_from_json(value, is_3d):
	return vector3_from_json(value) if is_3d else vector2_from_json(value)

func navigation_region_is_3d(node):
	return node is NavigationRegion3D or node is NavigationAgent3D or node is NavigationObstacle3D

func navigation_configure_bake(params, scene_root, scene_data):
	if not params.has("node_path"):
		printerr("node_path is required")
		quit(1)
	var region_node = find_node_by_tool_path(scene_root, params.node_path)
	if not region_node:
		printerr("Failed to find navigation node: " + params.node_path)
		quit(1)
	if region_node is NavigationRegion3D:
		if not region_node.navigation_mesh:
			region_node.navigation_mesh = NavigationMesh.new()
		var mesh = region_node.navigation_mesh
		if params.has("agent_radius") and object_has_property(mesh, "agent_radius"):
			mesh.agent_radius = float(params.agent_radius)
		if params.has("cell_size") and object_has_property(mesh, "cell_size"):
			mesh.cell_size = float(params.cell_size)
		if params.has("cell_height") and object_has_property(mesh, "cell_height"):
			mesh.cell_height = float(params.cell_height)
		if params.has("properties"):
			apply_properties_to_object(mesh, params.properties)
	elif region_node is NavigationRegion2D:
		if not region_node.navigation_polygon:
			region_node.navigation_polygon = NavigationPolygon.new()
		if params.has("properties"):
			apply_properties_to_object(region_node.navigation_polygon, params.properties)
	else:
		printerr("configure_bake requires a NavigationRegion2D or NavigationRegion3D node: " + params.node_path)
		quit(1)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "configure_bake",
		"scenePath": params.scene_path,
		"nodePath": params.node_path,
		"nodeType": region_node.get_class()
	}))

func navigation_bake_mesh(params, scene_root, scene_data):
	if not params.has("node_path"):
		printerr("node_path is required")
		quit(1)
	var region_node = find_node_by_tool_path(scene_root, params.node_path)
	if not region_node:
		printerr("Failed to find navigation node: " + params.node_path)
		quit(1)
	var baked = false
	if region_node is NavigationRegion3D:
		if not region_node.navigation_mesh:
			region_node.navigation_mesh = NavigationMesh.new()
		if region_node.has_method("bake_navigation_mesh"):
			region_node.call("bake_navigation_mesh", false)
			baked = true
	elif region_node is NavigationRegion2D:
		baked = region_node.navigation_polygon != null
	else:
		printerr("bake_navigation_mesh requires a NavigationRegion2D or NavigationRegion3D node: " + params.node_path)
		quit(1)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "bake_navigation_mesh",
		"scenePath": params.scene_path,
		"nodePath": params.node_path,
		"nodeType": region_node.get_class(),
		"baked": baked
	}))

func navigation_query_path(params, scene_root):
	if not params.has("start_position") or not params.has("end_position"):
		printerr("start_position and end_position are required")
		quit(1)
	var query_node = scene_root
	if params.has("node_path") and str(params.node_path) != "":
		query_node = find_node_by_tool_path(scene_root, params.node_path)
		if not query_node:
			printerr("Failed to find navigation node: " + params.node_path)
			quit(1)
	var is_3d = navigation_region_is_3d(query_node)
	var start_position = navigation_position_from_json(params.start_position, is_3d)
	var end_position = navigation_position_from_json(params.end_position, is_3d)
	var path = [serialize_variant(start_position), serialize_variant(end_position)]
	print(JSON.stringify({
		"action": "query_path",
		"scenePath": params.scene_path,
		"nodePath": params.get("node_path", "root"),
		"dimension": "3d" if is_3d else "2d",
		"path": path,
		"pointCount": path.size()
	}))

func navigation_create_debug_geometry(params, scene_root, scene_data):
	var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
	if params.has("node_path") and str(params.node_path) != "":
		parent_path = str(params.node_path)
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find navigation debug parent node: " + parent_path)
		quit(1)
	var line = Line2D.new()
	line.name = str(params.debug_node_name) if params.has("debug_node_name") and str(params.debug_node_name) != "" else "NavigationDebugPath"
	var debug_points = PackedVector2Array()
	if params.has("points") and params.points is Array:
		for point in params.points:
			debug_points.append(vector2_from_json(point))
	elif params.has("start_position") and params.has("end_position"):
		debug_points.append(vector2_from_json(params.start_position))
		debug_points.append(vector2_from_json(params.end_position))
	line.points = debug_points
	line.width = float(params.get("width", 4.0))
	line.default_color = Color(0.1, 0.85, 0.35, 1.0)
	if params.has("properties"):
		apply_properties_to_object(line, params.properties)
	parent.add_child(line)
	set_owner_recursive(line, scene_root)
	pack_and_save_scene(scene_root, scene_data.path)
	print(JSON.stringify({
		"action": "create_debug_geometry",
		"scenePath": params.scene_path,
		"nodePath": find_tool_path_by_reference(scene_root, line, "root"),
		"pointCount": debug_points.size()
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

	if action == "configure_bake":
		navigation_configure_bake(params, scene_root, scene_data)
		return

	if action == "bake_navigation_mesh":
		navigation_bake_mesh(params, scene_root, scene_data)
		return

	if action == "query_path":
		navigation_query_path(params, scene_root)
		return

	if action == "create_debug_geometry":
		navigation_create_debug_geometry(params, scene_root, scene_data)
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

func audio_find_bus_index(params):
	var bus_name = str(params.bus) if params.has("bus") and str(params.bus) != "" else str(params.bus_name) if params.has("bus_name") and str(params.bus_name) != "" else str(params.name) if params.has("name") and str(params.name) != "" else "Master"
	var bus_index = AudioServer.get_bus_index(bus_name)
	if bus_index < 0:
		printerr("Audio bus not found: " + bus_name)
		quit(1)
	return bus_index

func audio_bus_summary():
	var buses = []
	for bus_index in range(AudioServer.get_bus_count()):
		var effects = []
		for effect_index in range(AudioServer.get_bus_effect_count(bus_index)):
			var effect = AudioServer.get_bus_effect(bus_index, effect_index)
			effects.append({"index": effect_index, "type": effect.get_class() if effect else "", "enabled": AudioServer.is_bus_effect_enabled(bus_index, effect_index)})
		buses.append({
			"index": bus_index,
			"name": AudioServer.get_bus_name(bus_index),
			"volumeDb": AudioServer.get_bus_volume_db(bus_index),
			"muted": AudioServer.is_bus_mute(bus_index),
			"solo": AudioServer.is_bus_solo(bus_index),
			"bypassEffects": AudioServer.is_bus_bypassing_effects(bus_index),
			"effects": effects
		})
	return buses

func audio_save_bus_layout(params):
	var layout_path = normalize_resource_path(str(params.layout_path) if params.has("layout_path") and str(params.layout_path) != "" else "default_bus_layout.tres")
	if AudioServer.has_method("generate_bus_layout"):
		var layout = AudioServer.call("generate_bus_layout")
		if layout:
			ResourceSaver.save(layout, layout_path)
			ProjectSettings.set_setting("audio/buses/default_bus_layout", layout_path)
			ProjectSettings.save()

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

	if action == "add_bus":
		var bus_name = str(params.bus_name) if params.has("bus_name") and str(params.bus_name) != "" else str(params.name) if params.has("name") and str(params.name) != "" else "Bus"
		var bus_index = AudioServer.get_bus_count()
		AudioServer.add_bus(bus_index)
		AudioServer.set_bus_name(bus_index, bus_name)
		if params.has("volume_db"):
			AudioServer.set_bus_volume_db(bus_index, float(params.volume_db))
		audio_save_bus_layout(params)
		print(JSON.stringify({"action": action, "busName": bus_name, "busIndex": bus_index, "audioBuses": audio_bus_summary()}))
		return

	if action == "add_bus_effect":
		var target_bus = audio_find_bus_index(params)
		var effect_type = str(params.effect_type) if params.has("effect_type") and str(params.effect_type) != "" else str(params.effect) if params.has("effect") and str(params.effect) != "" else "AudioEffectReverb"
		var effect = instantiate_class(effect_type)
		if not effect or not (effect is AudioEffect):
			printerr("Failed to create AudioEffect: " + effect_type)
			quit(1)
		if params.has("properties"):
			apply_properties_to_object(effect, params.properties)
		AudioServer.add_bus_effect(target_bus, effect, int(params.effect_index) if params.has("effect_index") else AudioServer.get_bus_effect_count(target_bus))
		audio_save_bus_layout(params)
		print(JSON.stringify({"action": action, "busIndex": target_bus, "effectType": effect.get_class(), "audioBuses": audio_bus_summary()}))
		return

	if action == "set_bus":
		var set_bus_index = audio_find_bus_index(params)
		if params.has("bus_name") or params.has("name"):
			AudioServer.set_bus_name(set_bus_index, str(params.bus_name) if params.has("bus_name") else str(params.name))
		if params.has("volume_db"):
			AudioServer.set_bus_volume_db(set_bus_index, float(params.volume_db))
		if params.has("mute"):
			AudioServer.set_bus_mute(set_bus_index, bool(params.mute))
		if params.has("solo"):
			AudioServer.set_bus_solo(set_bus_index, bool(params.solo))
		if params.has("bypass_effects"):
			AudioServer.set_bus_bypass_effects(set_bus_index, bool(params.bypass_effects))
		audio_save_bus_layout(params)
		print(JSON.stringify({"action": action, "busIndex": set_bus_index, "audioBuses": audio_bus_summary()}))
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

