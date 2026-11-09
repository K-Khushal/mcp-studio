import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LaunchGate } from "../components/shell/launch-gate.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stubHealth = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));

describe("LaunchGate", () => {
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

  it("still shows the app when the Studio Server is unreachable, so connection errors stay visible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<LaunchGate><p>Studio app</p></LaunchGate>);
    expect(await screen.findByText("Studio app")).toBeTruthy();
  });
});
