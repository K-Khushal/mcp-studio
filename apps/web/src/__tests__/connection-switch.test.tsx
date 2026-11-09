import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import type { Collection, ConnectionConfig } from "@mcp-studio/types";

vi.mock("../transport/websocket-transport", () => ({
  transport: {
    isConnected: false,
    onMessage: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const { useStore } = await import("../store/index.js");
const { transport } = await import("../transport/websocket-transport.js");
const { CollectionsSidebar } = await import("../components/collections/collections-sidebar.js");
const { SidebarProvider } = await import("../components/ui/sidebar.js");

const stdio = (command: string): ConnectionConfig => ({
  transport: "stdio",
  config: { command, args: ["--flag"], cwd: "/work", env: { A: "1" }, inheritSystemEnv: false },
});

const collection: Collection = {
  id: "col-1", name: "Collection", createdAt: 1, updatedAt: 1,
  connections: [
    { id: "conn-1", collectionId: "col-1", name: "First", connectionConfig: stdio("first-cmd"), createdAt: 1, updatedAt: 1 },
    { id: "conn-2", collectionId: "col-1", name: "Second", connectionConfig: stdio("second-cmd"), createdAt: 1, updatedAt: 1 },
    { id: "conn-3", collectionId: "col-1", name: "Blank", createdAt: 1, updatedAt: 1 },
  ],
};

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
}));

const renderSidebar = () => render(<SidebarProvider><CollectionsSidebar /></SidebarProvider>);

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([collection]))));
  useStore.setState({
    collections: [collection],
    selectedConnectionId: null,
    connectedConnectionId: null,
    connectingConnectionId: null,
    connectionStatus: "disconnected",
    connectionDrafts: {},
  });
});

const live = (id: string) => useStore.setState({ selectedConnectionId: id, connectedConnectionId: id, connectionStatus: "connected" });

describe("selecting and connecting Connections from the sidebar", () => {
  it("single click loads the Connection without connecting", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("First"));
    expect(useStore.getState().selectedConnectionId).toBe("conn-1");
    expect(useStore.getState().stdio.command).toBe("first-cmd");
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("double click loads and connects with the saved cwd, args, env and inherit flag", async () => {
    renderSidebar();
    fireEvent.doubleClick(screen.getByText("First"));
    await waitFor(() => expect(transport.connect).toHaveBeenCalledWith(stdio("first-cmd"), false));
    expect(useStore.getState().selectedConnectionId).toBe("conn-1");
  });

  it("double click on a Connection with no saved config only loads it", () => {
    renderSidebar();
    fireEvent.doubleClick(screen.getByText("Blank"));
    expect(useStore.getState().selectedConnectionId).toBe("conn-3");
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("switching with a live Session asks first; cancel keeps the Session and selection", async () => {
    live("conn-1");
    renderSidebar();
    fireEvent.click(screen.getByText("Second"));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(useStore.getState().selectedConnectionId).toBe("conn-1");
    expect(useStore.getState().connectedConnectionId).toBe("conn-1");
    expect(transport.disconnect).not.toHaveBeenCalled();
  });

  it("confirming the switch closes the Session and loads the other Connection", async () => {
    live("conn-1");
    renderSidebar();
    fireEvent.click(screen.getByText("Second"));
    fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
    await waitFor(() => expect(useStore.getState().selectedConnectionId).toBe("conn-2"));
    expect(useStore.getState().connectionStatus).toBe("disconnected");
    expect(useStore.getState().connectedConnectionId).toBeNull();
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("double click while another Session is live: confirm switches and connects", async () => {
    live("conn-1");
    renderSidebar();
    fireEvent.click(screen.getByText("Second"));
    fireEvent.doubleClick(screen.getByText("Second"));
    fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
    await waitFor(() => expect(transport.connect).toHaveBeenCalledWith(stdio("second-cmd"), false));
    expect(useStore.getState().selectedConnectionId).toBe("conn-2");
    expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
  });

  it("clicking the live Connection itself never prompts", () => {
    live("conn-1");
    renderSidebar();
    fireEvent.click(screen.getByText("First"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not prompt when no Session is live", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("First"));
    fireEvent.click(screen.getByText("Second"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(useStore.getState().selectedConnectionId).toBe("conn-2");
    act(() => {});
  });
});
