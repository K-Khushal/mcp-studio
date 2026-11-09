import { expect, test } from "bun:test";
import type { Collection, Connection, ConnectionConfig } from "@mcp-studio/types";
import { TEST_TOKEN } from "./helpers/studio-server.js";

test("STDIO fields round-trip through Connection create, patch and collection REST reads", async () => {
  const child = Bun.spawn([process.execPath, new URL("../index.ts", import.meta.url).pathname], {
    env: { ...process.env, STUDIO_DB_PATH: ":memory:", PORT: "0", STUDIO_TOKEN: TEST_TOKEN },
    stdout: "pipe", stderr: "pipe",
  });
  try {
    let output = "";
    let port: string | undefined;
    for await (const chunk of child.stdout) {
      output += new TextDecoder().decode(chunk);
      port = output.match(/Listening on port (\d+)/)?.[1];
      if (port) break;
    }
    if (!port) throw new Error(`Studio Server did not start: ${output}`);
    const request = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`http://localhost:${port}${path}`, {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(response.ok).toBe(true);
      return response.json();
    };
    const collection = await request("/collections", "POST", { name: "STDIO" }) as Collection;
    const path = `/collections/${collection.id}/connections`;
    const config: ConnectionConfig = {
      transport: "stdio",
      config: { command: "bun", args: ["server.ts", "argument with spaces"], cwd: "/tmp/mcp work", env: { TOKEN: "{{TOKEN}}", MODE: "dev" }, inheritSystemEnv: false },
    };
    const connection = await request(path, "POST", { name: "Local", connectionConfig: config }) as Connection;
    const read = async () => {
      const collections = await request("/collections") as Collection[];
      return collections[0]!.connections[0]!.connectionConfig;
    };
    expect(await read()).toEqual(config);
    const edited = { ...config, config: { ...config.config, command: "node", args: ["other.js"], cwd: "/tmp/other", env: { MODE: "prod" }, inheritSystemEnv: true } };
    await request(`${path}/${connection.id}`, "PATCH", { connectionConfig: edited });
    expect(await read()).toEqual(edited);
  } finally {
    child.kill();
    await child.exited;
  }
}, 10000);
