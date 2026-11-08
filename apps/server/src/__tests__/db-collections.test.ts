import { beforeEach, describe, expect, it } from "bun:test";
import { clearDb } from "./helpers/clear-db.js";
import {
  createCollection,
  deleteCollection,
  getAllCollections,
  updateCollection,
} from "../db/queries/collections.js";
import { createConnection, deleteConnection, updateConnection } from "../db/queries/connections.js";

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
    expect(cols[0]!.connections).toEqual([]);
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

describe("connections", () => {
  it("creates a Connection with name only", async () => {
    const col = await createCollection("Col");
    const conn = await createConnection(col.id, { name: "Ping" });
    expect(conn.name).toBe("Ping");
    expect(conn.id).toBeTruthy();

    const cols = await getAllCollections();
    expect(cols[0]!.connections).toHaveLength(1);
    expect(cols[0]!.connections[0]!.name).toBe("Ping");
  });

  it("stores connectionConfig on a Connection", async () => {
    const col = await createCollection("Col");
    const config = {
      transport: "stdio" as const,
      config: { command: "node", args: ["server.js"], env: {}, inheritSystemEnv: false },
    };
    await createConnection(col.id, { name: "Run", connectionConfig: config });
    const cols = await getAllCollections();
    expect(cols[0]!.connections[0]!.connectionConfig).toMatchObject(config);
  });

  it("deletes a Connection", async () => {
    const col = await createCollection("Col");
    const conn = await createConnection(col.id, { name: "Temp" });
    await deleteConnection(conn.id);
    const cols = await getAllCollections();
    expect(cols[0]!.connections).toHaveLength(0);
  });

  it("renames a Connection", async () => {
    const col = await createCollection("Col");
    const conn = await createConnection(col.id, { name: "Old Name" });
    await updateConnection(conn.id, { name: "New Name" });
    const cols = await getAllCollections();
    expect(cols[0]!.connections[0]!.name).toBe("New Name");
  });

  it("updates Connection connectionConfig", async () => {
    const col = await createCollection("Col");
    const conn = await createConnection(col.id, { name: "Run" });
    const config = {
      transport: "http" as const,
      config: { url: "http://localhost:4000", headers: {} },
    };

    await updateConnection(conn.id, { connectionConfig: config });

    const cols = await getAllCollections();
    expect(cols[0]!.connections[0]!.connectionConfig).toMatchObject(config);
  });

  it("cascade-deletes connections when collection is deleted", async () => {
    const col = await createCollection("Col");
    await createConnection(col.id, { name: "C1" });
    await createConnection(col.id, { name: "C2" });
    await deleteCollection(col.id);
    expect(await getAllCollections()).toHaveLength(0);
  });
});
