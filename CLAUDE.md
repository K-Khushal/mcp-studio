# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. Bun is required (`~/.bun/bin/bun`); add it to PATH first if needed: `export PATH="$HOME/.bun/bin:$PATH"`.

```bash
bun install              # install all workspace deps
bun dev                  # start all packages in dev mode (Turborepo)
bun typecheck            # tsc --noEmit across all 4 packages
bun build                # production build (web: Vite, server: Bun native)
bun test                 # run Vitest across all packages

# Run a single package's script
bun --filter @mcp-studio/web dev
bun --filter @mcp-studio/server dev   # bun --watch src/index.ts
bun --filter @mcp-studio/mcp-client test

# Run one test file
cd packages/mcp-client && bun vitest run src/__tests__/stdio-client.test.ts
```

Dev servers: frontend at `http://localhost:5173`, backend WebSocket at `ws://localhost:3000/ws`, REST at `http://localhost:3000`.

## Architecture

### Monorepo layout

```
apps/server/      Bun backend — WebSocket server + session manager + persistence
apps/web/         React 19 + Vite + Tailwind frontend
packages/types/   Shared TS types only — no runtime code, imported by both apps
packages/mcp-client/  MCP SDK wrapper — independently testable, no Bun/browser deps
```

### Data flow

```
Browser → WebSocketTransport → Bun WebSocket server
       → SessionManager → MCPClient (StdioMCPClient | SSEMCPClient)
       → MCP server process (STDIO) or remote endpoint (SSE)
```

The frontend **never calls the MCP server directly**. All MCP communication goes through the Bun backend over WebSocket. The browser-to-backend protocol is the `ClientMessage` / `ServerMessage` discriminated union types in `packages/types/src/messages.ts`.

### Key abstractions

**`StudioTransport` interface** (`packages/types/src/studio-transport.ts`) — the frontend only talks to this interface. `WebSocketTransport` is the live impl (`apps/web/src/transport/websocket-transport.ts`). Swapping in an `ElectronIPCTransport` later requires zero UI changes.

**`MCPClientInterface`** (`packages/mcp-client/src/types.ts`) — `SessionManager` depends on this, not on a concrete class. `StdioMCPClient` and `SSEMCPClient` both implement it identically.

**`SessionManager`** (`apps/server/src/session/manager.ts`) — owns the single active MCP connection. All `ClientMessage` types are handled here. Reads the active environment and interpolates `{{VAR_NAME}}` before every invoke.

**Zustand store** (`apps/web/src/store/index.ts`) — single store for all app state. The module-level `handleServerMessage()` function (bottom of the file) is the only place `ServerMessage` events mutate state — it calls `useStore.setState()` directly and is registered via `transport.onMessage()` at connect time.

### Message protocol

`ClientMessage` (browser → server): `connect` (stdio or sse), `invoke`, `invoke_prompt`, `disconnect`, `list_tools`, `list_prompts`.

`ServerMessage` (server → browser): `connected`, `chunk`, `result`, `prompt_result`, `error`, `log`, `disconnected`, `status`, `tools_listed`, `prompts_listed`.

Every `invoke` / `invoke_prompt` produces a `requestId` that ties `chunk` / `result` / `error` responses back to the original request.

### Persistence

All data lives in `~/.mcp-studio/` as plain JSON files — no database. Written by `apps/server/src/persistence/manager.ts`. Exposed as REST endpoints (`/collections`, `/history`, `/environments`) consumed by the frontend via `fetch('/api/...')` (Vite dev proxy → `localhost:3000`).

### Environment variable interpolation

`{{VAR_NAME}}` syntax is resolved in `apps/server/src/env/interpolate.ts`. It runs server-side before tool invocation and before connecting (for headers/env). `interpolateObject()` recurses into nested objects and arrays.

### Frontend component structure

Views (`apps/web/src/views/`) are top-level route-like components switched by `activeView` in the store. Shell components (`TopNav`, `IconSidebar`, `StatusBar`) live in `src/components/shell/`. Feature components go under `src/components/{connection,tools,prompts,response,logs,collections,history,environments,shared}/` — most are stubs to be implemented phase by phase per the PRD timeline.

### TypeScript config

`tsconfig.base.json` at root is extended by all packages. `apps/web` uses `moduleResolution: Bundler` with `@/*` alias to `src/`. `apps/server` adds `bun-types`. The `exactOptionalPropertyTypes` flag is intentionally disabled — the MCP SDK's types don't satisfy it.

### Adding a new server message type

1. Add the variant to `ServerMessage` in `packages/types/src/messages.ts`
2. Handle it in `handleServerMessage()` in `apps/web/src/store/index.ts`
3. Emit it from `SessionManager` in `apps/server/src/session/manager.ts`

---

## Self-Maintenance Rules

After every session that includes a major change, update this file before closing. "Major change" = new package/route/transport, schema change, architectural decision, or a bug that took >15 min to diagnose.

**What to update and where:**

| Change type | Section to update |
|---|---|
| New package, route, or transport | Architecture → relevant subsection |
| New `ClientMessage` / `ServerMessage` variant | Message protocol |
| New env var or config knob | Commands or Architecture |
| Tricky bug or non-obvious fix | Gotchas (below) |
| Decision that was debated | Architecture (add a one-line "why") |

Keep entries short — one or two sentences max. If a section grows unwieldy, summarize and drop the oldest entries.

---

## Gotchas

- **`exactOptionalPropertyTypes` is disabled** — MCP SDK types return `string | undefined` for optional fields; enabling this flag breaks third-party type assignments throughout `mcp-client`.
- **`tsc -b` removed from web build** — `tsconfig.node.json` (`composite: true`) caused DOM-type conflicts with Vite's own type declarations. Typecheck runs separately via `bun typecheck`; `bun build` calls `vite build` directly.
- **`getServerVersion()` has no `protocolVersion` field** — The MCP SDK's return type does not expose it. Hardcoded to `"2024-11-05"` in both clients until the SDK exposes it.
- **`cwd` must be spread conditionally** — `StdioClientTransport` uses `exactOptionalPropertyTypes` internally; pass `cwd` only when defined: `...(cwd ? { cwd } : {})`.
- **Active env is synced per-message, not per-session** — `SessionManager.setActiveEnv()` is called from the WebSocket `message` handler on every incoming message so env changes take effect immediately without reconnecting.
