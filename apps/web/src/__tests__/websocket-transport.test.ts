import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebSocketTransport } from "../transport/websocket-transport";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 0;
  onopen = () => {};
  onerror = () => {};
  onclose = () => {};
  send() {}
  close() { this.readyState = 3; }
  constructor(readonly url: string, readonly protocols?: string[]) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen(); }
}
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 }))); });
const config = { transport: "http" as const, config: { url: "http://localhost", headers: {} } };
afterEach(() => { vi.unstubAllGlobals(); Socket.instances = []; localStorage.clear(); });
it("unreachable Studio Server rejects without a second disconnected event", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const transport = new WebSocketTransport();
  const receive = vi.fn();
  transport.onMessage(receive);
  const connecting = transport.connect(config);
  const rejected = expect(connecting).rejects.toThrow("WebSocket connection failed");
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  Socket.instances[0]!.onerror();
  await rejected;
  Socket.instances[0]!.onclose();
  expect(receive).not.toHaveBeenCalled();
});
it("ignores a retired socket closing after reconnect", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const transport = new WebSocketTransport();
  const receive = vi.fn();
  transport.onMessage(receive);
  const first = transport.connect(config);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  Socket.instances[0]!.open();
  await first;
  await transport.disconnect();
  const second = transport.connect(config);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(2));
  Socket.instances[1]!.open();
  await second;
  Socket.instances[0]!.onclose();
  expect(receive).not.toHaveBeenCalled();
  Socket.instances[1]!.onclose();
  expect(receive).toHaveBeenCalledExactlyOnceWith({ type: "disconnected", reason: "Studio Server connection closed unexpectedly" });
});

it("authenticates the WS handshake with this origin's Launch token", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const token = "test-launch-token-0123456789abcdefgh";
  localStorage.setItem("mcp-studio.launch-token", token);
  const connecting = new WebSocketTransport().connect(config);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  expect(Socket.instances[0]!.protocols).toEqual(["mcp-studio", `token.${token}`]);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  Socket.instances[0]!.open();
  await connecting;
});

it("rechecks access before reconnect and refuses an expired Launch token", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const transport = new WebSocketTransport();
  const first = transport.connect(config);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  Socket.instances[0]!.open();
  await first;
  await transport.disconnect();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
  await expect(transport.connect(config)).rejects.toThrow("Launch token rejected");
  expect(Socket.instances).toHaveLength(1);
});
