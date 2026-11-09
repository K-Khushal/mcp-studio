import { beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Connection, ConnectionConfig } from "@mcp-studio/types";

vi.mock("../transport/websocket-transport", () => ({
  transport: {
    isConnected: false,
    onMessage: vi.fn(),
    connect: vi.fn().mockRejectedValue(new Error("Cannot connect")),
    disconnect: vi.fn(),
  },
}));

const { useStore } = await import("../store/index.js");
const config: ConnectionConfig = {
  transport: "stdio",
  config: { command: "missing", args: [], env: {}, inheritSystemEnv: true },
};
const other: Connection = {
  id: "other", collectionId: "collection", name: "Other", createdAt: 1, updatedAt: 1,
};

beforeEach(() => {
  toast.getHistory().forEach(item => toast.dismiss(item.id));
  useStore.setState({ selectedConnectionId: "first", lastConnectionError: null, connectionStatus: "disconnected" });
});

it("replaces the persistent failure toast when a connection is retried", async () => {
  await useStore.getState().connect(config);
  await useStore.getState().connect(config);

  expect(toast.getToasts().filter(item => "title" in item && item.title === "Connection failed")).toHaveLength(1);
});

it("clears the previous failure on switching Connections and on disconnect", async () => {
  await useStore.getState().connect(config);
  expect(useStore.getState().lastConnectionError?.connectionId).toBe("first");
  useStore.getState().loadConnection(other);
  useStore.getState().loadConnection({ ...other, id: "first" });
  expect(useStore.getState().lastConnectionError).toBeNull();

  await useStore.getState().connect(config);
  expect(useStore.getState().lastConnectionError).not.toBeNull();
  await useStore.getState().disconnect();
  expect(useStore.getState().lastConnectionError).toBeNull();
});
