import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Plus, FileText, Trash2, Pencil } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { AddRequestDialog } from './add-request-dialog';
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
import type { Collection, SavedRequest } from '@mcp-studio/types';

interface CollectionRowProps {
  collection: Collection;
  selectedRequestId: string | null;
  onSelectRequest: (req: SavedRequest) => void;
}

export function CollectionRow({ collection, selectedRequestId, onSelectRequest }: CollectionRowProps) {
  const { renameCollection, deleteCollection, deleteRequest } = useStore();
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false);
  const [confirmDeleteReqId, setConfirmDeleteReqId] = useState<string | null>(null);
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

  const handleDeleteRequest = async (req: SavedRequest) => {
    await deleteRequest(collection.id, req.id);
    toast.success(`Request "${req.name}" deleted`);
  };

  const confirmReq = collection.requests.find((r) => r.id === confirmDeleteReqId);

  return (
    <div>
      <div className="group flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50 transition-colors">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenameValue(collection.name); setIsRenaming(false); }
            }}
            className="flex-1 min-w-0 text-xs bg-muted border border-border rounded px-1 py-0.5 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            onDoubleClick={() => setIsRenaming(true)}
            className="flex-1 min-w-0 text-xs font-medium text-foreground truncate"
          >
            {collection.name}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setAddOpen(true)}
            title="Add request"
            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setIsRenaming(true)}
            title="Rename"
            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => setConfirmDeleteCollection(true)}
            title="Delete"
            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded &&
        collection.requests.map((req) => (
          <div
            key={req.id}
            className={cn(
              'group flex items-center gap-2 pl-8 pr-2 py-1.5 transition-colors cursor-pointer',
              selectedRequestId === req.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
            onClick={() => onSelectRequest(req)}
          >
            <FileText size={11} className="shrink-0" />
            <span className="flex-1 min-w-0 text-xs truncate">{req.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteReqId(req.id);
              }}
              title="Delete request"
              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}

      <AddRequestDialog
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
              "{collection.name}" and all its requests will be permanently deleted.
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

      {/* Confirm delete request */}
      <AlertDialog
        open={confirmDeleteReqId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteReqId(null)}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete request?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              "{confirmReq?.name}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmReq && handleDeleteRequest(confirmReq)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
