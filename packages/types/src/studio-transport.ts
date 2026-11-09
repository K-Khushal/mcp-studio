import type { ConnectionConfig } from "./transport.js";
import type { ServerMessage } from "./messages.js";

// ---------------------------------------------------------------------------
// StudioTransport — frontend-facing abstraction over the wire protocol.
// Initial impl: WebSocketTransport. Future: ElectronIPCTransport.
// ---------------------------------------------------------------------------

export interface StudioTransport {
  connect(config: ConnectionConfig, verbose?: boolean): Promise<void>;
  /** Apply the verbose logging setting to the live Session without reconnecting. */
  setVerbose(verbose: boolean): void;
  invoke(tool: string, params: Record<string, unknown>, requestId?: string, requestTimeout?: number): Promise<void>;
  invokePrompt(prompt: string, args: Record<string, string>, requestId?: string, requestTimeout?: number): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: ServerMessage) => void): void;
  offMessage(handler: (msg: ServerMessage) => void): void;
  readonly isConnected: boolean;
}
