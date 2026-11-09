import type { ConnectionConfig } from "./transport.js";
import type { MCPTool, MCPPrompt, MCPPromptMessage, ConnectionStatus } from "./mcp.js";

// ---------------------------------------------------------------------------
// Browser → Bun Server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | ({ type: "elicitation_response"; elicitationId: string } & ElicitationResult)
  /** `connectionId` scopes stored OAuth credentials to the saved Connection. */
  | ({ type: "connect"; verbose?: boolean; connectionId?: string } & ConnectionConfig)
  | { type: "set_verbose"; verbose: boolean }
  | { type: "cancel"; requestId: string }
  | { type: "invoke"; tool: string; params: Record<string, unknown>; requestId?: string; requestTimeout?: number }
  | {
      type: "invoke_prompt";
      requestId?: string;
      requestTimeout?: number;
      prompt: string;
      args: Record<string, string>;
    }
  | { type: "disconnect" }
  | { type: "list_tools" }
  | { type: "list_prompts" };

// ---------------------------------------------------------------------------
// Bun Server → Browser messages
// ---------------------------------------------------------------------------

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** Protocol = JSON-RPC frames, Server = MCP Server output (notifications/message, stderr), Studio = MCP Studio's own events. */
export type LogSource = "protocol" | "server" | "studio";

/** Structured detail of one JSON-RPC frame. `out` = Studio → MCP Server, `in` = MCP Server → Studio. */
export interface LogPayload {
  direction: "in" | "out";
  method?: string;
  id?: string | number;
  body: unknown;
}

export type ServerMessage =
  | { type: "elicitation_request"; elicitationId: string; message: string; requestedSchema: Record<string, unknown> }
  | { type: "elicitation_closed"; elicitationId: string }
  | { type: "connected"; httpVariant?: "streamable" | "sse"; protocolVersion?: string; tools: MCPTool[]; prompts: MCPPrompt[]; serverInfo?: { name?: string; version?: string } }
  | { type: "tools_listed"; tools: MCPTool[] }
  | { type: "prompts_listed"; prompts: MCPPrompt[] }
  | ({ type: "progress"; requestId: string } & CallProgress)
  | { type: "cancelled"; requestId: string }
  | { type: "session_phase"; phase: "spawn" | "connect" | "initialize"; timestamp: number; durationMs: number }
  | { type: "result"; requestId: string; data: unknown }
  | {
      type: "prompt_result";
      requestId: string;
      messages: MCPPromptMessage[];
    }
  | { type: "error"; requestId?: string; message: string; code?: string }
  | {
      type: "log";
      level: LogLevel;
      source: LogSource;
      message: string;
      timestamp: number;
      payload?: LogPayload;
    }
  | { type: "disconnected"; reason?: string }
  | { type: "status"; status: ConnectionStatus }
  | { type: "http_response"; requestId: string; status: number; headers: Record<string, string> }
  /** The MCP Server requires OAuth sign-in: open `url` in the browser to continue connecting. */
  | { type: "oauth_authorize"; url: string };

export interface ElicitationResult { action: "accept" | "decline" | "cancel"; content?: Record<string, string | number | boolean | string[]>; }

export interface CallProgress { progress: number; total?: number; message?: string; }
