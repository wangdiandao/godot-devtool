@tool
extends RefCounted

func routes() -> Dictionary:
	return {"scene_status": true}

func dispatch(_command_name: String, _payload: Dictionary, plugin: EditorPlugin = null) -> Dictionary:
	var root := plugin.get_editor_interface().get_edited_scene_root() if plugin else null
	return {"ok": true, "error": "", "result": {"editedSceneRoot": str(root.name) if root else ""}}
