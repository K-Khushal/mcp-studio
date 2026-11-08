# Bun-only runtime, distributed via `bunx`

The Studio Server depends on Bun (`Bun.serve`, `bun:sqlite`), so it is distributed as an npm package run with `bunx mcp-studio`, not Node `npx`. The Studio Server serves the built web app and the WebSocket on one port. Standalone binaries via `bun build --compile` are the planned path for users without Bun; a Node port was rejected.
