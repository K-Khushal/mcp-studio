import { expect, test } from "bun:test";

test("malformed client JSON yields a protocol-valid error", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: { ...process.env, PORT: "0", STUDIO_DB_PATH: ":memory:" }, stdout: "pipe", stderr: "pipe",
  });
  let socket: WebSocket | undefined;
  try {
    const reader = child.stdout.getReader();
    let output = "";
    let port: string | undefined;
    while (!port) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`Studio Server exited: ${output}`);
      output += new TextDecoder().decode(value);
      port = output.match(/Listening on port (\d+)/)?.[1];
    }
    reader.releaseLock();
    const reply = await new Promise<unknown>((resolve, reject) => {
      socket = new WebSocket(`ws://localhost:${port}/ws`);
      socket.onopen = () => socket!.send("{broken");
      socket.onmessage = event => resolve(JSON.parse(String(event.data)));
      socket.onerror = reject;
    });
    expect(reply).toEqual({ type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
  } finally {
    socket?.close();
    child.kill();
    await child.exited;
  }
}, 5000);
