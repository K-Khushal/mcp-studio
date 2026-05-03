import type { MCPTool, MCPPrompt, MCPPromptMessage, LogLevel } from "@mcp-studio/types";

// ---------------------------------------------------------------------------
// MCPClient public interface
// ---------------------------------------------------------------------------

export interface MCPClientOptions {
  onChunk?: (requestId: string, data: unknown) => void;
  onLog?: (level: LogLevel, source: "protocol" | "subprocess", text: string) => void;
  onHttpResponse?: (requestId: string, status: number, headers: Record<string, string>) => void;
}

export interface MCPClientInterface {
  connect(): Promise<ConnectedServerInfo>;
  listTools(): Promise<MCPTool[]>;
  callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<unknown>;
  listPrompts(): Promise<MCPPrompt[]>;
  callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string
  ): Promise<MCPPromptMessage[]>;
  disconnect(): Promise<void>;
  readonly isConnected: boolean;
}

export interface ConnectedServerInfo {
  serverName?: string;
  serverVersion?: string;
  protocolVersion: string;
  tools: MCPTool[];
  prompts: MCPPrompt[];
}
