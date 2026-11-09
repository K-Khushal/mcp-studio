# CLAUDE.md

## Output Rules
- Extremely concise. Sacrifice grammar for concision.

## Commands
Bun required. Add to PATH if needed: `export PATH="$HOME/.bun/bin:$PATH"`

```bash
bun install && bun dev       # install + start all packages (Turborepo)
# Required gates, in order (also run on every PR and push to main)
bun typecheck
bun lint
bun run test                # Turbo: server bun:test + web/mcp-client Vitest
bun run build

bun --filter @mcp-studio/web dev
bun --filter @mcp-studio/server dev    # bun --watch src/index.ts
bun --filter @mcp-studio/mcp-client test

cd packages/mcp-client && bun vitest run src/__tests__/log.test.ts

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
       → SessionManager → StdioMCPClient | StreamableHTTPClient
       → MCP process (STDIO) or remote (HTTP)
```
`StreamableHTTPClient` falls back to legacy SSE (ADR-0005); no separate SSE class.

**`SessionManager`** (`apps/server/src/session/manager.ts`) — owns the single active MCP connection, handles all `ClientMessage`s, interpolates Variables before every Call.

**Zustand store** (`apps/web/src/store/index.ts`) — `handleServerMessage()` at bottom is sole mutation point for `ServerMessage` events; registered via `transport.onMessage()` at connect time.

### Message protocol (`packages/types/src/messages.ts`)
`ClientMessage` → server: `connect` (stdio|http, optional `verbose` and `connectionId` for OAuth Sign-in), `set_verbose`, `invoke`, `invoke_prompt`, `cancel`, `disconnect`, `list_tools`, `list_prompts`, `elicitation_response`
`ServerMessage` → browser: `connected` (tools, prompts, `serverInfo`, `protocolVersion`, `httpVariant`), `session_phase`, `progress`, `cancelled`, `result`, `prompt_result`, `error`, `log`, `disconnected`, `status`, `tools_listed`, `prompts_listed`, `http_response`, `elicitation_request`, `elicitation_closed`, `oauth_authorize`
`requestId` ties progress, results, errors and cancellation to the originating tool or prompt Call. Browser supplies it (SessionManager generates one for older clients). Every tools/call gets a progressToken; per-Call AbortSignals send MCP cancellation on Cancel/timeout. `session_phase` reports transport-start and initialize durations.
`log` carries `source` (`protocol`|`server`|`studio`) + optional `payload` (`direction`,`method`,`id`,`body`). `verbose` on: `BaseMCPClient` logs every JSON-RPC frame as protocol DEBUG (live via `set_verbose`); `notifications/message` + STDIO stderr → server source (`mcp-client/src/log.ts`). Store buffers connect-time logs (`handshakeLogs`), adopts on `connected`.

### Persistence
SQLite at `~/.mcp-studio/studio.db` via **Drizzle ORM** (`drizzle-orm/bun-sqlite`). Schema: `apps/server/src/db/schema.ts` (tables: `collections`, `connections`, `environments`, `oauth_credentials`). Queries: `db/queries/`. Migrations in `apps/server/drizzle/`, auto-applied at startup. No Call history or diff (ADR-0002); Calls are ephemeral. `STUDIO_DB_PATH` env var overrides DB path — set to `:memory:` for test isolation. `Connection` (table renamed from `requests`, migration `0002`) has no `tool`/`params` — tools fetched live after connect.

REST (granular CRUD, no bulk replace):
- `GET/POST /collections`, `PATCH/DELETE /collections/:id`
- `POST /collections/:id/connections`, `PATCH|DELETE /collections/:id/connections/:connId`
- `GET/POST /environments`, `PATCH/DELETE /environments/:id`
- `DELETE /collections/:id/connections/:connId/oauth` (sign out), `GET /oauth/callback` (authorization redirect), `GET /health`

### OAuth (ADR-0006)
HTTP auth `{type:"oauth"}`: `StreamableHTTPClient.wrappedFetch` intercepts 401/insufficient-scope and calls `StudioOAuthProvider.authenticate()` (`packages/mcp-client/src/oauth.ts`); SDK does discovery/DCR/PKCE/refresh via a separate auth fetch (30s timeout). Flows coalesce per credential generation (retired on sign-out/URL change; stale saves rejected); only connecting Sessions receive `oauth_authorize`; `OAuthRedirects` (`apps/server/src/oauth/redirects.ts`) delivers the code. Browser approval only at connect; failed refresh in a Call needs reconnect. Tokens must never reach logs or `ServerMessage`s (tested). File-backed DBs use 0700 dir / 0600 file. Details: ADR-0006.

Dev: Vite proxies `/api` → `localhost:3000`; WS direct to `ws://localhost:3000/ws` (`VITE_WS_URL` overrides). Production CLI (`bunx mcp-studio [--port N] [--no-open]`, `apps/server/src/cli.ts`) serves built web assets, REST (also under `/api`) and `/ws` on one loopback port; the browser uses same-origin URLs. Package build bundles CLI + copies web assets and Drizzle migrations into `dist/` (paths relative to bundle). `bun scripts/build-binary.ts` compiles a standalone CLI; release workflow builds five targets, draft releases only.

