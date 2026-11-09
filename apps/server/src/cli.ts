#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { version } from "../../../package.json";

const usage = `Usage: mcp-studio [options]

  --port N       Studio Server port (default: 3000)
  --no-open      Do not open the browser
  --help         Show this help
  --version      Print the package version

Each launch prints a link like http://localhost:3000/?token=<launch token>
and opens it. The Studio Server only answers browsers that opened that link
(they get a cookie) and scripts that send Authorization: Bearer <launch token>.
Other tabs see a page asking for the printed link.

Environment:
  STUDIO_DB_PATH  Database path (default: ~/.mcp-studio/studio.db)
  STUDIO_TOKEN    Fixed Launch token for scripts (default: random per launch)
  CORS_ORIGIN     Additional allowed browser origin (exact http(s) origin);
                  it gets full Studio access, including launching commands
`;

try {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { port: { type: "string", default: "3000" }, "no-open": { type: "boolean" }, help: { type: "boolean" }, version: { type: "boolean" } },
    strict: true,
  });
  if (values.help) { console.log(usage); process.exit(0); }
  if (values.version) { console.log(version); process.exit(0); }
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port!) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  process.env["PORT"] = String(port);
  process.env["STUDIO_PRODUCTION"] = "1";
  const studio = await import("./index.js");
  const url = `http://localhost:${studio.port}/?token=${studio.token}`;
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
  console.error(usage);
  process.exit(1);
}
