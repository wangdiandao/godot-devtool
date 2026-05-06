@tool
extends EditorPlugin

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const PLUGIN_VERSION := "2.3.1"

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
var _reconnect_button: Button
var _last_command := ""
var _last_receipt_key := "none"
var _last_error := ""

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
	_dock.name = "GDT"
	_dock.custom_minimum_size = Vector2(260, 0)

	var title := Label.new()
	title.text = "GDT"
	title.add_theme_font_size_override("font_size", 18)
	_dock.add_child(title)

	_server_status_label = _create_status_label()
	_bridge_url_label = _create_status_label()
	_last_command_label = _create_status_label()
	_last_receipt_label = _create_status_label()
	_last_error_label = _create_status_label()

	_reconnect_button = Button.new()
	_reconnect_button.pressed.connect(_force_reconnect)
	_dock.add_child(_reconnect_button)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	_update_status_panel()

func _create_status_label() -> Label:
	var status_label := Label.new()
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
	if not _server_status_label:
		return
	var state := _socket.get_ready_state()
	var status_key := "status_disconnected"
	if state == WebSocketPeer.STATE_CONNECTING:
		status_key = "status_connecting"
	elif state == WebSocketPeer.STATE_OPEN:
		status_key = "status_connected"
	elif state == WebSocketPeer.STATE_CLOSING:
		status_key = "status_closing"
	_set_status_text(_server_status_label, "server_label", _ui_text(status_key))
	_set_status_text(_bridge_url_label, "url_label", _bridge_url)
	_set_status_text(_last_command_label, "last_command_label", _last_command if _last_command != "" else _ui_text("none"))
	_set_status_text(_last_receipt_label, "last_receipt_label", _ui_text(_last_receipt_key))
	_set_status_text(_last_error_label, "last_error_label", _last_error if _last_error != "" else _ui_text("none"))
	if _reconnect_button:
		_reconnect_button.text = _ui_text("reconnect")
		_reconnect_button.tooltip_text = _ui_text("reconnect_tooltip")

func _set_status_text(label: Label, label_key: String, value: String) -> void:
	label.text = "%s: %s" % [_ui_text(label_key), value]

func _ui_text(key: String) -> String:
	var zh := _uses_simplified_chinese()
	match key:
		"server_label":
			return "MCP 服务" if zh else "MCP Server"
		"url_label":
			return "URL"
		"last_command_label":
			return "最近命令" if zh else "Last Command"
		"last_receipt_label":
			return "最近回执" if zh else "Last Receipt"
		"last_error_label":
			return "最近错误" if zh else "Last Error"
		"status_disconnected":
			return "未连接" if zh else "Disconnected"
		"status_connecting":
			return "连接中" if zh else "Connecting"
		"status_connected":
			return "已连接" if zh else "Connected"
		"status_closing":
			return "正在关闭" if zh else "Closing"
		"receipt_completed":
			return "已完成" if zh else "completed"
		"receipt_failed":
			return "失败" if zh else "failed"
		"reconnect":
			return "重新连接" if zh else "Reconnect"
		"reconnect_tooltip":
			return "重新连接到本地 godot-devtool MCP WebSocket 服务。" if zh else "Reconnect to the local godot-devtool MCP WebSocket server."
		"none":
			return "无" if zh else "None"
	return key

func _uses_simplified_chinese() -> bool:
	var locale := TranslationServer.get_locale()
	var editor_settings: EditorSettings = get_editor_interface().get_editor_settings()
	if editor_settings and editor_settings.has_setting("interface/editor/editor_language"):
		var editor_locale := str(editor_settings.get_setting("interface/editor/editor_language"))
		if editor_locale != "":
			locale = editor_locale
	var normalized_locale := locale.replace("-", "_").to_lower()
	return normalized_locale.begins_with("zh_cn") or normalized_locale.begins_with("zh_hans") or normalized_locale.begins_with("zh_sg")
