import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { HttpConfig } from "@mcp-studio/types";
import type { MCPClientOptions } from "./types.js";
import { BaseMCPClient } from "./base-client.js";

/**
 * MCP client over HTTP/SSE transport.
 * Connects to a remote MCP server; all protocol logic lives in BaseMCPClient.
 */
export class SSEMCPClient extends BaseMCPClient {
  private transport: SSEClientTransport | null = null;

  constructor(
    private readonly config: HttpConfig,
    options: MCPClientOptions = {}
  ) {
    super(options);
  }

  protected async setupTransport(): Promise<Client> {
    const url = new URL(this.config.url);
    this.transport = new SSEClientTransport(url, {
      requestInit: { headers: this.config.headers },
    });

    const client = new Client({ name: "mcp-studio", version: "0.0.1" });
    this.options.onLog?.("INFO", "protocol", `Connecting via SSE to ${this.config.url}`);
    await client.connect(this.transport);
    this.options.onLog?.("INFO", "protocol", "MCP initialize handshake complete");
    return client;
  }

  protected async teardownTransport(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
