import { useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VariableInput } from '@/components/shared/variable-input';
import { Switch } from '@/components/ui/switch';

const fieldClass = 'h-7 font-mono text-xs';

function Section({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-3">
      <label htmlFor={htmlFor} className="pt-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className="text-muted-foreground hover:text-destructive">
      <X size={13} />
    </Button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="xs" onClick={onClick} className="text-muted-foreground">
      <Plus size={12} data-icon="inline-start" />
      {label}
    </Button>
  );
}

/** Moves focus to the last row's first input after a row is appended. */
function useFocusNewRow(count: number) {
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) container.current?.querySelector<HTMLInputElement>('[data-row]:last-of-type input')?.focus();
    previous.current = count;
  }, [count]);
  return container;
}

export function StdioForm() {
  const stdio = useStore((s) => s.stdio);
  const setStdio = useStore((s) => s.setStdio);
  const argsRef = useFocusNewRow(stdio.args.length);
  const envRef = useFocusNewRow(stdio.env.length);

  const setArg = (index: number, value: string) =>
    setStdio({ args: stdio.args.map((arg, i) => (i === index ? value : arg)) });
  const setEnv = (index: number, patch: Partial<{ key: string; value: string }>) =>
    setStdio({ env: stdio.env.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <div className="max-h-[40vh] space-y-3 overflow-y-auto border-t border-border px-3 py-3">
      <Section label="Arguments">
        <div ref={argsRef} className="space-y-1.5">
          {stdio.args.map((arg, index) => (
            <div key={index} data-row className="flex items-center gap-1.5">
              <VariableInput
                value={arg}
                onChange={(e) => setArg(index, e.target.value)}
                aria-label={`Argument ${index + 1}`}
                placeholder="--flag or value"
                className={fieldClass}
              />
              <RemoveButton label={`Remove argument ${index + 1}`} onClick={() => setStdio({ args: stdio.args.filter((_, i) => i !== index) })} />
            </div>
          ))}
        </div>
        <AddButton label="Add argument" onClick={() => setStdio({ args: [...stdio.args, ''] })} />
      </Section>

      <Section label="Working directory" htmlFor="stdio-cwd">
        <VariableInput
          id="stdio-cwd"
          value={stdio.cwd}
          onChange={(e) => setStdio({ cwd: e.target.value })}
          placeholder="Defaults to the Studio Server's directory"
          className={fieldClass}
        />
      </Section>

      <Section label="Environment">
        <div ref={envRef} className="space-y-1.5">
          {stdio.env.map((row, index) => (
            <div key={index} data-row className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
              <Input
                value={row.key}
                onChange={(e) => setEnv(index, { key: e.target.value })}
                aria-label={`Environment variable name ${index + 1}`}
                placeholder="NAME"
                className={fieldClass}
              />
              <VariableInput
                value={row.value}
                onChange={(e) => setEnv(index, { value: e.target.value })}
                aria-label={`Environment variable value ${index + 1}`}
                placeholder="value or {{VARIABLE}}"
                className={fieldClass}
              />
              <RemoveButton label={`Remove environment variable ${index + 1}`} onClick={() => setStdio({ env: stdio.env.filter((_, i) => i !== index) })} />
            </div>
          ))}
        </div>
        <AddButton label="Add environment variable" onClick={() => setStdio({ env: [...stdio.env, { key: '', value: '' }] })} />
      </Section>

      <Section label="System environment">
        <div className="flex items-center gap-2.5 pt-1">
          <Switch
            size="sm"
            id="stdio-inherit-env"
            checked={stdio.inheritSystemEnv}
            onCheckedChange={(checked) => setStdio({ inheritSystemEnv: checked })}
            aria-label="Inherit system environment"
          />
          <label htmlFor="stdio-inherit-env" className="text-xs text-muted-foreground">
            On: inherit the Studio Server's environment. Off: only a minimal safe set (PATH, HOME, …) plus the variables above. Variables above take precedence.
          </label>
        </div>
      </Section>
    </div>
  );
}
