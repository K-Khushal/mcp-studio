import { describe, expect, test } from "vitest";
import { redactOAuthValue, StudioOAuthProvider } from "../oauth.js";

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
