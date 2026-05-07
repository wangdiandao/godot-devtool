func create_scene(params):
	print("Creating scene: " + params.scene_path)
	
	# Get project paths and log them for debugging
	var project_res_path = "res://"
	var project_user_path = "user://"
	var global_res_path = ProjectSettings.globalize_path(project_res_path)
	var global_user_path = ProjectSettings.globalize_path(project_user_path)
	
	if debug_mode:
		print("Project paths:")
		print("- res:// path: " + project_res_path)
		print("- user:// path: " + project_user_path)
		print("- Globalized res:// path: " + global_res_path)
		print("- Globalized user:// path: " + global_user_path)
		
		# Print some common environment variables for debugging
		print("Environment variables:")
		var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
		for env_var in env_vars:
			if OS.has_environment(env_var):
				print("  " + env_var + " = " + OS.get_environment(env_var))
	
	# Normalize the scene path
	var full_scene_path = params.scene_path
	if not full_scene_path.begins_with("res://"):
		full_scene_path = "res://" + full_scene_path
	if debug_mode:
		print("Scene path (with res://): " + full_scene_path)
	
	# Convert resource path to an absolute path
	var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
	if debug_mode:
		print("Absolute scene path: " + absolute_scene_path)
	
	# Get the scene directory paths
	var scene_dir_res = full_scene_path.get_base_dir()
	var scene_dir_abs = absolute_scene_path.get_base_dir()
	if debug_mode:
		print("Scene directory (resource path): " + scene_dir_res)
		print("Scene directory (absolute path): " + scene_dir_abs)
	
	# Only do extensive testing in debug mode
	if debug_mode:
		# Try to create a simple test file in the project root to verify write access
		var initial_test_file_path = "res://godot_mcp_test_write.tmp"
		var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
		if initial_test_file:
			initial_test_file.store_string("Test write access")
			initial_test_file.close()
			print("Successfully wrote test file to project root: " + initial_test_file_path)
			
			# Verify the test file exists
			var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
			print("Test file exists check: " + str(initial_test_file_exists))
			
			# Clean up the test file
			if initial_test_file_exists:
				var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
				print("Test file removal result: " + str(remove_error))
		else:
			var write_error = FileAccess.get_open_error()
			printerr("Failed to write test file to project root: " + str(write_error))
			printerr("This indicates a serious permission issue with the project directory")
	
	# Use traditional if-else statement for better compatibility
	var root_node_type = "Node2D"  # Default value
	if params.has("root_node_type"):
		root_node_type = params.root_node_type
	if debug_mode:
		print("Root node type: " + root_node_type)
	
	# Create the root node
	var scene_root = instantiate_class(root_node_type)
	if not scene_root:
		printerr("Failed to instantiate node of type: " + root_node_type)
		printerr("Make sure the class exists and can be instantiated")
		printerr("Check if the class is registered in ClassDB or available as a script")
		quit(1)
	
	scene_root.name = "root"
	if debug_mode:
		print("Root node created with name: " + scene_root.name)
	
	# Set the owner of the root node to itself (important for scene saving)
	scene_root.owner = scene_root
	
	# Pack the scene
	var packed_scene = PackedScene.new()
	var result = packed_scene.pack(scene_root)
	if debug_mode:
		print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
	
	if result == OK:
		# Only do extensive testing in debug mode
		if debug_mode:
			# First, let's verify we can write to the project directory
			print("Testing write access to project directory...")
			var test_write_path = "res://test_write_access.tmp"
			var test_write_abs = ProjectSettings.globalize_path(test_write_path)
			var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
			
			if test_file:
				test_file.store_string("Write test")
				test_file.close()
				print("Successfully wrote test file to project directory")
				
				# Clean up test file
				if FileAccess.file_exists(test_write_path):
					var remove_error = DirAccess.remove_absolute(test_write_abs)
					print("Test file removal result: " + str(remove_error))
			else:
				var write_error = FileAccess.get_open_error()
				printerr("Failed to write test file to project directory: " + str(write_error))
				printerr("This may indicate permission issues with the project directory")
				# Continue anyway, as the scene directory might still be writable
		
		# Ensure the scene directory exists using DirAccess
		if debug_mode:
			print("Ensuring scene directory exists...")
		
		# Get the scene directory relative to res://
		var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
		if debug_mode:
			print("Scene directory (relative to res://): " + scene_dir_relative)
		
		# Create the directory if needed
		if not scene_dir_relative.is_empty():
			# First check if it exists
			var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
			if debug_mode:
				print("Directory exists check (absolute): " + str(dir_exists))
			
			if not dir_exists:
				if debug_mode:
					print("Directory doesn't exist, creating: " + scene_dir_relative)
				
				# Try to create the directory using DirAccess
				var dir = DirAccess.open("res://")
				if dir == null:
					var open_error = DirAccess.get_open_error()
					printerr("Failed to open res:// directory: " + str(open_error))
					
					# Try alternative approach with absolute path
					if debug_mode:
						print("Trying alternative directory creation approach...")
					var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
					if debug_mode:
						print("Make directory result (absolute): " + str(make_dir_error))
					
					if make_dir_error != OK:
						printerr("Failed to create directory using absolute path")
						printerr("Error code: " + str(make_dir_error))
						quit(1)
				else:
					# Create the directory using the DirAccess instance
					if debug_mode:
						print("Creating directory using DirAccess: " + scene_dir_relative)
					var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
					if debug_mode:
						print("Make directory result: " + str(make_dir_error))
					
					if make_dir_error != OK:
						printerr("Failed to create directory: " + scene_dir_relative)
						printerr("Error code: " + str(make_dir_error))
						quit(1)
				
				# Verify the directory was created
				dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
				if debug_mode:
					print("Directory exists check after creation: " + str(dir_exists))
				
				if not dir_exists:
					printerr("Directory reported as created but does not exist: " + scene_dir_abs)
					printerr("This may indicate a problem with path resolution or permissions")
					quit(1)
			elif debug_mode:
				print("Directory already exists: " + scene_dir_abs)
		
		# Save the scene
		if debug_mode:
			print("Saving scene to: " + full_scene_path)
		var save_error = ResourceSaver.save(packed_scene, full_scene_path)
		if debug_mode:
			print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
		
		if save_error == OK:
			# Only do extensive testing in debug mode
			if debug_mode:
				# Wait a moment to ensure file system has time to complete the write
				print("Waiting for file system to complete write operation...")
				OS.delay_msec(500)  # 500ms delay
				
				# Verify the file was actually created using multiple methods
				var file_check_abs = FileAccess.file_exists(absolute_scene_path)
				print("File exists check (absolute path): " + str(file_check_abs))
				
				var file_check_res = FileAccess.file_exists(full_scene_path)
				print("File exists check (resource path): " + str(file_check_res))
				
				var res_exists = ResourceLoader.exists(full_scene_path)
				print("Resource exists check: " + str(res_exists))
				
				# If file doesn't exist by absolute path, try to create a test file in the same directory
				if not file_check_abs and not file_check_res:
					printerr("Scene file not found after save. Trying to diagnose the issue...")
					
					# Try to write a test file to the same directory
					var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
					var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
					
					if test_scene_file:
						test_scene_file.store_string("Test scene directory write")
						test_scene_file.close()
						print("Successfully wrote test file to scene directory: " + test_scene_file_path)
						
						# Check if the test file exists
						var test_file_exists = FileAccess.file_exists(test_scene_file_path)
						print("Test file exists: " + str(test_file_exists))
						
						if test_file_exists:
							# Directory is writable, so the issue is with scene saving
							printerr("Directory is writable but scene file wasn't created.")
							printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
							
							# Try saving with a different approach
							print("Trying alternative save approach...")
							var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
							print("Alternative save result: " + str(alt_save_error))
							
							# Clean up test files
							DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
							if alt_save_error == OK:
								DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
						else:
							printerr("Test file couldn't be verified. This suggests filesystem access issues.")
					else:
						var write_error = FileAccess.get_open_error()
						printerr("Failed to write test file to scene directory: " + str(write_error))
						printerr("This confirms there are permission or path issues with the scene directory.")
					
					# Return error since we couldn't create the scene file
					printerr("Failed to create scene: " + params.scene_path)
					quit(1)
				
				# If we get here, at least one of our file checks passed
				if file_check_abs or file_check_res or res_exists:
					print("Scene file verified to exist!")
					
					# Try to load the scene to verify it's valid
					var test_load = ResourceLoader.load(full_scene_path)
					if test_load:
						print("Scene created and verified successfully at: " + params.scene_path)
						print("Scene file can be loaded correctly.")
					else:
						print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
						# Continue anyway since the file exists
					
					print("Scene created successfully at: " + params.scene_path)
				else:
					printerr("All file existence checks failed despite successful save operation.")
					printerr("This indicates a serious issue with file system access or path resolution.")
					quit(1)
			else:
				# In non-debug mode, just check if the file exists
				var file_exists = FileAccess.file_exists(full_scene_path)
				if file_exists:
					print("Scene created successfully at: " + params.scene_path)
				else:
					printerr("Failed to create scene: " + params.scene_path)
					quit(1)
		else:
			# Handle specific error codes
			var error_message = "Failed to save scene. Error code: " + str(save_error)
			
			if save_error == ERR_CANT_CREATE:
				error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
			elif save_error == ERR_CANT_OPEN:
				error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
			elif save_error == ERR_FILE_CANT_WRITE:
				error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
			elif save_error == ERR_FILE_NO_PERMISSION:
				error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
			
			printerr(error_message)
			quit(1)
	else:
		printerr("Failed to pack scene: " + str(result))
		printerr("Error code: " + str(result))
		quit(1)

