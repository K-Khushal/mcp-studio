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
│   ├── connection/        # connection header + transport/url controls
│   ├── collections/       # sidebar + connection CRUD
│   ├── tools/             # tool list + schema form + run
│   ├── prompts/           # prompt list + args + run
│   ├── response/          # response panel (see below)
│   ├── logs/              # request console
│   ├── environments/      # env manager
│   ├── configuration/     # UI/config dialog
│   ├── shell/             # nav + status bar
│   └── ui/                # shared primitives
├── store/                 # single Zustand store
├── transport/             # websocket transport
└── lib/                   # helpers
```

## Response Panel

`src/components/response/` is the response viewer. It understands the MCP tool result content model and routes each content block type to the appropriate renderer.

### File Map

```text
response/
├── response-panel.tsx          # orchestrator: tab routing, store wiring
├── response-header.tsx         # header bar: status badges + tab buttons
├── pretty-tab.tsx              # pretty tab: dispatches over result shape
├── headers-tab.tsx             # HTTP request/response headers tab
├── timeline-panel.tsx          # invocation timeline tab
├── json-viewer.tsx             # collapsible JSON tree viewer
└── content-blocks/
    ├── content-block-renderer.tsx  # routes ContentBlock to correct renderer
    ├── text-block.tsx              # text: auto-detects JSON → tree, else <pre>
    ├── resource-block.tsx          # embedded resource: URI card + text/blob
    ├── resource-link-block.tsx     # resource link: URI card with name/description
    ├── unsupported-block.tsx       # graceful fallback for image / audio / unknown
    └── utils.ts                    # tryParseJson helper (shared by text/resource)
```

### Content Block Support

| MCP type | Status | Notes |
|----------|--------|-------|
| `text` | ✅ | Auto-detects JSON → tree viewer; otherwise plain `<pre>` |
| `resource` (embedded) | ✅ | Shows URI header; text content with JSON detection; blob placeholder |
| `resource_link` | ✅ | Card with URI, name, description |
| `image` | 🔲 | Placeholder — [#27](https://github.com/K-Khushal/mcp-studio/issues/27) |
| `audio` | 🔲 | Placeholder — [#28](https://github.com/K-Khushal/mcp-studio/issues/28) |

### Result Shape Dispatch (`pretty-tab.tsx`)

`response.result` is `unknown` from the store. `PrettyTab` narrows it:

1. `isCallToolResult(result)` → `CallToolResultView` — iterates `content[]`, renders each `ContentBlock`
2. `isPromptMessages(result)` → `PromptMessagesView` — role-labelled message list
3. Fallback → `JsonViewer` — generic tree

Tool execution errors (`isError: true` in `CallToolResult`) show a red banner above the blocks and set the header badge to **Error**.

### JSON Tree Viewer (`json-viewer.tsx`)

- Expand/collapse nodes with chevrons; objects/arrays show item count when collapsed
- First two levels auto-expanded on mount; keyed per invocation to reset stale state
- Color scheme: keys rose · strings emerald · numbers amber · booleans sky · null muted
- Copy button appears on hover next to each primitive value

## Core State Model

Single Zustand store in `src/store/index.ts`.

Two connection identities matter:

- `selectedConnectionId`: connection user currently viewing/editing
- `connectedConnectionId`: connection with active live MCP session

These can differ.

Example:

- Connection A connected
- user selects Connection B
- UI shows B name + B saved connection fields
- status bar still shows A as connected
- tools/prompts/response/logs for B stay blank

## What Persists

Saved per connection in DB:

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

Live workspace is memory-only and only for the currently connected connection.

## Connection Behavior

Selecting a connection:

- loads that connection's saved transport/url into connection panel
- sets `selectedConnectionId`
- if selected connection is also connected connection, restores its live in-memory workspace
- otherwise shows blank connection workspace

Clicking same selected connection again:

- no-op
- do not deselect

## Connection Behavior

Panel always reflects selected connection, not connected connection.

Status bar always reflects connected connection, not selected connection.

Button behavior:

- selected connection connected: button means `Disconnect`
- selected connection not connected: button means `Connect`

Connect flow when A connected and B selected:

1. user clicks `Connect`
2. clear current live workspace UI immediately
3. disconnect A
4. connect using B staged transport/url
5. on success: set `connectedConnectionId = B`, load B tools/prompts
6. on failure: nothing connected, B remains selected

Manual disconnect:

- clears live tools/prompts/response/timeline/logs
- clears connected connection cache
- keeps selected connection + its saved connection fields

## Connection Workspace Rules

Only connected connection can show live MCP data:

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

Connection type/url edits are connection-scoped.

Behavior:

- editing selected connection fields updates in-memory draft immediately
- draft also PATCHed to connection record
- reload restores saved connection fields from DB

This is why connection string no longer disappears on refresh.

## Main Store Slices

Connection/runtime:

- `connectionStatus`
- `connectionConfig`
- `connectedConnectionId`
- `connectingConnectionId`
- `connectedConnectionCache`
- `connectedAt`

Selected connection workspace:

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
- `selectedConnectionId`
- `connectionDrafts`

## Key Actions

- `loadConnection(connection)`
  - selects connection
  - loads saved connection fields
  - restores connected workspace only if same connection is live

- `connect(config)`
  - switches live connection to selected connection

- `disconnect()`
  - ends live connection
  - clears live connection workspace

- `setTransport(t)` / `setConnectionUrl(url)`
  - update selected connection draft
  - persist draft locally
  - connection record persisted from connection panel layer

- `selectTool(tool)` / `selectPrompt(prompt)`
  - update visible workspace
  - sync into connected connection cache if selected connection is live

## Data Flows

### Connection Selection

```text
Sidebar click
  → store.loadConnection(connection)
  → selectedConnectionId = connection.id
  → load req connectionConfig into panel
  → if connection.id === connectedConnectionId
      restore cached live workspace
    else
      blank workspace
```

### Connect Selected Connection

```text
ConnectionPanel.handleConnect()
  → build ConnectionConfig from selected connection fields
  → store.connect(config)
  → clear live workspace
  → disconnect old session if any
  → WS connect for selected connection
  → server sends connected
  → store sets connectedConnectionId
  → tools/prompts visible only for that connection
```

### Tool Invocation

```text
Run Tool
  → allowed only when selectedConnectionId === connectedConnectionId
  → store.invokeTool()
  → transport.invoke()
  → server messages update connected connection cache
  → if selected connection is live one, visible workspace updates too
```

## Important Components

- `src/pages/home.tsx`
  - page shell
  - shows studio only when a connection is selected

- `src/components/connection/connection-panel.tsx`
  - selected connection title
  - transport/url inputs
  - connect/disconnect button
  - persists connection config

- `src/components/tools/tool-panel.tsx`
  - visible only for selected connected connection
  - tool form values synced into store

- `src/components/prompts/prompt-panel.tsx`
  - visible only for selected connected connection

- `src/components/response/response-panel.tsx`
  - connection-scoped response/timeline
  - understands MCP content block types

- `src/components/logs/logs-panel.tsx`
  - connection-scoped console

- `src/components/shell/status-bar.tsx`
  - shows connected connection name + runtime status

## Tests

Current tests cover:

- connection rename
- connection config updates
- connection selection behavior
- blank workspace when switching away from connected connection
- restoring connected connection workspace when switching back
- environment store behavior

Frontend tests: `src/__tests__/*`
