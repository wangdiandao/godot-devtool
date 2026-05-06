func material_tool(params):
    var action = str(params.action) if params.has("action") else "read"

    if action == "list_templates":
        print(JSON.stringify({
            "action": action,
            "templates": material_template_names()
        }))
        return

    if action == "create_from_template":
        if not params.has("resource_path") or not params.has("template_name"):
            printerr("resource_path and template_name are required")
            quit(1)
        var template_material = create_material_from_template(str(params.template_name))
        if params.has("properties"):
            apply_properties_to_object(template_material, params.properties)
        var template_path = save_resource_checked(template_material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "templateName": str(params.template_name),
            "resourcePath": template_path,
            "material": serialize_material_resource(template_material)
        }))
        return

    if action == "create":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var material_type = str(params.material_type) if params.has("material_type") and str(params.material_type) != "" else "StandardMaterial3D"
        var material = instantiate_class(material_type)
        if not material or not (material is Material):
            printerr("Failed to create material type: " + material_type)
            quit(1)
        if material is ShaderMaterial:
            if params.has("shader_path") and str(params.shader_path) != "":
                var shader = load(normalize_resource_path(params.shader_path))
                if not shader or not (shader is Shader):
                    printerr("Failed to load shader: " + str(params.shader_path))
                    quit(1)
                material.shader = shader
        if params.has("preset_name") and str(params.preset_name) != "":
            apply_material_preset(material, str(params.preset_name))
        if params.has("properties"):
            apply_properties_to_object(material, params.properties)
        var full_resource_path = save_resource_checked(material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "resourcePath": full_resource_path,
            "material": serialize_material_resource(material)
        }))
        return

    if action == "read":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var material_resource = load(normalize_resource_path(params.resource_path))
        if not material_resource or not (material_resource is Material):
            printerr("Failed to load material: " + str(params.resource_path))
            quit(1)
        print(JSON.stringify({
            "action": action,
            "resourcePath": normalize_resource_path(params.resource_path),
            "material": serialize_material_resource(material_resource)
        }))
        return

    if action == "update":
        if not params.has("resource_path"):
            printerr("resource_path is required")
            quit(1)
        var existing_material = load(normalize_resource_path(params.resource_path))
        if not existing_material or not (existing_material is Material):
            printerr("Failed to load material: " + str(params.resource_path))
            quit(1)
        if params.has("properties"):
            apply_properties_to_object(existing_material, params.properties)
        if params.has("preset_name") and str(params.preset_name) != "":
            apply_material_preset(existing_material, str(params.preset_name))
        var updated_path = save_resource_checked(existing_material, params.resource_path)
        print(JSON.stringify({
            "action": action,
            "resourcePath": updated_path,
            "material": serialize_material_resource(existing_material)
        }))
        return

    if action == "apply":
        if not params.has("scene_path") or not params.has("node_path") or not params.has("material_path"):
            printerr("scene_path, node_path, and material_path are required")
            quit(1)
        var scene_data = load_scene_instance(params.scene_path)
        var scene_root = scene_data.root
        var node = find_node_by_tool_path(scene_root, params.node_path)
        if not node:
            printerr("Failed to find material target node: " + params.node_path)
            quit(1)
        var material_to_apply = load(normalize_resource_path(params.material_path))
        if not material_to_apply or not (material_to_apply is Material):
            printerr("Failed to load material: " + str(params.material_path))
            quit(1)
        var property_name = str(params.property_name) if params.has("property_name") and str(params.property_name) != "" else ""
        if property_name == "":
            property_name = "material_override" if object_has_property(node, "material_override") else "material"
        if not object_has_property(node, property_name):
            printerr("Target node does not expose material property: " + property_name)
            quit(1)
        node.set(property_name, material_to_apply)
        pack_and_save_scene(scene_root, scene_data.path)
        print(JSON.stringify({
            "action": action,
            "scenePath": params.scene_path,
            "nodePath": params.node_path,
            "materialPath": normalize_resource_path(params.material_path),
            "propertyName": property_name
        }))
        return

    printerr("Unsupported material action: " + action)
    quit(1)

