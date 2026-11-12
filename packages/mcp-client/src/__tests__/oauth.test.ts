import { describe, expect, test } from "vitest";
import { redactOAuthValue, revokeOAuthTokens, StudioOAuthProvider } from "../oauth.js";

describe("OAuth error redaction", () => {
  for (const name of ["AbortError", "TimeoutError"]) {
    test(`redacts ${name} into a readable Error without modifying the source`, () => {
      const original = new DOMException("private-token failed", name);
      Object.defineProperty(original, "code", { value: "private-token-code", enumerable: true });
      const redacted = redactOAuthValue(original, new Set(["private-token"]));
      expect(redacted).toBeInstanceOf(Error);
      expect(redacted.message).toBe("[REDACTED] failed");
      expect(redacted.name).toBe(name);
      expect(redacted.code).toBe("private-token-code");
      expect(original.message).toBe("private-token failed");
    });
  }
});

test("redacts cyclic Error causes without recursion or exposing secrets", () => {
  const first = new Error("private-token failed");
  const second = new Error("private-token cause", { cause: first });
  first.cause = second;
  const redacted = redactOAuthValue(first, new Set(["private-token"]));
  expect(redacted.message).toBe("[REDACTED] failed");
  expect(redacted.cause).toMatchObject({ message: "[REDACTED] cause", cause: "[Circular]" });
  expect(first.cause).toBe(second);
});

test("diagnostics redact JSON-escaped and URL-encoded credential values, including malformed Unicode", () => {
  const secret = 'private\n"credential';
  const unusual = "private-\uD800";
  const original = { text: JSON.stringify({ data: secret }), url: `https://example.test/?key=${encodeURIComponent(secret)}`, unusual };
  const redacted = redactOAuthValue(original, new Set([secret, unusual]));
  expect(redacted.text).not.toContain("credential");
  expect(redacted.url).toBe("https://example.test/?key=[REDACTED]");
  expect(redacted.unusual).toBe("[REDACTED]");
  expect(original.unusual).toBe(unusual);
});

test.each(["ms-settings:privacy", "ftp://example.com/authorize", "http://auth.example.com/authorize", "http://127.evil.test/authorize"])("refuses unsafe authorization URL %s before browser approval", (url) => {
  const provider = new StudioOAuthProvider({ redirectUrl: "http://localhost/callback", storage: { load: async () => ({}), save: async () => {} }, authorize: async () => "code" });
  provider.state();
  expect(() => provider.redirectToAuthorization(new URL(url))).toThrow("OAuth sign-in requires HTTPS");
});

test("permits HTTP approval on a localhost subdomain", () => {
  const provider = new StudioOAuthProvider({ redirectUrl: "http://localhost/callback", storage: { load: async () => ({}), save: async () => {} }, authorize: async () => "code" });
  provider.state();
  expect(() => provider.redirectToAuthorization(new URL("http://auth.localhost/authorize"))).not.toThrow();
});

