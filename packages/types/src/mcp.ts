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

// ---------------------------------------------------------------------------
// MCP ContentBlock types (tool call results)
// ---------------------------------------------------------------------------

export interface Annotations {
  audience?: ("user" | "assistant")[];
  priority?: number;
  lastModified?: string;
}

export interface TextContent {
  type: "text";
  text: string;
  annotations?: Annotations;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: Annotations;
}

export interface AudioContent {
  type: "audio";
  data: string;
  mimeType: string;
  annotations?: Annotations;
}

export interface ResourceLink {
  type: "resource_link";
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: Annotations;
}

export interface EmbeddedResource {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
  annotations?: Annotations;
}

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

export interface CallToolResult {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isCallToolResult(value: unknown): value is CallToolResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as CallToolResult).content)
  )
    return false;
  // Require every element to be an object with a string `type` (MCP content block shape)
  return (value as CallToolResult).content.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { type?: unknown }).type === "string",
  );
}

export function isPromptMessages(value: unknown): value is MCPPromptMessage[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const first = value[0] as MCPPromptMessage;
  return (
    typeof first === "object" &&
    first !== null &&
    (first.role === "user" || first.role === "assistant") &&
    "content" in first
  );
}
