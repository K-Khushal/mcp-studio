import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { HttpConfig, MCPTool, MCPPrompt, MCPPromptMessage } from "@mcp-studio/types";
import type { MCPClientInterface, MCPClientOptions, ConnectedServerInfo } from "./types.js";

/**
 * MCP client over HTTP/SSE transport.
 * Connects to a remote MCP server endpoint with optional custom headers.
 */
export class SSEMCPClient implements MCPClientInterface {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;
  private _isConnected = false;

  constructor(
    private readonly config: HttpConfig,
    private readonly options: MCPClientOptions = {}
  ) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<ConnectedServerInfo> {
    const url = new URL(this.config.url);

    this.transport = new SSEClientTransport(url, {
      requestInit: { headers: this.config.headers },
    });

    this.client = new Client({ name: "mcp-studio", version: "0.0.1" });

    this.options.onLog?.("INFO", "protocol", `Connecting via SSE to ${this.config.url}`);

    await this.client.connect(this.transport);
    this._isConnected = true;

    this.options.onLog?.("INFO", "protocol", "MCP initialize handshake complete");

    const [tools, prompts] = await Promise.all([this.listTools(), this.listPrompts()]);

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

    this.options.onChunk?.(requestId, result);

    return result;
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.client) throw new Error("Not connected");

    try {
      const response = await this.client.listPrompts();
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
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.client = null;
    this._isConnected = false;
    this.options.onLog?.("INFO", "protocol", "Disconnected");
  }
}
