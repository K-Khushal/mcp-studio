import type { ConnectionConfig } from "@mcp-studio/types";

/** Conservative field matching applies only to diagnostic copies. */
export function isCredentialKey(key: string): boolean {
  return /authorization|cookie|api[-_]?key|token|secret|password|passwd|credential/i.test(key);
}

/** Remember values before connecting so even startup failures can be sanitized. */
export function rememberConnectionSecrets(connection: ConnectionConfig, secrets: Set<string>): void {
  const remember = (value: string | undefined) => { if (value) secrets.add(value); };
  if (connection.transport === "stdio") {
    Object.values(connection.config.env ?? {}).forEach(remember);
    if (connection.config.inheritSystemEnv) {
      for (const [key, value] of Object.entries(process.env)) if (isCredentialKey(key)) remember(value);
    }
  } else {
    const { auth, headers, url } = connection.config;
    Object.values(headers ?? {}).forEach(value => {
      remember(value);
      if (/^Bearer /i.test(value)) remember(value.slice(7));
    });
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

/** Clone log data while redacting secrets; wire frames and Call results stay intact. */
export function redactDiagnosticValue<T>(value: T, secrets: ReadonlySet<string>): T {
  const variants = [...secrets].filter(Boolean).flatMap(secret => {
    const encoded = new URLSearchParams({ v: secret }).toString().slice(2);
    let uriEncoded = encoded;
    try { uriEncoded = encodeURIComponent(secret); } catch { /* URLSearchParams handles lone surrogates. */ }
    return [secret, JSON.stringify(secret).slice(1, -1), uriEncoded, encoded, encoded.replaceAll("+", "%20")];
  });
  const replacements = [...new Set(variants)].sort((a, b) => b.length - a.length);
  const seen = new WeakSet<object>();
  const redact = (item: unknown): unknown => {
    if (typeof item === "string") {
      for (const secret of replacements) item = (item as string).replaceAll(secret, "[REDACTED]");
      return item;
    }
    if (!item || typeof item !== "object") return item;
    if (seen.has(item)) return "[Circular]";
    seen.add(item);
    try {
      if (item instanceof Error) {
        const descriptors = Object.getOwnPropertyDescriptors(item);
        for (const descriptor of Object.values(descriptors)) {
          if ("value" in descriptor) descriptor.value = redact(descriptor.value);
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
            name: { value: redact(item.name), writable: true, configurable: true },
          });
        }
      }
      if (Array.isArray(item)) return item.map(redact);
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [redact(key), isCredentialKey(key) ? "[REDACTED]" : redact(child)]));
    } finally {
      seen.delete(item);
    }
  };
  return redact(value) as T;
}

