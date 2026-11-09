import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
}));

const { useStore } = await import("../store/index.js");
const { StatusBar } = await import("../components/shell/status-bar.js");
const { TopNav } = await import("../components/shell/top-nav.js");
const { SidebarProvider } = await import("../components/ui/sidebar.js");
const { TooltipProvider } = await import("../components/ui/tooltip.js");
const renderTopNav = () => render(<TooltipProvider><SidebarProvider><TopNav /></SidebarProvider></TooltipProvider>);
const { STATUS } = await import("../components/shell/session-info.js");

afterEach(cleanup);
beforeEach(() => {
  useStore.setState({
    connectionStatus: "disconnected", requestCount: 0, errorCount: 0, latency: 0,
    connectedConnectionId: null, collections: [], connectedAt: null,
  });
});

describe("status vocabulary", () => {
  it("the status bar uses the same labels as the top bar for every state", () => {
    for (const state of ["disconnected", "connecting", "connected", "error"] as const) {
      useStore.setState({ connectionStatus: state, connectedAt: state === "connected" ? Date.now() : null });
      render(<StatusBar />);
      expect(screen.getByText(STATUS[state].label)).toBeTruthy();
      cleanup();
    }
  });

  it("marks the idle state neutral, not as a failure", () => {
    expect(STATUS.disconnected.dot).toContain("bg-muted-foreground");
    expect(STATUS.disconnected.dot).not.toContain("destructive");
    render(<StatusBar />);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.queryByText("Disconnected")).toBeNull();
  });
});

describe("status bar", () => {
  it("shows a placeholder, not a fake measurement, before any Call", () => {
    render(<StatusBar />);
    expect(screen.queryByText("0ms")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows the latency once a Call has completed", () => {
    useStore.setState({ requestCount: 1, latency: 42 });
    render(<StatusBar />);
    expect(screen.getByText("42ms")).toBeTruthy();
  });

  it("titles a long Connection name instead of clipping it silently", () => {
    const name = "customer-support-knowledge-base-production-readonly";
    useStore.setState({
      connectionStatus: "connected", connectedAt: Date.now(), connectedConnectionId: "c-1",
      collections: [{ id: "k", name: "K", createdAt: 1, updatedAt: 1, connections: [{ id: "c-1", collectionId: "k", name, createdAt: 1, updatedAt: 1 }] }],
    });
    render(<StatusBar />);
    expect(screen.getByText(name).getAttribute("title")).toBe(name);
  });
});

describe("top bar", () => {
  it("renders the brand as the page heading", () => {
    renderTopNav();
    expect(screen.getByRole("heading", { level: 1, name: "MCP Studio" })).toBeTruthy();
  });

  it("renders a sidebar trigger for narrow viewports", () => {
    renderTopNav();
    const trigger = screen.getByRole("button", { name: "Collections" });
    expect(trigger.className).toContain("md:hidden");
  });
});
