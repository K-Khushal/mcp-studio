import { expect, it, vi } from "vitest";
import type { MCPTool, ServerMessage } from "@mcp-studio/types";
let deliver: (msg: ServerMessage) => void = () => {};
vi.mock("../transport/websocket-transport", () => ({
  transport: {
    onMessage: (handler: typeof deliver) => { deliver = handler; },
    connect: vi.fn().mockResolvedValue(undefined),
    invoke: vi.fn().mockResolvedValue(undefined),
  },
}));
const { useStore } = await import("../store");
it("retains the Call's output schema when the user selects another tool", async () => {
  const structured: MCPTool = { name: "structured", description: "", inputSchema: {}, outputSchema: { type: "object", required: ["answer"] } };
  const other: MCPTool = { name: "other", description: "", inputSchema: {}, outputSchema: { type: "object", required: ["other"] } };
  useStore.setState({ selectedConnectionId: "c", connectionStatus: "disconnected" });
  await useStore.getState().connect({ transport: "http", config: { url: "http://fixture", headers: {} } });
  deliver({ type: "connected", protocolVersion: "2025-11-25", tools: [structured, other], prompts: [] });
  await useStore.getState().invokeTool("structured", {});
  useStore.getState().selectTool(other);
  deliver({ type: "result", requestId: useStore.getState().response.requestId!, data: { content: [], structuredContent: { answer: 42 } } });
  expect(useStore.getState().response.outputSchema).toEqual(structured.outputSchema);
  expect(useStore.getState().response.result).toEqual({ content: [], structuredContent: { answer: 42 } });
});
