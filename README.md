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

**Prerequisites:** [Bun](https://bun.sh) >= 1.0, Node >= 20

```bash
git clone git@github.com:K-Khushal/mcp-studio.git
cd mcp-studio
bun install

# Terminal 1 — backend
cd apps/server && bun dev

# Terminal 2 — frontend
cd apps/web && bun dev

# Or both via turbo (Start everything)
bun dev

# Or individually
bun --filter @mcp-studio/server dev   # backend  → ws://localhost:3000
bun --filter @mcp-studio/web dev      # frontend → http://localhost:5173
```

---

## Supported transports

**STDIO** — spawns the MCP server as a subprocess. Configure command, args, working directory, and env vars. Supports importing from `claude_desktop_config.json`.

**HTTP / SSE** — connects to a remote MCP endpoint. Supports custom headers and `{{VAR_NAME}}` interpolation from the active environment.

---

## Features

- **Tool & Prompt invocation** — dynamic form builder (flat + one-level nesting) with raw JSON fallback
- **Response streaming** — progressive rendering as chunks arrive
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
