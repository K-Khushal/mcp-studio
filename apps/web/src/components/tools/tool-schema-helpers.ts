export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty;
  [key: string]: unknown;
}

export type FieldKind =
  | 'enum'
  | 'boolean'
  | 'number'
  | 'string'
  | 'primitive-array'
  | 'object'
  | 'json';

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

const COMPOSITE_KEYWORDS = ['oneOf', 'anyOf', 'allOf', '$ref'];

function isPrimitiveKind(kind: FieldKind): boolean {
  return kind === 'enum' || kind === 'boolean' || kind === 'number' || kind === 'string';
}

/**
 * How a property is edited in form mode. `depth` is the nesting level of the
 * property: 0 = top-level argument, 1 = inside one grouped object.
 * Anything deeper or not expressible as plain fields falls back to 'json'.
 */
export function fieldKind(prop: SchemaProperty, depth = 0): FieldKind {
  if (COMPOSITE_KEYWORDS.some((k) => prop[k] !== undefined)) return 'json';
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return 'enum';
  const type = resolveType(prop);
  if (type === 'boolean') return 'boolean';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'array') {
    const items = prop.items;
    return items && isPrimitiveKind(fieldKind(items, depth + 1)) ? 'primitive-array' : 'json';
  }
  if (type === 'object') {
    if (depth > 0 || !prop.properties || Object.keys(prop.properties).length === 0) return 'json';
    return 'object';
  }
  return 'string';
}

export function defaultValue(prop: SchemaProperty): string {
  if (prop.default !== undefined) {
    return typeof prop.default === 'object' && prop.default !== null
      ? JSON.stringify(prop.default)
      : String(prop.default);
  }
  return resolveType(prop) === 'boolean' ? 'false' : '';
}

/** Store values (strings, complex ones as JSON) → Call arguments. Empty values are omitted. */
export function buildParams(
  schema: Record<string, unknown>,
  values: Record<string, string>
): Record<string, unknown> {
  const properties = getProperties(schema);
  const result: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined) continue;
    const prop = properties[key];
    if (!prop) {
      result[key] = parseJsonOr(raw, raw);
      continue;
    }
    const type = resolveType(prop);

    if (type === 'number' || type === 'integer') {
      const n = Number(raw);
      result[key] = isNaN(n) ? raw : n;
    } else if (type === 'boolean') {
      result[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
    } else if (type === 'object' || type === 'array') {
      result[key] = parseJsonOr(raw, raw);
    } else {
      result[key] = raw;
    }
  }

  return result;
}

/** Call arguments → store values. Inverse of buildParams. */
export function seedValues(
  schema: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, string> {
  const properties = getProperties(schema);
  const seeded: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined) continue;
    const prop = properties[key];
    const type = prop ? resolveType(prop) : undefined;
    const matchesPrimitive =
      (type === 'string' && typeof val === 'string') ||
      ((type === 'number' || type === 'integer') && typeof val === 'number') ||
      (type === 'boolean' && typeof val === 'boolean');
    seeded[key] = matchesPrimitive ? String(val) : typeof val === 'string' && prop ? val : JSON.stringify(val);
  }
  return seeded;
}

function parseJsonOr<T>(raw: string, fallback: T): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
