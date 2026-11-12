import { closeSync, constants, lstatSync, mkdirSync, openSync, readdirSync, readSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Release binaries extract assets to `<private base>/mcp-studio-assets-*` and record their pid in `.pid`. */
export const ASSET_DIR_PREFIX = "mcp-studio-assets-";
export const ASSET_DIR_PID_FILE = ".pid";
const UNOWNED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Owned by this user, a real directory (not a symlink) and closed to other users. POSIX only: without a uid nothing is trusted. */
function ownDirectory(path: string, requirePrivate: boolean): boolean {
  const uid = process.getuid?.();
  if (uid === undefined) return false;
  const stat = lstatSync(path);
  return stat.isDirectory() && stat.uid === uid && (!requirePrivate || (stat.mode & 0o077) === 0);
}

/**
 * Per-user 0700 base under the shared temp dir, so other local users cannot plant entries the sweep
 * would read. Returns null when privacy cannot be established (not ours, not private, or no uid such
 * as on Windows); callers then extract to a fresh mkdtemp dir and skip sweeping.
 */
export function privateAssetBase(directory = tmpdir()): string | null {
  const uid = process.getuid?.();
  if (uid === undefined) return null;
  const base = join(directory, `mcp-studio-${uid}`);
  try { mkdirSync(base, { mode: 0o700 }); } catch (error) { if ((error as { code?: string }).code !== "EEXIST") return null; }
  try { return ownDirectory(base, true) ? base : null; } catch { return null; }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as { code?: string }).code === "EPERM"; }
}

/** Reads a small regular pid marker without following symlinks or blocking on FIFOs. */
function readPid(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 32) return NaN;
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const buffer = Buffer.alloc(32);
    return Number(buffer.toString("utf8", 0, readSync(fd, buffer, 0, 32, 0)).trim());
  } finally { closeSync(fd); }
}

/** Removes our asset directories left by killed binaries: dead owner, or no owner and older than a day. */
export function sweepStaleAssetDirs(directory: string, now = Date.now()): void {
  let names: string[];
  try { names = readdirSync(directory); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(ASSET_DIR_PREFIX)) continue;
    const path = join(directory, name);
    try {
      if (!ownDirectory(path, false)) continue;
      let pid = NaN;
      try { pid = readPid(join(path, ASSET_DIR_PID_FILE)); } catch { /* unowned */ }
      const stale = Number.isInteger(pid) && pid > 0
        ? pid !== process.pid && !alive(pid)
        : now - lstatSync(path).mtimeMs > UNOWNED_MAX_AGE_MS;
      if (stale) rmSync(path, { recursive: true, force: true });
    } catch { /* raced with its owner or another sweep */ }
  }
}
