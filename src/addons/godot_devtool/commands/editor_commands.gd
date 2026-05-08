@tool
extends RefCounted

func routes() -> Dictionary:
	return {
		"plugin_reload": true,
		"reload_plugin": true,
		"editor_get_selection": true,
		"select_node": true,
		"editor_select_node": true,
		"undo": true,
		"redo": true,
		"inspector_get_properties": true,
		"inspector_set_properties": true,
		"execute_editor_script": true,
		"get_editor_screenshot": true,
		"get_open_scripts": true,
		"reload_project": true,
		"get_editor_performance": true,
		"editor_add_node": true,
		"editor_delete_node": true,
		"editor_rename_node": true,
		"editor_move_node": true,
		"editor_duplicate_node": true,
		"editor_save_scene": true
	}

func dispatch(command_name: String, payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	match command_name:
		"plugin_reload", "reload_plugin":
			return _ok({"reloaded": true})
		"editor_get_selection":
			return _ok(_selection(plugin))
		"select_node", "editor_select_node":
			return _select_node(payload, plugin)
		"undo":
			plugin.get_undo_redo().undo()
			return _ok({"action": "undo"})
		"redo":
			plugin.get_undo_redo().redo()
			return _ok({"action": "redo"})
		"inspector_get_properties":
			return _get_properties(payload, plugin)
		"inspector_set_properties":
			return _set_properties(payload, plugin)
		"execute_editor_script":
			return _ok({"executed": false, "reason": "Use structured routes instead of arbitrary editor script execution."})
		"get_editor_screenshot":
			return _ok({"available": false, "reason": "Editor screenshot capture is not exposed by Godot editor API in headless mode."})
		"get_open_scripts":
			return _get_open_scripts(plugin)
		"reload_project":
			return _reload_project(plugin)
		"get_editor_performance":
			return _get_editor_performance()
		"editor_add_node":
			return _editor_add_node(payload, plugin)
		"editor_delete_node":
			return _editor_delete_node(payload, plugin)
		"editor_rename_node":
			return _editor_rename_node(payload, plugin)
		"editor_move_node":
			return _editor_move_node(payload, plugin)
		"editor_duplicate_node":
			return _editor_duplicate_node(payload, plugin)
		"editor_save_scene":
			return _editor_save_scene(payload, plugin)
	return _err("unknown editor command: " + command_name)

func _selection(plugin: EditorPlugin) -> Dictionary:
	var selected := []
	for node in plugin.get_editor_interface().get_selection().get_selected_nodes():
		selected.append(str(node.get_path()))
	return {"selection": selected}

func _select_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node := _resolve_editor_node(payload, plugin)
	if node == null:
		return _err("nodePath not found")
	plugin.get_editor_interface().get_selection().clear()
	plugin.get_editor_interface().get_selection().add_node(node)
	return _ok({"selected": str(node.get_path())})

func _get_properties(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node := _resolve_editor_node(payload, plugin)
	if node == null:
		return _err("nodePath not found")
	var requested: Array = payload.get("propertyNames", [])
	var values := {}
	for property in node.get_property_list():
		var name := str(property.name)
		if requested.is_empty() or requested.has(name):
			values[name] = _serialize(node.get(name))
	return _ok({"nodePath": str(node.get_path()), "properties": values})

func _set_properties(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node := _resolve_editor_node(payload, plugin)
	if node == null:
		return _err("nodePath not found")
	var properties: Dictionary = payload.get("properties", {})
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool set inspector properties")
	for key in properties.keys():
		undo.add_do_property(node, str(key), _value_from_json(properties[key]))
		undo.add_undo_property(node, str(key), node.get(str(key)))
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({"nodePath": str(node.get_path()), "changed": properties.keys()}, payload, plugin)

func _editor_add_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var scene_result := _edited_scene_result(payload, plugin)
	if not bool(scene_result.get("ok", false)):
		return scene_result
	var parent_result := _resolve_parent_node_result(payload, plugin)
	if not bool(parent_result.get("ok", false)):
		return parent_result
	var scene: Node = scene_result.get("scene")
	var parent: Node = parent_result.get("node")
	var node_type := str(payload.get("nodeType", payload.get("node_type", "")))
	var node_name := str(payload.get("nodeName", payload.get("node_name", "")))
	if node_type == "" or node_name == "":
		return _err("nodeType and nodeName are required")
	var instance = ClassDB.instantiate(node_type)
	if instance == null or not (instance is Node):
		return _err("nodeType is not a valid Node class: " + node_type)
	var node: Node = instance
	node.name = node_name
	var properties: Dictionary = payload.get("properties", {})
	for key in properties.keys():
		node.set(str(key), _value_from_json(properties[key]))
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool add node")
	undo.add_do_method(parent, "add_child", node)
	undo.add_do_method(self, "_set_owner_recursive", node, scene)
	undo.add_undo_method(parent, "remove_child", node)
	undo.add_undo_method(self, "_set_owner_recursive", node, null)
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({
		"nodePath": str(node.get_path()),
		"nodeName": str(node.name),
		"nodeType": node.get_class(),
		"parentPath": str(parent.get_path())
	}, payload, plugin)

func _editor_delete_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node_result := _resolve_editor_node_result(payload, plugin)
	if not bool(node_result.get("ok", false)):
		return node_result
	var scene: Node = node_result.get("scene")
	var node: Node = node_result.get("node")
	if node == scene:
		return _err("Cannot delete the edited scene root")
	var parent := node.get_parent()
	if parent == null:
		return _err("Cannot delete a node without a parent")
	var previous_owner := node.owner
	var previous_index := node.get_index()
	var previous_path := str(node.get_path())
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool delete node")
	undo.add_do_method(parent, "remove_child", node)
	undo.add_do_method(self, "_set_owner_recursive", node, null)
	undo.add_undo_method(parent, "add_child", node)
	undo.add_undo_method(parent, "move_child", node, previous_index)
	undo.add_undo_method(self, "_set_owner_recursive", node, previous_owner)
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({
		"nodePath": previous_path,
		"parentPath": str(parent.get_path()),
		"deleted": true
	}, payload, plugin)

func _editor_rename_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node_result := _resolve_editor_node_result(payload, plugin)
	if not bool(node_result.get("ok", false)):
		return node_result
	var node: Node = node_result.get("node")
	var new_name := str(payload.get("newName", payload.get("new_name", "")))
	if new_name == "":
		return _err("newName is required")
	var old_name := str(node.name)
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool rename node")
	undo.add_do_property(node, "name", new_name)
	undo.add_undo_property(node, "name", old_name)
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({
		"nodePath": str(node.get_path()),
		"oldName": old_name,
		"newName": str(node.name)
	}, payload, plugin)

func _editor_move_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node_result := _resolve_editor_node_result(payload, plugin)
	if not bool(node_result.get("ok", false)):
		return node_result
	var scene: Node = node_result.get("scene")
	var node: Node = node_result.get("node")
	if node == scene:
		return _err("Cannot reparent the edited scene root")
	if not payload.has("position") and str(payload.get("parentNodePath", payload.get("parent_node_path", ""))) == "":
		return _err("position or parentNodePath is required")
	var old_parent := node.get_parent()
	if old_parent == null:
		return _err("Cannot move a node without a parent")
	var old_index := node.get_index()
	var old_owner := node.owner
	var has_position := _node_has_property(node, "position")
	if payload.has("position") and not has_position:
		return _err("The selected node does not expose a position property")
	var old_position = node.get("position") if has_position else null
	var new_parent: Node = old_parent
	var parent_path := str(payload.get("parentNodePath", payload.get("parent_node_path", "")))
	if parent_path != "":
		var parent_payload := payload.duplicate()
		parent_payload["nodePath"] = parent_path
		var parent_result := _resolve_editor_node_result(parent_payload, plugin)
		if not bool(parent_result.get("ok", false)):
			return parent_result
		new_parent = parent_result.get("node")
		if _is_descendant_or_same(new_parent, node):
			return _err("Cannot reparent a node under itself or its descendants")
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool move node")
	if new_parent != old_parent:
		undo.add_do_method(old_parent, "remove_child", node)
		undo.add_do_method(new_parent, "add_child", node)
		undo.add_do_method(self, "_set_owner_recursive", node, scene)
	if payload.has("position"):
		undo.add_do_property(node, "position", _value_from_json(payload.get("position")))
	if new_parent != old_parent:
		undo.add_undo_method(new_parent, "remove_child", node)
		undo.add_undo_method(old_parent, "add_child", node)
		undo.add_undo_method(old_parent, "move_child", node, old_index)
		undo.add_undo_method(self, "_set_owner_recursive", node, old_owner)
	if payload.has("position") and has_position:
		undo.add_undo_property(node, "position", old_position)
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({
		"nodePath": str(node.get_path()),
		"parentPath": str(node.get_parent().get_path()) if node.get_parent() else "",
		"position": _serialize(node.get("position")) if _node_has_property(node, "position") else null
	}, payload, plugin)

func _editor_duplicate_node(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var node_result := _resolve_editor_node_result(payload, plugin)
	if not bool(node_result.get("ok", false)):
		return node_result
	var scene: Node = node_result.get("scene")
	var source: Node = node_result.get("node")
	var parent: Node = source.get_parent()
	var parent_path := str(payload.get("parentNodePath", payload.get("parent_node_path", "")))
	if parent_path != "":
		var parent_payload := payload.duplicate()
		parent_payload["nodePath"] = parent_path
		var parent_result := _resolve_editor_node_result(parent_payload, plugin)
		if not bool(parent_result.get("ok", false)):
			return parent_result
		parent = parent_result.get("node")
	if parent == null:
		return _err("Duplicate parent not found")
	var duplicate = source.duplicate()
	if duplicate == null or not (duplicate is Node):
		return _err("Failed to duplicate node")
	var duplicate_node: Node = duplicate
	var new_name := str(payload.get("newName", payload.get("new_name", "")))
	duplicate_node.name = new_name if new_name != "" else str(source.name) + "Copy"
	var undo := plugin.get_undo_redo()
	undo.create_action("godot-devtool duplicate node")
	undo.add_do_method(parent, "add_child", duplicate_node)
	undo.add_do_method(self, "_set_owner_recursive", duplicate_node, scene)
	undo.add_undo_method(parent, "remove_child", duplicate_node)
	undo.add_undo_method(self, "_set_owner_recursive", duplicate_node, null)
	undo.commit_action()
	_mark_scene_unsaved(plugin)
	return _with_optional_save({
		"sourceNodePath": str(source.get_path()),
		"nodePath": str(duplicate_node.get_path()),
		"duplicateName": str(duplicate_node.name),
		"parentPath": str(parent.get_path())
	}, payload, plugin)

func _editor_save_scene(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var scene_result := _edited_scene_result(payload, plugin)
	if not bool(scene_result.get("ok", false)):
		return scene_result
	var scene: Node = scene_result.get("scene")
	var error = plugin.get_editor_interface().save_scene()
	if error != OK:
		return _err("Failed to save editor scene: " + str(error))
	return _ok({"saved": true, "scenePath": scene.scene_file_path})

func _get_open_scripts(plugin: EditorPlugin) -> Dictionary:
	var script_editor := plugin.get_editor_interface().get_script_editor()
	var open_scripts := []
	var current_script_path := ""
	if script_editor != null and script_editor.has_method("get_open_scripts"):
		for script in script_editor.get_open_scripts():
			if script == null:
				continue
			var script_path := ""
			var script_name := ""
			if script is Resource:
				script_path = script.resource_path
				script_name = script.resource_name
			open_scripts.append({
				"path": script_path,
				"name": script_name,
				"type": script.get_class()
			})
	if script_editor != null and script_editor.has_method("get_current_script"):
		var current_script = script_editor.get_current_script()
		if current_script is Resource:
			current_script_path = current_script.resource_path
	return _ok({
		"openScripts": open_scripts,
		"count": open_scripts.size(),
		"currentScript": current_script_path
	})

func _reload_project(plugin: EditorPlugin) -> Dictionary:
	var filesystem = plugin.get_editor_interface().get_resource_filesystem() if plugin else null
	if filesystem:
		filesystem.scan()
	return _ok({"rescanned": filesystem != null})

func _get_editor_performance() -> Dictionary:
	return _ok({
		"monitors": {
			"fps": Performance.get_monitor(Performance.TIME_FPS),
			"processTime": Performance.get_monitor(Performance.TIME_PROCESS),
			"physicsProcessTime": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),
			"staticMemory": Performance.get_monitor(Performance.MEMORY_STATIC),
			"objectCount": Performance.get_monitor(Performance.OBJECT_COUNT),
			"resourceCount": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)
		}
	})

func _edited_scene_result(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	if plugin == null:
		return _err("Editor plugin is not available")
	var edited := plugin.get_editor_interface().get_edited_scene_root()
	if edited == null:
		return _err("No edited scene root is available")
	var expected_path := _normalize_scene_path(str(payload.get("scenePath", payload.get("scene_path", ""))))
	if expected_path != "":
		if edited.scene_file_path == "":
			return _err("The edited scene has not been saved yet, so it cannot be matched against scenePath")
		if edited.scene_file_path != expected_path:
			return _err("Open editor scene does not match scenePath. Current: " + edited.scene_file_path + ", requested: " + expected_path)
	return {"ok": true, "error": "", "result": {}, "scene": edited}

func _resolve_parent_node_result(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var parent_path := str(payload.get("parentNodePath", payload.get("parent_node_path", "")))
	if parent_path == "":
		parent_path = "root"
	var parent_payload := payload.duplicate()
	parent_payload["nodePath"] = parent_path
	return _resolve_editor_node_result(parent_payload, plugin)

func _resolve_editor_node_result(payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	var scene_result := _edited_scene_result(payload, plugin)
	if not bool(scene_result.get("ok", false)):
		return scene_result
	var edited: Node = scene_result.get("scene")
	var node_path := str(payload.get("nodePath", payload.get("node_path", "")))
	if node_path == "" or node_path == "root" or node_path == str(edited.name) or node_path == str(edited.get_path()):
		return {"ok": true, "error": "", "result": {}, "scene": edited, "node": edited}
	var edited_path := str(edited.get_path())
	if node_path.begins_with(edited_path + "/"):
		node_path = node_path.substr(edited_path.length() + 1)
	if node_path.begins_with("root/"):
		node_path = node_path.substr(5)
	if node_path.begins_with(str(edited.name) + "/"):
		node_path = node_path.substr(str(edited.name).length() + 1)
	if node_path.begins_with("/"):
		var root_named_path := "/" + str(edited.name) + "/"
		var root_named_index := node_path.find(root_named_path)
		if root_named_index >= 0:
			node_path = node_path.substr(root_named_index + root_named_path.length())
	var node := edited.get_node_or_null(NodePath(node_path))
	if node == null:
		return _err("nodePath not found: " + str(payload.get("nodePath", payload.get("node_path", ""))))
	return {"ok": true, "error": "", "result": {}, "scene": edited, "node": node}

func _resolve_editor_node(payload: Dictionary, plugin: EditorPlugin) -> Node:
	var result := _resolve_editor_node_result(payload, plugin)
	if bool(result.get("ok", false)):
		return result.get("node")
	return null

func _normalize_scene_path(scene_path: String) -> String:
	if scene_path == "":
		return ""
	if scene_path.begins_with("res://"):
		return scene_path
	return "res://" + scene_path

func _is_descendant_or_same(candidate: Node, node: Node) -> bool:
	var current := candidate
	while current != null:
		if current == node:
			return true
		current = current.get_parent()
	return false

func _node_has_property(node: Node, property_name: String) -> bool:
	for property in node.get_property_list():
		if str(property.get("name", "")) == property_name:
			return true
	return false

func _set_owner_recursive(node: Node, owner: Node) -> void:
	if node == null:
		return
	node.owner = owner
	for child in node.get_children():
		_set_owner_recursive(child, owner)

func _mark_scene_unsaved(plugin: EditorPlugin) -> void:
	if plugin != null and plugin.get_editor_interface().has_method("mark_scene_as_unsaved"):
		plugin.get_editor_interface().mark_scene_as_unsaved()

func _with_optional_save(result: Dictionary, payload: Dictionary, plugin: EditorPlugin) -> Dictionary:
	if bool(payload.get("autoSave", false)):
		var save_result := _editor_save_scene(payload, plugin)
		if not bool(save_result.get("ok", false)):
			return save_result
		result["save"] = save_result.get("result", {})
	else:
		result["save"] = {"saved": false}
	return _ok(result)

func _value_from_json(value):
	if typeof(value) != TYPE_DICTIONARY:
		return value
	var typed: Dictionary = value
	if not typed.has("type") or not typed.has("value"):
		return value
	var raw = typed.get("value")
	match str(typed.get("type")):
		"Vector2":
			return Vector2(float(raw[0]), float(raw[1]))
		"Vector2i":
			return Vector2i(int(raw[0]), int(raw[1]))
		"Vector3":
			return Vector3(float(raw[0]), float(raw[1]), float(raw[2]))
		"Vector3i":
			return Vector3i(int(raw[0]), int(raw[1]), int(raw[2]))
		"Color":
			return Color(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3] if raw.size() > 3 else 1.0))
		"Rect2":
			return Rect2(Vector2(float(raw[0]), float(raw[1])), Vector2(float(raw[2]), float(raw[3])))
		"StringName":
			return StringName(str(raw))
		"NodePath":
			return NodePath(str(raw))
	return value

func _serialize(value):
	match typeof(value):
		TYPE_VECTOR2:
			return {"type": "Vector2", "value": [value.x, value.y]}
		TYPE_VECTOR3:
			return {"type": "Vector3", "value": [value.x, value.y, value.z]}
		TYPE_COLOR:
			return {"type": "Color", "value": [value.r, value.g, value.b, value.a]}
		TYPE_OBJECT:
			return str(value)
	return value

func _ok(result: Dictionary) -> Dictionary:
	return {"ok": true, "error": "", "result": result}

func _err(message: String) -> Dictionary:
	return {"ok": false, "error": message, "result": {}}
