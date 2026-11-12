import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSET_DIR_PID_FILE, ASSET_DIR_PREFIX, sweepStaleAssetDirs } from "../asset-dirs.js";

test("sweeps asset dirs whose binary was killed and keeps live or recent ones", async () => {
  const base = await mkdtemp(join(tmpdir(), "studio-sweep-"));
  try {
    const dead = Bun.spawn(["true"]);
    await dead.exited;
    const day = 24 * 60 * 60 * 1000;
    const dirs: Record<string, string | null> = { dead: String(dead.pid), live: String(process.pid), unownedOld: null, unownedNew: null };
    for (const [name, pid] of Object.entries(dirs)) {
      await mkdir(join(base, `${ASSET_DIR_PREFIX}${name}`, "web"), { recursive: true });
      if (pid) await writeFile(join(base, `${ASSET_DIR_PREFIX}${name}`, ASSET_DIR_PID_FILE), pid);
    }
    await mkdir(join(base, "other-dir"));
    const old = new Date(Date.now() - 2 * day);
    await utimes(join(base, `${ASSET_DIR_PREFIX}unownedOld`), old, old);
    sweepStaleAssetDirs(base);
    expect((await readdir(base)).sort()).toEqual([`${ASSET_DIR_PREFIX}live`, `${ASSET_DIR_PREFIX}unownedNew`, "other-dir"]);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("STUDIO_RESOURCE_DIR is read once and not passed on to child processes", async () => {
  const child = Bun.spawn([process.execPath, "-e", `
    const { resourceDir } = await import(${JSON.stringify(new URL("../resources.ts", import.meta.url).pathname)});
    // The MCP SDK spawns STDIO servers through node:child_process.
    const inherited = (await import("node:child_process")).execFileSync("env").toString();
    console.log(JSON.stringify({ resourceDir, inherited: inherited.includes("STUDIO_RESOURCE_DIR") }));
  `], { env: { ...process.env, STUDIO_RESOURCE_DIR: "/tmp/studio-assets" }, stdout: "pipe" });
  expect(JSON.parse(await new Response(child.stdout).text())).toEqual({ resourceDir: "/tmp/studio-assets", inherited: false });
});
