@tool
extends RefCounted

func routes() -> Dictionary:
	return {"ui_theme_status": true}

func dispatch(_command_name: String, _payload: Dictionary, _plugin = null) -> Dictionary:
	return {"ok": true, "error": "", "result": {"available": true}}
