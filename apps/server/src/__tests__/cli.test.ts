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
