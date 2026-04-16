import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "./session/manager.js";
import {
  readCollections,
  writeCollections,
  readHistory,
  readEnvironments,
  writeEnvironments,
} from "./persistence/manager.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const CORS_ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";

console.log(`[mcp-studio/server] Starting on ws://localhost:${PORT}`);

const server = Bun.serve<{ session: SessionManager | null }>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // ---------------------------------------------------------------------------
    // HTTP REST endpoints for persistence + environments
    // ---------------------------------------------------------------------------
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" });
    }

    if (req.method === "GET" && url.pathname === "/collections") {
      return readCollections().then(json);
    }

    if (req.method === "POST" && url.pathname === "/collections") {
      return req.json().then((body) => writeCollections(body as Parameters<typeof writeCollections>[0]).then(() => json({ ok: true })));
    }

    if (req.method === "GET" && url.pathname === "/history") {
      return readHistory().then(json);
    }

    if (req.method === "GET" && url.pathname === "/environments") {
      return readEnvironments().then(json);
    }

    if (req.method === "POST" && url.pathname === "/environments") {
      return req.json().then((body) => writeEnvironments(body as Parameters<typeof writeEnvironments>[0]).then(() => json({ ok: true })));
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

      // Sync active environment before every message
      const envs = await readEnvironments();
      const activeEnv = envs.find((e) => e.isActive);
      if (activeEnv) ws.data.session.setActiveEnv(activeEnv.variables);

      await ws.data.session.handle(msg);
    },

    close(ws) {
      console.log("[ws] Client disconnected");
      ws.data.session?.disconnect().catch(console.error);
    },
  },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": CORS_ORIGIN,
    },
  });
}

console.log(`[mcp-studio/server] Listening on port ${server.port}`);
