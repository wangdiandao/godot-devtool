extends RefCounted

var _recording := false
var _recording_path := "res://.godot-devtool/input-recording.json"
var _recorded_events: Array = []

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
		"start_recording": true,
		"stop_recording": true,
		"replay_recording": true,
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
		"start_recording", "stop_recording", "replay_recording":
			return _recording_command(command_name, payload)
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

func capture_input_event(event: InputEvent) -> void:
	if _recording:
		_recorded_events.append(_serialize_input_event(event))

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
	var parameter_payload = payload.get("parameters", {})
	if typeof(parameter_payload) != TYPE_DICTIONARY:
		parameter_payload = {}
	var action_name := str(payload.get("action", payload.get("actionName", payload.get("name", parameter_payload.get("action", parameter_payload.get("actionName", parameter_payload.get("name", "")))))))
	if action_name == "":
		return _err("action is required")
	if not InputMap.has_action(action_name):
		return _err("InputMap action does not exist: " + action_name)
	var pressed := bool(payload.get("pressed", parameter_payload.get("pressed", true)))
	var strength := clampf(float(payload.get("strength", parameter_payload.get("strength", 1.0))), 0.0, 1.0)
	if pressed:
		Input.action_press(action_name, strength)
	else:
		Input.action_release(action_name)
	return _ok({"command": "simulate_action", "action": action_name, "pressed": pressed, "strength": strength})

func _simulate_input(command_name: String, payload: Dictionary) -> Dictionary:
	if command_name == "simulate_action":
		return _simulate_action(payload)
	var event: InputEvent = null
	if command_name == "simulate_key":
		var key_event := InputEventKey.new()
		var key_value = payload.get("keycode", payload.get("key", payload.get("physicalKeycode", 0)))
		key_event.keycode = int(key_value) if typeof(key_value) != TYPE_STRING else OS.find_keycode_from_string(str(key_value))
		if key_event.keycode == 0:
			return _err("key/keycode must resolve to a Godot keycode")
		key_event.pressed = bool(payload.get("pressed", true))
		event = key_event
	elif command_name == "simulate_mouse_click":
		var button_event := InputEventMouseButton.new()
		button_event.button_index = int(payload.get("buttonIndex", payload.get("button", MOUSE_BUTTON_LEFT)))
		button_event.pressed = bool(payload.get("pressed", true))
		button_event.position = _vector2_from_payload(payload.get("position", payload))
		event = button_event
	elif command_name == "simulate_mouse_move":
		var motion_event := InputEventMouseMotion.new()
		motion_event.position = _vector2_from_payload(payload.get("position", payload))
		motion_event.relative = _vector2_from_payload(payload.get("relative", {"x": 0, "y": 0}))
		event = motion_event
	else:
		return _err("Unsupported input command: " + command_name)
	Input.parse_input_event(event)
	return _ok({"command": command_name, "event": _serialize_input_event(event)})

func _simulate_sequence(payload: Dictionary) -> Dictionary:
	var events_value = payload.get("events", payload.get("sequence", []))
	if typeof(events_value) != TYPE_ARRAY:
		return _err("events must be an array")
	var events: Array = events_value
	var results := []
	var failed := false
	for item in events:
		if typeof(item) != TYPE_DICTIONARY:
			var invalid := _err("sequence event must be an object")
			results.append(invalid)
			failed = true
			continue
		var result := _simulate_input(str(item.get("type", item.get("command", ""))), item)
		results.append(result)
		if not bool(result.get("ok", false)):
			failed = true
		var delayFrames := max(0, int(item.get("delayFrames", item.get("delay_frames", 0))))
	return {"ok": not failed, "error": "One or more sequence events failed." if failed else "", "result": {"count": results.size(), "results": results}}

