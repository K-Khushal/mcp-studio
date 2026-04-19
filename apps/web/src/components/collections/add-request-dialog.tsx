import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Collection } from '@mcp-studio/types';

interface AddRequestDialogProps {
  collection: Collection;
  open: boolean;
  onClose: () => void;
}

export function AddRequestDialog({ collection, open, onClose }: AddRequestDialogProps) {
  const { tools, addRequest } = useStore();
  const [name, setName] = useState('');
  const [tool, setTool] = useState('');
  const [paramsJson, setParamsJson] = useState('{}');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setTool(tools[0]?.name ?? '');
      setParamsJson('{}');
      setError('');
    }
  }, [open, tools]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!tool) { setError('Select a tool'); return; }
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(paramsJson) as Record<string, unknown>;
    } catch {
      setError('Params must be valid JSON');
      return;
    }
    await addRequest(collection.id, { name: name.trim(), tool, params });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Add Request to "{collection.name}"
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Search users"
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
