import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { requests } from "../schema.js";
import { nanoid } from "../../utils/nanoid.js";
import type { SavedRequest, ConnectionConfig } from "@mcp-studio/types";

interface CreateRequestData {
  name: string;
  connectionConfig?: ConnectionConfig;
}

export async function createRequest(
  collectionId: string,
  data: CreateRequestData
): Promise<SavedRequest> {
  const now = Date.now();
  const id = nanoid();
  await db.insert(requests).values({
    id,
    collectionId,
    name: data.name,
    connectionConfig: data.connectionConfig ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    name: data.name,
    connectionConfig: data.connectionConfig,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteRequest(id: string): Promise<void> {
  await db.delete(requests).where(eq(requests.id, id));
}
