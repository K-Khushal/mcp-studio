import { expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSET_DIR_PID_FILE, ASSET_DIR_PREFIX, privateAssetBase, sweepStaleAssetDirs } from "../asset-dirs.js";

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

test("never follows symlinks or blocks on a FIFO marker", async () => {
  const base = await mkdtemp(join(tmpdir(), "studio-sweep-"));
  try {
    const victim = await mkdtemp(join(tmpdir(), "studio-victim-"));
    await symlink(victim, join(base, `${ASSET_DIR_PREFIX}link`));
    await mkdir(join(base, `${ASSET_DIR_PREFIX}fifo`));
    const mkfifo = Bun.spawnSync(["mkfifo", join(base, `${ASSET_DIR_PREFIX}fifo`, ASSET_DIR_PID_FILE)]);
    expect(mkfifo.exitCode).toBe(0);
    const started = Date.now();
    sweepStaleAssetDirs(base);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect((await readdir(base)).sort()).toEqual([`${ASSET_DIR_PREFIX}fifo`, `${ASSET_DIR_PREFIX}link`]);
    expect((await lstat(victim)).isDirectory()).toBe(true);
    await rm(victim, { recursive: true, force: true });
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("uses a private per-user base and refuses one other users can write", async () => {
  const parent = await mkdtemp(join(tmpdir(), "studio-base-"));
  try {
    const base = privateAssetBase(parent)!;
    expect(base).toBeTruthy();
    expect((await lstat(base)).mode & 0o777).toBe(0o700);
    await chmod(base, 0o777);
    expect(privateAssetBase(parent)).toBeNull();
  } finally { await rm(parent, { recursive: true, force: true }); }
});
