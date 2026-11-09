import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const entry = new URL("../db/index.ts", import.meta.url).pathname;

test("OAuth database and its directory are private, including an existing database", () => {
  const home = mkdtempSync(join(tmpdir(), "studio-db-permissions-"));
  const path = join(home, ".mcp-studio", "studio.db");
  try {
    const open = () => spawnSync(process.execPath, ["-e", `import ${JSON.stringify(entry)}`], {
      env: { ...process.env, HOME: home, STUDIO_DB_PATH: path }, encoding: "utf8",
    });
    expect(open().status).toBe(0);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    chmodSync(path, 0o644);
    expect(open().status).toBe(0);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an in-memory database creates no directory in the user's home", () => {
  const home = mkdtempSync(join(tmpdir(), "studio-memory-db-"));
  try {
    const result = spawnSync(process.execPath, ["-e", `import ${JSON.stringify(entry)}`], {
      env: { ...process.env, HOME: home, STUDIO_DB_PATH: ":memory:" }, encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(home, ".mcp-studio"))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
