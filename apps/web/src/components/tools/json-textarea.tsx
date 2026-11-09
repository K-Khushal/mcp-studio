import { useEffect, useId, useState } from 'react';
import { VariableTextarea } from '@/components/shared/variable-input';
import { cn } from '@/lib/utils';

interface JsonTextareaProps {
  id?: string;
  label: string;
  value: unknown;
  /** Called with the parsed value, or undefined when the text is empty. */
  onChange: (value: unknown) => void;
  /** Reports false while the draft text is not acceptable. */
  onValidChange?: (valid: boolean) => void;
  /** Only accept a JSON object (the whole-arguments editor). */
  requireObject?: boolean;
  rows?: number;
  placeholder?: string;
  /** Extra description ids, e.g. the field's help text. */
  describedBy?: string | undefined;
}

const pretty = (value: unknown) => (value === undefined ? '' : JSON.stringify(value, null, 2));

function parse(text: string, requireObject: boolean): { value?: unknown; error?: string } {
  if (text.trim() === '') return requireObject ? { value: {} } : { value: undefined };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (requireObject && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return { error: 'Arguments must be a JSON object' };
  }
  return { value };
}

/** Text editor for a JSON value. Keeps the typed draft; commits only parseable text. */
export function JsonTextarea({
  id,
  label,
  value,
  onChange,
  onValidChange,
  requireObject = false,
  rows = 3,
  placeholder,
  describedBy,
}: JsonTextareaProps) {
  const [draft, setDraft] = useState(() => pretty(value));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => {
    onValidChange?.(error === null);
  }, [error, onValidChange]);
  useEffect(() => () => onValidChange?.(true), [onValidChange]);

  // Reflect outside changes (e.g. a loaded Connection) unless the user is mid-edit on bad text.
  useEffect(() => {
    if (error !== null) return;
    const parsed = parse(draft, requireObject);
    if (JSON.stringify(parsed.value) !== JSON.stringify(value)) setDraft(pretty(value));
  }, [value]);

  const handleChange = (text: string) => {
    setDraft(text);
    const parsed = parse(text, requireObject);
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onChange(parsed.value);
  };

  return (
    <div className="flex flex-col gap-1">
      <VariableTextarea
        json
        id={id}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={[describedBy, error !== null && errorId].filter(Boolean).join(' ') || undefined}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className={cn('text-xs font-mono resize-y')}
      />
      {error !== null && (
        <p id={errorId} role="alert" className="text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}
