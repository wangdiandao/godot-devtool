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

func ui_load_theme(params):
	if not params.has("theme_path"):
		printerr("theme_path is required")
		quit(1)
	var full_theme_path = normalize_resource_path(params.theme_path)
	var theme = load(full_theme_path) if ResourceLoader.exists(full_theme_path) else Theme.new()
	if not theme or not (theme is Theme):
		printerr("Failed to load Theme: " + str(params.theme_path))
		quit(1)
	return {"theme": theme, "path": full_theme_path}

func ui_theme_key(params, fallback_name):
	var key = str(params.key) if params.has("key") and str(params.key) != "" else str(params.name) if params.has("name") and str(params.name) != "" else fallback_name
	var parsed = ui_theme_type_and_name(key)
	if params.has("type_name") and str(params.type_name) != "":
		parsed.type = str(params.type_name)
	return parsed

func ui_edit_theme(params, action):
	var data = ui_load_theme(params)
	var theme = data.theme
	var parsed = ui_theme_key(params, "default")
	match action:
		"set_theme_color":
			theme.set_color(parsed.name, parsed.type, variant_from_json(params.color if params.has("color") else params.value))
		"set_theme_constant":
			theme.set_constant(parsed.name, parsed.type, int(params.constant if params.has("constant") else params.value))
		"set_theme_font_size":
			theme.set_font_size(parsed.name, parsed.type, int(params.font_size if params.has("font_size") else params.value))
		"set_theme_stylebox":
			theme.set_stylebox(parsed.name, parsed.type, ui_make_stylebox_flat(params.stylebox if params.has("stylebox") else params.value))
		_:
			printerr("Unsupported theme edit action: " + action)
			quit(1)
	var saved_path = save_resource_checked(theme, data.path)
	return {
		"action": action,
		"themePath": saved_path,
		"type": parsed.type,
		"name": parsed.name
	}

func ui_get_theme_info(params):
	var data = ui_load_theme(params)
	var theme = data.theme
	var info = {
		"themePath": data.path,
		"types": theme.get_type_list(),
		"colors": {},
		"constants": {},
		"fontSizes": {},
		"styleboxes": {}
	}
	for type_name in theme.get_type_list():
		var colors = []
		for item_name in theme.get_color_list(type_name):
			colors.append({"name": item_name, "value": serialize_variant(theme.get_color(item_name, type_name))})
		info.colors[type_name] = colors
		var constants = []
		for item_name in theme.get_constant_list(type_name):
			constants.append({"name": item_name, "value": theme.get_constant(item_name, type_name)})
		info.constants[type_name] = constants
		info.fontSizes[type_name] = theme.get_font_size_list(type_name)
		info.styleboxes[type_name] = theme.get_stylebox_list(type_name)
	return info

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

	if action == "set_theme_color" or action == "set_theme_constant" or action == "set_theme_font_size" or action == "set_theme_stylebox":
		print(JSON.stringify(ui_edit_theme(params, action)))
		return

	if action == "get_theme_info":
		print(JSON.stringify(ui_get_theme_info(params)))
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

