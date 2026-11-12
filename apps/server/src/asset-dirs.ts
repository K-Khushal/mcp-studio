import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/** Release binaries extract assets to `<tmp>/mcp-studio-assets-*` and record their pid in `.pid`. */
export const ASSET_DIR_PREFIX = "mcp-studio-assets-";
export const ASSET_DIR_PID_FILE = ".pid";
const UNOWNED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as { code?: string }).code === "EPERM"; }
}

/** Removes asset directories left by killed binaries: dead owner, or no owner and older than a day. */
export function sweepStaleAssetDirs(directory: string, now = Date.now()): void {
  let names: string[];
  try { names = readdirSync(directory); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(ASSET_DIR_PREFIX)) continue;
    const path = join(directory, name);
    try {
      let pid = NaN;
      try { pid = Number(readFileSync(join(path, ASSET_DIR_PID_FILE), "utf8").trim()); } catch { /* unowned */ }
      const stale = Number.isInteger(pid) && pid > 0
        ? pid !== process.pid && !alive(pid)
        : now - statSync(path).mtimeMs > UNOWNED_MAX_AGE_MS;
      if (stale) rmSync(path, { recursive: true, force: true });
    } catch { /* raced with its owner or another sweep */ }
  }
}
