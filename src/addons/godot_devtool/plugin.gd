@tool
extends EditorPlugin

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const PLUGIN_VERSION := "2.3.0"

var _socket := WebSocketPeer.new()
var _router := CommandRouter.new()
var _bridge_url := "ws://127.0.0.1:8766"
var _connected := false
var _last_connect_attempt_ms := 0
var _dock: VBoxContainer
var _server_status_label: Label
var _bridge_url_label: Label
var _last_command_label: Label
var _last_receipt_label: Label
var _last_error_label: Label

func _enter_tree() -> void:
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
			_connected = false
			_update_status_panel()
		_try_connect()
		return
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN and not _connected:
		_connected = true
		_send({
			"type": "hello",
			"context": "editor",
			"projectPath": ProjectSettings.globalize_path("res://"),
			"pluginVersion": PLUGIN_VERSION
		})
		_update_status_panel()
	if state != WebSocketPeer.STATE_OPEN:
		if _connected:
			_connected = false
			_update_status_panel()
		return
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())
	_update_status_panel()

func _create_status_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "godot-devtool"
	_dock.custom_minimum_size = Vector2(260, 0)

	var title := Label.new()
	title.text = "godot-devtool"
	title.add_theme_font_size_override("font_size", 18)
	_dock.add_child(title)

	_server_status_label = _create_status_label("MCP Server", "Disconnected")
	_bridge_url_label = _create_status_label("URL", _bridge_url)
	_last_command_label = _create_status_label("Last Command", "None")
	_last_receipt_label = _create_status_label("Last Receipt", "None")
	_last_error_label = _create_status_label("Last Error", "None")

	var reconnect_button := Button.new()
	reconnect_button.text = "Reconnect"
	reconnect_button.tooltip_text = "Reconnect to the local godot-devtool MCP WebSocket server."
	reconnect_button.pressed.connect(_force_reconnect)
	_dock.add_child(reconnect_button)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	_update_status_panel()

func _create_status_label(label: String, value: String) -> Label:
	var status_label := Label.new()
	status_label.text = "%s: %s" % [label, value]
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(status_label)
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

func _try_connect() -> void:
	var now := Time.get_ticks_msec()
	if now - _last_connect_attempt_ms < 1000:
		return
	_last_connect_attempt_ms = now
	_socket = WebSocketPeer.new()
	_socket.connect_to_url(_bridge_url)
	_update_status_panel()

func _force_reconnect() -> void:
	_connected = false
	_socket.close()
	_socket = WebSocketPeer.new()
	_last_connect_attempt_ms = 0
	_try_connect()
	_update_status_panel()

func _handle_packet(packet_text: String) -> void:
	var parsed = JSON.parse_string(packet_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var message: Dictionary = parsed
	if str(message.get("type", "")) != "command":
		return
	var command_id := str(message.get("commandId", ""))
	var command_name := str(message.get("command", message.get("route", "")))
	var payload_value = message.get("payload", {})
	var payload: Dictionary = payload_value if typeof(payload_value) == TYPE_DICTIONARY else {}
	var result: Dictionary = _router.dispatch_command(command_name, payload, self)
	_last_command_label.text = "Last Command: %s" % command_name
	_last_receipt_label.text = "Last Receipt: %s" % ("completed" if bool(result.get("ok", false)) else "failed")
	_last_error_label.text = "Last Error: %s" % str(result.get("error", "None"))
	_send({
		"type": "receipt",
		"commandId": command_id,
		"context": "editor",
		"status": "completed" if bool(result.get("ok", false)) else "failed",
		"error": str(result.get("error", "")),
		"result": result.get("result", {})
	})

func _send(message: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	_socket.send_text(JSON.stringify(message))

func _update_status_panel() -> void:
	if not _server_status_label:
		return
	var state := _socket.get_ready_state()
	var status := "Disconnected"
	if state == WebSocketPeer.STATE_CONNECTING:
		status = "Connecting"
	elif state == WebSocketPeer.STATE_OPEN:
		status = "Connected"
	elif state == WebSocketPeer.STATE_CLOSING:
		status = "Closing"
	_server_status_label.text = "MCP Server: %s" % status
	_bridge_url_label.text = "URL: %s" % _bridge_url
