export const GODOT_TOOL_ALIASES: Record<string, string> = {
  scene_create: 'create_scene',
  scene_save: 'save_scene',
  scene_get_tree: 'get_scene_tree',
  node_add: 'add_node',
  node_delete: 'delete_node',
  node_rename: 'rename_node',
  script_read: 'read_script_file',
  project_get_info: 'get_project_info',
  debug_get_logs: 'get_debug_output',
};

export const GODOT_TOOL_DEFINITIONS: any[] = [
  {
    name: 'launch_editor',
    description: 'Launch Godot editor for a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'run_project',
    description: 'Run the Godot project and capture output',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene: {
          type: 'string',
          description: 'Optional: Specific scene to run',
        },
        headless: {
          type: 'boolean',
          description: 'Run the project in headless mode for automated smoke/debug runs',
        },
        quitAfter: {
          type: 'number',
          description: 'Optional number of frames before Godot quits',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_debug_output',
    description: 'Get the current debug output and errors',
    inputSchema: {
      type: 'object',
      properties: {
        outputOffset: {
          type: 'number',
          description: 'Optional output line offset for windowed reads',
        },
        errorOffset: {
          type: 'number',
          description: 'Optional error line offset for windowed reads',
        },
        tail: {
          type: 'number',
          description: 'Optional maximum number of recent lines to return from each stream',
        },
      },
      required: [],
    },
  },
  {
    name: 'clear_debug_output',
    description: 'Clear buffered output for the currently running Godot project',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'stop_project',
    description: 'Stop the currently running Godot project',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_godot_version',
    description: 'Get the installed Godot version',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_projects',
    description: 'List Godot projects in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to search for Godot projects',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to search recursively (default: false)',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'get_project_info',
    description: 'Retrieve metadata about a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'project_get_settings',
    description: 'Read Godot project.godot settings by section or section/key list',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        section: { type: 'string', description: 'Optional project.godot section name, such as application or input' },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional section/key values such as application/config/name',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'project_set_setting',
    description: 'Update Godot project.godot settings with dry-run preview and audit logging',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        changes: {
          type: 'object',
          description: 'Settings keyed by section/key, such as {"application/config/name":"Game"}',
        },
        dryRun: { type: 'boolean', description: 'Preview changes without writing project.godot' },
      },
      required: ['projectPath', 'changes'],
    },
  },
  {
    name: 'project_input_action',
    description: 'List or update project InputMap actions in project.godot',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete'], description: 'Input action operation. Defaults to list.' },
        name: { type: 'string', description: 'Input action name for create, update, or delete' },
        deadzone: { type: 'number', description: 'Input action deadzone. Defaults to 0.5.' },
        events: { type: 'array', items: { type: 'object' }, description: 'Serialized Godot input events' },
        dryRun: { type: 'boolean', description: 'Preview changes without writing project.godot' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_resource_index',
    description: 'Return a categorized resource index for a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'resource_dependency_graph',
    description: 'Build a resource dependency graph and identify orphan resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_script_index',
    description: 'Return GDScript files with class, base class, exported variables, and functions',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_export_presets',
    description: 'Read configured Godot export presets',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'check_export_presets',
    description: 'Inspect Godot export presets and report pre-export issues',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'export_matrix',
    description: 'Summarize export targets, platform families, signing/template status, and CI steps',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'update_export_preset',
    description: 'Update fields or options for a configured Godot export preset',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        presetName: {
          type: 'string',
          description: 'Export preset name from export_presets.cfg',
        },
        fields: {
          type: 'object',
          description: 'Top-level preset fields to update, such as export_path or runnable',
        },
        options: {
          type: 'object',
          description: 'Preset options to update, such as application/icon or custom_template/debug',
        },
      },
      required: ['projectPath', 'presetName'],
    },
  },
  {
    name: 'export_project',
    description: 'Run a controlled Godot export for a configured preset',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        presetName: {
          type: 'string',
          description: 'Export preset name from export_presets.cfg',
        },
        outputPath: {
          type: 'string',
          description: 'Output path relative to the Godot project',
        },
        mode: {
          type: 'string',
          enum: ['debug', 'release', 'pack'],
          description: 'Export mode. Defaults to debug.',
        },
        createOutputDirectory: {
          type: 'boolean',
          description: 'Create the output directory before exporting. Defaults to true.',
        },
      },
      required: ['projectPath', 'presetName', 'outputPath'],
    },
  },
  {
    name: 'create_gameplay_prototype',
    description: 'Create a high-level block-based gameplay prototype scaffold in a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        template: {
          type: 'string',
          enum: ['survivors'],
          description: 'Prototype template. Defaults to survivors.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing generated files. Defaults to false.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'create_workflow_test_scene',
    description: 'Create a small Godot scene for validating MCP scene/script/check workflows',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative .tscn path. Defaults to scenes/devtool_workflow_test.tscn.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing generated files. Defaults to false.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_audit_log',
    description: 'Read godot-devtool project audit log entries',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of recent audit entries to return',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'run_project_checks',
    description: 'Run stable project checks for CI, review, and release workflows',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'scene_open',
    description: 'Open a scene in the MCP session using headless/file-based scene access',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative .tscn path to open',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'scene_get_current',
    description: 'Return the current scene tracked by this MCP session, if one was opened',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Optional path to the Godot project directory to filter the current scene',
        },
      },
      required: [],
    },
  },
  {
    name: 'install_editor_bridge',
    description: 'Install the godot-devtool file-based live editor bridge plugin into a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        overwrite: { type: 'boolean', description: 'Overwrite existing bridge plugin files' },
        mode: { type: 'string', enum: ['file', 'http', 'websocket'], description: 'Bridge mode. Defaults to file.' },
        httpPort: { type: 'number', description: 'HTTP bridge port when mode is http. Defaults to 8765.' },
        websocketPort: { type: 'number', description: 'WebSocket bridge port when mode is websocket. Defaults to 8766.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_bridge_status',
    description: 'Read live editor bridge installation, state, and pending command status',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_get_selection',
    description: 'Return the current editor selection when a live editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
      },
      required: [],
    },
  },
  {
    name: 'editor_select_node',
    description: 'Select a node in the live Godot editor when an editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Project-relative scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path to select',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'editor_undo_redo',
    description: 'Perform undo or redo in the live Godot editor when an editor bridge is available',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['undo', 'redo'],
          description: 'Editor history action to perform',
        },
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory with editor bridge installed',
        },
      },
      required: ['projectPath', 'action'],
    },
  },
  {
    name: 'editor_inspector_get_properties',
    description: 'Read Inspector properties from the selected or addressed node through the live editor bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional edited scene path used for command context' },
        nodePath: { type: 'string', description: 'Optional node path. Defaults to the current editor selection.' },
        propertyNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names. Defaults to all Inspector-visible properties.',
        },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'editor_inspector_set_properties',
    description: 'Write Inspector properties on the selected or addressed node through the live editor bridge',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory with editor bridge installed' },
        scenePath: { type: 'string', description: 'Optional edited scene path used for command context' },
        nodePath: { type: 'string', description: 'Optional node path. Defaults to the current editor selection.' },
        properties: { type: 'object', description: 'Properties to write, using structured Variant values where needed' },
        timeoutMs: { type: 'number', description: 'Command timeout in milliseconds. Defaults to 10000.' },
      },
      required: ['projectPath', 'properties'],
    },
  },
  {
    name: 'filesystem_list',
    description: 'List files and directories inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        directory: {
          type: 'string',
          description: 'Project-relative directory. Defaults to project root.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'filesystem_read',
    description: 'Read a UTF-8 text file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Project-relative file path',
        },
      },
      required: ['projectPath', 'filePath'],
    },
  },
  {
    name: 'filesystem_write',
    description: 'Write a UTF-8 text file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Project-relative file path',
        },
        content: {
          type: 'string',
          description: 'UTF-8 text content to write',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing file',
        },
      },
      required: ['projectPath', 'filePath', 'content'],
    },
  },
  {
    name: 'filesystem_delete',
    description: 'Delete a project-local file or directory with explicit confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        targetPath: {
          type: 'string',
          description: 'Project-relative file or directory path to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to delete anything',
        },
        recursive: {
          type: 'boolean',
          description: 'Allow deleting a non-empty directory',
        },
      },
      required: ['projectPath', 'targetPath', 'confirm'],
    },
  },
  {
    name: 'filesystem_preview_delete',
    description: 'Preview a project-local delete operation without deleting files',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        targetPath: { type: 'string', description: 'Project-relative file or directory path to preview' },
        recursive: { type: 'boolean', description: 'Preview recursive directory deletion' },
      },
      required: ['projectPath', 'targetPath'],
    },
  },
  {
    name: 'resource_load',
    description: 'Load a text-based Godot resource from the project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative resource path',
        },
      },
      required: ['projectPath', 'resourcePath'],
    },
  },
  {
    name: 'resource_create',
    description: 'Create a simple structured Godot resource file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative .tres/.res resource path',
        },
        resourceType: {
          type: 'string',
          description: 'Godot resource type, such as Resource, StandardMaterial3D, or ShaderMaterial',
        },
        properties: {
          type: 'object',
          description: 'Optional top-level resource properties',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing resource',
        },
      },
      required: ['projectPath', 'resourcePath', 'resourceType'],
    },
  },
  {
    name: 'resource_save',
    description: 'Save text-based Godot resource content with overwrite protection',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        resourcePath: {
          type: 'string',
          description: 'Project-relative resource path',
        },
        content: {
          type: 'string',
          description: 'Full resource file content',
        },
        overwrite: {
          type: 'boolean',
          description: 'Required when replacing an existing resource',
        },
      },
      required: ['projectPath', 'resourcePath', 'content'],
    },
  },
  {
    name: 'script_create',
    description: 'Create a GDScript file inside a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scriptPath: { type: 'string', description: 'Project-relative .gd script path' },
        baseType: { type: 'string', description: 'Base Godot type for generated script. Defaults to Node.' },
        className: { type: 'string', description: 'Optional class_name declaration' },
        content: { type: 'string', description: 'Optional full script content' },
        overwrite: { type: 'boolean', description: 'Required when replacing an existing script' },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'script_write',
    description: 'Write full GDScript content with overwrite protection',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scriptPath: { type: 'string', description: 'Project-relative .gd script path' },
        content: { type: 'string', description: 'Full script content' },
        overwrite: { type: 'boolean', description: 'Required when replacing an existing script' },
      },
      required: ['projectPath', 'scriptPath', 'content'],
    },
  },
  {
    name: 'script_attach',
    description: 'Attach a GDScript resource to a node in a scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        scriptPath: { type: 'string', description: 'Project-relative or res:// .gd script path' },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
    },
  },
  {
    name: 'node_get',
    description: 'Get node information from a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_get_property',
    description: 'Compatibility alias for reading selected node properties',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        propertyNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names to read',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_set_property',
    description: 'Compatibility alias for updating node properties',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        properties: { type: 'object', description: 'Properties to update' },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
    },
  },
  {
    name: 'node_move',
    description: 'Move a node by setting its position in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the target node' },
        position: {
          type: 'object',
          description: 'Position value, for example { "type": "Vector2", "value": [x, y] }',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'position'],
    },
  },
  {
    name: 'node_duplicate',
    description: 'Duplicate a node in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        nodePath: { type: 'string', description: 'Path to the node to duplicate' },
        newName: { type: 'string', description: 'Optional name for the duplicate node' },
        parentNodePath: { type: 'string', description: 'Optional destination parent node path' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'node_find',
    description: 'Find nodes in a scene by name, type, or path substring',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        name: { type: 'string', description: 'Optional exact node name to match' },
        type: { type: 'string', description: 'Optional exact Godot class to match' },
        pathContains: { type: 'string', description: 'Optional node path substring to match' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'animation',
    description: 'Create, inspect, remove, and edit AnimationPlayer tracks and keyframes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: {
          type: 'string',
          enum: ['list', 'create', 'add_track', 'set_keyframe', 'get_info', 'remove'],
          description: 'Animation action. Defaults to list.',
        },
        nodePath: { type: 'string', description: 'Parent node path for create action' },
        animationPlayerPath: { type: 'string', description: 'AnimationPlayer node path for editing existing animations' },
        playerName: { type: 'string', description: 'AnimationPlayer node name. Defaults to AnimationPlayer.' },
        animationName: { type: 'string', description: 'Animation name. Defaults to default.' },
        length: { type: 'number', description: 'Animation length in seconds. Defaults to 1.0.' },
        trackType: { type: 'string', enum: ['value', 'method', 'bezier'], description: 'Track type for add_track. Defaults to value.' },
        trackPath: { type: 'string', description: 'Animation track path, such as Sprite2D:modulate or .:position' },
        trackIndex: { type: 'number', description: 'Existing track index for keyframe insertion' },
        time: { type: 'number', description: 'Keyframe time in seconds' },
        value: { description: 'Keyframe value, using structured Variant values where needed' },
        updateMode: { type: 'string', enum: ['continuous', 'discrete', 'capture'], description: 'Value track update mode' },
        tracks: {
          type: 'array',
          description: 'Optional value tracks with path and keyframes, e.g. [{ path: "Player:position", keyframes: [{ time: 0, value: { type: "Vector2", value: [0, 0] } }] }]',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              keyframes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    time: { type: 'number' },
                    value: {},
                  },
                  required: ['time', 'value'],
                },
              },
            },
            required: ['path', 'keyframes'],
          },
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'animation_state_machine',
    description: 'Create, inspect, and configure AnimationTree state machines',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['list', 'create', 'set_transition_parameters'], description: 'State machine action. Defaults to list.' },
        nodePath: { type: 'string', description: 'Parent node path for create action' },
        treePath: { type: 'string', description: 'Existing AnimationTree node path for transition updates' },
        treeName: { type: 'string', description: 'AnimationTree node name. Defaults to AnimationTree.' },
        animationPlayerPath: { type: 'string', description: 'Optional AnimationPlayer node path used by the AnimationTree.' },
        states: {
          type: 'array',
          description: 'Optional state definitions, e.g. [{ name: "idle", animationName: "idle" }].',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              animationName: { type: 'string' },
              position: { type: 'object' },
            },
            required: ['name'],
          },
        },
        transitions: {
          type: 'array',
          description: 'Optional transitions, e.g. [{ from: "idle", to: "run" }].',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              parameters: { type: 'object' },
            },
            required: ['from', 'to'],
          },
        },
        fromState: { type: 'string', description: 'Transition source state for set_transition_parameters' },
        toState: { type: 'string', description: 'Transition target state for set_transition_parameters' },
        transitionIndex: { type: 'number', description: 'Transition index for set_transition_parameters' },
        transitionParameters: {
          type: 'object',
          description: 'AnimationNodeStateMachineTransition properties such as xfade_time, advance_mode, switch_mode, advance_condition, priority, and reset.',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'signal',
    description: 'List, connect, or disconnect node signals in a scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['list', 'connect', 'disconnect'], description: 'Signal action. Defaults to list.' },
        nodePath: { type: 'string', description: 'Source node path' },
        signalName: { type: 'string', description: 'Signal name for connect/disconnect' },
        targetNodePath: { type: 'string', description: 'Target node path for connect/disconnect' },
        methodName: { type: 'string', description: 'Target method name for connect/disconnect' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'group',
    description: 'List, add, or remove node groups',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'Group action. Defaults to list.' },
        nodePath: { type: 'string', description: 'Node path' },
        groupName: { type: 'string', description: 'Group name for add/remove' },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'ui',
    description: 'Create Control nodes, reusable UI templates, themes, and automatic signal wiring',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: {
          type: 'string',
          enum: ['create', 'create_theme', 'apply_theme', 'create_template', 'auto_connect_signals'],
          description: 'UI action. Defaults to create.',
        },
        parentNodePath: { type: 'string', description: 'Parent node path. Defaults to root.' },
        nodePath: { type: 'string', description: 'Existing Control node path for theme application or signal scanning' },
        nodeType: { type: 'string', description: 'Control node type, such as Control, Label, Button, or PanelContainer.' },
        nodeName: { type: 'string', description: 'Name for the new UI node' },
        text: { type: 'string', description: 'Optional text for Label/Button-like nodes' },
        themePath: { type: 'string', description: 'Project-relative Theme .tres/.res path for create_theme/apply_theme' },
        templateName: { type: 'string', enum: ['hud_bar', 'menu_panel', 'dialog_box'], description: 'Reusable Control tree template for create_template' },
        targetNodePath: { type: 'string', description: 'Signal receiver node path for auto_connect_signals' },
        signalMappings: { type: 'array', items: { type: 'object' }, description: 'Optional signal mappings: [{ nodePath, signalName, methodName }]' },
        colors: { type: 'object', description: 'Theme colors keyed by Type/name, such as {"Label/font_color": Color}' },
        constants: { type: 'object', description: 'Theme constants keyed by Type/name' },
        fontSizes: { type: 'object', description: 'Theme font sizes keyed by Type/name' },
        styleboxes: { type: 'object', description: 'Theme StyleBoxFlat entries keyed by Type/name' },
        layoutPreset: {
          type: 'string',
          enum: ['full_rect', 'center', 'top_left'],
          description: 'Optional Control layout preset.',
        },
        properties: { type: 'object', description: 'Optional node properties' },
      },
      required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
    },
  },
  {
    name: 'material',
    description: 'Create, read, update, and apply Godot material resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        action: {
          type: 'string',
          enum: ['create', 'read', 'update', 'apply', 'list_templates', 'create_from_template'],
          description: 'Material action. Defaults to read.',
        },
        resourcePath: { type: 'string', description: 'Project-relative material resource path for create/read/update' },
        materialPath: { type: 'string', description: 'Project-relative material resource path for apply' },
        materialType: {
          type: 'string',
          enum: ['StandardMaterial3D', 'CanvasItemMaterial', 'ShaderMaterial'],
          description: 'Material type for create. Defaults to StandardMaterial3D.',
        },
        shaderPath: { type: 'string', description: 'Project-relative .gdshader path when creating ShaderMaterial' },
        presetName: { type: 'string', enum: ['unlit', 'lit', 'emissive', 'transparent'], description: 'Optional material preset applied before custom properties' },
        templateName: {
          type: 'string',
          enum: ['block_unlit', 'emissive_pickup', 'transparent_ghost', 'ui_canvas'],
          description: 'Reusable material template for create_from_template.',
        },
        properties: { type: 'object', description: 'Material properties to set, using structured Variant values where needed' },
        scenePath: { type: 'string', description: 'Project-relative scene path for apply' },
        nodePath: { type: 'string', description: 'Target node path for apply' },
        propertyName: { type: 'string', description: 'Node material property to set. Defaults to material_override.' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'shader',
    description: 'Create, read, inspect, and configure ShaderMaterial parameters',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        action: {
          type: 'string',
          enum: ['create', 'read', 'inspect', 'set_parameters'],
          description: 'Shader action. Defaults to read.',
        },
        shaderPath: { type: 'string', description: 'Project-relative .gdshader path' },
        materialPath: { type: 'string', description: 'Project-relative ShaderMaterial resource path for set_parameters' },
        shaderType: { type: 'string', enum: ['canvas_item', 'spatial', 'particles'], description: 'Shader type for generated shader code' },
        code: { type: 'string', description: 'Full shader code for create' },
        includePaths: { type: 'array', items: { type: 'string' }, description: 'Known shader include paths to report alongside parsed #include directives' },
        textureDefaults: { type: 'object', description: 'Texture defaults keyed by sampler uniform name for generated ShaderMaterial setup' },
        parameters: { type: 'object', description: 'Shader parameter values for set_parameters' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'lighting',
    description: 'Create and list basic Godot light and environment nodes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list'], description: 'Lighting action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: {
          type: 'string',
          enum: ['DirectionalLight3D', 'PointLight3D', 'SpotLight3D', 'WorldEnvironment', 'PointLight2D', 'DirectionalLight2D'],
          description: 'Light/environment node type for create.',
        },
        nodeName: { type: 'string', description: 'Name for the new light/environment node' },
        properties: { type: 'object', description: 'Node properties to set, using structured Variant values where needed' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'particle',
    description: 'Create and list basic Godot particle emitter nodes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list'], description: 'Particle action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: {
          type: 'string',
          enum: ['GPUParticles2D', 'GPUParticles3D', 'CPUParticles2D', 'CPUParticles3D'],
          description: 'Particle node type for create. Defaults to GPUParticles2D.',
        },
        nodeName: { type: 'string', description: 'Name for the new particle node' },
        processMaterialType: {
          type: 'string',
          enum: ['ParticleProcessMaterial'],
          description: 'Optional process material type for GPU particle nodes.',
        },
        amount: { type: 'number', description: 'Particle amount' },
        lifetime: { type: 'number', description: 'Particle lifetime in seconds' },
        emitting: { type: 'boolean', description: 'Whether particles emit immediately' },
        properties: { type: 'object', description: 'Additional node properties' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'tilemap',
    description: 'Create, list, and edit TileMapLayer or legacy TileMap nodes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: {
          type: 'string',
          enum: [
            'create',
            'list',
            'create_tileset',
            'add_atlas_source',
            'set_tile_metadata',
            'set_tile_collision',
            'set_tile_navigation',
            'set_terrain',
            'set_cell',
            'batch_set_cells',
            'fill_rect',
            'paint_random',
            'apply_template',
          ],
          description: 'TileMap or TileSet action. Defaults to list.',
        },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodePath: { type: 'string', description: 'TileMapLayer or TileMap node path for painting actions' },
        nodeType: { type: 'string', enum: ['TileMapLayer', 'TileMap'], description: 'Tile map node type. Defaults to TileMapLayer on Godot versions that support it.' },
        nodeName: { type: 'string', description: 'Name for the new tile map node' },
        tileSetPath: { type: 'string', description: 'Optional project-relative TileSet .tres/.res path to assign' },
        texturePath: { type: 'string', description: 'Project-relative texture path for add_atlas_source' },
        atlasSourceId: { type: 'number', description: 'TileSet atlas source id for TileSet actions' },
        tileSize: { type: 'object', description: 'Atlas tile size, for example { "width": 16, "height": 16 } or a Vector2i value' },
        margin: { type: 'object', description: 'Atlas source margin as Vector2i-like value' },
        separation: { type: 'object', description: 'Atlas source separation as Vector2i-like value' },
        tiles: { type: 'array', items: { type: 'object' }, description: 'Tile definitions for atlas source creation or painting templates' },
        cell: { type: 'object', description: 'Cell coordinates for set_cell, e.g. { "type": "Vector2", "value": [0, 0] }' },
        sourceId: { type: 'number', description: 'Tile source id for set_cell. Defaults to -1, which erases the cell.' },
        atlasCoords: { type: 'object', description: 'Atlas coords for set_cell. Defaults to Vector2i(-1, -1).' },
        alternativeTile: { type: 'number', description: 'Alternative tile id for set_cell. Defaults to 0.' },
        cells: { type: 'array', items: { type: 'object' }, description: 'Cells for batch_set_cells. Each item supports cell, source_id, atlas_coords, alternative_tile.' },
        rect: { type: 'object', description: 'Rectangle for fill_rect: { "x":0, "y":0, "width":10, "height":10 }' },
        metadata: { type: 'object', description: 'Custom tile metadata for set_tile_metadata' },
        customDataLayers: { type: 'array', items: { type: 'object' }, description: 'TileSet custom data layer definitions with name and type' },
        physicsLayer: { type: 'number', description: 'TileSet physics layer index for collision data. Defaults to 0.' },
        navigationLayer: { type: 'number', description: 'TileSet navigation layer index for navigation data. Defaults to 0.' },
        terrainSet: { type: 'number', description: 'Terrain set index. Defaults to 0.' },
        terrain: { type: 'number', description: 'Terrain index inside the terrain set. Defaults to 0.' },
        terrainName: { type: 'string', description: 'Optional terrain name when configuring terrain data' },
        polygons: { type: 'array', items: { type: 'array' }, description: 'Collision or navigation polygons as arrays of points' },
        terrainBits: { type: 'object', description: 'Terrain peering bits keyed by Godot terrain bit integer' },
        weightedTiles: { type: 'array', items: { type: 'object' }, description: 'Weighted tile choices for randomized painting' },
        seed: { type: 'number', description: 'Deterministic seed for randomized map painting' },
        templateName: { type: 'string', enum: ['survivor_arena', 'room_grid'], description: 'Reusable map template name for apply_template' },
        tilePalette: { type: 'object', description: 'Named tile choices for templates, such as floor, wall, and obstacle' },
        properties: { type: 'object', description: 'Additional node properties' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'geometry',
    description: 'Create and list basic 2D geometry/debug drawing nodes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list'], description: 'Geometry action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: { type: 'string', enum: ['Polygon2D', 'Line2D', 'Marker2D'], description: 'Geometry node type. Defaults to Polygon2D.' },
        nodeName: { type: 'string', description: 'Name for the new geometry node' },
        properties: { type: 'object', description: 'Node properties, such as polygon, points, width, color, or position' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'physics',
    description: 'Create and list physics bodies, areas, and collision shapes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list'], description: 'Physics action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: {
          type: 'string',
          enum: ['CharacterBody2D', 'RigidBody2D', 'StaticBody2D', 'Area2D', 'CollisionShape2D', 'CharacterBody3D', 'RigidBody3D', 'StaticBody3D', 'Area3D', 'CollisionShape3D'],
          description: 'Physics node type. Defaults to StaticBody2D.',
        },
        nodeName: { type: 'string', description: 'Name for the new physics node' },
        shapeType: { type: 'string', enum: ['RectangleShape2D', 'CircleShape2D', 'CapsuleShape2D', 'BoxShape3D', 'SphereShape3D', 'CapsuleShape3D'], description: 'Shape resource for CollisionShape nodes' },
        properties: { type: 'object', description: 'Node or shape properties, including collision_layer and collision_mask' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'navigation',
    description: 'Create and list NavigationRegion and NavigationAgent nodes',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list', 'set_polygon'], description: 'Navigation action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: { type: 'string', enum: ['NavigationRegion2D', 'NavigationAgent2D', 'NavigationRegion3D', 'NavigationAgent3D', 'NavigationObstacle2D', 'NavigationObstacle3D'], description: 'Navigation node type. Defaults to NavigationRegion2D.' },
        nodeName: { type: 'string', description: 'Name for the new navigation node' },
        nodePath: { type: 'string', description: 'Navigation node path for set_polygon' },
        points: { type: 'array', items: { type: 'object' }, description: '2D points for NavigationRegion2D polygon vertices' },
        properties: { type: 'object', description: 'Node properties such as radius, path_desired_distance, or debug_enabled' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'audio',
    description: 'Create and list AudioStreamPlayer nodes with basic playback configuration',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the Godot project directory' },
        scenePath: { type: 'string', description: 'Project-relative scene path' },
        action: { type: 'string', enum: ['create', 'list', 'list_buses'], description: 'Audio action. Defaults to list.' },
        parentNodePath: { type: 'string', description: 'Parent node path for create. Defaults to root.' },
        nodeType: { type: 'string', enum: ['AudioStreamPlayer', 'AudioStreamPlayer2D', 'AudioStreamPlayer3D'], description: 'Audio node type. Defaults to AudioStreamPlayer.' },
        nodeName: { type: 'string', description: 'Name for the new audio node' },
        streamPath: { type: 'string', description: 'Optional project-relative audio stream path' },
        bus: { type: 'string', description: 'Audio bus name. Defaults to Master.' },
        volumeDb: { type: 'number', description: 'Volume in decibels' },
        autoplay: { type: 'boolean', description: 'Whether the player starts automatically' },
        properties: { type: 'object', description: 'Additional audio player properties' },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'read_script_file',
    description: 'Read a GDScript file from a Godot project',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'analyze_script_references',
    description: 'Analyze a GDScript file for class, functions, exports, node paths, and resource references',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'check_gdscript_syntax',
    description: 'Run Godot --check-only against a GDScript file and return diagnostics',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scriptPath: {
          type: 'string',
          description: 'Path to the GDScript file, relative to project or res://',
        },
      },
      required: ['projectPath', 'scriptPath'],
    },
  },
  {
    name: 'create_scene',
    description: 'Create a new Godot scene file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path where the scene file will be saved (relative to project)',
        },
        rootNodeType: {
          type: 'string',
          description: 'Type of the root node (e.g., Node2D, Node3D)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_scene_tree',
    description: 'Return the node tree for a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_node_properties',
    description: 'Read selected properties from a node in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        propertyNames: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional property names to read. Defaults to name, type, position, visible, script.',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'update_node_properties',
    description: 'Update properties on a node in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        properties: {
          type: 'object',
          description: 'Properties to update. Use { "type": "Vector2", "value": [x, y] } for Vector2 values.',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
    },
  },
  {
    name: 'rename_node',
    description: 'Rename a node in a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the node (e.g., "root/World/Player" or "World/Player")',
        },
        newName: {
          type: 'string',
          description: 'New node name',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'newName'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a non-root node from a Godot scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the non-root node to delete',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath'],
    },
  },
  {
    name: 'add_node',
    description: 'Add a node to an existing scene',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        parentNodePath: {
          type: 'string',
          description: 'Path to the parent node (e.g., "root" or "root/Player")',
        },
        nodeType: {
          type: 'string',
          description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
        },
        nodeName: {
          type: 'string',
          description: 'Name for the new node',
        },
        properties: {
          type: 'object',
          description: 'Optional properties to set on the node',
        },
      },
      required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
    },
  },
  {
    name: 'load_sprite',
    description: 'Load a sprite into a Sprite2D node',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        nodePath: {
          type: 'string',
          description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
        },
        texturePath: {
          type: 'string',
          description: 'Path to the texture file (relative to project)',
        },
      },
      required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
    },
  },
  {
    name: 'export_mesh_library',
    description: 'Export a scene as a MeshLibrary resource',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (.tscn) to export',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the mesh library (.res) will be saved',
        },
        meshItemNames: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional: Names of specific mesh items to include (defaults to all)',
        },
      },
      required: ['projectPath', 'scenePath', 'outputPath'],
    },
  },
  {
    name: 'save_scene',
    description: 'Save changes to a scene file',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scenePath: {
          type: 'string',
          description: 'Path to the scene file (relative to project)',
        },
        newPath: {
          type: 'string',
          description: 'Optional: New path to save the scene to (for creating variants)',
        },
      },
      required: ['projectPath', 'scenePath'],
    },
  },
  {
    name: 'get_uid',
    description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        filePath: {
          type: 'string',
          description: 'Path to the file (relative to project) for which to get the UID',
        },
      },
      required: ['projectPath', 'filePath'],
    },
  },
  {
    name: 'get_capabilities',
    description: 'Return supported godot-devtool MCP tools, compatibility aliases, run modes, risk levels, and input schemas',
    inputSchema: {
      type: 'object',
      properties: {
        includeAliases: {
          type: 'boolean',
          description: 'Include compatibility alias entries. Defaults to true.',
        },
        includeSchemas: {
          type: 'boolean',
          description: 'Include input schemas for tools. Defaults to true.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_project_uids',
    description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
      },
      required: ['projectPath'],
    },
  },
];

for (const [aliasName, canonicalName] of Object.entries(GODOT_TOOL_ALIASES)) {
  const canonicalTool = GODOT_TOOL_DEFINITIONS.find((tool) => tool.name === canonicalName);
  if (canonicalTool) {
    GODOT_TOOL_DEFINITIONS.push({
      ...canonicalTool,
      name: aliasName,
      description: `Compatibility alias for ${canonicalName}. ${canonicalTool.description}`,
      canonicalName,
    });
  }
}
