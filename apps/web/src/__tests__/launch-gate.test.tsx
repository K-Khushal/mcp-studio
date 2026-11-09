import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { WebSocketTransport } from "../transport/websocket-transport";
import { studioFetch } from "../lib/studio-access";
import { LaunchGate } from "../components/shell/launch-gate.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); history.replaceState(null, "", "/"); });

const stubHealth = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));

describe("LaunchGate", () => {
  it("stores the printed link credential at this origin, cleans the URL and authenticates health", async () => {
    const token = "test-launch-token-0123456789abcdefgh";
    history.replaceState(null, "", `/?a=1&token=${token}&b=2#saved`);
    stubHealth(200);
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    expect(await screen.findByText("Studio app")).toBeTruthy();
    expect(localStorage.getItem("mcp-studio.launch-token")).toBe(token);
    expect(location.pathname + location.search + location.hash).toBe("/?a=1&b=2#saved");
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({ headers: expect.objectContaining({ authorization: `Bearer ${token}` }) }));
  });

  it("shows the app once the Studio Server accepts this browser", async () => {
    stubHealth(200);
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    expect(await screen.findByText("Studio app")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/health");
  });

  it("asks for the printed link, without rendering the app, when the Launch token is missing", async () => {
    stubHealth(401);
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    expect(await screen.findByRole("heading", { name: "Open MCP Studio from your terminal" })).toBeTruthy();
    expect(screen.getByText(/link printed in the terminal/)).toBeTruthy();
    expect(screen.queryByText("Studio app")).toBeNull();
  });

  it("replaces an already mounted app with terminal help on any REST 401", async () => {
    stubHealth(200);
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    await screen.findByText("Studio app");
    stubHealth(401);
    await act(async () => { await studioFetch("/api/collections"); });
    expect(await screen.findByRole("heading", { name: "Open MCP Studio from your terminal" })).toBeTruthy();
    expect(screen.queryByText("Studio app")).toBeNull();
  });

  it("locks the app when a failed WS handshake discovers an expired token", async () => {
    stubHealth(200);
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    await screen.findByText("Studio app");
    let failHandshake = () => {};
    vi.stubGlobal("WebSocket", class {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = 0;
      onerror = () => {};
      constructor() { failHandshake = () => this.onerror(); }
    });
    const connecting = new WebSocketTransport().connect({ transport: "http", config: { url: "http://localhost", headers: {} } });
    const rejected = expect(connecting).rejects.toThrow("WebSocket connection failed");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    stubHealth(401);
    await act(async () => { failHandshake(); await rejected; });
    expect(await screen.findByRole("heading", { name: "Open MCP Studio from your terminal" })).toBeTruthy();
    expect(screen.queryByText("Studio app")).toBeNull();
  });

  it("still shows the app when the Studio Server is unreachable, so connection errors stay visible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    expect(await screen.findByText("Studio app")).toBeTruthy();
  });
});
