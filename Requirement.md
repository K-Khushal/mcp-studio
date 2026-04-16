# MCP Studio — Product Requirements Document (PRD)

> **Project**: MCP Studio
> **Author**: Khushal Khandelwal
> **Date**: 2026-04-12

---

## Problem Statement

The Model Context Protocol (MCP) enables AI agents to interact with external tools in a structured way. MCP servers expose tools that agents can call with arguments and receive results from. As MCP adoption grows, developers building MCP servers face a painful testing and debugging workflow:

1. **No standardized UI for invoking MCP tools manually** — developers must re-run agents or modify code to test tool calls, making iteration extremely slow.
2. **Poor visibility into MCP communication** — requests, responses, tool calls, errors, and metadata are difficult to inspect. There is no equivalent of browser DevTools or Postman for MCP.
3. **Debugging is cumbersome** — malformed payloads, schema mismatches, tool failures, and transport issues (STDIO/SSE) are hard to diagnose without structured logging.
4. **No persistence across sessions** — existing tools like `mcp-inspector` are session-only. Developers lose all context when they close the tool. There is no way to save, replay, or compare tool invocations.
5. **No multi-environment support** — developers testing against Local, Staging, and Production MCP servers must manually reconfigure connection details and secrets each time.

The official `mcp-inspector` tool covers basic tool invocation but lacks collections, persistent history, response diffing, and environment management. Developers need a more complete tool — the "Postman for MCP."

---

## Solution

**MCP Studio** is a standalone, local developer tool for testing, debugging, and building workflows against MCP servers. It provides:

- A **browser-based UI** (`localhost:8080`) backed by a **local Bun server** (`localhost:3000`) that handles subprocess spawning and MCP communication.
- Support for both **STDIO** and **HTTP/SSE** MCP transports.
- A **dynamic form builder** that generates parameter forms from MCP tool JSON Schemas, plus a raw JSON fallback.
- **Real-time response streaming** with progressive rendering.
- **Protocol-level and raw subprocess log capture** with filtering.
- **Persistent collections** — save and replay tool calls across sessions.
- **Rolling invocation history** with **side-by-side response diff view** for regression detection.
- **Multi-environment management** (Local/Staging/Production) with `{{VAR_NAME}}` variable interpolation in headers, connection strings, and inputs.

All data is stored locally at `~/.mcp-studio/` — no database, no authentication, no cloud. The tool runs entirely on the developer's machine.

---

## User Stories

### Connection & Transport

1. As a developer, I want to connect to an MCP server via STDIO transport by specifying a command, arguments, working directory, and environment variables, so that I can test locally-running MCP servers.
2. As a developer, I want to connect to an MCP server via HTTP/SSE transport by entering a URL and custom headers, so that I can test remote MCP servers.
3. As a developer, I want to import connection configuration from `claude_desktop_config.json` (the format used by Claude Desktop and Cursor), so that I can set up connections with zero manual entry for servers I already use.
4. As a developer, I want to toggle whether the spawned subprocess inherits my system environment variables (PATH, HOME, etc.), so that I can control the server's runtime environment without breaking servers that depend on system env vars.
5. As a developer, I want to define user-specific environment variables that merge on top of the inherited system env, so that I can override or add variables without losing system defaults.
6. As a developer, I want to see the connection status (disconnected, connecting, connected, error) in real time, so that I know whether the server is reachable.
7. As a developer, I want the tool to perform the MCP initialize handshake automatically upon connection, so that I can immediately see the server's capabilities and available tools.
8. As a developer, I want to disconnect from the current MCP server gracefully, so that I can switch to a different server or configuration.
9. As a developer, I want to connect to only one MCP server session at a time, so that the tool remains simple and maps to my primary use case of testing one server.

### Tool Discovery & Invocation

10. As a developer, I want the tool to automatically discover and list all tools exposed by the connected MCP server (via `tools/list`), so that I can see what is available without reading server code.
11. As a developer, I want to see each tool's name, description, and input schema, so that I understand what parameters are expected.
12. As a developer, I want a dynamically generated form for each tool based on its JSON Schema, supporting flat primitives (string, number, boolean, enum), arrays of primitives, and one level of nested objects, so that I can fill in parameters without writing JSON.
13. As a developer, I want a raw JSON editor tab as a fallback for any tool whose schema the form builder cannot render, so that I am never blocked from invoking a tool.
14. As a developer, I want to toggle between form mode and JSON mode for tool parameters, so that I can choose the input method that suits my workflow.
15. As a developer, I want to invoke a selected tool with my parameters and see the response, so that I can test tool behavior.
16. As a developer, I want to search or filter the tool list by name or description, so that I can quickly find the tool I need when a server exposes many tools.

