import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "./session/manager.js";
import { getAllCollections, createCollection, updateCollection, deleteCollection } from "./db/queries/collections.js";
import { createConnection, deleteConnection, updateConnection } from "./db/queries/connections.js";
import { getAllEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, getActiveEnvironment } from "./db/queries/environments.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const production = process.env["STUDIO_PRODUCTION"] === "1";
const CORS_ORIGIN = process.env["CORS_ORIGIN"] ?? (production ? "" : "http://localhost:5173");
const webRoot = process.env["STUDIO_RESOURCE_DIR"]
  ? resolve(process.env["STUDIO_RESOURCE_DIR"], "web")
  : fileURLToPath(new URL("./web/", import.meta.url));

console.log(`[mcp-studio/server] Starting on ws://localhost:${PORT}`);

const server = Bun.serve<{ session: SessionManager | null }>({
  port: PORT,
  hostname: "localhost",

  async fetch(req, server) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const host = req.headers.get("Host") ?? "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(host)) {
      return new Response("Host not allowed", { status: 403 });
    }
    const allowedOrigins = [
      ...["localhost", "127.0.0.1", "[::1]"].map((hostname) => `http://${hostname}:${server.port}`),
      CORS_ORIGIN,
      ...(!production ? ["http://localhost:5173"] : []),
    ];
    if (origin !== null && !allowedOrigins.includes(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    // Keep the development /api proxy and production browser URLs identical.
    url.pathname = url.pathname.replace(/^\/api(?=\/)/, "");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

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
      const { name } = (await req.json()) as { name: string };
      return json(await createCollection(name), 201);
    }

    const collectionMatch = url.pathname.match(/^\/collections\/([^/]+)$/);
    if (collectionMatch) {
      const id = collectionMatch[1]!;
      if (req.method === "PATCH") {
        const { name } = (await req.json()) as { name: string };
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
      const body = (await req.json()) as Parameters<typeof createConnection>[1];
      return json(await createConnection(collectionId, body), 201);
    }

    const connectionMatch = url.pathname.match(/^\/collections\/([^/]+)\/connections\/([^/]+)$/);
    if (connectionMatch) {
      const connId = connectionMatch[2]!;
      if (req.method === "PATCH") {
        const body = (await req.json()) as Parameters<typeof updateConnection>[1];
        await updateConnection(connId, body);
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await deleteConnection(connId);
        return json({ ok: true });
      }
    }

    // ---------------------------------------------------------------------------
    // Environments
    // ---------------------------------------------------------------------------
    if (req.method === "GET" && url.pathname === "/environments") {
      return json(await getAllEnvironments());
    }

    if (req.method === "POST" && url.pathname === "/environments") {
      const { name } = (await req.json()) as { name: string };
      return json(await createEnvironment(name), 201);
    }

    const envMatch = url.pathname.match(/^\/environments\/([^/]+)$/);
    if (envMatch) {
      const id = envMatch[1]!;
      if (req.method === "PATCH") {
        const body = (await req.json()) as Parameters<typeof updateEnvironment>[1];
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
      const upgraded = server.upgrade(req, { data: { session: null } });
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 426 });
      return undefined;
    }

    if (production && (req.method === "GET" || req.method === "HEAD")) {
      let pathname: string;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { return new Response("Bad path", { status: 400 }); }
      const path = resolve(webRoot, pathname === "/" ? "index.html" : `.${pathname}`);
      if (path.startsWith(resolve(webRoot) + sep)) {
        const file = Bun.file(path);
        if (await file.exists()) return new Response(req.method === "HEAD" ? null : file, {
          headers: { "Content-Type": file.type },
        });
      }
    }
    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      const send = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
      ws.data.session = new SessionManager(send);
      console.log("[ws] Client connected");
    },

    async message(ws, raw) {
      if (!ws.data.session) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        ws.send(
          JSON.stringify({ type: "error", message: "Invalid JSON", code: "PARSE_ERROR" })
        );
        return;
      }

      const activeEnv = await getActiveEnvironment();
      ws.data.session.setActiveEnv(activeEnv?.variables ?? {});

      await ws.data.session.handle(msg);
    },

    close(ws) {
      console.log("[ws] Client disconnected");
      ws.data.session?.disconnect().catch(console.error);
    },
  },
});

function corsHeaders(): Record<string, string> {
  return {
    ...(CORS_ORIGIN ? { "Access-Control-Allow-Origin": CORS_ORIGIN } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

console.log(`[mcp-studio/server] Listening on port ${server.port}`);
