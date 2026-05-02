import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection, SavedRequest } from "@mcp-studio/types";

const { useStore } = await import("../store/index.js");

const makeCollection = (): Collection => ({
  id: "col-1",
  name: "Collection",
  createdAt: 1,
  updatedAt: 1,
  requests: [
    {
      id: "req-1",
      collectionId: "col-1",
      name: "Original Name",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

const makeSavedRequest = (): SavedRequest => ({
  id: "req-1",
  collectionId: "col-1",
  name: "Original Name",
  connectionConfig: {
    transport: "http",
    config: {
      url: "http://localhost:4000",
      headers: {},
    },
  },
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ collections: [makeCollection()], selectedRequestId: "req-1" });
});

describe("renameRequest", () => {
  it("updates the request name in the store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));

    await useStore.getState().renameRequest("col-1", "req-1", "Renamed Request");

    expect(useStore.getState().collections[0]!.requests[0]!.name).toBe("Renamed Request");
    expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/requests/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Request" }),
    });
  });
});

describe("loadSavedRequest", () => {
  it("toggles off the currently selected request", () => {
    useStore.setState({
      selectedRequestId: null,
      selectedTool: { name: "old-tool" } as never,
      selectedPrompt: { name: "old-prompt" } as never,
      pendingParams: { stale: true },
      activeView: "collections",
      transport: "stdio",
      connectionUrl: "",
    });

    const request = makeSavedRequest();

    useStore.getState().loadSavedRequest(request);

    expect(useStore.getState().selectedRequestId).toBe("req-1");
    expect(useStore.getState().transport).toBe("http");
    expect(useStore.getState().connectionUrl).toBe("http://localhost:4000");
    expect(useStore.getState().selectedTool).toBeNull();
    expect(useStore.getState().selectedPrompt).toBeNull();
    expect(useStore.getState().pendingParams).toBeNull();
    expect(useStore.getState().activeView).toBe("studio");

    useStore.getState().loadSavedRequest(request);

    expect(useStore.getState().selectedRequestId).toBeNull();
    expect(useStore.getState().selectedTool).toBeNull();
    expect(useStore.getState().selectedPrompt).toBeNull();
    expect(useStore.getState().pendingParams).toBeNull();
    expect(useStore.getState().activeView).toBe("studio");
  });
});
