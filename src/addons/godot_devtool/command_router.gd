@tool
extends RefCounted

const ProjectCommands := preload("res://addons/godot_devtool/commands/project_commands.gd")
const SceneCommands := preload("res://addons/godot_devtool/commands/scene_commands.gd")
const NodeCommands := preload("res://addons/godot_devtool/commands/node_commands.gd")
const ScriptCommands := preload("res://addons/godot_devtool/commands/script_commands.gd")
const EditorCommands := preload("res://addons/godot_devtool/commands/editor_commands.gd")
const InputCommands := preload("res://addons/godot_devtool/commands/input_commands.gd")
const RuntimeCommands := preload("res://addons/godot_devtool/commands/runtime_commands.gd")
const AnimationCommands := preload("res://addons/godot_devtool/commands/animation_commands.gd")
const TilemapCommands := preload("res://addons/godot_devtool/commands/tilemap_commands.gd")
const UiThemeCommands := preload("res://addons/godot_devtool/commands/ui_theme_commands.gd")
const PhysicsCommands := preload("res://addons/godot_devtool/commands/physics_commands.gd")
const NavigationCommands := preload("res://addons/godot_devtool/commands/navigation_commands.gd")
const AudioCommands := preload("res://addons/godot_devtool/commands/audio_commands.gd")
const VisualCommands := preload("res://addons/godot_devtool/commands/visual_commands.gd")
const QaCommands := preload("res://addons/godot_devtool/commands/qa_commands.gd")

var _routes := {}

func _init() -> void:
	for provider in [
		ProjectCommands.new(),
		SceneCommands.new(),
		NodeCommands.new(),
		ScriptCommands.new(),
		EditorCommands.new(),
		InputCommands.new(),
		RuntimeCommands.new(),
		AnimationCommands.new(),
		TilemapCommands.new(),
		UiThemeCommands.new(),
		PhysicsCommands.new(),
		NavigationCommands.new(),
		AudioCommands.new(),
		VisualCommands.new(),
		QaCommands.new(),
	]:
		for route_name in provider.routes().keys():
			_routes[route_name] = provider

func dispatch_command(command_name: String, payload: Dictionary, plugin: EditorPlugin = null) -> Dictionary:
	if not _routes.has(command_name):
		return {"ok": false, "error": "unknown_command: " + command_name, "result": {"code": "unknown_command", "command": command_name}}
	return _routes[command_name].dispatch(command_name, payload, plugin)

func capture_input_event(event: InputEvent) -> void:
	var visited := []
	for provider in _routes.values():
		if visited.has(provider):
			continue
		visited.append(provider)
		if provider.has_method("capture_input_event"):
			provider.capture_input_event(event)

func list_routes() -> Array:
	var names := _routes.keys()
	names.sort()
	return names
