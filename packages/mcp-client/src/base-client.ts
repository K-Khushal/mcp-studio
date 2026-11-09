import { ElicitRequestSchema, CallToolResultSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { redactDiagnosticValue } from "./diagnostics.js";
import { OAuthFlowError } from "./oauth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type { MCPTool, MCPPrompt, MCPPromptMessage, MCPContent } from "@mcp-studio/types";
import type { MCPClientInterface, MCPClientOptions, ConnectedServerInfo } from "./types.js";
import { formatFrame, formatMcpLogMessage, mapMcpLogLevel } from "./log.js";

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

  private verbose: boolean;
  /** Methods awaiting responses, indexed by request direction and typed id. */
  private pendingMethods = new Map<string, string>();

  protected readonly options: MCPClientOptions;
  protected readonly diagnosticSecrets: Set<string>;

  /** Transport-owned credentials survive an Environment rebuild within this Session. */
  protected readonly authenticationSecrets = new Set<string>();

  rememberDiagnosticSecrets(secrets: Set<string>): void {
    for (const value of this.authenticationSecrets) secrets.add(value);
  }

  constructor(options: MCPClientOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.diagnosticSecrets = options.diagnosticSecrets ?? new Set<string>();
    this.options = { ...options,
      onLog: (level, source, text, payload) => {
        this.rememberDiagnosticSecrets(this.diagnosticSecrets);
        options.onLog?.(level, source, redactDiagnosticValue(text, this.diagnosticSecrets),
          payload ? { ...payload, body: redactDiagnosticValue(payload.body, this.diagnosticSecrets) } : payload);
      },
      onHttpResponse: (id, status, headers) => {
        this.rememberDiagnosticSecrets(this.diagnosticSecrets);
        options.onHttpResponse?.(id, status, redactDiagnosticValue(headers, this.diagnosticSecrets, true));
      },
    };
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  private requiredTaskTools = new Set<string>();
  private protocolVersion: string | undefined;

  protected abstract readonly transportPhase: "spawn" | "connect";
  private initializeStartedAt: number | undefined;
  private initializePhase: { timestamp: number; durationMs: number } | undefined;

  /** Capture the SDK's initialize result while preserving transport negotiation. */
  protected async connectTransport(client: Client, transport: Transport): Promise<void> {
    this.protocolVersion = undefined;
    this.initializePhase = undefined;
    this.pendingMethods.clear();
    this.captureFrames(transport);
    const connectStartedAt = Date.now();
    let transportStartedAt = connectStartedAt;
    let transportDuration = 0;
    const start = transport.start.bind(transport);
    transport.start = async () => {
      const timestamp = Date.now();
      await start();
      transportStartedAt = timestamp;
      transportDuration = Date.now() - timestamp;
    };
    client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
      const { level, ...rest } = notification.params;
      this.options.onLog?.(mapMcpLogLevel(level), "server", formatMcpLogMessage(rest));
    });
    const setProtocolVersion = transport.setProtocolVersion?.bind(transport);
    transport.setProtocolVersion = (version) => {
      setProtocolVersion?.(version);
      this.protocolVersion = version;
    };
    client.onclose = () => {
      const wasConnected = this._isConnected;
      this._isConnected = false;
      if (wasConnected) this.options.onClose?.();
    };
    client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
      if ("url" in request.params) return { action: "cancel" as const };
      return { ...await (this.options.onElicitation?.({ message: request.params.message, requestedSchema: request.params.requestedSchema }, extra.signal) ?? { action: "cancel" as const }) };
    });
    await client.connect(transport);
    // Emit only after successful negotiation; rejected HTTP attempts must not
    // leave a completed connect phase before the SSE fallback.
    this.options.onSessionPhase?.(this.transportPhase, transportStartedAt,
      this.transportPhase === "connect" ? Date.now() - connectStartedAt : transportDuration);
    this.emitInitializePhase();
  }

  private emitInitializePhase(): void {
    if (this.initializePhase) this.options.onSessionPhase?.("initialize", this.initializePhase.timestamp, this.initializePhase.durationMs);
  }

  /** Tap both directions of the transport so every JSON-RPC frame is seen, including the initialize handshake. */
  private captureFrames(transport: Transport): void {
    const send = transport.send.bind(transport);
    transport.send = (message, options) => {
      try { this.logFrame("out", message); } catch { /* Logging must not interrupt transport delivery. */ }
      return send(message, options);
    };

    let handler: Transport["onmessage"];
    // SDK notification handlers run in a microtask, but responses run synchronously.
    // Deliver frames in sequence so a coalesced final progress event reaches its
    // handler before the following result removes that handler.
    let incoming = Promise.resolve();
    Object.defineProperty(transport, "onmessage", {
      configurable: true,
      get: () => handler,
      set: (next: Transport["onmessage"]) => {
        handler = next && ((message, extra) => {
          try { this.logFrame("in", message); } catch { /* Logging must not interrupt transport delivery. */ }
          incoming = incoming.then(() => { next(message, extra); }).catch(error => {
            this.client?.onerror?.(error instanceof Error ? error : new Error(String(error)));
          });
        });
      },
    });
  }

  private logFrame(direction: "in" | "out", message: JSONRPCMessage): void {
    const frame = message as { id?: string | number; method?: string };
    const isResponse = frame.method === undefined;
    let method = frame.method;
    if (frame.id !== undefined) {
      const requestDirection = isResponse ? (direction === "out" ? "in" : "out") : direction;
      const key = JSON.stringify([requestDirection, frame.id]);
      if (method) this.pendingMethods.set(key, method);
      else if (isResponse) {
        method = this.pendingMethods.get(key);
        this.pendingMethods.delete(key);
      }
    }
    if (method === "initialize") {
      if (direction === "out" && !isResponse) this.initializeStartedAt = Date.now();
      if (direction === "in" && isResponse && this.initializeStartedAt !== undefined) {
        this.initializePhase = { timestamp: this.initializeStartedAt, durationMs: Date.now() - this.initializeStartedAt };
        this.initializeStartedAt = undefined;
      }
    }
    if (!this.verbose) return;
    const payload = {
      direction,
      ...(method ? { method } : {}),
      ...(frame.id !== undefined ? { id: frame.id } : {}),
      body: message,
    };
    this.options.onLog?.("DEBUG", "protocol", formatFrame(payload, isResponse), payload);
  }

  /** Create and connect the transport, return the connected SDK Client. */
  protected abstract setupTransport(): Promise<Client>;

  /** Close the transport and clean up transport-specific resources. */
  protected abstract teardownTransport(): Promise<void>;

  async connect(): Promise<ConnectedServerInfo> {
    this.client = await this.setupTransport();

    const [tools, prompts] = await Promise.all([
      this.listTools(),
      this.listPrompts().catch(error => {
        if (error instanceof OAuthFlowError || error instanceof UnauthorizedError ||
          this.options.oauth?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        this.options.onLog?.("WARN", "studio", "prompts/list failed; continuing with no prompts");
        return [];
      }),
    ]);
    if (!this.protocolVersion) throw new Error("MCP initialize did not negotiate a protocol version");
    this._isConnected = true;
    const serverInfo = this.client.getServerVersion();
    return {
      serverName: serverInfo?.name,
      serverVersion: serverInfo?.version,
      protocolVersion: this.protocolVersion,
      tools,
      prompts,
    };
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.client) throw new Error("Not connected");

    const response = await this.client.listTools();
    this.options.onLog?.("DEBUG", "studio", `tools/list → ${response.tools.length} tools`);

    this.requiredTaskTools = new Set(response.tools.filter(t => t.execution?.taskSupport === "required").map(t => t.name));
    return response.tools.map((t) => ({
      name: t.name,
      title: t.title,
      icons: t.icons,
      annotations: t.annotations,
      outputSchema: t.outputSchema,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(
    name: string,
    params: Record<string, unknown>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<unknown> {
    if (!this.client) throw new Error("Not connected");

    this.options.onLog?.("INFO", "studio", `tools/call → ${name} (requestId: ${requestId})`);

    if (this.requiredTaskTools.has(name)) {
      throw new Error(`Tool "${name}" requires task-based execution`);
    }
    // callTool also rejects missing structuredContent before invoking our validator.
    // Keep wire-result validation, but leave outputSchema diagnostics to Pretty.
    const result = await this.client.request(
      { method: "tools/call", params: { name, arguments: params } },
      CallToolResultSchema,
      { ...options, onprogress: progress => this.options.onProgress?.(requestId, progress) },
    );

    this.options.onLog?.("INFO", "studio", `tools/call ← ${name} complete`);

    return result;
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.client) throw new Error("Not connected");
    if (!this.client.getServerCapabilities()?.prompts) return [];

    try {
      const response = await this.client.listPrompts();
      this.options.onLog?.("DEBUG", "studio", `prompts/list → ${response.prompts.length} prompts`);

      return response.prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }));
    } catch (error) {
      // Unsupported prompts are optional; authentication and network failures are not.
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) return [];
      throw error;
    }
  }

  async callPrompt(
    name: string,
    args: Record<string, string>,
    requestId: string,
    options?: { signal: AbortSignal; timeout: number }
  ): Promise<MCPPromptMessage[]> {
    if (!this.client) throw new Error("Not connected");

    this.options.onLog?.("INFO", "studio", `prompts/get → ${name} (requestId: ${requestId})`);

    const result = await this.client.getPrompt({ name, arguments: args }, options);

    return result.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as MCPContent,
    }));
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    await this.teardownTransport();
    this.client = null;
    this._isConnected = false;
    this.options.onLog?.("INFO", "studio", "Disconnected");
  }
}
