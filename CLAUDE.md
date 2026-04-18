# CLAUDE.md

## Output Rules
- Extremely concise. Sacrifice grammar for concision.

## Commands
Bun required. Add to PATH if needed: `export PATH="$HOME/.bun/bin:$PATH"`

```bash
bun install && bun dev       # install + start all packages (Turborepo)
bun typecheck / build / test

bun --filter @mcp-studio/web dev
bun --filter @mcp-studio/server dev    # bun --watch src/index.ts
bun --filter @mcp-studio/mcp-client test

cd packages/mcp-client && bun vitest run src/__tests__/stdio-client.test.ts
```

Ports: frontend `5173`, backend WS `ws://localhost:3000/ws`, REST `localhost:3000`.

## Architecture

```
apps/server/         Bun — WebSocket server + SessionManager + persistence
apps/web/            React 19 + Vite + Tailwind
packages/types/      Shared TS types, no runtime code
packages/mcp-client/ MCP SDK wrapper, no Bun/browser deps
```

```
Browser → WebSocketTransport → Bun WS server
       → SessionManager → StdioMCPClient | SSEMCPClient
       → MCP process (STDIO) or remote (SSE)
```

**`SessionManager`** (`apps/server/src/session/manager.ts`) — owns single active MCP connection, handles all `ClientMessage` types, interpolates `{{VAR_NAME}}` before every invoke.

**Zustand store** (`apps/web/src/store/index.ts`) — `handleServerMessage()` at bottom is sole mutation point for `ServerMessage` events; registered via `transport.onMessage()` at connect time.

### Message protocol
`ClientMessage` → server: `connect` (stdio|sse), `invoke`, `invoke_prompt`, `disconnect`, `list_tools`, `list_prompts`  
`ServerMessage` → browser: `connected`, `chunk`, `result`, `prompt_result`, `error`, `log`, `disconnected`, `status`, `tools_listed`, `prompts_listed`  
`requestId` ties `chunk`/`result`/`error` back to originating `invoke`.

### Persistence
`~/.mcp-studio/` — plain JSON, no DB. `apps/server/src/persistence/manager.ts`. REST: `/collections`, `/history`, `/environments`. Frontend proxies via Vite → `localhost:3000`.

### Env interpolation
`{{VAR_NAME}}` → `apps/server/src/env/interpolate.ts`. Runs before invoke + connect. `interpolateObject()` recurses into nested objects/arrays.

### Frontend structure
Views: `apps/web/src/views/`, switched by `activeView` in store.  
Shell: `src/components/shell/` (TopNav, IconSidebar, StatusBar).  
Features: `src/components/{connection,tools,prompts,response,logs,collections,history,environments,shared}/`

### Adding a new ServerMessage type
1. Add variant → `packages/types/src/messages.ts`
2. Handle → `handleServerMessage()` in `apps/web/src/store/index.ts`
3. Emit → `SessionManager` in `apps/server/src/session/manager.ts`

### TS config
Root `tsconfig.base.json` extended by all packages. Web: `moduleResolution: Bundler`, `@/*` → `src/`. Server adds `bun-types`. `exactOptionalPropertyTypes` disabled (see Gotchas).

## Self-Maintenance
Update after any session with: new package/route/transport, schema change, arch decision, or bug >15 min to diagnose. One-two sentences, drop oldest if bloated.

## Gotchas
- **`exactOptionalPropertyTypes` disabled** — MCP SDK returns `string | undefined`; enabling breaks mcp-client type assignments.
- **`tsc -b` removed from web build** — `tsconfig.node.json` (`composite: true`) conflicted with Vite's DOM types. `bun typecheck` is separate; `bun build` calls `vite build` directly.
- **`getServerVersion()` missing `protocolVersion`** — SDK doesn't expose it. Hardcoded `"2024-11-05"` in both clients.
- **`cwd` must be spread conditionally** — `StdioClientTransport` uses `exactOptionalPropertyTypes` internally: `...(cwd ? { cwd } : {})`.
- **Env synced per-message, not per-session** — `setActiveEnv()` called on every WS message; env changes take effect immediately without reconnect.
