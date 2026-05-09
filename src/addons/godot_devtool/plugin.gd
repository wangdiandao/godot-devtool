@tool
extends EditorPlugin

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const RUNTIME_STATE_PATH := "res://.godot-devtool/runtime-state.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const PLUGIN_VERSION := "2.8.0"
const HANDSHAKE_PROTOCOL_VERSION := 1
const HELLO_RETRY_INTERVAL_MS := 1000
const HEARTBEAT_INTERVAL_MS := 5000
const HEARTBEAT_STALE_MS := 15000
const STATUS_REFRESH_INTERVAL_MS := 500

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
var _live_editor_scene_label: Label
var _live_editor_selection_label: Label
var _live_editor_status_label: Label
var _live_editor_save_mode_label: Label
var _runtime_game_label: Label
var _runtime_session_label: Label
var _runtime_last_seen_label: Label
var _last_command_label: Label
var _last_receipt_label: Label
var _last_error_label: Label
var _reconnect_button: Button
var _refresh_button: Button
var _last_command := ""
var _last_receipt_key := "none"
var _last_error := ""
var _last_status_update_ms := 0

func _enter_tree() -> void:
	_session_id = "editor-%s-%d" % [str(OS.get_process_id()), Time.get_ticks_msec()]
	_load_config()
	_try_connect()
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
	_update_status_panel_if_due()

func _create_status_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "GDT"
	_dock.custom_minimum_size = Vector2(320, 0)
	_dock.add_theme_constant_override("separation", 10)

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

	var live_editor_section := _create_status_section("live_editor_section")
	_live_editor_scene_label = _create_status_label(live_editor_section, "current_scene_label")
	_live_editor_selection_label = _create_status_label(live_editor_section, "selection_label")
	_live_editor_status_label = _create_status_label(live_editor_section, "live_edits_label")
	_live_editor_save_mode_label = _create_status_label(live_editor_section, "save_mode_label")

	var runtime_section := _create_status_section("runtime_section")
	_runtime_game_label = _create_status_label(runtime_section, "runtime_game_label")
	_runtime_session_label = _create_status_label(runtime_section, "runtime_session_label")
	_runtime_last_seen_label = _create_status_label(runtime_section, "runtime_last_seen_label")

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
	if _last_connect_attempt_ms > 0 and now - _last_connect_attempt_ms < 1000:
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
	if receipt_status == "completed" and command_name == "editor_save_scene":
		_last_receipt_key = "receipt_saved"
	elif receipt_status == "completed" and command_name.begins_with("editor_"):
		_last_receipt_key = "receipt_live_editor"
	else:
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

func _update_status_panel_if_due() -> void:
	var now := Time.get_ticks_msec()
	if _last_status_update_ms > 0 and now - _last_status_update_ms < STATUS_REFRESH_INTERVAL_MS:
		return
	_update_status_panel()

func _update_status_panel() -> void:
	if not _primary_status_label:
		return
	_last_status_update_ms = Time.get_ticks_msec()
	var runtime_state := _read_runtime_state()
	_set_primary_status()
	_set_status_dot(_server_status_dot, "ok")
	_set_status_text(_server_status_label, "server_label", _ui_text("server_ready_stdio"))
	_set_status_dot(_handshake_status_dot, _editor_status_level())
	_set_status_text(_handshake_label, "handshake_label", _handshake_status_text())
	_set_status_dot(_runtime_status_dot, _runtime_bridge_level(runtime_state))
	_set_status_text(_runtime_status_label, "runtime_bridge_label", _runtime_bridge_text(runtime_state))
	_set_status_text(_transport_label, "transport_label", _bridge_url)
	_set_status_text(_live_editor_scene_label, "current_scene_label", _current_scene_text())
	_set_status_text(_live_editor_selection_label, "selection_label", _selection_summary())
	_set_status_text(_live_editor_status_label, "live_edits_label", _live_edit_status_text())
	_set_status_text(_live_editor_save_mode_label, "save_mode_label", _save_mode_text())
	_set_status_text(_runtime_game_label, "runtime_game_label", _runtime_game_text(runtime_state))
	_set_status_text(_runtime_session_label, "runtime_session_label", _runtime_session_text(runtime_state))
	_set_status_text(_runtime_last_seen_label, "runtime_last_seen_label", _runtime_last_seen_text(runtime_state))
	_set_status_text(_last_command_label, "last_command_label", _last_command if _last_command != "" else _ui_text("none"))
	_set_status_text(_last_receipt_label, "last_receipt_label", _ui_text(_last_receipt_key))
	_set_status_text(_last_error_label, "last_error_label", _last_error if _last_error != "" else _ui_text("none"))
	_set_button_text(_reconnect_button, _ui_text("reconnect"), _ui_text("reconnect_tooltip"))
	_set_button_text(_refresh_button, _ui_text("refresh"), _ui_text("refresh_tooltip"))

