func animation_track_type_from_name(track_type):
	match str(track_type).to_lower():
		"method":
			return Animation.TYPE_METHOD
		"bezier":
			return Animation.TYPE_BEZIER
		_:
			return Animation.TYPE_VALUE

func animation_update_mode_from_name(update_mode):
	match str(update_mode).to_lower():
		"discrete":
			return Animation.UPDATE_DISCRETE
		"capture":
			return Animation.UPDATE_CAPTURE
		_:
			return Animation.UPDATE_CONTINUOUS

func animation_find_player(scene_root, params):
	if params.has("animation_player_path") and str(params.animation_player_path) != "":
		var player_by_path = find_node_by_tool_path(scene_root, str(params.animation_player_path))
		if player_by_path and player_by_path is AnimationPlayer:
			return player_by_path
		printerr("Failed to find AnimationPlayer: " + str(params.animation_player_path))
		quit(1)
	var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find animation parent node: " + parent_path)
		quit(1)
	var player_name = str(params.player_name) if params.has("player_name") and str(params.player_name) != "" else "AnimationPlayer"
	var player = find_direct_child_by_name(parent, player_name)
	if player and player is AnimationPlayer:
		return player
	if player:
		printerr("Existing child is not an AnimationPlayer: " + player_name)
		quit(1)
	printerr("Failed to find AnimationPlayer child: " + player_name)
	quit(1)

func animation_get_library(player):
	if player.has_animation_library(""):
		return player.get_animation_library("")
	var library = AnimationLibrary.new()
	player.add_animation_library("", library)
	return library

func animation_get_resource(player, animation_name, create_if_missing = false):
	var library = animation_get_library(player)
	if library.has_animation(animation_name):
		return {"library": library, "animation": library.get_animation(animation_name)}
	if create_if_missing:
		var animation_resource = Animation.new()
		library.add_animation(animation_name, animation_resource)
		return {"library": library, "animation": animation_resource}
	printerr("Animation not found: " + animation_name)
	quit(1)

func serialize_animation_track(animation_resource, track_index):
	var keyframes = []
	for key_index in range(animation_resource.track_get_key_count(track_index)):
		keyframes.append({
			"index": key_index,
			"time": animation_resource.track_get_key_time(track_index, key_index),
			"value": serialize_variant(animation_resource.track_get_key_value(track_index, key_index))
		})
	return {
		"index": track_index,
		"type": animation_resource.track_get_type(track_index),
		"path": str(animation_resource.track_get_path(track_index)),
		"keyframes": keyframes
	}

func animation_get_info(player, animation_name):
	var animation_data = animation_get_resource(player, animation_name, false)
	var animation_resource = animation_data.animation
	var tracks = []
	for track_index in range(animation_resource.get_track_count()):
		tracks.append(serialize_animation_track(animation_resource, track_index))
	return {
		"animationName": animation_name,
		"length": animation_resource.length,
		"trackCount": animation_resource.get_track_count(),
		"tracks": tracks
	}

func animation_find_track(animation_resource, params):
	if params.has("track_index"):
		return int(params.track_index)
	if params.has("track_path"):
		var target_path = NodePath(str(params.track_path))
		for track_index in range(animation_resource.get_track_count()):
			if animation_resource.track_get_path(track_index) == target_path:
				return track_index
	return -1

func animation_add_track(scene_root, params):
	var player = animation_find_player(scene_root, params)
	var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
	var animation_data = animation_get_resource(player, animation_name, true)
	var animation_resource = animation_data.animation
	if params.has("length"):
		animation_resource.length = float(params.length)
	if not params.has("track_path"):
		printerr("track_path is required")
		quit(1)
	var track_index = animation_resource.add_track(animation_track_type_from_name(params.get("track_type", "value")))
	animation_resource.track_set_path(track_index, NodePath(str(params.track_path)))
	if animation_resource.track_get_type(track_index) == Animation.TYPE_VALUE:
		animation_resource.value_track_set_update_mode(track_index, animation_update_mode_from_name(params.get("update_mode", "continuous")))
	return {
		"playerPath": find_tool_path_by_reference(scene_root, player, "root"),
		"animation": animation_get_info(player, animation_name),
		"track": serialize_animation_track(animation_resource, track_index)
	}

func animation_set_keyframe(scene_root, params):
	var player = animation_find_player(scene_root, params)
	var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
	var animation_data = animation_get_resource(player, animation_name, true)
	var animation_resource = animation_data.animation
	var track_index = animation_find_track(animation_resource, params)
	if track_index < 0:
		if not params.has("track_path"):
			printerr("track_index or track_path is required")
			quit(1)
		track_index = animation_resource.add_track(animation_track_type_from_name(params.get("track_type", "value")))
		animation_resource.track_set_path(track_index, NodePath(str(params.track_path)))
	if not params.has("time") or not params.has("value"):
		printerr("time and value are required")
		quit(1)
	animation_resource.track_insert_key(track_index, float(params.time), variant_from_json(params.value))
	return {
		"playerPath": find_tool_path_by_reference(scene_root, player, "root"),
		"animation": animation_get_info(player, animation_name),
		"track": serialize_animation_track(animation_resource, track_index)
	}

