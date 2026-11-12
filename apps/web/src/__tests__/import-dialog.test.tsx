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
  const onClose = vi.fn();
  render(<ImportConnectionsDialog onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: '{"mcpServers":{"local":{"command":"bun"},"broken":null}}' } });
  expect(screen.getByText('STDIO · bun')).toBeInTheDocument();
  expect(screen.getByText('Expected a server settings object.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Import 1 Connection' }));
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(useStore.getState().selectedConnectionId).toBe('new');
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

it('previews args, env and inheritance for a Connection named __proto__', () => {
  useStore.setState({ collections: [] });
  render(<ImportConnectionsDialog onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: '{"mcpServers":{"__proto__":{"command":"bun","args":["server.ts"],"env":{"MODE":"test"}}}}' } });
  expect(screen.getByRole('list', { name: '__proto__ arguments' })).toHaveTextContent('server.ts');
  expect(screen.getByRole('list', { name: '__proto__ environment' })).toHaveTextContent('MODE: test');
  expect(screen.getByText(/Inherit system environment: Yes/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import 1 Connection' })).toBeDisabled();
});

it('masks sensitive environment values in the preview while keeping imported values', async () => {
  useStore.setState({ collections: [{ id: 'c', name: 'Target', connections: [], createdAt: 0, updatedAt: 0 }] });
  const fetch = vi.fn(async (_url, init) => new Response(JSON.stringify({ id: 'new', ...JSON.parse(init.body), createdAt: 0, updatedAt: 0 })));
  vi.stubGlobal('fetch', fetch);
  render(<ImportConnectionsDialog onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: JSON.stringify({ mcpServers: { local: { command: 'bun', args: ['one', 'two'], env: { API_TOKEN: 'private-value', MODE: 'test' } } } }) } });
  expect(screen.getByRole('list', { name: 'local environment' })).toHaveTextContent('API_TOKEN: •••••••• (masked)');
  expect(screen.getByRole('list', { name: 'local environment' })).not.toHaveTextContent('private-value');
  expect(screen.getByRole('list', { name: 'local arguments' }).children).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Import 1 Connection' }));
  expect(useStore.getState().collections[0]?.connections[0]?.connectionConfig).toMatchObject({ config: { env: { API_TOKEN: 'private-value' } } });
});

it('imports mcp-remote as a direct HTTP Connection with masked headers, or keeps STDIO on request', async () => {
  useStore.setState({ collections: [{ id: 'c', name: 'Target', connections: [], createdAt: 0, updatedAt: 0 }] });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(JSON.stringify({ id: 'new', ...JSON.parse(init.body), createdAt: 0, updatedAt: 0 }))));
  const source = JSON.stringify({ mcpServers: { remote: { command: 'npx', args: ['-y', 'mcp-remote', 'https://example.com/mcp', '--header', 'X-API-Key: private-value'] } } });
  render(<ImportConnectionsDialog onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: source } });
  expect(screen.getByText('HTTP · https://example.com/mcp')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'remote headers' })).toHaveTextContent('X-API-Key: •••••••• (masked)');
  await userEvent.click(screen.getByLabelText('Keep as STDIO (run mcp-remote)'));
  expect(screen.getByRole('list', { name: 'remote arguments' })).toHaveTextContent('X-API-Key: •••••••• (masked)');
  expect(screen.getByRole('list', { name: 'remote arguments' })).not.toHaveTextContent('private-value');
  await userEvent.click(screen.getByLabelText('Keep as STDIO (run mcp-remote)'));
  await userEvent.click(screen.getByRole('button', { name: 'Import 1 Connection' }));
  expect(useStore.getState().collections[0]?.connections[0]?.connectionConfig).toEqual({ transport: 'http', config: { url: 'https://example.com/mcp', headers: { 'X-API-Key': 'private-value' } } });
});