func _handshake_status_text() -> String:
	if not _connected:
		return _ui_text("handshake_disconnected")
	if not _hello_acknowledged:
		return _ui_text("handshake_waiting")
	var age := Time.get_ticks_msec() - _last_heartbeat_ms
	if age > HEARTBEAT_STALE_MS:
		return _ui_text("handshake_stale")
	return _ui_text("handshake_registered")

func _set_primary_status() -> void:
	var primary_text := _ui_text("primary_disconnected")
	var level := "error"
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_CONNECTING:
		primary_text = _ui_text("primary_connecting")
		level = "warn"
	elif state == WebSocketPeer.STATE_OPEN:
		if not _hello_acknowledged:
			primary_text = _ui_text("primary_waiting")
			level = "warn"
		elif not _edited_scene_root():
			primary_text = _ui_text("primary_open_scene")
			level = "warn"
		else:
			primary_text = _ui_text("primary_ready_live_editor")
			level = "ok"
	elif state == WebSocketPeer.STATE_CLOSING:
		primary_text = _ui_text("primary_closing")
		level = "warn"
	_set_label_text(_primary_status_label, primary_text)
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
	return _runtime_bridge_text(state)

func _runtime_bridge_text(state: Dictionary) -> String:
	if not state.is_empty() and (bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false))):
		return _ui_text("runtime_connected")
	return _ui_text("runtime_waiting")

func _runtime_status_level() -> String:
	var state := _read_runtime_state()
	return _runtime_bridge_level(state)

func _runtime_bridge_level(state: Dictionary) -> String:
	if not state.is_empty() and (bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false))):
		return "ok"
	return "warn"

func _edited_scene_root() -> Node:
	return get_editor_interface().get_edited_scene_root()

func _current_scene_text() -> String:
	var scene_root := _edited_scene_root()
	if not scene_root:
		return _ui_text("scene_none")
	var scene_path := str(scene_root.scene_file_path)
	if scene_path == "":
		return "%s (%s)" % [str(scene_root.name), _ui_text("scene_unsaved")]
	return scene_path

func _selection_summary() -> String:
	var selection := get_editor_interface().get_selection()
	if not selection:
		return _ui_text("none")
	var selected_nodes: Array = selection.get_selected_nodes()
	if selected_nodes.is_empty():
		return _ui_text("selection_none")
	if selected_nodes.size() == 1:
		var node: Node = selected_nodes[0] if selected_nodes[0] is Node else null
		return str(node.get_path()) if node else _ui_text("selection_one")
	return "%d %s" % [selected_nodes.size(), _ui_text("selection_many")]

func _live_edit_status_text() -> String:
	if not _connected:
		return _ui_text("live_edits_bridge_offline")
	if not _hello_acknowledged:
		return _ui_text("live_edits_waiting_ack")
	if _editor_status_level() == "warn":
		return _ui_text("live_edits_stale")
	if not _edited_scene_root():
		return _ui_text("live_edits_open_scene")
	return _ui_text("live_edits_ready")

func _save_mode_text() -> String:
	return _ui_text("save_mode_manual")

func _runtime_game_text(state: Dictionary) -> String:
	if state.is_empty():
		return _ui_text("runtime_game_not_running")
	if bool(state.get("connected", false)) or bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false)):
		return _ui_text("runtime_game_running")
	return _ui_text("runtime_game_not_running")

func _runtime_session_text(state: Dictionary) -> String:
	var session_id := str(state.get("sessionId", ""))
	if session_id == "":
		return _ui_text("none")
	return session_id

func _runtime_last_seen_text(state: Dictionary) -> String:
	var timestamp := str(state.get("timestamp", ""))
	if timestamp == "":
		return _ui_text("runtime_never_seen")
	return timestamp

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
	var next_color := Color(0.55, 0.62, 0.72)
	match level:
		"ok":
			next_color = Color(0.39, 0.82, 0.56)
		"warn":
			next_color = Color(0.94, 0.78, 0.36)
		"error":
			next_color = Color(1.0, 0.48, 0.45)
	if dot.color == next_color:
		return
	dot.color = next_color

func _set_status_text(label: Label, label_key: String, value: String) -> void:
	_set_label_text(label, "%s: %s" % [_ui_text(label_key), value])

func _set_label_text(label: Label, next_text: String) -> void:
	if not label:
		return
	if label.text == next_text:
		return
	label.text = next_text