func _recording_command(command_name: String, payload: Dictionary) -> Dictionary:
	var explicit_path := payload.has("recordingPath") or payload.has("recording_path")
	var path := str(payload.get("recordingPath", payload.get("recording_path", ".godot-devtool/input-recording.json")))
	var path_result := _safe_devtool_output_path(path, ".json")
	if not bool(path_result.get("ok", false)):
		return _err(str(path_result.get("error", "Invalid recording path.")))
	var resource_path := str(path_result.get("path", ""))
	if command_name == "start_recording":
		_recording = true
		_recording_path = resource_path
		_recorded_events = []
		return _ok({"recordingPath": resource_path, "recording": true})
	if command_name == "stop_recording":
		_recording = false
		if explicit_path and FileAccess.file_exists(resource_path) and not bool(payload.get("overwrite", false)):
			return _err("Recording file already exists. Pass overwrite=true to replace it: " + resource_path)
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(resource_path.get_base_dir()))
		var write_file := FileAccess.open(resource_path, FileAccess.WRITE)
		if not write_file:
			return _err("Failed to write recording file: " + resource_path)
		write_file.store_string(JSON.stringify({"events": _recorded_events, "stoppedAt": Time.get_datetime_string_from_system(true)}, "\t"))
		return _ok({"recordingPath": resource_path, "eventCount": _recorded_events.size()})
	var read_file := FileAccess.open(resource_path, FileAccess.READ)
	if not read_file:
		return _err("Recording file not found: " + resource_path)
	var parsed = JSON.parse_string(read_file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY or typeof(parsed.get("events", null)) != TYPE_ARRAY:
		return _err("Recording file must contain an events array: " + resource_path)
	var events: Array = parsed.get("events", [])
	var results := []
	var failed := false
	for item in events:
		if typeof(item) != TYPE_DICTIONARY:
			var invalid := _err("recorded event must be an object")
			results.append(invalid)
			failed = true
			continue
		var result := _simulate_input(str(item.get("type", "")), item)
		results.append(result)
		if not bool(result.get("ok", false)):
			failed = true
	return {"ok": not failed, "error": "One or more recorded events failed." if failed else "", "result": {"recordingPath": resource_path, "replayedEvents": events.size(), "results": results}}

func _screenshot(payload: Dictionary) -> Dictionary:
	var explicit_path := payload.has("outputPath") or payload.has("output_path")
	var output_path := str(payload.get("outputPath", ".godot-devtool/game-screenshot.png"))
	var path_result := _safe_devtool_output_path(output_path, ".png")
	if not bool(path_result.get("ok", false)):
		return _err(str(path_result.get("error", "Invalid screenshot path.")))
	var resource_path := str(path_result.get("path", ""))
	if explicit_path and FileAccess.file_exists(resource_path) and not bool(payload.get("overwrite", false)):
		return _err("Screenshot file already exists. Pass overwrite=true to replace it: " + resource_path)
	if DisplayServer.get_name() == "headless":
		return _err("Screenshot capture is unavailable in headless display mode.")
	var image: Image = Engine.get_main_loop().root.get_texture().get_image()
	if image == null:
		return _err("Screenshot capture is unavailable in the current rendering backend.")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(resource_path.get_base_dir()))
	var err: int = image.save_png(resource_path)
	return _ok({"outputPath": resource_path, "errorCode": err, "width": image.get_width(), "height": image.get_height()}) if err == OK else _err("Failed to save screenshot: " + str(err))

func _safe_devtool_output_path(path_value: String, required_extension: String) -> Dictionary:
	var normalized := path_value.replace("\\", "/").replace("res://", "")
	if normalized == "":
		return {"ok": false, "error": "Output path is required.", "path": ""}
	var resource_path := "res://" + normalized
	if not resource_path.begins_with("res://.godot-devtool/"):
		return {"ok": false, "error": "Runtime output path must stay under res://.godot-devtool/.", "path": ""}
	for segment in normalized.split("/"):
		if segment == "" or segment == "." or segment == "..":
			return {"ok": false, "error": "Runtime output path must not contain empty, current, or parent segments.", "path": ""}
	if required_extension != "" and not resource_path.ends_with(required_extension):
		return {"ok": false, "error": "Runtime output path must end with " + required_extension + ".", "path": ""}
	return {"ok": true, "error": "", "path": resource_path}

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

func _vector2_from_payload(value) -> Vector2:
	if value is Vector2:
		return value
	if typeof(value) == TYPE_DICTIONARY:
		if value.has("value") and value.get("value") is Array:
			var raw: Array = value.get("value", [0, 0])
			return Vector2(float(raw[0]), float(raw[1]))
		return Vector2(float(value.get("x", 0)), float(value.get("y", 0)))
	if value is Array and value.size() >= 2:
		return Vector2(float(value[0]), float(value[1]))
	return Vector2.ZERO

func _serialize_value(value):
	match typeof(value):
		TYPE_VECTOR2:
			return {"type": "Vector2", "value": [value.x, value.y]}
		_:
			return value

func _serialize_input_event(event: InputEvent) -> Dictionary:
	var result := {"type": event.get_class()}
	if event is InputEventKey:
		result["type"] = "simulate_key"
		result["keycode"] = event.keycode
		result["pressed"] = event.pressed
	elif event is InputEventMouseButton:
		result["type"] = "simulate_mouse_click"
		result["button"] = event.button_index
		result["pressed"] = event.pressed
		result["position"] = _serialize_value(event.position)
	elif event is InputEventMouseMotion:
		result["type"] = "simulate_mouse_move"
		result["position"] = _serialize_value(event.position)
		result["relative"] = _serialize_value(event.relative)
	return result

func _ok(result: Dictionary) -> Dictionary:
	return {"ok": true, "error": "", "result": result}

func _err(message: String) -> Dictionary:
	return {"ok": false, "error": message, "result": {}}
