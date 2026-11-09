import { useStore } from '@/store';
import { Input } from '@/components/ui/input';
import { VariableInput } from '@/components/shared/variable-input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

export function HeadersPanel() {
  const { httpHeaders, selectedConnectionId, connectionDrafts, setHeaderRows } = useStore();
  const rows = (selectedConnectionId ? connectionDrafts[selectedConnectionId]?.headerRows : undefined)
    ?? Object.entries(httpHeaders).map(([key, value], index) => ({ id: String(index), key, value }));
  const names = rows.map(row => row.key.trim().toLowerCase()).filter(Boolean);
  const duplicate = new Set(names).size !== names.length;
  const update = (id: string, patch: Partial<{ key: string; value: string }>) => setHeaderRows(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  return (
    <div className="p-4 space-y-3">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No headers. Add one below.</p>}
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <Input aria-label={`Header ${index + 1} name`} value={row.key} onChange={e => update(row.id, { key: e.target.value })} placeholder="Header name" className="font-mono text-xs h-7" aria-invalid={duplicate} aria-describedby={duplicate ? 'header-error' : undefined} />
            <VariableInput aria-label={`Header ${index + 1} value`} value={row.value} onChange={e => update(row.id, { value: e.target.value })} placeholder="Value or {{ENV_VAR}}" className="font-mono text-xs h-7" />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove header ${row.key || index + 1}`} onClick={() => setHeaderRows(rows.filter(item => item.id !== row.id))} className="text-muted-foreground hover:text-destructive-text"><Trash2 size={13} /></Button>
          </div>
        ))}
      </div>
      {duplicate && <p id="header-error" role="alert" className="text-xs text-destructive-text">Header names must be unique. Resolve duplicates to save changes.</p>}
      <Button variant="ghost" size="sm" onClick={() => setHeaderRows([...rows, { id: crypto.randomUUID(), key: '', value: '' }])}><Plus size={13} /> Add header</Button>
    </div>
  );
}
