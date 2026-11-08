import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { SessionManager } from "../../session/manager";
import { createProtocolServer } from "./protocol-server";

type Waiter = { accept: (message: ServerMessage) => boolean; reject: (error: Error) => void };

/** Consumes matching messages once; retains all emissions for diagnostics. */
export class SessionHarness {
  readonly messages: ServerMessage[] = [];
  private pending: ServerMessage[] = [];
  private waiters: Waiter[] = [];
  private session = new SessionManager(message => {
    this.messages.push(message);
    const index = this.waiters.findIndex(waiter => waiter.accept(message));
    if (index >= 0) this.waiters.splice(index, 1);
    else this.pending.push(message);
  });

  send(message: ClientMessage) { return this.session.handle(message); }

  waitFor<T extends ServerMessage["type"]>(type: T, predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 3000): Promise<Extract<ServerMessage, { type: T }>> {
    type Message = Extract<ServerMessage, { type: T }>;
    const matches = (message: ServerMessage): message is Message => message.type === type && predicate(message as Message);
    const index = this.pending.findIndex(matches);
    if (index >= 0) return Promise.resolve(this.pending.splice(index, 1)[0] as Message);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        accept: message => { if (!matches(message)) return false; clearTimeout(timer); resolve(message); return true; },
        reject: error => { clearTimeout(timer); reject(error); },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(item => item !== waiter);
        reject(new Error(`Timed out awaiting ${type}; received: ${JSON.stringify(this.messages)}`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  async close() {
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("Session harness closed"));
    await this.session.disconnect();
  }
}

export const stdioFixture: ClientMessage = {
  type: "connect", transport: "stdio", config: {
    command: process.execPath, args: [new URL("./protocol-server.ts", import.meta.url).pathname], env: {}, inheritSystemEnv: true,
  },
};

/** Real SDK Streamable HTTP on an OS-assigned loopback port. Legacy SSE is stubbed (501). */
export async function startHTTPFixture() {
  const protocol = createProtocolServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  await protocol.connect(transport);
  const versions: (string | null)[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    if (new URL(request.url).pathname === "/sse") return new Response("Legacy SSE fixture not implemented", { status: 501 });
    versions.push(request.headers.get("mcp-protocol-version"));
    return transport.handleRequest(request);
  } });
  return {
    connection: { type: "connect", transport: "http", config: { url: server.url.toString(), headers: {} } } satisfies ClientMessage,
    versions,
    async close() { await protocol.close(); await server.stop(true); },
  };
}
