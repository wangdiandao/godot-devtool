@tool
extends EditorPlugin

const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")

var _socket := WebSocketPeer.new()
var _router := CommandRouter.new()
var _bridge_url := "ws://127.0.0.1:8766"
var _connected := false
var _last_connect_attempt_ms := 0

func _enter_tree() -> void:
	_load_config()
	set_process(true)

func _exit_tree() -> void:
	set_process(false)
	_socket.close()

func _process(_delta: float) -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
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
			"pluginVersion": "2.0.0"
		})
	if state != WebSocketPeer.STATE_OPEN:
		_connected = false
		return
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())

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