func _set_button_text(button: Button, next_text: String, next_tooltip: String) -> void:
	if not button:
		return
	if button.text != next_text:
		button.text = next_text
	if button.tooltip_text != next_tooltip:
		button.tooltip_text = next_tooltip

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
		"live_editor_section":
			return "\u5b9e\u65f6\u7f16\u8f91\u5668" if zh else "Live Editor"
		"runtime_section":
			return "\u8fd0\u884c\u65f6" if zh else "Runtime"
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
			return "\u6700\u8fd1\u7ed3\u679c" if zh else "Last Result"
		"last_error_label":
			return "\u6700\u8fd1\u9519\u8bef" if zh else "Last Error"
		"current_scene_label":
			return "\u5f53\u524d\u573a\u666f" if zh else "Current Scene"
		"selection_label":
			return "\u9009\u62e9" if zh else "Selection"
		"live_edits_label":
			return "\u5b9e\u65f6\u4fee\u6539" if zh else "Live Edits"
		"save_mode_label":
			return "\u4fdd\u5b58\u6a21\u5f0f" if zh else "Save Mode"
		"runtime_game_label":
			return "\u6e38\u620f" if zh else "Game"
		"runtime_session_label":
			return "\u8fd0\u884c\u65f6\u4f1a\u8bdd" if zh else "Runtime Session"
		"runtime_last_seen_label":
			return "\u6700\u8fd1\u8fd0\u884c\u65f6\u72b6\u6001" if zh else "Last Runtime Seen"
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
		"primary_open_scene":
			return "\u6253\u5f00\u573a\u666f\u540e\u53ef\u4f7f\u7528\u5b9e\u65f6\u7f16\u8f91\u5de5\u5177" if zh else "Open a scene to use live edit tools"
		"primary_ready_live_editor":
			return "\u5df2\u51c6\u5907\u597d\u8fdb\u884c\u5b9e\u65f6\u7f16\u8f91\u4fee\u6539" if zh else "Ready for live editor edits"
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
		"scene_none":
			return "\u6ca1\u6709\u6253\u5f00\u7684\u573a\u666f" if zh else "No edited scene"
		"scene_unsaved":
			return "\u672a\u4fdd\u5b58\u573a\u666f" if zh else "Unsaved scene"
		"selection_none":
			return "\u672a\u9009\u62e9" if zh else "None selected"
		"selection_one":
			return "\u5df2\u9009\u62e9 1 \u4e2a\u8282\u70b9" if zh else "1 node selected"
		"selection_many":
			return "\u4e2a\u8282\u70b9\u5df2\u9009\u62e9" if zh else "nodes selected"
		"live_edits_bridge_offline":
			return "\u7f16\u8f91\u5668\u6865\u63a5\u79bb\u7ebf" if zh else "Editor bridge offline"
		"live_edits_waiting_ack":
			return "\u7b49\u5f85\u7f16\u8f91\u5668\u6865\u63a5\u786e\u8ba4" if zh else "Waiting for editor bridge ack"
		"live_edits_stale":
			return "\u7f16\u8f91\u5668\u5fc3\u8df3\u8fc7\u671f" if zh else "Editor heartbeat stale"
		"live_edits_open_scene":
			return "\u6253\u5f00\u573a\u666f\u540e\u53ef\u4fee\u6539" if zh else "Open a scene to edit"
		"live_edits_ready":
			return "\u53ef\u4f7f\u7528 UndoRedo \u5b9e\u65f6\u4fee\u6539" if zh else "Ready with UndoRedo live edits"
		"save_mode_manual":
			return "\u9ed8\u8ba4\u624b\u52a8\u4fdd\u5b58\uff1bMCP \u547d\u4ee4\u53ef\u5355\u6b21\u8bf7\u6c42 autoSave\u3002" if zh else "Manual by default; autoSave can be requested per MCP command."
		"runtime_game_running":
			return "\u6b63\u5728\u8fd0\u884c" if zh else "Running"
		"runtime_game_not_running":
			return "\u672a\u8fd0\u884c" if zh else "Not running"
		"runtime_never_seen":
			return "\u5c1a\u672a\u770b\u5230" if zh else "Never"
		"receipt_completed":
			return "\u5df2\u5b8c\u6210" if zh else "completed"
		"receipt_live_editor":
			return "\u5b9e\u65f6\u7f16\u8f91\u5df2\u5b8c\u6210" if zh else "live editor edit completed"
		"receipt_saved":
			return "\u573a\u666f\u5df2\u4fdd\u5b58" if zh else "scene saved"
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
