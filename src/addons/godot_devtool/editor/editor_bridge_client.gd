@tool
extends RefCounted

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const RUNTIME_STATE_PATH := "res://.godot-devtool/runtime-state.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const StatusDock := preload("res://addons/godot_devtool/editor/status_dock.gd")
const PLUGIN_VERSION := "3.0.1"
const HANDSHAKE_PROTOCOL_VERSION := 1
const HELLO_RETRY_INTERVAL_MS := 1000
const HEARTBEAT_INTERVAL_MS := 5000
const HEARTBEAT_STALE_MS := 15000
const STATUS_REFRESH_INTERVAL_MS := 500
const RUNTIME_STATE_STALE_SECONDS := 15.0
const BROKER_STATUS_INTERVAL_MS := 2000

var _socket := WebSocketPeer.new()
var _router := CommandRouter.new()
var _plugin: EditorPlugin
var _bridge_url := "ws://127.0.0.1:8766"
var _auth_token := ""
var _connected := false
var _hello_acknowledged := false
var _last_connect_attempt_ms := 0
var _last_hello_ms := 0
var _last_heartbeat_sent_ms := 0
var _last_heartbeat_ms := 0
var _session_id := ""
var _run_id := ""
var _broker_id := ""
var _dock
var _primary_status_label: Label
var _primary_status_dot: ColorRect
var _server_status_label: Label
var _server_status_dot: ColorRect
var _handshake_label: Label
var _handshake_status_dot: ColorRect
var _runtime_status_label: Label
var _runtime_status_dot: ColorRect
var _connection_summary_label: Label
var _connection_summary_dot: ColorRect
var _live_editor_scene_label: Label
var _live_editor_selection_label: Label
var _activity_label: Label
var _reconnect_button: Button
var _refresh_button: Button
var _last_command := ""
var _last_receipt_key := "none"
var _last_error := ""
var _last_status_update_ms := 0
var _last_broker_status_ms := 0
var _broker_status := {}

func enter_tree(plugin: EditorPlugin) -> void:
	_plugin = plugin
	_session_id = "editor-%s-%d" % [str(OS.get_process_id()), Time.get_ticks_msec()]
	_load_config()
	_try_connect()
	_create_status_dock()

func exit_tree() -> void:
	if _dock:
		_plugin.remove_control_from_docks(_dock)
		_dock.queue_free()
		_dock = null
	_socket.close()

func process(_delta: float) -> void:
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
	_maybe_request_broker_status()
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())
	_update_status_panel_if_due()

func _create_status_dock() -> void:
	_dock = StatusDock.new()
	_dock.setup(PLUGIN_VERSION, Callable(self, "_ui_text"), Callable(self, "_force_reconnect"), Callable(self, "_refresh_status"))
	_primary_status_label = _dock.labels["primary"]
	_primary_status_dot = _dock.dots["primary"]
	_server_status_label = _dock.labels["server"]
	_server_status_dot = _dock.dots["server"]
	_handshake_label = _dock.labels["editor"]
	_handshake_status_dot = _dock.dots["editor"]
	_runtime_status_label = _dock.labels["runtime"]
	_runtime_status_dot = _dock.dots["runtime"]
	_connection_summary_label = _dock.labels["connection_summary"]
	_connection_summary_dot = _dock.dots["connection_summary"]
	_live_editor_scene_label = _dock.labels["current_scene"]
	_live_editor_selection_label = _dock.labels["selection"]
	_activity_label = _dock.labels["activity"]
	_reconnect_button = _dock.buttons["reconnect"]
	_refresh_button = _dock.buttons["refresh"]
	_plugin.add_control_to_dock(EditorPlugin.DOCK_SLOT_RIGHT_UL, _dock)
	_update_status_panel()

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
		_run_id = str(parsed.get("runId", _run_id))
		_broker_id = str(parsed.get("brokerId", _broker_id))

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
	_maybe_request_broker_status(true)
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
		"runId": _run_id,
		"brokerId": _broker_id,
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
		"pluginVersion": PLUGIN_VERSION,
		"protocolVersion": HANDSHAKE_PROTOCOL_VERSION,
		"sessionId": _session_id,
		"runId": _run_id,
		"brokerId": _broker_id
	})

