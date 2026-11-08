import { db } from "../../db/index.js";
import { collections, environments, connections } from "../../db/schema.js";

export async function clearDb() {
  await db.delete(connections);
  await db.delete(collections);
  await db.delete(environments);
}
