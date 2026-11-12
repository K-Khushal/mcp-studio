import { studioFetch } from "@/lib/studio-access";
import { useRef, useState } from 'react';
import type { Collection, Connection } from '@mcp-studio/types';
import { useStore } from '@/store';
import { parseClaudeConfig, type ImportEntry } from '@/lib/claude-config';
import { isSecretName } from '@/lib/is-secret-name';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MASK = '•••••••• (masked)';
/** Masks `Name: value` header args (e.g. after mcp-remote's --header) whose name looks secret. */
const maskArg = (arg: string) => { const match = /^([\w-]+):\s*\S/.exec(arg); return match && isSecretName(match[1]!) ? `${match[1]}: ${MASK}` : arg; };

/** A converted header whose value came from the config's env (mcp-remote `${VAR}`) is masked like that env value. */
const expandsEnv = (entry: ImportEntry, value: string) => {
  const config = entry.stdioConnection?.connectionConfig;
  return config?.transport === 'stdio' && Object.values(config.config.env).some(envValue => envValue !== '' && value.includes(envValue));
};

async function post<T>(url: string, data: unknown): Promise<T> {
  const response = await studioFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
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
  const [keepStdio, setKeepStdio] = useState<Set<string>>(new Set());
  const chosen = (entry: ImportEntry) => keepStdio.has(entry.name) && entry.stdioConnection ? entry.stdioConnection : entry.connection;
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
      const imported: Connection[] = [];
      for (const entry of ready) {
        try {
          const connection = await post<Connection>(`/api/collections/${id}/connections`, chosen(entry));
          useStore.setState(s => ({ collections: s.collections.map(c => c.id === id ? { ...c, connections: [...c.connections, connection] } : c) }));
          setResults(s => ({ ...s, [entry.name]: 'Imported' }));
          imported.push(connection);
        } catch (cause) {
          setResults(s => ({ ...s, [entry.name]: cause instanceof Error ? cause.message : 'Could not import. Try again.' }));
        }
      }
      // Failures keep the dialog open so they stay visible; full success closes it and opens the first import.
      if (imported.length && imported.length === ready.length) {
        toast.success(`Imported ${imported.length} Connection${imported.length === 1 ? '' : 's'}`);
        const { connectionStatus, loadConnection } = useStore.getState();
        if (connectionStatus === 'disconnected' || connectionStatus === 'error') loadConnection(imported[0]!);
        onClose();
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
          <Input id="import-file" type="file" accept=".json,application/json" className="h-9 cursor-pointer py-1.5 text-xs text-muted-foreground file:mr-3 file:h-6 file:cursor-pointer file:rounded-md file:bg-muted file:px-2.5 file:text-xs file:text-foreground hover:file:bg-muted/70 md:text-xs" onChange={async event => {
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
          <select id="import-target" value={target} onChange={e => { setTarget(e.target.value); setResults({}); }} className="h-9 rounded-lg border border-input bg-background px-2 text-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30">
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="">Create a Collection…</option>
          </select>
          {!target && <Input aria-label="New Collection name" placeholder="Collection name" value={newName} onChange={e => setNewName(e.target.value)} />}
        </div>
      </fieldset>
      {(error || preview.error) && <p role="alert" className="text-xs text-destructive-text">{error || preview.error}</p>}
      <ul aria-label="Import preview" aria-live="polite" className="flex flex-col gap-2 text-xs">
        {preview.entries.map(entry => {
          const config = chosen(entry)?.connectionConfig;
          const result = Object.hasOwn(results, entry.name) ? results[entry.name] : undefined;
          const failed = Boolean(entry.error || (result && result !== 'Imported'));
          const detail = 'flex flex-wrap gap-1 font-mono';
          const chip = 'max-w-full break-all rounded bg-muted px-1.5 py-0.5';
          return <li key={entry.name} className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              {config && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary-text">{config.transport === 'stdio' ? 'STDIO' : 'HTTP'}</span>}
              <p className="min-w-0 flex-1 truncate font-medium" title={entry.name}>{entry.name}</p>
              <p className={cn('max-w-[50%] shrink-0 text-right', failed ? 'text-destructive-text' : result === 'Imported' ? 'text-success-text' : 'text-muted-foreground')}>{result || entry.error || 'Ready'}</p>
            </div>
            {config && <p className="mt-1 break-all font-mono text-muted-foreground">{config.transport === 'stdio' ? config.config.command : config.config.url}</p>}
            {entry.stdioConnection && <div className="mt-2 flex flex-col gap-1 text-muted-foreground">
              {!keepStdio.has(entry.name) && <p>Converted from mcp-remote: Studio connects to the URL directly{config?.transport === 'http' && config.config.auth?.type === 'oauth' ? ' and signs in with OAuth if the server asks' : ''}.</p>}
              <label className="flex w-fit items-center gap-2">
                <input type="checkbox" className="accent-primary" checked={keepStdio.has(entry.name)} disabled={busy || result === 'Imported'} onChange={e => setKeepStdio(prev => { const next = new Set(prev); if (e.target.checked) next.add(entry.name); else next.delete(entry.name); return next; })} />
                Keep as STDIO (run mcp-remote)
              </label>
            </div>}
            {config?.transport === 'http' && Object.keys(config.config.headers).length > 0 && <div className="mt-2 flex items-baseline gap-2 text-muted-foreground">
              <span className="shrink-0">Headers</span>
              <ul aria-label={`${entry.name} headers`} className={detail}>{Object.entries(config.config.headers).map(([name, value]) => <li key={name} className={chip}>{name}: {isSecretName(name) || expandsEnv(entry, value) ? MASK : value}</li>)}</ul>
            </div>}
            {config?.transport === 'stdio' && <div className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
              {config.config.args.length > 0 && <div className="flex items-baseline gap-2">
                <span className="w-8 shrink-0">Args</span>
                <ul aria-label={`${entry.name} arguments`} className={detail}>{config.config.args.map((arg, index) => <li key={index} className={chip}>{maskArg(arg)}</li>)}</ul>
              </div>}
              {Object.keys(config.config.env).length > 0 && <div className="flex items-baseline gap-2">
                <span className="w-8 shrink-0">Env</span>
                <ul aria-label={`${entry.name} environment`} className={detail}>{Object.entries(config.config.env).map(([name, value]) => <li key={name} className={chip}>{name}: {isSecretName(name) ? MASK : value}</li>)}</ul>
              </div>}
              <p>Inherit system environment: {config.config.inheritSystemEnv ? 'Yes — all Studio process variables' : 'No'}</p>
            </div>}
          </li>;
        })}
      </ul>
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex justify-end gap-2 rounded-b-xl border-t border-border bg-card px-4 py-3">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Close</Button>
        <Button size="sm" disabled={busy || !ready.length || (!target && !newName.trim())} onClick={() => void importConnections()}>{busy ? 'Importing…' : `Import ${ready.length} Connection${ready.length === 1 ? '' : 's'}`}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
