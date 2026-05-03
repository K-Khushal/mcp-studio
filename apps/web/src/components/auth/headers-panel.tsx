import { useStore } from '@/store';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

export function HeadersPanel() {
  const { httpHeaders, setHttpHeaders } = useStore();

  const entries = Object.entries(httpHeaders);

  const updateKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(httpHeaders)) {
      next[k === oldKey ? newKey : k] = v;
    }
    setHttpHeaders(next);
  };

  const updateValue = (key: string, value: string) => {
    setHttpHeaders({ ...httpHeaders, [key]: value });
  };

  const removeEntry = (key: string) => {
    const next = { ...httpHeaders };
    delete next[key];
    setHttpHeaders(next);
  };

  const addEntry = () => {
    // Find a unique placeholder key
    let n = 1;
    while (`key${n}` in httpHeaders) n++;
    setHttpHeaders({ ...httpHeaders, [`key${n}`]: '' });
  };

  return (
    <div className="p-4 space-y-3">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No headers. Click + to add one.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Key</span>
            <span>Value</span>
            <span />
          </div>
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Input
                value={key}
                onChange={(e) => updateKey(key, e.target.value)}
                placeholder="Header name"
                className="font-mono text-xs h-7"
              />
              <Input
                value={value}
                onChange={(e) => updateValue(key, e.target.value)}
                placeholder="Value or {{ENV_VAR}}"
                className="font-mono text-xs h-7"
              />
              <button
                onClick={() => removeEntry(key)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addEntry}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus size={13} />
        Add header
      </button>
    </div>
  );
}
