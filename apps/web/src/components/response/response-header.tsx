import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

export type ResponseTab = 'pretty' | 'raw' | 'headers' | 'timeline';

const TABS: ResponseTab[] = ['pretty', 'raw', 'headers', 'timeline'];

interface ResponseHeaderProps {
  activeTab: ResponseTab;
  onTabChange: (tab: ResponseTab) => void;
  hasResult: boolean;
  hasError: boolean;
  isToolError: boolean;
  isStreaming: boolean;
  latencyMs: number | null;
}

export function ResponseHeader({
  activeTab,
  onTabChange,
  hasResult,
  hasError,
  isToolError,
  isStreaming,
  latencyMs,
}: ResponseHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Response
        </span>
        {hasResult && !isToolError && !hasError && (
          <span className="flex items-center gap-1 text-xs font-mono font-medium text-success">
            <CheckCircle2 size={12} />
            OK
          </span>
        )}
        {(hasError || isToolError) && (
          <span className="flex items-center gap-1 text-xs font-mono font-medium text-destructive">
            <XCircle size={12} />
            Error
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Running…
          </span>
        )}
        {latencyMs !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Clock size={12} />
            {latencyMs}ms
          </span>
        )}
      </div>

      <div className="flex gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
