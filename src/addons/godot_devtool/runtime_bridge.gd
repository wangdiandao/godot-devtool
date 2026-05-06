extends Node
class_name GodotDevtoolRuntimeBridge

const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const REQUIRED_RUNTIME_ROUTE := "get_game_scene_tree"
const REQUIRED_RUNTIME_INPUT_ROUTE := "simulate_action"
const REQUIRED_RUNTIME_PROPERTY_ROUTE := "get_game_node_properties"
const REQUIRED_RUNTIME_SCREENSHOT_ROUTE := "get_game_screenshot"

var _router := CommandRouter.new()
var _socket := WebSocketPeer.new()
var _bridge_url := "ws://127.0.0.1:8766"
var _last_connect_attempt_ms := 0

func _ready() -> void:
	set_process(true)

func _process(_delta: float) -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_try_connect()
		return
	_socket.poll()
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	if _socket.get_available_packet_count() == 0:
		return
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())

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
	var command_name := str(message.get("command", ""))
	var payload_value = message.get("payload", {})
	var payload: Dictionary = payload_value if typeof(payload_value) == TYPE_DICTIONARY else {}
	var result: Dictionary = _router.dispatch_command(command_name, payload)
	_socket.send_text(JSON.stringify({
		"type": "receipt",
		"commandId": command_id,
		"context": "runtime",
		"status": "completed" if bool(result.get("ok", false)) else "failed",
		"error": str(result.get("error", "")),
		"result": result.get("result", {})
	}))
