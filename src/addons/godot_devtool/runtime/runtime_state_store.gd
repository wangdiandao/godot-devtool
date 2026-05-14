extends RefCounted

const STATE_PATH := "res://.godot-devtool/runtime-state.json"

func write(state: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://.godot-devtool"))
	var file := FileAccess.open(STATE_PATH, FileAccess.WRITE)
	if not file:
		return
	file.store_string(JSON.stringify(state, "\t"))
