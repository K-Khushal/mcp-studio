import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["apps/server/src/cli.ts"],
  outdir: "dist", target: "bun", minify: false,
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await cp("apps/web/dist", "dist/web", { recursive: true });
await cp("apps/server/drizzle", "dist/drizzle", { recursive: true });
