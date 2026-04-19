import { useState, useEffect, useCallback } from 'react';
import { Search, Play, ChevronRight } from 'lucide-react';
import { useStore } from '@/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { MCPTool } from '@mcp-studio/types';

// ---------------------------------------------------------------------------
// JSON Schema → form field helpers
// ---------------------------------------------------------------------------

interface SchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

function getProperties(schema: Record<string, unknown>): Record<string, SchemaProperty> {
  const props = schema['properties'];
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    return props as Record<string, SchemaProperty>;
  }
  return {};
}

function getRequired(schema: Record<string, unknown>): string[] {
  const req = schema['required'];
  return Array.isArray(req) ? (req as string[]) : [];
}

function resolveType(prop: SchemaProperty): string {
  const t = Array.isArray(prop.type)
    ? prop.type.find((x) => x !== 'null') ?? 'string'
    : prop.type ?? 'string';
  return t as string;
}

function defaultValue(prop: SchemaProperty): string {
  if (prop.default !== undefined) return String(prop.default);
  const t = resolveType(prop);
  if (t === 'boolean') return 'false';
  if (t === 'number' || t === 'integer') return '';
  if (t === 'object' || t === 'array') return t === 'object' ? '{}' : '[]';
  return '';
}

// ---------------------------------------------------------------------------
// SchemaForm — renders fields for a tool's inputSchema
// ---------------------------------------------------------------------------

interface SchemaFormProps {
  schema: Record<string, unknown>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function SchemaForm({ schema, values, onChange }: SchemaFormProps) {
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
                className="h-8 rounded-md border border-input bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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

// ---------------------------------------------------------------------------
// Build params object from form string values
// ---------------------------------------------------------------------------

function buildParams(
  schema: Record<string, unknown>,
  values: Record<string, string>
): Record<string, unknown> {
  const properties = getProperties(schema);
  const result: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined) continue;
    const prop = properties[key];
    const type = prop ? resolveType(prop) : 'string';

    if (type === 'number' || type === 'integer') {
      const n = Number(raw);
      if (!isNaN(n)) result[key] = n;
    } else if (type === 'boolean') {
      result[key] = raw === 'true';
    } else if (type === 'object' || type === 'array') {
      try {
        result[key] = JSON.parse(raw);
      } catch {
        result[key] = raw;
      }
    } else {
      result[key] = raw;
    }
  }

  return result;
}

// Seed form state from pending params (Record<string, unknown> → Record<string, string>)
function seedValues(
  schema: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, string> {
  const properties = getProperties(schema);
  const seeded: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    const prop = properties[key];
    const type = prop ? resolveType(prop) : 'string';
    if (type === 'object' || type === 'array') {
      seeded[key] = JSON.stringify(val, null, 2);
    } else {
      seeded[key] = val !== undefined && val !== null ? String(val) : '';
    }
  }
  return seeded;
}

// ---------------------------------------------------------------------------
// ToolPanel
// ---------------------------------------------------------------------------

export default function ToolPanel() {
  const {
    connectionStatus,
    tools,
    selectedTool,
    toolSearch,
    pendingParams,
    response,
    selectTool,
    setToolSearch,
    invokeTool,
    clearPendingParams,
  } = useStore();

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Reset form when tool changes
  useEffect(() => {
    if (!selectedTool) {
      setFormValues({});
      return;
    }
    const defaults: Record<string, string> = {};
    const properties = getProperties(selectedTool.inputSchema);
    for (const [key, prop] of Object.entries(properties)) {
      defaults[key] = defaultValue(prop);
    }
    setFormValues(defaults);
  }, [selectedTool?.name]);

  // Apply pending params (from saved request) on top of defaults
  useEffect(() => {
    if (!pendingParams || !selectedTool) return;
    setFormValues((prev) => ({
      ...prev,
      ...seedValues(selectedTool.inputSchema, pendingParams),
    }));
    clearPendingParams();
  }, [pendingParams, selectedTool?.name]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleInvoke = useCallback(() => {
    if (!selectedTool) return;
    const params = buildParams(selectedTool.inputSchema, formValues);
    invokeTool(selectedTool.name, params).catch(console.error);
  }, [selectedTool, formValues, invokeTool]);

  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.description?.toLowerCase().includes(toolSearch.toLowerCase())
  );

  if (connectionStatus !== 'connected') {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to an MCP server to discover tools
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Tool list */}
      <div className="w-48 shrink-0 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="Filter tools..."
              className="h-7 pl-6 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No tools found</p>
          )}
          {filtered.map((tool) => (
            <ToolListItem
              key={tool.name}
              tool={tool}
              isSelected={selectedTool?.name === tool.name}
              onSelect={selectTool}
            />
          ))}
        </div>
      </div>

      {/* Tool form */}
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-y-auto">
        {!selectedTool ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronRight size={12} />
            Select a tool to get started
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{selectedTool.name}</h3>
              {selectedTool.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTool.description}</p>
              )}
            </div>

            <SchemaForm
              schema={selectedTool.inputSchema}
              values={formValues}
              onChange={handleFieldChange}
            />

            <div className="flex justify-end pt-2 border-t border-border mt-auto">
              <Button
                size="sm"
                onClick={handleInvoke}
                disabled={response.isStreaming}
                className="gap-1.5 text-xs"
              >
                <Play size={12} />
                {response.isStreaming ? 'Running…' : 'Run Tool'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Separate component to avoid re-rendering the list on every keystroke
const ToolListItem = ({
  tool,
  isSelected,
  onSelect,
}: {
  tool: MCPTool;
  isSelected: boolean;
  onSelect: (tool: MCPTool) => void;
}) => (
  <button
    onClick={() => onSelect(tool)}
    className={cn(
      'w-full text-left px-3 py-2 text-xs transition-colors',
      isSelected
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
    )}
  >
    <span className="block truncate font-mono">{tool.name}</span>
    {tool.description && (
      <span className="block truncate text-[10px] opacity-70 mt-0.5">{tool.description}</span>
    )}
  </button>
);
