import { expect, test } from "bun:test";
import { SessionHarness, startHTTPFixture, stdioFixture } from "./fixtures/session-harness";

for (const transport of ["stdio", "http"] as const) {
  test(`Session carries tool metadata and structured results to the web over ${transport}`, async () => {
    const http = transport === "http" ? await startHTTPFixture() : undefined;
    const session = new SessionHarness();
    try {
      await session.send(http?.connection ?? stdioFixture);
      const connected = await session.waitFor("connected");
      const expected = {
        name: "structured", title: "Structured answer",
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        icons: [{ src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", mimeType: "image/png" }],
        outputSchema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"] },
      };
      expect(connected.tools.find(t => t.name === "structured")).toMatchObject(expected);
      await session.send({ type: "list_tools" });
      expect((await session.waitFor("tools_listed")).tools.find(t => t.name === "structured")).toMatchObject(expected);
      await session.send({ type: "invoke", tool: "structured", params: {} });
      expect(await session.waitFor("result")).toMatchObject({
        data: { structuredContent: { answer: 42 }, content: [{ type: "text", text: '{"answer":42}' }] },
      });
    } finally {
      await session.close();
      await http?.close();
    }
  });
}
