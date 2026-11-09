import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_TOKEN = "test-token-0123456789abcdefghijklmnop";

export interface StudioServer {
  port: number;
  base: string;
  output(): string;
  /** fetch against the running Studio Server; `auth: false` omits the bearer token. */
  request(path: string, init?: RequestInit & { auth?: boolean }): Promise<Response>;
  alive(): boolean;
  stop(): Promise<void>;
}

/**
 * Spawns `src/index.ts` like the CLI does. Production mode serves a throwaway web root
 * (`index.html` + one asset) so static routes can be exercised without a web build.
 */
export async function startStudioServer(env: Record<string, string> = {}): Promise<StudioServer> {
  const resources = await mkdtemp(join(tmpdir(), "studio-test-web-"));
  await mkdir(join(resources, "web", "assets"), { recursive: true });
  await Bun.write(join(resources, "web", "index.html"), "<!doctype html><html><body>STUDIO_APP_SHELL</body></html>");
  await Bun.write(join(resources, "web", "assets", "app.js"), "console.log('app')");
  await symlink(new URL("../../../drizzle", import.meta.url).pathname, join(resources, "drizzle"));
  const child = Bun.spawn([process.execPath, new URL("../../index.ts", import.meta.url).pathname], {
    env: { ...process.env, STUDIO_DB_PATH: ":memory:", PORT: "0", STUDIO_TOKEN: TEST_TOKEN, STUDIO_RESOURCE_DIR: resources, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  let output = "";
  void new Response(child.stderr).text().then(text => { output += text; });
  const reader = child.stdout.getReader();
  let port: string | undefined;
  while (!port) {
    const { value, done } = await reader.read();
    if (done) {
      await child.exited;
      await rm(resources, { recursive: true, force: true });
      throw new Error(`Studio Server exited (${child.exitCode}): ${output}`);
    }
    output += new TextDecoder().decode(value);
    port = output.match(/Listening on port (\d+)/)?.[1];
  }
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      output += new TextDecoder().decode(value);
    }
  })();
  const base = `http://localhost:${port}`;
  return {
    port: Number(port),
    base,
    output: () => output,
    request(path, { auth = true, headers, ...init } = {}) {
      return fetch(`${base}${path}`, {
        redirect: "manual",
        ...init,
        headers: { ...(auth ? { Authorization: `Bearer ${TEST_TOKEN}` } : {}), ...headers as Record<string, string> },
      });
    },
    alive: () => child.exitCode === null,
    async stop() {
      child.kill();
      await child.exited;
      await rm(resources, { recursive: true, force: true });
    },
  };
}

/** Spawns the Studio Server expecting it to refuse to start; resolves with its exit code and output. */
export async function failedStart(env: Record<string, string>): Promise<{ code: number; output: string }> {
  const child = Bun.spawn([process.execPath, new URL("../../index.ts", import.meta.url).pathname], {
    env: { ...process.env, STUDIO_DB_PATH: ":memory:", PORT: "0", STUDIO_TOKEN: TEST_TOKEN, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), 5000);
  const output = await new Response(child.stdout).text() + await new Response(child.stderr).text();
  clearTimeout(timer);
  return { code: await child.exited, output };
}
