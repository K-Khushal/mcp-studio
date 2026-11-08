import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { connections } from "../schema.js";
import { nanoid } from "../../utils/nanoid.js";
import type { Connection, ConnectionConfig } from "@mcp-studio/types";

interface CreateConnectionData {
  name: string;
  connectionConfig?: ConnectionConfig;
}

interface UpdateConnectionData {
  name?: string;
  connectionConfig?: ConnectionConfig | null;
}

export async function createConnection(
  collectionId: string,
  data: CreateConnectionData
): Promise<Connection> {
  const now = Date.now();
  const id = nanoid();
  await db.insert(connections).values({
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

export async function deleteConnection(id: string): Promise<void> {
  await db.delete(connections).where(eq(connections.id, id));
}

export async function updateConnection(id: string, data: UpdateConnectionData): Promise<void> {
  const update: {
    name?: string;
    connectionConfig?: ConnectionConfig | null;
    updatedAt: number;
  } = {
    updatedAt: Date.now(),
  };

  if (data.name !== undefined) {
    update.name = data.name;
  }

  if (data.connectionConfig !== undefined) {
    update.connectionConfig = data.connectionConfig;
  }

  await db
    .update(connections)
    .set(update)
    .where(eq(connections.id, id));
}
