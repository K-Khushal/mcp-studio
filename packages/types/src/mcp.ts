// ---------------------------------------------------------------------------
// MCP domain types
// ---------------------------------------------------------------------------

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptMessage {
  role: "user" | "assistant";
  content: MCPContent;
}

export type MCPContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: MCPResourceContent };

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MCPConfig {
  requestTimeout: number;
  autoScrollLogs: boolean;
  streamResponses: boolean;
  verboseLogging: boolean;
  showReasoning: boolean;
  showTimeline: boolean;
}
