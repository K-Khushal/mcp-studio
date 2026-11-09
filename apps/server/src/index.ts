import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "bun";
import type { ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "./session/manager.js";
import { parseClientMessage } from "./session/client-message.js";
import { getAllCollections, createCollection, updateCollection, deleteCollection } from "./db/queries/collections.js";
import { createConnection, deleteConnection, updateConnection } from "./db/queries/connections.js";
import { getAllEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, getActiveEnvironment } from "./db/queries/environments.js";
import { clearOAuthCredentials, oauthStorage } from "./db/queries/oauth-credentials.js";
import { oauthCallbackResponse, OAuthRedirects } from "./oauth/redirects.js";
import { clearLegacyCookie, hasWebSocketToken, isAuthorized, resolveToken, unauthorized } from "./http/access.js";
import { BadRequest, parseExtraOrigin, readJsonObject, withSecurityHeaders } from "./http/security.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const production = process.env["STUDIO_PRODUCTION"] === "1";
const extraOrigin = parseExtraOrigin(process.env["CORS_ORIGIN"]);
/** Development only: the Vite dev server origin the printed link redirects to (ADR-0007). */
const devAppOrigin = production ? "" : extraOrigin || "http://localhost:5173";
const corsOrigin = extraOrigin || devAppOrigin;
/** The Launch token (ADR-0007); the CLI prints the link that carries it. */
export const token = resolveToken(process.env);
const webRoot = process.env["STUDIO_RESOURCE_DIR"]
  ? resolve(process.env["STUDIO_RESOURCE_DIR"], "web")
  : fileURLToPath(new URL("./web/", import.meta.url));
const oauthRedirects = new OAuthRedirects();

type SocketData = { session: SessionManager | null };

process.on("unhandledRejection", error => console.error("[mcp-studio/server] Unhandled rejection:", error));

async function route(req: Request, server: Server<SocketData>): Promise<Response | undefined> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const host = req.headers.get("Host") ?? "";
  const allowedHosts = [
    ...["localhost", "127.0.0.1", "[::1]"].map(hostname => `${hostname}:${port}`),
    // The Vite dev proxy keeps the browser's Host.
    ...(devAppOrigin ? [new URL(devAppOrigin).host] : []),
  ];
  if (!allowedHosts.includes(host.toLowerCase())) {
    return new Response("Host not allowed", { status: 403 });
  }
  const allowedOrigins = [
    ...["localhost", "127.0.0.1", "[::1]"].map((hostname) => `http://${hostname}:${port}`),
    ...(corsOrigin ? [corsOrigin] : []),
  ];
  if (origin !== null && !allowedOrigins.includes(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }
  // Keep the development /api proxy and production browser URLs identical.
  url.pathname = url.pathname.replace(/^\/api(?=\/)/, "");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // OAuth redirects authenticate with single-use state (ADR-0007).
  if (req.method === "GET" && url.pathname === "/oauth/callback") {
    return oauthCallbackResponse(url, oauthRedirects);
  }

  // Development hands the launch URL to Vite; the page consumes the token at its own origin.
  if (devAppOrigin && req.method === "GET" && url.pathname === "/" && url.searchParams.has("token")) {
    return new Response(null, { status: 303, headers: { Location: `${devAppOrigin}/${url.search}`, "Cache-Control": "no-store" } });
  }

  if (production && (req.method === "GET" || req.method === "HEAD")) {
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response("Bad path", { status: 400 }); }
    if (pathname.includes("\0")) return new Response("Bad path", { status: 400 });
    const path = resolve(webRoot, pathname === "/" ? "index.html" : `.${pathname}`);
    if (path.startsWith(resolve(webRoot) + sep)) {
      const file = Bun.file(path);
      if (await file.exists()) return new Response(req.method === "HEAD" ? null : file, {
        headers: { "Content-Type": file.type },
      });
    }
  }
  if (!isAuthorized(req, token) && !(url.pathname === "/ws" && hasWebSocketToken(req, token))) return unauthorized();

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/health") {
    return json({ status: "ok" });
  }

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/collections") {
    return json(await getAllCollections());
  }

  if (req.method === "POST" && url.pathname === "/collections") {
    const { name } = await readJsonObject<{ name: string }>(req);
    return json(await createCollection(name), 201);
  }

  const collectionMatch = url.pathname.match(/^\/collections\/([^/]+)$/);
  if (collectionMatch) {
    const id = collectionMatch[1]!;
    if (req.method === "PATCH") {
      const { name } = await readJsonObject<{ name: string }>(req);
      await updateCollection(id, name);
      return json({ ok: true });
    }
    if (req.method === "DELETE") {
      await deleteCollection(id);
      return json({ ok: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------
  const connectionsMatch = url.pathname.match(/^\/collections\/([^/]+)\/connections$/);
  if (connectionsMatch && req.method === "POST") {
    const collectionId = connectionsMatch[1]!;
    const body = await readJsonObject<Parameters<typeof createConnection>[1]>(req);
    return json(await createConnection(collectionId, body), 201);
  }

  const connectionMatch = url.pathname.match(/^\/collections\/([^/]+)\/connections\/([^/]+)$/);
  if (connectionMatch) {
    const connId = connectionMatch[2]!;
    if (req.method === "PATCH") {
      const body = await readJsonObject<Parameters<typeof updateConnection>[1]>(req);
      await updateConnection(connId, body);
      return json({ ok: true });
    }
    if (req.method === "DELETE") {
      await deleteConnection(connId);
      return json({ ok: true });
    }
  }

  // Sign out: forget the Connection's OAuth tokens and client registration
  const oauthMatch = url.pathname.match(/^\/collections\/([^/]+)\/connections\/([^/]+)\/oauth$/);
  if (oauthMatch && req.method === "DELETE") {
    await clearOAuthCredentials(oauthMatch[2]!);
    return json({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // Environments
  // ---------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/environments") {
    return json(await getAllEnvironments());
  }

  if (req.method === "POST" && url.pathname === "/environments") {
    const { name } = await readJsonObject<{ name: string }>(req);
    return json(await createEnvironment(name), 201);
  }

  const envMatch = url.pathname.match(/^\/environments\/([^/]+)$/);
  if (envMatch) {
    const id = envMatch[1]!;
    if (req.method === "PATCH") {
      const body = await readJsonObject<Parameters<typeof updateEnvironment>[1]>(req);
      await updateEnvironment(id, body);
      return json({ ok: true });
    }
    if (req.method === "DELETE") {
      await deleteEnvironment(id);
      return json({ ok: true });
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket upgrade
  // ---------------------------------------------------------------------------
  if (url.pathname === "/ws") {
    const upgraded = server.upgrade(req, {
      data: { session: null },
      ...(hasWebSocketToken(req, token) ? { headers: { "Sec-WebSocket-Protocol": "mcp-studio" } } : {}),
    });
    if (!upgraded) return new Response("WebSocket upgrade failed", { status: 426 });
    return undefined;
  }

  return new Response("Not found", { status: 404 });
}

const websocket: Bun.WebSocketHandler<SocketData> = {
  open(ws) {
    const send = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    ws.data.session = new SessionManager(send, {
      oauth: {
        redirectUrl: `http://localhost:${port}/oauth/callback`,
        redirects: oauthRedirects,
        storage: oauthStorage,
      },
    });
    console.log("[ws] Client connected");
  },

  async message(ws, raw) {
    if (!ws.data.session) return;
    try {
      const parsed = parseClientMessage(typeof raw === "string" ? raw : raw.toString("utf8"));
      if ("error" in parsed) {
        ws.send(JSON.stringify(parsed.error));
        return;
      }
      const activeEnv = await getActiveEnvironment();
      ws.data.session.setActiveEnv(activeEnv?.variables ?? {});
      await ws.data.session.handle(parsed.message);
    } catch (error) {
      console.error("[ws] Message handling failed:", error);
      ws.send(JSON.stringify({ type: "error", code: "INTERNAL_ERROR", message: "Studio Server failed to handle the message" } satisfies ServerMessage));
    }
  },

  close(ws) {
    console.log("[ws] Client disconnected");
    ws.data.session?.disconnect().catch(console.error);
  },
};

function serve(hostname: string, requestedPort: number): Server<SocketData> {
  return Bun.serve<SocketData>({
    hostname,
    port: requestedPort,
    // Never Bun's development error page: it leaks stacks, source and paths.
    development: false,
    async fetch(req, server) {
      try {
        const response = await route(req, server);
        return response && withSecurityHeaders(clearLegacyCookie(response, port, req));
      } catch (error) {
        if (error instanceof BadRequest) return withSecurityHeaders(new Response(error.message, { status: 400 }));
        throw error;
      }
    },
    error(error) {
      console.error("[mcp-studio/server] Request failed:", error);
      return withSecurityHeaders(new Response("Internal error", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    },
    websocket,
  });
}

/**
 * Listen on both loopback families on one port, so another local user cannot squat [::1]:port
 * and receive browser traffic for http://localhost:port. A taken [::1] port fails startup;
 * a host without IPv6 runs on 127.0.0.1 alone.
 */
function listenOnLoopback(requestedPort: number): Server<SocketData>[] {
  for (let attempt = 0; ; attempt++) {
    const ipv4 = serve("127.0.0.1", requestedPort);
    try {
      return [ipv4, serve("::1", ipv4.port!)];
    } catch (error) {
      if ((error as { code?: string }).code !== "EADDRINUSE") {
        console.warn("[mcp-studio/server] IPv6 loopback unavailable; listening on 127.0.0.1 only");
        return [ipv4];
      }
      void ipv4.stop(true);
      if (requestedPort === 0 && attempt < 5) continue;
      throw new Error(`Port ${requestedPort} is already in use on [::1]; another process may be impersonating MCP Studio. Choose another --port.`, { cause: error });
    }
  }
}

const servers = listenOnLoopback(PORT);
/** The port the Studio Server listens on (resolved when PORT=0). */
export const port = servers[0]!.port!;

function corsHeaders(): Record<string, string> {
  return {
    ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

console.log(`[mcp-studio/server] Listening on port ${port}`);
if (!production) console.log(`[mcp-studio/server] Open http://localhost:${port}/?token=${token}`);
