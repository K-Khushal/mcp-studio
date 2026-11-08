import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClientMessage } from "@mcp-studio/types";
import { SessionHarness } from "./fixtures/session-harness";

const runtimeServer = new URL("./fixtures/runtime-server.ts", import.meta.url).pathname;

const stdio = (config: Partial<Extract<ClientMessage, { transport: "stdio" }>["config"]>): ClientMessage => ({
  type: "connect", transport: "stdio",
  config: { command: process.execPath, args: [runtimeServer], env: {}, inheritSystemEnv: false, ...config },
});

async function probe(message: ClientMessage) {
  const session = new SessionHarness();
  try {
    await session.send(message);
    await session.waitFor("connected");
    await session.send({ type: "invoke", tool: "runtime", params: {} });
    const result = await session.waitFor("result");
    const content = (result.data as { content: { text: string }[] }).content;
    return JSON.parse(content[0]!.text) as { cwd: string; env: Record<string, string | undefined>; args: string[] };
  } finally { await session.close(); }
}

test("STDIO cwd, args and env reach the subprocess", async () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "studio-cwd-")));
  try {
    const seen = await probe(stdio({ cwd, args: [runtimeServer, "--fixture", "value with spaces"], env: { STUDIO_FIXTURE_VAR: "from-connection" } }));
    expect(seen.cwd).toBe(cwd);
    expect(seen.args).toEqual(["--fixture", "value with spaces"]);
    expect(seen.env.STUDIO_FIXTURE_VAR).toBe("from-connection");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("inheritSystemEnv=false hides the Studio Server environment; true merges it under Connection env", async () => {
  process.env.STUDIO_PARENT_VAR = "from-parent";
  process.env.STUDIO_SHADOWED_VAR = "parent-value";
  try {
    const isolated = await probe(stdio({ env: { STUDIO_FIXTURE_VAR: "x" }, inheritSystemEnv: false }));
    expect(isolated.env.STUDIO_PARENT_VAR).toBeUndefined();
    expect(isolated.env.STUDIO_FIXTURE_VAR).toBe("x");

    const merged = await probe(stdio({ env: { STUDIO_SHADOWED_VAR: "connection-value" }, inheritSystemEnv: true }));
    expect(merged.env.STUDIO_PARENT_VAR).toBe("from-parent");
    expect(merged.env.STUDIO_SHADOWED_VAR).toBe("connection-value");
  } finally {
    delete process.env.STUDIO_PARENT_VAR;
    delete process.env.STUDIO_SHADOWED_VAR;
  }
});