func animation_remove(scene_root, params):
	var player = animation_find_player(scene_root, params)
	var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
	var library = animation_get_library(player)
	if not library.has_animation(animation_name):
		printerr("Animation not found: " + animation_name)
		quit(1)
	library.remove_animation(animation_name)
	return {
		"playerPath": find_tool_path_by_reference(scene_root, player, "root"),
		"removedAnimation": animation_name
	}

func animation(params):
	var scene_data = load_scene_instance(params.scene_path)
	var full_scene_path = scene_data.path
	var scene_root = scene_data.root
	var action = str(params.action) if params.has("action") else "list"

	if action == "list":
		var players = []
		collect_animation_players(scene_root, "root", players)
		print(JSON.stringify({
			"scenePath": params.scene_path,
			"players": players
		}))
		return

	if action == "get_info":
		var info_player = animation_find_player(scene_root, params)
		var info_animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
		print(JSON.stringify({
			"scenePath": params.scene_path,
			"playerPath": find_tool_path_by_reference(scene_root, info_player, "root"),
			"animation": animation_get_info(info_player, info_animation_name)
		}))
		return

	if action == "add_track":
		var add_track_result = animation_add_track(scene_root, params)
		pack_and_save_scene(scene_root, full_scene_path)
		print(JSON.stringify(add_track_result))
		return

	if action == "set_keyframe":
		var keyframe_result = animation_set_keyframe(scene_root, params)
		pack_and_save_scene(scene_root, full_scene_path)
		print(JSON.stringify(keyframe_result))
		return

	if action == "remove":
		var remove_result = animation_remove(scene_root, params)
		pack_and_save_scene(scene_root, full_scene_path)
		print(JSON.stringify(remove_result))
		return

	if action != "create":
		printerr("Unsupported animation action: " + action)
		quit(1)

	var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find animation parent node: " + parent_path)
		quit(1)

	var player_name = str(params.player_name) if params.has("player_name") and str(params.player_name) != "" else "AnimationPlayer"
	var player = find_direct_child_by_name(parent, player_name)
	if player and not (player is AnimationPlayer):
		printerr("Existing child is not an AnimationPlayer: " + player_name)
		quit(1)
	if not player:
		player = AnimationPlayer.new()
		player.name = player_name
		parent.add_child(player)
		set_owner_recursive(player, scene_root)

	var animation_name = str(params.animation_name) if params.has("animation_name") and str(params.animation_name) != "" else "default"
	var animation_length = float(params.length) if params.has("length") else 1.0
	var animation_resource = Animation.new()
	animation_resource.length = animation_length

	if params.has("tracks") and params.tracks is Array:
		for track in params.tracks:
			if not (track is Dictionary) or not track.has("path"):
				printerr("Animation track entries require path")
				quit(1)
			var track_index = animation_resource.add_track(Animation.TYPE_VALUE)
			animation_resource.track_set_path(track_index, NodePath(str(track.path)))
			if track.has("keyframes") and track.keyframes is Array:
				for keyframe in track.keyframes:
					if not (keyframe is Dictionary) or not keyframe.has("time") or not keyframe.has("value"):
						printerr("Animation keyframes require time and value")
						quit(1)
					animation_resource.track_insert_key(track_index, float(keyframe.time), variant_from_json(keyframe.value))

	var library = null
	if player.has_animation_library(""):
		library = player.get_animation_library("")
	else:
		library = AnimationLibrary.new()
		player.add_animation_library("", library)
	if library.has_animation(animation_name):
		library.remove_animation(animation_name)
	library.add_animation(animation_name, animation_resource)

	pack_and_save_scene(scene_root, full_scene_path)
	print(JSON.stringify({
		"scenePath": params.scene_path,
		"playerPath": find_tool_path_by_reference(scene_root, player, "root"),
		"playerName": str(player.name),
		"animationName": animation_name,
		"length": animation_resource.length,
		"trackCount": animation_resource.get_track_count()
	}))

func animation_tree_find_node(scene_root, params):
	if params.has("tree_path") and str(params.tree_path) != "":
		var tree_by_path = find_node_by_tool_path(scene_root, str(params.tree_path))
		if tree_by_path and tree_by_path is AnimationTree:
			return tree_by_path
		printerr("Failed to find AnimationTree: " + str(params.tree_path))
		quit(1)
	var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find AnimationTree parent node: " + parent_path)
		quit(1)
	var tree_name = str(params.tree_name) if params.has("tree_name") and str(params.tree_name) != "" else "AnimationTree"
	var tree = find_direct_child_by_name(parent, tree_name)
	if tree and tree is AnimationTree:
		return tree
	printerr("Failed to find AnimationTree child: " + tree_name)
	quit(1)

