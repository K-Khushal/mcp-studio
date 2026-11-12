import { expect, test } from "bun:test";
import type { ServerMessage } from "@mcp-studio/types";
import { SessionManager } from "../session/manager";

/** A client whose Call rejects a little after its signal aborts, like a real transport round trip. */
function slowClient() {
  return {
    isConnected: true,
    callTool: (_tool: string, _args: unknown, _id: string, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => setTimeout(() => reject(new Error("aborted")), 20), { once: true })),
    disconnect: async () => {},
  };
}

test.each(["cancel", "timeout"] as const)("a %s followed by a crash ends the Call with exactly one terminal message", async (ending) => {
  const sent: ServerMessage[] = [];
  const manager = new SessionManager((message) => sent.push(message));
  const client = slowClient();
  const internals = manager as unknown as { client: unknown; status: string; connectionClosed(client: unknown): void };
  internals.client = client;
  internals.status = "connected";
  const call = manager.handle({ type: "invoke", tool: "slow", params: {}, requestId: "r1", ...(ending === "timeout" ? { requestTimeout: 0.01 } : {}) });
  if (ending === "cancel") await manager.handle({ type: "cancel", requestId: "r1" });
  else await new Promise((resolve) => setTimeout(resolve, 15));
  internals.connectionClosed(client);
  await call;
  const terminal = sent.filter((m) => (m.type === "cancelled" || m.type === "error" || m.type === "result") && "requestId" in m && m.requestId === "r1");
  expect(terminal).toHaveLength(1);
  expect(terminal[0]).toMatchObject(ending === "cancel" ? { type: "cancelled" } : { type: "error", code: "CALL_TIMEOUT" });
});
