import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, Search, Import } from 'lucide-react';
import { toast } from 'sonner';
import type { Connection } from '@mcp-studio/types';
import { useStore } from '@/store';
import { CollectionRow } from '@/components/collections/collection-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buildConnectionConfig, isConnectable } from '@/store/connection-form';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';

import { ImportConnectionsDialog } from './import-connections-dialog';

export function CollectionsSidebar() {
  const { collections, loadCollections, createCollection, loadConnection, selectedConnectionId } = useStore();
  const [importing, setImporting] = useState(false);
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

  // A switch the user must confirm: one Session at a time, and it belongs to another Connection.
  const [pendingSwitch, setPendingSwitch] = useState<{ conn: Connection; connect: boolean } | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);

  const needsConfirmation = (conn: Connection) => {
    const { connectionStatus, connectedConnectionId, connectingConnectionId } = useStore.getState();
    const liveId = connectionStatus === 'connected' ? connectedConnectionId : connectionStatus === 'connecting' ? connectingConnectionId : null;
    return liveId !== null && liveId !== conn.id;
  };

  const connectSelected = useCallback(() => {
    const config = buildConnectionConfig(useStore.getState());
    if (isConnectable(config)) void useStore.getState().connect(config);
  }, []);

  const open = async ({ conn, connect }: { conn: Connection; connect: boolean }) => {
    if (needsConfirmation(conn)) await useStore.getState().disconnect();
    loadConnection(conn);
    if (connect) connectSelected();
  };

  // Wait out the double-click window before prompting so a double-click raises one dialog, not two.
  const handleSelectConnection = (conn: Connection) => {
    window.clearTimeout(clickTimer.current);
    if (!needsConfirmation(conn)) {
      loadConnection(conn);
      return;
    }
    clickTimer.current = window.setTimeout(() => setPendingSwitch({ conn, connect: false }), 250);
  };

  const handleConnectConnection = (conn: Connection) => {
    window.clearTimeout(clickTimer.current);
    if (needsConfirmation(conn)) {
      setPendingSwitch({ conn, connect: true });
      return;
    }
    const { selectedConnectionId: selected, connectedConnectionId, connectionStatus } = useStore.getState();
    if (connectedConnectionId === conn.id && connectionStatus !== 'disconnected') return;
    if (selected !== conn.id) loadConnection(conn);
    connectSelected();
  };

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const filtered = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.connections.some((r) => r.name.toLowerCase().includes(search.toLowerCase()))
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
          <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Import Connections" title="Import Connections" onClick={() => setImporting(true)}><Import size={14} /></Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsCreating(true)}
            title="New collection"
            aria-label="New collection"
          >
            <FolderPlus size={14} />
          </Button>
          </div>
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
            Click <FolderPlus size={14} className="mx-0.5 inline" /> to create one.
          </p>
        )}

        {filtered.map((col) => (
          <CollectionRow
            key={col.id}
            collection={col}
            selectedConnectionId={selectedConnectionId}
            onSelectConnection={handleSelectConnection}
            onConnectConnection={handleConnectConnection}
          />
        ))}
      </SidebarContent>
      <SidebarRail />
      {importing && <ImportConnectionsDialog onClose={() => setImporting(false)} />}

      <AlertDialog open={pendingSwitch !== null} onOpenChange={(isOpen) => !isOpen && setPendingSwitch(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Switch Connection?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              The live Session will be closed
              {pendingSwitch ? ` and "${pendingSwitch.conn.name}" ${pendingSwitch.connect ? 'opened' : 'loaded'}` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8" onClick={() => pendingSwitch && void open(pendingSwitch)}>
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
