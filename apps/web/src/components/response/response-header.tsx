import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { CopyButton } from './copy-button';
import { formatBytes } from './response-copy';

export type ResponseTab = 'pretty' | 'raw' | 'headers' | 'timeline';

export const RESPONSE_TABS: ResponseTab[] = ['pretty', 'raw', 'headers', 'timeline'];

interface ResponseHeaderProps {
  isHttp: boolean;
  hasResult: boolean;
  hasError: boolean;
  isToolError: boolean;
  isRunning: boolean;
  isCancelled?: boolean;
  latencyMs: number | null;
  sizeBytes: number | null;
  copyText: string | null;
}

export function ResponseHeader({
  isHttp,
  hasResult,
  hasError,
  isToolError,
  isRunning,
  isCancelled,
  latencyMs,
  sizeBytes,
  copyText,
}: ResponseHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Response
        </span>
        {hasResult && !isToolError && !hasError && (
          <span className="flex items-center gap-1 text-xs font-mono font-medium text-success-text">
            <CheckCircle2 size={12} />
            OK
          </span>
        )}
        {(hasError || isToolError) && (
          <span className="flex items-center gap-1 text-xs font-mono font-medium text-destructive-text">
            <XCircle size={12} />
            Error
          </span>
        )}
        {isCancelled && <span className="text-xs text-muted-foreground">Cancelled</span>}
        {isRunning && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="motion-safe:animate-spin" />
            Running…
          </span>
        )}
        {latencyMs !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Clock size={12} />
            {latencyMs}ms
          </span>
        )}
        {sizeBytes !== null && (
          <span className="text-xs text-muted-foreground font-mono">{formatBytes(sizeBytes)}</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <CopyButton text={copyText} />
        <TabsList aria-label="Response views" className="border-0">
          {RESPONSE_TABS.filter(tab => tab !== 'headers' || isHttp).map(tab => (
            <TabsTrigger key={tab} value={tab} className="px-3 py-1">
              {tab[0]!.toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  );
}
