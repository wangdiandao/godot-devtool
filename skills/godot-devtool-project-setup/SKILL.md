---
name: godot-devtool-project-setup
description: "Use with godot-devtool when installing the addon, checking plugin state, configuring a Godot project, or preparing export/project settings."
metadata:
  version: "3.1.0"
  mcp_server: "godot-devtool"
---

# Godot Devtool Project Setup

Load this after the `godot-devtool` router when the task is install, upgrade, project inspection, settings, InputMap, autoload, export, or bridge-port diagnosis.

## Start

Use the lightweight catalog first:

    get_capabilities { "workflow": "project_setup", "includeSchemas": true }

Then inspect:

    get_godot_version
    get_project_info
    plugin_status

If the project path is unknown, call `list_projects` for a focused parent directory.

## Install Or Upgrade

Use:

    plugin_install { "projectPath": "...", "overwrite": true, "websocketPort": 8766 }
    plugin_status

Require evidence that addon files are installed, the runtime autoload is present, bridge config uses the intended port, and no unexpected occupied-port diagnostic blocks the listener.

If port `8766` is occupied:

    plugin_cleanup_port { "port": 8766 }

Only stop a listener when the dry-run result proves it is a stale godot-devtool process or the user explicitly approves the exact PID.

## Configure

Prefer structured project tools over editing `project.godot` by hand:

    project_get_settings
    project_set_setting
    project_input_action
    get_autoload
    add_autoload
    remove_autoload
    get_export_presets
    check_export_presets
    update_export_preset
    export_matrix
    generate_ci_snippet

Run `run_project_checks` before finishing broader project setup work.
