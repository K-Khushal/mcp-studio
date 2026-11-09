import { afterAll, beforeAll, expect, test } from "bun:test";
import { startStudioServer, TEST_TOKEN, type StudioServer } from "./helpers/studio-server.js";

let studio: StudioServer;
beforeAll(async () => { studio = await startStudioServer(); });
afterAll(() => studio.stop());

/** Opens an authenticated socket, sends each frame in order and collects one reply per frame. */
async function exchange(frames: string[]): Promise<unknown[]> {
  const socket = new WebSocket(`ws://localhost:${studio.port}/ws`, { headers: { Authorization: `Bearer ${TEST_TOKEN}` } } as unknown as string[]);
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const replies: unknown[] = [];
      socket.onopen = () => { for (const frame of frames) socket.send(frame); };
      socket.onmessage = event => {
        replies.push(JSON.parse(String(event.data)));
        if (replies.length === frames.length) resolve(replies);
      };
      socket.onerror = reject;
      socket.onclose = () => reject(new Error("socket closed"));
    });
  } finally {
    socket.onclose = null;
    socket.close();
  }
}

test("malformed client JSON yields a protocol-valid error", async () => {
  expect(await exchange(["{broken"])).toEqual([{ type: "error", code: "PARSE_ERROR", message: "Invalid JSON" }]);
}, 5000);

test("JSON that is not a well-formed ClientMessage yields a protocol error and the Studio Server keeps running", async () => {
  const frames = [
    "null", "42", '"text"', "[]", "true", "{}",
    '{"type":null}', '{"type":"bogus"}', '{"type":"__proto__"}', '{"type":"toString"}',
    '{"type":"invoke"}', '{"type":"invoke","tool":"echo","params":null,"requestId":"r1"}',
    '{"type":"invoke_prompt","prompt":"p","args":[]}', '{"type":"cancel","requestId":7}',
    '{"type":"set_verbose","verbose":"yes"}', '{"type":"elicitation_response","elicitationId":"e","action":"maybe"}',
    '{"type":"connect"}', '{"type":"connect","transport":"stdio","config":null}',
    '{"type":"connect","transport":"stdio","config":{"command":["sh"]}}', '{"type":"connect","transport":"http","config":{}}',
  ];
  const replies = await exchange(frames);
  for (const reply of replies) expect(reply).toMatchObject({ type: "error", code: "PROTOCOL_ERROR" });
  expect(replies[11]).toMatchObject({ requestId: "r1" });
  expect(studio.alive()).toBe(true);
  expect((await studio.request("/health")).status).toBe(200);
  // The same socket still serves well-formed messages afterwards.
  expect(await exchange(["null", '{"type":"list_tools"}'])).toEqual([
    { type: "error", code: "PROTOCOL_ERROR", message: "Message must be a JSON object" },
    { type: "error", message: "Not connected", code: "NOT_CONNECTED" },
  ]);
}, 10000);

test("untrusted type objects cannot escape parsing or break subsequent dispatch", async () => {
  const frames = [
    '{"type":{"toString":null}}',
    '{"type":{"toString":{},"valueOf":null}}',
    '{"type":{"__proto__":{"toString":null}}}',
    '{"type":[{"toString":null}]}',
    '{"type":"constructor"}',
    '{"__proto__":{"type":"list_tools"}}',
  ];
  const replies = await exchange([...frames, '{"type":"list_tools"}']);
  for (const reply of replies.slice(0, -1)) expect(reply).toMatchObject({ type: "error", code: "PROTOCOL_ERROR" });
  expect(replies.at(-1)).toMatchObject({ type: "error", code: "NOT_CONNECTED" });
}, 3000);
