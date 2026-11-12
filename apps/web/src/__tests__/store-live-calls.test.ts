import { beforeEach, expect, it, vi } from "vitest";
import type { ServerMessage } from "@mcp-studio/types";
import { transport } from "../transport/websocket-transport";
import { useStore } from "../store";

let receive: (message: ServerMessage) => void;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(transport, "onMessage").mockImplementation(handler => { receive = handler; });
  vi.spyOn(transport, "connect").mockResolvedValue();
  vi.spyOn(transport, "invoke").mockResolvedValue();
  vi.spyOn(transport, "invokePrompt").mockResolvedValue();
  vi.spyOn(transport, "send").mockImplementation(() => {});
  useStore.setState({ selectedConnectionId: "live", connectionStatus: "disconnected" });
  await useStore.getState().connect({ transport: "stdio", config: { command: "fixture", args: [], env: {}, inheritSystemEnv: true } });
  receive({ type: "session_phase", phase: "spawn", timestamp: 100, durationMs: 3 });
  receive({ type: "session_phase", phase: "initialize", timestamp: 103, durationMs: 12 });
  receive({ type: "connected", tools: [], prompts: [] });
});

it("keeps Session phases, live progress and terminal Call phases with durations", async () => {
  useStore.getState().setConfig({ requestTimeout: 7 });
  await useStore.getState().invokeTool("slow", { steps: 3 });
  const requestId = useStore.getState().response.requestId!;
  expect(transport.invoke).toHaveBeenCalledWith("slow", { steps: 3 }, requestId, 7);
  receive({ type: "progress", requestId, progress: 1, total: 3, message: "Working" });
  receive({ type: "progress", requestId, progress: 2, total: 3 });
  expect(useStore.getState().response.progress).toEqual({ progress: 2, total: 3 });
  receive({ type: "result", requestId, data: { content: [] } });
  const state = useStore.getState();
  expect(state.response.isRunning).toBe(false);
  expect(state.timeline.map(step => step.label)).toEqual(["Session: spawn", "Session: initialize", "Call sent", "Progress", "Progress", "Result received"]);
  expect(state.timeline.map(step => step.durationMs)).toEqual([3, 12, 0, expect.any(Number), expect.any(Number), expect.any(Number)]);
  await state.invokeTool("slow", {});
  const cancelledId = useStore.getState().response.requestId!;
  useStore.getState().cancelCall();
  expect(transport.send).toHaveBeenCalledWith({ type: "cancel", requestId: cancelledId });
  expect(useStore.getState().response.isRunning).toBe(true);
  receive({ type: "cancelled", requestId: cancelledId });
  expect(useStore.getState().response.outcome).toBe("cancelled");
  expect(useStore.getState().timeline.at(-1)?.label).toBe("Cancelled");
  expect(useStore.getState().errorCount).toBe(0);
});

it("ignores stale progress/results and applies timeouts to prompt Calls too", async () => {
  await useStore.getState().invokeTool("slow", {});
  const oldId = useStore.getState().response.requestId!;
  receive({ type: "result", requestId: oldId, data: {} });
  useStore.getState().setConfig({ requestTimeout: 9 });
  await useStore.getState().invokePrompt("greet", { name: "Ada" });
  const requestId = useStore.getState().response.requestId!;
  expect(transport.invokePrompt).toHaveBeenCalledWith("greet", { name: "Ada" }, requestId, 9);
  receive({ type: "progress", requestId: oldId, progress: 99 });
  receive({ type: "result", requestId: oldId, data: "stale" });
  expect(useStore.getState().response.progress).toBeNull();
  expect(useStore.getState().response.isRunning).toBe(true);
  receive({ type: "error", requestId, code: "CALL_TIMEOUT", message: "Call timed out after 9 seconds" });
  expect(useStore.getState().response.outcome).toBe("timeout");
  expect(useStore.getState().timeline.at(-1)?.label).toBe("Timeout");
});

it("ignores late prompt results and matching errors after a terminal frame", async () => {
  await useStore.getState().invokePrompt("greet", {});
  const requestId = useStore.getState().response.requestId!;
  receive({ type: "cancelled", requestId });
  const terminal = useStore.getState();
  receive({ type: "prompt_result", requestId, messages: [] });
  receive({ type: "error", requestId, code: "PROMPT_ERROR", message: "late" });
  expect(useStore.getState().response).toEqual(terminal.response);
  expect(useStore.getState().timeline).toEqual(terminal.timeline);
  expect(useStore.getState().errorCount).toEqual(terminal.errorCount);
});

it("retains only the latest 50 progress steps and preserves Session phases", async () => {
  await useStore.getState().invokeTool("slow", {});
  const requestId = useStore.getState().response.requestId!;
  for (let progress = 1; progress <= 200; progress++) receive({ type: "progress", requestId, progress });
  const timeline = useStore.getState().timeline;
  expect(timeline.filter(step => step.label === "Progress")).toHaveLength(50);
  expect(timeline.filter(step => step.label === "Progress")[0]?.detail).toBe("151");
  expect(timeline.filter(step => step.scope === "session")).toHaveLength(2);
});

it("ignores DUPLICATE_REQUEST for the running Call", async () => {
  await useStore.getState().invokeTool("slow", {});
  const requestId = useStore.getState().response.requestId!;
  receive({ type: "error", requestId, code: "DUPLICATE_REQUEST", message: "A Call with this requestId is already running" });
  expect(useStore.getState().response).toMatchObject({ isRunning: true, error: null, outcome: null });
  expect(useStore.getState().errorCount).toBe(0);
  receive({ type: "result", requestId, data: { content: [] } });
  expect(useStore.getState().response.outcome).toBe("result");
});

it("a crash ends the running Call with a Connection closed step and counts once", async () => {
  await useStore.getState().invokeTool("slow", {});
  const requestId = useStore.getState().response.requestId!;
  const reason = "MCP Server connection closed unexpectedly";
  receive({ type: "error", requestId, code: "CONNECTION_CLOSED", message: reason });
  receive({ type: "log", level: "ERROR", source: "studio", message: reason, timestamp: 2 });
  receive({ type: "status", status: "disconnected" });
  receive({ type: "disconnected", reason });
  const state = useStore.getState();
  expect(state.response).toMatchObject({ isRunning: false, outcome: "error", error: reason });
  expect(state.timeline.at(-1)).toMatchObject({ label: "Connection closed", detail: reason });
  expect(state.errorCount).toBe(1);
});

it("a rejected replacement connect leaves the live Session connected", async () => {
  receive({ type: "log", level: "ERROR", source: "studio", message: "Unresolved Variables: MISSING_URL", timestamp: 3 });
  receive({ type: "error", code: "CONNECTION_FAILED", message: "Unresolved Variables: MISSING_URL" });
  const state = useStore.getState();
  expect(state.connectionStatus).toBe("connected");
  expect(state.connectedConnectionId).toBe("live");
  expect(state.connectedConnectionCache).not.toBeNull();
  expect(state.lastConnectionError).toEqual({ connectionId: "live", message: "Unresolved Variables: MISSING_URL" });
  expect(state.logs.filter(log => log.message === "Unresolved Variables: MISSING_URL")).toHaveLength(1);
  await state.invokeTool("echo", {});
  receive({ type: "result", requestId: useStore.getState().response.requestId!, data: { content: [] } });
  expect(useStore.getState().response.outcome).toBe("result");
});
