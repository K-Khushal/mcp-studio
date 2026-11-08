import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig, ServerMessage } from "@mcp-studio/types";

let deliver: (msg: ServerMessage) => void = () => {};

vi.mock("../transport/websocket-transport", () => ({
  transport: {
    isConnected: false,
    onMessage: (handler: (msg: ServerMessage) => void) => {
      deliver = handler;
    },
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const { useStore } = await import("../store/index.js");

const stdio: ConnectionConfig = {
  transport: "stdio",
  config: { command: "npx", args: [], env: {}, inheritSystemEnv: true },
};

beforeEach(() => {
  useStore.setState({ selectedConnectionId: "conn-1", connectionStatus: "disconnected", serverInfo: null, protocolVersion: null });
});

describe("session info", () => {
  it("records server name, version and negotiated protocol version on connect", async () => {
    await useStore.getState().connect(stdio);
    deliver({
      type: "connected",
      protocolVersion: "2025-06-18",
      tools: [],
      prompts: [],
      serverInfo: { name: "everything", version: "2.1.0" },
    });

    const s = useStore.getState();
    expect(s.connectionStatus).toBe("connected");
    expect(s.serverInfo).toEqual({ name: "everything", version: "2.1.0" });
    expect(s.protocolVersion).toBe("2025-06-18");
  });

  it("clears them on disconnect from the MCP Server", async () => {
    await useStore.getState().connect(stdio);
    deliver({ type: "connected", protocolVersion: "2025-06-18", tools: [], prompts: [], serverInfo: { name: "x", version: "1" } });

    deliver({ type: "disconnected" });

    expect(useStore.getState().serverInfo).toBeNull();
    expect(useStore.getState().protocolVersion).toBeNull();
  });

  it("clears them when the user disconnects", async () => {
    await useStore.getState().connect(stdio);
    deliver({ type: "connected", protocolVersion: "2025-06-18", tools: [], prompts: [], serverInfo: { name: "x", version: "1" } });

    await useStore.getState().disconnect();

    expect(useStore.getState().serverInfo).toBeNull();
    expect(useStore.getState().protocolVersion).toBeNull();
  });
});

describe("logs panel height", () => {
  it("clamps between the minimum and 70% of the viewport", () => {
    vi.stubGlobal("innerHeight", 1000);
    useStore.getState().setLogsHeight(400);
    expect(useStore.getState().logsHeight).toBe(400);
    useStore.getState().setLogsHeight(20);
    expect(useStore.getState().logsHeight).toBe(96);
    useStore.getState().setLogsHeight(5000);
    expect(useStore.getState().logsHeight).toBe(700);
    vi.unstubAllGlobals();
  });
});
