import type { ConnectionConfig } from "@mcp-studio/types";

/** Conservative field matching applies only to diagnostic copies. */
export function isCredentialKey(key: string): boolean {
  return /authorization|cookie|api[-_]?key|token|secret|password|passwd|credential/i.test(key);
}

/** Register only plausible values, after interpolation. */
export function rememberDiagnosticSecret(value: string | undefined, secrets: Set<string>, credential = false): void {
  if (!value || value.includes("{{") || /^(?:\d+|true|false)$/i.test(value) || value.length < (credential ? 4 : 8)) return;
  secrets.add(value);
  const token = /^(?:Bearer|Basic|token)\s+(.+)$/i.exec(value)?.[1];
  if (token) rememberDiagnosticSecret(token, secrets, true);
}

/** Remember credentials before connecting so startup failures can be sanitized. */
export function rememberConnectionSecrets(connection: ConnectionConfig, secrets: Set<string>): void {
  const remember = (value: string | undefined) => rememberDiagnosticSecret(value, secrets, true);
  const named = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (isCredentialKey(key) || /^(?:Bearer|Basic|token)\s+/i.test(value ?? "")) remember(value);
    }
  };
  if (connection.transport === "stdio") {
    named(connection.config.env ?? {});
    if (connection.config.inheritSystemEnv) named(process.env);
  } else {
    const { auth, headers, url } = connection.config;
    named(headers ?? {});
    if (auth?.type === "bearer") remember(auth.token);
    if (auth?.type === "apikey") remember(auth.value);
    try {
      const parsed = new URL(url);
      remember(decodeURIComponent(parsed.username));
      remember(decodeURIComponent(parsed.password));
      parsed.searchParams.forEach((value, key) => { if (isCredentialKey(key) || (auth?.type === "apikey" && auth.in === "query" && auth.key === key)) remember(value); });
    } catch { /* A malformed URL is reported by the transport. */ }
  }
}

const envelopeKeys = new Set(["type", "requestId", "level", "source", "status", "code", "timestamp", "id", "method", "protocolVersion"]);
const credentialFields = new Set(["access_token", "refresh_token", "id_token", "client_secret", "password"]);
const patterns = new WeakMap<ReadonlySet<string>, { values: string[]; pattern: RegExp | null }>();

/** Clone log data while redacting secrets; wire frames and Call results stay intact. */
export function redactDiagnosticValue<T>(value: T, secrets: ReadonlySet<string>, headers = false): T {
  const snapshot = [...secrets];
  let cached = patterns.get(secrets);
  if (!cached || cached.values.length !== snapshot.length || cached.values.some((value, i) => value !== snapshot[i])) {
    const variants = snapshot.filter(Boolean).flatMap(secret => {
      const encoded = new URLSearchParams({ v: secret }).toString().slice(2);
      let uriEncoded = encoded;
      try { uriEncoded = encodeURIComponent(secret); } catch { /* URLSearchParams handles lone surrogates. */ }
      return [secret, JSON.stringify(secret).slice(1, -1), uriEncoded, encoded, encoded.replaceAll("+", "%20")];
    });
    const replacements = [...new Set(variants)].sort((a, b) => b.length - a.length);
    cached = { values: snapshot, pattern: replacements.length ? new RegExp(replacements.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null };
    patterns.set(secrets, cached);
  }
  const pattern = cached.pattern;
  const seen = new WeakSet<object>();
  const redact = (item: unknown, headerMap = false, schema = false): unknown => {
    if (typeof item === "string") {
      return pattern ? item.replace(pattern, "[REDACTED]") : item;
    }
    if (!item || typeof item !== "object") return item;
    if (seen.has(item)) return "[Circular]";
    seen.add(item);
    try {
      if (item instanceof Error) {
        const descriptors = Object.getOwnPropertyDescriptors(item);
        for (const [key, descriptor] of Object.entries(descriptors)) {
          if ("value" in descriptor && !envelopeKeys.has(key) && key !== "name") descriptor.value = redact(descriptor.value);
        }
        const clone = Object.create(Object.getPrototypeOf(item), descriptors) as Error;
        try {
          // Branded prototype getters (e.g. DOMException.message) reject clones.
          void clone.message;
          void clone.name;
          return clone;
        } catch {
          return Object.defineProperties(new Error(), {
            ...descriptors,
            message: { value: redact(item.message), writable: true, configurable: true },
            name: { value: item.name, writable: true, configurable: true },
          });
        }
      }
      if (Array.isArray(item)) return item.map(child => redact(child, false, schema));
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
        !schema && (headerMap ? isCredentialKey(key) : credentialFields.has(key)) ? "[REDACTED]"
          : !headerMap && (envelopeKeys.has(key) || key === "progressToken") ? child
          : redact(child, key === "headers" || key === "requestHeaders" || key === "responseHeaders", schema || key === "inputSchema" || key === "outputSchema")]));
    } finally {
      seen.delete(item);
    }
  };
  return redact(value, headers) as T;
}

