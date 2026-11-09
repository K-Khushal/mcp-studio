import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { StreamableHTTPClient, StudioOAuthProvider } from "@mcp-studio/mcp-client";
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
  expect(session.messages.some(message => message.type === "log" && message.payload?.method === "initialize")).toBe(true);
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
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED", message: "OAuth authentication failed" });
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

test("disconnect during code exchange preserves tokens without reconnecting the cancelled Session", async () => {
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
  const next = openSession();
  await next.send(fixture.connection(connectionId));
  await next.waitFor("connected");
  expect(await echo(next, "exchange survived disconnect")).toMatchObject({ data: { content: [{ text: "exchange survived disconnect" }] } });
  expect(next.messages.some(message => message.type === "oauth_authorize")).toBe(false);
  expect(fixture.counts.authorizations).toBe(1);
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
  expect(second.messages.some(message => message.type === "oauth_authorize")).toBe(true);
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

test("verbose MCP frames redact known OAuth secrets without changing the Call", async () => {
  const session = openSession();
  await signInAndConnect(session);
  const secret = fixture.issued[0]!;
  expect(await echo(session, secret)).toMatchObject({ data: { content: [{ text: secret }] } });
  const logs = JSON.stringify(session.messages.filter(message => message.type === "log"));
  expect(logs.includes(secret)).toBe(false);
  expect(logs).toContain("[REDACTED]");
});

test("SDK scope discovery and token response metadata stays private", async () => {
  const session = openSession();
  await signInAndConnect(session);
  fixture.expireAccessTokens();
  fixture.faults.scope = true;
  await echo(session, "scope metadata stays private");
  const responses = session.messages.filter(message => message.type === "http_response");
  expect(responses.every(message => !("x-fixture-oauth" in message.headers))).toBe(true);
});

test("refresh rejection fails the Call and leaves browser re-authorization to reconnect", async () => {
  const session = openSession();
  await signInAndConnect(session);
  fixture.revokeTokens();
  const outcome = Promise.race([
    session.waitFor("error").then(() => "failed"),
    session.waitFor("oauth_authorize").then(() => "reauthorize"),
  ]);
  const calling = session.send({ type: "invoke", tool: "echo", params: { text: "revoked" } });
  try {
    expect(await outcome).toBe("failed");
  } finally {
    await session.send({ type: "disconnect" });
    await calling;
  }
});

test("unknown tools on OAuth Connections retain the MCP error and redact known secrets", async () => {
  const session = openSession();
  await signInAndConnect(session);
  await session.send({ type: "invoke", tool: `missing-${fixture.issued[0]}`, params: {} });
  const error = await session.waitFor("error");
  expect(error).toMatchObject({ code: "TOOL_ERROR" });
  expect(error.message).toContain("Unknown tool: missing-[REDACTED]");
  expect(error.message).not.toContain(fixture.issued[0]!);
});

test("an unreachable OAuth MCP Server retains its network error", async () => {
  const session = openSession();
  const connection = fixture.connection(connectionId);
  await fixture.close();
  await session.send(connection);
  expect((await session.waitFor("error")).message).toMatch(/Unable to connect|fetch failed|ECONNREFUSED|Connection refused/i);
});

test("disconnecting the first browser waiter leaves the second able to approve sign-in", async () => {
  const first = openSession();
  const second = openSession();
  const firstConnecting = first.send(fixture.connection(connectionId));
  const firstLink = await first.waitFor("oauth_authorize");
  const secondConnecting = second.send(fixture.connection(connectionId));
  const secondLink = await second.waitFor("oauth_authorize");
  expect(secondLink.url).toBe(firstLink.url);
  await first.send({ type: "disconnect" });
  await approveInBrowser(secondLink.url);
  await Promise.all([firstConnecting, secondConnecting]);
  await second.waitFor("connected");
  expect(await echo(second, "surviving browser waiter")).toMatchObject({ data: { content: [{ text: "surviving browser waiter" }] } });
  expect(second.messages.filter(message => message.type === "error")).toEqual([]);
  expect(fixture.counts).toEqual({ registrations: 1, authorizations: 1, refreshes: 0 });
});

test("disconnecting the refresh initiator preserves rotating tokens for the surviving Session", async () => {
  const first = openSession();
  const second = openSession();
  await signInAndConnect(first);
  await second.send(fixture.connection(connectionId));
  await second.waitFor("connected");
  fixture.expireAccessTokens();
  const gate = fixture.pauseTokenResponses("refresh_token");
  const firstCall = first.send({ type: "invoke", tool: "echo", params: { text: "leaving" } });
  await gate.started;
  const secondCall = second.send({ type: "invoke", tool: "echo", params: { text: "surviving refresh waiter" } });
  await first.send({ type: "disconnect" });
  gate.resume();
  await Promise.all([firstCall, secondCall]);
  expect(await second.waitFor("result")).toMatchObject({ data: { content: [{ text: "surviving refresh waiter" }] } });
  expect(second.messages.filter(message => message.type === "error")).toEqual([]);
  expect(fixture.counts.refreshes).toBe(1);
  // A subsequent refresh must use the newly persisted rotating refresh token.
  fixture.expireAccessTokens();
  expect(await echo(second, "persisted rotation")).toMatchObject({ data: { content: [{ text: "persisted rotation" }] } });
  expect(fixture.counts.refreshes).toBe(2);
});

test("a Streamable POST 401 authenticates before considering the SSE fallback", async () => {
  await fixture.close();
  fixture = await startOAuthFixture("sse-auth-first");
  const session = openSession();
  const connecting = session.send(fixture.connection(connectionId));
  const link = await session.waitFor("oauth_authorize");
  expect(session.messages.some(message => message.type === "log" && message.message.includes("trying legacy SSE"))).toBe(false);
  await approveInBrowser(link.url);
  await connecting;
  expect(await session.waitFor("connected")).toMatchObject({ httpVariant: "sse" });
  expect(await echo(session, "auth before endpoint rejection")).toMatchObject({ data: { content: [{ text: "auth before endpoint rejection" }] } });
  expect(fixture.counts.authorizations).toBe(1);
});

test("OAuth failure after a Streamable POST 401 never attempts SSE fallback", async () => {
  await fixture.close();
  fixture = await startOAuthFixture("sse-auth-first");
  fixture.faults.registration = true;
  const session = openSession();
  await session.send(fixture.connection(connectionId));
  expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED", message: "OAuth authentication failed" });
  expect(session.messages.some(message => message.type === "log" && message.message.includes("trying legacy SSE"))).toBe(false);
});

test("cancelling an OAuth Call aborts MCP work and keeps the Session usable", async () => {
  const session = openSession();
  await signInAndConnect(session);
  const calling = session.send({ type: "invoke", requestId: "oauth-cancel", tool: "slow", params: { steps: 50 } });
  await session.waitFor("progress", message => message.requestId === "oauth-cancel");
  await session.send({ type: "cancel", requestId: "oauth-cancel" });
  await session.waitFor("cancelled", message => message.requestId === "oauth-cancel", 500);
  await session.waitFor("log", message => message.source === "server" && message.message.includes("Slow Call aborted"), 500);
  await calling;
  expect(session.messages.filter(message => (message.type === "result" || message.type === "error") && message.requestId === "oauth-cancel")).toEqual([]);
  expect(await echo(session, "still connected")).toMatchObject({ data: { content: [{ text: "still connected" }] } });
});

test("an OAuth Call times out with CALL_TIMEOUT and aborts MCP work", async () => {
  const session = openSession();
  await signInAndConnect(session);
  await session.send({ type: "invoke", requestId: "oauth-timeout", requestTimeout: 0.12, tool: "slow", params: { steps: 50 } });
  expect(await session.waitFor("error")).toMatchObject({ requestId: "oauth-timeout", code: "CALL_TIMEOUT", message: "Call timed out after 0.12 seconds" });
  await session.waitFor("log", message => message.source === "server" && message.message.includes("Slow Call aborted"));
  expect(session.messages.some(message => message.type === "result" && message.requestId === "oauth-timeout")).toBe(false);
});

test("an OAuth Connection delivers ordered Call progress and session phases", async () => {
  const session = openSession();
  await signInAndConnect(session);
  await session.send({ type: "invoke", requestId: "oauth-progress", tool: "slow", params: { steps: 3 } });
  expect(await session.waitFor("result")).toMatchObject({ requestId: "oauth-progress" });
  expect(session.messages.filter(message => message.type === "progress")).toEqual([
    { type: "progress", requestId: "oauth-progress", progress: 1, total: 3, message: "Step 1 of 3" },
    { type: "progress", requestId: "oauth-progress", progress: 2, total: 3, message: "Step 2 of 3" },
    { type: "progress", requestId: "oauth-progress", progress: 3, total: 3, message: "Step 3 of 3" },
  ]);
  expect(session.messages.filter(message => message.type === "session_phase")).toMatchObject([{ phase: "connect" }, { phase: "initialize" }]);
});

test("a connected Session joining browser authorization fails its Call without receiving a link", async () => {
  const calling = openSession();
  await signInAndConnect(calling);
  fixture.revokeTokens();
  const connecting = openSession();
  const connect = connecting.send(fixture.connection(connectionId));
  const link = await connecting.waitFor("oauth_authorize");
  const priorLinks = calling.messages.filter(message => message.type === "oauth_authorize").length;
  const call = calling.send({ type: "invoke", requestId: "no-browser", tool: "echo", params: {} });
  try {
    expect(await calling.waitFor("error", message => message.requestId === "no-browser", 500)).toMatchObject({ code: "TOOL_ERROR", message: "OAuth authentication failed" });
    expect(calling.messages.filter(message => message.type === "oauth_authorize")).toHaveLength(priorLinks);
    await approveInBrowser(link.url);
    await connect;
    await connecting.waitFor("connected");
  } finally {
    await connecting.send({ type: "disconnect" });
    await calling.send({ type: "disconnect" });
    await call;
    await connect;
  }
});

test("browser authorization rejects an existing non-browser waiter while a connecting waiter signs in", async () => {
  const url = new URL(fixture.connection().config.url);
  const response = await fetch(url);
  const controller = new AbortController();
  const storage = oauthStorage(connectionId, url.toString());
  const link = Promise.withResolvers<URL>();
  const nonBrowserLinks: URL[] = [];
  const signIn = {
    redirectUrl: callback.redirectUrl, signal: controller.signal, storage,
    authorize: (_url: URL, state: string, signal: AbortSignal) => callback.redirects.wait(state, signal),
  };
  const nonBrowser = new StudioOAuthProvider({ ...signIn, onAuthorization: url => nonBrowserLinks.push(url) });
  const browser = new StudioOAuthProvider({ ...signIn, onAuthorization: url => link.resolve(url) });
  // Both join before discovery can request browser approval.
  const calling = nonBrowser.authenticate(url, null, response, fetch, false);
  const failed = expect(calling).rejects.toThrow("OAuth authentication failed");
  const connecting = browser.authenticate(url, null, response, fetch, true);
  try {
    const authorization = await link.promise;
    await failed;
    expect(nonBrowserLinks).toEqual([]);
    await approveInBrowser(authorization.toString());
    await connecting;
    expect(fixture.counts.authorizations).toBe(1);
  } finally {
    controller.abort();
    await Promise.allSettled([calling, connecting]);
  }
});

for (const endpoint of ["token", "discovery"] as const) {
  test(`a hung OAuth ${endpoint} endpoint cannot wedge the shared flow`, async () => {
    const gate = endpoint === "token" ? fixture.pauseTokens("authorization_code") : fixture.pauseDiscovery();
    const client = new StreamableHTTPClient(fixture.connection().config, {
      oauthRequestTimeoutMs: 100,
      oauth: {
        redirectUrl: callback.redirectUrl, storage: oauthStorage(connectionId, fixture.connection().config.url),
        authorize: (_url, state, signal) => callback.redirects.wait(state, signal),
        onAuthorization: url => { void approveInBrowser(url.toString()); },
      },
    });
    const connecting = client.connect();
    try {
      await gate.started;
      const deadline = Promise.withResolvers<never>();
      const timer = setTimeout(() => deadline.reject(new Error("OAuth endpoint remained hung")), 1000);
      try {
        const outcome = Promise.race([connecting, deadline.promise]);
        if (endpoint === "token") await expect(outcome).rejects.toThrow("OAuth authentication failed");
        else await expect(outcome).resolves.toMatchObject({ serverName: "protocol-fixture" });
      } finally { clearTimeout(timer); }
    } finally {
      gate.resume();
      await connecting.catch(() => {});
      await client.disconnect();
    }
  });
}

for (const type of ["list_tools", "list_prompts"] as const) {
  test(`${type} emits a sanitized error when OAuth refresh fails`, async () => {
    const session = openSession();
    await signInAndConnect(session);
    fixture.expireAccessTokens();
    fixture.faults.refresh = true;
    await session.send({ type });
    expect(await session.waitFor("error")).toMatchObject({
      code: type === "list_tools" ? "TOOLS_ERROR" : "PROMPTS_ERROR", message: "OAuth authentication failed",
    });
    const messages = JSON.stringify(session.messages);
    expect(messages).not.toContain("diagnostic");
    for (const secret of fixture.issued) expect(messages).not.toContain(secret);
    expect(session.messages.some(message => message.type === "oauth_authorize" && session.messages.indexOf(message) > session.messages.findIndex(message => message.type === "connected"))).toBe(false);
  });
}

for (const outcome of ["cancel", "timeout"] as const) {
  test(`an OAuth prompt Call forwards ${outcome} to the MCP Server`, async () => {
    const session = openSession();
    await signInAndConnect(session);
    const requestId = `oauth-prompt-${outcome}`;
    const calling = session.send({ type: "invoke_prompt", requestId, requestTimeout: outcome === "timeout" ? 0.12 : 30, prompt: "greet", args: { name: "slow" } });
    await session.waitFor("log", message => message.message.includes("Slow prompt started"));
    if (outcome === "cancel") await session.send({ type: "cancel", requestId });
    if (outcome === "cancel") expect(await session.waitFor("cancelled")).toMatchObject({ requestId });
    else expect(await session.waitFor("error")).toMatchObject({ requestId, code: "CALL_TIMEOUT" });
    await session.waitFor("log", message => message.message.includes("Slow prompt aborted"));
    await calling;
    expect(session.messages.some(message => message.type === "prompt_result" && message.requestId === requestId)).toBe(false);
  });
}

test("OAuth refresh failure during connect prompts/list still fails sanitized", async () => {
  await signInAndConnect(openSession());
  fixture.faults.expireOnPrompts = true;
  fixture.faults.refresh = true;
  const session = openSession();
  await session.send(fixture.connection(connectionId));
  expect(await session.waitFor("error")).toMatchObject({
    code: "CONNECTION_FAILED", message: "OAuth authentication failed",
  });
  expect(session.messages.some(message => message.type === "connected")).toBe(false);
  expect(session.messages.some(message => message.type === "log" && message.level === "WARN")).toBe(false);
  const messages = JSON.stringify(session.messages);
  expect(messages).not.toContain("diagnostic");
  for (const secret of fixture.issued) expect(messages).not.toContain(secret);
});

test("OAuth ID tokens and resource response credentials are redacted from headers, verbose frames and errors", async () => {
  const session = openSession();
  await signInAndConnect(session);
  const id = fixture.idTokens[0]!;
  await echo(session, id);
  await session.send({ type: "invoke", tool: id, params: {} });
  expect((await session.waitFor("error")).message).toContain("[REDACTED]");
  const diagnostics = JSON.stringify(session.messages.filter(msg => ["log", "error", "http_response"].includes(msg.type)));
  for (const value of [...fixture.issued, ...fixture.idTokens]) expect(diagnostics).not.toContain(value);
  const headers = await session.waitFor("http_response");
  expect(headers.headers["set-cookie"]).toBe("[REDACTED]");
  expect(headers.headers["x-id-reflection"]).toBe("[REDACTED]");
});

for (const url of ["ms-settings:privacy", "http://auth.example.com/authorize"]) {
  test(`unsafe authorization URL ${url} fails before sending browser approval`, async () => {
    fixture.faults.authorizationUrl = url;
    const session = openSession();
    await session.send(fixture.connection(connectionId));
    expect(await session.waitFor("error")).toMatchObject({
      code: "CONNECTION_FAILED",
      message: "OAuth sign-in requires HTTPS (HTTP is allowed only for loopback hosts)",
    });
    expect(session.messages.some(message => message.type === "oauth_authorize")).toBe(false);
  });
}