# Add a node to an existing scene
func get_scene_tree(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var result = serialize_node_tree(scene_root, "root")
	print(JSON.stringify(result))

func get_node_properties(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	var property_names = ["name", "type", "path", "position", "global_position", "visible", "script"]
	if params.has("property_names") and params.property_names is Array and params.property_names.size() > 0:
		property_names = params.property_names

	var properties = {}
	for property_name in property_names:
		match property_name:
			"name":
				properties[property_name] = str(node.name)
			"type":
				properties[property_name] = node.get_class()
			"path":
				properties[property_name] = str(node.get_path())
			_:
				properties[property_name] = serialize_variant(node.get(property_name))

	print(JSON.stringify({
		"nodePath": params.node_path,
		"name": str(node.name),
		"type": node.get_class(),
		"properties": properties
	}))

func update_node_properties(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	if not params.has("properties") or not (params.properties is Dictionary):
		printerr("Properties dictionary is required")
		quit(1)

	for property_name in params.properties.keys():
		if property_name == "name":
			printerr("Use rename_node to rename nodes")
			quit(1)
		node.set(property_name, variant_from_json(params.properties[property_name]))

	pack_and_save_scene(scene_root, full_scene_path)
	print("Updated properties for node: " + params.node_path)

func node_get(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	print(JSON.stringify({
		"nodePath": params.node_path,
		"name": str(node.name),
		"type": node.get_class(),
		"path": str(node.get_path()),
		"childCount": node.get_child_count(),
		"parent": str(node.get_parent().name) if node.get_parent() else null,
		"position": serialize_variant(node.get("position")),
		"script": serialize_variant(node.get_script())
	}))

func node_move(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	var should_reparent = params.has("parent_node_path") and str(params.parent_node_path) != ""
	var should_move_position = params.has("position")
	if not should_reparent and not should_move_position:
		printerr("Position or parent_node_path is required")
		quit(1)

	var previous_parent_path = ""
	var new_parent_path = ""
	if should_reparent:
		if node == scene_root:
			printerr("Cannot reparent the scene root node")
			quit(1)

		var old_parent = node.get_parent()
		if not old_parent:
			printerr("Cannot reparent node without an existing parent: " + params.node_path)
			quit(1)

		var new_parent = find_node_by_tool_path(scene_root, params.parent_node_path)
		if not new_parent:
			printerr("Failed to find destination parent: " + params.parent_node_path)
			quit(1)
		if new_parent == node or node.is_ancestor_of(new_parent):
			printerr("Cannot reparent a node under itself or one of its descendants")
			quit(1)

		previous_parent_path = find_tool_path_by_reference(scene_root, old_parent, "root")
		set_owner_recursive(node, null)
		old_parent.remove_child(node)
		new_parent.add_child(node)
		set_owner_recursive(node, scene_root)
		new_parent_path = find_tool_path_by_reference(scene_root, new_parent, "root")

	if should_move_position:
		node.set("position", variant_from_json(params.position))

	pack_and_save_scene(scene_root, full_scene_path)
	print(JSON.stringify({
		"nodePath": params.node_path,
		"path": find_tool_path_by_reference(scene_root, node, "root"),
		"previousParentPath": previous_parent_path,
		"newParentPath": new_parent_path,
		"position": serialize_variant(node.get("position"))
	}))

func node_duplicate(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	var parent = node.get_parent()
	if params.has("parent_node_path") and str(params.parent_node_path) != "":
		parent = find_node_by_tool_path(scene_root, params.parent_node_path)
	if not parent:
		printerr("Failed to find duplicate parent")
		quit(1)

	var duplicate = node.duplicate()
	if params.has("new_name") and str(params.new_name) != "":
		duplicate.name = params.new_name
	else:
		duplicate.name = str(node.name) + "Copy"

	parent.add_child(duplicate)
	set_owner_recursive(duplicate, scene_root)
	pack_and_save_scene(scene_root, full_scene_path)
	print(JSON.stringify({
		"sourceNodePath": params.node_path,
		"duplicateName": str(duplicate.name),
		"parentPath": str(parent.get_path())
	}))

func node_find(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var scene_root = scene.instantiate()
	var results = []
	collect_matching_nodes(scene_root, "root", params, results)
	print(JSON.stringify({
		"scenePath": params.scene_path,
		"matches": results
	}))

func script_attach(params):
	var full_scene_path = normalize_resource_path(params.scene_path)
	var full_script_path = normalize_resource_path(params.script_path)
	var scene = load(full_scene_path)
	if not scene:
		printerr("Failed to load scene: " + full_scene_path)
		quit(1)

	var script = load(full_script_path)
	if not script or not (script is Script):
		printerr("Failed to load script: " + full_script_path)
		quit(1)

	var scene_root = scene.instantiate()
	var node = find_node_by_tool_path(scene_root, params.node_path)
	if not node:
		printerr("Failed to find node: " + params.node_path)
		quit(1)

	node.set_script(script)
	pack_and_save_scene(scene_root, full_scene_path)
	print(JSON.stringify({
		"scenePath": params.scene_path,
		"nodePath": params.node_path,
		"scriptPath": full_script_path
	}))

