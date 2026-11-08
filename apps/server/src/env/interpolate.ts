/** Resolve Variable references in string values, retaining unresolved references for diagnostics. */
export function interpolate<T>(
  value: T,
  env: Record<string, string>
): { result: T; missing: string[] } {
  const missing = new Set<string>();
  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key: string) => {
        if (Object.hasOwn(env, key)) return env[key]!;
        missing.add(key);
        return match;
      });
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
    }
    return value;
  }
  return { result: walk(value) as T, missing: [...missing] };
}
