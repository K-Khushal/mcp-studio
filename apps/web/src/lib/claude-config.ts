import type { Connection } from '@mcp-studio/types';

export type ImportedConnection = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>;
export interface ImportEntry { name: string; connection?: ImportedConnection; error?: string }
export interface ImportPreview { entries: ImportEntry[]; error?: string }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is Record<string, string> => record(value) && Object.values(value).every(v => typeof v === 'string');

export function parseClaudeConfig(source: string, existingNames: string[] = []): ImportPreview {
  let data: unknown;
  try { data = JSON.parse(source); } catch { return { entries: [], error: 'Invalid JSON. Paste the contents of claude_desktop_config.json.' }; }
  if (!record(data) || !record(data.mcpServers)) return { entries: [], error: 'Expected an mcpServers object.' };
  const names = new Set(existingNames);
  const entries = Object.entries(data.mcpServers).map(([name, value]): ImportEntry => {
    const invalid = (error: string) => ({ name, error });
    if (!name.trim()) return invalid('Connection name cannot be empty.');
    if (names.has(name)) return invalid('A Connection with this name already exists in the Collection.');
    names.add(name);
    if (!record(value)) return invalid('Expected a server settings object.');
    if ('command' in value && 'url' in value) return invalid('Use either command or url, not both.');
    if ('command' in value) {
      if (typeof value.command !== 'string' || !value.command.trim()) return invalid('command must be a nonempty string.');
      if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(v => typeof v === 'string'))) return invalid('args must be an array of strings.');
      if (value.env !== undefined && !strings(value.env)) return invalid('env must contain string values.');
      return { name, connection: { name, connectionConfig: { transport: 'stdio', config: { command: value.command, args: (value.args ?? []) as string[], env: (value.env ?? {}) as Record<string, string>, inheritSystemEnv: true } } } };
    }
    if (typeof value.url !== 'string' || !value.url.trim()) return invalid('Provide a command or an HTTP url.');
    if (value.type !== undefined && !['sse', 'http', 'streamable-http'].includes(String(value.type))) return invalid('Unsupported HTTP type. Use sse, http or streamable-http.');
    try { if (!['http:', 'https:'].includes(new URL(value.url).protocol)) return invalid('url must use HTTP or HTTPS.'); } catch { return invalid('url must be an absolute HTTP or HTTPS URL.'); }
    if (value.headers !== undefined && !strings(value.headers)) return invalid('headers must contain string values.');
    return { name, connection: { name, connectionConfig: { transport: 'http', config: { url: value.url, headers: (value.headers ?? {}) as Record<string, string> } } } };
  });
  return entries.length ? { entries } : { entries, error: 'mcpServers contains no entries.' };
}
