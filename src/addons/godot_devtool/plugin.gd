@tool
extends EditorPlugin

const EditorBridgeClient := preload("res://addons/godot_devtool/editor/editor_bridge_client.gd")

var _client := EditorBridgeClient.new()

func _enter_tree() -> void:
	_client.enter_tree(self)
	set_process(true)

func _exit_tree() -> void:
	set_process(false)
	_client.exit_tree()

func _process(delta: float) -> void:
	_client.process(delta)
