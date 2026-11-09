import { expect, test, vi } from "vitest";
import { toast } from "sonner";
import type { ServerMessage } from "@mcp-studio/types";

let deliver: (message: ServerMessage) => void = () => {};
vi.mock("../transport/websocket-transport", () => ({ transport: {
  isConnected: false,
  onMessage: (handler: typeof deliver) => { deliver = handler; },
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
} }));

const { useStore } = await import("../store/index.js");

test("failure toasts and logs use the sanitized Studio Server message without adding Connection credentials", async () => {
  useStore.setState({ selectedConnectionId: "private-connection" });
  await useStore.getState().connect({ transport: "http", config: {
    url: "https://example.test/?token=private-query-value",
    auth: { type: "bearer", token: "private-bearer-value" },
    headers: { Cookie: "private-cookie-value", "X-Api-Key": "private-header-value" },
  } });
  deliver({ type: "error", code: "CONNECTION_FAILED", message: "Authentication failed for [REDACTED]" });
  const failure = toast.getToasts().find(item => item.id === "connection-failed");
  expect(failure).toMatchObject({ title: "Connection failed", description: "Authentication failed for [REDACTED]" });
  expect(JSON.stringify(failure)).not.toContain("private-");
  expect(JSON.stringify(useStore.getState().logs)).not.toContain("private-");
  toast.dismiss("connection-failed");
});
