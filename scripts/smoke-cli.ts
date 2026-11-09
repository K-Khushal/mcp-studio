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
const command = process.argv[2] ? [resolve(process.argv[2])] : [process.execPath, resolve("dist/cli.js")];
for (const flag of ["--help", "--version", "--unknown"]) {
  const result = Bun.spawnSync([...command, flag], { cwd: dir, env: { ...process.env, STUDIO_DB_PATH: join(dir, "flags.db") } });
  const output = result.stdout.toString() + result.stderr.toString();
  assert.equal(result.exitCode, flag === "--unknown" ? 1 : 0);
  if (flag === "--version") {
    const { version } = await import("../package.json");
    assert.equal(output.trim(), version);
  } else assert.match(output, /Usage:/);
}
assert.equal(await Bun.file(join(dir, "flags.db")).exists(), false, "informational flags do not initialize persistence");
const child = Bun.spawn([...command, "--port", String(port), "--no-open"], {
  cwd: dir,
  env: { ...process.env, PATH: `${dir}:${process.env["PATH"]}`, STUDIO_DB_PATH: process.env["STUDIO_DB_PATH"] ?? join(dir, "studio.db") },
  stdout: "pipe", stderr: "inherit",
});
try {
  const base = `http://localhost:${port}`;
  // The CLI prints the launch-token link (ADR-0007); everything else needs it.
  let printed = "";
  let link: string | undefined;
  const reader = child.stdout.getReader();
  const deadline = Date.now() + 10_000;
  while (!link && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`CLI exited: ${child.exitCode}\n${printed}`);
    printed += new TextDecoder().decode(value);
    link = printed.match(/MCP Studio: (http:\/\/localhost:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1];
  }
  process.stdout.write(printed);
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      process.stdout.write(value);
    }
  })();
  assert(link?.startsWith(`${base}/?token=`), "CLI starts on --port and prints the launch-token link");
  const token = new URL(link).searchParams.get("token")!;
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${base}/health`)).status, 401, "health requires the token");
  assert.equal((await fetch(`${base}/health`, { headers: auth })).status, 200);
  const help = await fetch(base);
  assert.equal(help.status, 401);
  assert.match(await help.text(), /link printed in the terminal/);
  const opened = await fetch(link, { redirect: "manual" });
  assert.equal(opened.status, 303);
  assert.equal(opened.headers.get("Location"), "/");
  const cookie = opened.headers.get("Set-Cookie")!.split(";")[0]!;
  const page = await fetch(base, { headers: { Cookie: cookie } });
  for (const [name, value] of [["X-Frame-Options", "DENY"], ["X-Content-Type-Options", "nosniff"], ["Referrer-Policy", "no-referrer"]]) {
    assert.equal(page.headers.get(name), value, `${name} on HTML`);
  }
  assert.match(page.headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  const html = await page.text();
  assert.match(html, /<html/);
  assert.doesNotMatch(html, /<script>/, "no inline scripts");
  assert.doesNotMatch(html, /fonts\.googleapis/, "no Google Fonts");
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert(asset, "built script linked");
  assert.equal((await fetch(`${base}${asset}`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/theme-init.js`, { headers: { Cookie: cookie } })).status, 200);
  assert.deepEqual(await (await fetch(`${base}/collections`, { headers: auth })).json(), []);
  assert.deepEqual(await (await fetch(`${base}/api/collections`, { headers: { Cookie: cookie } })).json(), []);
  assert.equal((await fetch(`${base}/collections`)).status, 401, "REST requires the token");
  assert.equal((await fetch(`${base}/assets/missing.js`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}/collections`, { headers: { ...auth, Origin: "https://evil.example" } })).status, 403);
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal((await fetch(`http://${hostname}:${port}/collections`, {
      headers: { ...auth, Origin: `http://${hostname}:${port}` },
    })).status, 200, `${hostname} serves the Studio`);
  }
  for (const path of ["/collections", "/", "/ws"]) {
    assert.equal((await fetch(`${base}${path}`, {
      headers: { Host: `evil.example:${port}` },
    })).status, 403, `bad Host rejected without Origin for ${path}`);
    assert.equal((await fetch(`${base}${path}`, {
      headers: { Host: `evil.example:${port}`, Origin: `http://evil.example:${port}` },
    })).status, 403, `bad Host rejected for ${path}`);
  }
  assert.equal((await fetch(`${base}/..%2fcli.js`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}/ws`, {
    headers: {
      Origin: "https://evil.example", Connection: "Upgrade", Upgrade: "websocket",
      "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  })).status, 403);
  assert.equal((await fetch(`${base}/ws`, {
    headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" },
  })).status, 401, "WebSocket requires the token");
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { Cookie: cookie } } as unknown as string[]);
    const timer = setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, 3000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS failed")); };
  });
  assert.equal(await Bun.file(marker).exists(), false, "--no-open suppresses browser");
  console.log("PASS: --help, --version, unknown flags, --port, --no-open, launch-token link + help page, security headers, HTML + asset, REST + /api, WebSocket, Host + origin rejection, traversal rejection, arbitrary cwd");
} finally {
  child.kill();
  await child.exited;
  await rm(dir, { recursive: true, force: true });
}
