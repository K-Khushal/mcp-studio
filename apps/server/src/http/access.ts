import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Launch token access (ADR-0007): every route except the OAuth callback requires the per-launch
 * token, either as the port-scoped HttpOnly cookie set by the printed link or as a bearer header.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

/**
 * `STUDIO_TOKEN` wins (tests, scripts); `STUDIO_DEV_TOKEN_FILE` keeps one token across
 * `bun --watch` restarts in development; otherwise a fresh random token per launch.
 */
export function resolveToken(env: Record<string, string | undefined>): string {
  const configured = env["STUDIO_TOKEN"];
  if (configured) {
    if (!TOKEN_PATTERN.test(configured)) throw new Error("STUDIO_TOKEN must be at least 32 characters of A-Z, a-z, 0-9, _ or -");
    return configured;
  }
  const file = env["STUDIO_DEV_TOKEN_FILE"];
  if (file) {
    const saved = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
    if (TOKEN_PATTERN.test(saved)) return saved;
    const token = randomToken();
    writeFileSync(file, `${token}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    return token;
  }
  return randomToken();
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Cookies are not port-scoped, so the name carries the port to keep concurrent Studios apart. */
export function cookieName(port: number): string {
  return `mcp_studio_${port}`;
}

function matches(candidate: string | undefined, token: string): boolean {
  if (candidate === undefined) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorized(req: Request, token: string, port: number): boolean {
  const bearer = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (matches(bearer, token)) return true;
  const name = cookieName(port);
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name && matches(value.join("="), token)) return true;
  }
  return false;
}

/**
 * `GET <path>?token=<valid>`: set the cookie and redirect to the same URL without the token,
 * so it never stays in the address bar or history. Returns null when there is no valid token.
 */
export function exchangeToken(req: Request, url: URL, token: string, port: number, appOrigin = ""): Response | null {
  if (req.method !== "GET" || !matches(url.searchParams.get("token") ?? undefined, token)) return null;
  const target = new URL(url);
  target.searchParams.delete("token");
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${appOrigin}${target.pathname}${target.search}`,
      "Set-Cookie": `${cookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`,
      "Cache-Control": "no-store",
    },
  });
}

const HELP_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Studio</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { display: grid; place-items: center; min-height: 100vh; margin: 0; }
  main { max-width: 32rem; padding: 2rem; line-height: 1.5; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<main>
<h1>Open MCP Studio from your terminal</h1>
<p>This Studio Server only accepts the browser it opened. Open the link printed in the terminal where you started <code>mcp-studio</code> (it looks like <code>http://localhost:3000/?token=…</code>).</p>
<p>Restarted MCP Studio? Each launch prints a new link.</p>
</main>
</body>
</html>
`;

/** What a browser sees without a valid token: no app shell, no data, no script. */
export function helpPage(): Response {
  return new Response(HELP_PAGE, {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function unauthorized(): Response {
  return new Response("Unauthorized: open the link printed in the terminal, or send Authorization: Bearer <token>", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "WWW-Authenticate": "Bearer" },
  });
}

/** Browser navigations get the help page; API clients get a plain 401. */
export function denied(req: Request, pathname: string): Response {
  const navigation = req.method === "GET" && (req.headers.get("Accept")?.includes("text/html") || pathname === "/" || pathname.endsWith(".html"));
  return navigation ? helpPage() : unauthorized();
}
