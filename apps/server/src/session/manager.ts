import type { ElicitationResult } from "@mcp-studio/types";
import { StdioMCPClient, StreamableHTTPClient } from "@mcp-studio/mcp-client";
import type { MCPClientInterface, MCPClientOptions, OAuthSignIn, OAuthStorage } from "@mcp-studio/mcp-client";
import type {
  ClientMessage,
  ServerMessage,
  ConnectionStatus,
  ConnectionConfig,
} from "@mcp-studio/types";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { interpolate } from "../env/interpolate.js";
import type { OAuthRedirects } from "../oauth/redirects.js";
import { nanoid } from "../utils/nanoid.js";

type Send = (msg: ServerMessage) => void;

export interface SessionOptions {
  /** Enables OAuth sign-in for HTTP Connections. */
  oauth?: {
    redirectUrl: string;
    redirects: OAuthRedirects;
    storage(connectionId: string, serverUrl: string): OAuthStorage;
  };
}

/** Stand-in storage for a connect without a saved Connection: credentials last one Session. */
function sessionStorage(): OAuthStorage {
  let credentials = {};
  return { load: async () => credentials, save: async (next) => { credentials = next; } };
}

/**
 * SessionManager — owns the single MCP connection lifecycle.
 * One instance per WebSocket connection.
 */
export class SessionManager {
  private pendingElicitations = new Map<string, (result: ElicitationResult) => void>();

  private requestElicitation = (request: { message: string; requestedSchema: Record<string, unknown> }, signal: AbortSignal): Promise<ElicitationResult> => {
    const elicitationId = nanoid();
    return new Promise(resolve => {
      const finish = (result: ElicitationResult) => {
        if (!this.pendingElicitations.has(elicitationId)) return;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        this.pendingElicitations.delete(elicitationId);
        this.send({ type: "elicitation_closed", elicitationId });
        if (!this.pendingElicitations.size) for (const clock of this.callClocks.values()) clock.resume();
        resolve(result);
      };
      const abort = () => finish({ action: "cancel" });
      const timer = setTimeout(() => finish({ action: "cancel" }), 120_000);
      this.pendingElicitations.set(elicitationId, finish);
      for (const clock of this.callClocks.values()) clock.pause();
      this.send({ type: "elicitation_request", elicitationId, ...request });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  };

  private clearElicitations = (): void => {
    for (const finish of this.pendingElicitations.values()) finish({ action: "cancel" });
  };

  private client: MCPClientInterface | null = null;
  private status: ConnectionStatus = "disconnected";
  private activeEnv: Record<string, string> = {};
  private verbose = false;
  private calls = new Map<string, AbortController>();
  private callClocks = new Map<string, { pause(): void; resume(): void }>();
  /** Owns the whole Session authentication lifecycle, including exchange and refresh. */
  private signInAbort: AbortController | null = null;
  private sessionOAuthStorage: OAuthStorage | null = null;

  constructor(private readonly send: Send, private readonly options: SessionOptions = {}) {}

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
      case "set_verbose":
        this.verbose = msg.verbose;
        this.client?.setVerbose(msg.verbose);
        break;
      case "cancel":
        this.calls.get(msg.requestId)?.abort("cancelled");
        break;
      case "invoke":
        await this.invoke(msg);
        break;
      case "invoke_prompt":
        await this.invokePrompt(msg);
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
    for (const call of this.calls.values()) call.abort("cancelled");
    if (this.status !== "connected") return;
    const reason = "MCP Server connection closed unexpectedly";
    this.client = null;
    this.send({ type: "log", level: "ERROR", source: "studio", message: reason, timestamp: Date.now() });
    this.setStatus("disconnected");
    this.send({ type: "disconnected", reason });
  }
  private forwardLog: NonNullable<MCPClientOptions["onLog"]> = (level, source, message, payload) =>
    this.send({ type: "log", level, source, message, timestamp: Date.now(), ...(payload ? { payload } : {}) });

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.send({ type: "status", status });
  }

  private async connect(msg: Extract<ClientMessage, { type: "connect" }>): Promise<void> {
    if (this.status === "connecting") return;
    this.verbose = msg.verbose ?? this.verbose;
    let config: ReturnType<SessionManager["interpolateConfig"]>;
    try {
      config = this.interpolateConfig(msg);
    } catch (err) {
      if (!this.client?.isConnected) this.setStatus("error");
      this.send({ type: "log", level: "ERROR", source: "studio", message: String(err), timestamp: Date.now() });
      this.send({ type: "error", message: err instanceof Error ? err.message : String(err), code: "CONNECTION_FAILED" });
      return;
    }

    if (this.client?.isConnected) {
      await this.disconnect();
    }

    this.setStatus("connecting");
    const lifecycle = new AbortController();
    this.signInAbort = lifecycle;

    try {
      const client: MCPClientInterface =
        config.transport === "stdio"
          ? new StdioMCPClient(config.config, {
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              verbose: this.verbose,
              onLog: this.forwardLog,
              onProgress: (requestId, progress) => this.send({ type: "progress", requestId, ...progress }),
              onSessionPhase: (phase, timestamp, durationMs) => this.send({ type: "session_phase", phase, timestamp, durationMs }),
            })
          : new StreamableHTTPClient(config.config, {
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              verbose: this.verbose,
              onLog: this.forwardLog,
              onProgress: (requestId, progress) => this.send({ type: "progress", requestId, ...progress }),
              onSessionPhase: (phase, timestamp, durationMs) => this.send({ type: "session_phase", phase, timestamp, durationMs }),
              onHttpResponse: (requestId, status, headers) =>
                this.send({ type: "http_response", requestId, status, headers }),
              oauth: config.config.auth?.type === "oauth"
                ? this.oauthSignIn(msg.connectionId, config.config.url, lifecycle.signal)
                : undefined,
            });

      this.client = client;
      const info = await client.connect();
      if (lifecycle.signal.aborted || this.client !== client) {
        await client.disconnect();
        return;
      }
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
      if (lifecycle.signal.aborted || this.signInAbort !== lifecycle) return;
      this.clearElicitations();
      this.setStatus("error");
      try { await this.client?.disconnect(); } catch { /* Best-effort cleanup or persistence; retain in-memory state. */ }
      this.client = null;

      const isHttpErr = err instanceof StreamableHTTPError;
      const message = isHttpErr
        ? `HTTP ${err.code}: ${err.message}`
        : err instanceof Error ? err.message : String(err);

      this.send({ type: "log", level: "ERROR", source: "studio", message, timestamp: Date.now() });

      this.send({ type: "error", message, code: "CONNECTION_FAILED" });
    }
  }

