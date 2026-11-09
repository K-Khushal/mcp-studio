import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/** Launch token access (ADR-0007): REST uses Bearer headers; browsers authenticate WS by subprotocol. */

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
    if (existsSync(file)) chmodSync(file, 0o600);
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

/** Expire the pre-origin-credential cookie, including its HttpOnly flag. Never use it for access. */
export function clearLegacyCookie(response: Response, port: number, request: Request): Response {
  const carriesCookie = request.headers.get("Cookie")?.split(";").some(entry => entry.trim().split("=")[0] === `mcp_studio_${port}`);
  if (!carriesCookie) return response;
  response.headers.append("Set-Cookie", `mcp_studio_${port}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/`);
  return response;
}

function matches(candidate: string | undefined, token: string): boolean {
  if (candidate === undefined) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorized(req: Request, token: string): boolean {
  const bearer = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  return matches(bearer, token);
}

/** Browser handshake credentials are offered as protocols; only the non-secret protocol is echoed. */
export function hasWebSocketToken(req: Request, token: string): boolean {
  const protocols = (req.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map(value => value.trim());
  return protocols.includes("mcp-studio") && protocols.some(value => value.startsWith("token.") && matches(value.slice(6), token));
}

export function unauthorized(): Response {
  return new Response("Unauthorized: open the link printed in the terminal, or send Authorization: Bearer <token>", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "WWW-Authenticate": "Bearer" },
  });
}
