export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

export function getProperties(schema: Record<string, unknown>): Record<string, SchemaProperty> {
  const props = schema['properties'];
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    return props as Record<string, SchemaProperty>;
  }
  return {};
}

export function getRequired(schema: Record<string, unknown>): string[] {
  const req = schema['required'];
  return Array.isArray(req) ? (req as string[]) : [];
}

export function resolveType(prop: SchemaProperty): string {
  const t = Array.isArray(prop.type)
    ? prop.type.find((x) => x !== 'null') ?? 'string'
    : prop.type ?? 'string';
  return t as string;
}

export function defaultValue(prop: SchemaProperty): string {
  if (prop.default !== undefined) return String(prop.default);
  const t = resolveType(prop);
  if (t === 'boolean') return 'false';
  if (t === 'number' || t === 'integer') return '';
  if (t === 'object' || t === 'array') return t === 'object' ? '{}' : '[]';
  return '';
}

export function buildParams(
  schema: Record<string, unknown>,
  values: Record<string, string>
): Record<string, unknown> {
  const properties = getProperties(schema);
  const result: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined) continue;
    const prop = properties[key];
    const type = prop ? resolveType(prop) : 'string';

    if (type === 'number' || type === 'integer') {
      const n = Number(raw);
      if (!isNaN(n)) result[key] = n;
    } else if (type === 'boolean') {
      result[key] = raw === 'true';
    } else if (type === 'object' || type === 'array') {
      try {
        result[key] = JSON.parse(raw);
      } catch {
        result[key] = raw;
      }
    } else {
      result[key] = raw;
    }
  }

  return result;
}

export function seedValues(
  schema: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, string> {
  const properties = getProperties(schema);
  const seeded: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    const prop = properties[key];
    const type = prop ? resolveType(prop) : 'string';
    if (type === 'object' || type === 'array') {
      seeded[key] = JSON.stringify(val, null, 2);
    } else {
      seeded[key] = val !== undefined && val !== null ? String(val) : '';
    }
  }
  return seeded;
}
