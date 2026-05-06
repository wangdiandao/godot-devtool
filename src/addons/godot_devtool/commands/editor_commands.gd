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
		"get_editor_screenshot": true
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
		undo.add_do_property(node, str(key), properties[key])
		undo.add_undo_property(node, str(key), node.get(str(key)))
	undo.commit_action()
	return _ok({"nodePath": str(node.get_path()), "changed": properties.keys()})

func _resolve_editor_node(payload: Dictionary, plugin: EditorPlugin) -> Node:
	var edited := plugin.get_editor_interface().get_edited_scene_root()
	if edited == null:
		var selected := plugin.get_editor_interface().get_selection().get_selected_nodes()
		return selected[0] if selected.size() > 0 else null
	var node_path := str(payload.get("nodePath", payload.get("node_path", "")))
	if node_path == "" or node_path == "root" or node_path == str(edited.name):
		return edited
	if node_path.begins_with("root/"):
		node_path = node_path.substr(5)
	return edited.get_node_or_null(NodePath(node_path))

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
