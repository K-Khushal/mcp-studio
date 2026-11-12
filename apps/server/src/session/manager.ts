import { isCallToolResult } from "@mcp-studio/types";
import type { ElicitationResult } from "@mcp-studio/types";
import { boundedText, StdioMCPClient, StreamableHTTPClient, redactDiagnosticValue, rememberConnectionSecrets, rememberDiagnosticSecret, isCredentialKey } from "@mcp-studio/mcp-client";
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
  /** Whole connect deadline, including discovery and browser sign-in; defaults to 120 seconds. */
  connectTimeoutMs?: number;
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

  private readonly diagnosticSecrets = new Set<string>();
  private readonly send: Send;

  constructor(send: Send, private readonly options: SessionOptions = {}) {
    this.send = message => {
      if (message.type === "log") send({ ...message, message: redactDiagnosticValue(message.message, this.diagnosticSecrets),
        ...(message.payload ? { payload: { ...message.payload, body: redactDiagnosticValue(message.payload.body, this.diagnosticSecrets) } } : {}) });
      else if (message.type === "error") send({ ...message, message: redactDiagnosticValue(message.message, this.diagnosticSecrets) });
      else if (message.type === "http_response") send({ ...message, headers: redactDiagnosticValue(message.headers, this.diagnosticSecrets, true) });
      else if (message.type === "progress") send({ ...message, ...(message.message ? { message: redactDiagnosticValue(message.message, this.diagnosticSecrets) } : {}) });
      else send(message);
    };
  }

  private connectionTemplate: ConnectionConfig | null = null;
  private connectionConfig: ConnectionConfig | null = null;
  private referencedVariables = new Set<string>();
  private callSecrets = new Map<string, Set<string>>();

  private rememberVariables(value: unknown, callSecrets?: Set<string>): void {
    const references = new Set<string>();
    const visit = (item: unknown): void => {
      if (typeof item === "string") {
        for (const match of item.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) { this.referencedVariables.add(match[1]!); references.add(match[1]!); }
      } else if (item && typeof item === "object") {
        for (const child of Object.values(item)) visit(child);
      }
    };
    visit(value);
    for (const [name, entry] of Object.entries(this.activeEnv)) {
      if (this.referencedVariables.has(name) || isCredentialKey(name)) {
        const resolved = interpolate(entry, this.activeEnv).result;
        rememberDiagnosticSecret(resolved, this.diagnosticSecrets, isCredentialKey(name));
        if (callSecrets && references.has(name)) rememberDiagnosticSecret(resolved, callSecrets, isCredentialKey(name));
      }
    }
  }

  private rebuildSecrets(): void {
    this.diagnosticSecrets.clear();
    if (this.connectionTemplate) this.rememberVariables(this.connectionTemplate);
    else this.rememberVariables(null);
    if (this.connectionConfig) rememberConnectionSecrets(this.connectionConfig, this.diagnosticSecrets);
    this.client?.rememberDiagnosticSecrets(this.diagnosticSecrets);
    for (const secrets of this.callSecrets.values()) for (const value of secrets) this.diagnosticSecrets.add(value);
  }

  setActiveEnv(env: Record<string, string>): void {
    this.activeEnv = env;
    this.rebuildSecrets();
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
    const reason = "MCP Server connection closed unexpectedly";
    // End running Calls before `disconnected`, which retires the browser's connected workspace.
    // A Call already aborted (cancel, timeout) reports its own outcome from runCall: one terminal message per Call.
    for (const [requestId, call] of this.calls) {
      if (call.signal.aborted) continue;
      call.abort("connection_closed");
      this.send({ type: "error", requestId, code: "CONNECTION_CLOSED", message: reason });
    }
    if (this.status !== "connected") return;
    this.client = null;
    this.send({ type: "log", level: "ERROR", source: "studio", message: reason, timestamp: Date.now() });
    this.setStatus("disconnected");
    this.send({ type: "disconnected", reason });
    this.diagnosticSecrets.clear();
    this.connectionTemplate = this.connectionConfig = null;
    this.referencedVariables.clear();
  }
  private forwardLog: NonNullable<MCPClientOptions["onLog"]> = (level, source, message, payload) => {
    const serialized = payload ? JSON.stringify(payload.body) ?? "" : "";
    this.send({ type: "log", level, source, message: boundedText(message), timestamp: Date.now(), ...(payload ? { payload: new TextEncoder().encode(serialized).length > 16 * 1024 ? { ...payload, body: boundedText(serialized), truncated: true as const } : payload } : {}) });
  };

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.send({ type: "status", status });
  }

  private async connect(msg: Extract<ClientMessage, { type: "connect" }>): Promise<void> {
    if (this.status === "connecting") return;
    this.verbose = msg.verbose ?? this.verbose;
    let config: ConnectionConfig;
    try {
      const resolved = interpolate({ transport: msg.transport, config: msg.config } as ConnectionConfig, this.activeEnv);
      if (resolved.missing.length) throw new Error(`Unresolved Variables: ${resolved.missing.join(", ")}`);
      config = resolved.result;
      // Collect before committing the Connection: a failed collection must not poison later messages.
      rememberConnectionSecrets(config, new Set<string>());
    } catch (err) {
      if (!this.client?.isConnected) this.setStatus("error");
      const message = err instanceof Error ? err.message : String(err);
      this.send({ type: "log", level: "ERROR", source: "studio", message, timestamp: Date.now() });
      this.send({ type: "error", message, code: "CONNECTION_FAILED" });
      return;
    }

    if (this.client?.isConnected) await this.disconnect();
    this.referencedVariables.clear();
    this.connectionTemplate = { transport: msg.transport, config: msg.config } as ConnectionConfig;
    this.connectionConfig = config;
    this.rebuildSecrets();

    this.setStatus("connecting");
    const lifecycle = new AbortController();
    this.signInAbort = lifecycle;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const timeout = this.options.connectTimeoutMs ?? 120_000;
    let rejectTimeout: (error: Error) => void;
    const deadline = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const clock = {
      pause: () => { clearTimeout(connectTimer); },
      resume: () => {
        if (settled || lifecycle.signal.aborted) return;
        clearTimeout(connectTimer);
        connectTimer = setTimeout(() => rejectTimeout(new Error(`Connection timed out after ${timeout} ms`)), timeout);
      },
    };
    try {
      const client: MCPClientInterface =
        config.transport === "stdio"
          ? new StdioMCPClient(config.config, {
              diagnosticSecrets: this.diagnosticSecrets,
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              verbose: this.verbose,
              onLog: this.forwardLog,
              onProgress: (requestId, progress) => this.send({ type: "progress", requestId, ...progress }),
              onSessionPhase: (phase, timestamp, durationMs) => this.send({ type: "session_phase", phase, timestamp, durationMs }),
            })
          : new StreamableHTTPClient(config.config, {
              diagnosticSecrets: this.diagnosticSecrets,
              onElicitation: this.requestElicitation,
              onClose: () => this.connectionClosed(client),
              verbose: this.verbose,
              onLog: this.forwardLog,
              onProgress: (requestId, progress) => this.send({ type: "progress", requestId, ...progress }),
              onSessionPhase: (phase, timestamp, durationMs) => this.send({ type: "session_phase", phase, timestamp, durationMs }),
              onHttpResponse: (requestId, status, headers) =>
                this.send({ type: "http_response", requestId, status, headers }),
              oauth: config.config.auth?.type === "oauth"
                ? this.oauthSignIn(msg.connectionId, config.config.url, lifecycle.signal, clock)
                : undefined,
            });

      this.client = client;
      // SDK request timers do not cover a transport send stuck reading HTTP.
      // Bound the entire handshake and initial tool/prompt discovery instead.
      clock.resume();
      const info = await Promise.race([client.connect(), deadline]);
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
      lifecycle.abort();
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
    } finally {
      settled = true;
      clearTimeout(connectTimer);
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
    this.callSecrets.set(requestId, new Set());
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
      this.send(boundResult(result));
    } catch (err) {
      if (controller.signal.reason === "connection_closed") {
        // connectionClosed() already reported it.
      } else if (controller.signal.reason === "cancelled") {
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
      this.callSecrets.delete(requestId);
      this.rebuildSecrets();
    }
  }

  private invoke(msg: Extract<ClientMessage, { type: "invoke" }>): Promise<void> {
    return this.runCall(msg, async (client, requestId, options) => ({
      type: "result", requestId,
      data: await client.callTool(msg.tool, this.resolveVariables(msg.params, requestId), requestId, options),
    }));
  }

  private invokePrompt(msg: Extract<ClientMessage, { type: "invoke_prompt" }>): Promise<void> {
    return this.runCall(msg, async (client, requestId, options) => ({
      type: "prompt_result", requestId,
      messages: await client.callPrompt(msg.prompt, this.resolveVariables(msg.args, requestId), requestId, options),
    }));
  }

  private async listTools(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    try {
      const tools = await this.client.listTools();
      this.send({ type: "tools_listed", tools });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send({ type: "log", level: "ERROR", source: "studio", message, timestamp: Date.now() });
      this.send({ type: "error", message, code: "TOOLS_ERROR" });
    }
  }

  private async listPrompts(): Promise<void> {
    if (!this.client?.isConnected) {
      this.send({ type: "error", message: "Not connected", code: "NOT_CONNECTED" });
      return;
    }
    try {
      const prompts = await this.client.listPrompts();
      this.send({ type: "prompts_listed", prompts });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send({ type: "log", level: "ERROR", source: "studio", message, timestamp: Date.now() });
      this.send({ type: "error", message, code: "PROMPTS_ERROR" });
    }
  }

  private oauthSignIn(connectionId: string | undefined, serverUrl: string, signal: AbortSignal, clock: { pause(): void; resume(): void }): OAuthSignIn | undefined {
    const oauth = this.options.oauth;
    if (!oauth) return undefined;
    return {
      redirectUrl: oauth.redirectUrl,
      signal,
      storage: connectionId ? oauth.storage(connectionId, serverUrl) : (this.sessionOAuthStorage ??= sessionStorage()),
      authorize: (_authorizationUrl, state, flowSignal) => oauth.redirects.wait(state, flowSignal),
      onAuthorization: authorizationUrl => {
        clock.pause();
        this.send({ type: "log", level: "INFO", source: "studio", message: "OAuth sign-in required; waiting for the browser", timestamp: Date.now() });
        this.send({ type: "oauth_authorize", url: authorizationUrl.toString() });
        return clock.resume;
      },
    };
  }

  async disconnect(): Promise<void> {
    this.signInAbort?.abort();
    this.signInAbort = null;
    this.sessionOAuthStorage = null;
    if (this.status === "disconnected") {
      this.diagnosticSecrets.clear();
      this.connectionTemplate = this.connectionConfig = null;
      this.referencedVariables.clear();
      return;
    }
    this.clearElicitations();
    for (const call of this.calls.values()) call.abort("cancelled");
    const client = this.client;
    this.client = null;
    this.setStatus("disconnected");
    try {
      await client?.disconnect();
      this.send({ type: "disconnected" });
    } finally {
      this.diagnosticSecrets.clear();
      this.connectionTemplate = this.connectionConfig = null;
      this.referencedVariables.clear();
    }
  }

  private resolveVariables<T>(value: T, requestId: string): T {
    this.rememberVariables(value, this.callSecrets.get(requestId));
    const { result, missing } = interpolate(value, this.activeEnv);
    if (missing.length) throw new Error(`Unresolved Variables: ${missing.join(", ")}`);
    return result;
  }

}

