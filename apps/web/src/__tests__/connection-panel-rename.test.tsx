import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Collection } from "@mcp-studio/types";

vi.mock("../components/environments/environment-panel", () => ({ default: () => null }));

const { useStore } = await import("../store/index.js");
const { ConnectionPanel } = await import("../components/connection/connection-panel.js");

const collection: Collection = {
  id: "col-1",
  name: "Collection",
  createdAt: 1,
  updatedAt: 1,
  connections: [
    {
      id: "conn-1",
      collectionId: "col-1",
      name: "Original Name",
      connectionConfig: { transport: "http", config: { url: "http://localhost:4000", headers: {} } },
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStore.setState({
    collections: [collection],
    selectedConnectionId: "conn-1",
    connectedConnectionId: null,
    connectingConnectionId: null,
    transport: "http",
    connectionUrl: "http://localhost:4000",
  });
});

describe("renaming a Connection from the connection panel", () => {
  it("issues exactly one PATCH when Enter and blur both fire", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionPanel />);

    fireEvent.doubleClick(screen.getByText("Original Name"));
    const input = screen.getByDisplayValue("Original Name");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(useStore.getState().collections[0]!.connections[0]!.name).toBe("Renamed")
    );
    const patches = fetchMock.mock.calls.filter(
      (call) => call[1]?.method === "PATCH"
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]![0]).toBe("/api/collections/col-1/connections/conn-1");
  });
});
