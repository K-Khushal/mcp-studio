import { HelpCircle } from 'lucide-react';

export function UnsupportedBlock({ type, mimeType }: { type: string; mimeType?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2.5 bg-muted/20 text-muted-foreground">
      <HelpCircle size={13} className="shrink-0" />
      <span className="text-xs font-mono">
        {type} {mimeType ? `(${mimeType})` : ''} — rendering not yet supported
      </span>
    </div>
  );
}
