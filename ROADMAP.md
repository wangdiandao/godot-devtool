# godot-devtool Roadmap

English | [中文](ROADMAP.zh-CN.md)

Completed releases are tracked in [CHANGELOG.md](CHANGELOG.md). This file only tracks future work after `2.4.1`.

## Future Versions

### Validation Project

- Use the v2 WebSocket plugin and MCP route groups to develop `E:/test` into a block-based survivor-like game.
- Validate native project inspection, headless scene/resource editing, live editor commands, runtime input/screenshot routes, export checks, and audit logging.
- Target a playable main scene with player movement, enemy spawning, automatic attacks, experience/leveling, simple UI, audio placeholders, and export configuration.

### Route Hardening

- Expand end-to-end Godot fixtures for every advertised `editor_ws` and `runtime_ws` route.
- Add regression cases for UndoRedo mutations, runtime screenshots, runtime property writes, runtime input routes, recording/replay routes, and QA assertions.
- Keep `get_capabilities` as the source of truth for route support and remove any route that cannot be operated by native, headless, editor WebSocket, or runtime WebSocket execution.
