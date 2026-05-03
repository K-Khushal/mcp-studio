import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { HttpConfig, MCPPromptMessage } from "@mcp-studio/types";
import type { MCPClientOptions } from "./types.js";
import { BaseMCPClient } from "./base-client.js";

export class StreamableHTTPClient extends BaseMCPClient {
  private transport: StreamableHTTPClientTransport | null = null;
  // Tracks the in-flight requestId so the fetch wrapper can tag response headers
  private activeRequestId: string | null = null;

  constructor(
    private readonly config: HttpConfig,
    options: MCPClientOptions = {}
  ) {
    super(options);
  }

  override async callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<unknown> {
    this.activeRequestId = requestId;
    try {
      return await super.callTool(name, params, requestId);
    } finally {
      this.activeRequestId = null;
    }
  }

  override async callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string
  ): Promise<MCPPromptMessage[]> {
    this.activeRequestId = requestId;
    try {
      return await super.callPrompt(name, args, requestId);
    } finally {
      this.activeRequestId = null;
    }
  }

  protected async setupTransport(): Promise<Client> {
    const url = new URL(this.config.url);

    // Merge auth into headers/URL before connecting
    const headers: Record<string, string> = { ...this.config.headers };
    const { auth } = this.config;

    if (auth?.type === "bearer" && auth.token) {
      headers["Authorization"] = `Bearer ${auth.token}`;
    } else if (auth?.type === "apikey" && auth.key) {
      if (auth.in === "header") {
        headers[auth.key] = auth.value;
      } else {
        url.searchParams.set(auth.key, auth.value);
      }
    }

    // Custom fetch wrapper: captures HTTP response headers per operation
    const self = this;
    const wrappedFetch: FetchLike = async (input, init) => {
      const response = await fetch(input, init);
      const reqId = self.activeRequestId;
      if (reqId && self.options.onHttpResponse) {
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { respHeaders[key] = value; });
        self.options.onHttpResponse(reqId, response.status, respHeaders);
      }
      return response;
    };

    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      fetch: wrappedFetch,
    });

    const client = new Client({ name: "mcp-studio", version: "0.0.1" });
    this.options.onLog?.("INFO", "protocol", `Connecting via Streamable HTTP to ${url.toString()}`);
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
