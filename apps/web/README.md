# MCP Studio — Web Frontend

React 19 + Vite + Tailwind. Talks to Bun server over WS + REST.

## Quick Start

```bash
bun --filter @mcp-studio/web dev
bun --filter @mcp-studio/web test
bun --filter @mcp-studio/web typecheck
```

## Project Shape

```text
src/
├── pages/                 # route entry
├── views/                 # top-level view shells
├── components/
│   ├── connection/        # request header + transport/url controls
│   ├── collections/       # sidebar + request CRUD
│   ├── tools/             # tool list + schema form + run
│   ├── prompts/           # prompt list + args + run
│   ├── response/          # response + timeline
│   ├── logs/              # request console
│   ├── environments/      # env manager
│   ├── configuration/     # UI/config dialog
│   ├── shell/             # nav + status bar
│   └── ui/                # shared primitives
├── store/                 # single Zustand store
├── transport/             # websocket transport
└── lib/                   # helpers
```

## Core State Model

Single Zustand store in `src/store/index.ts`.

Two request identities matter:

- `selectedRequestId`: request user currently viewing/editing
- `connectedRequestId`: request with active live MCP session

These can differ.

Example:

- Request A connected
- user selects Request B
- UI shows B name + B saved connection fields
- status bar still shows A as connected
- tools/prompts/response/logs for B stay blank

## What Persists

Saved per request in DB:

- `name`
- `connectionConfig`

Not saved in DB:

- tools
- prompts
- response
- timeline
- logs
- selected tool/prompt
- tool form values

Live workspace is memory-only and only for the currently connected request.

## Request Behavior

Selecting a request:

- loads that request's saved transport/url into connection panel
- sets `selectedRequestId`
- if selected request is also connected request, restores its live in-memory workspace
- otherwise shows blank request workspace

Clicking same selected request again:

- no-op
- do not deselect

## Connection Behavior

Panel always reflects selected request, not connected request.

Status bar always reflects connected request, not selected request.

Button behavior:

- selected request connected: button means `Disconnect`
- selected request not connected: button means `Connect`

Connect flow when A connected and B selected:

1. user clicks `Connect`
2. clear current live workspace UI immediately
3. disconnect A
4. connect using B staged transport/url
5. on success: set `connectedRequestId = B`, load B tools/prompts
6. on failure: nothing connected, B remains selected

Manual disconnect:

- clears live tools/prompts/response/timeline/logs
- clears connected request cache
- keeps selected request + its saved connection fields

## Request Workspace Rules

Only connected request can show live MCP data:

- tools
- prompts
- response
- timeline
- logs

If user switches away from connected A to unconnected B:

- A remains connected
- A live workspace kept in memory
- B workspace blank

If user switches back to A before reconnecting elsewhere:

- restore A live workspace from memory

If user disconnects A:

- clear A live workspace

## Connection Field Persistence

Connection type/url edits are request-scoped.

Behavior:

- editing selected request fields updates in-memory draft immediately
- draft also PATCHed to request record
- reload restores saved request connection fields from DB

This is why connection string no longer disappears on refresh.

## Main Store Slices

Connection/runtime:

- `connectionStatus`
- `connectionConfig`
- `connectedRequestId`
- `connectingRequestId`
- `connectedRequestCache`
- `connectedAt`

Selected request workspace:

- `tools`
- `prompts`
- `selectedTool`
- `selectedPrompt`
- `toolSearch`
- `pendingParams`
- `toolFormValues`
- `response`
- `timeline`
- `logs`

Collections:

- `collections`
- `selectedRequestId`
- `requestDrafts`

## Key Actions

- `loadSavedRequest(req)`
  - selects request
  - loads saved connection fields
  - restores connected workspace only if same request is live

- `connect(config)`
  - switches live connection to selected request

- `disconnect()`
  - ends live connection
  - clears live request workspace

- `setTransport(t)` / `setConnectionUrl(url)`
  - update selected request draft
  - persist draft locally
  - request record persisted from connection panel layer

- `selectTool(tool)` / `selectPrompt(prompt)`
  - update visible workspace
  - sync into connected request cache if selected request is live

## Data Flows

### Request Selection

```text
Sidebar click
  → store.loadSavedRequest(req)
  → selectedRequestId = req.id
  → load req connectionConfig into panel
  → if req.id === connectedRequestId
      restore cached live workspace
    else
      blank workspace
```

### Connect Selected Request

```text
ConnectionPanel.handleConnect()
  → build ConnectionConfig from selected request fields
  → store.connect(config)
  → clear live workspace
  → disconnect old session if any
  → WS connect for selected request
  → server sends connected
  → store sets connectedRequestId
  → tools/prompts visible only for that request
```

### Tool Invocation

```text
Run Tool
  → allowed only when selectedRequestId === connectedRequestId
  → store.invokeTool()
  → transport.invoke()
  → server messages update connected request cache
  → if selected request is live one, visible workspace updates too
```

## Important Components

- `src/pages/home.tsx`
  - page shell
  - shows studio only when a request is selected

- `src/components/connection/connection-panel.tsx`
  - selected request title
  - transport/url inputs
  - connect/disconnect button
  - persists request connection config

- `src/components/tools/tool-panel.tsx`
  - visible only for selected connected request
  - tool form values synced into store

- `src/components/prompts/prompt-panel.tsx`
  - visible only for selected connected request

- `src/components/response/response-panel.tsx`
  - request-scoped response/timeline

- `src/components/logs/logs-panel.tsx`
  - request-scoped console

- `src/components/shell/status-bar.tsx`
  - shows connected request name + runtime status

## Tests

Current tests cover:

- request rename
- request connection config updates
- request selection behavior
- blank workspace when switching away from connected request
- restoring connected request workspace when switching back
- environment store behavior

Frontend tests: `src/__tests__/*`
