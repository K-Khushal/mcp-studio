import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/** STDIO-only fixture: reports the subprocess cwd and environment so tests can prove what the Studio Server spawned it with. */
const server = new Server({ name: "runtime-fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "runtime", inputSchema: { type: "object" as const } }] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({
  content: [{ type: "text" as const, text: JSON.stringify({ cwd: process.cwd(), env: process.env }) }],
}));
await server.connect(new StdioServerTransport());
