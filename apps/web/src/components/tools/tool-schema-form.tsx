import { createContext, useCallback, useContext, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { JsonTextarea } from './json-textarea';
import {
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
  'h-8 rounded-md border border-input bg-muted px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary';

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

  if (kind === 'object') {
    const current = isPlainObject(value) ? value : {};
    return (
      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend className="flex items-center gap-1 px-1 text-xs font-medium text-foreground">
          {name}
          {required && <RequiredMark />}
        </legend>
        {prop.description && <p className="text-[10px] text-muted-foreground">{prop.description}</p>}
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
      {prop.description && <p className="text-[10px] text-muted-foreground">{prop.description}</p>}
      {kind === 'json' ? (
        <JsonField id={id} label={name} value={value} onChange={onChange} />
      ) : kind === 'primitive-array' ? (
        <ArrayControl label={name} prop={prop} value={value} onChange={onChange} />
      ) : (
        <PrimitiveControl id={id} label={name} prop={prop} kind={kind} value={value} onChange={onChange} />
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
    <span className="text-destructive" aria-label="required">
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
  if (kind === 'enum') return items.enum![0];
  return '';
}

function ArrayControl({
  label,
  prop,
  value,
  onChange,
}: Pick<FieldProps, 'prop' | 'value' | 'onChange'> & { label: string }) {
  const items = prop.items!;
  const list = Array.isArray(value) ? value : [];
  const itemKind = fieldKind(items, 1);

  return (
    <div className="flex flex-col gap-1.5">
      {list.map((item, i) => (
        <ArrayItem
          key={i}
          label={`${label} item ${i + 1}`}
          prop={items}
          kind={itemKind}
          value={item}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? (next === undefined ? null : next) : x)))}
          onRemove={() => onChange(list.filter((_, j) => j !== i))}
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
  onChange,
  onRemove,
}: Pick<PrimitiveControlProps, 'label' | 'prop' | 'kind' | 'value' | 'onChange'> & {
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0 flex flex-col">
        <PrimitiveControl id={id} label={label} prop={prop} kind={kind} value={value} onChange={onChange} />
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
}

function PrimitiveControl({ id, label, prop, kind, value, onChange }: PrimitiveControlProps) {
  if (kind === 'enum') {
    const options = prop.enum ?? [];
    const index = options.findIndex((o) => o === value);
    return (
      <select
        id={id}
        aria-label={label}
        value={index === -1 ? '' : String(index)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : options[Number(e.target.value)])}
        className={SELECT_CLASS}
      >
        <option value="">—</option>
        {options.map((option, i) => (
          <option key={i} value={i}>
            {String(option)}
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
    return <NumberInput id={id} label={label} prop={prop} value={value} onChange={onChange} />;
  }
  return (
    <Input
      id={id}
      aria-label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      placeholder={prop.default !== undefined ? String(prop.default) : ''}
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
}: Pick<PrimitiveControlProps, 'id' | 'label' | 'prop' | 'value' | 'onChange'>) {
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
      type="number"
      step={prop.type === 'integer' ? 1 : 'any'}
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        onChange(text === '' ? undefined : isNaN(n) ? text : n);
      }}
      placeholder={prop.default !== undefined ? String(prop.default) : ''}
      className="h-8 text-xs"
    />
  );
}
