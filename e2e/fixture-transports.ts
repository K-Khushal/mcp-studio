import type { ClientMessage } from "@mcp-studio/types";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createProtocolServer } from "../apps/server/src/__tests__/fixtures/protocol-server";

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
