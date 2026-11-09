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

export interface EnumOption {
  value: unknown;
  label: string;
}

const isConstEntry = (entry: unknown): entry is { const: unknown; title?: unknown } =>
  typeof entry === 'object' && entry !== null && 'const' in entry;

/**
 * Choices for a single-select field, with display titles: `oneOf`/`anyOf` lists of
 * `{ const, title }`, or a plain `enum` optionally paired with legacy `enumNames`.
 * null when the property isn't a choice list.
 */
export function enumOptions(prop: SchemaProperty): EnumOption[] | null {
  const titled = [prop.oneOf, prop.anyOf].find((list): list is unknown[] => Array.isArray(list) && list.length > 0 && list.every(isConstEntry));
  if (titled) {
    return titled.map((entry) => {
      const { const: value, title } = entry as { const: unknown; title?: unknown };
      return { value, label: typeof title === 'string' && title ? title : typeof value === 'string' ? value : JSON.stringify(value) };
    });
  }
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const names = Array.isArray(prop.enumNames) && prop.enumNames.length === prop.enum.length ? prop.enumNames : [];
    return prop.enum.map((value, i) => ({ value, label: typeof names[i] === 'string' && names[i] ? names[i] : typeof value === 'string' ? value : JSON.stringify(value) }));
  }
  return null;
}

function isPrimitiveKind(kind: FieldKind): boolean {
  return kind === 'enum' || kind === 'boolean' || kind === 'number' || kind === 'string';
}

/**
 * How a property is edited in form mode. `depth` is the nesting level of the
 * property: 0 = top-level argument, 1 = inside one grouped object.
 * Anything deeper or not expressible as plain fields falls back to 'json'.
 */
export function fieldKind(prop: SchemaProperty, depth = 0): FieldKind {
  if (enumOptions(prop) && !('$ref' in prop) && prop.allOf === undefined) return 'enum';
  if (COMPOSITE_KEYWORDS.some((k) => prop[k] !== undefined)) return 'json';
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

// Values from an MCP Server are hints, never authority to resolve local Variables.
// Inspect values recursively; object keys are not interpolated by the Studio Server.
export function containsVariableSyntax(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('{{');
  if (Array.isArray(value)) return value.some(containsVariableSyntax);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsVariableSyntax);
  }
  return false;
}

/** Arguments a fresh form starts with: schema defaults, and `false` for booleans. */
export function initialArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(getProperties(schema))) {
    if (prop.default !== undefined && !containsVariableSyntax(prop.default)) args[key] = prop.default;
    else if (resolveType(prop) === 'boolean') args[key] = false;
  }
  return args;
}

/** Top-level required arguments that are still unset or empty. */
export function missingRequired(schema: Record<string, unknown>, args: Record<string, unknown>): string[] {
  return getRequired(schema).filter((key) => args[key] === undefined || args[key] === '');
}
