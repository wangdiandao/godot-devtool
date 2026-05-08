@tool
extends EditorPlugin

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const RUNTIME_STATE_PATH := "res://.godot-devtool/runtime-state.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const PLUGIN_VERSION := "2.6.4"
const HANDSHAKE_PROTOCOL_VERSION := 1
const HELLO_RETRY_INTERVAL_MS := 1000
const HEARTBEAT_INTERVAL_MS := 5000
const HEARTBEAT_STALE_MS := 15000

var _socket := WebSocketPeer.new()
var _router := CommandRouter.new()
var _bridge_url := "ws://127.0.0.1:8766"
var _auth_token := ""
var _connected := false
var _hello_acknowledged := false
var _last_connect_attempt_ms := 0
var _last_hello_ms := 0
var _last_heartbeat_sent_ms := 0
var _last_heartbeat_ms := 0
var _session_id := ""
var _dock: VBoxContainer
var _primary_status_label: Label
var _primary_status_dot: ColorRect
var _server_status_label: Label
var _server_status_dot: ColorRect
var _handshake_label: Label
var _handshake_status_dot: ColorRect
var _runtime_status_label: Label
var _runtime_status_dot: ColorRect
var _transport_label: Label
var _bridge_url_label: Label
var _last_command_label: Label
var _last_receipt_label: Label
var _last_error_label: Label
var _reconnect_button: Button
var _refresh_button: Button
var _last_command := ""
var _last_receipt_key := "none"
var _last_error := ""

func _enter_tree() -> void:
	_session_id = "editor-%s-%d" % [str(OS.get_process_id()), Time.get_ticks_msec()]
	_load_config()
	_create_status_dock()
	set_process(true)

func _exit_tree() -> void:
	set_process(false)
	if _dock:
		remove_control_from_docks(_dock)
		_dock.queue_free()
	_socket.close()

func _process(_delta: float) -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		if _connected:
			_reset_registration_state()
			_update_status_panel()
		_try_connect()
		return
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN and not _connected:
		_connected = true
		_update_status_panel()
	if state != WebSocketPeer.STATE_OPEN:
		if _connected:
			_reset_registration_state()
			_update_status_panel()
		return
	_maybe_send_hello()
	_maybe_send_heartbeat()
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())
	_update_status_panel()

func _create_status_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "GDT"
	_dock.custom_minimum_size = Vector2(280, 0)

	var title_row := HBoxContainer.new()
	_dock.add_child(title_row)

	var title := Label.new()
	title.text = "GDT"
	title.add_theme_font_size_override("font_size", 18)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title)

	var version_label := Label.new()
	version_label.text = "v%s" % PLUGIN_VERSION
	version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	title_row.add_child(version_label)

	var primary_row := _create_status_row(_dock, "", true)
	_primary_status_label = primary_row["label"]
	_primary_status_dot = primary_row["dot"]

	var connection_section := _create_status_section("connection_section")
	var server_row := _create_status_row(connection_section, "server_label", true)
	_server_status_label = server_row["label"]
	_server_status_dot = server_row["dot"]

	var editor_row := _create_status_row(connection_section, "editor_bridge_label", true)
	_handshake_label = editor_row["label"]
	_handshake_status_dot = editor_row["dot"]

	var runtime_row := _create_status_row(connection_section, "runtime_bridge_label", true)
	_runtime_status_label = runtime_row["label"]
	_runtime_status_dot = runtime_row["dot"]

	_transport_label = _create_status_label(connection_section, "transport_label")
	_bridge_url_label = _transport_label

	var activity_section := _create_status_section("activity_section")
	_last_command_label = _create_status_label(activity_section, "last_command_label")
	_last_receipt_label = _create_status_label(activity_section, "last_receipt_label")
	_last_error_label = _create_status_label(activity_section, "last_error_label")

	var button_row := HBoxContainer.new()
	button_row.add_theme_constant_override("separation", 8)
	_dock.add_child(button_row)

	_reconnect_button = Button.new()
	_reconnect_button.pressed.connect(_force_reconnect)
	_reconnect_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button_row.add_child(_reconnect_button)

	_refresh_button = Button.new()
	_refresh_button.pressed.connect(_refresh_status)
	_refresh_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button_row.add_child(_refresh_button)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	_update_status_panel()

