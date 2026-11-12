import type { Connection, HttpConfig } from '@mcp-studio/types';

export type ImportedConnection = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>;
/** `stdioConnection` is set when `connection` was converted from an `mcp-remote` STDIO proxy to a direct HTTP Connection. */
export interface ImportEntry { name: string; connection?: ImportedConnection; stdioConnection?: ImportedConnection; error?: string }
export interface ImportPreview { entries: ImportEntry[]; error?: string }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is Record<string, string> => record(value) && Object.values(value).every(v => typeof v === 'string');
const isHttpUrl = (value: string) => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };

const RUNNERS = new Set(['npx', 'bunx', 'pnpx']);
const RUNNER_FLAGS = new Set(['-y', '--yes']);
// The SDK negotiates these itself; a copied Accept would break the legacy SSE fallback.
const TRANSPORT_HEADERS = new Set(['accept', 'content-type']);
// Studio tries Streamable HTTP and falls back to SSE on rejection; SSE-first strategies cannot be preserved.
const HTTP_STRATEGIES = new Set(['http-first', 'http-only']);
/** Headers that carry credentials themselves; any other header (tenant, version…) leaves OAuth to the server. */
const AUTH_HEADER = /authorization|api[-_]?key|token|secret|cookie|auth/i;

/**
 * `npx -y mcp-remote <url> [--header "Name: value"]…` is a STDIO bridge to an HTTP server Studio can reach directly.
 * Returns null when the args use anything beyond the URL, headers and an HTTP-first `--transport`, so unknown behaviour stays STDIO.
 */
export function mcpRemoteToHttp(command: string, args: string[], env: Record<string, string> = {}): HttpConfig | null {
  if (!RUNNERS.has(command.replace(/\.cmd$/i, '').split(/[\\/]/).pop()!)) return null;
  let index = 0;
  while (index < args.length && RUNNER_FLAGS.has(args[index]!)) index++;
  if (!/^mcp-remote(@[\w.-]+)?$/.test(args[index] ?? '')) return null;
  const url = args[index + 1];
  if (!url || !isHttpUrl(url)) return null;
  const headers: Record<string, string> = {};
  // mcp-remote expands ${VAR} from env so secrets can stay out of args.
  const expand = (value: string) => value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => Object.hasOwn(env, name) ? env[name]! : match);
  for (let i = index + 2; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--header') {
      const header = expand(args[++i] ?? '');
      const colon = header.indexOf(':');
      if (colon < 1 || header.includes('${')) return null;
      const name = header.slice(0, colon).trim();
      if (!TRANSPORT_HEADERS.has(name.toLowerCase())) headers[name] = header.slice(colon + 1).trim();
    } else if (arg === '--transport') {
      if (!HTTP_STRATEGIES.has(args[++i] ?? '')) return null;
    }
    else return null;
  }
  return { url, headers, ...(Object.keys(headers).some(name => AUTH_HEADER.test(name)) ? {} : { auth: { type: 'oauth' as const } }) };
}

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
      const args = (value.args ?? []) as string[];
      const env = (value.env ?? {}) as Record<string, string>;
      const stdio: ImportedConnection = { name, connectionConfig: { transport: 'stdio', config: { command: value.command, args, env, inheritSystemEnv: true } } };
      const http = mcpRemoteToHttp(value.command, args, env);
      return http ? { name, connection: { name, connectionConfig: { transport: 'http', config: http } }, stdioConnection: stdio } : { name, connection: stdio };
    }
    if (typeof value.url !== 'string' || !value.url.trim()) return invalid('Provide a command or an HTTP url.');
    if (value.type !== undefined && !['sse', 'http', 'streamable-http'].includes(String(value.type))) return invalid('Unsupported HTTP type. Use sse, http or streamable-http.');
    try { if (!['http:', 'https:'].includes(new URL(value.url).protocol)) return invalid('url must use HTTP or HTTPS.'); } catch { return invalid('url must be an absolute HTTP or HTTPS URL.'); }
    if (value.headers !== undefined && !strings(value.headers)) return invalid('headers must contain string values.');
    return { name, connection: { name, connectionConfig: { transport: 'http', config: { url: value.url, headers: (value.headers ?? {}) as Record<string, string> } } } };
  });
  return entries.length ? { entries } : { entries, error: 'mcpServers contains no entries.' };
}
