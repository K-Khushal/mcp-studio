import { useEffect, useId, useState } from 'react';
import { useStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Collection } from '@mcp-studio/types';

interface AddConnectionDialogProps {
  collection: Collection;
  open: boolean;
  onClose: () => void;
}

export function AddConnectionDialog({ collection, open, onClose }: AddConnectionDialogProps) {
  const id = useId();
  const { addConnection } = useStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    await addConnection(collection.id, { name: name.trim() });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Add Connection to "{collection.name}"
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); void handleSave(); }} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-xs font-medium text-foreground">Name</label>
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Connection name"
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive-text">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
