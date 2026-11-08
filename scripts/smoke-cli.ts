import { strict as assert } from "node:assert";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "studio-smoke-"));
const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = probe.port!;
probe.stop(true);
const marker = join(dir, "opened");
for (const name of ["xdg-open", "open"]) {
  const file = join(dir, name);
  await Bun.write(file, `#!/bin/sh\necho "$1" > '${marker}'\n`);
  await chmod(file, 0o755);
}
const child = Bun.spawn([process.execPath, resolve("dist/cli.js"), "--port", String(port), "--no-open"], {
  cwd: dir,
  env: { ...process.env, PATH: `${dir}:${process.env["PATH"]}`, STUDIO_DB_PATH: ":memory:" },
  stdout: "inherit", stderr: "inherit",
});
try {
  const base = `http://localhost:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`CLI exited: ${child.exitCode}`);
    try { ready = (await fetch(`${base}/health`)).ok; } catch { /* startup */ }
    if (ready) break;
    await Bun.sleep(50);
  }
  assert(ready, "CLI starts on --port");
  const html = await (await fetch(base)).text();
  assert.match(html, /<html/);
  const asset = html.match(/src="([^\"]+\.js)"/)?.[1];
  assert(asset, "built script linked");
  assert.equal((await fetch(`${base}${asset}`)).status, 200);
  assert.deepEqual(await (await fetch(`${base}/collections`)).json(), []);
  assert.deepEqual(await (await fetch(`${base}/api/collections`)).json(), []);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/collections`, { headers: { Origin: "https://evil.example" } })).status, 403);
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal((await fetch(`${base}/collections`, {
      headers: { Origin: `http://${hostname}:${port}` },
    })).status, 200);
  }
  for (const path of ["/collections", "/", "/ws"]) {
    assert.equal((await fetch(`${base}${path}`, {
      headers: { Host: `evil.example:${port}` },
    })).status, 403, `bad Host rejected without Origin for ${path}`);
    assert.equal((await fetch(`${base}${path}`, {
      headers: { Host: `evil.example:${port}`, Origin: `http://evil.example:${port}` },
    })).status, 403, `bad Host rejected for ${path}`);
  }
  assert.equal((await fetch(`${base}/..%2fcli.js`)).status, 404);
  assert.equal((await fetch(`${base}/ws`, {
    headers: {
      Origin: "https://evil.example", Connection: "Upgrade", Upgrade: "websocket",
      "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  })).status, 403);
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const timer = setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, 3000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS failed")); };
  });
  assert.equal(await Bun.file(marker).exists(), false, "--no-open suppresses browser");
  console.log("PASS: --port, --no-open, HTML + asset, REST + /api, WebSocket, Host + origin rejection, traversal rejection, arbitrary cwd");
} finally {
  child.kill();
  await child.exited;
  await rm(dir, { recursive: true, force: true });
}
