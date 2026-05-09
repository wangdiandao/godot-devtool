extends Node
class_name GodotDevtoolRuntimeBridge

const CommandRouter := preload("res://addons/godot_devtool/command_router.gd")
const REQUIRED_RUNTIME_ROUTE := "get_game_scene_tree"
const REQUIRED_RUNTIME_INPUT_ROUTE := "simulate_action"
const REQUIRED_RUNTIME_PROPERTY_ROUTE := "get_game_node_properties"
const REQUIRED_RUNTIME_SCREENSHOT_ROUTE := "get_game_screenshot"
const CONFIG_PATH := "res://.godot-devtool/bridge-config.json"
const STATE_PATH := "res://.godot-devtool/runtime-state.json"
const PLUGIN_VERSION := "2.8.0"
const HANDSHAKE_PROTOCOL_VERSION := 1
const HELLO_RETRY_INTERVAL_MS := 1000
const HEARTBEAT_INTERVAL_MS := 5000
const STATE_WRITE_INTERVAL_MS := 1000

var _router := CommandRouter.new()
var _socket := WebSocketPeer.new()
var _bridge_url := "ws://127.0.0.1:8766"
var _auth_token := ""
var _last_connect_attempt_ms := 0
var _registered := false
var _hello_acknowledged := false
var _last_hello_ms := 0
var _last_heartbeat_sent_ms := 0
var _last_heartbeat_ms := 0
var _last_state_write_ms := 0
var _hello_attempts := 0
var _last_error := ""
var _session_id := ""

func _ready() -> void:
	_session_id = "runtime-%s-%d" % [str(OS.get_process_id()), Time.get_ticks_msec()]
	_load_config()
	_try_connect()
	_write_runtime_state()
	set_process(true)

func _input(event: InputEvent) -> void:
	_router.capture_input_event(event)

func _process(_delta: float) -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_reset_registration_state()
		_load_config()
		_try_connect()
		_write_runtime_state_throttled()
		return
	_socket.poll()
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		_write_runtime_state_throttled()
		return
	_maybe_send_hello()
	_maybe_send_heartbeat()
	if _socket.get_available_packet_count() == 0:
		_write_runtime_state_throttled()
		return
	while _socket.get_available_packet_count() > 0:
		_handle_packet(_socket.get_packet().get_string_from_utf8())
	_write_runtime_state_throttled()

func _try_connect() -> void:
	var now := Time.get_ticks_msec()
	if _last_connect_attempt_ms > 0 and now - _last_connect_attempt_ms < 1000:
		return
	_last_connect_attempt_ms = now
	_reset_registration_state()
	_socket = WebSocketPeer.new()
	var error := _socket.connect_to_url(_bridge_url)
	_last_error = "" if error == OK else "connect_to_url failed: %s" % error

func _load_config() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		return
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if not file:
		_last_error = "Cannot read bridge config"
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY:
		var port := int(parsed.get("port", parsed.get("websocketPort", 8766)))
		_bridge_url = str(parsed.get("url", "ws://127.0.0.1:%d" % port))
		_auth_token = str(parsed.get("authToken", parsed.get("auth_token", "")))

func _reset_registration_state() -> void:
	_registered = false
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
	_registered = true
	_hello_attempts += 1
	_socket.send_text(JSON.stringify({
		"type": "hello",
		"context": "runtime",
		"projectPath": ProjectSettings.globalize_path("res://"),
		"pluginVersion": PLUGIN_VERSION,
		"protocolVersion": HANDSHAKE_PROTOCOL_VERSION,
		"sessionId": _session_id,
		"authToken": _auth_token
	}))

func _maybe_send_heartbeat() -> void:
	if not _hello_acknowledged:
		return
	var now := Time.get_ticks_msec()
	if now - _last_heartbeat_sent_ms < HEARTBEAT_INTERVAL_MS:
		return
	_last_heartbeat_sent_ms = now
	_socket.send_text(JSON.stringify({
		"type": "heartbeat",
		"context": "runtime",
		"projectPath": ProjectSettings.globalize_path("res://"),
		"sessionId": _session_id
	}))

func _handle_packet(packet_text: String) -> void:
	var parsed = JSON.parse_string(packet_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var message: Dictionary = parsed
	if str(message.get("type", "")) == "hello_ack":
		_hello_acknowledged = true
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
	if str(message.get("type", "")) == "heartbeat_ack":
		_last_heartbeat_ms = Time.get_ticks_msec()
		return
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

func _write_runtime_state_throttled() -> void:
	var now := Time.get_ticks_msec()
	if now - _last_state_write_ms < STATE_WRITE_INTERVAL_MS:
		return
	_last_state_write_ms = now
	_write_runtime_state()

func _write_runtime_state() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://.godot-devtool"))
	var file := FileAccess.open(STATE_PATH, FileAccess.WRITE)
	if not file:
		return
	var socket_state := _socket.get_ready_state()
	file.store_string(JSON.stringify({
		"timestamp": Time.get_datetime_string_from_system(true),
		"projectPath": ProjectSettings.globalize_path("res://"),
		"bridgeUrl": _bridge_url,
		"sessionId": _session_id,
		"socketState": socket_state,
		"connected": socket_state == WebSocketPeer.STATE_OPEN,
		"registered": _registered,
		"helloAcknowledged": _hello_acknowledged,
		"helloAttempts": _hello_attempts,
		"lastHeartbeatMs": _last_heartbeat_ms,
		"authConfigured": _auth_token != "",
		"lastError": _last_error
	}, "\t"))
