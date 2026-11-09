import { eq } from "drizzle-orm";
import type { OAuthStorage } from "@mcp-studio/mcp-client";
import { db } from "../index.js";
import { connections, oauthCredentials } from "../schema.js";

// Identity is the credential generation. Retired adapters can neither read nor write.
const generations = new Map<string, { serverUrl: string }>();

/** Credentials and in-flight auth belong to one Connection URL and generation. */
export function oauthStorage(connectionId: string, serverUrl: string): OAuthStorage {
  if (!db.select({ id: connections.id }).from(connections).where(eq(connections.id, connectionId)).get()) {
    throw new Error("OAuth Connection does not exist");
  }
  let generation = generations.get(connectionId);
  if (!generation || generation.serverUrl !== serverUrl) {
    if (generation) db.delete(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId)).run();
    generation = { serverUrl };
    generations.set(connectionId, generation);
  }
  const assertCurrent = () => {
    if (generations.get(connectionId) !== generation) throw new Error("OAuth credentials invalidated");
  };
  return {
    coordination: generation,
    async load() {
      assertCurrent();
      const row = db.select().from(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId)).get();
      return row?.serverUrl === serverUrl ? row.credentials : {};
    },
    async save(credentials) {
      // No await between generation check and SQLite write: sign-out cannot interleave.
      assertCurrent();
      const values = { serverUrl, credentials, updatedAt: Date.now() };
      db.insert(oauthCredentials).values({ connectionId, ...values })
        .onConflictDoUpdate({ target: oauthCredentials.connectionId, set: values }).run();
    },
  };
}

/** Sign out retires all outstanding adapters before deleting persisted credentials. */
export async function clearOAuthCredentials(connectionId: string): Promise<void> {
  generations.delete(connectionId);
  db.delete(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId)).run();
}
