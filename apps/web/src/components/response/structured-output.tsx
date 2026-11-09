import { useMemo } from 'react';
import Ajv, { type ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { CallToolResult } from '@mcp-studio/types';
import { JsonViewer } from './json-viewer';

type Compiled = { validate: ValidateFunction; patternsDisabled: boolean };
const validators = new WeakMap<Record<string, unknown>, Compiled>();

// Walk only JSON Schema positions. Property names and enum/const/default values are data.
function safeSchema(schema: Record<string, unknown>) {
  let patternsDisabled = false;
  const maps = new Set(['properties', '$defs', 'definitions', 'dependentSchemas']);
  const singles = new Set(['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'additionalItems', 'unevaluatedItems', 'not', 'if', 'then', 'else', 'contentSchema']);
  const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
      if (key === 'pattern' || key === 'patternProperties') { patternsDisabled = true; return []; }
      if (maps.has(key) && child && typeof child === 'object') {
        return [[key, Object.fromEntries(Object.entries(child).map(([name, sub]) => [name, visit(sub)]))]];
      }
      if (key === 'dependencies' && child && typeof child === 'object') {
        return [[key, Object.fromEntries(Object.entries(child).map(([name, sub]) => [name, Array.isArray(sub) ? sub : visit(sub)]))]];
      }
      if (arrays.has(key) || key === 'items') return [[key, Array.isArray(child) ? child.map(visit) : visit(child)]];
      return [[key, singles.has(key) ? visit(child) : child]];
    }));
  };
  const sanitized = visit(schema);
  return { sanitized, patternsDisabled };
}

function compiledValidator(schema: Record<string, unknown>): Compiled {
  const cached = validators.get(schema);
  if (cached) return cached;
  const dialect = typeof schema.$schema === 'string' ? schema.$schema.replace(/#$/, '') : schema.$schema;
  const draft07 = dialect === 'http://json-schema.org/draft-07/schema' || dialect === 'https://json-schema.org/draft-07/schema';
  if (dialect !== undefined && !draft07 && dialect !== 'https://json-schema.org/draft/2020-12/schema') {
    throw new Error(`Unsupported JSON Schema dialect: ${String(dialect)}`);
  }
  const Validator = draft07 ? Ajv : Ajv2020;
  const ajv = new Validator({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  const { sanitized, patternsDisabled } = safeSchema(schema);
  const compiled = { validate: ajv.compile(sanitized as Record<string, unknown>), patternsDisabled };
  validators.set(schema, compiled);
  return compiled;
}

function validateOutput(schema: Record<string, unknown> | undefined, result: CallToolResult) {
  if (!schema) return null;
  if (result.structuredContent === undefined) {
    return result.isError ? null : 'Output schema mismatch: structured content is missing.';
  }
  try {
    const { validate } = compiledValidator(schema);
    if (validate(result.structuredContent)) return 'Matches output schema';
    return 'Output schema mismatch: ' + (validate.errors ?? []).map(error =>
      `${error.instancePath || '/'} ${error.message}`).join('; ');
  } catch (error) {
    return `Cannot validate output schema: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function StructuredOutput({ result, schema }: { result: CallToolResult; schema?: Record<string, unknown> }) {
  const status = useMemo(() => validateOutput(schema, result), [schema, result]);
  const patternsDisabled = useMemo(() => schema ? safeSchema(schema).patternsDisabled : false, [schema]);
  const valid = status === 'Matches output schema';
  if (result.structuredContent === undefined && !status) return null;
  return <section aria-label="Structured content" className="mb-4 space-y-2">
    <h4 className="text-xs font-medium">Structured content</h4>
    {patternsDisabled && <p role="note" className="text-xs text-muted-foreground">Pattern validation is disabled for server-supplied pattern and patternProperties keywords.</p>}
    {status && <p role={valid ? 'status' : 'alert'} className={`rounded-md border px-3 py-2 text-xs ${valid ? 'border-border text-muted-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive-text'}`}>{status}</p>}
    {result.structuredContent !== undefined && <JsonViewer data={result.structuredContent} />}
  </section>;
}
