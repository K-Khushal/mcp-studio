import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newEnvName, setNewEnvName] = useState('');
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [localVars, setLocalVars] = useState<Record<string, string>>({});

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) ?? environments[0];

  useEffect(() => {
    if (open && environments.length === 0) {
      loadEnvironments();
    }
  }, [open]);

  useEffect(() => {
    if (activeEnv) setLocalVars(activeEnv.variables);
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
    toast.success(`Variable "${newKey.trim()}" added`);
    setNewKey('');
    setNewValue('');
  };

  const handleBlur = () => {
    flushVars(localVars);
  };

  const handleRemove = (key: string) => {
    const { [key]: _, ...rest } = localVars;
    setLocalVars(rest);
    flushVars(rest);
  };

  const handleCreateEnv = async () => {
    if (!newEnvName.trim()) return;
    await createEnvironment(newEnvName.trim());
    toast.success(`Environment "${newEnvName.trim()}" created`);
    setNewEnvName('');
    setShowNewEnv(false);
  };

  const handleDeleteEnv = async () => {
    if (!activeEnv || environments.length <= 1) return;
    await deleteEnvironment(activeEnv.id);
    toast.success(`Environment "${activeEnv.name}" deleted`);
  };

  const toggleVisibility = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyValue = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Globe size={13} />
          Environment
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Environment Variables</DialogTitle>
        </DialogHeader>

        {/* Environment selector */}
        <div className="flex items-center gap-2">
          {showNewEnv ? (
            <>
              <Input
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
                <SelectTrigger className="h-8 text-xs flex-1">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDeleteEnv}
                disabled={environments.length <= 1}
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={11} />
              </Button>
            </>
          )}
        </div>

        {/* Variable table */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 px-3 py-2 border-b border-border">
            <span>Key</span>
            <span>Value</span>
            <span className="w-20" />
          </div>
          <div className="divide-y divide-border max-h-60 overflow-y-auto">
            {Object.entries(localVars).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-2 group">
                <span className="text-xs font-mono text-foreground truncate">{key}</span>
                <Input
                  value={value}
                  onChange={(e) => setLocalVars((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={handleBlur}
                  type={hiddenKeys.has(key) ? 'password' : 'text'}
                  className="h-7 text-xs font-mono bg-muted border-border"
                />
                <div className="flex items-center gap-1 w-20 justify-end">
                  <button onClick={() => toggleVisibility(key)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                    {hiddenKeys.has(key) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={() => copyValue(value)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                    <Copy size={12} />
                  </button>
                  <button onClick={() => handleRemove(key)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
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
        <div className="flex gap-2 items-center">
          <Input
            placeholder="KEY"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Input
            placeholder="VALUE"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Button size="sm" variant="outline" onClick={handleAdd} className="h-8 text-xs gap-1">
            <Plus size={12} /> Add
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Use <code className="font-mono text-primary">{'{{VARIABLE_NAME}}'}</code> in prompts and tool inputs for auto-substitution.
        </p>
      </DialogContent>
    </Dialog>
  );
}
