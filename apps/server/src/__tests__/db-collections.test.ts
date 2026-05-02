import { beforeEach, describe, expect, it } from "bun:test";
import { clearDb } from "./helpers/clear-db.js";
import {
  createCollection,
  deleteCollection,
  getAllCollections,
  updateCollection,
} from "../db/queries/collections.js";
import { createRequest, deleteRequest, updateRequest } from "../db/queries/requests.js";

beforeEach(clearDb);

describe("collections", () => {
  it("starts empty", async () => {
    expect(await getAllCollections()).toEqual([]);
  });

  it("creates and retrieves a collection", async () => {
    await createCollection("My Tools");
    const cols = await getAllCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0]!.name).toBe("My Tools");
    expect(cols[0]!.requests).toEqual([]);
  });

  it("renames a collection", async () => {
    const col = await createCollection("Old Name");
    await updateCollection(col.id, "New Name");
    const cols = await getAllCollections();
    expect(cols[0]!.name).toBe("New Name");
  });

  it("deletes a collection", async () => {
    const col = await createCollection("Temp");
    await deleteCollection(col.id);
    expect(await getAllCollections()).toHaveLength(0);
  });
});

describe("requests", () => {
  it("creates a request with name only", async () => {
    const col = await createCollection("Col");
    const req = await createRequest(col.id, { name: "Ping" });
    expect(req.name).toBe("Ping");
    expect(req.id).toBeTruthy();

    const cols = await getAllCollections();
    expect(cols[0]!.requests).toHaveLength(1);
    expect(cols[0]!.requests[0]!.name).toBe("Ping");
  });

  it("stores connectionConfig on a request", async () => {
    const col = await createCollection("Col");
    const config = {
      transport: "stdio" as const,
      config: { command: "node", args: ["server.js"], env: {}, inheritSystemEnv: false },
    };
    await createRequest(col.id, { name: "Run", connectionConfig: config });
    const cols = await getAllCollections();
    expect(cols[0]!.requests[0]!.connectionConfig).toMatchObject(config);
  });

  it("deletes a request", async () => {
    const col = await createCollection("Col");
    const req = await createRequest(col.id, { name: "Temp" });
    await deleteRequest(req.id);
    const cols = await getAllCollections();
    expect(cols[0]!.requests).toHaveLength(0);
  });

  it("renames a request", async () => {
    const col = await createCollection("Col");
    const req = await createRequest(col.id, { name: "Old Name" });
    await updateRequest(req.id, "New Name");
    const cols = await getAllCollections();
    expect(cols[0]!.requests[0]!.name).toBe("New Name");
  });

  it("cascade-deletes requests when collection is deleted", async () => {
    const col = await createCollection("Col");
    await createRequest(col.id, { name: "R1" });
    await createRequest(col.id, { name: "R2" });
    await deleteCollection(col.id);
    expect(await getAllCollections()).toHaveLength(0);
  });
});
