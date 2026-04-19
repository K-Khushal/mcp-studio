import { useState } from 'react';
import { useStore } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ConfigurationPanel() {
  const { config, setConfig } = useStore();
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [ connectionUrl, setConnectionUrl ] = useState<string>('');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Settings2 size={13} />
          Configuration
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Transport Settings */}
          <Section title="Transport Settings">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Transport Type</label>
                <div className="flex gap-1 rounded-md overflow-hidden border border-border w-fit">
                  {(['stdio', 'http'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTransport(t)}
                      className={cn(
                        'px-3 py-1 text-xs font-medium transition-colors uppercase',
                        transport === t
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">
                  {transport === 'stdio' ? 'STDIO Command' : 'HTTP Endpoint'}
                </label>
                <Input
                  value={connectionUrl}
                  onChange={e => setConnectionUrl(e.target.value)}
                  className="h-8 text-xs font-mono bg-muted border-border"
                  placeholder={transport === 'stdio' ? 'npx @test/test-mcp' : 'http://localhost:4000'}
                />
              </div>
            </div>
          </Section>

          {/* Execution Settings */}
          <Section title="Execution Settings">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Request Timeout (seconds)</label>
                <Input
                  type="number"
                  value={config.requestTimeout}
                  onChange={e => setConfig({ requestTimeout: Number(e.target.value) })}
                  className="h-8 text-xs font-mono bg-muted border-border w-24"
                />
              </div>
              <ToggleRow label="Auto Scroll Logs" checked={config.autoScrollLogs} onChange={v => setConfig({ autoScrollLogs: v })} />
              <ToggleRow label="Stream Responses" checked={config.streamResponses} onChange={v => setConfig({ streamResponses: v })} />
            </div>
          </Section>

          {/* Debug Settings */}
          <Section title="Debugging">
            <div className="space-y-3">
              <ToggleRow label="Verbose Logging" checked={config.verboseLogging} onChange={v => setConfig({ verboseLogging: v })} />
              <ToggleRow label="Show Reasoning Steps" checked={config.showReasoning} onChange={v => setConfig({ showReasoning: v })} />
              <ToggleRow label="Show Tool Lifecycle Timeline" checked={config.showTimeline} onChange={v => setConfig({ showTimeline: v })} />
            </div>
          </Section>
        </div>

        <button
          onClick={() => { toast.success('Configuration saved'); setOpen(false); }}
          className="w-full mt-2 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Save Configuration
        </button>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground mb-3 pb-1.5 border-b border-border">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
