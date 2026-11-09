# MCP Studio

> The **Postman for MCP**: connect to, inspect, and exercise MCP servers locally.

MCP Studio is a local developer tool for [Model Context Protocol](https://modelcontextprotocol.io) servers. Save how to reach an MCP Server as a **Connection**, open a **Session**, run **Calls** against its tools and prompts with live progress and cancellation, and watch the protocol traffic in the logs panel. Everything stays on your machine: no accounts, no cloud.

Domain vocabulary is in [`GLOSSARY.md`](GLOSSARY.md); design decisions are in [`docs/adr/`](docs/adr).

## Features

- **Two Transports**: STDIO (spawned subprocess) and HTTP (Streamable HTTP, falling back to legacy SSE; the negotiated variant shows in the status bar).
- **Connections and Collections**: saved recipes for reaching an MCP Server, grouped in Collections. Tools and prompts are fetched live after connecting; a Connection never stores tool names or arguments.
- **Environments and Variables**: one global active Environment; `{{NAME}}` references are resolved in Connection fields and Call arguments.
- **Tool and prompt Calls**: forms generated from the tool's JSON Schema, with a raw JSON editor. Tool metadata (title, icons, annotations) is shown.
- **Live Calls**: progress updates, Cancel, per-Call timeout, and a timeline of Session phases (spawn/connect/initialize) and Call steps.
- **Responses**: Pretty (text, JSON tree, embedded resources, resource links, images, audio), Raw, Headers (HTTP) and Timeline tabs. `structuredContent` is validated against the tool's `outputSchema`.
- **Elicitation**: form requests from the MCP Server open a dialog (expires after 120 seconds).
- **OAuth sign-in** for HTTP Connections (OAuth 2.1 with discovery, dynamic client registration, PKCE and refresh), plus Bearer token and API key auth.
- **Structured logs**: JSON-RPC frames, MCP Server output and Studio events, filterable by level and source, with search.
- **Import** Connections from `claude_desktop_config.json`.
- **Settings**: request timeout, auto-scroll logs, verbose logging, theme.

## Install

Bun is required for `bunx`. Once the npm package is published:

```bash
bunx mcp-studio
bunx mcp-studio --port 4000 --no-open
```

The CLI serves the UI, REST API (also under `/api`) and `/ws` on one loopback port (`127.0.0.1` and `[::1]`), `http://localhost:3000` by default. `--port` changes the port; `--no-open` skips the browser launch. Data lives in `~/.mcp-studio/studio.db` (override with `STUDIO_DB_PATH`). `npx` is unsupported.

Each launch prints and opens a link with a random Launch token, like `http://localhost:3000/?token=…`. Opening it gives that browser a cookie and strips the token from the address bar; other tabs in the same browser work too. A browser without it sees a page asking for the printed link, and scripts must send `Authorization: Bearer <token>`. Restarting MCP Studio prints a new link. `STUDIO_TOKEN` fixes the token (at least 32 characters of `A-Za-z0-9_-`) for scripts. Every response carries a strict Content-Security-Policy and refuses framing ([ADR-0007](docs/adr/0007-launch-token.md)).

### Standalone binaries (no Bun required)

When a release is published, download the matching binary from [GitHub Releases](https://github.com/K-Khushal/mcp-studio/releases): `mcp-studio-linux-x64`, `mcp-studio-linux-arm64`, `mcp-studio-darwin-arm64`, `mcp-studio-darwin-x64`, or `mcp-studio-windows-x64.exe`.

```bash
chmod +x mcp-studio-linux-x64
./mcp-studio-linux-x64 --port 4000 --no-open
```

On Windows run `.\mcp-studio-windows-x64.exe --port 4000 --no-open` in PowerShell. Web assets and database migrations are embedded and extracted to a temporary directory at startup. STDIO MCP Servers still need their own runtimes installed.

Maintainers: pushing a `v*` tag builds all five targets and attaches them to a **draft** release; manual workflow dispatch only produces workflow artifacts. Publishing stays manual.

Run the production build from source:

```bash
bun install
bun run build
bun dist/cli.js --port 4000 --no-open
bun run smoke           # smoke-test the built CLI
npm pack --dry-run      # inspect the package contents
```

## Usage

### Connections and Collections

The sidebar lists Collections and their Connections. Create a Collection, add a Connection to it, then pick a Transport:

- **STDIO**: command, arguments, working directory, environment variable rows, and whether the subprocess inherits the system environment. With inheritance off, the MCP SDK's minimal safe environment (`PATH`, `HOME`, ...) is still passed so commands resolve.
- **HTTP**: URL, custom headers, and auth (None, Bearer Token, API Key in a header or query parameter, or OAuth).

Edits autosave to the selected Connection. Click a Connection to select it, double-click to connect. Selecting another Connection while a Session is live asks before disconnecting; the Session is a single live link, so one MCP Server at a time. Double-click a Collection's name, or the selected Connection's title in its panel, to rename it.

### Environments and Variables

An Environment is a named set of Variables; exactly one is active and it applies globally. Write `{{NAME}}` (letters, digits, underscore; no spaces, no escape syntax) in any Connection value or Call argument. Variables are resolved before connecting and before every Call, so changing the active Environment takes effect without reconnecting. An unresolved Variable blocks the connect or Call. Only values are interpolated, not keys such as header names.

In editors, Variables are highlighted and hovering shows a preview. Names containing `secret`, `token`, `password`, `passwd`, `credential` or `key` are masked in previews. That is a display heuristic, not a secrecy boundary.

### OAuth

Choose **OAuth** as the HTTP auth type and connect. When the MCP Server answers 401 or insufficient-scope, the Studio Server runs the SDK auth flow and the browser opens the authorization URL. The redirect returns to the Studio Server's own `/oauth/callback`, so use `localhost` as served. Tokens and the client registration are stored in SQLite per Connection, bound to the server URL, and never sent to the browser or logged ([ADR-0006](docs/adr/0006-oauth-sign-in-held-by-studio-server.md)). Sign out from the Connection to discard them. The database file is as sensitive as the tokens in it; it is created with private permissions (directory 0700, file 0600). Browser approval only happens while connecting; if a refresh fails during a Call, reconnect.

### Calls

Select a tool or prompt, fill the form (or edit raw JSON), and run it. While a Call runs you see progress, and **Cancel** sends MCP cancellation. The request timeout from Settings applies to each Call and counts active execution time; it pauses while an elicitation form is open. The response panel shows the result and the timeline. Calls are ephemeral and never saved ([ADR-0002](docs/adr/0002-no-history.md)).

### Logs

The logs panel (resizable by dragging or arrow keys, collapsible) shows Log entries with a level and a source:

- **Protocol**: raw JSON-RPC frames with direction, method and id. Only with **Verbose logging** on, which can be toggled live.
- **Server**: MCP Server `notifications/message` and STDIO stderr.
- **Studio**: Studio's own lifecycle events.

Filter by level, by source, or search the text.

### Import

Use the import button in the sidebar header to paste or choose a `claude_desktop_config.json`. Each `mcpServers` entry is previewed and validated (STDIO `command`/`args`/`env`, or HTTP `url`/`headers`); valid ones are imported as Connections into an existing or new Collection.

### Settings

Open the settings dialog from the top bar. Settings are stored in browser `localStorage`:

| Setting | Default | Effect |
|---|---|---|
| Request timeout | 30 s | Per-Call timeout, enforced by the Studio Server |
| Auto-scroll logs | on | Follow new Log entries |
| Verbose logging | off | Log every JSON-RPC frame (Protocol source) |
| Theme | dark | `dark`, `light`, or `system` |

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| Studio Server | Bun (WebSocket + REST, SQLite via Drizzle) |
| Monorepo | Turborepo + Bun workspaces |
| Shared types | `packages/types`: `ClientMessage` / `ServerMessage` protocol, no runtime code |
| MCP client | `packages/mcp-client`: wraps `@modelcontextprotocol/sdk` (`StdioMCPClient`, `StreamableHTTPClient`) |

```text
apps/
  web/        React frontend       → localhost:5173 (dev)
  server/     Studio Server        → localhost:3000
packages/
  types/      Shared TS types
  mcp-client/ MCP SDK wrapper
```

## Development

```bash
bun install
bun dev                       # web on 5173, Studio Server on 3000
```

Open the `Open http://localhost:3000/?token=…` link the Studio Server prints: it sets the session cookie and redirects to the Vite app on `5173`. The development token is kept in the gitignored `apps/server/.dev-token`, so it survives `--watch` restarts.

Run the gates, in order (CI runs the same on every PR and push to `main`):

```bash
bun typecheck
bun lint
bun run test                  # server bun:test + web / mcp-client Vitest
bun run build
```

Architecture, message protocol and test harness notes are in [`CLAUDE.md`](CLAUDE.md); the web app is described in [`apps/web/README.md`](apps/web/README.md).

## Roadmap

- Automated value assertions per tool
- Snapshot testing
- MCP Resources support
- Electron desktop wrapper

[`Requirement.md`](Requirement.md) is the original PRD and is partly superseded.

## License

MIT — see [LICENSE](LICENSE).