### Prompt Support

17. As a developer, I want to discover and list all prompts exposed by the connected MCP server, so that I can test prompt templates.
18. As a developer, I want to invoke a prompt with the required arguments and see the returned messages, so that I can verify prompt behavior.

### Response Viewing & Streaming

19. As a developer, I want to see tool responses rendered progressively as chunks arrive over the WebSocket, so that I get real-time feedback for slow or long-running tools.
20. As a developer, I want to view the response in "Pretty" mode (formatted JSON), so that I can easily read structured output.
21. As a developer, I want to view the response in "Raw" mode (unformatted text), so that I can see the exact payload.
22. As a developer, I want to view response headers and metadata, so that I can debug protocol-level details.
23. As a developer, I want to view a timeline of the request lifecycle (connect, initialize, tool call, response chunks, completion), so that I can identify performance bottlenecks.

### Logging & Observability

24. As a developer, I want to see structured MCP protocol events (initialize, tool_call, response, error) in a log panel, so that I can understand what happened at the protocol level.
25. As a developer, I want to see raw stdout/stderr output from the subprocess in the same log panel, so that I can see what the server itself logged.
26. As a developer, I want separate filter toggles for protocol events vs. raw subprocess output, so that I can focus on the log stream that is relevant to my debugging.
27. As a developer, I want to filter logs by level (info, warn, error, debug), so that I can reduce noise.
28. As a developer, I want the log panel to be collapsible, so that I can maximize workspace when I don't need logs.

### Error Handling

29. As a developer, I want connection-level errors (server crash, timeout, disconnect) to appear as toast notifications, so that I immediately notice when something breaks.
30. As a developer, I want tool-level errors to appear inline in the response viewer with the full error payload, so that I can debug the specific invocation.
31. As a developer, I want all errors to also be captured in the log panel, so that I have a complete audit trail for deep debugging.

### Environment Management

32. As a developer, I want to create and manage multiple environments (e.g., Local, Staging, Production), so that I can test against different server configurations.
33. As a developer, I want to define key-value environment variables within each environment, so that I can store API keys, endpoints, and other configuration.
34. As a developer, I want to use `{{VAR_NAME}}` syntax in headers, connection strings, and tool parameters, so that secrets and configuration are interpolated from the active environment rather than hardcoded.
35. As a developer, I want to switch between environments quickly, so that I can test the same tool calls against different servers.
36. As a developer, I want the `{{VAR_NAME}}` syntax to be visually highlighted in input fields, so that I can distinguish variables from literal text.

### Collections & Persistence

37. As a developer, I want to save a tool invocation (tool name, parameters, environment) as a named request in a collection, so that I can replay it later without re-entering everything.
38. As a developer, I want to organize saved requests into named collections, so that I can group related test cases.
39. As a developer, I want to replay a saved request from a collection with one click, so that I can quickly re-test after making server changes.
40. As a developer, I want collections to persist across sessions (stored at `~/.mcp-studio/collections.json`), so that I never lose my saved requests.
41. As a developer, I want to browse my collections in a sidebar panel, so that I can easily navigate my saved work.

### History & Diff

42. As a developer, I want the tool to automatically record my last ~50 tool invocations in a rolling history (stored at `~/.mcp-studio/history.json`), so that I have a record of recent work.
43. As a developer, I want to browse my invocation history in a panel, so that I can review past calls and results.
44. As a developer, I want to replay any invocation from history, so that I can re-run a previous test.
45. As a developer, I want to select any two history entries and see a side-by-side JSON diff of their responses, so that I can detect regressions or changes in server behavior.

### Application Shell & Navigation

46. As a developer, I want an icon sidebar to navigate between Studio, Collections, History, Logs, and Settings views, so that I can access all features without clutter.
47. As a developer, I want a top navigation bar showing the current connection info, so that I always know which server I'm connected to.
48. As a developer, I want a status bar showing connection status and key metrics (latency, request count, error count), so that I have at-a-glance health information.
49. As a developer, I want resizable panels in the layout, so that I can adjust the workspace to my preference.
50. As a developer, I want dark mode support, so that the tool is comfortable for extended use.

### Configuration & Settings

