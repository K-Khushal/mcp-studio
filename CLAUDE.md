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

# Tests
cd apps/server && STUDIO_DB_PATH=:memory: bun test src/__tests__   # server DB/query tests (bun:test)
cd apps/web && bun vitest run src/__tests__                         # web store tests (vitest + jsdom)

# DB (run from apps/server)
bun db:generate   # generate migration after schema change
bun db:migrate    # apply migrations manually
bun drizzle-kit studio  # visual DB browser at https://local.drizzle.studio
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
SQLite at `~/.mcp-studio/studio.db` via **Drizzle ORM** (`drizzle-orm/bun-sqlite`). Schema: `apps/server/src/db/schema.ts` (tables: `collections`, `requests`, `environments`). Queries: `apps/server/src/db/queries/`. Migrations in `apps/server/drizzle/`, applied automatically on server startup via `migrate()`. History removed entirely. `STUDIO_DB_PATH` env var overrides DB path — set to `:memory:` for test isolation. `SavedRequest` has no `tool`/`params` fields — tools fetched live from MCP after connect (dropped in migration `0001`).

REST (granular CRUD, no bulk replace):
- `GET/POST /collections`, `PATCH/DELETE /collections/:id`
- `POST /collections/:id/requests`, `DELETE /collections/:id/requests/:reqId`
- `GET/POST /environments`, `PATCH/DELETE /environments/:id`

Frontend proxies via Vite → `localhost:3000`.

### Env interpolation
`{{VAR_NAME}}` → `apps/server/src/env/interpolate.ts`. Runs before invoke + connect. `interpolateObject()` recurses into nested objects/arrays.

### Frontend structure
Views: `apps/web/src/views/`, switched by `activeView` in store.  
Shell: `src/components/shell/` (TopNav, IconSidebar, StatusBar).  
Features: `src/components/{connection,tools,prompts,response,logs,collections,environments,shared}/`  
`activeView` values: `studio | collections | logs | settings` (history removed).  
Collections CRUD in `CollectionsView`; clicking a saved request calls `loadSavedRequest()` → sets `selectedRequestId`, `transport`, `connectionUrl`, `selectedTool`, `pendingParams` → ToolPanel pre-fills. Home shows blank state when `selectedRequestId === null`.  
ToolPanel renders dynamic form from `selectedTool.inputSchema` (JSON Schema → fields).  
`MCPConfig` persisted to `localStorage` (key: `mcp-studio-config`); `setConfig` writes atomically to store + localStorage. Environments are global (not per-collection/request).

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
- **Server tests use `bun:test`, not vitest** — `bun:sqlite` is a native Bun module; Vite's transformer can't resolve it. Server tests import from `"bun:test"`; web tests use vitest + jsdom.
- **AppState includes `selectedRequestId`, `transport`, `connectionUrl`** — moved from local component state to store so connection panel and home page stay in sync.
