import { useMemo } from 'react';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { CallToolResult } from '@mcp-studio/types';
import { JsonViewer } from './json-viewer';

function validateOutput(schema: Record<string, unknown> | undefined, result: CallToolResult) {
  if (!schema) return null;
  if (result.structuredContent === undefined) {
    return result.isError ? null : 'Output schema mismatch: structured content is missing.';
  }
  try {
    const Validator = typeof schema.$schema === 'string' && schema.$schema.includes('2020-12') ? Ajv2020 : Ajv;
    const ajv = new Validator({ allErrors: true, strict: false, validateFormats: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (validate(result.structuredContent)) return 'Matches output schema';
    return 'Output schema mismatch: ' + (validate.errors ?? []).map(error =>
      `${error.instancePath || '/'} ${error.message}`).join('; ');
  } catch (error) {
    return `Cannot validate output schema: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function StructuredOutput({ result, schema }: { result: CallToolResult; schema?: Record<string, unknown> }) {
  const status = useMemo(() => validateOutput(schema, result), [schema, result]);
  const valid = status === 'Matches output schema';
  if (result.structuredContent === undefined && !status) return null;
  return <section aria-label="Structured content" className="mb-4 space-y-2">
    <h4 className="text-xs font-medium">Structured content</h4>
    {status && <p role={valid ? 'status' : 'alert'} className={`rounded-md border px-3 py-2 text-xs ${valid ? 'border-border text-muted-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>{status}</p>}
    {result.structuredContent !== undefined && <JsonViewer data={result.structuredContent} />}
  </section>;
}