51. As a developer, I want to configure request timeout, auto-scroll logs, stream responses toggle, and verbose logging, so that I can tailor the tool's behavior.

---

## Implementation Decisions

### Monorepo Structure (Turborepo)

The project uses a Turborepo monorepo with clear separation of concerns:

```
mcp-studio/
├── apps/
│   ├── web/            # React frontend
│   └── server/         # Bun backend
├── packages/
│   ├── types/          # Shared TS types (ClientMessage, ServerMessage, MCPTool)
│   └── mcp-client/     # MCP client wrapper (reusable, testable)
└── turbo.json
```

- **`apps/web/`** — React frontend. Uses React + TypeScript + Tailwind CSS + shadcn/ui + Zustand for state management. Radix UI primitives for accessible headless components. Vite as the build tool.
- **`apps/server/`** — Bun backend. Bun runs TypeScript natively with no build step, provides a built-in WebSocket server and subprocess API (`Bun.spawn`). Handles all MCP communication, subprocess management, and file persistence.
- **`packages/types/`** — Shared TypeScript types. Defines `ClientMessage` and `ServerMessage` as discriminated union types. Both frontend and backend import from this package, ensuring type safety across the WebSocket boundary with zero code generation.
- **`packages/mcp-client/`** — Reusable MCP client wrapper. Encapsulates MCP SDK integration, initialize handshake, tool listing, tool invocation, and response streaming. Designed to be independently testable.

### Communication Protocol

- **WebSockets** for browser-to-backend communication. Full-duplex persistent connection per session. Maps naturally to MCP's message-passing model and enables the backend to push streamed responses, logs, and connection status updates in real time.
- **Typed JSON with discriminated unions** as the message protocol. A `ClientMessage` type covers: `connect` (stdio or sse), `invoke`, and `disconnect`. A `ServerMessage` type covers: `connected`, `chunk`, `result`, `error`, `log`, and `disconnected`.

### Transport Abstraction (`StudioTransport` Interface)

The frontend communicates through a `StudioTransport` interface — never directly via WebSocket calls. This interface exposes: `connect(config)`, `invoke(tool, params)`, `disconnect()`, and `onMessage(handler)`. The initial implementation is `WebSocketTransport`. This abstraction enables a future Electron migration by swapping in an `ElectronIPCTransport` with no UI component changes.

### MCP Transport Support

- **STDIO Transport**: The backend spawns MCP server processes using `Bun.spawn`. A structured form collects command, args, working directory, and environment variables. Supports importing from `claude_desktop_config.json`. A toggle controls whether the subprocess inherits `process.env`.
- **HTTP/SSE Transport**: The backend connects to remote MCP servers via EventSource. Custom headers with `{{VAR_NAME}}` interpolation support authentication. The Env Manager resolves variables before sending.

### Session Model

Single MCP server session at a time. One active connection per running instance. This keeps state management simple and maps to the primary use case of one developer testing one server.

### Tool Parameter Form Builder

Dynamically generates forms from MCP tool JSON Schemas. Supports: flat types (string, number, boolean, enum), arrays of primitives, and one level of nested objects — covering ~95% of real-world MCP tools. A raw JSON editor tab handles anything the form builder cannot render.

### Response Streaming

The backend forwards MCP response chunks to the browser as they arrive over the WebSocket. The UI renders output progressively, providing real-time feedback.

### Log Capture

Two streams feed the LogsPanel: (1) structured MCP protocol events (tool_call, response, error, initialize) and (2) raw stdout/stderr from the subprocess. Separate filter toggles allow switching between protocol-level and server-level views.

### Error Handling Strategy

- **Connection-level errors** (server crash, timeout, disconnect): Toast notifications.
- **Tool-level errors**: Inline display in ResponseViewer with full error payload.
- **All errors**: Also captured in LogsPanel for complete audit trail.

### Persistence

Local JSON files at `~/.mcp-studio/`:
- `collections.json` — saved collections and requests.
- `history.json` — rolling last ~50 invocations.

No database, no authentication, no cloud. All data stays on the developer's machine and is portable.

### Styling & UI

- Tailwind CSS with CSS custom properties. Color tokens (`bg-panel`, `text-muted-foreground`) defined in config. Dark mode uses `class` strategy.
- shadcn/ui + Radix UI primitives for accessible components.
- `{{VAR_NAME}}` syntax highlighting in input fields via a `VariableHighlightInput` component.
- Resizable panels for flexible layout.

### Frontend Components