func _create_status_section(title_key: String) -> VBoxContainer:
	var section := VBoxContainer.new()
	section.add_theme_constant_override("separation", 4)
	_dock.add_child(section)

	var title := Label.new()
	title.text = _ui_text(title_key).to_upper()
	title.add_theme_font_size_override("font_size", 11)
	section.add_child(title)
	return section

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
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if label_key != "":
		status_label.text = "%s: %s" % [_ui_text(label_key), _ui_text("none")]
	parent.add_child(status_label)
	return status_label

func _load_config() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		return
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if not file:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY:
		var port := int(parsed.get("port", parsed.get("websocketPort", 8766)))
		_bridge_url = str(parsed.get("url", "ws://127.0.0.1:%d" % port))
		_auth_token = str(parsed.get("authToken", parsed.get("auth_token", "")))

func _try_connect() -> void:
	var now := Time.get_ticks_msec()
	if now - _last_connect_attempt_ms < 1000:
		return
	_last_connect_attempt_ms = now
	_socket = WebSocketPeer.new()
	_socket.connect_to_url(_bridge_url)
	_update_status_panel()

func _force_reconnect() -> void:
	_reset_registration_state()
	_socket.close()
	_socket = WebSocketPeer.new()
	_last_connect_attempt_ms = 0
	_try_connect()
	_update_status_panel()

func _refresh_status() -> void:
	_load_config()
	if _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_last_connect_attempt_ms = 0
		_try_connect()
		return
	_socket.poll()
	_maybe_send_hello()
	_update_status_panel()

func _reset_registration_state() -> void:
	_connected = false
	_hello_acknowledged = false
	_last_hello_ms = 0
	_last_heartbeat_sent_ms = 0
	_last_heartbeat_ms = 0

func _maybe_send_hello() -> void:
	if _hello_acknowledged:
		return
	var now := Time.get_ticks_msec()
	if now - _last_hello_ms < HELLO_RETRY_INTERVAL_MS:
		return
	_last_hello_ms = now
	_send({
		"type": "hello",
		"context": "editor",
		"projectPath": ProjectSettings.globalize_path("res://"),
		"pluginVersion": PLUGIN_VERSION,
		"protocolVersion": HANDSHAKE_PROTOCOL_VERSION,
		"sessionId": _session_id,
		"authToken": _auth_token
	})

func _maybe_send_heartbeat() -> void:
	if not _hello_acknowledged:
		return
	var now := Time.get_ticks_msec()
	if now - _last_heartbeat_sent_ms < HEARTBEAT_INTERVAL_MS:
		return
	_last_heartbeat_sent_ms = now
	_send({
		"type": "heartbeat",
		"context": "editor",
		"projectPath": ProjectSettings.globalize_path("res://"),
		"sessionId": _session_id
	})

