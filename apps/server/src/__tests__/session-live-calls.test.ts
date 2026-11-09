import { expect, test } from "bun:test";
import type { ServerMessage } from "@mcp-studio/types";
import { SessionHarness, startHTTPFixture, stdioFixture } from "./fixtures/session-harness";

for (const mode of ["stdio", "http"] as const) {
  test(`slow Call delivers ordered progress correlated to its result over ${mode}`, async () => {
    const http = mode === "stdio" ? undefined : await startHTTPFixture();
    const session = new SessionHarness();
    try {
      await session.send(http?.connection ?? stdioFixture);
      const phases = session.messages.filter(m => m.type === "session_phase");
      expect(phases).toMatchObject([{ phase: mode === "stdio" ? "spawn" : "connect", durationMs: expect.any(Number) }, { phase: "initialize", durationMs: expect.any(Number) }]);
      await session.send({ type: "invoke", tool: "slow", params: { steps: 3 } });
      const result = await session.waitFor("result");
      expect(session.messages.filter(message => (message.type as string) === "progress")).toEqual([
        { type: "progress", requestId: result.requestId, progress: 1, total: 3, message: "Step 1 of 3" },
        { type: "progress", requestId: result.requestId, progress: 2, total: 3, message: "Step 2 of 3" },
        { type: "progress", requestId: result.requestId, progress: 3, total: 3, message: "Step 3 of 3" },
      ]);
      expect(session.messages.some(message => (message.type as string) === "chunk")).toBe(false);
    } finally { await session.close(); await http?.close(); }
  });
}

for (const mode of ["stdio", "http"] as const) {
  test(`cancel isolates concurrent Calls and reaches the MCP Server over ${mode}`, async () => {
    const http = mode === "http" ? await startHTTPFixture() : undefined;
    const session = new SessionHarness();
    try {
      await session.send(http?.connection ?? stdioFixture);
      const progress = session.waitFor("progress", m => m.requestId === "cancel-me");
      const first = session.send({ type: "invoke", requestId: "cancel-me", tool: "slow", params: { steps: 50 } });
      const second = session.send({ type: "invoke", requestId: "keep-me", tool: "slow", params: { steps: 4 } });
      await progress;
      await session.send({ type: "cancel", requestId: "cancel-me" });
      expect(await session.waitFor("cancelled")).toMatchObject({ requestId: "cancel-me" });
      await session.waitFor("log", m => m.source === "server" && m.message.includes("Slow Call aborted"));
      await Promise.all([first, second]);
      expect(await session.waitFor("result")).toMatchObject({ requestId: "keep-me" });
      expect(session.messages.filter(m => m.type === "progress" && m.requestId === "keep-me").map(m => m.type === "progress" && m.progress)).toEqual([1, 2, 3, 4]);
      expect(session.messages.filter(m => (m.type === "result" || m.type === "error") && m.requestId === "cancel-me")).toHaveLength(0);
      await session.send({ type: "invoke_prompt", requestId: "prompt", prompt: "greet", args: { name: "Ada" } });
      expect(await session.waitFor("prompt_result")).toMatchObject({ requestId: "prompt", messages: [{ content: { text: "Hello, Ada!" } }] });
    } finally { await session.close(); await http?.close(); }
  });

  test(`timeout ends a Call and aborts server work over ${mode}`, async () => {
    const http = mode === "http" ? await startHTTPFixture() : undefined;
    const session = new SessionHarness();
    try {
      await session.send(http?.connection ?? stdioFixture);
      await session.send({ type: "invoke", requestId: "timeout", requestTimeout: 0.12, tool: "slow", params: { steps: 50 } });
      expect(await session.waitFor("error")).toMatchObject({ requestId: "timeout", code: "CALL_TIMEOUT", message: "Call timed out after 0.12 seconds" });
      await session.waitFor("log", m => m.source === "server" && m.message.includes("Slow Call aborted"));
      expect(session.messages.some(m => m.type === "result" && m.requestId === "timeout")).toBe(false);
    } finally { await session.close(); await http?.close(); }
  });
}

test("cancelling a Call closes its pending form before the terminal message", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const call = session.send({ type: "invoke", requestId: "form", tool: "elicit", params: {} });
    const { elicitationId } = await session.waitFor("elicitation_request");
    await session.send({ type: "cancel", requestId: "form" });
    await call;
    expect(session.messages.filter(m => m.type === "elicitation_closed" || m.type === "cancelled")).toEqual([
      { type: "elicitation_closed", elicitationId }, { type: "cancelled", requestId: "form" },
    ]);
  } finally { await session.close(); }
});

