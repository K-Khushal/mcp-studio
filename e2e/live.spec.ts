import { test, expect } from '@playwright/test';
import { createConnection, configureStdio, jsonArgs, selectTool, fixtureInfo } from './helpers';

type Tool = { name: string; title?: string; annotations?: { title?: string }; inputSchema: { properties?: Record<string, unknown> } };
const candidates = [
  { name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp', tool: 'read_wiki_structure', args: { repoName: 'modelcontextprotocol/typescript-sdk' } },
  { name: 'Remote fetch', url: 'https://remote.mcpservers.org/fetch/mcp', tool: 'fetch', args: { url: 'https://example.com', max_length: 500 } },
  { name: 'GitMCP SDK', url: 'https://gitmcp.io/modelcontextprotocol/typescript-sdk', tool: 'fetch_typescript_sdk_docs', args: {} },
  { name: 'Cloudflare docs', url: 'https://docs.mcp.cloudflare.com/mcp', tool: 'search_cloudflare_documentation', args: { query: 'Workers getting started' } },
  { name: 'Memory', package: '@modelcontextprotocol/server-memory', tool: 'read_graph', args: {} },
  { name: 'Filesystem', package: '@modelcontextprotocol/server-filesystem', tool: 'list_directory', args: {} },
  { name: 'Sequential thinking', package: '@modelcontextprotocol/server-sequential-thinking', tool: 'sequentialthinking', args: { thought: 'Confirm that 2 + 2 equals 4.', nextThoughtNeeded: false, thoughtNumber: 1, totalThoughts: 1 } },
];

let httpConnections = 0;
const attemptedHTTP = new Set<string>();
test.afterAll(() => {
  if (attemptedHTTP.size === candidates.filter(candidate => candidate.url).length) {
    expect(httpConnections, 'At least one HTTP candidate must connect').toBeGreaterThan(0);
  }
});

for (const candidate of candidates) {
  test(candidate.name, async ({ page }, testInfo) => {
    if (candidate.url) attemptedHTTP.add(candidate.url);
    const row = { server: candidate.url ?? candidate.package!, transport: candidate.url ? 'HTTP' : 'STDIO', tools: 0, call: candidate.tool, result: 'FAIL', reason: '' };
    let connected: { tools: Tool[] } | undefined;
    let lastError = '';
    let result: { content?: unknown[]; isError?: boolean } | undefined;
    // Observe the public browser protocol only to count the discovered catalogue
    // and identify the actual advertised title. All actions go through the UI.
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'connected') connected = message;
      if (message.type === 'error') lastError = message.message;
      if (message.type === 'result') result = message.data;
    }));
    try {
      await createConnection(page, candidate.name, `${candidate.name} live`);
      const info = await fixtureInfo(page);
      if (candidate.url) {
        await page.getByRole('radio', { name: 'HTTP', exact: true }).click();
        await page.getByLabel('Server URL').fill(candidate.url);
      } else {
        await configureStdio(page, 'npx', ['-y', candidate.package!, ...(candidate.name === 'Filesystem' ? [info.directory] : [])]);
      }
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      try {
        await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible({ timeout: 60_000 });
      } catch (error) {
        // Classify only the surfaced connection error, never Playwright's
        // visibility timeout: a missing Disconnect can be a Studio regression.
        const remoteUnavailable = /\b(?:ENOTFOUND|ECONNREFUSED|ETIMEDOUT)\b|timed?\s*out|timeout|\b(?:HTTP|status)\s+[45]\d{2}\b/i.test(lastError);
        if (!candidate.url || !remoteUnavailable) throw error;
        row.result = 'SKIPPED';
        row.reason = lastError;
        test.skip(true, row.reason);
      }
      if (candidate.url) httpConnections++;
      expect(connected).toBeDefined();
      row.tools = connected!.tools.length;
      expect(row.tools).toBeGreaterThan(0);
      // GitMCP prefixes tools with the repository name; discover its read-only
      // documentation tool rather than relying on an unstable generated prefix.
      const tool = connected!.tools.find(t => t.name === candidate.tool) ??
        (candidate.name === 'GitMCP SDK' ? connected!.tools.find(t => /^fetch_.*_documentation$/.test(t.name)) : undefined);
      expect(tool, `Expected read-only tool ${candidate.tool}`).toBeDefined();
      row.call = tool!.name;
      await selectTool(page, tool!.name, tool!.title || tool!.annotations?.title || tool!.name);
      await jsonArgs(page, candidate.name === 'Filesystem' ? { path: info.directory } : candidate.args);
      // Remote tools (e.g. GitMCP's docs fetch) can exceed runTool's 15s wait.
      await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
      await expect.poll(() => result, { timeout: 60_000 }).toBeDefined();
      expect(result!.isError).not.toBe(true);
      expect(result!.content?.length).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: 'Run Tool', exact: true })).toBeEnabled();
      row.result = 'PASS';
    } catch (error) {
      if (row.result !== 'SKIPPED') row.reason = lastError || String(error);
      throw error;
    } finally {
      console.log(`LIVE_RESULT ${JSON.stringify(row)}`);
      await testInfo.attach('live-result', { body: JSON.stringify(row), contentType: 'application/json' });
      if (connected) await testInfo.attach('catalogue', { body: JSON.stringify(connected.tools), contentType: 'application/json' });
    }
  });
}
