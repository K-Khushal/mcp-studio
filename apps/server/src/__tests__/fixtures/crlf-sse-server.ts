/** DeepWiki-style stateless MCP: a single CRLF SSE event per POST, then EOF. */
export function startCrlfSSEFixture(newline = "\r\n", split = false) {
  return Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = await request.json() as { method: string; id?: number };
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result = message.method === "initialize"
        ? { protocolVersion: "2025-03-26", capabilities: { logging: {}, tools: { listChanged: true }, prompts: { listChanged: true }, resources: { listChanged: true } }, serverInfo: { name: "crlf-fixture", version: "1" } }
        : message.method === "tools/list"
          ? { tools: [{ name: "echo", inputSchema: { type: "object" } }] }
          : { prompts: [] };
      const data = new TextEncoder().encode(`event: message${newline}data: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}${newline}${newline}`);
      let offset = 0;
      return new Response(new ReadableStream({
        pull(controller) {
          if (offset === data.length) { controller.close(); return; }
          const end = split ? offset + 1 : data.length;
          controller.enqueue(data.slice(offset, end));
          offset = end;
        },
      }), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
    },
  });
}
