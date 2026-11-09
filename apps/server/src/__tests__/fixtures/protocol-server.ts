import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

export function createProtocolServer() {
  const server = new Server({ name: "protocol-fixture", version: "1" }, { capabilities: { tools: {}, prompts: {}, logging: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    ...["echo", "error", "slow", "elicit", "log", "stderr", "crash"].map(name => ({ name, inputSchema: { type: "object" as const, properties: { text: { type: "string" }, steps: { type: "integer", minimum: 1, maximum: 100 } } } })),
    ...["structured-bad", "structured-missing"].map(name => ({ name, inputSchema: { type: "object" as const }, outputSchema: { type: "object" as const, properties: { answer: { type: "number" } }, required: ["answer"] } })),
    { name: "structured", title: "Structured answer",
      description: "Returns a structured answer with an output schema.",
      icons: [{ src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", mimeType: "image/png" }],
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: { type: "object" as const }, outputSchema: { type: "object" as const, properties: { answer: { type: "number" } }, required: ["answer"] } },
  ].sort((a, b) => ["echo", "error", "slow", "structured", "elicit", "log", "stderr", "crash"].indexOf(a.name) - ["echo", "error", "slow", "structured", "elicit", "log", "stderr", "crash"].indexOf(b.name)) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const args = request.params.arguments ?? {};
    switch (request.params.name) {
      case "echo": return text(String(args.text ?? "hello"));
      case "error": return { ...text("Fixture tool error"), isError: true };
      case "structured-bad": return { ...text('{"answer":"wrong"}'), structuredContent: { answer: "wrong" } };
      case "structured-missing": return text("Missing structured content");
      case "structured": return { ...text('{"answer":42}'), structuredContent: { answer: 42 } };
      case "slow": {
        const steps = Math.max(1, Math.min(100, Number(args.steps) || 5));
        for (let progress = 1; progress <= steps; progress++) {
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              void server.sendLoggingMessage({ level: "info", logger: "fixture", data: "Slow Call aborted" });
              reject(extra.signal.reason ?? new Error("Cancelled"));
            };
            const timer = setTimeout(() => { extra.signal.removeEventListener("abort", abort); resolve(); }, 50);
            extra.signal.addEventListener("abort", abort, { once: true });
            if (extra.signal.aborted) abort();
          });
          const progressToken = request.params._meta?.progressToken;
          if (progressToken !== undefined) await extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress, total: steps, message: `Step ${progress} of ${steps}` } });
        }
        return text("Finished");
      }
      case "elicit": return text(JSON.stringify(await server.elicitInput({ message: "Your name?", requestedSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } })));
      case "log": await server.sendLoggingMessage({ level: "info", logger: "fixture", data: "Fixture log" }); return text("Logged");
      case "stderr": {
        if (args.text === "chunks") {
          for (const chunk of [Buffer.from("boo"), Buffer.from("ting\n"), Buffer.from([0xe2]), Buffer.from([0x82, 0xac, 0x0a]), Buffer.from("tail")]) {
            process.stderr.write(chunk);
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        } else process.stderr.write("Fixture stderr\n");
        return text("Written to stderr");
      }
      case "crash": return process.exit(23);
      default: throw new Error(`Unknown tool: ${request.params.name}`);
    }
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "greet", arguments: [{ name: "name", required: true }] }] }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "greet") throw new Error("Unknown prompt");
    return { messages: [{ role: "user", content: { type: "text", text: `Hello, ${request.params.arguments?.name}!` } }] };
  });
  return server;
}

if (import.meta.main) await createProtocolServer().connect(new StdioServerTransport());
