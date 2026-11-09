# MCP Studio

A local developer tool for connecting to, inspecting, and exercising MCP servers — the "Postman for MCP".

## Language

**MCP Server**:
The external program or remote endpoint under test, which exposes tools and prompts over MCP.
_Avoid_: backend, target

**Studio Server**:
MCP Studio's own local backend that the browser talks to and that holds the connection to the MCP Server.
_Avoid_: server (unqualified), backend

**Transport**:
How MCP Studio reaches an MCP Server: either STDIO (spawned subprocess) or HTTP (Streamable HTTP, falling back to legacy SSE).
_Avoid_: connection type

**Session**:
The single live link between MCP Studio and one MCP Server, opened from a Connection; at most one exists at a time.
_Avoid_: connection (when meaning the live link)

**Call**:
One execution of a tool or prompt against the current Session, with its arguments and response. Calls are ephemeral and never saved.
_Avoid_: invocation, request (when meaning a tool run)

**Collection**:
A named folder that groups Connections.
_Avoid_: workspace, project

**Connection**:
A named, saved recipe for reaching one MCP Server (Transport plus its settings), stored in a Collection. It never stores tool names or arguments.
_Avoid_: request, saved call, server (when meaning the saved recipe)

**Environment**:
A named set of Variables; exactly one Environment may be active at a time, and it applies globally.
_Avoid_: profile, config

**Variable**:
A key-value pair in an Environment, referenced as `{{NAME}}` in connection fields and Call arguments and substituted at use time. References express user intent; text supplied by an MCP Server is not authorization to read an Environment.
_Avoid_: secret, placeholder

**Elicitation**:
A form the MCP Server asks the user to fill in during a Call.
_Avoid_: prompt (that is an MCP prompt template), popup

**Log entry**:
One line in the logs panel: a level, a source, a message, and optionally a structured payload (JSON-RPC direction, method, id, body).
_Avoid_: log line, event

**Log source**:
Where a Log entry came from: Protocol (JSON-RPC frames, only with verbose logging on), Server (MCP Server `notifications/message` and subprocess stderr), or Studio (MCP Studio's own lifecycle events).
_Avoid_: origin, channel

**Sign-in**:
The OAuth credentials (tokens and client registration) MCP Studio holds for one Connection after the user authorizes it in the browser, bound to the MCP Server URL they were issued for. Signing out discards it.
_Avoid_: login, session (when meaning the stored credentials), auth token
