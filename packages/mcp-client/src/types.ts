import type { CallProgress, ElicitationResult, MCPTool, MCPPrompt, MCPPromptMessage, LogLevel, LogSource, LogPayload } from "@mcp-studio/types";
import type { OAuthSignIn } from "./oauth.js";

// ---------------------------------------------------------------------------
// MCPClient public interface
// ---------------------------------------------------------------------------

export interface MCPClientOptions {
  /** Shared with the Session to cover Variables and transport errors. Never used on wire data. */
  diagnosticSecrets?: Set<string>;
  onClose?: () => void;
  onElicitation?: (request: { message: string; requestedSchema: Record<string, unknown> }, signal: AbortSignal) => Promise<ElicitationResult>;
  /** Capture JSON-RPC frames as Protocol log entries. Toggle live with `setVerbose`. */
  verbose?: boolean;
  onProgress?: (requestId: string, progress: CallProgress) => void;
  onSessionPhase?: (phase: "spawn" | "connect" | "initialize", timestamp: number, durationMs: number) => void;
  onLog?: (level: LogLevel, source: LogSource, text: string, payload?: LogPayload) => void;
  onHttpResponse?: (requestId: string, status: number, headers: Record<string, string>) => void;
  /** Required for HTTP Connections whose auth is `oauth`. */
  oauth?: OAuthSignIn;
  /** Auth endpoint deadline; defaults to 30 seconds, independent of Session lifetime. */
  oauthRequestTimeoutMs?: number;
}

export interface MCPClientInterface {
  connect(): Promise<ConnectedServerInfo>;
  listTools(): Promise<MCPTool[]>;
  callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<unknown>;
  listPrompts(): Promise<MCPPrompt[]>;
  callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<MCPPromptMessage[]>;
  disconnect(): Promise<void>;
  setVerbose(verbose: boolean): void;
  readonly isConnected: boolean;
}

export interface ConnectedServerInfo {
  httpVariant?: "streamable" | "sse";
  serverName?: string;
  serverVersion?: string;
  protocolVersion: string;
  tools: MCPTool[];
  prompts: MCPPrompt[];
}
