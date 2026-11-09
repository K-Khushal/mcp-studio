import { expect, spyOn, test } from "bun:test";
import { SessionHarness, startHTTPFixture, stdioFixture } from "./fixtures/session-harness";

test("Session substitutes command, args and prompt arguments", async () => {
  const session = new SessionHarness();
  try {
    if (stdioFixture.type !== "connect" || stdioFixture.transport !== "stdio") throw new Error("Expected STDIO fixture");
    session.setActiveEnv({ COMMAND: stdioFixture.config.command, SCRIPT: stdioFixture.config.args[0]!, NAME: "Ada" });
    await session.send({ ...stdioFixture, config: { ...stdioFixture.config, command: "{{COMMAND}}", args: ["{{SCRIPT}}"] } });
    await session.waitFor("connected");
    await session.send({ type: "invoke_prompt", prompt: "greet", args: { name: "{{NAME}}" } });
    expect(await session.waitFor("prompt_result")).toMatchObject({ messages: [{ content: { text: "Hello, Ada!" } }] });
  } finally { await session.close(); }
});

test("Session substitutes URL and tool arguments; unresolved Variables never reach the MCP Server", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    session.setActiveEnv({ URL: http.connection.config.url, TEXT: "synthetic-resolved-call-value" });
    await session.send({ ...http.connection, config: { ...http.connection.config, url: "{{URL}}" } });
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "echo", params: { text: "{{TEXT}}" } });
    expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ text: "synthetic-resolved-call-value" }] } });
    for (const message of [
      { type: "invoke", tool: "echo", params: { text: "{{FIRST}} {{SECOND}} {{FIRST}}" } },
      { type: "invoke_prompt", prompt: "greet", args: { name: "{{FIRST}} {{SECOND}}" } },
    ] as const) {
      const count = http.requests.length;
      await session.send(message);
      expect(await session.waitFor("error")).toMatchObject({ message: "Unresolved Variables: FIRST, SECOND", requestId: expect.any(String) });
      expect(http.requests.length).toBe(count);
    }
  } finally { await session.close(); await http.close(); }
});

test("unresolved connection Variables block all network traffic", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    await session.send({ ...http.connection, config: { ...http.connection.config, headers: { Authorization: "{{TOKEN}}" }, auth: { type: "apikey", key: "X-Key", value: "{{KEY}}", in: "header" } } });
    expect(await session.waitFor("error")).toMatchObject({ message: "Unresolved Variables: TOKEN, KEY" });
    expect(http.requests).toEqual([]);
  } finally { await session.close(); await http.close(); }
});

test("unresolved STDIO cwd blocks spawn and preserves the live Session", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    await session.send(http.connection);
    await session.waitFor("connected");
    const count = session.messages.length;
    const spawn = spyOn(Bun, "spawn");
    try {
      await session.send({
        type: "connect", transport: "stdio",
        config: { command: "definitely-not-an-executable", args: [], env: {}, inheritSystemEnv: true, cwd: "{{X}}" },
      });
      expect(await session.waitFor("error")).toMatchObject({
        code: "CONNECTION_FAILED", message: "Unresolved Variables: X",
      });
      expect(spawn).not.toHaveBeenCalled();
    } finally { spawn.mockRestore(); }
    expect(session.messages.slice(count).some(message => message.type === "connected" || message.type === "disconnected")).toBe(false);
    await session.send({ type: "invoke", tool: "echo", params: { text: "still connected" } });
    expect(await session.waitFor("result")).toMatchObject({ data: { content: [{ text: "still connected" }] } });
  } finally { await session.close(); await http.close(); }
});