  private async runCall(
    msg: Extract<ClientMessage, { type: "invoke" | "invoke_prompt" }>,
    execute: (client: MCPClientInterface, requestId: string, options: { signal: AbortSignal; timeout: number }) => Promise<ServerMessage>,
  ): Promise<void> {
    const requestId = msg.requestId ?? nanoid();
    if (!this.client?.isConnected) {
      this.send({ type: "error", requestId, message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    if (this.calls.has(requestId)) {
      this.send({ type: "error", requestId, code: "DUPLICATE_REQUEST", message: "A Call with this requestId is already running" });
      return;
    }
    const seconds = typeof msg.requestTimeout === "number" && Number.isFinite(msg.requestTimeout) && msg.requestTimeout > 0
      ? msg.requestTimeout : 30;
    // Browsers store seconds. Clamp to the timer limit rather than overflowing to 1ms.
    const timeout = Math.min(seconds * 1000, 2_147_483_647);
    const controller = new AbortController();
    this.calls.set(requestId, controller);
    let remaining = timeout;
    let started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clock = {
      pause: () => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        remaining = Math.max(0, remaining - (Date.now() - started));
      },
      resume: () => {
        if (timer !== undefined || controller.signal.aborted) return;
        started = Date.now();
        timer = setTimeout(() => controller.abort("timeout"), remaining);
      },
    };
    this.callClocks.set(requestId, clock);
    if (!this.pendingElicitations.size) clock.resume();
    // The UI runs one Call at a time. MCP form requests have no parent Call id;
    // pause active clocks while any form is open, and close local forms on abort
    // when this is the only Call. SDK cancellation handles correlated remote forms.
    controller.signal.addEventListener("abort", () => {
      if (this.calls.size === 1) this.clearElicitations();
    }, { once: true });
    try {
      // Studio owns the pausable deadline; keep the SDK fallback from expiring behind a form.
      const result = await execute(this.client, requestId, { signal: controller.signal, timeout: 2_147_483_647 });
      if (controller.signal.aborted) throw controller.signal.reason;
      this.send(result);
    } catch (err) {
      if (controller.signal.reason === "cancelled") {
        this.send({ type: "cancelled", requestId });
      } else if (controller.signal.reason === "timeout") {
        this.send({ type: "error", requestId, code: "CALL_TIMEOUT", message: `Call timed out after ${seconds} seconds` });
      } else {
        this.send({ type: "error", requestId, code: msg.type === "invoke" ? "TOOL_ERROR" : "PROMPT_ERROR", message: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      clearTimeout(timer);
      this.callClocks.delete(requestId);
      this.calls.delete(requestId);
    }
  }

  private invoke(msg: Extract<ClientMessage, { type: "invoke" }>): Promise<void> {
    return this.runCall(msg, async (client, requestId, options) => ({
      type: "result", requestId,
      data: await client.callTool(msg.tool, this.resolveVariables(msg.params), requestId, options),
    }));
  }

  private invokePrompt(msg: Extract<ClientMessage, { type: "invoke_prompt" }>): Promise<void> {
    return this.runCall(msg, async (client, requestId, options) => ({
      type: "prompt_result", requestId,
      messages: await client.callPrompt(msg.prompt, this.resolveVariables(msg.args), requestId, options),
    }));
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

  private oauthSignIn(connectionId: string | undefined, serverUrl: string, signal: AbortSignal): OAuthSignIn | undefined {
    const oauth = this.options.oauth;
    if (!oauth) return undefined;
    return {
      redirectUrl: oauth.redirectUrl,
      signal,
      storage: connectionId ? oauth.storage(connectionId, serverUrl) : (this.sessionOAuthStorage ??= sessionStorage()),
      authorize: async (authorizationUrl, state) => {
        signal.throwIfAborted();
        const code = oauth.redirects.wait(state, signal);
        this.send({ type: "log", level: "INFO", source: "protocol", message: "OAuth sign-in required; waiting for the browser", timestamp: Date.now() });
        this.send({ type: "oauth_authorize", url: authorizationUrl.toString() });
        return code;
      },
    };
  }

  async disconnect(): Promise<void> {
    this.signInAbort?.abort();
    this.signInAbort = null;
    this.sessionOAuthStorage = null;
    if (this.status === "disconnected") return;
    this.clearElicitations();
    for (const call of this.calls.values()) call.abort("cancelled");
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
