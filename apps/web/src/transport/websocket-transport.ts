import type { StudioTransport, ServerMessage, ConnectionConfig, ClientMessage } from "@mcp-studio/types";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? (import.meta.env.DEV ? "ws://localhost:3000/ws" : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`);

/**
 * WebSocketTransport — the live implementation of StudioTransport.
 * Manages the WebSocket lifecycle and routes messages to registered handlers.
 */
export class WebSocketTransport implements StudioTransport {
  private ws: WebSocket | null = null;
  private intentionalClose = false;
  private handlers = new Set<(msg: ServerMessage) => void>();

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(config: ConnectionConfig, verbose = false, connectionId?: string): Promise<void> {
    await this.ensureSocket();
    this.send({ type: "connect", verbose, ...config, ...(connectionId ? { connectionId } : {}) });
  }

  setVerbose(verbose: boolean): void {
    this.send({ type: "set_verbose", verbose });
  }

  async invoke(tool: string, params: Record<string, unknown>, requestId?: string, requestTimeout?: number): Promise<void> {
    this.send({ type: "invoke", tool, params, requestId, requestTimeout });
  }

  async invokePrompt(prompt: string, args: Record<string, string>, requestId?: string, requestTimeout?: number): Promise<void> {
    this.send({ type: "invoke_prompt", prompt, args, requestId, requestTimeout });
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.send({ type: "disconnect" });
    this.ws?.close();
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.handlers.add(handler);
  }

  offMessage(handler: (msg: ServerMessage) => void): void {
    this.handlers.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[transport] send() called while socket not open");
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private async ensureSocket(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await this.waitForOpen();
      return;
    }

    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.ws = new WebSocket(WS_URL);

      const ws = this.ws;
      let opened = false;
      this.ws.onopen = () => { opened = true; resolve(); };
      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));
      this.ws.onclose = () => {
        if (!opened || ws !== this.ws) return;
        this.dispatch({ type: "disconnected", ...(this.intentionalClose ? {} : { reason: "Studio Server connection closed unexpectedly" }) });
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as ServerMessage;
          this.dispatch(msg);
        } catch {
          console.error("[transport] Failed to parse server message", e.data);
        }
      };
    });
  }

  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        } else if (
          this.ws?.readyState === WebSocket.CLOSED ||
          this.ws?.readyState === WebSocket.CLOSING
        ) {
          clearInterval(check);
          reject(new Error("WebSocket closed while waiting"));
        }
      }, 50);
    });
  }

  private dispatch(msg: ServerMessage): void {
    for (const handler of this.handlers) handler(msg);
  }
}

// Singleton — one transport instance per browser session
export const transport = new WebSocketTransport();
