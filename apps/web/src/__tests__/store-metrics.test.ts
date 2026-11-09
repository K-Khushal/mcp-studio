import { expect, it, vi } from "vitest";
import { transport } from "../transport/websocket-transport";
import { useStore } from "../store";
import type { ServerMessage } from "@mcp-studio/types";

it("counts connection failures, Calls and tool errors, retaining last latency", async () => {
  let receive!: (message: ServerMessage) => void;
  vi.spyOn(transport, "onMessage").mockImplementation(handler => { receive = handler; });
  vi.spyOn(transport, "connect").mockResolvedValue();
  vi.spyOn(transport, "invoke").mockResolvedValue();
  useStore.setState({ selectedConnectionId: "metrics" });
  await useStore.getState().connect({ transport: "http", config: { url: "http://localhost:1", headers: {} } });
  receive({ type: "log", level: "ERROR", source: "studio", message: "Connection refused", timestamp: 1 });
  receive({ type: "error", code: "CONNECTION_FAILED", message: "Connection refused" });
  expect(useStore.getState().errorCount).toBe(1);
  expect(useStore.getState().connectionStatus).toBe("error");
  receive({ type: "connected", tools: [], prompts: [] });
  expect(useStore.getState().errorCount).toBe(0);
  await useStore.getState().invokeTool("error", {});
  receive({ type: "result", requestId: "1", data: { isError: true, content: [] } });
  expect(useStore.getState().requestCount).toBe(1);
  expect(useStore.getState().errorCount).toBe(1);
  expect(useStore.getState().latency).toBeGreaterThanOrEqual(0);
  await useStore.getState().invokeTool("echo", {});
  receive({ type: "result", requestId: "2", data: { content: [] } });
  expect(useStore.getState().requestCount).toBe(2);
  expect(useStore.getState().errorCount).toBe(1);
  await useStore.getState().invokeTool("missing", {});
  receive({ type: "error", requestId: "3", code: "TOOL_ERROR", message: "Unknown tool" });
  expect(useStore.getState().requestCount).toBe(3);
  expect(useStore.getState().errorCount).toBe(2);
  receive({ type: "log", level: "ERROR", source: "studio", message: "MCP Server connection closed unexpectedly", timestamp: 2 });
  receive({ type: "disconnected", reason: "MCP Server connection closed unexpectedly" });
  expect(useStore.getState().connectionStatus).toBe("disconnected");
  expect(useStore.getState().errorCount).toBe(3);
  expect(useStore.getState().logs.filter(log => log.level === "ERROR")).toHaveLength(1);
  vi.restoreAllMocks();
});


it("a crash counts once and retains the pending Call error after cache cleanup", async () => {
  let receive!: (message: ServerMessage) => void;
  vi.spyOn(transport, "onMessage").mockImplementation(handler => { receive = handler; });
  vi.spyOn(transport, "connect").mockResolvedValue();
  vi.spyOn(transport, "invoke").mockResolvedValue();
  useStore.setState({ selectedConnectionId: "crash" });
  await useStore.getState().connect({ transport: "http", config: { url: "http://localhost:1", headers: {} } });
  receive({ type: "connected", tools: [], prompts: [] });
  await useStore.getState().invokeTool("crash", {});
  receive({ type: "status", status: "disconnected" });
  receive({ type: "log", level: "ERROR", source: "studio", message: "MCP Server connection closed unexpectedly", timestamp: 2 });
  receive({ type: "disconnected", reason: "MCP Server connection closed unexpectedly" });
  receive({ type: "error", requestId: "pending", code: "TOOL_ERROR", message: "Connection closed" });
  expect(useStore.getState().errorCount).toBe(1);
  expect(useStore.getState().response.error).toBe("Connection closed");
  vi.restoreAllMocks();
});
