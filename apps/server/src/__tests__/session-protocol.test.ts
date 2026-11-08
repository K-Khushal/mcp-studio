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
      if (http) expect(http.versions.slice(1)).toContain(connected.protocolVersion!);
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
    } finally {
      await session.close();
      await http?.close();
    }
  });
}

test("Session harness waits for future messages and times out missing messages", async () => {
  const session = new SessionHarness();
  try {
    const error = session.waitFor("ERROR", message => message.code === "NOT_CONNECTED");
    await session.send({ type: "invoke", tool: "echo", params: {} });
    expect(await error).toMatchObject({ code: "NOT_CONNECTED" });
    await expect(session.waitFor("connected", undefined, 10)).rejects.toThrow("Timed out awaiting connected");
    // The matched error was consumed; a second wait must not reuse it.
    await expect(session.waitFor("ERROR", undefined, 10)).rejects.toThrow("Timed out awaiting ERROR");
  } finally {
    await session.close();
  }
});
