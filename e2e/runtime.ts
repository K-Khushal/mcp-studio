// Bun-only lifecycle controller; Playwright itself runs in Node.
import { rmSync } from 'node:fs';
import { studioURL, fixtureURL, studioToken } from './ports';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'mcp-studio-e2e-'));
let child: ReturnType<typeof Bun.spawn> | undefined;
function cleanup() {
  child?.kill();
  rmSync(directory, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}
process.env.STUDIO_DB_PATH = join(directory, 'studio.db');
const { startHTTPFixture } = await import('./fixture-transports');
const streamable = await startHTTPFixture();
const sse = await startHTTPFixture('sse');
const root = new URL('../', import.meta.url).pathname;
async function start() {
  child = Bun.spawn([process.execPath, join(root, 'dist/cli.js'), '--port', new URL(studioURL).port, '--no-open'], {
    cwd: root, env: { ...process.env, STUDIO_DB_PATH: join(directory, 'studio.db'), STUDIO_TOKEN: studioToken }, stdout: 'inherit', stderr: 'inherit',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Packaged CLI exited: ${child.exitCode}`);
    if (await fetch(`${studioURL}/health`, { headers: { Authorization: `Bearer ${studioToken}` } }).then(r => r.ok).catch(() => false)) return;
    await Bun.sleep(100);
  }
  throw new Error('Packaged CLI did not become healthy');
}
await start();
Bun.serve({ hostname: 'localhost', port: Number(new URL(fixtureURL).port), async fetch(request) {
  if (new URL(request.url).pathname === '/restart' && request.method === 'POST') {
    child!.kill(); await child!.exited; await start();
    return Response.json({ restarted: true });
  }
  return Response.json({
    command: process.execPath,
    fixture: join(root, 'apps/server/src/__tests__/fixtures/protocol-server.ts'),
    streamable: streamable.connection.config.url,
    sse: sse.connection.config.url,
    directory,
  });
} });
