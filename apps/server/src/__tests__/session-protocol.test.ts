import { isCallToolResult } from "@mcp-studio/types";
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
        "structured-bad", "structured-missing", "form-controls", "echo", "error", "slow", "structured", "elicit", "log", "stderr", "crash",
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
      expect(session.messages.filter(m => m.type === "log" && m.level === "ERROR" && m.source === "studio")).toMatchObject([{ message: error.message }]);
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
    const error = await session.waitFor("error");
    expect(error.code).toBe("CONNECTION_FAILED");
    expect(session.messages).toContainEqual({ type: "status", status: "error" });
    expect(session.messages.filter(m => m.type === "log" && m.level === "ERROR" && m.source === "studio")).toMatchObject([{ message: error.message }]);
  } finally { await session.close(); }
});

test("crash mid-Session reports disconnected with a reason", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.send({ type: "invoke", tool: "crash", params: {} });
    expect(await session.waitFor("disconnected")).toMatchObject({ reason: "MCP Server connection closed unexpectedly" });
    expect(session.messages).toContainEqual({ type: "status", status: "disconnected" });
    expect(await session.waitFor("log", l => l.level === "ERROR")).toMatchObject({ source: "studio" });
  } finally { await session.close(); }
});

test("a rejected replacement Connection preserves live Session crash detection", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.send({ type: "connect", transport: "http", config: { url: "{{MISSING_URL}}", headers: {} } });
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED" });
    expect(await session.waitFor("log", l => l.level === "ERROR")).toMatchObject({ source: "studio" });
    await session.send({ type: "invoke", tool: "crash", params: {} });
    expect(await session.waitFor("disconnected")).toMatchObject({ reason: "MCP Server connection closed unexpectedly" });
  } finally { await session.close(); }
});

test("STDIO connects with tools and a Studio WARN when prompts/list fails", async () => {
  const session = new SessionHarness();
  try {
    if (stdioFixture.type !== "connect" || stdioFixture.transport !== "stdio") throw new Error("Expected STDIO fixture");
    await session.send({ ...stdioFixture, config: { ...stdioFixture.config, args: [...stdioFixture.config.args, "--fail-prompts"] } });
    const connected = await session.waitFor("connected");
    expect(connected.tools).toContainEqual(expect.objectContaining({ name: "echo" }));
    expect(connected.prompts).toEqual([]);
    expect(await session.waitFor("log", message => message.level === "WARN" && message.source === "studio")).toMatchObject({
      message: expect.stringContaining("prompts/list"),
    });
    await session.send({ type: "list_prompts" });
    expect(await session.waitFor("error")).toMatchObject({ code: "PROMPTS_ERROR" });
  } finally {
    await session.close();
  }
});

test('ordinary multi-megabyte tool and prompt results remain intact', async () => {
  const session = new SessionHarness();
  const text = 'x'.repeat(2 * 1024 * 1024);
  try {
    await session.send(stdioFixture);
    await session.send({ type: 'invoke', tool: 'echo', params: { text } });
    expect(await session.waitFor('result')).toMatchObject({ data: { content: [{ type: 'text', text }] } });
    await session.send({ type: 'invoke_prompt', prompt: 'greet', args: { name: text } });
    expect(await session.waitFor('prompt_result')).toMatchObject({ messages: [{ content: { text: `Hello, ${text}!` } }] });
  } finally { await session.close(); }
});

for (const kind of ['text', 'image']) test(`oversize ${kind} blocks are replaced independently while structured content and other blocks survive`, async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.send({ type: 'invoke', tool: 'large-blocks', params: { text: kind } });
    const result = await session.waitFor('result');
    if (!isCallToolResult(result.data)) throw new Error("Expected tool result");
    expect(result.data.structuredContent).toEqual({ answer: 42 });
    expect(result.data.content).toMatchObject([
      { type: 'text', text: expect.stringContaining('Response block truncated,') },
      { type: 'text', text: 'keep me' },
      { type: 'image', mimeType: 'image/png', data: 'a'.repeat(256 * 1024) },
    ]);
    expect(JSON.stringify(result).length).toBeLessThan(3 * 1024 * 1024);
  } finally { await session.close(); }
});

test("a stalled STDIO initialize times out and closes its child process", async () => {
  const session = new SessionHarness({ connectTimeoutMs: 500 });
  let pid: number | undefined;
  try {
    const connecting = session.send({ type: "connect", transport: "stdio", config: {
      command: process.execPath, args: [new URL("./fixtures/stalled-stdio.ts", import.meta.url).pathname], env: {}, inheritSystemEnv: true,
    } });
    const started = await session.waitFor("log", message => message.message.includes("stalled-stdio-pid:"));
    pid = Number(started.message.match(/stalled-stdio-pid:(\d+)/)![1]);
    await connecting;
    expect(await session.waitFor("error")).toMatchObject({ code: "CONNECTION_FAILED", message: "Connection timed out after 500 ms" });
    expect(session.messages.some(message => message.type === "connected")).toBe(false);
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally {
    await session.close();
    if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* Already exited. */ } }
  }
});
