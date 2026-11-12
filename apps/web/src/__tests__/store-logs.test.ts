import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig, ServerMessage } from "@mcp-studio/types";

let deliver: (msg: ServerMessage) => void = () => {};
const mockTransport = vi.hoisted(() => ({
  isConnected: false,
  onMessage: undefined as unknown as (handler: (msg: ServerMessage) => void) => void,
  connect: undefined as unknown as ReturnType<typeof vi.fn>,
  disconnect: undefined as unknown as ReturnType<typeof vi.fn>,
  setVerbose: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("../transport/websocket-transport", () => {
  mockTransport.onMessage = (handler) => { deliver = handler; };
  mockTransport.connect = vi.fn().mockResolvedValue(undefined);
  mockTransport.disconnect = vi.fn().mockResolvedValue(undefined);
  mockTransport.setVerbose = vi.fn();
  return { transport: mockTransport };
});

const { useStore } = await import("../store/index.js");

const stdio: ConnectionConfig = {
  transport: "stdio",
  config: { command: "npx", args: [], env: {}, inheritSystemEnv: true },
};

beforeEach(async () => {
  mockTransport.isConnected = false;
  mockTransport.connect.mockClear();
  mockTransport.setVerbose.mockClear();
  useStore.setState({ selectedConnectionId: "conn-1", connectionStatus: "disconnected" });
  useStore.getState().setConfig({ verboseLogging: false });
  await useStore.getState().connect(stdio);
  deliver({ type: "connected", protocolVersion: "2025-06-18", tools: [], prompts: [] });
});

describe("handshake logs", () => {
  it("keeps entries that arrive while connecting", async () => {
    useStore.setState({ selectedConnectionId: "conn-1", connectionStatus: "disconnected" });
    await useStore.getState().connect(stdio);
    deliver({ type: "status", status: "connecting" });
    deliver({ type: "log", level: "DEBUG", source: "protocol", message: "→ initialize #0", timestamp: 1, payload: { direction: "out", method: "initialize", id: 0, body: {} } });
    deliver({ type: "log", level: "INFO", source: "server", message: "booting", timestamp: 2 });
    deliver({ type: "connected", protocolVersion: "2025-06-18", tools: [], prompts: [] });
    expect(useStore.getState().logs.map((l) => l.message)).toEqual([
      "→ initialize #0",
      "booting",
      "Connected — 0 tools, 0 prompts",
    ]);
  });
});

describe("structured log entries", () => {
  it("keeps source and structured payload from log messages", () => {
    const payload = { direction: "in" as const, method: "tools/list", id: 1, body: { jsonrpc: "2.0", id: 1, result: { tools: [] } } };
    deliver({ type: "log", level: "DEBUG", source: "protocol", message: "← tools/list response #1", timestamp: 1, payload });
    deliver({ type: "log", level: "WARN", source: "server", message: "[db] slow", timestamp: 2 });
    const [studio, frame, server] = useStore.getState().logs;
    expect(studio).toMatchObject({ source: "studio" });
    expect(frame).toMatchObject({ level: "DEBUG", source: "protocol", timestamp: 1, payload });
    expect(server).toMatchObject({ level: "WARN", source: "server" });
    expect(server!.payload).toBeUndefined();
  });
});

describe("verbose logging wiring", () => {
  it("sends the setting with connect", async () => {
    useStore.getState().setConfig({ verboseLogging: true });
    await useStore.getState().connect(stdio);
    expect(mockTransport.connect).toHaveBeenLastCalledWith(stdio, true, "conn-1");
  });

  it("applies a change to a live Session, and only when connected", () => {
    useStore.getState().setConfig({ verboseLogging: true });
    expect(mockTransport.setVerbose).not.toHaveBeenCalled();
    mockTransport.isConnected = true;
    useStore.getState().setConfig({ verboseLogging: false });
    expect(mockTransport.setVerbose).toHaveBeenCalledWith(false);
    useStore.getState().setConfig({ autoScrollLogs: false });
    expect(mockTransport.setVerbose).toHaveBeenCalledTimes(1);
  });
});

it("bounds retained frame bodies and searches the retained text case-insensitively", async () => {
  const { filterLogs } = await import("../components/logs/filter-logs");
  deliver({ type: "log", level: "DEBUG", source: "protocol", message: "Large frame", timestamp: 1,
    payload: { direction: "in", method: "tools/call", id: 7, body: { content: "Needle" + "x".repeat(100_000) + "discarded-tail" } } });
  const entry = useStore.getState().logs.at(-1)!;
  expect(String(entry.payload?.body).length).toBeLessThanOrEqual(64 * 1024);
  expect(entry.payload?.body).toContain("[truncated]");
  expect(entry.payload?.truncated).toBe(true);
  expect(String(entry.payload?.body).startsWith('{"content":"Needle')).toBe(true);
  expect(entry.searchText).toContain("needle");
  expect(filterLogs([entry], { level: null, source: null, search: "NEEDLE" })).toEqual([entry]);
  expect(filterLogs([entry], { level: null, source: null, search: "discarded-tail" })).toEqual([]);
});

for (const serverLog of [true, false]) {
  it(`retains one full Studio ERROR after failed connect (server log: ${serverLog})`, async () => {
    await useStore.getState().connect(stdio);
    deliver({ type: "log", level: "INFO", source: "server", message: "starting", timestamp: 1 });
    const reason = "ECONNREFUSED: could not reach http://localhost:4000/mcp";
    deliver({ type: "status", status: "error" });
    if (serverLog) deliver({ type: "log", level: "ERROR", source: "studio", message: reason, timestamp: 2 });
    deliver({ type: "error", code: "CONNECTION_FAILED", message: reason });
    expect(useStore.getState().logs.filter(log => log.level === "ERROR")).toMatchObject([
      { source: "studio", message: reason },
    ]);
    expect(useStore.getState().logs.some(log => log.message === "starting")).toBe(true);
  });
}

it('bounds huge log entries and total retained logs', () => {
  const stringify = vi.spyOn(JSON, 'stringify');
  for (let i = 0; i < 510; i++) deliver({ type: 'log', level: 'INFO', source: 'server', message: 'x'.repeat(20000), timestamp: i });
  const serializations = stringify.mock.calls.length;
  stringify.mockRestore();
  // Retention must measure new entries, never serialize the retained history again.
  expect(serializations).toBeLessThan(1020);
  const logs = useStore.getState().logs;
  expect(logs.at(-1)?.timestamp).toBe(509);
  expect(logs[0]!.timestamp).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(logs)).length).toBeLessThan(4 * 1024 * 1024);
  expect(logs.length).toBeLessThanOrEqual(500);
  expect(logs.at(-1)?.message).toContain('truncated, 20000 bytes');
  expect(JSON.stringify(logs).length).toBeLessThan(5 * 1024 * 1024);
});

it("evicts oldest entries at the count limit and resets accounting on clear", () => {
  useStore.getState().clearLogs();
  for (let i = 0; i < 510; i++) deliver({ type: "log", level: "INFO", source: "server", message: `entry ${i}`, timestamp: i });
  expect(useStore.getState().logs).toHaveLength(500);
  expect(useStore.getState().logs[0]?.message).toBe("entry 10");
  useStore.getState().clearLogs();
  deliver({ type: "log", level: "INFO", source: "server", message: "fresh", timestamp: 511 });
  expect(useStore.getState().logs.map(log => log.message)).toEqual(["fresh"]);
});

it("keeps a body the Studio Server already truncated as raw text", async () => {
  const { formatLogLine } = await import("../components/logs/filter-logs");
  const body = '{"result":{"text":"needle [truncated, 20000 bytes]';
  deliver({ type: "log", level: "DEBUG", source: "protocol", message: "← tools/call #9", timestamp: 1, payload: { direction: "in", method: "tools/call", id: 9, body, truncated: true } });
  const entry = useStore.getState().logs.at(-1)!;
  expect(entry.payload?.body).toBe(body);
  expect(formatLogLine(entry, "t")).toBe(`[t] DEBUG [protocol] ← tools/call #9\n${body}`);
  expect(entry.searchText).toContain('{"result":{"text":"needle');
});
