import type { ResourceLink } from '@mcp-studio/types';
import { ExternalLink } from 'lucide-react';

export function ResourceLinkBlock({ block }: { block: ResourceLink }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
      <ExternalLink size={13} className="text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {block.name && (
            <span className="text-xs font-medium text-foreground">{block.name}</span>
          )}
          {block.mimeType && (
            <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
              {block.mimeType}
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground truncate block">{block.uri}</span>
        {block.description && (
          <p className="text-xs text-muted-foreground/80 mt-0.5">{block.description}</p>
        )}
      </div>
    </div>
  );
}
