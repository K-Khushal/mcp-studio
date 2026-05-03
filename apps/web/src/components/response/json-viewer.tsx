import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'opacity-0 group-hover:opacity-100 ml-1 p-0.5 rounded transition-all',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
      aria-label="Copy value"
      title="Copy value"
    >
      {copied ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
    </button>
  );
}

function PrimitiveValue({ value }: { value: string | number | boolean | null }) {
  const isNull = value === null;
  const isString = typeof value === 'string';
  const isNumber = typeof value === 'number';
  const isBool = typeof value === 'boolean';

  const display = isNull ? 'null' : isString ? `"${value}"` : String(value);
  const copyText = isNull ? 'null' : String(value);

  return (
    <span
      className={cn(
        'group inline-flex items-center',
        isNull && 'text-muted-foreground italic',
        isString && 'text-emerald-400',
        isNumber && 'text-amber-400',
        isBool && 'text-sky-400',
      )}
    >
      <span>{display}</span>
      <CopyButton text={copyText} />
    </span>
  );
}

function KeyLabel({ name }: { name: string | number }) {
  return (
    <span className="text-rose-300 font-medium">
      {typeof name === 'string' ? `"${name}"` : name}
      <span className="text-muted-foreground mx-1 font-normal">:</span>
    </span>
  );
}

function CollapsedBadge({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground/70 text-[10px] font-mono bg-muted/60 px-1.5 py-px rounded-full mx-1">
      {label}
    </span>
  );
}

interface JsonNodeProps {
  keyName?: string | number;
  value: unknown;
  depth: number;
  isLast: boolean;
  defaultExpanded?: boolean;
}

function JsonNode({ keyName, value, depth, isLast, defaultExpanded = false }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div className="group flex items-center text-xs leading-6 min-w-0">
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <PrimitiveValue value={value as string | number | boolean | null} />
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as [number | string, unknown])
    : Object.entries(value as Record<string, unknown>);

  const count = entries.length;
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const collapsedLabel = isArray ? `${count} item${count !== 1 ? 's' : ''}` : `${count} key${count !== 1 ? 's' : ''}`;

  return (
    <div>
      <div
        className="group flex items-center gap-0.5 cursor-pointer select-none rounded -mx-0.5 px-0.5 hover:bg-muted/30 text-xs leading-6"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-muted-foreground">{openBracket}</span>
        {!expanded && (
          <>
            <CollapsedBadge label={collapsedLabel} />
            <span className="text-muted-foreground">{closeBracket}</span>
          </>
        )}
        {!isLast && !expanded && <span className="text-muted-foreground">,</span>}
      </div>

      {expanded && (
        <div className="ml-3.5 pl-3 border-l border-border/30">
          {entries.map(([key, val], i) => (
            <JsonNode
              key={String(key)}
              keyName={key}
              value={val}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              defaultExpanded={depth < 1}
            />
          ))}
        </div>
      )}

      {expanded && (
        <div className="flex items-center text-xs leading-6">
          <span className="w-3.5 shrink-0" />
          <span className="text-muted-foreground">{closeBracket}</span>
          {!isLast && <span className="text-muted-foreground">,</span>}
        </div>
      )}
    </div>
  );
}

export function JsonViewer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <div className="text-muted-foreground italic text-xs p-2">Empty response</div>;
  }

  return (
    <div className="font-mono text-xs leading-relaxed">
      <JsonNode value={data} depth={0} isLast={true} defaultExpanded={true} />
    </div>
  );
}
