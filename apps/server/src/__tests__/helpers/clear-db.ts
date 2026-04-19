import { db } from "../../db/index.js";
import { collections, environments, requests } from "../../db/schema.js";

export async function clearDb() {
  await db.delete(requests);
  await db.delete(collections);
  await db.delete(environments);
}