/** Preserve result metadata and unaffected blocks; never turn a whole Call into a preview. */
function boundResult(result: ServerMessage): ServerMessage {
  const encoder = new TextEncoder();
  const size = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
  const overallLimit = 16 * 1024 * 1024;
  const blockLimit = 8 * 1024 * 1024;
  const candidates: { bytes: number; replace(): void }[] = [];
  const block = <T,>(value: T): T => {
    if (!value || typeof value !== "object" || !("type" in value) || (value.type !== "text" && value.type !== "image")) return value;
    const bytes = size(value);
    return bytes > blockLimit ? notice(bytes) as T : value;
  };
  const notice = (bytes: number) => ({ type: "text" as const, text: `Response block truncated, ${bytes} bytes (block limit ${blockLimit}; response limit ${overallLimit} bytes).` });
  let bounded = result;
  if (result.type === "result" && isCallToolResult(result.data)) {
    const content = result.data.content.map(block);
    bounded = { ...result, data: { ...result.data, content } };
    content.forEach((value, i) => {
      if (value.type === "text" || value.type === "image") candidates.push({ bytes: size(value), replace: () => { content[i] = notice(size(value)); } });
    });
  } else if (result.type === "prompt_result") {
    const messages = result.messages.map(message => ({ ...message, content: block(message.content) }));
    bounded = { ...result, messages };
    messages.forEach(message => {
      if (message.content.type === "text" || message.content.type === "image") candidates.push({ bytes: size(message.content), replace: () => { message.content = notice(size(message.content)); } });
    });
  }
  let bytes = size(bounded);
  for (const candidate of candidates.sort((a, b) => b.bytes - a.bytes)) {
    if (bytes <= overallLimit) break;
    candidate.replace();
    bytes = size(bounded);
  }
  if (bytes > overallLimit) throw new Error(`Response exceeds ${overallLimit} bytes in structured content or non-text/image blocks`);
  return bounded;
}
