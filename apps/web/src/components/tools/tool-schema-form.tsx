import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VariableInput } from '@/components/shared/variable-input';
import { JsonTextarea } from './json-textarea';
import {
  containsVariableSyntax,
  fieldKind,
  getProperties,
  getRequired,
  type FieldKind,
  type SchemaProperty,
} from './tool-schema-helpers';

export type Args = Record<string, unknown>;

/** Lets fallback JSON fields tell the editor they hold unparseable text. */
export const FieldValidityContext = createContext<(id: string, valid: boolean) => void>(() => {});

interface SchemaFormProps {
  schema: Record<string, unknown>;
  args: Args;
  onChange: (args: Args) => void;
}

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-muted px-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring';

export function SchemaForm({ schema, args, onChange }: SchemaFormProps) {
  if (Object.keys(getProperties(schema)).length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">This tool takes no parameters.</p>
    );
  }
  return <FieldList schema={schema} value={args} onChange={onChange} />;
}

interface FieldListProps {
  schema: SchemaProperty | Record<string, unknown>;
  value: Args;
  onChange: (value: Args) => void;
  depth?: number;
}

function FieldList({ schema, value, onChange, depth = 0 }: FieldListProps) {
  const properties = getProperties(schema);
  const required = getRequired(schema);

  const setField = (key: string, next: unknown) => {
    const merged = { ...value };
    if (next === undefined) delete merged[key];
    else merged[key] = next;
    onChange(merged);
  };

  return (
    <div className="flex flex-col gap-3">
      {Object.keys(properties).map((key) => (
        <Field
          key={key}
          name={key}
          prop={properties[key]!}
          required={required.includes(key)}
          value={value[key]}
          onChange={(next) => setField(key, next)}
          depth={depth}
        />
      ))}
    </div>
  );
}

interface FieldProps {
  name: string;
  prop: SchemaProperty;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}

