import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Plus, FileText, Trash2, Pencil, Plug } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { AddConnectionDialog } from './add-connection-dialog';
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
import { toast } from 'sonner';
import type { Collection, Connection } from '@mcp-studio/types';

// Row actions sit over the row's right edge: revealed on hover, on keyboard focus anywhere in the row, and always on touch.
const REVEAL_COLLECTION = 'opacity-0 transition-opacity duration-150 ease-out group-hover/collection:opacity-100 group-focus-within/collection:opacity-100 [@media(hover:none)]:opacity-100';
const REVEAL_CONNECTION = 'opacity-0 transition-opacity duration-150 ease-out group-hover/connection:opacity-100 group-focus-within/connection:opacity-100 [@media(hover:none)]:opacity-100';
const ACTIONS = 'absolute inset-y-0 right-1 flex items-center gap-0.5 bg-linear-to-l from-sidebar from-70% to-transparent pl-4';
const ACTION =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-[color,background-color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring enabled:active:scale-[0.96]';

interface CollectionRowProps {
  collection: Collection;
  /** Connections to list; the sidebar narrows them while searching. Defaults to all. */
  connections?: Connection[];
  searchQuery?: string;
  selectedConnectionId: string | null;
  onSelectConnection: (conn: Connection) => void;
  onConnectConnection: (conn: Connection) => void;
}

export function CollectionRow({ collection, connections = collection.connections, searchQuery = '', selectedConnectionId, onSelectConnection, onConnectConnection }: CollectionRowProps) {
  const { renameCollection, deleteCollection, deleteConnection } = useStore();
  const liveConnectionId = useStore((s) =>
    s.connectionStatus === 'connected' ? s.connectedConnectionId : s.connectionStatus === 'connecting' ? s.connectingConnectionId : null
  );
  const [expanded, setExpanded] = useState(true);
  const [searchExpansion, setSearchExpansion] = useState<{ query: string; expanded?: boolean }>({ query: searchQuery });
  // Reset even when clearing then returning to the same query.
  if (searchExpansion.query !== searchQuery) {
    setSearchExpansion({ query: searchQuery });
  }
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false);
  const [confirmDeleteConnId, setConfirmDeleteConnId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== collection.name) {
      await renameCollection(collection.id, trimmed);
    } else {
      setRenameValue(collection.name);
    }
    setIsRenaming(false);
  };

  const handleDeleteCollection = async () => {
    await deleteCollection(collection.id);
    toast.success(`Collection "${collection.name}" deleted`);
  };

  const handleDeleteConnection = async (conn: Connection) => {
    await deleteConnection(collection.id, conn.id);
    toast.success(`Connection "${conn.name}" deleted`);
  };

  const showConnections = searchQuery ? (searchExpansion.query === searchQuery ? searchExpansion.expanded ?? true : true) : expanded;
  const confirmConn = collection.connections.find((r) => r.id === confirmDeleteConnId);

  return (
    <div>
      <div className="group/collection relative flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50 transition-colors">
        <button
          type="button"
          onClick={() => {
            if (searchQuery) setSearchExpansion({ query: searchQuery, expanded: !showConnections });
            else setExpanded((e) => !e);
          }}
          aria-label={`${showConnections ? 'Collapse' : 'Expand'} ${collection.name}`}
          aria-expanded={showConnections}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showConnections ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        </button>

        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            aria-label="Collection name"
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenameValue(collection.name); setIsRenaming(false); }
            }}
            className="flex-1 min-w-0 text-xs bg-muted border border-border rounded px-1 py-0.5 text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
          />
        ) : (
          <span
            onDoubleClick={() => setIsRenaming(true)}
            title={collection.name}
            className="flex-1 min-w-0 text-xs font-medium text-foreground truncate"
          >
            {collection.name}
          </span>
        )}

        {!isRenaming && (
          <div className={cn(ACTIONS, REVEAL_COLLECTION)}>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label={`Add Connection to ${collection.name}`}
              title={`Add Connection to ${collection.name}`}
              className={ACTION}
            >
              <Plus size={13} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              aria-label={`Rename ${collection.name}`}
              title={`Rename ${collection.name}`}
              className={ACTION}
            >
              <Pencil size={13} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteCollection(true)}
              aria-label={`Delete ${collection.name}`}
              title={`Delete ${collection.name}`}
              className={cn(ACTION, 'hover:text-destructive-text')}
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {showConnections &&
        connections.map((conn) => (
          <div
            key={conn.id}
            className={cn(
              'group/connection relative flex items-center border-l-2 transition-colors',
              selectedConnectionId === conn.id
                ? 'border-l-primary bg-primary/15 text-foreground'
                : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            <button
              type="button"
              onClick={() => onSelectConnection(conn)}
              onDoubleClick={() => onConnectConnection(conn)}
              aria-current={selectedConnectionId === conn.id ? 'true' : undefined}
              title={conn.name}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-8 pr-2 text-left text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <FileText size={11} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{conn.name}</span>
            </button>
            <div className={cn(ACTIONS, REVEAL_CONNECTION)}>
              {liveConnectionId !== conn.id && (
                <button
                  type="button"
                  onClick={() => onConnectConnection(conn)}
                  aria-label={`Connect ${conn.name}`}
                  title={`Connect ${conn.name}`}
                  className={ACTION}
                >
                  <Plug size={12} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDeleteConnId(conn.id)}
                aria-label={`Delete Connection ${conn.name}`}
                title={`Delete Connection ${conn.name}`}
                className={cn(ACTION, 'hover:text-destructive-text')}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          </div>
        ))}

      {showConnections && collection.connections.length === 0 && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center gap-2 border-l-2 border-l-transparent py-1.5 pl-8 pr-2 text-left text-xs text-muted-foreground outline-hidden transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Plus size={11} className="shrink-0" aria-hidden />
          Add Connection
        </button>
      )}

      <AddConnectionDialog
        collection={collection}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

      {/* Confirm delete collection */}
      <AlertDialog open={confirmDeleteCollection} onOpenChange={setConfirmDeleteCollection}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete collection?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              "{collection.name}" and all its Connections will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCollection}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete Connection */}
      <AlertDialog
        open={confirmDeleteConnId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteConnId(null)}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              "{confirmConn?.name}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmConn && handleDeleteConnection(confirmConn)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
