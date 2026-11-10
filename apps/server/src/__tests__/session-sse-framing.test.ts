import { expect, test } from "bun:test";
import { SessionHarness } from "./fixtures/session-harness";
import { startCrlfSSEFixture } from "./fixtures/crlf-sse-server";

for (const newline of ["\r\n", "\r", "\n"]) {
  for (const split of [false, true]) {
    test(`Session connects to single-event SSE POST responses (${JSON.stringify(newline)}, split=${split})`, async () => {
      const server = startCrlfSSEFixture(newline, split);
      const session = new SessionHarness();
      const connecting = session.send({ type: "connect", transport: "http", config: { url: server.url.toString(), headers: {} } });
      try {
        expect(await session.waitFor("connected", undefined, 500)).toMatchObject({
          httpVariant: "streamable", serverInfo: { name: "crlf-fixture" }, tools: [{ name: "echo" }],
        });
      } finally {
        await session.close();
        await connecting;
        await server.stop(true);
      }
    });
  }
}

for (const stall of ["initialize", "tools/list"]) {
  test(`Session reports a timeout and can reconnect after stalled ${stall}`, async () => {
    let aborted = false;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = await request.json() as { method: string; id?: number };
      if (message.method === stall) {
        request.signal.addEventListener("abort", () => { aborted = true; });
        return new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } });
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      return Response.json({ jsonrpc: "2.0", id: message.id, result: message.method === "initialize"
        ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "stall", version: "1" } }
        : { prompts: [] } });
    } });
    const session = new SessionHarness({ connectTimeoutMs: 50 });
    const healthy = startCrlfSSEFixture();
    const connecting = session.send({ type: "connect", transport: "http", config: { url: server.url.toString(), headers: {} } });
    try {
      expect(await session.waitFor("error", undefined, 500)).toMatchObject({ code: "CONNECTION_FAILED", message: "Connection timed out after 50 ms" });
      await connecting;
      expect(session.messages).toContainEqual({ type: "status", status: "error" });
      // Cleanup must abort the stalled response, not just stop awaiting it.
      for (let i = 0; i < 20 && !aborted; i++) await Bun.sleep(5);
      expect(aborted).toBe(true);
      await session.send({ type: "connect", transport: "http", config: { url: healthy.url.toString(), headers: {} } });
      expect(await session.waitFor("connected")).toMatchObject({ serverInfo: { name: "crlf-fixture" } });
    } finally {
      await session.close();
      await connecting;
      await server.stop(true);
      await healthy.stop(true);
    }
  });
}
