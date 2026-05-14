@tool
extends VBoxContainer

var labels := {}
var dots := {}
var buttons := {}
var _text: Callable

func setup(plugin_version: String, text_provider: Callable, reconnect: Callable, refresh: Callable) -> void:
	_text = text_provider
	name = "GDT"
	custom_minimum_size = Vector2(280, 0)
	add_theme_constant_override("separation", 8)

	var title_row := HBoxContainer.new()
	add_child(title_row)

	var title := Label.new()
	title.text = "GDT"
	title.add_theme_font_size_override("font_size", 18)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title)

	var version_label := Label.new()
	version_label.text = "v%s" % plugin_version
	version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	title_row.add_child(version_label)

	var primary_row := _create_status_row(self, "", true)
	labels["primary"] = primary_row["label"]
	dots["primary"] = primary_row["dot"]

	_add_row(self, "server", "server_label")
	_add_row(self, "editor", "editor_bridge_label")
	_add_row(self, "runtime", "runtime_bridge_label")
	_add_row(self, "connection_summary", "connection_summary_label")

	labels["current_scene"] = _create_status_label(self, "current_scene_label")
	var selection_label := _create_status_label(self, "selection_label")
	selection_label.visible = false
	labels["selection"] = selection_label
	var activity_label := _create_status_label(self, "activity_label")
	activity_label.visible = false
	labels["activity"] = activity_label

	var button_row := HBoxContainer.new()
	button_row.add_theme_constant_override("separation", 8)
	add_child(button_row)

	buttons["reconnect"] = _create_button(button_row, reconnect)
	buttons["refresh"] = _create_button(button_row, refresh)

func _add_row(parent: Control, id: String, label_key: String) -> void:
	var row := _create_status_row(parent, label_key, true)
	labels[id] = row["label"]
	dots[id] = row["dot"]

func _create_status_row(parent: Control, label_key: String, include_dot: bool) -> Dictionary:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	parent.add_child(row)

	var dot: ColorRect = null
	if include_dot:
		dot = _create_status_dot()
		row.add_child(dot)

	var status_label := _create_status_label(row, label_key)
	return {"label": status_label, "dot": dot}

func _create_status_dot() -> ColorRect:
	var dot := ColorRect.new()
	dot.custom_minimum_size = Vector2(9, 9)
	dot.color = Color(0.55, 0.62, 0.72)
	return dot

func _create_status_label(parent: Control, label_key: String) -> Label:
	var status_label := Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if label_key != "":
		status_label.text = "%s: %s" % [_ui_text(label_key), _ui_text("none")]
	parent.add_child(status_label)
	return status_label

func _create_button(parent: Control, callback: Callable) -> Button:
	var button := Button.new()
	button.pressed.connect(callback)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(button)
	return button

func _ui_text(key: String) -> String:
	return str(_text.call(key))
