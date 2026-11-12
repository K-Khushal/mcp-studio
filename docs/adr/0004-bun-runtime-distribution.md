# Bun-only runtime, distributed via `bunx`

The Studio Server depends on Bun (`Bun.serve`, `bun:sqlite`), so it is distributed as an npm package run with `bunx mcp-studio-app` (npm refused the name `mcp-studio` as too similar to `mcpstudio`), not Node `npx`. The Studio Server serves the built web app and the WebSocket on one port. Users without Bun get standalone binaries built with `bun build --compile` (five targets, attached to draft GitHub releases); a Node port was rejected.
