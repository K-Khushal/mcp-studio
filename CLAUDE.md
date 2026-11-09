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
       → SessionManager → StdioMCPClient | StreamableHTTPClient
       → MCP process (STDIO) or remote (HTTP)
```

**`SessionManager`** (`apps/server/src/session/manager.ts`) — owns single active MCP connection, handles all `ClientMessage` types, interpolates `{{VAR_NAME}}` before every invoke.

**Zustand store** (`apps/web/src/store/index.ts`) — `handleServerMessage()` at bottom is sole mutation point for `ServerMessage` events; registered via `transport.onMessage()` at connect time.

### Message protocol
`ClientMessage` → server: `connect` (stdio|http, optional `verbose`), `set_verbose`, `invoke`, `invoke_prompt`, `disconnect`, `list_tools`, `list_prompts`  
`ServerMessage` → browser: `connected`, `chunk`, `result`, `prompt_result`, `error`, `log`, `disconnected`, `status`, `tools_listed`, `prompts_listed`  
`requestId` ties `chunk`/`result`/`error` back to originating `invoke`.
`log` carries `source` (`protocol`|`server`|`studio`) + optional `payload` (`direction`,`method`,`id`,`body`). With `verbose` on, `BaseMCPClient` taps transport send/onmessage and logs every JSON-RPC frame as a protocol-source DEBUG entry (live-toggle via `set_verbose`); `notifications/message` → server source (levels mapped in `mcp-client/src/log.ts`), STDIO stderr → server INFO. Store buffers logs arriving during connect (`handshakeLogs`) and adopts them on `connected`.

### Persistence
SQLite at `~/.mcp-studio/studio.db` via **Drizzle ORM** (`drizzle-orm/bun-sqlite`). Schema: `apps/server/src/db/schema.ts` (tables: `collections`, `connections`, `environments`). Queries: `apps/server/src/db/queries/`. Migrations in `apps/server/drizzle/`, applied automatically on server startup via `migrate()`. History removed entirely. `STUDIO_DB_PATH` env var overrides DB path — set to `:memory:` for test isolation. `Connection` (table renamed from `requests` in migration `0002`, rows preserved) has no `tool`/`params` fields — tools fetched live from MCP after connect (dropped in migration `0001`).

REST (granular CRUD, no bulk replace):
- `GET/POST /collections`, `PATCH/DELETE /collections/:id`
- `POST /collections/:id/connections`, `PATCH|DELETE /collections/:id/connections/:connId`
- `GET/POST /environments`, `PATCH/DELETE /environments/:id`

Frontend proxies via Vite → `localhost:3000` in development. Production CLI serves built web assets, REST (also under `/api`) and `/ws` on one loopback port; the browser uses same-origin URLs. The package build bundles the CLI and copies web assets and Drizzle migrations into `dist/`; keep these paths relative to the bundle, independent of the working directory. `bun scripts/build-binary.ts` compiles a standalone CLI with embedded web assets and migrations, extracted to a temporary directory at startup; the release workflow builds five targets and creates draft releases only.

### Env interpolation
`apps/server/src/env/interpolate.ts` resolves Variables before connect and every Call, recursively in nested objects/arrays. Any `{{name}}` whose name matches `[A-Za-z0-9_]+` is a Variable reference, with no escape syntax; `{{ name }}` with spaces is not matched. Unresolved Variables block connect/Call. Only values are interpolated; object keys (header names, env-var names, apikey key) are not interpolated.

Variable editors (`components/shared/variable-input.tsx`) keep native input/textarea editing and paint token backgrounds in a pointer-inert, scroll-synced mirror. Hover the field for previews (also available as its accessible description); names containing secret/token/password/passwd/credential/key, case-insensitively, are conservatively masked, as are password-field previews. This is a display heuristic, not a secrecy boundary; ordinary Variables show their values.

### Frontend structure
Single screen (`pages/home.tsx`), no view switching — `activeView` and the icon sidebar are gone.  
Shell: `src/components/shell/` (TopNav → SessionInfo + ThemeToggle + settings dialog, StatusBar). TopNav `SessionInfo` shows MCP Server name/version, Transport, negotiated protocol version, status from store `serverInfo`/`protocolVersion`/`connectionConfig`.  
Features: `src/components/{connection,tools,prompts,response,logs,collections,environments,configuration,shared}/`  
STDIO form (`connection/stdio-form.tsx`): store `stdio` (`StdioDraft`: command, args[], cwd, env rows, inheritSystemEnv) edited via `setStdio`; `store/connection-form.ts` converts draft ↔ `StdioConfig` (blank args/env names/cwd dropped) and builds the `ConnectionConfig` used by autosave PATCH and Connect; `connectionUrl` is HTTP-only. Sidebar double-click connects; clicking/double-clicking another Connection while a Session is live asks, then disconnects.  
Collections CRUD in sidebar; clicking a saved Connection calls `loadConnection()` → sets `selectedConnectionId`, `transport`, `connectionUrl`, `selectedTool`, `pendingParams` → ToolPanel pre-fills. Home shows blank state when `selectedConnectionId === null`.  
Tool metadata (title, icons, annotations, outputSchema) passes through the MCP client to the web. Each Call captures its output schema in ResponseState; Pretty validates structuredContent with Ajv (2020-12 by default, draft-07 only when explicitly declared; unsupported dialects report Cannot validate) and ajv-formats, preserving content blocks alongside validation feedback.

ToolPanel renders dynamic form from `selectedTool.inputSchema` (JSON Schema → fields).  
Settings (`MCPConfig`: `requestTimeout`, `autoScrollLogs`, `verboseLogging`, `theme: dark|light|system`) persisted to `localStorage` key `mcp-studio-config` via `store/config.ts` (field-validated read, unknown keys dropped); `setConfig` writes store + localStorage and re-applies theme (`lib/theme.ts`). `index.html` inline script applies saved theme before paint. `requestTimeout` stored only, not yet consumed; `verboseLogging` is sent with `connect` and on change (`setConfig` → `transport.setVerbose`). Logs panel height is `logsHeight` in store (clamped, drag/arrow-key resize). Environments are global (not per-collection/Connection).

### Adding a new ServerMessage type
1. Add variant → `packages/types/src/messages.ts`
2. Handle → `handleServerMessage()` in `apps/web/src/store/index.ts`
3. Emit → `SessionManager` in `apps/server/src/session/manager.ts`

### TS config
Root `tsconfig.base.json` extended by all packages. Web: `moduleResolution: Bundler`, `@/*` → `src/`. Server adds `bun-types`. `exactOptionalPropertyTypes` disabled (see Gotchas).

## Domain docs
Vocabulary: `GLOSSARY.md` (use its terms; saved entity = **Connection**, formerly "request"). Decisions: `docs/adr/`. Read both before changing domain behaviour.

## Self-Maintenance
Update after any session with: new package/route/transport, schema change, arch decision, or bug >15 min to diagnose. One-two sentences, drop oldest if bloated.

## Gotchas
- **`exactOptionalPropertyTypes` disabled** — MCP SDK returns `string | undefined`; enabling breaks mcp-client type assignments.
- **`tsc -b` removed from web build** — `tsconfig.node.json` (`composite: true`) conflicted with Vite's DOM types. `bun typecheck` is separate; `bun run build` calls `vite build` directly.
- **Negotiated protocol version** — BaseMCPClient captures the SDK initialize result through transport.setProtocolVersion, preserving the transport callback; SessionManager includes it in connected. getServerVersion() only describes the MCP Server implementation.
- **`cwd` must be spread conditionally** — `StdioClientTransport` uses `exactOptionalPropertyTypes` internally: `...(cwd ? { cwd } : {})`.
- **Env synced per-message, not per-session** — `setActiveEnv()` called on every WS message; env changes take effect immediately without reconnect.
- **Server tests use `bun:test`, not vitest** — `bun:sqlite` is a native Bun module; Vite's transformer can't resolve it. Server tests import from `"bun:test"`; web tests use vitest + jsdom.
- **AppState includes `selectedConnectionId`, `transport`, `connectionUrl`** — moved from local component state to store so connection panel and home page stay in sync.


## Tests

Session protocol seam: `cd apps/server && bun test src/__tests__/session-protocol.test.ts`. `SessionHarness` in `src/__tests__/fixtures/session-harness.ts` drives the real SessionManager: `await harness.send(clientMessage)` then `await harness.waitFor("result", message => message.requestId === id, 3000)`. Waits consume matching events once, including already emitted events; `messages` retains the full stream for diagnostics. Start waits before sending when observing events during an unfinished Call; always close the harness and HTTP fixture in `finally`.

`stdioFixture` launches the SDK fixture subprocess; `startHTTPFixture()` provides an isolated Streamable HTTP endpoint on an ephemeral loopback port and `close()`. Catalogue: echo (`text`), error (tool result with `isError`), slow (`steps`, 50ms ticks, progress when `_meta.progressToken` supplied, AbortSignal cancellation), structured (`answer: 42` + outputSchema), elicit (name form), log (info notification), stderr, crash (exit 23); prompt: greet (`name`). `runtime-server.ts` is a STDIO-only fixture whose `runtime` tool reports subprocess cwd/env (`session-stdio-config.test.ts`). Advanced protocol features are available to later tickets but are not yet wired through SessionManager. Run crash only over STDIO: the in-process HTTP fixture would exit the test runner. `startHTTPFixture("sse")` runs the SDK legacy SSE transport at `/sse` with a separate POST endpoint. HTTP tries Streamable HTTP first and falls back on 400/404/405 rejection; `connected.httpVariant` carries `streamable` or `sse` to the status bar.

Form elicitation: MCP clients advertise `elicitation.form`; SessionManager bridges `elicitation_request`/`elicitation_response` with unique elicitation IDs. Pending forms cancel after 120 seconds or Session closure; `elicitation_closed` removes expired dialogs. The browser queues forms and reuses ToolArgsEditor.
- **`inheritSystemEnv=false` still gets the MCP SDK's minimal safe env** (PATH, HOME, TERM, …) so commands resolve; only arbitrary parent vars are excluded.
