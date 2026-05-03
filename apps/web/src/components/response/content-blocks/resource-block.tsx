import type { EmbeddedResource } from '@mcp-studio/types';
import { FileText, Package } from 'lucide-react';
import { JsonViewer } from '../json-viewer';
import { tryParseJson } from './utils';

function TextResourceContent({ text }: { text: string }) {
  const parsed = tryParseJson(text);
  if (parsed !== null) return <JsonViewer data={parsed} />;
  return (
    <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}

export function ResourceBlock({ block }: { block: EmbeddedResource }) {
  const { resource } = block;
  const hasText = 'text' in resource && resource.text !== undefined;
  const hasBlob = 'blob' in resource && resource.blob !== undefined;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <Package size={12} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-mono text-muted-foreground truncate flex-1">{resource.uri}</span>
        {resource.mimeType && (
          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 bg-muted px-1.5 py-0.5 rounded">
            {resource.mimeType}
          </span>
        )}
      </div>

      <div className="p-3">
        {hasText ? (
          <TextResourceContent text={resource.text!} />
        ) : hasBlob ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText size={12} />
            <span>Binary data ({resource.mimeType ?? 'unknown type'})</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">No content</span>
        )}
      </div>
    </div>
  );
}
