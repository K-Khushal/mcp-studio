import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { collections, connections } from "../schema.js";
import { nanoid } from "../../utils/nanoid.js";
import type { Collection, Connection } from "@mcp-studio/types";

export async function getAllCollections(): Promise<Collection[]> {
  const [cols, conns] = await Promise.all([
    db.select().from(collections).orderBy(collections.createdAt),
    db.select().from(connections).orderBy(connections.createdAt),
  ]);

  // Group connections by collectionId in O(n) instead of O(n×m) filter loop
  const connsByCollection = new Map<string, Connection[]>();
  for (const r of conns) {
    const list = connsByCollection.get(r.collectionId) ?? [];
    list.push({
      id: r.id,
      collectionId: r.collectionId,
      name: r.name,
      connectionConfig: r.connectionConfig ?? undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
    connsByCollection.set(r.collectionId, list);
  }

  return cols.map((col) => ({
    id: col.id,
    name: col.name,
    createdAt: col.createdAt,
    updatedAt: col.updatedAt,
    connections: connsByCollection.get(col.id) ?? [],
  }));
}

export async function createCollection(name: string): Promise<Collection> {
  const now = Date.now();
  const id = nanoid();
  await db.insert(collections).values({ id, name, createdAt: now, updatedAt: now });
  return { id, name, createdAt: now, updatedAt: now, connections: [] };
}

export async function updateCollection(id: string, name: string): Promise<void> {
  await db
    .update(collections)
    .set({ name, updatedAt: Date.now() })
    .where(eq(collections.id, id));
}

export async function deleteCollection(id: string): Promise<void> {
  await db.delete(collections).where(eq(collections.id, id));
}