func _handle_packet(packet_text: String) -> void:
	var parsed = JSON.parse_string(packet_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var message: Dictionary = parsed
	var message_type := str(message.get("type", ""))
	if message_type == "hello_ack":
		_hello_acknowledged = true
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
	if message_type == "heartbeat_ack":
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
	if message_type != "command":
		return
	var command_id := str(message.get("commandId", ""))
	var command_name := str(message.get("command", message.get("route", "")))
	var payload_value = message.get("payload", {})
	var payload: Dictionary = payload_value if typeof(payload_value) == TYPE_DICTIONARY else {}
	var result: Dictionary = _router.dispatch_command(command_name, payload, self)
	var receipt_status := "completed" if bool(result.get("ok", false)) else "failed"
	var error_text := str(result.get("error", ""))
	_last_command = command_name
	_last_receipt_key = "receipt_completed" if receipt_status == "completed" else "receipt_failed"
	_last_error = error_text
	_update_status_panel()
	_send({
		"type": "receipt",
		"commandId": command_id,
		"context": "editor",
		"status": receipt_status,
		"error": error_text,
		"result": result.get("result", {})
	})

func _send(message: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	_socket.send_text(JSON.stringify(message))

func _update_status_panel() -> void:
	if not _primary_status_label:
		return
	var state := _socket.get_ready_state()
	var status_key := "status_disconnected"
	if state == WebSocketPeer.STATE_CONNECTING:
		status_key = "status_connecting"
	elif state == WebSocketPeer.STATE_OPEN:
		status_key = "status_connected"
	elif state == WebSocketPeer.STATE_CLOSING:
		status_key = "status_closing"
	_set_primary_status(status_key)
	_set_status_dot(_server_status_dot, "ok")
	_set_status_text(_server_status_label, "server_label", _ui_text("server_ready_stdio"))
	_set_status_dot(_handshake_status_dot, _editor_status_level())
	_set_status_text(_handshake_label, "handshake_label", _handshake_status_text())
	_set_status_dot(_runtime_status_dot, _runtime_status_level())
	_set_status_text(_runtime_status_label, "runtime_bridge_label", _runtime_status_text())
	_set_status_text(_transport_label, "transport_label", _bridge_url)
	_set_status_text(_last_command_label, "last_command_label", _last_command if _last_command != "" else _ui_text("none"))
	_set_status_text(_last_receipt_label, "last_receipt_label", _ui_text(_last_receipt_key))
	_set_status_text(_last_error_label, "last_error_label", _last_error if _last_error != "" else _ui_text("none"))
	if _reconnect_button:
		_reconnect_button.text = _ui_text("reconnect")
		_reconnect_button.tooltip_text = _ui_text("reconnect_tooltip")
	if _refresh_button:
		_refresh_button.text = _ui_text("refresh")
		_refresh_button.tooltip_text = _ui_text("refresh_tooltip")

func _handshake_status_text() -> String:
	if not _connected:
		return _ui_text("handshake_disconnected")
	if not _hello_acknowledged:
		return _ui_text("handshake_waiting")
	var age := Time.get_ticks_msec() - _last_heartbeat_ms
	if age > HEARTBEAT_STALE_MS:
		return _ui_text("handshake_stale")
	return _ui_text("handshake_registered")

func _set_primary_status(status_key: String) -> void:
	var primary_text := _ui_text("primary_disconnected")
	var level := "error"
	if status_key == "status_connecting":
		primary_text = _ui_text("primary_connecting")
		level = "warn"
	elif status_key == "status_connected":
		primary_text = _ui_text("primary_connected") if _hello_acknowledged else _ui_text("primary_waiting")
		level = "ok" if _hello_acknowledged else "warn"
	elif status_key == "status_closing":
		primary_text = _ui_text("primary_closing")
		level = "warn"
	_primary_status_label.text = primary_text
	_set_status_dot(_primary_status_dot, level)

func _editor_status_level() -> String:
	if not _connected:
		return "error"
	if not _hello_acknowledged:
		return "warn"
	var age := Time.get_ticks_msec() - _last_heartbeat_ms
	if age > HEARTBEAT_STALE_MS:
		return "warn"
	return "ok"

func _runtime_status_text() -> String:
	var state := _read_runtime_state()
	if not state.is_empty() and (bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false))):
		return _ui_text("runtime_connected")
	return _ui_text("runtime_waiting")

func _runtime_status_level() -> String:
	var state := _read_runtime_state()
	if not state.is_empty() and (bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false))):
		return "ok"
	return "warn"

func _read_runtime_state() -> Dictionary:
	if not FileAccess.file_exists(RUNTIME_STATE_PATH):
		return {}
	var file := FileAccess.open(RUNTIME_STATE_PATH, FileAccess.READ)
	if not file:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

func _set_status_dot(dot: ColorRect, level: String) -> void:
	if not dot:
		return
	match level:
		"ok":
			dot.color = Color(0.39, 0.82, 0.56)
		"warn":
			dot.color = Color(0.94, 0.78, 0.36)
		"error":
			dot.color = Color(1.0, 0.48, 0.45)
		_:
			dot.color = Color(0.55, 0.62, 0.72)

func _set_status_text(label: Label, label_key: String, value: String) -> void:
	label.text = "%s: %s" % [_ui_text(label_key), value]

