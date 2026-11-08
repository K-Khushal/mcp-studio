import type { ElicitationResult } from "@mcp-studio/types";
import { StdioMCPClient, StreamableHTTPClient } from "@mcp-studio/mcp-client";
import type { MCPClientInterface } from "@mcp-studio/mcp-client";
import type {
  ClientMessage,
  ServerMessage,
  ConnectionStatus,
  ConnectionConfig,
} from "@mcp-studio/types";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { interpolate } from "../env/interpolate.js";
import { nanoid } from "../utils/nanoid.js";

type Send = (msg: ServerMessage) => void;

/**
 * SessionManager — owns the single MCP connection lifecycle.
 * One instance per WebSocket connection.
 */
export class SessionManager {
  private pendingElicitations = new Map<string, (result: ElicitationResult) => void>();

  private requestElicitation = (request: { message: string; requestedSchema: Record<string, unknown> }): Promise<ElicitationResult> => {
    const elicitationId = nanoid();
    return new Promise(resolve => {
      const finish = (result: ElicitationResult) => {
        clearTimeout(timer);
        this.pendingElicitations.delete(elicitationId);
        this.send({ type: "elicitation_closed", elicitationId });
        resolve(result);
      };
      const timer = setTimeout(() => finish({ action: "cancel" }), 120_000);
      this.pendingElicitations.set(elicitationId, finish);
      this.send({ type: "elicitation_request", elicitationId, ...request });
    });
  };

  private clearElicitations = (): void => {
    for (const finish of this.pendingElicitations.values()) finish({ action: "cancel" });
  };

  private client: MCPClientInterface | null = null;
  private status: ConnectionStatus = "disconnected";
  private activeEnv: Record<string, string> = {};

  constructor(private readonly send: Send) {}

  setActiveEnv(env: Record<string, string>): void {
    this.activeEnv = env;
  }

  async handle(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "elicitation_response":
        this.pendingElicitations.get(msg.elicitationId)?.({ action: msg.action, ...(msg.action === "accept" ? { content: msg.content } : {}) });
        break;
      case "connect":
        await this.connect(msg);
        break;
      case "invoke":
        await this.invoke(msg.tool, msg.params);
        break;
      case "invoke_prompt":
        await this.invokePrompt(msg.prompt, msg.args);
        break;
      case "disconnect":
        await this.disconnect();
        break;
      case "list_tools":
        await this.listTools();
        break;
      case "list_prompts":
        await this.listPrompts();
        break;
    }
  }

  private connectionClosed(client: MCPClientInterface): void {
    if (this.client !== client) return;
    this.clearElicitations();
    if (this.status !== "connected") return;
    const reason = "MCP Server connection closed unexpectedly";
    this.client = null;
    this.send({ type: "log", level: "ERROR", source: "protocol", message: reason, timestamp: Date.now() });
    this.setStatus("disconnected");
    this.send({ type: "disconnected", reason });
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.send({ type: "status", status });
  }

  private async connect(msg: Extract<ClientMessage, { type: "connect" }>): Promise<void> {
    if (this.status === "connecting") return;
    let config: ReturnType<SessionManager["interpolateConfig"]>;
    try {
      config = this.interpolateConfig(msg);
    } catch (err) {
      if (!this.client?.isConnected) this.setStatus("error");
      this.send({ type: "log", level: "ERROR", source: "protocol", message: String(err), timestamp: Date.now() });
      this.send({ type: "error", message: err instanceof Error ? err.message : String(err), code: "CONNECTION_FAILED" });
      return;
    }

    if (this.client?.isConnected) {
      await this.disconnect();
    }

    this.setStatus("connecting");

    try {
      const client: MCPClientInterface =
        config.transport === "stdio"
          ? new StdioMCPClient(config.config, {
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              onLog: (level, source, message) =>
                this.send({ type: "log", level, source, message, timestamp: Date.now() }),
              onChunk: (requestId, data) =>
                this.send({ type: "chunk", requestId, data }),
            })
          : new StreamableHTTPClient(config.config, {
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              onLog: (level, source, message) =>
                this.send({ type: "log", level, source, message, timestamp: Date.now() }),
              onChunk: (requestId, data) =>
                this.send({ type: "chunk", requestId, data }),
              onHttpResponse: (requestId, status, headers) =>
                this.send({ type: "http_response", requestId, status, headers }),
            });

      this.client = client;
      const info = await client.connect();
      this.setStatus("connected");

      this.send({
        type: "connected",
        protocolVersion: info.protocolVersion,
        httpVariant: info.httpVariant,
        tools: info.tools,
        prompts: info.prompts,
        serverInfo: { name: info.serverName, version: info.serverVersion },
      });
    } catch (err) {
      this.clearElicitations();
      this.setStatus("error");
      try { await this.client?.disconnect(); } catch { /* Best-effort cleanup or persistence; retain in-memory state. */ }
      this.client = null;

      const isHttpErr = err instanceof StreamableHTTPError;
      const message = isHttpErr
        ? `HTTP ${err.code}: ${err.message}`
        : err instanceof Error ? err.message : String(err);

      this.send({ type: "log", level: "ERROR", source: "protocol", message, timestamp: Date.now() });

      this.send({ type: "error", message, code: "CONNECTION_FAILED" });
    }
  }

  private async invoke(tool: string, rawParams: Record<string, unknown>): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }

    const requestId = nanoid();

    try {
      const params = this.resolveVariables(rawParams);
      const result = await this.client.callTool(tool, params, requestId);

      this.send({ type: "result", requestId, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({ type: "error", requestId, message, code: "TOOL_ERROR" });
    }
  }

  private async invokePrompt(
    prompt: string,
    args: Record<string, string>
  ): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }

    const requestId = nanoid();

    try {
      const messages = await this.client.callPrompt(prompt, this.resolveVariables(args), requestId);
      this.send({ type: "prompt_result", requestId, messages });
    } catch (err) {
      this.send({
        type: "error",
        requestId,
        message: err instanceof Error ? err.message : String(err),
        code: "PROMPT_ERROR",
      });
    }
  }

  private async listTools(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    const tools = await this.client.listTools();
    this.send({ type: "tools_listed", tools });
  }

  private async listPrompts(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    const prompts = await this.client.listPrompts();
    this.send({ type: "prompts_listed", prompts });
  }

  async disconnect(): Promise<void> {
    if (this.status === "disconnected") return;
    this.clearElicitations();
    const client = this.client;
    this.client = null;
    this.setStatus("disconnected");
    await client?.disconnect();
    this.send({ type: "disconnected" });
  }

  private resolveVariables<T>(value: T): T {
    const { result, missing } = interpolate(value, this.activeEnv);
    if (missing.length) throw new Error(`Unresolved Variables: ${missing.join(", ")}`);
    return result;
  }

  private interpolateConfig(
    msg: Extract<ClientMessage, { type: "connect" }>
  ): ConnectionConfig {
    return this.resolveVariables({ transport: msg.transport, config: msg.config } as ConnectionConfig);
  }
}
