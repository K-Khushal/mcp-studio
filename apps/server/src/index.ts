import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "./session/manager.js";
import { getAllCollections, createCollection, updateCollection, deleteCollection } from "./db/queries/collections.js";
import { createRequest, deleteRequest, updateRequest } from "./db/queries/requests.js";
import { getAllEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, getActiveEnvironment } from "./db/queries/environments.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const CORS_ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";

console.log(`[mcp-studio/server] Starting on ws://localhost:${PORT}`);

const server = Bun.serve<{ session: SessionManager | null }>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

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
    // Requests
    // ---------------------------------------------------------------------------
    const requestsMatch = url.pathname.match(/^\/collections\/([^/]+)\/requests$/);
    if (requestsMatch && req.method === "POST") {
      const collectionId = requestsMatch[1]!;
      const body = (await req.json()) as Parameters<typeof createRequest>[1];
      return json(await createRequest(collectionId, body), 201);
    }

    const requestMatch = url.pathname.match(/^\/collections\/([^/]+)\/requests\/([^/]+)$/);
    if (requestMatch) {
      const reqId = requestMatch[2]!;
      if (req.method === "PATCH") {
        const { name } = (await req.json()) as { name: string };
        await updateRequest(reqId, name);
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await deleteRequest(reqId);
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
      if (activeEnv) ws.data.session.setActiveEnv(activeEnv.variables);

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
    "Access-Control-Allow-Origin": CORS_ORIGIN,
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
