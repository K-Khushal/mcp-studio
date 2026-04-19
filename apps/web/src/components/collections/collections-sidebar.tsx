import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { SavedRequest } from '@mcp-studio/types';
import { useStore } from '@/store';
import { CollectionRow } from '@/components/collections/collection-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';

export function CollectionsSidebar() {
  const { collections, loadCollections, createCollection, loadSavedRequest, selectedRequestId } = useStore();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCollections().catch(console.error);
  }, [loadCollections]);

  useEffect(() => {
    if (isCreating) newNameRef.current?.focus();
  }, [isCreating]);

  const commitCreate = async () => {
    const trimmed = newName.trim();
    if (trimmed) {
      await createCollection(trimmed);
      toast.success(`Collection "${trimmed}" created`);
    }
    setNewName('');
    setIsCreating(false);
  };

  const handleSelectRequest = (req: SavedRequest) => {
    loadSavedRequest(req);
  };

  const filtered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.requests.some((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border md:top-11 md:h-[calc(100svh-2.75rem)]"
    >
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
            Collections
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsCreating(true)}
            title="New collection"
            aria-label="New collection"
          >
            <FolderPlus size={14} />
          </Button>
        </div>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 bg-background pl-6 pr-2 text-xs"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-1">
        {isCreating && (
          <div className="px-3 py-1.5">
            <Input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') {
                  setNewName('');
                  setIsCreating(false);
                }
              }}
              placeholder="Collection name"
              className="h-8 text-xs"
            />
          </div>
        )}

        {filtered.length === 0 && !isCreating && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No collections yet.
            <br />
            Click <FolderPlus size={11} className="mx-0.5 inline" /> to create one.
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
