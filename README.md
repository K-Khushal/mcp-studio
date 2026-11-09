# MCP Studio

> The **Postman for MCP** — test, debug, and observe MCP servers locally.

---

## What it is

MCP Studio is a local developer tool for working with [Model Context Protocol](https://modelcontextprotocol.io) servers. It gives you a structured UI to invoke tools, inspect protocol traffic, manage environments, and replay past calls — everything `mcp-inspector` lacks.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Bun (WebSocket server + subprocess manager) |
| Monorepo | Turborepo + Bun workspaces |
| State | Zustand |
| Shared types | `packages/types` — discriminated union message protocol |
| MCP client | `packages/mcp-client` — wraps `@modelcontextprotocol/sdk` |

Theme: bunx shadcn@latest add https://tweakcn.com/r/themes/cmo5x7bmj000204l2bmnu3lgh
---

## Monorepo structure

```
apps/
  web/        React frontend       → localhost:5173
  server/     Bun backend          → localhost:3000

packages/
  types/      Shared TS types (ClientMessage, ServerMessage, MCPTool, …)
  mcp-client/ MCP SDK wrapper (StdioMCPClient, SSEMCPClient)
```

---

## Getting started

Requires [Bun](https://bun.sh). Once the npm package is published:

```bash
bunx mcp-studio
bunx mcp-studio --port 4000 --no-open
```

The CLI opens `http://localhost:3000`; the Studio Server serves the UI, REST API,
and `/ws` on that single port. `--port` changes it; `--no-open` suppresses the
browser launch. Data is stored in `~/.mcp-studio/studio.db`.

### Standalone binaries (no Bun required)

When a release is published, download the matching binary from
[GitHub Releases](https://github.com/K-Khushal/mcp-studio/releases):
`mcp-studio-linux-x64`, `mcp-studio-linux-arm64`, `mcp-studio-darwin-arm64`,
`mcp-studio-darwin-x64`, or `mcp-studio-windows-x64.exe`.

On Linux/macOS:

```bash
chmod +x mcp-studio-linux-x64
./mcp-studio-linux-x64 --port 4000 --no-open
```

On Windows, run `.\mcp-studio-windows-x64.exe --port 4000 --no-open` in PowerShell.
Open `http://localhost:4000`. Web assets and database migrations are embedded;
the binary extracts them to a temporary directory on startup. The database stays
at `~/.mcp-studio/studio.db` (override with `STUDIO_DB_PATH`). STDIO MCP Servers
still require their own runtimes and commands installed.

Maintainers: version tag pushes build all five targets and attach binaries to a
**draft** release. Manual workflow dispatch builds downloadable workflow artifacts
only. Publishing a release remains a manual step.

Run a production build from source today:

```bash
bun install
bun run build
bun dist/cli.js --port 4000 --no-open
bun run smoke
npm pack --dry-run
```

For development, run `bun dev` (web on 5173, Studio Server on 3000).
The Vite REST proxy remains unchanged. Bun is required; `npx` is unsupported.

---

## Supported transports

**STDIO** — spawns the MCP server as a subprocess. Configure command, args, working directory, and env vars. Supports importing from `claude_desktop_config.json`.

**HTTP / SSE** — connects to a remote MCP endpoint. Supports custom headers and `{{VAR_NAME}}` interpolation from the active environment.

---

## Features

- **Tool & Prompt invocation** — dynamic form builder (flat + one-level nesting) with raw JSON fallback
- **Live Calls** — live progress updates and cancellation
- **Protocol logs** — MCP events + raw stdout/stderr with separate filter toggles
- **Persistent history** — rolling last 50 invocations at `~/.mcp-studio/history.json`
- **Response diff** — side-by-side comparison of any two history entries
- **Collections** — save and replay tool calls at `~/.mcp-studio/collections.json`
- **Multi-environment** — Local / Staging / Production with `{{VAR}}` substitution in headers, connection strings, and params
- **Error UX** — toast notifications for connection errors, inline display for tool failures

All data is stored locally. No database, no auth, no cloud.

---

## Key differentiators vs `mcp-inspector`

| `mcp-inspector` gap | MCP Studio solution |
|---|---|
| Session-only | Persistent history + collections |
| No diff | Side-by-side response diff |
| No environments | Multi-env + `{{VAR}}` interpolation |
| No log separation | Protocol events vs subprocess output |
| No performance view | Request lifecycle timeline |

---

## Roadmap

- [ ] Automated value assertions per tool
- [ ] Snapshot testing + diff
- [ ] MCP Resources support
- [ ] Electron desktop wrapper

Call timeouts count active execution time. While an elicitation form is open, the
Call timeout pauses and resumes with its remaining time when the form closes.
Forms have a separate 120-second expiry. Since MCP forms carry no parent Call id,
all active Call timers pause while any form is open (the UI runs one Call at a time).
