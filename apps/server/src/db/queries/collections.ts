import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { collections, requests } from "../schema.js";
import { nanoid } from "../../utils/nanoid.js";
import type { Collection, SavedRequest } from "@mcp-studio/types";

export async function getAllCollections(): Promise<Collection[]> {
  const cols = await db.select().from(collections).orderBy(collections.createdAt);
  const reqs = await db.select().from(requests).orderBy(requests.createdAt);

  return cols.map((col) => ({
    id: col.id,
    name: col.name,
    createdAt: col.createdAt,
    updatedAt: col.updatedAt,
    requests: reqs
      .filter((r) => r.collectionId === col.id)
      .map((r) => ({
        id: r.id,
        collectionId: r.collectionId,
        name: r.name,
        connectionConfig: r.connectionConfig ?? undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })) satisfies SavedRequest[],
  }));
}

export async function createCollection(name: string): Promise<Collection> {
  const now = Date.now();
  const id = nanoid();
  await db.insert(collections).values({ id, name, createdAt: now, updatedAt: now });
  return { id, name, createdAt: now, updatedAt: now, requests: [] };
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
