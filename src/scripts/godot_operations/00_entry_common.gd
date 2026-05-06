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

