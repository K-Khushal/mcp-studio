import { expect, test } from "bun:test";
import { SessionHarness, startHTTPFixture, stdioFixture } from "./fixtures/session-harness";

for (const transport of ["stdio", "http"] as const) {
  test(`Session connect/list/invoke/error/prompt/disconnect over ${transport}`, async () => {
    const http = transport === "http" ? await startHTTPFixture() : undefined;
    const session = new SessionHarness();
    try {
      await session.send(http?.connection ?? stdioFixture);
      const connected = await session.waitFor("connected");
      expect(connected).toMatchObject({ serverInfo: { name: "protocol-fixture" } });
      expect(connected.protocolVersion).toMatch(/^202[5-9]-\d{2}-\d{2}$/);

      await session.send({ type: "list_tools" });
      expect((await session.waitFor("tools_listed")).tools.map(t => t.name)).toEqual([
        "echo", "error", "slow", "structured", "elicit", "log", "stderr", "crash",
      ]);
      await session.send({ type: "list_prompts" });
      expect((await session.waitFor("prompts_listed")).prompts).toMatchObject([{ name: "greet", arguments: [{ name: "name", required: true }] }]);
      await session.send({ type: "invoke", tool: "echo", params: { text: "hello fixture" } });
      expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ type: "text", text: "hello fixture" }] } });
      await session.send({ type: "invoke", tool: "error", params: {} });
      expect(await session.waitFor("result")).toMatchObject({ data: { isError: true, content: [{ type: "text", text: "Fixture tool error" }] } });
      await session.send({ type: "invoke_prompt", prompt: "greet", args: { name: "Ada" } });
      expect(await session.waitFor("prompt_result")).toMatchObject({ messages: [{ role: "user", content: { type: "text", text: "Hello, Ada!" } }] });
      await session.send({ type: "disconnect" });
      expect(await session.waitFor("disconnected")).toEqual({ type: "disconnected" });
      if (http) {
        expect(http.versions.slice(1).length).toBeGreaterThan(0);
        expect(http.versions.slice(1).every(v => v === connected.protocolVersion)).toBe(true);
      }
    } finally {
      await session.close();
      await http?.close();
    }
  });
}

test("Session harness waits for future messages and times out missing messages", async () => {
  const session = new SessionHarness();
  try {
    const error = session.waitFor("error", message => message.code === "NOT_CONNECTED");
    await session.send({ type: "invoke", tool: "echo", params: {} });
    expect(await error).toMatchObject({ code: "NOT_CONNECTED" });
    await expect(session.waitFor("connected", undefined, 10)).rejects.toThrow("Timed out awaiting connected");
    // The matched error was consumed; a second wait must not reuse it.
    await expect(session.waitFor("error", undefined, 10)).rejects.toThrow("Timed out awaiting error");
  } finally {
    await session.close();
  }
});

test("Session connects again after disconnecting over HTTP", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await session.send(http.connection);
      expect(await session.waitFor("connected")).toMatchObject({ serverInfo: { name: "protocol-fixture" } });
      await session.send({ type: "invoke", tool: "echo", params: { text: "reconnected" } });
      expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ type: "text", text: "reconnected" }] } });
      await session.send({ type: "disconnect" });
      await session.waitFor("disconnected");
    }
  } finally {
    await session.close();
    await http.close();
  }
});

test("HTTP Session reports the Streamable HTTP variant", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    await session.send(http.connection);
    expect(await session.waitFor("connected")).toMatchObject({ httpVariant: "streamable" });
  } finally {
    await session.close();
    await http.close();
  }
});

test("HTTP Session falls back to legacy SSE and reports its variant", async () => {
  const http = await startHTTPFixture("sse");
  const session = new SessionHarness();
  try {
    await session.send(http.connection);
    expect(await session.waitFor("connected")).toMatchObject({ httpVariant: "sse", serverInfo: { name: "protocol-fixture" } });
    await session.send({ type: "invoke", tool: "echo", params: { text: "legacy" } });
    expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ type: "text", text: "legacy" }] } });
  } finally {
    await session.close();
    await http.close();
  }
});


test("legacy SSE fixture teardown is idempotent", async () => {
  const http = await startHTTPFixture("sse");
  await Promise.all([http.close(), http.close()]);
  await http.close();
});

for (const status of [401, 405]) {
  test(`HTTP ${status} preserves connection failure diagnostics`, async () => {
    const methods: string[] = [];
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      methods.push(request.method);
      return new Response("Fixture rejected", { status: request.method === "POST" ? status : 503 });
    } });
    const session = new SessionHarness();
    try {
      await session.send({ type: "connect", transport: "http", config: { url: server.url.toString(), headers: {} } });
      const error = await session.waitFor("error");
      expect(error.code).toBe("CONNECTION_FAILED");
      if (status === 401) {
        expect(methods).toEqual(["POST"]);
        expect(error.message).toMatch(/401|Unauthorized/i);
      } else {
        expect(methods).toEqual(["POST", "GET"]);
        expect(error.message).toContain("405");
        expect(error.message).toContain("503");
      }
      expect(session.messages.some(message => message.type === "connected")).toBe(false);
    } finally {
      await session.close();
      await server.stop(true);
    }
  });
}
test("bad command reports a connection error and error status", async () => {
  const session = new SessionHarness();
  try {
    await session.send({ type: "connect", transport: "stdio", config: { command: "/missing-mcp-command", args: [], env: {}, inheritSystemEnv: false } });
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED" });
    expect(session.messages).toContainEqual({ type: "status", status: "error" });
    expect(session.messages.some(m => m.type === "log" && m.level === "ERROR")).toBe(true);
  } finally { await session.close(); }
});

test("crash mid-Session reports disconnected with a reason", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.send({ type: "invoke", tool: "crash", params: {} });
    expect(await session.waitFor("disconnected")).toMatchObject({ reason: "MCP Server connection closed unexpectedly" });
    expect(session.messages).toContainEqual({ type: "status", status: "disconnected" });
  } finally { await session.close(); }
});

test("a rejected replacement Connection preserves live Session crash detection", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.send({ type: "connect", transport: "http", config: { url: "{{MISSING_URL}}", headers: {} } });
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED" });
    await session.send({ type: "invoke", tool: "crash", params: {} });
    expect(await session.waitFor("disconnected")).toMatchObject({ reason: "MCP Server connection closed unexpectedly" });
  } finally { await session.close(); }
});
