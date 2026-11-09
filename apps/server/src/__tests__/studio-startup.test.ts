import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveToken } from "../http/access.js";
import { parseExtraOrigin } from "../http/security.js";
import { failedStart, startStudioServer } from "./helpers/studio-server.js";

test("CORS_ORIGIN accepts only an exact http(s) origin", () => {
  for (const origin of ["http://localhost:5173", "https://studio.example", "http://127.0.0.1:8080"]) expect(parseExtraOrigin(origin)).toBe(origin);
  expect(parseExtraOrigin(undefined)).toBe("");
  expect(parseExtraOrigin("")).toBe("");
  for (const origin of ["null", "*", "localhost:5173", "http://localhost:5173/", "http://localhost:5173/app", "file:///tmp", "ws://localhost:5173", "http://user:pw@localhost:5173", "HTTP://LOCALHOST:5173"]) {
    expect(() => parseExtraOrigin(origin)).toThrow("CORS_ORIGIN must be an http(s) origin");
  }
});

test("an invalid CORS_ORIGIN stops the Studio Server from starting", async () => {
  const { code, output } = await failedStart({ CORS_ORIGIN: "null" });
  expect(code).not.toBe(0);
  expect(output).toContain("CORS_ORIGIN must be an http(s) origin");
});

test("a configured CORS_ORIGIN is admitted; foreign and null Origins are not", async () => {
  const studio = await startStudioServer({ STUDIO_PRODUCTION: "1", CORS_ORIGIN: "https://studio.example" });
  try {
    const status = async (origin: string) => (await studio.request("/collections", { headers: { Origin: origin } })).status;
    expect(await status("https://studio.example")).toBe(200);
    expect(await status("null")).toBe(403);
    expect(await status("https://evil.example")).toBe(403);
    expect(await status("http://localhost:5173")).toBe(403);
  } finally { await studio.stop(); }
});

test("a Host naming another port is rejected", async () => {
  const studio = await startStudioServer({ STUDIO_PRODUCTION: "1" });
  try {
    expect((await studio.request("/collections", { headers: { Host: "localhost:7" } })).status).toBe(403);
    expect((await studio.request("/collections", { headers: { Host: `localhost:${studio.port}` } })).status).toBe(200);
  } finally { await studio.stop(); }
});

test("a squatted IPv6 loopback port stops the Studio Server from starting", async () => {
  const squatter = Bun.serve({ hostname: "::1", port: 0, fetch: () => new Response("squatter") });
  try {
    const { code, output } = await failedStart({ PORT: String(squatter.port) });
    expect(code).not.toBe(0);
    expect(output).toContain("already in use on [::1]");
  } finally { await squatter.stop(true); }
});

test("STUDIO_TOKEN must be long and URL-safe", async () => {
  const { code, output } = await failedStart({ STUDIO_TOKEN: "short" });
  expect(code).not.toBe(0);
  expect(output).toContain("STUDIO_TOKEN must be at least 32 characters");
});

test("the development token file keeps one owner-only token across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studio-dev-token-"));
  try {
    const file = join(directory, ".dev-token");
    const first = resolveToken({ STUDIO_DEV_TOKEN_FILE: file });
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await chmod(file, 0o644);
    expect(resolveToken({ STUDIO_DEV_TOKEN_FILE: file })).toBe(first);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(resolveToken({})).not.toBe(first);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
