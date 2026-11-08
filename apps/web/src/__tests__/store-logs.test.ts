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
    expect(mockTransport.connect).toHaveBeenLastCalledWith(stdio, true);
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
