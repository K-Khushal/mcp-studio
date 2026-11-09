/**
 * Response hardening shared by every Studio Server response (ADR-0007).
 * `'unsafe-eval'` stays until output-schema validation stops compiling with `new Function` (Ajv).
 * Styles allow inline because Radix and Sonner inject <style> elements at runtime.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "media-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function withSecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

/**
 * `CORS_ORIGIN` admits one extra browser Origin with full control-plane access, so it must be an
 * exact http(s) Origin: no `null`, wildcard, path, credentials or other scheme.
 */
export function parseExtraOrigin(value: string | undefined): string {
  if (value === undefined || value === "") return "";
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`CORS_ORIGIN must be an http(s) origin like http://localhost:5173, got ${JSON.stringify(value)}`); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== value) {
    throw new Error(`CORS_ORIGIN must be an http(s) origin like http://localhost:5173, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Thrown by route handlers for a malformed request; answered with a 400 instead of a 500. */
export class BadRequest extends Error {}

export async function readJsonObject<T>(req: Request): Promise<T> {
  let body: unknown;
  try { body = await req.json(); } catch { throw new BadRequest("Request body must be JSON"); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequest("Request body must be a JSON object");
  return body as T;
}
