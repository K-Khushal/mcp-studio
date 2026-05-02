import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { MCPTool, MCPPrompt, MCPPromptMessage } from "@mcp-studio/types";
import type { MCPClientInterface, MCPClientOptions, ConnectedServerInfo } from "./types.js";

/**
 * BaseMCPClient — shared post-connect logic for all MCP transport types.
 *
 * Subclasses implement only:
 *   - setupTransport()   → create transport, attach listeners, call client.connect()
 *   - teardownTransport() → remove listeners, close transport
 */
export abstract class BaseMCPClient implements MCPClientInterface {
  protected client: Client | null = null;
  protected _isConnected = false;

  constructor(protected readonly options: MCPClientOptions = {}) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  /** Create and connect the transport, return the connected SDK Client. */
  protected abstract setupTransport(): Promise<Client>;

  /** Close the transport and clean up transport-specific resources. */
  protected abstract teardownTransport(): Promise<void>;

  async connect(): Promise<ConnectedServerInfo> {
    this.client = await this.setupTransport();

    const [tools, prompts] = await Promise.all([this.listTools(), this.listPrompts()]);
    this._isConnected = true;

    const serverInfo = this.client.getServerVersion();
    return {
      serverName: serverInfo?.name,
      serverVersion: serverInfo?.version,
      protocolVersion: "2024-11-05",
      tools,
      prompts,
    };
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.client) throw new Error("Not connected");

    const response = await this.client.listTools();
    this.options.onLog?.("DEBUG", "protocol", `tools/list → ${response.tools.length} tools`);

    return response.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<unknown> {
    if (!this.client) throw new Error("Not connected");

    this.options.onLog?.("INFO", "protocol", `tools/call → ${name} (requestId: ${requestId})`);

    const result = await this.client.callTool({ name, arguments: params });

    this.options.onLog?.("INFO", "protocol", `tools/call ← ${name} complete`);
    this.options.onChunk?.(requestId, result);

    return result;
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.client) throw new Error("Not connected");

    try {
      const response = await this.client.listPrompts();
      this.options.onLog?.("DEBUG", "protocol", `prompts/list → ${response.prompts.length} prompts`);

      return response.prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }));
    } catch {
      // Server may not support prompts — return empty list gracefully
      return [];
    }
  }

  async callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string
  ): Promise<MCPPromptMessage[]> {
    if (!this.client) throw new Error("Not connected");

    this.options.onLog?.("INFO", "protocol", `prompts/get → ${name} (requestId: ${requestId})`);

    const result = await this.client.getPrompt({ name, arguments: args });

    return result.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as import("@mcp-studio/types").MCPContent,
    }));
  }

  async disconnect(): Promise<void> {
    await this.teardownTransport();
    this.client = null;
    this._isConnected = false;
    this.options.onLog?.("INFO", "protocol", "Disconnected");
  }
}
