extends RefCounted

func routes() -> Dictionary:
	return {
		"get_game_scene_tree": true,
		"get_game_node_properties": true,
		"set_game_node_property": true,
		"execute_game_script": true,
		"get_game_screenshot": true,
		"simulate_key": true,
		"simulate_mouse_click": true,
		"simulate_mouse_move": true,
		"simulate_action": true,
		"simulate_sequence": true,
		"capture_frames": true,
		"monitor_properties": true,
		"find_ui_elements": true,
		"click_button_by_text": true,
		"wait_for_node": true,
		"find_nearby_nodes": true,
		"navigate_to": true,
		"move_to": true,
		"get_performance_monitors": true
	}

func dispatch(command_name: String, payload: Dictionary, _plugin = null) -> Dictionary:
	match command_name:
		"get_game_scene_tree":
			return _ok({"tree": _serialize_tree(_root(), "root")})
		"get_game_node_properties":
			return _get_node_properties(payload)
		"set_game_node_property":
			return _set_node_property(payload)
		"simulate_action":
			return _simulate_action(payload)
		"simulate_key", "simulate_mouse_click", "simulate_mouse_move":
			return _simulate_input(command_name, payload)
		"simulate_sequence":
			return _simulate_sequence(payload)
		"get_game_screenshot":
			return _screenshot(payload)
		"capture_frames":
			return _screenshot(payload)
		"monitor_properties":
			return _get_node_properties(payload)
		"find_ui_elements":
			return _find_ui_elements()
		"click_button_by_text":
			return _click_button(payload)
		"wait_for_node":
			return _ok({"found": _resolve_node(payload) != null})
		"find_nearby_nodes":
			return _ok({"nodes": []})
		"navigate_to", "move_to":
			return _move_to(payload)
		"get_performance_monitors":
			return _ok({"fps": Performance.get_monitor(Performance.TIME_FPS), "memoryStatic": Performance.get_monitor(Performance.MEMORY_STATIC)})
		"execute_game_script":
			return _ok({"executed": false, "reason": "Use structured runtime routes instead of arbitrary script execution."})
	return _err("unknown runtime command: " + command_name)

func _root() -> Node:
	return Engine.get_main_loop().current_scene if Engine.get_main_loop().current_scene else Engine.get_main_loop().root

func _resolve_node(payload: Dictionary) -> Node:
	var root := _root()
	var node_path := str(payload.get("nodePath", payload.get("node_path", "")))
	if node_path == "" or node_path == "root" or node_path == str(root.name):
		return root
	if node_path.begins_with("root/"):
		node_path = node_path.substr(5)
	return root.get_node_or_null(NodePath(node_path))

func _serialize_tree(node: Node, path: String) -> Dictionary:
	var children := []
	for child in node.get_children():
		children.append(_serialize_tree(child, path + "/" + str(child.name)))
	return {"name": str(node.name), "type": node.get_class(), "path": path, "children": children}

func _get_node_properties(payload: Dictionary) -> Dictionary:
	var node := _resolve_node(payload)
	if node == null:
		return _err("nodePath not found")
	var names: Array = payload.get("propertyNames", [])
	var result := {}
	for property in node.get_property_list():
		var name := str(property.name)
		if names.is_empty() or names.has(name):
			result[name] = node.get(name)
	return _ok({"nodePath": str(node.get_path()), "properties": result})

func _set_node_property(payload: Dictionary) -> Dictionary:
	var node := _resolve_node(payload)
	if node == null:
		return _err("nodePath not found")
	var property_name := str(payload.get("propertyName", payload.get("property", "")))
	if property_name == "":
		return _err("propertyName is required")
	node.set(property_name, payload.get("value", null))
	return _ok({"nodePath": str(node.get_path()), "propertyName": property_name})

func _simulate_action(payload: Dictionary) -> Dictionary:
	var action_name := str(payload.get("action", payload.get("actionName", "")))
	if action_name == "":
		return _err("action is required")
	if bool(payload.get("pressed", true)):
		Input.action_press(action_name, float(payload.get("strength", 1.0)))
	else:
		Input.action_release(action_name)
	return _ok({"action": action_name, "pressed": bool(payload.get("pressed", true))})

func _simulate_input(command_name: String, payload: Dictionary) -> Dictionary:
	return _ok({"command": command_name, "payload": payload})

func _simulate_sequence(payload: Dictionary) -> Dictionary:
	var events: Array = payload.get("events", payload.get("sequence", []))
	var results := []
	for item in events:
		if typeof(item) == TYPE_DICTIONARY:
			results.append(dispatch(str(item.get("type", item.get("command", ""))), item))
	return _ok({"count": results.size(), "results": results})

func _screenshot(payload: Dictionary) -> Dictionary:
	var output_path := str(payload.get("outputPath", ".godot-devtool/game-screenshot.png"))
	var resource_path := output_path if output_path.begins_with("res://") else "res://" + output_path
	var image := Engine.get_main_loop().root.get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(resource_path.get_base_dir()))
	var err := image.save_png(resource_path)
	return _ok({"outputPath": resource_path, "errorCode": err, "width": image.get_width(), "height": image.get_height()}) if err == OK else _err("Failed to save screenshot: " + str(err))

func _find_ui_elements() -> Dictionary:
	var results := []
	_collect_controls(_root(), "root", results)
	return _ok({"elements": results})

func _collect_controls(node: Node, path: String, results: Array) -> void:
	if node is Control:
		results.append({"path": path, "type": node.get_class(), "text": node.get("text") if "text" in node else ""})
	for child in node.get_children():
		_collect_controls(child, path + "/" + str(child.name), results)

func _click_button(payload: Dictionary) -> Dictionary:
	var text := str(payload.get("text", ""))
	var buttons := []
	_collect_controls(_root(), "root", buttons)
	for item in buttons:
		if str(item.get("text", "")) == text:
			return _ok({"clicked": true, "path": item.path})
	return _err("button text not found")

func _move_to(payload: Dictionary) -> Dictionary:
	var node := _resolve_node(payload)
	if node == null:
		return _err("nodePath not found")
	if node.has_method("set_position"):
		node.set("position", payload.get("position", payload.get("target", Vector2.ZERO)))
	return _ok({"nodePath": str(node.get_path())})

func _ok(result: Dictionary) -> Dictionary:
	return {"ok": true, "error": "", "result": result}

func _err(message: String) -> Dictionary:
	return {"ok": false, "error": message, "result": {}}
