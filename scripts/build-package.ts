import { cp, mkdir, rm } from "node:fs/promises";

// Start clean so stale web bundles or local standalone binaries never reach the npm tarball.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["apps/server/src/cli.ts"],
  outdir: "dist", target: "bun", minify: false,
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await cp("apps/web/dist", "dist/web", { recursive: true });
await cp("apps/server/drizzle", "dist/drizzle", { recursive: true });
