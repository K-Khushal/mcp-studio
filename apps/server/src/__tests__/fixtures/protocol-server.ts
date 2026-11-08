import { createInterface } from "node:readline";

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const result = message.method === "initialize"
    ? { protocolVersion: "2025-03-26", capabilities: { tools: {}, prompts: {} }, serverInfo: { name: "protocol-fixture", version: "1" } }
    : message.method === "tools/list"
      ? { tools: [{ name: "echo", inputSchema: { type: "object" } }] }
      : message.method === "prompts/list"
        ? { prompts: [] }
        : { content: [{ type: "text", text: "hello" }] };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
});