- **Shell**: `TopNav`, `IconSidebar`, `StatusBar` — application layout.
- **Left Sidebar**: `CollectionsPanel` — saved requests browser.
- **Connection**: `ConnectionPanel` — transport selector + connection config.
- **Tools**: `ToolExplorer` — tool list + parameter form + form/JSON toggle.
- **Prompts**: `PromptPanel` — prompt invocation UI.
- **Response**: `ResponseViewer` — pretty/raw/headers/timeline tabs.
- **Logs**: `LogsPanel` — collapsible console with filtering.
- **Environments**: `EnvironmentManager` — multi-env with `{{VAR}}` support.
- **Shared**: `VariableHighlightInput` — reusable `{{VAR_NAME}}` input.

### Message Type Contracts

```ts
// packages/types — shared between frontend and backend

export type ClientMessage =
  | { type: "connect"; transport: "stdio"; config: StdioConfig }
  | { type: "connect"; transport: "sse"; url: string; headers: Record<string, string> }
  | { type: "invoke"; tool: string; params: Record<string, unknown> }
  | { type: "disconnect" };

export type ServerMessage =
  | { type: "connected"; tools: MCPTool[] }
  | { type: "chunk"; data: unknown }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string; code?: string }
  | { type: "log"; level: "info" | "warn" | "error"; text: string }
  | { type: "disconnected" };

export interface StdioConfig {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  inheritSystemEnv: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface StudioTransport {
  connect(config: ConnectionConfig): Promise<void>;
  invoke(tool: string, params: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: ServerMessage) => void): void;
}
```

### Transport Lifecycle Diagrams

**STDIO Transport:**

```
User → Browser: Fill config (command, args, env)
Browser → Bun Server: {type:"connect", transport:"stdio", config}
Bun Server → MCP Process: Bun.spawn(command, args, {env})
Bun Server → MCP Process: initialize {protocolVersion, clientInfo}
MCP Process → Bun Server: initialized {serverInfo, capabilities}
Bun Server → MCP Process: tools/list
MCP Process → Bun Server: [{name, description, inputSchema}]
Bun Server → Browser: {type:"connected", tools}
User → Browser: Select tool, fill params
Browser → Bun Server: {type:"invoke", tool:"weather", params:{city:"London"}}
Bun Server → MCP Process: tools/call {name:"weather", arguments:{city:"London"}}
MCP Process → Bun Server: content chunks (streaming)
Bun Server → Browser: {type:"chunk", data} (per chunk)
MCP Process → Bun Server: final result
Bun Server → Browser: {type:"result", data}
```

**HTTP/SSE Transport:**

```
User → Browser: Enter URL + headers ({{API_KEY}})
Browser → Bun Server: {type:"connect", transport:"sse", url, headers}
Bun Server: Interpolate {{VAR}} from active env
Bun Server → MCP Server: POST /sse (Authorization: Bearer sk-...)
MCP Server → Bun Server: SSE stream opened
Bun Server → MCP Server: initialize {protocolVersion, clientInfo}
MCP Server → Bun Server: initialized {serverInfo, capabilities}
Bun Server → MCP Server: tools/list
MCP Server → Bun Server: [{name, description, inputSchema}]
Bun Server → Browser: {type:"connected", tools}
User → Browser: Invoke tool
Browser → Bun Server: {type:"invoke", tool, params}
Bun Server → MCP Server: tools/call (via SSE channel)
MCP Server → Bun Server: response events
Bun Server → Browser: {type:"result", data}
```

### High-Level Architecture

```
┌─────────────────────────────────────┐
│  Browser · localhost:8080           │
│  ┌───────────┐  ┌────────────────┐  │
│  │ React UI  │→ │ StudioTransport│  │
│  └───────────┘  │ (interface)    │  │
│                 │  └─WebSocket   │  │
│                 │   Transport    │  │
│                 └───────┬────────┘  │
└─────────────────────────┼───────────┘
                          │ ws://localhost:3000
┌─────────────────────────┼───────────┐
│  Bun Server · localhost:3000        │
│  ┌──────────────┐ ┌─────────────┐   │
│  │ WebSocket    │ │ Session     │   │
│  │ Server       │→│ Manager     │   │
│  └──────────────┘ └──────┬──────┘   │
│  ┌──────────────┐        │          │
│  │ Env Manager  │←───────┤          │
│  └──────────────┘        │          │
│  ┌──────────────┐        │          │
│  │ mcp-client   │←───────┘          │
│  │ wrapper      │                   │
│  └───────┬──────┘                   │
└──────────┼──────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───┐   ┌────▼────┐   ┌──────────────────┐
│ STDIO │   │ HTTP/SSE│   │ ~/.mcp-studio/   │
│ sub-  │   │ endpoint│   │  collections.json │
│ process│   │         │   │  history.json     │
└───────┘   └─────────┘   └──────────────────┘
```

