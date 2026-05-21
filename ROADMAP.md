# godot-devtool Roadmap

English | [中文](ROADMAP.zh-CN.md)

Completed releases are tracked in [CHANGELOG.md](CHANGELOG.md). This file only tracks future work after `3.1.0`.

The 3.0.0 architecture scope for shared broker usage, multi-agent MCP clients, multi-game instances, context-budget filtering, port cleanup, and split addon files is complete locally and is documented in [docs/superpowers/plans/2026-05-14-3.0.0-architecture.md](docs/superpowers/plans/2026-05-14-3.0.0-architecture.md).

## Future Versions

### Route Hardening

- Expand end-to-end Godot fixtures for every advertised `editor_ws` and `runtime_ws` route.
- Add broader regression cases for live editor dock states, runtime screenshots, runtime property writes, runtime input routes, recording/replay routes, and QA assertions.
- Keep `get_capabilities` as the source of truth for route support and remove any route that cannot be operated by native, headless, editor WebSocket, or runtime WebSocket execution.

