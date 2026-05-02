import type { StudioTransport, ServerMessage, ConnectionConfig } from "@mcp-studio/types";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:3000/ws";

/**
 * WebSocketTransport — the live implementation of StudioTransport.
 * Manages the WebSocket lifecycle and routes messages to registered handlers.
 */
export class WebSocketTransport implements StudioTransport {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: ServerMessage) => void>();

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await this.ensureSocket();
    this.send({ type: "connect", ...config });
  }

  async invoke(tool: string, params: Record<string, unknown>): Promise<void> {
    this.send({ type: "invoke", tool, params });
  }

  async invokePrompt(prompt: string, args: Record<string, string>): Promise<void> {
    this.send({ type: "invoke_prompt", prompt, args });
  }

  async disconnect(): Promise<void> {
    this.send({ type: "disconnect" });
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

  private send(msg: unknown): void {
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
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));
      this.ws.onclose = () => {
        this.dispatch({ type: "disconnected" });
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
