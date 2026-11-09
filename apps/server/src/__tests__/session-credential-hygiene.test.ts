import { expect, test } from "bun:test";
import { SessionHarness, createStreamableEndpoint, stdioFixture } from "./fixtures/session-harness";
import type { ClientMessage, HttpConfig } from "@mcp-studio/types";

const diagnostics = (session: SessionHarness) => JSON.stringify(session.messages.filter(msg => ["log", "error", "http_response"].includes(msg.type)));

for (const source of ["bearer", "apikey-header", "apikey-query", "header", "variable-url"] as const) {
  test(`${source} is used on the wire but redacted from frames, HTTP headers and errors`, async () => {
    const secret = `private-${source}-value`;
    const endpoint = createStreamableEndpoint();
    const received: string[] = [];
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      received.push(request.url + JSON.stringify(Object.fromEntries(request.headers)));
      const response = await endpoint.handle(request);
      const headers = new Headers(response.headers);
      headers.set("Set-Cookie", "session=unknown-cookie-value");
      headers.set("X-Api-Key", "unknown-api-value");
      headers.set("Authorization", "Bearer unknown-auth-value");
      headers.set("Cookie", "unknown-request-cookie");
      headers.set("X-Echo", secret);
      return new Response(response.body, { status: response.status, headers });
    } });
    const session = new SessionHarness();
    const config: HttpConfig = { url: server.url.toString(), headers: {} };
    if (source === "bearer") config.auth = { type: "bearer", token: secret };
    if (source.startsWith("apikey")) config.auth = { type: "apikey", key: "key", value: secret, in: source === "apikey-header" ? "header" : "query" };
    if (source === "header") config.headers = { "X-Custom": secret };
    if (source === "variable-url") { config.url += "?credential={{VALUE}}"; session.setActiveEnv({ VALUE: secret }); }
    try {
      await session.send({ type: "connect", transport: "http", config, verbose: true });
      await session.waitFor("connected");
      await session.send({ type: "invoke", tool: "echo", params: { text: secret }, requestId: "echo" });
      expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ text: secret }] } });
      await session.send({ type: "invoke", tool: secret, params: {}, requestId: "failure" });
      expect((await session.waitFor("error")).message).toContain("[REDACTED]");
      expect(received.join()).toContain(secret);
      const emitted = diagnostics(session);
      for (const value of [secret, "unknown-cookie-value", "unknown-api-value", "unknown-auth-value", "unknown-request-cookie"]) expect(emitted).not.toContain(value);
      expect(emitted).toContain("[REDACTED]");
    } finally { await session.close(); await endpoint.close(); await server.stop(true); }
  });
}

test("STDIO env and changing interpolated Variables never reach diagnostic frames or errors", async () => {
  const session = new SessionHarness();
  try {
    session.setActiveEnv({ FIRST: "private-variable-first" });
    const connect = stdioFixture as Extract<ClientMessage, { transport: "stdio" }>;
    await session.send({ ...connect, verbose: true, config: { ...connect.config, env: { TOKEN: "private-stdio-env" } } });
    await session.waitFor("connected");
    session.setActiveEnv({ SECOND: "private-variable-second" });
    for (const tool of ["log", "stderr"]) {
      await session.send({ type: "invoke", tool, params: { text: "private-stdio-env" } });
      await session.waitFor("result");
      expect((await session.waitFor("log", msg => msg.source === "server" && msg.message.includes("[REDACTED]"))).message).not.toContain("private-stdio-env");
    }
    for (const tool of ["private-stdio-env", "private-variable-first", "{{SECOND}}"] ) {
      await session.send({ type: "invoke", tool: "echo", params: { text: tool } });
      await session.waitFor("result");
      await session.send({ type: "invoke", tool, params: {} });
      await session.waitFor("error");
    }
    for (const value of ["private-stdio-env", "private-variable-first", "private-variable-second"]) expect(diagnostics(session)).not.toContain(value);
  } finally { await session.close(); }
});

test("connect failures redact credentials before the browser creates a failure toast", async () => {
  const session = new SessionHarness();
  try {
    session.setActiveEnv({ TOKEN: "private-startup-token" });
    await session.send({ type: "connect", transport: "stdio", verbose: true,
      config: { command: "/missing/{{TOKEN}}", args: [], env: {}, inheritSystemEnv: false } });
    const error = await session.waitFor("error");
    expect(error.code).toBe("CONNECTION_FAILED");
    expect(error.message).toContain("[REDACTED]");
    expect(diagnostics(session)).not.toContain("private-startup-token");
  } finally { await session.close(); }
});