### Env interpolation
`apps/server/src/env/interpolate.ts` resolves Variables before connect and every Call, recursively. `{{name}}` with `[A-Za-z0-9_]+` is a reference, no escape syntax; `{{ name }}` (spaces) not matched. Unresolved Variables block connect/Call. Only values interpolated, not keys.

Variable editors (`components/shared/variable-input.tsx`) keep native editing, painting token backgrounds in a scroll-synced mirror. Hover previews mask names containing secret/token/password/passwd/credential/key (display heuristic, not a secrecy boundary).

### Frontend structure
Single screen (`pages/home.tsx`): collections sidebar + studio view + logs panel; no view switching or icon sidebar.  
Shell: `src/components/shell/` (TopNav → SessionInfo + ThemeToggle + settings dialog, StatusBar); SessionInfo reads store `serverInfo`/`protocolVersion`/`connectionConfig`.  
Features: `src/components/{auth,connection,tools,prompts,response,logs,collections,environments,configuration,shared}/`  
STDIO form: store `stdio` (`StdioDraft`) via `setStdio`; `store/connection-form.ts` converts draft ↔ `StdioConfig` (blanks dropped), builds `ConnectionConfig` for autosave PATCH and Connect; `connectionUrl` HTTP-only. STDIO settings collapse to a summary row while the selected Connection is connected (expanded otherwise; per-Connection override in `ConnectionPanel`, reset when the Session flips); request/response split defaults 60/40 so Echo args + Run fit at 1366×768. Sidebar double-click connects; clicking/double-clicking another Connection while a Session is live asks, then disconnects.  
Collections CRUD in sidebar; clicking a saved Connection calls `loadConnection()` → sets `selectedConnectionId` + connection form (transport/url/stdio/auth/headers) from the saved config or local draft, and blanks tools/prompts/selection/params/response/logs (Connections store no tool/params, ADR-0003). Home shows blank state when `selectedConnectionId === null`.  
Each Call captures its tool outputSchema in ResponseState; Pretty validates structuredContent with Ajv (2020-12 default, draft-07 if declared; else Cannot validate).

ToolPanel renders dynamic form from `selectedTool.inputSchema` (JSON Schema → fields).  
Settings (`MCPConfig`: `requestTimeout`, `autoScrollLogs`, `verboseLogging`, `theme`) in `localStorage` `mcp-studio-config` via `store/config.ts`; `setConfig` writes store + localStorage, re-applies theme. `requestTimeout` (s) sent with each Call, enforced by SessionManager; `verboseLogging` sent with `connect` and on change. Environments are global.

### Adding a new ServerMessage type
1. Add variant → `packages/types/src/messages.ts`
2. Handle → `handleServerMessage()` in `apps/web/src/store/index.ts`
3. Emit → `SessionManager` in `apps/server/src/session/manager.ts`

### TS config
`tsconfig.base.json` extended by all packages. Web: `moduleResolution: Bundler`, `@/*` → `src/`. Server adds `bun-types`. `exactOptionalPropertyTypes` disabled (see Gotchas).

## Domain docs
`GLOSSARY.md` (saved entity = **Connection**, formerly "request"), `docs/adr/`. Read before changing domain behaviour.

## Self-Maintenance
Update after: new package/route/transport, schema change, arch decision, bug >15 min. One-two sentences.

## Gotchas
- **`exactOptionalPropertyTypes` disabled** — MCP SDK returns `string | undefined`; enabling breaks mcp-client type assignments.
- **`tsc -b` removed from web build** — `tsconfig.node.json` (`composite`) conflicted with Vite DOM types; `bun typecheck` is separate.
- **Negotiated protocol version** — BaseMCPClient captures the initialize result via transport.setProtocolVersion; SessionManager sends it in `connected`. getServerVersion() is only the MCP Server implementation.
- **`cwd` must be spread conditionally** — `StdioClientTransport` uses `exactOptionalPropertyTypes` internally: `...(cwd ? { cwd } : {})`.
- **Env synced per-message, not per-session** — `setActiveEnv()` called on every WS message; env changes take effect immediately without reconnect.
- **Server tests use `bun:test`, not vitest** — Vite can't resolve native `bun:sqlite`; web tests use vitest + jsdom.
- **Loopback only** — server listens on `localhost`, rejects non-loopback `Host` and foreign `Origin` (extra allowed origin from `CORS_ORIGIN`, default `http://localhost:5173` in dev, none in production).
- **`inheritSystemEnv=false` still gets the MCP SDK's minimal safe env** (PATH, HOME, TERM, …) so commands resolve; only arbitrary parent vars are excluded.

## Tests
Harness, fixtures (STDIO/HTTP/OAuth), elicitation and live-Call coverage: `docs/testing.md`. Session seam: `cd apps/server && bun test src/__tests__/session-protocol.test.ts`.
