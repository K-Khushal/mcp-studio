import { expect, test } from "bun:test";
import type { ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "../session/manager";

test("Session reports the negotiated STDIO protocol and runs a tool", async () => {
  const messages: ServerMessage[] = [];
  const session = new SessionManager((message) => messages.push(message));
  try {
    await session.handle({
      type: "connect", transport: "stdio",
      config: {
        command: process.execPath,
        args: [new URL("./fixtures/protocol-server.ts", import.meta.url).pathname],
        env: {}, inheritSystemEnv: true,
      },
    });
    expect(messages.find((m) => m.type === "connected")).toMatchObject({
      protocolVersion: "2025-03-26",
    });
    await session.handle({ type: "invoke", tool: "echo", params: {} });
    expect(messages.find((m) => m.type === "result")).toMatchObject({
      data: { content: [{ type: "text", text: "hello" }] },
    });
  } finally {
    await session.handle({ type: "disconnect" });
  }
});

test("Session reports the negotiated HTTP protocol and preserves transport headers", async () => {
  const versions: (string | null)[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      versions.push(request.headers.get("mcp-protocol-version"));
      const message = await request.json() as { id?: number; method: string };
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result = message.method === "initialize"
        ? { protocolVersion: "2025-03-26", capabilities: { tools: {}, prompts: {} }, serverInfo: { name: "http-fixture", version: "1" } }
        : message.method === "tools/list" ? { tools: [] } : { prompts: [] };
      return Response.json({ jsonrpc: "2.0", id: message.id, result });
    },
  });
  const messages: ServerMessage[] = [];
  const session = new SessionManager((message) => messages.push(message));
  try {
    await session.handle({
      type: "connect", transport: "http",
      config: { url: server.url.toString(), headers: {} },
    });
    expect(messages.find((m) => m.type === "connected")).toMatchObject({
      protocolVersion: "2025-03-26",
    });
    expect(versions.slice(1)).toEqual(["2025-03-26", "2025-03-26", "2025-03-26"]);
  } finally {
    await session.handle({ type: "disconnect" });
    await server.stop(true);
  }
});
