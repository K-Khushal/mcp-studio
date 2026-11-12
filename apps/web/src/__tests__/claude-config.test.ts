import { expect, it } from 'vitest';
import { mcpRemoteToHttp, parseClaudeConfig } from '../lib/claude-config';

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

it('converts mcp-remote proxies to direct HTTP and leaves unknown flags as STDIO', () => {
  expect(mcpRemoteToHttp('npx', ['-y', 'mcp-remote', 'https://a.example/mcp', '--header', 'X-API-Key: k', '--header', 'Accept: application/json, text/event-stream']))
    .toEqual({ url: 'https://a.example/mcp', headers: { 'X-API-Key': 'k' } });
  expect(mcpRemoteToHttp('npx', ['mcp-remote@0.1.2', 'https://a.example/mcp', '--header', 'Authorization:${AUTH}'], { AUTH: 'Bearer t' }))
    .toEqual({ url: 'https://a.example/mcp', headers: { Authorization: 'Bearer t' } });
  expect(mcpRemoteToHttp('npx', ['-y', 'mcp-remote', 'https://a.example/mcp'])).toEqual({ url: 'https://a.example/mcp', headers: {}, auth: { type: 'oauth' } });
  expect(mcpRemoteToHttp('npx', ['mcp-remote', 'https://a.example/mcp', '--header', 'Authorization:${MISSING}'])).toBeNull();
  expect(mcpRemoteToHttp('npx', ['mcp-remote', 'https://a.example/mcp', '9696'])).toBeNull();
  expect(mcpRemoteToHttp('node', ['mcp-remote', 'https://a.example/mcp'])).toBeNull();
  const entry = parseClaudeConfig(JSON.stringify({ mcpServers: { r: { command: 'npx', args: ['-y', 'mcp-remote', 'https://a.example/mcp'] } } })).entries[0];
  expect(entry?.connection?.connectionConfig?.transport).toBe('http');
  expect(entry?.stdioConnection?.connectionConfig?.transport).toBe('stdio');
});

it('keeps OAuth when retained headers carry no credentials', () => {
  expect(mcpRemoteToHttp('npx', ['mcp-remote', 'https://a.example/mcp', '--header', 'X-Tenant: acme']))
    .toEqual({ url: 'https://a.example/mcp', headers: { 'X-Tenant': 'acme' }, auth: { type: 'oauth' } });
  expect(mcpRemoteToHttp('npx', ['mcp-remote', 'https://a.example/mcp', '--header', 'Authorization: Bearer t'])?.auth).toBeUndefined();
});

it.each([['http-first', true], ['http-only', true], ['sse-first', false], ['sse-only', false], [undefined, false]])('converts --transport %s only when Studio can honour it', (strategy, converts) => {
  const args = ['mcp-remote', 'https://a.example/mcp', '--transport', ...(strategy ? [strategy] : [])];
  expect(mcpRemoteToHttp('npx', args) !== null).toBe(converts);
});

it('marks disabled: true entries without a Connection or reserving the name', () => {
  const { entries } = parseClaudeConfig('{"mcpServers":{"off":{"command":"node","disabled":true},"url":{"url":"https://example.com","disabled":true},"on":{"command":"bun","disabled":false}}}', ['off']);
  expect(entries).toEqual([{ name: 'off', disabled: true }, { name: 'url', disabled: true }, expect.objectContaining({ name: 'on', connection: expect.anything() })]);
});
