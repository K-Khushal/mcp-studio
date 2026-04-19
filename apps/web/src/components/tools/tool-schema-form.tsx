import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getProperties, getRequired, resolveType } from './tool-schema-helpers';

interface SchemaFormProps {
  schema: Record<string, unknown>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function SchemaForm({ schema, values, onChange }: SchemaFormProps) {
  const properties = getProperties(schema);
  const required = getRequired(schema);
  const keys = Object.keys(properties);

  if (keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">This tool takes no parameters.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {keys.map((key) => {
        const prop = properties[key]!;
        const type = resolveType(prop);
        const isRequired = required.includes(key);
        const value = values[key] ?? '';
        const isComplex = type === 'object' || type === 'array';

        return (
          <div key={key} className="flex flex-col gap-1">
            <label className="flex items-center gap-1 text-xs font-medium text-foreground">
              {key}
              {isRequired && <span className="text-destructive">*</span>}
              {prop.enum && (
                <span className="text-muted-foreground font-normal">
                  ({(prop.enum as unknown[]).join(' | ')})
                </span>
              )}
            </label>
            {prop.description && (
              <p className="text-[10px] text-muted-foreground">{prop.description}</p>
            )}
            {isComplex ? (
              <Textarea
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                rows={3}
                className="text-xs font-mono resize-y"
                placeholder={type === 'object' ? '{}' : '[]'}
              />
            ) : type === 'boolean' ? (
              <select
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                className="h-8 rounded-md border border-input bg-muted px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <Input
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                type={type === 'number' || type === 'integer' ? 'number' : 'text'}
                placeholder={prop.default !== undefined ? String(prop.default) : ''}
                className="h-8 text-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
