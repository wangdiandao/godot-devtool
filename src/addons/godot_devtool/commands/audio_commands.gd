@tool
extends RefCounted

func routes() -> Dictionary:
	return {"audio_status": true}

func dispatch(_command_name: String, _payload: Dictionary, _plugin = null) -> Dictionary:
	return {"ok": true, "error": "", "result": {"busCount": AudioServer.bus_count}}
