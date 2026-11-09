import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { version } from "../../../../package.json";

for (const flag of ["--help", "--version", "--unknown"]) {
  test(`CLI ${flag} exits without starting the Studio Server`, async () => {
    const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../cli.ts"), flag], {
      env: { ...process.env, STUDIO_DB_PATH: ":memory:" }, stdout: "pipe", stderr: "pipe",
    });
    const output = await new Response(child.stdout).text() + await new Response(child.stderr).text();
    expect(await child.exited).toBe(flag === "--unknown" ? 1 : 0);
    if (flag === "--version") expect(output.trim()).toBe(version);
    else for (const text of ["Usage:", "--port", "--no-open", "--help", "--version", "STUDIO_DB_PATH", "CORS_ORIGIN", "~/.mcp-studio/studio.db"]) expect(output).toContain(text);
  });
}

test("CLI --help documents the Launch token", async () => {
  const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../cli.ts"), "--help"], { stdout: "pipe" });
  const output = await new Response(child.stdout).text();
  for (const text of ["?token=", "STUDIO_TOKEN", "Authorization: Bearer"]) expect(output).toContain(text);
});

test("CLI prints a link with a fresh Launch token that unlocks the Studio Server", async () => {
  const launch = async () => {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = probe.port!;
    await probe.stop(true);
    const env: Record<string, string | undefined> = { ...process.env, STUDIO_DB_PATH: ":memory:" };
    delete env["STUDIO_TOKEN"];
    const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../cli.ts"), "--port", String(port), "--no-open"], { env, stdout: "pipe", stderr: "pipe" });
    const reader = child.stdout.getReader();
    let output = "";
    let link: string | undefined;
    while (!link) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`CLI exited: ${output}`);
      output += new TextDecoder().decode(value);
      link = output.match(/MCP Studio: (http:\/\/localhost:\d+\/\?token=[A-Za-z0-9_-]{43})\n/)?.[1];
    }
    return { child, link, port };
  };
  const first = await launch();
  try {
    expect((await fetch(`http://localhost:${first.port}/collections`)).status).toBe(401);
    const opened = await fetch(first.link, { redirect: "manual" });
    expect(opened.status).toBe(303);
    const cookie = opened.headers.get("Set-Cookie")!.split(";")[0]!;
    expect((await fetch(`http://localhost:${first.port}/collections`, { headers: { Cookie: cookie } })).status).toBe(200);
    first.child.kill();
    await first.child.exited;
    const second = await launch();
    try {
      expect(second.link.split("token=")[1]).not.toBe(first.link.split("token=")[1]);
    } finally { second.child.kill(); await second.child.exited; }
  } finally { first.child.kill(); await first.child.exited; }
}, 15000);
