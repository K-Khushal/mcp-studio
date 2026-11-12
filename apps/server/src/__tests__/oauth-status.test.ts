import { beforeEach, expect, test } from "bun:test";
import { createCollection } from "../db/queries/collections";
import { createConnection } from "../db/queries/connections";
import { clearOAuthCredentials, getOAuthStatus, oauthStorage } from "../db/queries/oauth-credentials";
import { clearDb } from "./helpers/clear-db";

const url = "https://mcp.example/mcp";
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
let connectionId: string;

beforeEach(async () => {
  await clearDb();
  const collection = await createCollection("OAuth");
  connectionId = (await createConnection(collection.id, { name: "Protected", connectionConfig: { transport: "http", config: { url, headers: {}, auth: { type: "oauth" } } } })).id;
});

test("reports signed out until tokens are saved, and again after sign out", async () => {
  expect(getOAuthStatus(connectionId)).toEqual({ signedIn: false });
  await oauthStorage(connectionId, url).save({ clientInformation: { client_id: "c" } });
  expect(getOAuthStatus(connectionId)).toEqual({ signedIn: false });
  await oauthStorage(connectionId, url).save({ tokens: { access_token: "opaque-secret", token_type: "Bearer" } });
  expect(getOAuthStatus(connectionId)).toMatchObject({ signedIn: true, serverUrl: url, refreshable: false });
  await clearOAuthCredentials(connectionId);
  expect(getOAuthStatus(connectionId)).toEqual({ signedIn: false });
});

test("shows ID-token account claims and expiry without returning any token", async () => {
  const idToken = jwt({ sub: "u1", email: "dev@example.com", name: "Dev" });
  await oauthStorage(connectionId, url).save({ tokens: { access_token: "access-secret", refresh_token: "refresh-secret", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: "read" } as never });
  const status = getOAuthStatus(connectionId);
  expect(status).toMatchObject({ signedIn: true, account: { email: "dev@example.com", name: "Dev", subject: "u1" }, scope: "read", refreshable: true });
  expect(status.expiresAt! - status.updatedAt!).toBe(3_600_000);
  expect(JSON.stringify(status)).not.toMatch(/secret|h\./);
});
