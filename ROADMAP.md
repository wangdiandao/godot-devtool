# godot-devtool Roadmap

English | [中文](ROADMAP.zh-CN.md)

Completed releases are tracked in [CHANGELOG.md](CHANGELOG.md). This file only tracks future work after `2.3.2`.

## Future Versions

### 2.4.0 Runtime Compatibility Completion

- Replace receipt-only `simulate_key`, `simulate_mouse_click`, and `simulate_mouse_move` behavior with real Godot `InputEventKey`, `InputEventMouseButton`, and `InputEventMouseMotion` injection through `Input.parse_input_event`.
- Harden `simulate_action` with input-map validation, pressed/released coverage, strength checks, and regression tests that prove the target game scene receives the action.
- Make `simulate_sequence` deterministic by validating every event type, preserving per-event failures, honoring frame delays, and proving mixed action/key/mouse sequences in a running Godot project.
- Register and implement runtime routes for `start_recording`, `stop_recording`, and `replay_recording` in the installed runtime bridge, including `_input(event)` capture, JSON persistence, replay timing, and clear errors when recording files cannot be read or written.
- Update capability metadata so `get_capabilities`, README tables, and compatibility route descriptions distinguish fully implemented runtime routes from compatibility placeholders.
- Add end-to-end runtime fixtures that launch a Godot project, install the bridge, start the runtime autoload, execute each runtime input/recording tool, and verify observable scene state or generated artifacts instead of accepting completion receipts alone.

### Validation Project

- Use the v2 WebSocket plugin and MCP route groups to develop `E:/test` into a block-based survivor-like game.
- Validate native project inspection, headless scene/resource editing, live editor commands, runtime input/screenshot routes, export checks, and audit logging.
- Target a playable main scene with player movement, enemy spawning, automatic attacks, experience/leveling, simple UI, audio placeholders, and export configuration.

### Route Hardening

- Expand end-to-end Godot fixtures for every advertised `editor_ws` and `runtime_ws` route.
- Add regression cases for UndoRedo mutations, runtime screenshots, runtime property writes, runtime input routes, recording/replay routes, and QA assertions.
- Keep `get_capabilities` as the source of truth for route support and remove any route that cannot be operated by native, headless, editor WebSocket, or runtime WebSocket execution.
