import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { SessionManager, type SessionOptions } from "../../session/manager";
import { createProtocolServer } from "./protocol-server";

type Waiter = { accept: (message: ServerMessage) => boolean; reject: (error: Error) => void };

/** Consumes matching messages once; retains all emissions for diagnostics. */
export class SessionHarness {
  readonly messages: ServerMessage[] = [];
  private pending: ServerMessage[] = [];
  private waiters: Waiter[] = [];
  private session: SessionManager;

  constructor(options: SessionOptions = {}) {
    this.session = new SessionManager(message => {
      this.messages.push(message);
      const index = this.waiters.findIndex(waiter => waiter.accept(message));
      if (index >= 0) this.waiters.splice(index, 1);
      else this.pending.push(message);
    }, options);
  }

  setActiveEnv(env: Record<string, string>) { this.session.setActiveEnv(env); }

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

/** Real SDK HTTP transports on OS-assigned loopback ports. */
export function startHTTPFixture(): ReturnType<typeof startStreamableFixture>;
export function startHTTPFixture(mode: "streamable"): ReturnType<typeof startStreamableFixture>;
export function startHTTPFixture(mode: "sse"): ReturnType<typeof startSSEFixture>;
export function startHTTPFixture(mode: "streamable" | "sse" = "streamable") {
  return mode === "sse" ? startSSEFixture() : startStreamableFixture();
}

/** Stateful Streamable HTTP MCP endpoint backed by the protocol fixture. */
export function createStreamableEndpoint() {
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();
  const protocols = new Set<ReturnType<typeof createProtocolServer>>();
  return {
    async handle(request: Request): Promise<Response> {
      const sessionId = request.headers.get("mcp-session-id");
      if (sessionId) {
        const transport = sessions.get(sessionId);
        return transport ? transport.handleRequest(request) : new Response("Unknown session", { status: 404 });
      }
      const body = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
      if (!isInitializeRequest(body)) return new Response("Expected initialize", { status: 400 });
      const protocol = createProtocolServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: id => { sessions.set(id, transport); },
        onsessionclosed: id => { sessions.delete(id); },
      });
      protocols.add(protocol);
      await protocol.connect(transport);
      return transport.handleRequest(request);
    },
    async close() {
      await Promise.all([...protocols].map(protocol => protocol.close()));
    },
  };
}

async function startStreamableFixture() {
  const endpoint = createStreamableEndpoint();
  const versions: (string | null)[] = [];
  const requests: unknown[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    versions.push(request.headers.get("mcp-protocol-version"));
    if (request.method === "POST") requests.push(await request.clone().json());
    return endpoint.handle(request);
  } });
  return {
    connection: { type: "connect", transport: "http", config: { url: server.url.toString(), headers: {} } } satisfies ClientMessage,
    versions,
    requests,
    async close() {
      await endpoint.close();
      await server.stop(true);
    },
  };
}

async function startSSEFixture() {
  const sessions = new Map<string, SSEServerTransport>();
  const protocols = new Set<ReturnType<typeof createProtocolServer>>();
  const versions: (string | null)[] = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://localhost");
      if (url.pathname === "/sse" && request.method === "GET") {
        const transport = new SSEServerTransport("/messages", response);
        const protocol = createProtocolServer();
        sessions.set(transport.sessionId, transport);
        protocols.add(protocol);
        response.on("close", () => sessions.delete(transport.sessionId));
        await protocol.connect(transport);
      } else if (url.pathname === "/messages" && request.method === "POST") {
        const transport = sessions.get(url.searchParams.get("sessionId") ?? "");
        if (transport) await transport.handlePostMessage(request, response);
        else { response.writeHead(404); response.end(); }
      } else {
        response.writeHead(405);
        response.end("Use legacy SSE");
      }
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  let closing: Promise<void> | undefined;
  return {
    connection: { type: "connect", transport: "http", config: { url: `http://127.0.0.1:${address.port}/sse`, headers: {} } } satisfies ClientMessage,
    versions,
    close() {
      return closing ??= (async () => {
        await Promise.all([...protocols].map(protocol => protocol.close()));
        // Bun 1.3.12 also stops the listener here; newer Bun only closes sockets.
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
          else resolve();
        }));
      })();
    },
  };
}
