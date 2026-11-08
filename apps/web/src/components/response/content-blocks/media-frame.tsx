import { Download } from 'lucide-react';
import type { ReactNode } from 'react';

interface MediaFrameProps {
  icon: ReactNode;
  mimeType: string;
  href: string;
  filename: string;
  children: ReactNode;
}

export function MediaFrame({ icon, mimeType, href, filename, children }: MediaFrameProps) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
          {mimeType}
        </span>
        <a
          href={href}
          download={filename}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Download size={12} />
          Download
        </a>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
