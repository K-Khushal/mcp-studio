import { inspectionValidator } from "./inspection-validator.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { HttpConfig, MCPPromptMessage } from "@mcp-studio/types";
import type { MCPClientOptions } from "./types.js";
import { BaseMCPClient } from "./base-client.js";

export class StreamableHTTPClient extends BaseMCPClient {
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
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

  override async connect() {
    return { ...await super.connect(), httpVariant: this.variant };
  }

  private variant: "streamable" | "sse" = "streamable";

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
    const wrappedFetch: FetchLike = async (input, init) => {
      const response = await fetch(input, init);
      const reqId = this.activeRequestId;
      if (reqId && this.options.onHttpResponse) {
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { respHeaders[key] = value; });
        this.options.onHttpResponse(reqId, response.status, respHeaders);
      }
      return response;
    };

    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      fetch: wrappedFetch,
    });

    const logUrl = new URL(url);
    if (auth?.type === "apikey" && auth.in === "query" && auth.key) {
      logUrl.searchParams.set(auth.key, "[REDACTED]");
    }
    let client = new Client({ name: "mcp-studio", version: "0.0.1" }, { jsonSchemaValidator: inspectionValidator, capabilities: { elicitation: { form: {} } } });
    this.options.onLog?.("INFO", "studio", `Connecting via Streamable HTTP to ${logUrl.toString()}`);
    this.variant = "streamable";
    try {
      await this.connectTransport(client, this.transport);
    } catch (error) {
      await client.close();
      // Only protocol/endpoint rejection implies a legacy server. Auth, network,
      // and server failures must retain their original error.
      if (!(error instanceof StreamableHTTPError) || ![400, 404, 405].includes(error.code ?? 0)) throw error;
      this.options.onLog?.("INFO", "studio", "Streamable HTTP rejected; trying legacy SSE");
      this.transport = new SSEClientTransport(url, {
        requestInit: { headers },
        eventSourceInit: { fetch: (input, init) => wrappedFetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } }) },
        fetch: wrappedFetch,
      });
      client = new Client({ name: "mcp-studio", version: "0.0.1" }, { jsonSchemaValidator: inspectionValidator, capabilities: { elicitation: { form: {} } } });
      try {
        await this.connectTransport(client, this.transport);
        this.variant = "sse";
      } catch (fallbackError) {
        await client.close();
        throw new Error(
          `Streamable HTTP rejected (HTTP ${error.code}); legacy SSE failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          { cause: fallbackError },
        );
      }
    }
    this.options.onLog?.("INFO", "studio", "MCP initialize handshake complete");
    return client;
  }

  protected async teardownTransport(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
