import { expect, it } from 'vitest';
import { parseClaudeConfig } from '../lib/claude-config';

it('imports STDIO command, arguments and env with system inheritance', () => {
  expect(parseClaudeConfig(JSON.stringify({ mcpServers: { local: { command: 'bun', args: ['server.ts'], env: { TOKEN: 'value' } } } })).entries[0]).toEqual({ name: 'local', connection: { name: 'local', connectionConfig: { transport: 'stdio', config: { command: 'bun', args: ['server.ts'], env: { TOKEN: 'value' }, inheritSystemEnv: true } } } });
});

it('imports mixed URL variants and leaves invalid entries visible', () => {
  const preview = parseClaudeConfig(JSON.stringify({ mcpServers: {
    local: { command: 'node' }, remote: { url: 'https://example.com/mcp', type: 'streamable-http', headers: { Authorization: 'Bearer token' } },
    legacy: { url: 'https://example.com/sse', type: 'sse' }, bad: { args: [] },
  } }));
  expect(preview.entries.map(e => e.connection?.connectionConfig?.transport)).toEqual(['stdio', 'http', 'http', undefined]);
  expect(preview.entries[1]?.connection?.connectionConfig).toEqual({ transport: 'http', config: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer token' } } });
  expect(preview.entries[3]?.error).toBeTruthy();
});
it.each(['{', 'null', '[]', '{}', '{"mcpServers": []}', '{"mcpServers": {}}'])('reports invalid input %s', input => {
  expect(parseClaudeConfig(input).error).toBeTruthy();
});
it.each([{ command: '' }, { command: 'node', args: [1] }, { command: 'node', env: { KEY: false } }, { url: 'file:///tmp/a' }, { url: 'https://example.com', headers: [] }, { url: 'https://example.com', type: 'other' }, null])('reports invalid entry %j', entry => {
  expect(parseClaudeConfig(JSON.stringify({ mcpServers: { invalid: entry } })).entries[0]?.error).toBeTruthy();
});
it('reports duplicate names in the destination without overwriting them', () => {
  expect(parseClaudeConfig('{"mcpServers":{"local":{"command":"bun"}}}', ['local']).entries[0]?.error).toMatch(/already exists/);
});