func _handle_packet(packet_text: String) -> void:
	var parsed = JSON.parse_string(packet_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var message: Dictionary = parsed
	var message_type := str(message.get("type", ""))
	if message_type == "hello_ack":
		_hello_acknowledged = true
		_broker_id = str(message.get("brokerId", _broker_id))
		_run_id = str(message.get("runId", _run_id))
		_session_id = str(message.get("sessionId", _session_id))
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
	if message_type == "heartbeat_ack":
		_broker_id = str(message.get("brokerId", _broker_id))
		_run_id = str(message.get("runId", _run_id))
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
	if message_type == "frontend_status_ack":
		var status = message.get("status", {})
		if typeof(status) == TYPE_DICTIONARY:
			_broker_status = status
			_update_status_panel()
		return
	if message_type != "command":
		return
	var command_id := str(message.get("commandId", ""))
	var command_name := str(message.get("command", message.get("route", "")))
	var payload_value = message.get("payload", {})
	var payload: Dictionary = payload_value if typeof(payload_value) == TYPE_DICTIONARY else {}
	var result: Dictionary = _router.dispatch_command(command_name, payload, _plugin)
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
		"sessionId": _session_id,
		"runId": _run_id,
		"brokerId": _broker_id,
		"status": receipt_status,
		"error": error_text,
		"result": result.get("result", {})
	})