func animation_tree_transition_index(machine, params):
	if params.has("transition_index"):
		return int(params.transition_index)
	var from_state = str(params.from_state) if params.has("from_state") else ""
	var to_state = str(params.to_state) if params.has("to_state") else ""
	for transition_index in range(machine.get_transition_count()):
		if str(machine.get_transition_from(transition_index)) == from_state and str(machine.get_transition_to(transition_index)) == to_state:
			return transition_index
	return -1

func animation_tree_set_transition_parameters(scene_root, params):
	var tree = animation_tree_find_node(scene_root, params)
	if not (tree.tree_root is AnimationNodeStateMachine):
		printerr("AnimationTree tree_root is not an AnimationNodeStateMachine")
		quit(1)
	if not params.has("transition_parameters") or not (params.transition_parameters is Dictionary):
		printerr("transition_parameters is required")
		quit(1)
	var machine = tree.tree_root
	var transition_index = animation_tree_transition_index(machine, params)
	if transition_index < 0 or transition_index >= machine.get_transition_count():
		printerr("Failed to find AnimationTree transition")
		quit(1)
	var transition = machine.get_transition(transition_index)
	apply_properties_to_object(transition, params.transition_parameters)
	return {
		"treePath": find_tool_path_by_reference(scene_root, tree, "root"),
		"transitionIndex": transition_index,
		"from": str(machine.get_transition_from(transition_index)),
		"to": str(machine.get_transition_to(transition_index)),
		"parameters": params.transition_parameters
	}

func animation_state_machine(params):
	var scene_data = load_scene_instance(params.scene_path)
	var full_scene_path = scene_data.path
	var scene_root = scene_data.root
	var action = str(params.action) if params.has("action") else "list"

	if action == "list":
		var trees = []
		collect_animation_trees(scene_root, "root", trees)
		print(JSON.stringify({
			"scenePath": params.scene_path,
			"trees": trees
		}))
		return

	if action == "set_transition_parameters":
		var transition_result = animation_tree_set_transition_parameters(scene_root, params)
		pack_and_save_scene(scene_root, full_scene_path)
		print(JSON.stringify(transition_result))
		return

	if action != "create":
		printerr("Unsupported animation_state_machine action: " + action)
		quit(1)

	var parent_path = str(params.node_path) if params.has("node_path") and str(params.node_path) != "" else "root"
	var parent = find_node_by_tool_path(scene_root, parent_path)
	if not parent:
		printerr("Failed to find AnimationTree parent node: " + parent_path)
		quit(1)

	var tree_name = str(params.tree_name) if params.has("tree_name") and str(params.tree_name) != "" else "AnimationTree"
	var tree = find_direct_child_by_name(parent, tree_name)
	if tree and not (tree is AnimationTree):
		printerr("Existing child is not an AnimationTree: " + tree_name)
		quit(1)
	if not tree:
		tree = AnimationTree.new()
		tree.name = tree_name
		parent.add_child(tree)
		set_owner_recursive(tree, scene_root)

	var state_machine = AnimationNodeStateMachine.new()
	if params.has("states") and params.states is Array:
		for state in params.states:
			if not (state is Dictionary) or not state.has("name"):
				printerr("State entries require name")
				quit(1)
			var state_name = str(state.name)
			if state_machine_has_node(state_machine, state_name):
				continue
			var state_node = AnimationNodeAnimation.new()
			if state.has("animation_name"):
				state_node.animation = str(state.animation_name)
			var position = Vector2.ZERO
			if state.has("position"):
				position = variant_from_json(state.position)
			state_machine.add_node(state_name, state_node, position)

	if params.has("transitions") and params.transitions is Array:
		for transition in params.transitions:
			if not (transition is Dictionary) or not transition.has("from") or not transition.has("to"):
				printerr("Transition entries require from and to")
				quit(1)
			var transition_resource = AnimationNodeStateMachineTransition.new()
			if transition.has("parameters") and transition.parameters is Dictionary:
				apply_properties_to_object(transition_resource, transition.parameters)
			state_machine.add_transition(str(transition.from), str(transition.to), transition_resource)

	tree.tree_root = state_machine
	if params.has("animation_player_path") and str(params.animation_player_path) != "":
		tree.set("anim_player", NodePath(str(params.animation_player_path)))
	tree.active = true

	pack_and_save_scene(scene_root, full_scene_path)
	print(JSON.stringify({
		"scenePath": params.scene_path,
		"treePath": find_tool_path_by_reference(scene_root, tree, "root"),
		"treeName": str(tree.name),
		"states": state_machine.get_node_list(),
		"transitionCount": state_machine.get_transition_count()
	}))

