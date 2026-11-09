import { useState } from 'react';
import { Wrench } from 'lucide-react';
import type { MCPTool } from '@mcp-studio/types';

export const toolTitle = (tool: MCPTool) => tool.title || tool.annotations?.title || tool.name;

export function ToolIcon({ tool }: { tool: MCPTool }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = tool.icons?.find(icon => /^(https:\/\/|data:image\/)/i.test(icon.src))?.src;
  return src && failedSrc !== src
    ? <img src={src} alt={`${toolTitle(tool)} icon`} width={16} height={16} className="size-4 shrink-0 object-contain" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
    : <Wrench size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const hints = [
  ['readOnlyHint', 'Read-only', 'May write'],
  ['destructiveHint', 'Destructive', 'Non-destructive'],
  ['idempotentHint', 'Idempotent', 'Non-idempotent'],
  ['openWorldHint', 'Open-world', 'Closed-world'],
] as const;

/** `compact` (list rows) keeps only the warning-worthy Destructive hint; the detail header shows all. */
export function ToolBadges({ tool, compact = false }: { tool: MCPTool; compact?: boolean }) {
  const shown = hints.filter(([key]) => {
    const value = tool.annotations?.[key];
    return value !== undefined && (!compact || (key === 'destructiveHint' && value));
  });
  if (shown.length === 0) return null;
  return <span className="mt-1 flex flex-wrap gap-1">
    {shown.map(([key, yes, no]) => {
      const value = tool.annotations?.[key];
      return <span key={key} title={`MCP Server hint: ${key} = ${value}. Hints are not guarantees.`}
        className={`rounded border px-1 py-0.5 text-xs leading-3 ${key === 'destructiveHint' && value ? 'border-destructive/40 text-destructive-text' : 'border-border text-muted-foreground'}`}>
        {value ? yes : no}
      </span>;
    })}
  </span>;
}
