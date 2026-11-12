import { eq } from "drizzle-orm";
import { revokeOAuthTokens } from "@mcp-studio/mcp-client";
import type { OAuthCredentials, OAuthRevocation, OAuthStorage } from "@mcp-studio/mcp-client";
import type { OAuthStatus } from "@mcp-studio/types";
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

/** Retires all outstanding adapters before deleting persisted credentials; returns what was deleted. */
export async function clearOAuthCredentials(connectionId: string): Promise<{ serverUrl: string; credentials: OAuthCredentials } | undefined> {
  generations.delete(connectionId);
  return db.delete(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId))
    .returning({ serverUrl: oauthCredentials.serverUrl, credentials: oauthCredentials.credentials }).get();
}

/** Sign out deletes local credentials first, then revokes them at the authorization server best-effort (RFC 7009). */
export async function signOut(connectionId: string, revoke: typeof revokeOAuthTokens = revokeOAuthTokens): Promise<OAuthRevocation> {
  const removed = await clearOAuthCredentials(connectionId);
  return removed ? revoke(removed.serverUrl, removed.credentials) : "none";
}

function jwtClaims(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as Record<string, unknown> : null;
  } catch { return null; }
}

const claim = (claims: Record<string, unknown> | null, key: string) =>
  typeof claims?.[key] === "string" && claims[key] ? (claims[key] as string).slice(0, 256) : undefined;

export function getOAuthStatus(connectionId: string): OAuthStatus {
  const row = db.select().from(oauthCredentials).where(eq(oauthCredentials.connectionId, connectionId)).get();
  const tokens = row?.credentials.tokens;
  if (!row || !tokens?.access_token) return { signedIn: false };
  const claims = jwtClaims((tokens as { id_token?: unknown }).id_token) ?? jwtClaims(tokens.access_token);
  const account = {
    email: claim(claims, "email"),
    name: claim(claims, "name"),
    username: claim(claims, "preferred_username") ?? claim(claims, "username") ?? claim(claims, "login"),
    subject: claim(claims, "sub"),
  };
  const hasAccount = Object.values(account).some(Boolean);
  return {
    signedIn: true,
    serverUrl: row.serverUrl,
    ...(hasAccount ? { account: Object.fromEntries(Object.entries(account).filter(([, v]) => v)) } : {}),
    ...(tokens.scope ? { scope: tokens.scope.slice(0, 1024) } : {}),
    ...(typeof tokens.expires_in === "number" ? { expiresAt: row.updatedAt + tokens.expires_in * 1000 } : {}),
    refreshable: Boolean(tokens.refresh_token),
    updatedAt: row.updatedAt,
  };
}
