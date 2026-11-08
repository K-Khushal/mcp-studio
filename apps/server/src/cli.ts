#!/usr/bin/env bun
import { parseArgs } from "node:util";

try {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { port: { type: "string", default: "3000" }, "no-open": { type: "boolean" } },
    strict: true,
  });
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port!) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  process.env["PORT"] = String(port);
  process.env["STUDIO_PRODUCTION"] = "1";
  await import("./index.js");
  const url = `http://localhost:${port}`;
  console.log(`MCP Studio: ${url}`);
  if (!values["no-open"]) {
    const command = process.platform === "darwin" ? ["open", url]
      : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
    try {
      const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
      child.unref();
      void child.exited.then(code => {
        if (code !== 0) console.warn(`Open ${url} in your browser.`);
      });
    } catch { console.warn(`Open ${url} in your browser.`); }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
