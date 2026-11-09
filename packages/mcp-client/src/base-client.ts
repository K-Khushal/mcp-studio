import { ElicitRequestSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
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

  constructor(protected readonly options: MCPClientOptions = {}) {
    this.verbose = options.verbose ?? false;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  private requiredTaskTools = new Set<string>();
  private protocolVersion: string | undefined;

  /** Capture the SDK's initialize result while preserving transport negotiation. */
  protected async connectTransport(client: Client, transport: Transport): Promise<void> {
    this.protocolVersion = undefined;
    this.pendingMethods.clear();
    this.captureFrames(transport);
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
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      if ("url" in request.params) return { action: "cancel" as const };
      return { ...await (this.options.onElicitation?.({ message: request.params.message, requestedSchema: request.params.requestedSchema }) ?? { action: "cancel" as const }) };
    });
    await client.connect(transport);
  }

  /** Tap both directions of the transport so every JSON-RPC frame is seen, including the initialize handshake. */
  private captureFrames(transport: Transport): void {
    const send = transport.send.bind(transport);
    transport.send = (message, options) => {
      try { this.logFrame("out", message); } catch { /* Logging must not interrupt transport delivery. */ }
      return send(message, options);
    };

    let handler: Transport["onmessage"];
    Object.defineProperty(transport, "onmessage", {
      configurable: true,
      get: () => handler,
      set: (next: Transport["onmessage"]) => {
        handler = next && ((message, extra) => {
          try { this.logFrame("in", message); } catch { /* Logging must not interrupt transport delivery. */ }
          next(message, extra);
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

    const [tools, prompts] = await Promise.all([this.listTools(), this.listPrompts()]);
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
    requestId: string
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
    );

    this.options.onLog?.("INFO", "studio", `tools/call ← ${name} complete`);
    this.options.onChunk?.(requestId, result);

    return result;
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.client) throw new Error("Not connected");

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

    this.options.onLog?.("INFO", "studio", `prompts/get → ${name} (requestId: ${requestId})`);

    const result = await this.client.getPrompt({ name, arguments: args });

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