---

## Module Design

The implementation is organized into **deep modules** — each encapsulates significant functionality behind a simple, testable interface.

### Module 1: `packages/types` — Shared Type Definitions

**Purpose**: Single source of truth for all message types, config interfaces, and MCP schema types shared between frontend and backend.

**Interface**: TypeScript type exports — `ClientMessage`, `ServerMessage`, `StudioTransport`, `StdioConfig`, `MCPTool`, `ConnectionConfig`, `Collection`, `HistoryEntry`.

### Module 2: `packages/mcp-client` — MCP Client Wrapper

**Purpose**: Encapsulates all MCP SDK interactions. Handles initialization handshake, tool listing, tool invocation, prompt listing, prompt invocation, and response streaming. Testable in isolation without a browser or WebSocket layer.

**Interface**: `connect(config)`, `listTools()`, `callTool(name, params)`, `listPrompts()`, `callPrompt(name, params)`, `disconnect()`, `onChunk(handler)`, `onLog(handler)`.

### Module 3: `apps/server` — Bun Backend

**Purpose**: WebSocket server, session manager, transport orchestration (STDIO/SSE), environment variable interpolation, and file persistence.

**Sub-modules**:
- **WebSocket Server**: Accepts browser connections, parses `ClientMessage`, dispatches to Session Manager, sends `ServerMessage` back.
- **Session Manager**: Manages connection lifecycle (disconnected → connecting → connected → error). Orchestrates `mcp-client` operations. One session at a time.
- **Env Manager**: Resolves `{{VAR_NAME}}` references against the active environment. Handles system env inheritance toggle.
- **Persistence Manager**: Reads/writes `~/.mcp-studio/collections.json` and `history.json`.

### Module 4: `apps/web` — React Frontend

**Purpose**: The entire browser UI. Communicates exclusively through the `StudioTransport` interface.

**Sub-modules**:
- **Transport Layer**: `WebSocketTransport` implementing `StudioTransport`. Manages WebSocket lifecycle and message serialization.
- **State Management** (Zustand store): Connection state, tool list, active tool, response data, logs, history, collections, environments, UI state.
- **Connection UI**: `ConnectionPanel` + `EnvironmentManager` — transport selection, config input, `claude_desktop_config.json` import.
- **Tool UI**: `ToolExplorer` + dynamic form builder + JSON editor.
- **Prompt UI**: `PromptPanel`.
- **Response UI**: `ResponseViewer` with pretty/raw/headers/timeline tabs + progressive streaming render.
- **Logs UI**: `LogsPanel` with protocol/raw toggles and level filters.
- **Collections UI**: `CollectionsPanel` — browse, save, replay.
- **History UI**: History panel + response diff view (side-by-side JSON diff).
- **Shell**: `TopNav`, `IconSidebar`, `StatusBar`, resizable panel layout.

---

## Testing Decisions

### Testing Philosophy

- Test **external behavior**, not implementation details. A test should assert what the module does, not how it does it internally.
- Tests should be resilient to refactoring — if the implementation changes but the behavior is the same, tests should still pass.
- Prefer integration-style tests that exercise real module boundaries over unit tests of individual functions.

### Modules to Test

1. **`packages/types`** — Type-level tests (compile-time checks that discriminated unions work correctly). Lightweight.

2. **`packages/mcp-client`** — Integration tests against a mock MCP server process. Test: initialize handshake, tool listing, tool invocation with various parameter shapes, streaming response chunks, error handling, disconnect. This is the most critical module to test since it encapsulates all MCP protocol interaction.

3. **`apps/server` — Session Manager & WebSocket Server** — Integration tests that send `ClientMessage` JSON over a WebSocket and assert the `ServerMessage` responses. Test: connection lifecycle, tool invocation round-trip, streaming, error propagation, persistence read/write.

4. **`apps/server` — Env Manager** — Unit tests for `{{VAR_NAME}}` interpolation logic. Test: single variable, multiple variables, missing variable, nested references, empty string.