function Field({ name, prop, required, value, onChange, depth = 0 }: FieldProps) {
  const id = useId();
  const kind = fieldKind(prop, depth);
  const hintId = containsVariableSyntax(prop.default) ? `${id}-default` : undefined;
  const defaultHint = hintId ? (
    <p id={hintId} className="text-xs text-muted-foreground">
      Server default (not applied): {JSON.stringify(prop.default)}
    </p>
  ) : null;

  if (kind === 'object') {
    const current = isPlainObject(value) ? value : {};
    return (
      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend className="flex items-center gap-1 px-1 text-xs font-medium text-foreground">
          {name}
          {required && <RequiredMark />}
        </legend>
        {prop.description && <p className="text-xs text-muted-foreground">{prop.description}</p>}
        {defaultHint}
        <FieldList
          schema={prop}
          value={current}
          depth={depth + 1}
          onChange={(next) =>
            onChange(Object.keys(next).length === 0 && !required ? undefined : next)
          }
        />
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-foreground">
        {name}
        {required && <RequiredMark />}
      </label>
      {prop.description && <p className="text-xs text-muted-foreground">{prop.description}</p>}
      {defaultHint}
      {kind === 'json' ? (
        <JsonField id={id} label={name} value={value} onChange={onChange} />
      ) : kind === 'primitive-array' ? (
        <ArrayControl label={name} prop={prop} value={value} onChange={onChange} />
      ) : (
        <PrimitiveControl describedBy={hintId} id={id} label={name} prop={prop} kind={kind} value={value} onChange={onChange} />
      )}
    </div>
  );
}

function JsonField({
  id,
  label,
  value,
  onChange,
}: Pick<PrimitiveControlProps, 'id' | 'label' | 'value' | 'onChange'>) {
  const report = useContext(FieldValidityContext);
  const onValidChange = useCallback((valid: boolean) => report(id, valid), [report, id]);
  return (
    <JsonTextarea
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      onValidChange={onValidChange}
      placeholder="JSON"
    />
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive-text" aria-label="required">
      *
    </span>
  );
}

function isPlainObject(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyItem(items: SchemaProperty): unknown {
  const kind = fieldKind(items, 1);
  if (kind === 'number') return 0;
  if (kind === 'boolean') return false;
  if (kind === 'enum') return items.enum!.find((option) => !containsVariableSyntax(option)) ?? '';
  return '';
}

function ArrayControl({
  label,
  prop,
  value,
  onChange,
}: Pick<FieldProps, 'prop' | 'value' | 'onChange'> & { label: string }) {
  const id = useId();
  const report = useContext(FieldValidityContext);
  const items = prop.items!;
  const list = Array.isArray(value) ? value : [];
  const itemKind = fieldKind(items, 1);
  // Indices of items the user emptied that have no valid value (a cleared number or select).
  // `list` keeps its last valid value there, but Run stays blocked until it is corrected or removed.
  const [blanks, setBlanks] = useState<ReadonlySet<number>>(new Set());
  const hasBlanks = blanks.size > 0;

  useEffect(() => {
    report(id, !hasBlanks);
  }, [report, id, hasBlanks]);
  useEffect(() => () => report(id, true), [report, id]);

  const setBlank = (index: number, blank: boolean) =>
    setBlanks((prev) => {
      if (prev.has(index) === blank) return prev;
      const next = new Set(prev);
      if (blank) next.add(index);
      else next.delete(index);
      return next;
    });

  const setItem = (index: number, next: unknown) => {
    // Clearing a text item leaves an empty string; any other item has no empty value.
    const cleared = next === undefined;
    const emptyText = cleared && itemKind === 'string';
    setBlank(index, cleared && !emptyText);
    if (cleared && !emptyText) return;
    onChange(list.map((x, j) => (j === index ? (emptyText ? '' : next) : x)));
  };

  const removeItem = (index: number) => {
    setBlanks(new Set([...blanks].filter((b) => b !== index).map((b) => (b > index ? b - 1 : b))));
    onChange(list.filter((_, j) => j !== index));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {list.map((item, i) => (
        <ArrayItem
          key={i}
          label={`${label} item ${i + 1}`}
          prop={items}
          kind={itemKind}
          value={blanks.has(i) ? undefined : item}
          blank={blanks.has(i)}
          onChange={(next) => setItem(i, next)}
          onRemove={() => removeItem(i)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="self-start gap-1"
        onClick={() => onChange([...list, emptyItem(items)])}
        aria-label={`Add ${label} item`}
      >
        <Plus size={12} />
        Add item
      </Button>
    </div>
  );
}

function ArrayItem({
  label,
  prop,
  kind,
  value,
  blank,
  onChange,
  onRemove,
}: Pick<PrimitiveControlProps, 'label' | 'prop' | 'kind' | 'value' | 'onChange'> & {
  blank: boolean;
  onRemove: () => void;
}) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <PrimitiveControl
          id={id}
          label={label}
          prop={prop}
          kind={kind}
          value={value}
          onChange={onChange}
          invalid={blank}
          describedBy={blank ? errorId : undefined}
        />
        {blank && (
          <p id={errorId} role="alert" className="text-xs text-destructive-text">
            Enter a value or remove this item
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <X size={12} />
      </Button>
    </div>
  );
}

interface PrimitiveControlProps {
  id: string;
  label: string;
  prop: SchemaProperty;
  kind: FieldKind;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
}

function PrimitiveControl({
  id,
  label,
  prop,
  kind,
  value,
  onChange,
  invalid,
  describedBy,
}: PrimitiveControlProps) {
  const aria = { 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy };
  if (kind === 'enum') {
    const options = prop.enum ?? [];
    const index = options.findIndex((o) => o === value);
    return (
      <select
        id={id}
        aria-label={label}
        {...aria}
        value={index === -1 ? '' : String(index)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : options[Number(e.target.value)])}
        className={SELECT_CLASS}
      >
        <option value="">—</option>
        {options.map((option, i) => (
          <option key={i} value={i} disabled={containsVariableSyntax(option)}>
            {typeof option === 'string' ? option : JSON.stringify(option)}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'boolean') {
    return (
      <select
        id={id}
        aria-label={label}
        {...aria}
        value={typeof value === 'boolean' ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
        className={SELECT_CLASS}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (kind === 'number') {
    return <NumberInput id={id} label={label} prop={prop} value={value} onChange={onChange} aria={aria} />;
  }
  return (
    <VariableInput
      id={id}
      aria-label={label}
      {...aria}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      placeholder={prop.default !== undefined && !containsVariableSyntax(prop.default) ? String(prop.default) : undefined}
      className="h-8 text-xs"
    />
  );
}

/** Keeps the typed text locally so "1." or "-" survive the number round-trip. */
function NumberInput({
  id,
  label,
  prop,
  value,
  onChange,
  aria,
}: Pick<PrimitiveControlProps, 'id' | 'label' | 'prop' | 'value' | 'onChange'> & {
  aria: Record<string, unknown>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft !== null && (draft === '' ? value === undefined : Number(draft) === value)
      ? draft
      : typeof value === 'number'
        ? String(value)
        : typeof value === 'string'
          ? value
          : '';

  return (
    <Input
      id={id}
      aria-label={label}
      {...aria}
      type="number"
      step={prop.type === 'integer' ? 1 : 'any'}
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        onChange(text === '' ? undefined : isNaN(n) ? text : n);
      }}
      placeholder={prop.default !== undefined && !containsVariableSyntax(prop.default) ? String(prop.default) : undefined}
      className="h-8 text-xs"
    />
  );
}
