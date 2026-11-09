import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createCollection } from "../db/queries/collections";
import { createConnection, updateConnection } from "../db/queries/connections";
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
  const connecting = session.send(fixture.connection(connectionId));
  await authorize;
  await session.send({ type: "disconnect" });
  await connecting;
  expect(session.messages.filter(message => message.type === "error")).toEqual([]);
  expect(session.messages.at(-1)).toMatchObject({ type: "disconnected" });
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

for (const failure of ["refresh", "exchange", "registration"] as const) {
  test(`${failure} failure never exposes OAuth response bodies or credentials`, async () => {
    const session = openSession();
    if (failure === "refresh") {
      await signInAndConnect(session);
      await session.send({ type: "disconnect" });
      fixture.expireAccessTokens();
    }
    fixture.faults[failure] = true;
    const connecting = session.send(fixture.connection(connectionId));
    if (failure === "exchange") await approveInBrowser((await session.waitFor("oauth_authorize")).url);
    await connecting;
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED" });
    const emitted = JSON.stringify(session.messages);
    expect(emitted).not.toContain("diagnostic");
    for (const secret of fixture.issued) expect(emitted).not.toContain(secret);
  });
}

for (const grant of ["refresh_token", "authorization_code"] as const) {
  test(`${grant} completing after sign-out cannot restore credentials`, async () => {
    const session = openSession();
    if (grant === "refresh_token") {
      await signInAndConnect(session);
      await session.send({ type: "disconnect" });
      fixture.expireAccessTokens();
    }
    const gate = fixture.pauseTokens(grant);
    const connecting = session.send(fixture.connection(connectionId));
    if (grant === "authorization_code") await approveInBrowser((await session.waitFor("oauth_authorize")).url);
    await gate.started;
    await clearOAuthCredentials(connectionId);
    gate.resume();
    await connecting;
    expect(await oauthStorage(connectionId, fixture.connection().config.url).load()).toEqual({});
  });
}

test("editing the Connection URL retires credentials even when edited back", async () => {
  await signInAndConnect(openSession());
  const oldStorage = oauthStorage(connectionId, fixture.connection().config.url);
  await updateConnection(connectionId, { connectionConfig: { transport: "http", config: { ...fixture.connection().config, url: "http://127.0.0.1:1/mcp" } } });
  await updateConnection(connectionId, { connectionConfig: { transport: "http", config: fixture.connection().config } });
  await expect(oldStorage.save({})).rejects.toThrow();
  expect(await oauthStorage(connectionId, fixture.connection().config.url).load()).toEqual({});
});

test("disconnect during code exchange cancels persistence and post-auth reconnect", async () => {
  const session = openSession();
  const gate = fixture.pauseTokens("authorization_code");
  const connecting = session.send(fixture.connection(connectionId));
  await approveInBrowser((await session.waitFor("oauth_authorize")).url);
  await gate.started;
  await session.send({ type: "disconnect" });
  gate.resume();
  await connecting;
  expect(session.messages.some(message => message.type === "connected")).toBe(false);
  expect(session.messages.filter(message => message.type === "error")).toEqual([]);
  expect((await oauthStorage(connectionId, fixture.connection().config.url).load()).tokens).toBeUndefined();
});

test("SSE-only OAuth MCP Servers complete sign-in and Calls", async () => {
  await fixture.close();
  fixture = await startOAuthFixture("sse");
  const session = openSession();
  expect(await signInAndConnect(session)).toMatchObject({ httpVariant: "sse" });
  expect(await echo(session, "legacy signed in")).toMatchObject({ data: { content: [{ text: "legacy signed in" }] } });
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
});

test("concurrent Calls share one rotating-token refresh across Sessions", async () => {
  const first = openSession();
  const second = openSession();
  await signInAndConnect(first);
  await second.send(fixture.connection(connectionId));
  fixture.expireAccessTokens();
  const gate = fixture.pauseTokens("refresh_token");
  const calls = Promise.all([
    first.send({ type: "invoke", tool: "echo", params: { text: "first" } }),
    second.send({ type: "invoke", tool: "echo", params: { text: "second" } }),
  ]);
  await gate.started;
  gate.resume();
  await calls;
  const messages = [...first.messages, ...second.messages];
  expect(messages.filter(message => message.type === "error")).toEqual([]);
  expect(messages.filter(message => message.type === "result")).toHaveLength(2);
  expect(fixture.counts.refreshes).toBe(1);
});

test("concurrent Sessions share registration and browser authorization", async () => {
  const first = openSession();
  const second = openSession();
  const connecting = Promise.all([first.send(fixture.connection(connectionId)), second.send(fixture.connection(connectionId))]);
  await approveInBrowser((await first.waitFor("oauth_authorize")).url);
  await connecting;
  await first.waitFor("connected");
  await second.waitFor("connected");
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
  expect(second.messages.some(message => message.type === "oauth_authorize")).toBe(false);
});

test("unsaved sign-ins belong to one Session and are forgotten on disconnect", async () => {
  const first = openSession();
  const second = openSession();
  const connectUnsaved = async (session: SessionHarness) => {
    const connecting = session.send(fixture.connection());
    await approveInBrowser((await session.waitFor("oauth_authorize")).url);
    await connecting;
    await session.waitFor("connected");
  };
  await connectUnsaved(first);
  await connectUnsaved(second);
  await first.send({ type: "disconnect" });
  await connectUnsaved(first);
  expect(fixture.counts.registrations).toBe(3);
  expect(await oauthStorage(connectionId, fixture.connection().config.url).load()).toEqual({});
});

test("unknown Connection IDs fail before OAuth can register or write credentials", async () => {
  const session = openSession();
  await session.send(fixture.connection("missing-connection"));
  expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED" });
  expect(fixture.counts.registrations).toBe(0);
  expect(session.messages.some(message => message.type === "oauth_authorize")).toBe(false);
});

test("refresh and discovery response metadata never reaches http_response messages", async () => {
  const session = openSession();
  await signInAndConnect(session);
  fixture.expireAccessTokens();
  await echo(session, "refresh metadata stays private");
  const responses = session.messages.filter(message => message.type === "http_response");
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.every(message => !("x-fixture-oauth" in message.headers))).toBe(true);
});
