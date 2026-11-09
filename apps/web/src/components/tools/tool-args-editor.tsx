import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { JsonTextarea } from './json-textarea';
import { FieldValidityContext, SchemaForm, type Args } from './tool-schema-form';

type Mode = 'form' | 'json';

interface ToolArgsEditorProps {
  label?: string;
  schema: Record<string, unknown>;
  /** The Call arguments: exactly what Run sends and the JSON view shows. */
  args: Args;
  onChange: (args: Args) => void;
  /** false while the arguments can't be sent (invalid JSON). */
  onValidChange?: (valid: boolean) => void;
}

const JSON_FIELD = 'arguments-json';

export function ToolArgsEditor({ schema, args, onChange, onValidChange, label = 'Arguments' }: ToolArgsEditorProps) {
  const [mode, setMode] = useState<Mode>('form');
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const reportField = useCallback((id: string, valid: boolean) => {
    setInvalid((prev) => {
      if (valid === !prev.has(id)) return prev;
      const next = new Set(prev);
      if (valid) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const reportJson = useCallback((valid: boolean) => reportField(JSON_FIELD, valid), [reportField]);

  const isValid = invalid.size === 0;
  useEffect(() => {
    onValidChange?.(isValid);
  }, [isValid, onValidChange]);
  useEffect(() => () => onValidChange?.(true), [onValidChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <ModeToggle mode={mode} onChange={setMode} valid={isValid} />
      </div>
      {mode === 'form' ? (
        <FieldValidityContext.Provider value={reportField}>
          <SchemaForm schema={schema} args={args} onChange={onChange} />
        </FieldValidityContext.Provider>
      ) : (
        <JsonTextarea
          label="Arguments JSON"
          value={args}
          onChange={(next) => onChange(next as Args)}
          onValidChange={reportJson}
          requireObject
          rows={10}
        />
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
  valid,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  valid: boolean;
}) {
  const options: { value: Mode; label: string }[] = [
    { value: 'form', label: 'Form' },
    { value: 'json', label: 'JSON' },
  ];
  return (
    <div role="group" aria-label="Arguments editor mode" className="inline-flex rounded-md bg-muted p-0.5">
      {options.map(({ value, label }) => {
        const disabled = !valid && value !== mode;
        const hint = value === 'json' ? 'Fix or remove invalid items first' : 'Fix the JSON to switch back to the form';
        return (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            disabled={disabled}
            title={disabled ? hint : undefined}
            onClick={() => onChange(value)}
            className={cn(
              'rounded-[5px] px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              mode === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
