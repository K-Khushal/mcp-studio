import { useEffect, useRef, useState } from 'react';
import { Search, FolderPlus } from 'lucide-react';
import { useStore } from '@/store';
import { CollectionRow } from '@/components/collections/collection-row';
import type { SavedRequest } from '@mcp-studio/types';

export function CollectionsView() {
  const { collections, loadCollections, createCollection, loadSavedRequest } = useStore();
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCollections().catch(console.error);
  }, []);

  useEffect(() => {
    if (isCreating) newNameRef.current?.focus();
  }, [isCreating]);

  const commitCreate = async () => {
    const trimmed = newName.trim();
    if (trimmed) await createCollection(trimmed);
    setNewName('');
    setIsCreating(false);
  };

  const handleSelectRequest = (req: SavedRequest) => {
    setSelectedRequestId(req.id);
    loadSavedRequest(req);
  };

  const filtered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.requests.some((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="w-60 border-r border-border bg-card flex flex-col shrink-0">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Collections
          </span>
          <button
            onClick={() => setIsCreating(true)}
            title="New collection"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <FolderPlus size={14} />
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-muted border-none rounded-md pl-6 pr-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isCreating && (
          <div className="px-3 py-1.5">
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') { setNewName(''); setIsCreating(false); }
              }}
              placeholder="Collection name"
              className="w-full text-xs bg-muted border border-border rounded px-2 py-1 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {filtered.length === 0 && !isCreating && (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No collections yet.
            <br />
            Click <FolderPlus size={11} className="inline mx-0.5" /> to create one.
          </p>
        )}

        {filtered.map((col) => (
          <CollectionRow
            key={col.id}
            collection={col}
            selectedRequestId={selectedRequestId}
            onSelectRequest={handleSelectRequest}
          />
        ))}
      </div>
    </div>
  );
}