5. **`apps/server` — Persistence Manager** — Unit tests for JSON file read/write. Test: create file if not exists, append to history with rolling limit, collection CRUD.

6. **`apps/web` — Dynamic Form Builder** — Component tests (Vitest + Testing Library). Test: form generation from various JSON Schemas (flat primitives, enums, arrays, nested objects), form/JSON toggle, form submission produces correct parameter object.

### Test Framework

- **Vitest** for all tests.
- **React Testing Library** for component tests.
- Turborepo runs tests across all packages with `turbo test`.

---

## Implementation Timeline

| Phase | Deliverable |
|-------|-------------|
| 1 | Turborepo monorepo setup, `packages/types` with `ClientMessage`/`ServerMessage` discriminated unions, `StudioTransport` interface |
| 2 | Bun WebSocket server, session manager, connection lifecycle (disconnected → connecting → connected → error) |
| 3 | `mcp-client` wrapper — MCP SDK integration, initialize handshake, `tools/list`, schema parsing |
| 4 | STDIO transport — `Bun.spawn`, env var injection (inherit toggle + user overrides), `claude_desktop_config.json` import |
| 5 | HTTP/SSE transport — `EventSource` connection, custom headers, `{{VAR}}` interpolation via Env Manager |
| 6 | Dynamic form builder — flat primitives + one-level nesting + raw JSON fallback |
| 7 | Response streaming — chunk forwarding over WebSocket, progressive rendering in ResponseViewer |
| 8 | Log capture — protocol events + raw stdout/stderr, LogsPanel filter UI wired up |
| 9 | Persistent history — rolling `history.json`, history panel, replay from history |
| 10 | Response diff view — side-by-side JSON diff between any two history entries |
| 11 | Collections persistence (`collections.json`), EnvironmentManager wiring, full UI integration |
| 12 | Polish, error handling, documentation, demo, `npx` packaging |

---

## Out of Scope

The following are explicitly **not** part of this PRD's core scope:

1. **Automated Value Assertions / Test Runner** — Value-based assertions (e.g., `response.temperature is a number`) would turn MCP Studio into a proper test runner. Requires field picker, operator selector, test runner, and results view UI. Deferred as a **future enhancement**.

2. **Snapshot Testing** — Record and compare full response snapshots. Further future enhancement beyond assertions.

3. **MCP Resources Support** — Resources require a fundamentally different UI paradigm (URI browser, binary content rendering, subscription model). Deferred as a **future enhancement**.

4. **Electron Desktop Application** — The `StudioTransport` abstraction makes migration straightforward (swap `WebSocketTransport` for `ElectronIPCTransport`). Deferred as a **future enhancement**.

5. **Cloud Sync / Team Sharing** — No accounts, no authentication, no remote storage. All data is local. Separate product decision for the future.

6. **Multi-Session / Multi-Server** — Only one MCP server connection at a time. Tabbed multi-session support is not in scope.

7. **Database or Auth System** — No database. No user authentication. Persistence is local JSON files only.

---

## Key Differentiators vs mcp-inspector

| Gap in mcp-inspector | MCP Studio Solution |
|---|---|
| No persistent history | Rolling local history (~50 entries) with replay |
| No collections | Save and replay tool calls across sessions |
| No response diffing | Side-by-side JSON diff of any two history entries |
| Weak environment management | Multi-environment support with `{{VAR}}` interpolation |
| Poor debugging visibility | Protocol-level logs + raw stdout/stderr with filters |
| Limited auth configuration | Custom headers with environment variable injection |
| No performance visibility | Request lifecycle timeline view |
| Limited UX | Production-quality UI with dark mode, resizable panels, toast notifications |

**One-liner**: *"mcp-inspector lets you fire a single tool call. MCP Studio lets you build, save, and run a full test suite against your MCP server."*

---

## Further Notes

- **Config File Import**: Supporting `claude_desktop_config.json` import is a high-value, low-effort feature that eliminates the #1 friction point (manual connection setup) for developers already using Claude Desktop or Cursor with MCP servers.

- **Transport Abstraction is Load-Bearing**: The `StudioTransport` interface is not just for future Electron migration. It also enables testing the frontend against a mock transport without a real WebSocket connection.

- **Developer Survey Insights**: A developer feedback survey was conducted during the design phase. Key pain points confirmed: difficult to test MCP tools, poor communication visibility, cumbersome debugging, slow iteration speed, and poor developer ergonomics. These directly informed the feature set.
