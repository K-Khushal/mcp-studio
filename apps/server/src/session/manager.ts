import { StdioMCPClient, SSEMCPClient } from "@mcp-studio/mcp-client";
import type { MCPClientInterface } from "@mcp-studio/mcp-client";
import type {
  ClientMessage,
  ServerMessage,
  ConnectionStatus,
  ConnectionConfig,
} from "@mcp-studio/types";
import { interpolateObject } from "../env/interpolate.js";
import { nanoid } from "../utils/nanoid.js";

type Send = (msg: ServerMessage) => void;

/**
 * SessionManager — owns the single MCP connection lifecycle.
 * One instance per WebSocket connection.
 */
export class SessionManager {
  private client: MCPClientInterface | null = null;
  private status: ConnectionStatus = "disconnected";
  private activeEnv: Record<string, string> = {};

  constructor(private readonly send: Send) {}

  setActiveEnv(env: Record<string, string>): void {
    this.activeEnv = env;
  }

  async handle(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
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

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.send({ type: "status", status });
  }

  private async connect(msg: Extract<ClientMessage, { type: "connect" }>): Promise<void> {
    if (this.status === "connecting") return;
    if (this.client?.isConnected) {
      await this.disconnect();
    }

    this.setStatus("connecting");

    try {
      // Interpolate env vars in config before connecting
      const config = this.interpolateConfig(msg);

      this.client =
        config.transport === "stdio"
          ? new StdioMCPClient(config.config, {
              onLog: (level, source, message) =>
                this.send({ type: "log", level, source, message, timestamp: Date.now() }),
              onChunk: (requestId, data) =>
                this.send({ type: "chunk", requestId, data }),
            })
          : new SSEMCPClient(config.config, {
              onLog: (level, source, message) =>
                this.send({ type: "log", level, source, message, timestamp: Date.now() }),
              onChunk: (requestId, data) =>
                this.send({ type: "chunk", requestId, data }),
            });

      const info = await this.client.connect();
      this.setStatus("connected");

      this.send({
        type: "connected",
        tools: info.tools,
        prompts: info.prompts,
        serverInfo: { name: info.serverName, version: info.serverVersion },
      });
    } catch (err) {
      this.setStatus("error");
      try { await this.client?.disconnect(); } catch {}
      this.client = null;
      this.send({
        type: "ERROR",
        message: err instanceof Error ? err.message : String(err),
        code: "CONNECTION_FAILED",
      });
    }
  }

  private async invoke(tool: string, rawParams: Record<string, unknown>): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "ERROR", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }

    const requestId = nanoid();
    const { result: params } = interpolateObject(rawParams, this.activeEnv);

    try {
      const result = await this.client.callTool(tool, params, requestId);

      this.send({ type: "result", requestId, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({ type: "ERROR", requestId, message, code: "TOOL_ERROR" });
    }
  }

  private async invokePrompt(
    prompt: string,
    args: Record<string, string>
  ): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "ERROR", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }

    const requestId = nanoid();

    try {
      const messages = await this.client.callPrompt(prompt, args, requestId);
      this.send({ type: "prompt_result", requestId, messages });
    } catch (err) {
      this.send({
        type: "ERROR",
        requestId,
        message: err instanceof Error ? err.message : String(err),
        code: "PROMPT_ERROR",
      });
    }
  }

  private async listTools(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "ERROR", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    const tools = await this.client.listTools();
    this.send({ type: "tools_listed", tools });
  }

  private async listPrompts(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "ERROR", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    const prompts = await this.client.listPrompts();
    this.send({ type: "prompts_listed", prompts });
  }

  async disconnect(): Promise<void> {
    if (this.status === "disconnected") return;
    await this.client?.disconnect();
    this.client = null;
    this.setStatus("disconnected");
    this.send({ type: "disconnected" });
  }

  // Interpolate {{VAR}} in config strings before handing to the client
  private interpolateConfig(
    msg: Extract<ClientMessage, { type: "connect" }>
  ): ConnectionConfig {
    if (msg.transport === "stdio") {
      const { result: env } = interpolateObject(
        msg.config.env as Record<string, unknown>,
        this.activeEnv
      );
      return { transport: "stdio", config: { ...msg.config, env: env as Record<string, string> } };
    } else {
      const { result: headers } = interpolateObject(
        msg.config.headers as Record<string, unknown>,
        this.activeEnv
      );
      return {
        transport: "http",
        config: { ...msg.config, headers: headers as Record<string, string> },
      };
    }
  }
}
