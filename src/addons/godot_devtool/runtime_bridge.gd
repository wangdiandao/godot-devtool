extends Node
class_name GodotDevtoolRuntimeBridge

const RuntimeClient := preload("res://addons/godot_devtool/runtime/runtime_client.gd")

var _client := RuntimeClient.new()

func _ready() -> void:
	_client.ready()
	set_process(true)

func _input(event: InputEvent) -> void:
	_client.input(event)

func _process(delta: float) -> void:
	_client.process(delta)
