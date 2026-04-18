import { useState } from 'react';
import { useStore } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Globe, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from "sonner"

//Bug: After opening the dialog it on focus on the first input

export default function EnvironmentPannel() {
  const [env, setEnv] = useState<Record<string, string>>({
    MCP_SERVER_URL: 'http://localhost:4000',
    API_KEY: 'sk-xxxx-xxxx-xxxx',
    MODEL_NAME: 'gpt-4'
  });  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set(['API_KEY']));
  const [open, setOpen] = useState(false);

  //const environmentType = ['Local', 'Staging', 'Production']; // To be implemented in last phase

  const handleAdd = () => {
    if (!newKey.trim()) return;
    setEnv(prev => ({
      ...prev,
      [newKey.trim()]: newValue
    }));
    setNewKey('');
    setNewValue('');
    toast.success(`Variable "${newKey.trim()}" added`);
  };

  const handleChange = (key: string, value: string) => {
    setEnv(prev => ({ ...prev, [key]: value }));
  };

  const handleRemove = (keyToRemove: string) => {
    setEnv(prev => {
      const { [keyToRemove]: _, ...rest } = prev;
      return rest;
    });
  };

  const toggleVisibility = (key: string) => {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

        {/* Variable table */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 px-3 py-2 border-b border-border">
            <span>Key</span>
            <span>Value</span>
            <span className="w-20" />
          </div>
          <div className="divide-y divide-border max-h-60 overflow-y-auto">
            {Object.entries(env).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-2 group">
                <span className="text-xs font-mono text-foreground truncate">{key}</span>
                <Input
                  value={value}
                  onChange={e => handleChange(key, e.target.value)}
                  type={hiddenKeys.has(key) ? 'password' : 'text'}
                  className="h-7 text-xs font-mono bg-muted border-border"
                />
                <div className="flex items-center gap-1 w-20 justify-end">
                  <button
                    onClick={() => toggleVisibility(key)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {hiddenKeys.has(key) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    onClick={() => copyValue(value)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => handleRemove(key)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add new */}
        <div className="flex gap-2 items-center">
          <Input
            placeholder="KEY"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Input
            placeholder="VALUE"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            className="h-8 text-xs font-mono bg-muted border-border flex-1"
          />
          <Button size="sm" variant="outline" onClick={handleAdd} className="h-8 text-xs gap-1 rounded-md">
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