test("Call timeout excludes time spent filling an elicitation form", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const call = session.send({ type: "invoke", requestId: "paused", requestTimeout: 0.2, tool: "elicit", params: {} });
    const { elicitationId } = await session.waitFor("elicitation_request");
    await Bun.sleep(350);
    expect(session.messages.some(m => m.type === "error" && m.requestId === "paused")).toBe(false);
    await session.send({ type: "elicitation_response", elicitationId, action: "accept", content: { name: "Ada" } });
    await call;
    expect(await session.waitFor("result")).toMatchObject({ requestId: "paused" });
  } finally { await session.close(); }
});

test("reusing a running requestId reports DUPLICATE_REQUEST", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const call = session.send({ type: "invoke", requestId: "same", tool: "slow", params: { steps: 10 } });
    await session.waitFor("progress");
    await session.send({ type: "invoke", requestId: "same", tool: "echo", params: {} });
    expect(session.messages.filter(m => m.type === "error")).toMatchObject([{ requestId: "same", code: "DUPLICATE_REQUEST" }]);
    await call;
  } finally { await session.close(); }
});

test("abort after the SDK result resolves still emits exactly one terminal frame", async () => {
  const { SessionManager } = await import("../session/manager");
  const messages: ServerMessage[] = [];
  const session = new SessionManager(message => {
    messages.push(message);
    if (message.type === "log" && message.message.includes("tools/call ← echo complete")) {
      void session.handle({ type: "cancel", requestId: "race" });
    }
  });
  try {
    await session.handle(stdioFixture);
    await session.handle({ type: "invoke", requestId: "race", tool: "echo", params: {} });
    expect(messages.filter(m => m.type === "cancelled" || m.type === "result" || m.type === "error")).toEqual([{ type: "cancelled", requestId: "race" }]);
  } finally { await session.disconnect(); }
});

test("legacy SSE fallback records only the successful connect phase", async () => {
  const http = await startHTTPFixture("sse");
  const session = new SessionHarness();
  try {
    await session.send(http.connection);
    expect(session.messages.filter(m => m.type === "session_phase").map(m => m.type === "session_phase" && m.phase)).toEqual(["connect", "initialize"]);
  } finally { await session.close(); await http.close(); }
});

test("Call timeout resumes after an elicitation answer", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const call = session.send({ type: "invoke", requestId: "resume", requestTimeout: 0.2, tool: "elicit", params: { text: "slow-after-answer" } });
    const { elicitationId } = await session.waitFor("elicitation_request");
    await Bun.sleep(350);
    expect(session.messages.some(m => m.type === "error" && m.requestId === "resume")).toBe(false);
    await session.send({ type: "elicitation_response", elicitationId, action: "cancel" });
    await call;
    expect(await session.waitFor("error")).toMatchObject({ requestId: "resume", code: "CALL_TIMEOUT" });
    expect(session.messages.filter(m => m.type === "elicitation_closed")).toHaveLength(1);
    expect(session.messages.some(m => m.type === "result" && m.requestId === "resume")).toBe(false);
  } finally { await session.close(); }
});

for (const mode of ["streamable", "sse"] as const) {
  test(`delivers 6000 notifications without exhausting the ${mode} Session`, async () => {
    const http = await (mode === "sse" ? startHTTPFixture("sse") : startHTTPFixture("streamable"));
    const session = new SessionHarness();
    try {
      await session.send(http.connection);
      await session.send({ type: "invoke", requestId: "burst", tool: "notification-burst", params: {}, requestTimeout: 5 });
      // Delivery on the standalone GET stream can finish after the POST result.
      for (let i = 0; i < 100 && session.messages.filter(m => m.type === "log" && m.source === "server").length < 6000; i++) await Bun.sleep(10);
      expect(session.messages.filter(m => m.type === "log" && m.source === "server")).toHaveLength(6000);
      await session.send({ type: "invoke", requestId: "healthy", tool: "echo", params: { text: "still healthy" } });
      expect(session.messages.find(m => m.type === "result" && m.requestId === "healthy")).toMatchObject({ data: { content: [{ text: "still healthy" }] } });
      expect(session.messages.some(m => m.type === "status" && (m.status === "error" || m.status === "disconnected"))).toBe(false);
    } finally { await session.close(); await http.close(); }
  }, 15000);
}
