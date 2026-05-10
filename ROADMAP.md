# godot-devtool Roadmap

English | [中文](ROADMAP.zh-CN.md)

Completed releases are tracked in [CHANGELOG.md](CHANGELOG.md). This file only tracks future work after `2.8.3`.

## Future Versions

### Route Hardening

- Expand end-to-end Godot fixtures for every advertised `editor_ws` and `runtime_ws` route.
- Add broader regression cases for live editor dock states, runtime screenshots, runtime property writes, runtime input routes, recording/replay routes, and QA assertions.
- Keep `get_capabilities` as the source of truth for route support and remove any route that cannot be operated by native, headless, editor WebSocket, or runtime WebSocket execution.

