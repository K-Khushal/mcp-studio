import { expect, test } from 'bun:test';
import { parseClaudeConfig } from '../apps/web/src/lib/claude-config';
import { SessionHarness } from '../apps/server/src/__tests__/fixtures/session-harness';

test('a parsed Claude STDIO Connection opens a Session against the real fixture', async () => {
  const fixture = new URL('../apps/server/src/__tests__/fixtures/runtime-server.ts', import.meta.url).pathname;
  const entry = parseClaudeConfig(JSON.stringify({ mcpServers: { imported: { command: process.execPath, args: [fixture], env: { STUDIO_FIXTURE_VAR: 'imported' } } } })).entries[0];
  const config = entry?.connection?.connectionConfig;
  if (!config) throw new Error('Import failed');
  const session = new SessionHarness();
  try {
    await session.send({ type: 'connect', ...config });
    expect((await session.waitFor('connected')).type).toBe('connected');
    await session.send({ type: 'invoke', tool: 'runtime', params: {} });
    const result = await session.waitFor('result');
    expect(JSON.stringify(result.data)).toContain('imported');
  } finally { await session.close(); }
});
