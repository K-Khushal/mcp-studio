import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createCollection } from "../db/queries/collections";
import { createConnection } from "../db/queries/connections";
import { clearOAuthCredentials, oauthStorage } from "../db/queries/oauth-credentials";
import { approveInBrowser, startOAuthCallback, startOAuthFixture } from "./fixtures/oauth-fixture";
import { SessionHarness } from "./fixtures/session-harness";
import { clearDb } from "./helpers/clear-db";

let fixture: Awaited<ReturnType<typeof startOAuthFixture>>;
let callback: ReturnType<typeof startOAuthCallback>;
let connectionId: string;
const harnesses: SessionHarness[] = [];

beforeEach(async () => {
  await clearDb();
  fixture = await startOAuthFixture();
  callback = startOAuthCallback();
  const collection = await createCollection("OAuth");
  const { config } = fixture.connection();
  connectionId = (await createConnection(collection.id, { name: "Protected", connectionConfig: { transport: "http", config } })).id;
});

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.close();
  await callback.close();
  await fixture.close();
});

function openSession() {
  const harness = new SessionHarness({ oauth: { redirectUrl: callback.redirectUrl, redirects: callback.redirects, storage: oauthStorage } });
  harnesses.push(harness);
  return harness;
}

/** Connects, completing browser sign-in when the Studio Server asks for it. */
async function signInAndConnect(session: SessionHarness) {
  const authorize = session.waitFor("oauth_authorize");
  const connected = session.waitFor("connected");
  await Promise.all([
    session.send(fixture.connection(connectionId)),
    authorize.then(message => approveInBrowser(message.url)),
  ]);
  return connected;
}

async function echo(session: SessionHarness, text: string) {
  await session.send({ type: "invoke", tool: "echo", params: { text } });
  return session.waitFor("result");
}

test("OAuth sign-in discovers, registers, authorizes with PKCE and the Call succeeds", async () => {
  const session = openSession();
  expect(await signInAndConnect(session)).toMatchObject({ serverInfo: { name: "protocol-fixture" } });
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
  expect(await echo(session, "signed in")).toMatchObject({ data: { content: [{ text: "signed in" }] } });
});

test("a new Session reuses the Connection's stored tokens without signing in again", async () => {
  await signInAndConnect(openSession());
  const session = openSession();
  await session.send(fixture.connection(connectionId));
  await session.waitFor("connected");
  expect(await echo(session, "reused")).toMatchObject({ data: { content: [{ text: "reused" }] } });
  expect(session.messages.some(message => message.type === "oauth_authorize")).toBe(false);
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
});

test("an expired access token is refreshed during a Call and the Call succeeds", async () => {
  const session = openSession();
  await signInAndConnect(session);
  fixture.expireAccessTokens();
  expect(await echo(session, "refreshed")).toMatchObject({ data: { content: [{ text: "refreshed" }] } });
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 1 });
});

test("reconnecting with an expired access token refreshes it without signing in again", async () => {
  await signInAndConnect(openSession());
  fixture.expireAccessTokens();
  const session = openSession();
  await session.send(fixture.connection(connectionId));
  await session.waitFor("connected");
  expect(await echo(session, "refreshed")).toMatchObject({ data: { content: [{ text: "refreshed" }] } });
  expect(session.messages.some(message => message.type === "oauth_authorize")).toBe(false);
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 1 });
});

test("signing out clears the Connection's tokens so the next connect signs in again", async () => {
  await signInAndConnect(openSession());
  await clearOAuthCredentials(connectionId);
  await signInAndConnect(openSession());
  expect(fixture.counts).toEqual({ registrations: 2, authorizations: 2, refreshes: 0 });
});

test("no token value reaches the browser or the logs", async () => {
  const session = openSession();
  const logs: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const spies = methods.map(method => spyOn(globalThis.console, method).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); }));
  try {
    await signInAndConnect(session);
    fixture.expireAccessTokens();
    await echo(session, "after refresh");
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const emitted = JSON.stringify(session.messages) + logs.join("\n");
  expect(fixture.issued.length).toBe(4);
  for (const secret of fixture.issued) expect(emitted).not.toContain(secret);
});

test("disconnecting while the browser sign-in is pending cancels the connect", async () => {
  const session = openSession();
  const authorize = session.waitFor("oauth_authorize");
  const failed = session.waitFor("error");
  const connecting = session.send(fixture.connection(connectionId));
  await authorize;
  await session.send({ type: "disconnect" });
  await connecting;
  expect(await failed).toMatchObject({ code: "CONNECTION_FAILED", message: "OAuth sign-in cancelled" });
  expect(fixture.counts.authorizations).toBe(0);
});

test("tokens stored for one MCP Server are never presented to another the Connection now points at", async () => {
  await signInAndConnect(openSession());
  const other = await startOAuthFixture();
  try {
    const session = openSession();
    const authorize = session.waitFor("oauth_authorize");
    const connected = session.waitFor("connected");
    await Promise.all([session.send(other.connection(connectionId)), authorize.then(message => approveInBrowser(message.url))]);
    await connected;
    expect([...other.presented].some(token => fixture.issued.includes(token))).toBe(false);
    expect(other.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
  } finally {
    for (const harness of harnesses.splice(0)) await harness.close();
    await other.close();
  }
});

test("signing in again after the Studio Server's redirect URL changed registers a new client", async () => {
  await signInAndConnect(openSession());
  fixture.revokeTokens();
  await callback.close();
  callback = startOAuthCallback();
  await signInAndConnect(openSession());
  expect(fixture.counts).toEqual({ registrations: 2, authorizations: 2, refreshes: 0 });
});
