import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonNodeProps {
  data: unknown;
  label?: string;
  isLast?: boolean;
}

function JsonPrimitive({ data }: { data: unknown }) {
  if (data === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof data === 'string') return <span className="text-success">"{data}"</span>;
  if (typeof data === 'number') return <span className="text-warning">{data}</span>;
  if (typeof data === 'boolean') return <span className="text-primary">{String(data)}</span>;
  return <span className="text-foreground">{String(data)}</span>;
}

function CollapsibleNode({
  label,
  children,
  summary,
  isLast,
}: {
  label?: string;
  children: React.ReactNode;
  summary: string;
  isLast?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -ml-1 py-0.5 transition-colors group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {label && (
          <span className="text-primary/80 font-medium">
            "{label}"<span className="text-muted-foreground">: </span>
          </span>
        )}
        {!isOpen && (
          <span className="text-muted-foreground text-[10px] font-mono bg-muted px-1 rounded">
            {summary}
          </span>
        )}
        {!isOpen && !isLast && <span className="text-muted-foreground">,</span>}
      </div>
      {isOpen && (
        <div className="pl-4 border-l border-border/50 ml-1.5 mt-0.5">
          {children}
        </div>
      )}
      {isOpen && !isLast && <div className="text-muted-foreground -mt-0.5">,</div>}
    </div>
  );
}

function JsonNode({ data, label, isLast }: JsonNodeProps) {
  if (data === null || typeof data !== 'object') {
    return (
      <div className="flex items-start gap-1 px-1 py-0.5">
        {label && (
          <span className="text-primary/80 font-medium">
            "{label}"<span className="text-muted-foreground">: </span>
          </span>
        )}
        <JsonPrimitive data={data} />
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  if (Array.isArray(data)) {
    const summary = `Array(${data.length})`;
    return (
      <CollapsibleNode label={label} summary={summary} isLast={isLast}>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-[10px] font-mono mb-1">
            [
          </span>
          {data.map((item, i) => (
            <JsonNode key={i} data={item} isLast={i === data.length - 1} />
          ))}
          <span className="text-muted-foreground text-[10px] font-mono mt-1">
            ]
          </span>
        </div>
      </CollapsibleNode>
    );
  }

  const keys = Object.keys(data as object);
  const summary = `Object(${keys.length} keys)`;
  return (
    <CollapsibleNode label={label} summary={summary} isLast={isLast}>
      <div className="flex flex-col">
        <span className="text-muted-foreground text-[10px] font-mono mb-1">
          {'{'}
        </span>
        {keys.map((key, i) => (
          <JsonNode
            key={key}
            label={key}
            data={(data as Record<string, unknown>)[key]}
            isLast={i === keys.length - 1}
          />
        ))}
        <span className="text-muted-foreground text-[10px] font-mono mt-1">
          {'}'}
        </span>
      </div>
    </CollapsibleNode>
  );
}

export function JsonViewer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <div className="text-muted-foreground italic p-4">Empty response</div>
    );
  }

  return (
    <div className="font-mono text-xs leading-relaxed">
      <JsonNode data={data} isLast={true} />
    </div>
  );
}
