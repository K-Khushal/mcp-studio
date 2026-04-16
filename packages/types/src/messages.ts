import type { ConnectionConfig } from "./transport.js";
import type { MCPTool, MCPPrompt, MCPPromptMessage } from "./mcp.js";

// ---------------------------------------------------------------------------
// Browser → Bun Server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | ({ type: "connect" } & ConnectionConfig)
  | { type: "invoke"; tool: string; params: Record<string, unknown> }
  | {
      type: "invoke_prompt";
      prompt: string;
      args: Record<string, string>;
    }
  | { type: "disconnect" }
  | { type: "list_tools" }
  | { type: "list_prompts" };

// ---------------------------------------------------------------------------
// Bun Server → Browser messages
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ServerMessage =
  | { type: "connected"; tools: MCPTool[]; prompts: MCPPrompt[]; serverInfo?: unknown }
  | { type: "tools_listed"; tools: MCPTool[] }
  | { type: "prompts_listed"; prompts: MCPPrompt[] }
  | { type: "chunk"; requestId: string; data: unknown }
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
      source: "protocol" | "subprocess";
      text: string;
      timestamp: number;
    }
  | { type: "disconnected" }
  | { type: "status"; status: import("./mcp.js").ConnectionStatus };
