import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ConnectionConfig, ServerMessage } from "@mcp-studio/types";

let deliver: (msg: ServerMessage) => void = () => {};

const transport = vi.hoisted(() => ({
  isConnected: false,
  onMessage: (handler: (msg: ServerMessage) => void) => {
    deliver = handler;
  },
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../transport/websocket-transport", () => ({ transport }));

const { useStore } = await import("../store/index.js");

const oauth: ConnectionConfig = {
  transport: "http",
  config: { url: "https://mcp.example.com/mcp", headers: {}, auth: { type: "oauth" } },
};
const authorizationUrl = "https://auth.example.com/authorize?client_id=c&state=s";

beforeEach(() => {
  transport.connect.mockClear();
  transport.disconnect.mockClear();
  useStore.setState({
    selectedConnectionId: "conn-1",
    connectionStatus: "disconnected",
    connectedConnectionId: null,
    oauthAuthorizationUrl: null,
    collections: [{ id: "col-1", name: "Remote", createdAt: 0, updatedAt: 0, connections: [{ id: "conn-1", name: "MCP", connectionConfig: oauth, createdAt: 0, updatedAt: 0 }] }],
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OAuth sign-in", () => {
  it("connects with the selected Connection so the Studio Server can use its stored sign-in", async () => {
    await useStore.getState().connect(oauth);
    expect(transport.connect).toHaveBeenCalledWith(oauth, false, "conn-1");
  });

  it("opens the authorization page and keeps its link until the Session connects", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await useStore.getState().connect(oauth);

    deliver({ type: "oauth_authorize", url: authorizationUrl });
    expect(open).toHaveBeenCalledWith(authorizationUrl, "_blank", "noopener");
    expect(useStore.getState().oauthAuthorizationUrl).toBe(authorizationUrl);

    deliver({ type: "connected", tools: [], prompts: [] });
    expect(useStore.getState().oauthAuthorizationUrl).toBeNull();
  });

  it("drops the pending sign-in link when the connect fails", async () => {
    vi.stubGlobal("open", vi.fn());
    await useStore.getState().connect(oauth);
    deliver({ type: "oauth_authorize", url: authorizationUrl });

    deliver({ type: "error", code: "CONNECTION_FAILED", message: "OAuth sign-in cancelled" });
    expect(useStore.getState().oauthAuthorizationUrl).toBeNull();
  });

  it("signs out by forgetting the Connection's stored sign-in and ending its live Session", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await useStore.getState().connect(oauth);
    deliver({ type: "connected", tools: [], prompts: [] });

    await useStore.getState().signOut("col-1", "conn-1");

    expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/connections/conn-1/oauth", { method: "DELETE" });
    expect(useStore.getState().connectionStatus).toBe("disconnected");
  });
});

it("reports a failed sign-out instead of silently retaining credentials", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private diagnostic", { status: 500 })));
  const error = vi.spyOn(toast, "error").mockReturnValue("sign-out-error");
  await useStore.getState().signOut("col-1", "conn-1");
  expect(error).toHaveBeenCalledWith("Failed to sign out", { duration: 10_000 });
});

it.each(["ms-settings:privacy", "javascript:alert(1)", "data:text/html,test", "ftp://auth.example.com", "http://auth.example.com/authorize", "http://localhost.evil.test/authorize", "http://127.evil.test/authorize", "not a URL"])("refuses unsafe sign-in URL %s", async (url) => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  const error = vi.spyOn(toast, "error");
  await useStore.getState().connect(oauth);
  deliver({ type: "oauth_authorize", url });
  expect(open).not.toHaveBeenCalled();
  expect(useStore.getState().oauthAuthorizationUrl).toBeNull();
  expect(error).toHaveBeenCalledWith("OAuth sign-in requires HTTPS (HTTP is allowed only for loopback hosts)");
});

it.each(["http://localhost/authorize", "http://127.0.0.2/authorize", "http://[::1]/authorize"])("permits loopback sign-in %s", async (url) => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  await useStore.getState().connect(oauth);
  deliver({ type: "oauth_authorize", url });
  expect(open).toHaveBeenCalledWith(url, "_blank", "noopener");
  expect(useStore.getState().oauthAuthorizationUrl).toBe(url);
});
