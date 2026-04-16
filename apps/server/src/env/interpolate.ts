/**
 * Resolves {{VAR_NAME}} placeholders in a string against an environment map.
 * Missing variables are left as-is with a warning.
 */
export function interpolate(
  value: string,
  env: Record<string, string>
): { result: string; missing: string[] } {
  const missing: string[] = [];

  const result = value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => {
    if (key in env) {
      return env[key] ?? match;
    }
    missing.push(key);
    return match;
  });

  return { result, missing };
}

/**
 * Recursively interpolates all string values in a plain object.
 */
export function interpolateObject(
  obj: Record<string, unknown>,
  env: Record<string, string>
): { result: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];

  function walk(val: unknown): unknown {
    if (typeof val === "string") {
      const { result, missing: m } = interpolate(val, env);
      missing.push(...m);
      return result;
    }
    if (Array.isArray(val)) return val.map(walk);
    if (val !== null && typeof val === "object") {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, walk(v)])
      );
    }
    return val;
  }

  return { result: walk(obj) as Record<string, unknown>, missing };
}
