import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function EnvironmentPanel() {
  const {
    environments,
    activeEnvironmentId,
    loadEnvironments,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newEnvName, setNewEnvName] = useState('');
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [localVars, setLocalVars] = useState<Record<string, string>>({});

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) ?? environments[0];

  useEffect(() => {
    if (open && environments.length === 0) {
      void loadEnvironments();
    }
  }, [open, loadEnvironments]);

  useEffect(() => {
    if (activeEnv) setLocalVars(activeEnv.variables);
    setRevealedKeys(new Set());
  }, [activeEnv?.id]);

  const flushVars = (vars: Record<string, string>) => {
    if (!activeEnv) return;
    updateEnvironment(activeEnv.id, { variables: vars });
  };

  const handleAdd = () => {
    if (!newKey.trim() || !activeEnv) return;
    const vars = { ...localVars, [newKey.trim()]: newValue };
    setLocalVars(vars);
    flushVars(vars);
    setNewKey('');
    setNewValue('');
  };

  const handleBlur = () => {
    flushVars(localVars);
  };

  const handleRemove = (key: string) => {
    setRevealedKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    const { [key]: _, ...rest } = localVars;
    setLocalVars(rest);
    flushVars(rest);
  };

  const handleCreateEnv = async () => {
    if (!newEnvName.trim()) return;
    await createEnvironment(newEnvName.trim());
    setNewEnvName('');
    setShowNewEnv(false);
  };

  const handleDeleteEnv = async () => {
    if (!activeEnv || environments.length <= 1) return;
    await deleteEnvironment(activeEnv.id);
    toast.success(`Environment "${activeEnv.name}" deleted`);
  };

  const toggleVisibility = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyValue = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success('Copied to clipboard'); }
    catch { toast.error('Could not copy to clipboard'); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setRevealedKeys(new Set()); }}>
      <DialogTrigger asChild>
        <button title="Active Environment" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Globe size={13} />
          {environments.find(e => e.id === activeEnvironmentId)?.name ?? 'No environment'}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Environment Variables</DialogTitle>
          <DialogDescription className="text-xs">Manage Variables for your Connections and Calls.</DialogDescription>
        </DialogHeader>

        {/* Environment selector */}
        <div className="flex items-center gap-2">
          {showNewEnv ? (
            <>
              <Input
                aria-label="Environment name"
                placeholder="Environment name"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateEnv()}
                className="h-8 text-xs flex-1"
                autoFocus
              />
              <Button size="sm" variant="outline" onClick={handleCreateEnv} className="h-8 text-xs">Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewEnv(false)} className="h-8 text-xs">Cancel</Button>
            </>
          ) : (
            <>
              <Select value={activeEnv?.id ?? ''} onValueChange={setActiveEnvironment}>
                <SelectTrigger aria-label="Active Environment" className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setShowNewEnv(true)} className="h-8 text-xs gap-1">
                <Plus size={11} /> New
              </Button>
              <AlertDialog>
              <AlertDialogTrigger asChild>
              <Button
                aria-label="Delete environment"
                size="sm"
                variant="ghost"
                disabled={environments.length <= 1}
                className="h-8 text-xs text-muted-foreground hover:text-destructive-text"
              >
                <Trash2 size={11} />
              </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{activeEnv?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>Delete “{activeEnv?.name}” and its {Object.keys(localVars).length} Variables? This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void handleDeleteEnv()}>Delete environment</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        {/* Variable table */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-0 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 px-3 py-2 border-b border-border">
            <span>Key</span>
            <span>Value</span>
            <span className="w-20" />
          </div>
          <div className="divide-y divide-border max-h-60 overflow-y-auto overscroll-contain">
            {Object.entries(localVars).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-2 group">
                <span className="text-xs font-mono text-foreground truncate">{key}</span>
                <Input
                  value={value}
                  onChange={(e) => setLocalVars((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={handleBlur}
                  aria-label={`${key} value`}
                  type={revealedKeys.has(key) ? 'text' : 'password'}
                  autoComplete="off"
                  className="h-7 text-xs font-mono bg-muted border-border"
                />
                <div className="flex items-center gap-1 w-20 justify-end">
                  <button aria-label={`${revealedKeys.has(key) ? 'Hide' : 'Show'} ${key}`} aria-pressed={revealedKeys.has(key)} onClick={() => toggleVisibility(key)} className="size-6 flex items-center justify-center rounded outline-hidden focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground transition-colors">
                    {revealedKeys.has(key) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button aria-label={`Copy ${key}`} onClick={() => void copyValue(value)} className="size-6 flex items-center justify-center rounded outline-hidden focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground transition-colors">
                    <Copy size={12} />
                  </button>
                  <button aria-label={`Delete ${key}`} onClick={() => handleRemove(key)} className="size-6 flex items-center justify-center rounded outline-hidden focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-destructive-text transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            {Object.keys(localVars).length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No variables yet</div>
            )}
          </div>
        </div>

        {/* Add new variable */}
        <form onSubmit={e => { e.preventDefault(); handleAdd(); }} className="flex gap-2 items-center">
          <Input
            aria-label="New Variable name"
            placeholder="KEY"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Input
            aria-label="New Variable value"
            placeholder="VALUE"
            type="password"
            autoComplete="off"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8 text-xs gap-1">
            <Plus size={12} /> Add
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          Use <code className="font-mono text-primary-text">{'{{NAME}}'}</code> in any connection field or Call argument.
        </p>
      </DialogContent>
    </Dialog>
  );
}
