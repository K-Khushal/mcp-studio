import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ImportConnectionsDialog } from '../components/collections/import-connections-dialog';
import { useStore } from '../store';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('previews mixed entries and imports valid Connections into the chosen Collection', async () => {
  useStore.setState({ collections: [{ id: 'c', name: 'Imported', connections: [], createdAt: 0, updatedAt: 0 }] });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(JSON.stringify({ id: 'new', ...JSON.parse(init.body), createdAt: 0, updatedAt: 0 }))));
  render(<ImportConnectionsDialog onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: '{"mcpServers":{"local":{"command":"bun"},"broken":null}}' } });
  expect(screen.getByText('STDIO · bun')).toBeInTheDocument();
  expect(screen.getByText('Expected a server settings object.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Import 1 Connection' }));
  expect(await screen.findByText('Imported', { selector: 'p' })).toBeInTheDocument();
  expect(useStore.getState().collections[0]?.connections[0]?.connectionConfig).toEqual({ transport: 'stdio', config: { command: 'bun', args: [], env: {}, inheritSystemEnv: true } });
});

it('creates a Collection from a chosen file and reports save failures without claiming success', async () => {
  useStore.setState({ collections: [] });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/collections'
    ? new Response(JSON.stringify({ id: 'created', name: 'From file', connections: [], createdAt: 0, updatedAt: 0 }))
    : new Response('unavailable', { status: 503 })));
  render(<ImportConnectionsDialog onClose={() => {}} />);
  const file = new File(['unused'], 'claude_desktop_config.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => '{"mcpServers":{"remote":{"url":"https://example.com/mcp"}}}' });
  await userEvent.upload(screen.getByLabelText('Choose JSON file'), file);
  await userEvent.type(screen.getByLabelText('New Collection name'), 'From file');
  await userEvent.click(screen.getByRole('button', { name: 'Import 1 Connection' }));
  expect(await screen.findByText('Could not save (503). Try again.')).toBeInTheDocument();
  expect(useStore.getState().collections[0]?.connections).toEqual([]);
  expect(screen.getByRole('button', { name: 'Import 1 Connection' })).toBeEnabled();
});