func _ui_text(key: String) -> String:
	var zh := _uses_simplified_chinese()
	match key:
		"server_label":
			return "MCP \u670d\u52a1" if zh else "MCP Server"
		"editor_bridge_label":
			return "\u7f16\u8f91\u5668\u6865\u63a5" if zh else "Editor Bridge"
		"runtime_bridge_label":
			return "\u8fd0\u884c\u65f6\u6865\u63a5" if zh else "Runtime Bridge"
		"transport_label":
			return "\u4f20\u8f93" if zh else "Transport"
		"connection_section":
			return "\u8fde\u63a5" if zh else "Connection"
		"activity_section":
			return "\u6d3b\u52a8" if zh else "Activity"
		"server_ready_stdio":
			return "\u901a\u8fc7 stdio \u5c31\u7eea" if zh else "Ready via stdio"
		"handshake_label":
			return "\u63e1\u624b" if zh else "Handshake"
		"url_label":
			return "URL"
		"last_command_label":
			return "\u6700\u8fd1\u547d\u4ee4" if zh else "Last Command"
		"last_receipt_label":
			return "\u6700\u8fd1\u56de\u6267" if zh else "Last Receipt"
		"last_error_label":
			return "\u6700\u8fd1\u9519\u8bef" if zh else "Last Error"
		"status_disconnected":
			return "\u672a\u8fde\u63a5" if zh else "Disconnected"
		"status_connecting":
			return "\u8fde\u63a5\u4e2d" if zh else "Connecting"
		"status_connected":
			return "\u5df2\u8fde\u63a5" if zh else "Connected"
		"status_closing":
			return "\u6b63\u5728\u5173\u95ed" if zh else "Closing"
		"primary_disconnected":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u672a\u8fde\u63a5" if zh else "Editor bridge disconnected"
		"primary_connecting":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u8fde\u63a5\u4e2d" if zh else "Editor bridge connecting"
		"primary_connected":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u5df2\u6ce8\u518c" if zh else "Editor bridge registered"
		"primary_waiting":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u7b49\u5f85\u786e\u8ba4" if zh else "Editor bridge waiting for ack"
		"primary_closing":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u6b63\u5728\u5173\u95ed" if zh else "Editor bridge closing"
		"handshake_disconnected":
			return "\u672a\u6ce8\u518c" if zh else "Unregistered"
		"handshake_waiting":
			return "\u7b49\u5f85\u786e\u8ba4" if zh else "Waiting for ack"
		"handshake_registered":
			return "\u5df2\u6ce8\u518c" if zh else "Registered"
		"handshake_stale":
			return "\u5fc3\u8df3\u8fc7\u671f" if zh else "Heartbeat stale"
		"runtime_connected":
			return "\u5df2\u8fde\u63a5" if zh else "Connected"
		"runtime_waiting":
			return "\u7b49\u5f85\u6e38\u620f\u8fd0\u884c" if zh else "Waiting for game"
		"receipt_completed":
			return "\u5df2\u5b8c\u6210" if zh else "completed"
		"receipt_failed":
			return "\u5931\u8d25" if zh else "failed"
		"reconnect":
			return "\u91cd\u65b0\u8fde\u63a5" if zh else "Reconnect"
		"reconnect_tooltip":
			return "\u91cd\u65b0\u8fde\u63a5\u672c\u5730 godot-devtool bridge \u4f20\u8f93\u3002" if zh else "Reconnect the local godot-devtool bridge transport."
		"refresh":
			return "\u5237\u65b0\u72b6\u6001" if zh else "Refresh"
		"refresh_tooltip":
			return "\u7acb\u5373\u5237\u65b0 bridge \u4f20\u8f93\u3001\u63e1\u624b\u548c runtime \u72b6\u6001\u3002" if zh else "Refresh bridge transport, handshake, and runtime status immediately."
		"none":
			return "\u65e0" if zh else "None"
	return key

func _uses_simplified_chinese() -> bool:
	var locale_candidates := [TranslationServer.get_locale(), OS.get_locale()]
	var editor_settings: EditorSettings = get_editor_interface().get_editor_settings()
	if editor_settings:
		for setting_name in ["interface/editor/editor_language", "interface/editor/language"]:
			if editor_settings.has_setting(setting_name):
				locale_candidates.push_front(str(editor_settings.get_setting(setting_name)))
	for locale in locale_candidates:
		if _is_simplified_chinese_locale(str(locale)):
			return true
	return false

func _is_simplified_chinese_locale(locale: String) -> bool:
	var normalized_locale := locale.strip_edges().replace("-", "_").to_lower()
	if normalized_locale == "":
		return false
	if normalized_locale.begins_with("zh_tw") or normalized_locale.begins_with("zh_hk") or normalized_locale.begins_with("zh_mo") or normalized_locale.begins_with("zh_hant"):
		return false
	return normalized_locale == "zh" or normalized_locale.begins_with("zh_") or normalized_locale.begins_with("zh_cn") or normalized_locale.begins_with("zh_hans") or normalized_locale.begins_with("zh_sg")
