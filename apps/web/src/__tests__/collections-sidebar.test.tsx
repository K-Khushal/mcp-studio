import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const stdio: ConnectionConfig = {
  transport: "stdio",
  config: { command: "cmd", args: [], env: {}, inheritSystemEnv: true },
};
const conn = (id: string, name: string, collectionId: string) => ({ id, collectionId, name, connectionConfig: stdio, createdAt: 1, updatedAt: 1 });

const alpha: Collection = {
  id: "col-1", name: "Alpha", createdAt: 1, updatedAt: 1,
  connections: [conn("c-1", "Fixture STDIO", "col-1"), conn("c-2", "HTTP remote", "col-1")],
};
const beta: Collection = { id: "col-2", name: "Beta", createdAt: 1, updatedAt: 1, connections: [conn("c-3", "HTTP staging", "col-2")] };
const empty: Collection = { id: "col-3", name: "Nothing yet", createdAt: 1, updatedAt: 1, connections: [] };

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
}));

const renderSidebar = (collections: Collection[] = [alpha, beta]) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(collections))));
  useStore.setState({ collections });
  return render(<SidebarProvider><CollectionsSidebar /></SidebarProvider>);
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  useStore.setState({
    collections: [], selectedConnectionId: null, connectedConnectionId: null,
    connectingConnectionId: null, connectionStatus: "disconnected", connectionDrafts: {},
  });
});

describe("keyboard access to Connections", () => {
  it("renders each Connection as a button that Enter selects", async () => {
    renderSidebar();
    const row = screen.getByRole("button", { name: "Fixture STDIO" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(useStore.getState().selectedConnectionId).toBe("c-1");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "HTTP remote" }).getAttribute("aria-current")).toBeNull();
  });

  it("offers a Connect action per Connection that connects", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Connect Fixture STDIO" }));
    await waitFor(() => expect(transport.connect).toHaveBeenCalledWith(stdio, false, "c-1"));
  });

  it("hides Connect for the Connection that already has a live Session", () => {
    useStore.setState({ connectedConnectionId: "c-1", connectionStatus: "connected", selectedConnectionId: "c-1" });
    renderSidebar();
    expect(screen.queryByRole("button", { name: "Connect Fixture STDIO" })).toBeNull();
    expect(screen.getByRole("button", { name: "Connect HTTP remote" })).toBeTruthy();
  });

  it("keeps row actions reachable by focus and 24px wide", () => {
    renderSidebar();
    for (const name of ["Delete Connection Fixture STDIO", "Connect Fixture STDIO", "Add Connection to Alpha", "Rename Alpha", "Delete Alpha"]) {
      const button = screen.getByRole("button", { name });
      expect(button.tabIndex).toBe(0);
      expect(button.className).toContain("size-6");
      expect(button.parentElement!.className).toMatch(/focus-within/);
      expect(button.parentElement!.className).toMatch(/hover:none/);
    }
  });
});

describe("accessible names", () => {
  it("names the expand/collapse control and reports its state", async () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: "Collapse Alpha" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Expand Alpha" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Fixture STDIO" })).toBeNull();
  });

  it("exposes Collections as a labelled navigation landmark", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Collections" });
    expect(nav.contains(screen.getByRole("button", { name: "New collection" }))).toBe(true);
    expect(nav.contains(screen.getByRole("button", { name: "Fixture STDIO" }))).toBe(true);
  });

  it("gives long names a title so truncated text stays readable", () => {
    const long = "customer-support-knowledge-base-production-readonly";
    renderSidebar([{ ...alpha, name: "A very long collection name", connections: [conn("c-9", long, "col-1")] }]);
    expect(screen.getByRole("button", { name: long }).getAttribute("title")).toBe(long);
    expect(screen.getByText("A very long collection name").getAttribute("title")).toBe("A very long collection name");
  });
});

describe("search", () => {
  it("filters Connections inside Collections, not just Collections", async () => {
    renderSidebar();
    await userEvent.type(screen.getByPlaceholderText("Search..."), "HTTP");
    expect(screen.queryByRole("button", { name: "Fixture STDIO" })).toBeNull();
    expect(screen.getByRole("button", { name: "HTTP remote" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "HTTP staging" })).toBeTruthy();
  });

  it("shows every Connection of a Collection whose own name matches", async () => {
    renderSidebar();
    await userEvent.type(screen.getByPlaceholderText("Search..."), "alpha");
    expect(screen.getByRole("button", { name: "Fixture STDIO" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "HTTP remote" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "HTTP staging" })).toBeNull();
  });

  it("reveals matches inside a collapsed Collection", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse Beta" }));
    await userEvent.type(screen.getByPlaceholderText("Search..."), "staging");
    expect(screen.getByRole("button", { name: "HTTP staging" })).toBeTruthy();
  });

  it("explains an empty search and clears it", async () => {
    renderSidebar();
    await userEvent.type(screen.getByPlaceholderText("Search..."), "zzz");
    expect(screen.getByText('No Connections match "zzz"')).toBeTruthy();
    expect(screen.queryByText(/No collections yet/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: "Fixture STDIO" })).toBeTruthy();
    expect((screen.getByPlaceholderText("Search...") as HTMLInputElement).value).toBe("");
  });

  it("keeps the create hint only when there are no Collections", () => {
    renderSidebar([]);
    expect(screen.getByText(/No collections yet/)).toBeTruthy();
  });
});

describe("empty Collection", () => {
  it("shows an always-visible Add Connection row", async () => {
    renderSidebar([empty]);
    const add = screen.getByRole("button", { name: "Add Connection" });
    await userEvent.click(add);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("does not add the row to Collections that already have Connections", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: "Add Connection" })).toBeNull();
  });
});

describe("Collection rename field", () => {
  it("has an accessible name", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Rename Alpha" }));
    expect(screen.getByRole("textbox", { name: "Collection name" })).toBeTruthy();
  });
});

describe("first run", () => {
  it("leads with New collection and Import instead of a dead end", async () => {
    const { FirstRunPanel } = await import("../components/collections/first-run-panel.js");
    const createCollection = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ createCollection });
    render(<FirstRunPanel />);
    expect(screen.getByRole("button", { name: /Import claude_desktop_config\.json/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "New collection" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Collection name" }), "Mine{Enter}");
    expect(createCollection).toHaveBeenCalledWith("Mine");
  });
});
