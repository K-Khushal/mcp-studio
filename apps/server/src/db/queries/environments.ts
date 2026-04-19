import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { environments } from "../schema.js";
import { nanoid } from "../../utils/nanoid.js";
import type { Environment } from "@mcp-studio/types";

function toEnvironment(row: typeof environments.$inferSelect): Environment {
  return {
    id: row.id,
    name: row.name,
    variables: row.variables,
    isActive: row.isActive,
  };
}

export async function getAllEnvironments(): Promise<Environment[]> {
  const rows = await db.select().from(environments).orderBy(environments.createdAt);
  if (rows.length === 0) {
    return [await createEnvironment("Local", true)];
  }
  return rows.map(toEnvironment);
}

export async function createEnvironment(
  name: string,
  isActive = false
): Promise<Environment> {
  const now = Date.now();
  const id = nanoid();
  await db.insert(environments).values({ id, name, variables: {}, isActive, createdAt: now, updatedAt: now });
  return { id, name, variables: {}, isActive };
}

export async function updateEnvironment(
  id: string,
  partial: Partial<Pick<Environment, "name" | "variables" | "isActive">>
): Promise<void> {
  await db
    .update(environments)
    .set({ ...partial, updatedAt: Date.now() })
    .where(eq(environments.id, id));
}

export async function deleteEnvironment(id: string): Promise<void> {
  await db.delete(environments).where(eq(environments.id, id));
}

export async function getActiveEnvironment(): Promise<Environment | null> {
  const rows = await db.select().from(environments).where(eq(environments.isActive, true));
  return rows[0] ? toEnvironment(rows[0]) : null;
}
