import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "@mcp-studio/types";

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
