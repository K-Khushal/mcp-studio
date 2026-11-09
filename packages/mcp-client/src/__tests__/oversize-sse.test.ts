import { it, expect } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { StreamableHTTPClient } from "../streamable-http-client.js";

it.each(["streamable", "sse"])("drops a 9 MiB event and fails active Calls (%s)", async variant => {
  let stream: ServerResponse | undefined;
  const event = (response: ServerResponse, id: unknown, result: unknown) =>
    response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`);
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") { res.end(); return; }
    if (req.method === "GET") {
      if (variant === "streamable") { res.writeHead(405).end(); return; }
      res.writeHead(200, { "content-type": "text/event-stream" });
      stream = res;
      res.write("event: endpoint\ndata: /messages\n\n");
      return;
    }
    if (variant === "sse" && req.url !== "/messages") { res.writeHead(405).end(); return; }
    let body = "";
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) { res.writeHead(202).end(); return; }
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
      : message.method === "tools/list" ? { tools: [] } : { content: [] };
    if (variant === "sse") res.writeHead(202).end();
    else res.writeHead(200, { "content-type": "text/event-stream" });
    const target = variant === "sse" ? stream! : res;
    if (message.method === "tools/call" && message.params.name === "oversize") {
      target.write(`data: ${"x".repeat(9 * 1024 * 1024)}\n\n`);
    } else event(target, message.id, result);
    if (variant === "streamable") target.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const logs: unknown[][] = [];
  const client = new StreamableHTTPClient({ headers: {}, url: `http://127.0.0.1:${address.port}` }, {
    onLog: (...args) => logs.push(args),
  });
  try {
    await client.connect();
    await expect(client.callTool("oversize", {}, "large", {
      signal: new AbortController().signal, timeout: 2000,
    })).rejects.toThrow("SSE event exceeds 4194304 bytes; dropped");
    expect(logs).toContainEqual(["ERROR", "studio", "SSE event exceeds 4194304 bytes; dropped", undefined]);
    expect(client.isConnected).toBe(true);
    await expect(client.callTool("ok", {}, "small")).resolves.toEqual({ content: [] });
  } finally {
    await client.disconnect();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 10000);
