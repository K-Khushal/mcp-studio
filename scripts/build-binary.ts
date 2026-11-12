import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

// Generate static file imports so Bun embeds every web asset and migration.
const target = process.argv[2] ?? `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const supported = ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64", "bun-darwin-x64", "bun-windows-x64"];
if (!supported.includes(target)) throw new Error(`Unsupported target: ${target}`);
const outfile = resolve(process.argv[3] ?? `dist/mcp-studio-${target.slice(4)}${target.includes("windows") ? ".exe" : ""}`);
await mkdir("dist", { recursive: true });
const generated = await mkdtemp(resolve("dist/.binary-"));
try {
  const imports: string[] = [];
  const files: string[] = [];
  for (const [source, destination] of [["apps/web/dist", "web"], ["apps/server/drizzle", "drizzle"]]) {
    for await (const path of new Bun.Glob("**/*").scan({ cwd: source!, onlyFiles: true })) {
      const id = `asset${imports.length}`;
      imports.push(`import ${id} from ${JSON.stringify(resolve(source!, path))} with { type: "file" };`);
      files.push(`[${JSON.stringify(`${destination}/${path.replaceAll("\\", "/")}`)}, ${id}]`);
    }
  }
  if (!files.length) throw new Error("Build web assets before compiling");
  const entry = join(generated, "entry.ts");
  await Bun.write(entry, `${imports.join("\n")}
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { ASSET_DIR_PID_FILE, ASSET_DIR_PREFIX, sweepStaleAssetDirs } from ${JSON.stringify(resolve("apps/server/src/asset-dirs.ts"))};
sweepStaleAssetDirs(tmpdir());
const root = mkdtempSync(join(tmpdir(), ASSET_DIR_PREFIX));
writeFileSync(join(root, ASSET_DIR_PID_FILE), String(process.pid));
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));
for (const [name, embedded] of [${files.join(",\n")}]) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, Bun.file(embedded));
}
process.env["STUDIO_RESOURCE_DIR"] = root;
await import(${JSON.stringify(resolve("apps/server/src/cli.ts"))});
`);
  const child = Bun.spawn([process.execPath, "build", "--compile", `--target=${target}`, entry, "--outfile", outfile], {
    stdout: "inherit", stderr: "inherit",
  });
  if (await child.exited !== 0) throw new Error("Binary build failed");
} finally {
  await rm(generated, { recursive: true, force: true });
}