func _send(message: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	_socket.send_text(JSON.stringify(message))

func _maybe_request_broker_status(force := false) -> void:
	if not _hello_acknowledged:
		return
	var now := Time.get_ticks_msec()
	if not force and _last_broker_status_ms > 0 and now - _last_broker_status_ms < BROKER_STATUS_INTERVAL_MS:
		return
	_last_broker_status_ms = now
	_send({
		"type": "frontend_status",
		"projectPath": ProjectSettings.globalize_path("res://")
	})

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
	_set_label_tooltip(_primary_status_label, _live_edit_status_text())
	_set_status_dot(_server_status_dot, "ok")
	_set_status_text(_server_status_label, "server_label", _ui_text("server_ready_stdio"))
	_set_label_tooltip(_server_status_label, "%s: %s" % [_ui_text("transport_label"), _bridge_url])
	_set_status_dot(_handshake_status_dot, _editor_status_level())
	_set_status_text(_handshake_label, "handshake_label", _handshake_status_text())
	_set_label_tooltip(_handshake_label, _editor_diagnostics_text())
	_set_status_dot(_runtime_status_dot, _runtime_bridge_level(runtime_state))
	_set_status_text(_runtime_status_label, "runtime_bridge_label", _runtime_bridge_text(runtime_state))
	_set_label_tooltip(_runtime_status_label, _runtime_diagnostics_text(runtime_state))
	_set_status_dot(_connection_summary_dot, _connection_summary_level(runtime_state))
	_set_status_text(_connection_summary_label, "connection_summary_label", _connection_summary_text(runtime_state))
	_set_label_tooltip(_connection_summary_label, _connection_summary_diagnostics_text(runtime_state))
	_set_status_text(_live_editor_scene_label, "current_scene_label", _current_scene_text())
	_set_label_tooltip(_live_editor_scene_label, _current_scene_text())
	var selection_text := _selection_summary()
	var has_selection := selection_text != _ui_text("selection_none") and selection_text != _ui_text("none")
	_set_control_visible(_live_editor_selection_label, has_selection)
	_set_status_text(_live_editor_selection_label, "selection_label", selection_text)
	var has_activity := _last_command != "" or _last_error != ""
	_set_control_visible(_activity_label, has_activity)
	_set_status_text(_activity_label, "activity_label", _activity_summary())
	_set_label_tooltip(_activity_label, _activity_diagnostics_text())
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
	if _runtime_state_is_stale(state):
		return _ui_text("runtime_stale")
	if _runtime_state_is_connected(state):
		return _ui_text("runtime_connected")
	return _ui_text("runtime_waiting")

func _runtime_status_level() -> String:
	var state := _read_runtime_state()
	return _runtime_bridge_level(state)

func _runtime_bridge_level(state: Dictionary) -> String:
	if _runtime_state_is_connected(state):
		return "ok"
	return "warn"

func _edited_scene_root() -> Node:
	return _plugin.get_editor_interface().get_edited_scene_root()

func _current_scene_text() -> String:
	var scene_root := _edited_scene_root()
	if not scene_root:
		return _ui_text("scene_none")
	var scene_path := str(scene_root.scene_file_path)
	if scene_path == "":
		return "%s (%s)" % [str(scene_root.name), _ui_text("scene_unsaved")]
	return scene_path

func _selection_summary() -> String:
	var selection := _plugin.get_editor_interface().get_selection()
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
	if _runtime_state_is_connected(state):
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

func _connection_summary_text(runtime_state: Dictionary) -> String:
	return "%s %d / %s %d / %s" % [
		_ui_text("agent_label"),
		_agent_count(),
		_ui_text("instance_label"),
		_runtime_instance_count(runtime_state),
		_connection_state_text(runtime_state)
	]

func _connection_summary_level(runtime_state: Dictionary) -> String:
	if not _connected:
		return "error"
	if not _hello_acknowledged or _editor_status_level() == "warn":
		return "warn"
	if _runtime_state_is_stale(runtime_state):
		return "warn"
	return "ok"

func _connection_state_text(runtime_state: Dictionary) -> String:
	if not _connected:
		return _ui_text("connection_offline")
	if not _hello_acknowledged:
		return _ui_text("connection_waiting")
	if _editor_status_level() == "warn":
		return _ui_text("connection_stale")
	if _runtime_instance_count(runtime_state) > 0 and _runtime_state_is_connected(runtime_state):
		return _ui_text("connection_connected")
	if _runtime_state_is_stale(runtime_state):
		return _ui_text("runtime_stale")
	return _ui_text("connection_editor_ready")

func _agent_count() -> int:
	var count := 0
	for client in _broker_clients():
		if typeof(client) != TYPE_DICTIONARY:
			continue
		if str(client.get("context", "")) == "editor":
			count += 1
	if count == 0 and _hello_acknowledged:
		count = 1
	return count

func _runtime_instance_count(runtime_state: Dictionary) -> int:
	var run_ids := {}
	var runtime_clients := 0
	for client in _broker_clients():
		if typeof(client) != TYPE_DICTIONARY:
			continue
		if str(client.get("context", "")) != "runtime":
			continue
		runtime_clients += 1
		var run_id := str(client.get("runId", ""))
		if run_id != "":
			run_ids[run_id] = true
	if not run_ids.is_empty():
		return run_ids.size()
	if runtime_clients > 0:
		return runtime_clients
	if _runtime_state_is_connected(runtime_state):
		return 1
	return 0

func _broker_clients() -> Array:
	var clients = _broker_status.get("clients", [])
	return clients if typeof(clients) == TYPE_ARRAY else []

func _runtime_state_is_connected(state: Dictionary) -> bool:
	if state.is_empty() or _runtime_state_is_stale(state):
		return false
	return bool(state.get("connected", false)) or bool(state.get("registered", false)) or bool(state.get("helloAcknowledged", false))

func _runtime_state_is_stale(state: Dictionary) -> bool:
	if state.is_empty():
		return false
	var modified_unix := FileAccess.get_modified_time(RUNTIME_STATE_PATH)
	if modified_unix <= 0:
		return true
	var age := Time.get_unix_time_from_system() - float(modified_unix)
	return age > RUNTIME_STATE_STALE_SECONDS

func _editor_diagnostics_text() -> String:
	return _join_diagnostics([
		"%s: %s" % [_ui_text("transport_label"), _bridge_url],
		"%s: %s" % [_ui_text("broker_label"), _broker_id if _broker_id != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("editor_session_label"), _session_id if _session_id != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("run_label"), _run_id if _run_id != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("live_edits_label"), _live_edit_status_text()],
		"%s: %s" % [_ui_text("save_mode_label"), _save_mode_text()]
	])

func _runtime_diagnostics_text(state: Dictionary) -> String:
	return _join_diagnostics([
		"%s: %s" % [_ui_text("runtime_game_label"), _runtime_game_text(state)],
		"%s: %s" % [_ui_text("runtime_session_label"), _runtime_session_text(state)],
		"%s: %s" % [_ui_text("run_label"), str(state.get("runId", "")) if str(state.get("runId", "")) != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("broker_label"), str(state.get("brokerId", "")) if str(state.get("brokerId", "")) != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("runtime_last_seen_label"), _runtime_last_seen_text(state)]
	])

func _connection_summary_diagnostics_text(runtime_state: Dictionary) -> String:
	return _join_diagnostics([
		"%s: %d" % [_ui_text("agent_label"), _agent_count()],
		"%s: %d" % [_ui_text("instance_label"), _runtime_instance_count(runtime_state)],
		"%s: %s" % [_ui_text("connection_state_label"), _connection_state_text(runtime_state)],
		"%s: %s" % [_ui_text("broker_label"), _broker_id if _broker_id != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("editor_session_label"), _session_id if _session_id != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("runtime_session_label"), _runtime_session_text(runtime_state)],
		"%s: %s" % [_ui_text("run_label"), str(runtime_state.get("runId", "")) if str(runtime_state.get("runId", "")) != "" else _ui_text("none")]
	])

func _activity_summary() -> String:
	if _last_command == "":
		return _ui_text("none")
	var receipt_text := _ui_text(_last_receipt_key)
	if _last_error != "":
		receipt_text = _ui_text("receipt_failed")
	return "%s: %s" % [_last_command, receipt_text]

func _activity_diagnostics_text() -> String:
	return _join_diagnostics([
		"%s: %s" % [_ui_text("last_command_label"), _last_command if _last_command != "" else _ui_text("none")],
		"%s: %s" % [_ui_text("last_receipt_label"), _ui_text(_last_receipt_key)],
		"%s: %s" % [_ui_text("last_error_label"), _last_error if _last_error != "" else _ui_text("none")]
	])

func _join_diagnostics(lines: Array) -> String:
	var result := ""
	for line in lines:
		var text := str(line)
		if text == "":
			continue
		if result != "":
			result += "\n"
		result += text
	return result

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

func _set_label_tooltip(label: Label, next_tooltip: String) -> void:
	if not label:
		return
	if label.tooltip_text == next_tooltip:
		return
	label.tooltip_text = next_tooltip

func _set_control_visible(control: Control, next_visible: bool) -> void:
	if not control:
		return
	if control.visible == next_visible:
		return
	control.visible = next_visible

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
		"broker_label":
			return "Broker"
		"editor_bridge_label":
			return "\u7f16\u8f91\u5668\u6865\u63a5" if zh else "Editor Bridge"
		"runtime_bridge_label":
			return "\u8fd0\u884c\u65f6\u6865\u63a5" if zh else "Runtime Bridge"
		"connection_summary_label":
			return "\u8fde\u63a5\u72b6\u6001" if zh else "Connection"
		"agent_label":
			return "Agent"
		"instance_label":
			return "\u5b9e\u4f8b" if zh else "Instance"
		"connection_state_label":
			return "\u72b6\u6001" if zh else "State"
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
		"activity_label":
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
		"editor_session_label":
			return "\u7f16\u8f91\u5668\u4f1a\u8bdd" if zh else "Editor Session"
		"run_label":
			return "Run"
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
		"runtime_stale":
			return "\u72b6\u6001\u8fc7\u671f" if zh else "Stale"
		"runtime_waiting":
			return "\u7b49\u5f85\u6e38\u620f\u8fd0\u884c" if zh else "Waiting for game"
		"connection_connected":
			return "\u5df2\u8fde\u63a5" if zh else "Connected"
		"connection_editor_ready":
			return "\u7f16\u8f91\u5668\u5c31\u7eea" if zh else "Editor ready"
		"connection_offline":
			return "\u79bb\u7ebf" if zh else "Offline"
		"connection_waiting":
			return "\u7b49\u5f85\u786e\u8ba4" if zh else "Waiting"
		"connection_stale":
			return "\u5fc3\u8df3\u8fc7\u671f" if zh else "Heartbeat stale"
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
	var editor_settings: EditorSettings = _plugin.get_editor_interface().get_editor_settings()
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
