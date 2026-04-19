# MCP Studio — Web Frontend

React 19 + Vite + Tailwind. Communicates with the Bun WebSocket server at `ws://localhost:3000/ws`.

## Quick Start

```bash
bun --filter @mcp-studio/web dev   # dev server at http://localhost:5173
bun --filter @mcp-studio/web typecheck
```

---

## Project Structure

```
src/
├── pages/          # Route entry points
│   └── home.tsx    # Root layout: TopNav + CollectionsView + main area + StatusBar
├── views/          # Tab-level views (switched by activeView in store)
│   ├── studio-view.tsx      # Main workspace (connection panel + tools/prompts tabs)
│   ├── collections-view.tsx # Saved requests sidebar
│   ├── logs-view.tsx        # Stub (Phase 8)
│   └── settings-view.tsx   # Stub (Phase 12)
├── components/
│   ├── shell/               # Persistent layout chrome
│   │   ├── top-nav.tsx      # Logo, links
│   │   ├── icon-sidebar.tsx # View switcher (Zap/BookOpen/ScrollText/Settings icons)
│   │   └── status-bar.tsx   # Connection status, latency, request/error counts
│   ├── connection/
│   │   └── connection-panel.tsx   # Transport selector, URL input, connect/disconnect
│   ├── tools/
│   │   ├── tool-panel.tsx         # Orchestrator: form state, invoke handler
│   │   ├── tool-list.tsx          # Search input + scrollable tool list + ToolListItem
│   │   ├── tool-schema-form.tsx   # JSON Schema → form fields renderer
│   │   └── tool-schema-helpers.ts # Pure fns: parse schema, build/seed params
│   ├── prompts/
│   │   └── prompt-panel.tsx       # Prompt textarea + send button
│   ├── collections/
│   │   ├── collections-sidebar.tsx # shadcn composable Sidebar for collections/search/create
│   │   ├── collection-row.tsx     # Collapsible collection with rename/delete + request items
│   │   └── add-request-dialog.tsx # Modal to create a saved request
│   ├── environments/
│   │   └── environment-panel.tsx  # Dialog: env var table (add/remove/toggle/copy)
│   ├── configuration/
│   │   └── configuration-panel.tsx # Dialog: transport + execution + debug toggles
│   ├── response/             # Response streaming display
│   ├── logs/                 # Log viewer
│   ├── shared/               # Shared UI helpers
│   ├── error-boundary.tsx
│   └── ui/                   # shadcn/radix-ui primitives (button, input, dialog, …)
├── store/
│   └── index.ts              # Single Zustand store — all state + actions
├── transport/
│   └── websocket-transport.ts # WebSocket wrapper; calls store.handleServerMessage()
└── lib/
    └── utils.ts              # cn() helper (clsx + tailwind-merge)
```

---

## State Management

Single Zustand store (`src/store/index.ts`). All mutations go through store actions.

**State slices:**

| Slice | Key fields |
|-------|-----------|
| Connection | `connectionStatus`, `connectionConfig`, `serverInfo` |
| Tools | `tools`, `selectedTool`, `toolSearch`, `pendingParams` |
| Prompts | `prompts`, `selectedPrompt` |
| Response | `response.chunks`, `isStreaming`, `result`, `error`, `timing` |
| Logs | `logs` (capped at 500) |
| Collections | `collections` |
| Environments | `environments`, `activeEnvironmentId` |
| Config | `config` (timeout, streaming, reasoning, etc.) |
| UI | `activeView`, `isDarkMode`, `toasts` |

**Key actions:**

```ts
connect(config)           // open WebSocket, register message handler
invokeTool(name, params)  // send invoke message, updates response slice
loadSavedRequest(req)     // sets selectedTool + pendingParams → ToolPanel pre-fills
setActiveView(view)       // "studio" | "collections" | "logs" | "settings"
```

**Server messages** arrive via `handleServerMessage()` (bottom of store) — the sole mutation point for all `ServerMessage` events from the WebSocket.

---

## Data Flow: Tool Invocation

```
User clicks "Run Tool"
  → ToolPanel.handleInvoke()
  → buildParams(schema, formValues)      # tool-schema-helpers.ts
  → store.invokeTool(name, params)
  → WebSocketTransport.send({ type: "invoke", ... })
  → Server streams chunks back
  → handleServerMessage() receives "chunk" / "result" / "error"
  → response slice updated → ResponsePanel re-renders
```

## Data Flow: Saved Request → Pre-filled Form

```
User clicks request in CollectionsView
  → store.loadSavedRequest(req)
  → sets selectedTool + pendingParams
  → ToolPanel useEffect detects pendingParams
  → seedValues(schema, pendingParams)    # tool-schema-helpers.ts
  → setFormValues(seeded)
  → clearPendingParams()
```

---

## Routing & Navigation

`activeView` controls the main content area. `CollectionsView` is always visible as a left sidebar (240 px) inside `home.tsx`.

```
"studio"      → StudioView  (default)
"collections" → (main area — sidebar already shows collections)
"logs"        → LogsView
"settings"    → SettingsView
```

Icon sidebar (`icon-sidebar.tsx`) calls `setActiveView()` on click.

---

## Conventions

**Imports**
```ts
import { useStore } from '@/store'          // alias: src/
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AddRequestDialog } from './add-request-dialog'  // relative within same folder
```

**Styling:** Tailwind utility classes, `cn()` for conditional composition. Dark mode via `document.documentElement.classList.toggle('dark')`.

**Icons:** lucide-react only.

**Exports:** Named exports for feature components, default export for `ToolPanel` (legacy — imported as `import ToolPanel from '...'`).

**Forms:** Local `useState` for form values. No form library. JSON Schema → fields via `tool-schema-helpers.ts`.

**Types:** Imported from `@mcp-studio/types` (workspace package). No inline type duplication.

---

## Adding a New View

1. Create `src/views/my-view.tsx`, export a named component
2. Add `"my-view"` to `activeView` union in `store/index.ts`
3. Add nav item to `NAV_ITEMS` in `icon-sidebar.tsx`
4. Render in `home.tsx` conditional block

## Adding a New ServerMessage Type

1. Add variant to `packages/types/src/messages.ts`
2. Handle in `handleServerMessage()` in `store/index.ts`
3. Emit from `SessionManager` in `apps/server/src/session/manager.ts`
