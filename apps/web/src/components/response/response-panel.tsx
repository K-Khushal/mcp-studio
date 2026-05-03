import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Copy, Inbox, Loader2, XCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { TimelinePanel } from './timeline-pannel';
import { JsonViewer } from './json-viewer';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { HttpAuth } from '@mcp-studio/types';

function buildEffectiveRequestHeaders(
  headers: Record<string, string>,
  auth: HttpAuth | undefined
): Record<string, string> {
  const result = { ...headers };
  if (auth?.type === 'bearer' && auth.token) {
    result['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth?.type === 'apikey' && auth.key && auth.in === 'header') {
    result[auth.key] = auth.value;
  }
  return result;
}

function HeaderTable({ entries, maskKeys = [] }: { entries: [string, string][]; maskKeys?: string[] }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-2/5">Key</th>
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => {
            const isSensitive = maskKeys.some((k) => key.toLowerCase() === k.toLowerCase());
            const isRevealed = revealed.has(key);
            const display = isSensitive && !isRevealed ? '••••••••' : value;
            return (
              <tr key={key} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-1.5 text-primary/80 align-top">{key}</td>
                <td className="px-3 py-1.5 text-foreground break-all">
                  <span className="flex items-center gap-2">
                    <span>{display}</span>
                    {isSensitive && (
                      <button
                        onClick={() => toggleReveal(key)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ResponsePanel() {
  const { response, connectionConfig, connectionStatus, selectedRequestId, connectedRequestId, httpAuth, httpHeaders } = useStore();
  const [activeTab, setActiveTab] = useState<'pretty' | 'raw' | 'headers' | 'timeline'>('pretty');
  const [isCopied, setIsCopied] = useState(false);
  const isSelectedRequestConnected =
    connectionStatus === 'connected' && selectedRequestId === connectedRequestId;

  const tabs = ['pretty', 'raw', 'headers', 'timeline'] as const;

  const hasResult = response.result !== null;
  const hasError = response.error !== null;
  const isEmpty = !hasResult && !hasError && !response.isStreaming;

  const latencyMs = response.completedAt && response.startedAt
    ? response.completedAt - response.startedAt
    : null;

  const isHttp = connectionConfig?.transport === 'http';

  const effectiveRequestHeaders = isHttp
    ? buildEffectiveRequestHeaders(httpHeaders, httpAuth)
    : null;

  const handleCopy = async () => {
    if (!response.result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(response.result, null, 2));
      setIsCopied(true);
      toast.success('Response copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy response');
    }
  };

  return (
    <div className="flex flex-col bg-card h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</span>
          {hasResult && (
            <span className="flex items-center gap-1 text-xs font-mono font-medium text-success">
              <CheckCircle2 size={12} />
              OK
            </span>
          )}
          {hasError && (
            <span className="flex items-center gap-1 text-xs font-mono font-medium text-destructive">
              <XCircle size={12} />
              Error
            </span>
          )}
          {response.isStreaming && (
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
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                  activeTab === tab
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          {hasResult && (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopy}
                title="Copy response"
                className="text-muted-foreground hover:text-foreground"
              >
                {isCopied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {response.isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 size={20} className="animate-spin opacity-50" />
            Waiting for response…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Inbox size={20} className="opacity-30" />
            Send a request to see the response
          </div>
        ) : activeTab === 'pretty' ? (
          hasError ? (
            <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">{response.error}</pre>
          ) : (
            <JsonViewer data={response.result} />
          )
        ) : activeTab === 'raw' ? (
          hasError ? (
            <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">{response.error}</pre>
          ) : (
            <pre className="text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {JSON.stringify(response.result, null, 2)}
            </pre>
          )
        ) : activeTab === 'headers' ? (
          !isHttp ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-1">
              <span>STDIO transport</span>
              <span className="text-xs">HTTP headers are not applicable for STDIO connections</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Response Headers */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response Headers</span>
                  {response.httpStatus !== null && (
                    <span className={cn(
                      'text-xs font-mono font-medium px-1.5 py-0.5 rounded',
                      response.httpStatus >= 200 && response.httpStatus < 300
                        ? 'bg-success/15 text-success'
                        : response.httpStatus >= 400
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-warning/15 text-warning'
                    )}>
                      {response.httpStatus}
                    </span>
                  )}
                </div>
                {response.httpResponseHeaders && Object.keys(response.httpResponseHeaders).length > 0 ? (
                  <HeaderTable entries={Object.entries(response.httpResponseHeaders)} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    {isEmpty ? 'Send a request to see response headers' : 'No response headers received'}
                  </p>
                )}
              </div>

              {/* Request Headers */}
              <div>
                <div className="mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request Headers</span>
                </div>
                {effectiveRequestHeaders && Object.keys(effectiveRequestHeaders).length > 0 ? (
                  <HeaderTable entries={Object.entries(effectiveRequestHeaders)} maskKeys={['authorization', 'x-api-key']} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">No request headers configured</p>
                )}
              </div>
            </div>
          )
        ) : (
          <TimelinePanel />
        )}
      </div>
    </div>
  );
}
