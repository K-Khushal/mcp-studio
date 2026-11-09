import { expect, test } from "vitest";
import { redactDiagnosticValue, rememberConnectionSecrets } from "../diagnostics.js";

test("diagnostic copies preserve protocol keys, routing fields and schema properties", () => {
  const frame = { id: "private-value", method: "private-value", _meta: { progressToken: "private-value" },
    result: { tools: [{ inputSchema: { properties: { token: { type: "string" }, password: { type: "string" } } } }],
      max_tokens: 40, input_tokens: 20, token_count: 2, access_token: "unknown-secret", text: "prefix private-value suffix" } };
  expect(redactDiagnosticValue(frame, new Set(["private-value"]))).toEqual({ ...frame,
    result: { ...frame.result, access_token: "[REDACTED]", text: "prefix [REDACTED] suffix" } });
});

test("connection registration accepts plausible credentials and auth schemes only", () => {
  const secrets = new Set<string>();
  rememberConnectionSecrets({ transport: "http", config: { url: "http://localhost",
    headers: { Accept: "application/json", Host: "localhost", "X-Custom": "Basic encoded-credential", "X-Token": "abcd", "X-Secret": "{{TOKEN}}" } } }, secrets);
  rememberConnectionSecrets({ transport: "stdio", config: { command: "test", args: [], inheritSystemEnv: false, env: {
    COUNT: "1", DEBUG: "true", SHORT_TOKEN: "12345678", OTHER: "ordinary-value", PASSWORD: "pass", AUTH: "token another-credential",
  } } }, secrets);
  expect([...secrets].sort()).toEqual(["Basic encoded-credential", "abcd", "another-credential", "encoded-credential", "pass", "token another-credential"].sort());
});
