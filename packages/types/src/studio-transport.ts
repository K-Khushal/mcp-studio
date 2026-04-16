import type { ConnectionConfig } from "./transport.js";
import type { ServerMessage } from "./messages.js";

// ---------------------------------------------------------------------------
// StudioTransport — frontend-facing abstraction over the wire protocol.
// Initial impl: WebSocketTransport. Future: ElectronIPCTransport.
// ---------------------------------------------------------------------------

export interface StudioTransport {
  connect(config: ConnectionConfig): Promise<void>;
  invoke(tool: string, params: Record<string, unknown>): Promise<string>; // returns requestId
  invokePrompt(prompt: string, args: Record<string, string>): Promise<string>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: ServerMessage) => void): void;
  offMessage(handler: (msg: ServerMessage) => void): void;
  readonly isConnected: boolean;
}
