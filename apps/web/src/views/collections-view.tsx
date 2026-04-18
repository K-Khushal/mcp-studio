import { ChevronRight, ChevronDown, Plus, Search, FileText } from 'lucide-react';
import { useState } from 'react';
import { useStore } from "@/store";
import { cn } from '@/lib/utils';

export function CollectionsView() {
  const { collections } = useStore();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '1': true });
  const [selected, setSelected] = useState<string | null>('1a');

  const filtered = collections.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.requests.some(r => r.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
  <div className="w-60 border-r border-border bg-card flex flex-col shrink-0">
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Collections</span>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Plus size={14} />
        </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-muted border-none rounded-md pl-7 pr-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map(col => (
          <div key={col.id}>
            <button
              onClick={() => setExpanded(e => ({ ...e, [col.id]: !e[col.id] }))}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              {expanded[col.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {col.name}
            </button>
            {expanded[col.id] && col.requests.map(req => (
              <button
                key={req.id}
                onClick={() => setSelected(req.id)}
                className={cn(
                  'w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-xs transition-colors',
                  selected === req.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                <FileText size={12} />
                {req.name}
              </button>
            ))}
          </div>
        ))}
      </div>
  </div>
  );
}