describe("RFC 7009 revocation", () => {
  const origin = "http://127.0.0.1:9";
  const server = (metadata: Record<string, unknown>, requests: Request[]) => async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/.well-known/oauth-protected-resource/mcp") return Response.json({ resource: `${origin}/mcp`, authorization_servers: [origin] });
    if (path === "/.well-known/oauth-authorization-server") return Response.json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, response_types_supported: ["code"], ...metadata });
    if (path === "/revoke") { requests.push(request); return new Response(null, { status: 200 }); }
    return new Response("Not found", { status: 404 });
  };

  test("authenticates a confidential client with HTTP Basic and revokes refresh before access", async () => {
    const requests: Request[] = [];
    const outcome = await revokeOAuthTokens(`${origin}/mcp`, { tokens: { access_token: "at", refresh_token: "rt", token_type: "Bearer", issuer: origin }, clientInformation: { client_id: "id", client_secret: "secret", issuer: origin } } as never,
      { fetchFn: server({ revocation_endpoint: `${origin}/revoke`, revocation_endpoint_auth_methods_supported: ["client_secret_basic"] }, requests) });
    expect(outcome).toBe("revoked");
    expect(requests.map(r => r.headers.get("authorization"))).toEqual([`Basic ${btoa("id:secret")}`, `Basic ${btoa("id:secret")}`]);
    expect(await Promise.all(requests.map(async r => Object.fromEntries(new URLSearchParams(await r.text()))))).toEqual([
      { token: "rt", token_type_hint: "refresh_token" }, { token: "at", token_type_hint: "access_token" },
    ]);
  });

  test("reports unsupported without a revocation_endpoint, and none without tokens", async () => {
    const requests: Request[] = [];
    expect(await revokeOAuthTokens(`${origin}/mcp`, { tokens: { access_token: "at", token_type: "Bearer", issuer: origin } } as never, { fetchFn: server({}, requests) })).toBe("unsupported");
    expect(await revokeOAuthTokens(`${origin}/mcp`, { clientInformation: { client_id: "id" } }, { fetchFn: server({}, requests) })).toBe("none");
    expect(requests).toEqual([]);
  });

  test("refuses a revocation endpoint on a private address for a public MCP Server", async () => {
    const requests: Request[] = [];
    const outcome = await revokeOAuthTokens("https://8.8.8.8/mcp", { tokens: { access_token: "at", token_type: "Bearer", issuer: "https://8.8.8.8/" } } as never,
      { fetchFn: async (input, init) => (new URL(new Request(input, init).url).pathname === "/revoke" ? server({}, requests)(input, init) : Response.json({ issuer: "https://8.8.8.8", authorization_endpoint: "https://8.8.8.8/a", token_endpoint: "https://8.8.8.8/t", response_types_supported: ["code"], revocation_endpoint: `${origin}/revoke` })) });
    expect(outcome).toBe("failed");
    expect(requests).toEqual([]);
  });

  test("sends nothing when discovery now names a different authorization server than the credentials' issuer", async () => {
    const requests: Request[] = [];
    const revocation = { revocation_endpoint: `${origin}/revoke` };
    const credentials = (issuer?: string) => ({ tokens: { access_token: "at", refresh_token: "rt", token_type: "Bearer", ...(issuer ? { issuer } : {}) }, clientInformation: { client_id: "id", client_secret: "secret", issuer: origin } }) as never;
    expect(await revokeOAuthTokens(`${origin}/mcp`, credentials("https://old-as.example"), { fetchFn: server(revocation, requests) })).toBe("unsupported");
    expect(await revokeOAuthTokens(`${origin}/mcp`, credentials(), { fetchFn: server(revocation, requests) })).toBe("unsupported");
    expect(await revokeOAuthTokens(`${origin}/mcp`, { tokens: { access_token: "at", token_type: "Bearer", issuer: origin }, clientInformation: { client_id: "id", issuer: "https://old-as.example" } } as never, { fetchFn: server(revocation, requests) })).toBe("unsupported");
    expect(requests).toEqual([]);
  });

  test("never posts tokens to a plain-HTTP revocation endpoint on a public host", async () => {
    const requests: Request[] = [];
    const as = "https://mcp.example";
    const outcome = await revokeOAuthTokens(`${as}/mcp`, { tokens: { access_token: "at", token_type: "Bearer", issuer: `${as}/` } } as never, {
      fetchFn: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).hostname === "8.8.8.8") { requests.push(request); return new Response(null, { status: 200 }); }
        if (new URL(request.url).pathname.startsWith("/.well-known/oauth-authorization-server")) return Response.json({ issuer: as, authorization_endpoint: `${as}/a`, token_endpoint: `${as}/t`, response_types_supported: ["code"], revocation_endpoint: "http://8.8.8.8/revoke" });
        return new Response("Not found", { status: 404 });
      },
    });
    expect(outcome).toBe("failed");
    expect(requests).toEqual([]);
  });
});