func shader_tool(params):
    var action = str(params.action) if params.has("action") else "read"

    if action == "create":
        if not params.has("shader_path"):
            printerr("shader_path is required")
            quit(1)
        var shader = Shader.new()
        var shader_type = str(params.shader_type) if params.has("shader_type") and str(params.shader_type) != "" else "canvas_item"
        var code = str(params.code) if params.has("code") and str(params.code) != "" else "shader_type " + shader_type + ";\nuniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);\n"
        shader.code = code
        var full_shader_path = save_resource_checked(shader, params.shader_path)
        print(JSON.stringify(shader_inspection_payload(
            action,
            full_shader_path,
            shader.code,
            params.include_paths if params.has("include_paths") else [],
            params.texture_defaults if params.has("texture_defaults") else {}
        )))
        return

    if action == "read" or action == "inspect":
        if not params.has("shader_path"):
            printerr("shader_path is required")
            quit(1)
        var loaded_shader = load(normalize_resource_path(params.shader_path))
        if not loaded_shader or not (loaded_shader is Shader):
            printerr("Failed to load shader: " + str(params.shader_path))
            quit(1)
        print(JSON.stringify(shader_inspection_payload(
            action,
            normalize_resource_path(params.shader_path),
            loaded_shader.code,
            params.include_paths if params.has("include_paths") else [],
            params.texture_defaults if params.has("texture_defaults") else {}
        )))
        return

    if action == "set_parameters":
        if not params.has("material_path") or not params.has("parameters"):
            printerr("material_path and parameters are required")
            quit(1)
        var shader_material = load(normalize_resource_path(params.material_path))
        if not shader_material or not (shader_material is ShaderMaterial):
            printerr("Failed to load ShaderMaterial: " + str(params.material_path))
            quit(1)
        if not (params.parameters is Dictionary):
            printerr("parameters must be a dictionary")
            quit(1)
        for parameter_name in params.parameters.keys():
            shader_material.set_shader_parameter(str(parameter_name), variant_from_json(params.parameters[parameter_name]))
        var full_material_path = save_resource_checked(shader_material, params.material_path)
        print(JSON.stringify({
            "action": action,
            "materialPath": full_material_path,
            "material": serialize_material_resource(shader_material)
        }))
        return

    printerr("Unsupported shader action: " + action)
    quit(1)

func lighting_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var lights = []
        collect_lighting_nodes(scene_root, "root", lights)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "lights": lights
        }))
        return

    if action != "create":
        printerr("Unsupported lighting action: " + action)
        quit(1)

    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find lighting parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "PointLight2D"
    var node = instantiate_class(node_type)
    if not node or not (node is Light3D or node is Light2D or node is WorldEnvironment):
        printerr("Failed to create lighting node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if node is WorldEnvironment and not node.environment:
        node.environment = Environment.new()
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

func particle_tool(params):
    var scene_data = load_scene_instance(params.scene_path)
    var scene_root = scene_data.root
    var action = str(params.action) if params.has("action") else "list"

    if action == "list":
        var particles = []
        collect_particle_nodes(scene_root, "root", particles)
        print(JSON.stringify({
            "scenePath": params.scene_path,
            "particles": particles
        }))
        return

    if action != "create":
        printerr("Unsupported particle action: " + action)
        quit(1)

    var parent_path = str(params.parent_node_path) if params.has("parent_node_path") and str(params.parent_node_path) != "" else "root"
    var parent = find_node_by_tool_path(scene_root, parent_path)
    if not parent:
        printerr("Failed to find particle parent node: " + parent_path)
        quit(1)
    var node_type = str(params.node_type) if params.has("node_type") and str(params.node_type) != "" else "GPUParticles2D"
    var node = instantiate_class(node_type)
    if not node or not (node is GPUParticles2D or node is GPUParticles3D or node is CPUParticles2D or node is CPUParticles3D):
        printerr("Failed to create particle node type: " + node_type)
        quit(1)
    node.name = str(params.node_name) if params.has("node_name") and str(params.node_name) != "" else node_type
    if params.has("amount"):
        node.set("amount", int(params.amount))
    if params.has("lifetime"):
        node.set("lifetime", float(params.lifetime))
    if params.has("emitting"):
        node.set("emitting", bool(params.emitting))
    if params.has("process_material_type") and str(params.process_material_type) == "ParticleProcessMaterial":
        if node is GPUParticles2D or node is GPUParticles3D:
            node.process_material = ParticleProcessMaterial.new()
    if params.has("properties"):
        apply_properties_to_object(node, params.properties)
    parent.add_child(node)
    set_owner_recursive(node, scene_root)
    pack_and_save_scene(scene_root, scene_data.path)
    print(JSON.stringify({
        "action": action,
        "scenePath": params.scene_path,
        "nodePath": find_tool_path_by_reference(scene_root, node, "root"),
        "nodeType": node.get_class(),
        "nodeName": str(node.name)
    }))

