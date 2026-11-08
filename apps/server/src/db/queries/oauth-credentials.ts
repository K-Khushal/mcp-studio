import { eq } from "drizzle-orm";
import type { OAuthStorage } from "@mcp-studio/mcp-client";
import { db } from "../index.js";
import { oauthCredentials } from "../schema.js";

/**
 * A Connection's OAuth credentials for the MCP Server at `serverUrl`. Credentials stored
 * for a different URL read back empty, so they are never presented to another server;
 * the next save replaces them.
 */
export function oauthStorage(connectionId: string, serverUrl: string): OAuthStorage {
  return {
    async load() {
      const [row] = await db.select().from(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId));
      return row?.serverUrl === serverUrl ? row.credentials : {};
    },
    async save(credentials) {
      const values = { serverUrl, credentials, updatedAt: Date.now() };
      await db
        .insert(oauthCredentials)
        .values({ connectionId, ...values })
        .onConflictDoUpdate({ target: oauthCredentials.connectionId, set: values });
    },
  };
}

/** Sign out: forget the Connection's tokens and client registration. */
export async function clearOAuthCredentials(connectionId: string): Promise<void> {
  await db.delete(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId));
}
