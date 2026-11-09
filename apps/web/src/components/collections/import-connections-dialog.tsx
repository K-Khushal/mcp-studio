import { useRef, useState } from 'react';
import type { Collection, Connection } from '@mcp-studio/types';
import { useStore } from '@/store';
import { parseClaudeConfig } from '@/lib/claude-config';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function post<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`Could not save (${response.status}). Try again.`);
  return response.json() as Promise<T>;
}

export function ImportConnectionsDialog({ onClose }: { onClose: () => void }) {
  const collections = useStore(s => s.collections);
  const [target, setTarget] = useState(collections[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const preview = source.trim() ? parseClaudeConfig(source, collections.find(c => c.id === target)?.connections.filter(c => (Object.hasOwn(results, c.name) ? results[c.name] : undefined) !== 'Imported').map(c => c.name)) : { entries: [] };
  const ready = preview.entries.filter(e => e.connection && (Object.hasOwn(results, e.name) ? results[e.name] : undefined) !== 'Imported');
  const changeSource = (value: string) => { setSource(value); setResults({}); setError(''); };

  const importConnections = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try {
      let id = target;
      if (!id) {
        const collection = await post<Collection>('/api/collections', { name: newName.trim() });
        useStore.setState(s => ({ collections: [...s.collections, collection] }));
        id = collection.id;
        setTarget(id);
      }
      for (const entry of ready) {
        try {
          const connection = await post<Connection>(`/api/collections/${id}/connections`, entry.connection);
          useStore.setState(s => ({ collections: s.collections.map(c => c.id === id ? { ...c, connections: [...c.connections, connection] } : c) }));
          setResults(s => ({ ...s, [entry.name]: 'Imported' }));
        } catch (cause) {
          setResults(s => ({ ...s, [entry.name]: cause instanceof Error ? cause.message : 'Could not import. Try again.' }));
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create Collection.'); }
    finally { locked.current = false; setBusy(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto overscroll-contain border-border bg-card sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Import Connections</DialogTitle>
        <DialogDescription>Paste or choose claude_desktop_config.json. Review each Connection before importing.</DialogDescription>
      </DialogHeader>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4 text-xs">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-file" className="font-medium">Choose JSON file</label>
          <Input id="import-file" type="file" accept=".json,application/json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            try { changeSource(await file.text()); } catch { setError('Could not read this file. Try pasting its contents.'); }
          }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-json" className="font-medium">Configuration JSON</label>
          <textarea id="import-json" value={source} onChange={e => changeSource(e.target.value)} spellCheck={false} className="h-40 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={'{ "mcpServers": { "local": { "command": "node", "args": ["server.js"] } } }'} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-target" className="font-medium">Target Collection</label>
          <select id="import-target" value={target} onChange={e => { setTarget(e.target.value); setResults({}); }} className="h-9 rounded-md border border-input bg-background px-2">
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="">Create a Collection…</option>
          </select>
          {!target && <Input aria-label="New Collection name" placeholder="Collection name" value={newName} onChange={e => setNewName(e.target.value)} />}
        </div>
      </fieldset>
      {(error || preview.error) && <p role="alert" className="text-xs text-destructive-text">{error || preview.error}</p>}
      <ul aria-label="Import preview" aria-live="polite" className="max-h-52 divide-y divide-border overflow-y-auto overscroll-contain text-xs">
        {preview.entries.map(entry => {
          const config = entry.connection?.connectionConfig;
          const result = Object.hasOwn(results, entry.name) ? results[entry.name] : undefined;
          return <li key={entry.name} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0"><p className="break-words font-medium">{entry.name}</p>{config && <p className="break-all text-muted-foreground">{config.transport === 'stdio' ? `STDIO · ${config.config.command}` : `HTTP · ${config.config.url}`}</p>}{config?.transport === 'stdio' && <div className="break-all text-muted-foreground">
              <p>Args:</p>
              <ul aria-label={`${entry.name} arguments`} className="list-inside list-disc">{config.config.args.map((arg, index) => <li key={index}>{arg}</li>)}</ul>
              <p>Env:</p>
              <ul aria-label={`${entry.name} environment`} className="list-inside list-disc">{Object.entries(config.config.env).map(([name, value]) => <li key={name}>{name}: {/secret|token|password|passwd|credential|key/i.test(name) ? '•••••••• (masked)' : value}</li>)}</ul>
              <p>Inherit system environment: {config.config.inheritSystemEnv ? 'Yes — all Studio process variables' : 'No'}</p>
            </div>}</div>
            <p className={`max-w-[55%] ${entry.error || (result && result !== 'Imported') ? 'text-destructive-text' : 'text-muted-foreground'}`}>{result || entry.error || 'Ready'}</p>
          </li>;
        })}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Close</Button>
        <Button size="sm" disabled={busy || !ready.length || (!target && !newName.trim())} onClick={() => void importConnections()}>{busy ? 'Importing…' : `Import ${ready.length} Connection${ready.length === 1 ? '' : 's'}`}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
