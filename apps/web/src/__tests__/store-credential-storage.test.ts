import { expect, test, vi } from "vitest";

test("Connection drafts stay in memory and legacy credential storage is removed", async () => {
  localStorage.setItem("mcp-studio-connection", JSON.stringify({ connectionUrl: "https://example.test/?token=legacy-secret" }));
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const { useStore } = await import("../store/index.js");
  expect(localStorage.getItem("mcp-studio-connection")).toBeNull();
  useStore.getState().loadConnection({ id: "secret-connection", collectionId: "c", name: "Private", createdAt: 1, updatedAt: 1,
    connectionConfig: { transport: "http", config: { url: "https://example.test/?token=query-secret", auth: { type: "bearer", token: "bearer-secret" }, headers: { "X-Key": "header-secret" } } } });
  useStore.getState().setHttpAuth({ type: "apikey", key: "key", value: "api-secret", in: "query" });
  useStore.getState().setHttpHeaders({ Cookie: "cookie-secret" });
  useStore.getState().setConnectionUrl("https://example.test/?token=edited-secret");
  useStore.getState().setTransport("stdio");
  useStore.getState().setStdio({ env: [{ key: "TOKEN", value: "env-secret" }] });
  expect(useStore.getState().stdio.env[0]?.value).toBe("env-secret");
  expect(writes).not.toHaveBeenCalled();
  expect(JSON.stringify(localStorage)).not.toContain("secret");
  writes.mockRestore();
});
