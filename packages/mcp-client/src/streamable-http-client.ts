import { rememberConnectionSecrets, isCredentialKey } from "./diagnostics.js";
import { inspectionValidator } from "./inspection-validator.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError, extractWWWAuthenticateParams } from "@modelcontextprotocol/sdk/client/auth.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { HttpConfig, MCPPromptMessage } from "@mcp-studio/types";
import type { MCPClientOptions } from "./types.js";
import { BaseMCPClient } from "./base-client.js";
import { OAuthFlowError, StudioOAuthProvider, redactOAuthValue } from "./oauth.js";

export class StreamableHTTPClient extends BaseMCPClient {
  protected readonly transportPhase = "connect" as const;
  private readonly oauthSecrets: Set<string>;
  private readonly lifetime = new AbortController();
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  // The UI runs one Call at a time; this shared id tags its HTTP response headers.
  // Concurrent programmatic Calls do not have independent HTTP header attribution.
  private activeRequestId: string | null = null;

  constructor(
    private readonly config: HttpConfig,
    options: MCPClientOptions = {}
  ) {
    super(options);
    this.oauthSecrets = this.diagnosticSecrets;
    rememberConnectionSecrets({ transport: "http", config }, this.diagnosticSecrets);
  }

  override async listTools() {
    try {
      return await super.listTools();
    } catch (error) {
      throw this.safeError(error);
    }
  }

  override async listPrompts() {
    try {
      return await super.listPrompts();
    } catch (error) {
      throw this.safeError(error);
    }
  }

  override async callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<unknown> {
    this.activeRequestId = requestId;
    try {
      return await super.callTool(name, params, requestId, options);
    } catch (error) {
      throw this.safeError(error);
    } finally {
      this.activeRequestId = null;
    }
  }

  override async callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<MCPPromptMessage[]> {
    this.activeRequestId = requestId;
    try {
      return await super.callPrompt(name, args, requestId, options);
    } catch (error) {
      throw this.safeError(error);
    } finally {
      this.activeRequestId = null;
    }
  }

  override async connect() {
    try {
      return { ...await super.connect(), httpVariant: this.variant };
    } catch (error) {
      throw this.safeError(error);
    }
  }

  // SDK OAuth errors can contain raw endpoint bodies, codes, verifiers and tokens.
  // Do not retain their message, cause or response on any public exception.
  private safeError(error: unknown): unknown {
    if (error instanceof OAuthFlowError || error instanceof UnauthorizedError) return new OAuthFlowError();
    return redactOAuthValue(error, this.oauthSecrets);
  }

  private variant: "streamable" | "sse" = "streamable";

  protected async setupTransport(): Promise<Client> {
    const { auth } = this.config;
    if (auth?.type !== "oauth") return this.connectHttp();
    if (!this.options.oauth) throw new Error("OAuth sign-in is not available in this Studio Server");
    const provider = new StudioOAuthProvider({ ...this.options.oauth, signal: this.signal }, this.oauthSecrets);
    return this.connectHttp(provider);
  }

  private get signal(): AbortSignal {
    return this.options.oauth?.signal
      ? AbortSignal.any([this.lifetime.signal, this.options.oauth.signal])
      : this.lifetime.signal;
  }

  private async connectHttp(authProvider?: StudioOAuthProvider): Promise<Client> {
    this.signal.throwIfAborted();
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

    // Auth traffic has its own fetch: never expose token/discovery response metadata.
    // Shared auth outlives any individual Session. In particular, never abort a
    // rotating-token exchange before its response can be persisted. Bound each
    // auth endpoint independently so a hung endpoint cannot wedge the shared flow.
    const authFetch: FetchLike = (input, init) => fetch(input, {
      ...init, signal: AbortSignal.timeout(this.options.oauthRequestTimeoutMs ?? 30_000),
    });
    const resourceFetch: FetchLike = (input, init) => {
      const signal = init?.signal ? AbortSignal.any([this.signal, init.signal]) : this.signal;
      return fetch(input, { ...init, signal });
    };
    const needsAuthorization = (response: Response) => response.status === 401 ||
      (response.status === 403 && extractWWWAuthenticateParams(response).error === "insufficient_scope");
    const wrappedFetch: FetchLike = async (input, init) => {
      let response = await resourceFetch(input, init);
      if (authProvider && needsAuthorization(response)) {
        const headers = new Headers(init?.headers);
        await response.body?.cancel();
        await authProvider.authenticate(url, headers.get("authorization"), response, authFetch, !this.isConnected);
        this.signal.throwIfAborted();
        const tokens = await authProvider.tokens();
        if (!tokens) throw new OAuthFlowError();
        headers.set("authorization", `Bearer ${tokens.access_token}`);
        response = await resourceFetch(input, { ...init, headers });
        if (needsAuthorization(response)) {
          await response.body?.cancel();
          throw new OAuthFlowError();
        }
      }
      response.headers.forEach((value, key) => {
        if (isCredentialKey(key)) {
          this.diagnosticSecrets.add(value);
          if (/^Bearer /i.test(value)) this.diagnosticSecrets.add(value.slice(7));
        }
      });
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
      authProvider,
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
        authProvider,
      });
      client = new Client({ name: "mcp-studio", version: "0.0.1" }, { jsonSchemaValidator: inspectionValidator, capabilities: { elicitation: { form: {} } } });
      try {
        await this.connectTransport(client, this.transport);
        this.variant = "sse";
      } catch (fallbackError) {
        await client.close();
        if (fallbackError instanceof OAuthFlowError) throw fallbackError;
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
    this.lifetime.abort();
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
