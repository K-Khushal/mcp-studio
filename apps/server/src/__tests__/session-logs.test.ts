import { expect, test } from "bun:test";
import type { ClientMessage, ServerMessage } from "@mcp-studio/types";
import { SessionHarness, startHTTPFixture, stdioFixture } from "./fixtures/session-harness";

type LogMessage = Extract<ServerMessage, { type: "log" }>;
const logs = (session: SessionHarness) => session.messages.filter((m): m is LogMessage => m.type === "log");
const frames = (session: SessionHarness) => logs(session).filter(l => l.source === "protocol");

for (const transport of ["stdio", "http"] as const) {
  test(`verbose on logs JSON-RPC frames with direction, method and id over ${transport}`, async () => {
    const http = transport === "http" ? await startHTTPFixture() : undefined;
    const session = new SessionHarness();
    try {
      await session.send({ ...(http?.connection ?? stdioFixture), verbose: true } as ClientMessage);
      await session.waitFor("connected");
      await session.send({ type: "invoke", tool: "echo", params: { text: "hi" } });
      await session.waitFor("result");

      const initialize = frames(session).filter(f => f.payload?.method === "initialize");
      expect(initialize.map(f => f.payload?.direction)).toEqual(["out", "in"]);
      expect(initialize[0]!.payload!.id).toBe(initialize[1]!.payload!.id);
      expect(initialize[1]!.payload!.body).toMatchObject({ result: { serverInfo: { name: "protocol-fixture" } } });

      const call = frames(session).filter(f => f.payload?.method === "tools/call");
      expect(call.map(f => f.payload?.direction)).toEqual(["out", "in"]);
      expect(call[0]!.payload!.body).toMatchObject({ params: { name: "echo", arguments: { text: "hi" } } });
      expect(call[1]!.payload!.body).toMatchObject({ result: { content: [{ type: "text", text: "hi" }] } });
      expect(call[0]!.payload!.id).toBe(call[1]!.payload!.id);
      expect(call[0]!.message).toContain("tools/call");
      expect(call.every(f => f.level === "DEBUG")).toBe(true);
    } finally {
      await session.close();
      await http?.close();
    }
  });
}

test("verbose off logs no JSON-RPC frames", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "echo", params: {} });
    await session.waitFor("result");
    expect(logs(session).filter(l => l.payload)).toEqual([]);
  } finally {
    await session.close();
  }
});

test("set_verbose toggles frame capture on a live Session", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    await session.send({ type: "set_verbose", verbose: true });
    await session.send({ type: "invoke", tool: "echo", params: {} });
    await session.waitFor("result");
    expect(frames(session).filter(f => f.payload?.method === "tools/call")).toHaveLength(2);
    await session.send({ type: "set_verbose", verbose: false });
    const before = frames(session).length;
    await session.send({ type: "invoke", tool: "echo", params: {} });
    await session.waitFor("result", () => session.messages.filter(m => m.type === "result").length === 2);
    expect(frames(session)).toHaveLength(before);
  } finally {
    await session.close();
  }
});

test("MCP notifications/message arrive as Server-source entries with mapped level", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "log", params: {} });
    await session.waitFor("result");
    const entry = await session.waitFor("log", l => l.source === "server" && l.message.includes("Fixture log"));
    expect(entry).toMatchObject({ level: "INFO", source: "server" });
    expect(entry.message).toContain("fixture");
  } finally {
    await session.close();
  }
});

test("subprocess stderr arrives as a Server-source entry", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "stderr", params: {} });
    await session.waitFor("result");
    expect(await session.waitFor("log", l => l.message === "Fixture stderr")).toMatchObject({ source: "server", level: "INFO" });
  } finally {
    await session.close();
  }
});

test("Studio lifecycle entries use the Studio source", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    expect(await session.waitFor("log", l => l.message.includes("handshake complete"))).toMatchObject({ source: "studio" });
  } finally {
    await session.close();
  }
});


test("legacy SSE fallback captures tool frames and keeps lifecycle logs in Studio", async () => {
  const http = await startHTTPFixture("sse");
  const session = new SessionHarness();
  try {
    await session.send({ ...http.connection, verbose: true });
    expect(await session.waitFor("connected")).toMatchObject({ httpVariant: "sse" });
    await session.send({ type: "invoke", tool: "echo", params: { text: "SSE" } });
    await session.waitFor("result");
    const call = frames(session).filter(f => f.payload?.method === "tools/call");
    expect(call.map(f => f.payload?.direction)).toEqual(["out", "in"]);
    expect(call[0]!.payload!.id).toBe(call[1]!.payload!.id);
    expect(call[1]!.payload!.body).toMatchObject({ result: { content: [{ text: "SSE" }] } });
    expect(await session.waitFor("log", l => l.message.includes("trying legacy SSE"))).toMatchObject({ source: "studio" });
    await session.send({ type: "set_verbose", verbose: false });
    const before = frames(session).length;
    await session.send({ type: "invoke", tool: "echo", params: {} });
    await session.waitFor("result");
    expect(frames(session)).toHaveLength(before);
  } finally {
    await session.close();
    await http.close();
  }
});

test("stderr preserves lines and UTF-8 across chunks and flushes the final line", async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "stderr", params: { text: "chunks" } });
    await session.waitFor("result");
    await session.close();
    expect(logs(session).filter(l => l.source === "server").map(l => l.message)).toEqual(["booting", "€", "tail"]);
  } finally {
    await session.close();
  }
});

test("HTTP connection logs redact every query value", async () => {
  const http = await startHTTPFixture();
  const session = new SessionHarness();
  try {
    await session.send({ ...http.connection, config: {
      ...http.connection.config,
      url: `${http.connection.config.url}?view=tools&credential=old-secret`,
      auth: { type: "apikey", in: "query", key: "credential", value: "super-secret" },
    } });
    await session.waitFor("connected");
    const entry = logs(session).find(l => l.message.startsWith("Connecting via Streamable HTTP"));
    expect(entry?.message).not.toContain("view=tools");
    expect(entry?.message).toContain("view=%5BREDACTED%5D");
    expect(entry?.message).toContain("REDACTED");
    expect(JSON.stringify(logs(session))).not.toContain("super-secret");
    expect(JSON.stringify(logs(session))).not.toContain("old-secret");
  } finally {
    await session.close();
    await http.close();
  }
});
