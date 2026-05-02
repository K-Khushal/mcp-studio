import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Inbox, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { TimelinePanel } from './timeline-pannel';

function JsonView({ data, indent = 0 }: { data: unknown; indent?: number }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground">null</span>;
  if (typeof data === 'string') return <span className="text-success">"{data}"</span>;
  if (typeof data === 'number') return <span className="text-warning">{data}</span>;
  if (typeof data === 'boolean') return <span className="text-primary">{String(data)}</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <span>
        {'[\n'}
        {data.map((item, i) => (
          <span key={i}>
            {'  '.repeat(indent + 1)}
            <JsonView data={item} indent={indent + 1} />
            {i < data.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {'  '.repeat(indent)}{']'}
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return <span>{'{}'}</span>;
    return (
      <span>
        {'{\n'}
        {keys.map((key, i) => (
          <span key={key}>
            {'  '.repeat(indent + 1)}
            <span className="text-primary/80">"{key}"</span>
            {': '}
            <JsonView data={(data as Record<string, unknown>)[key]} indent={indent + 1} />
            {i < keys.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {'  '.repeat(indent)}{'}'}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

export function ResponsePanel() {
  const { response, connectionConfig, connectionStatus, selectedRequestId, connectedRequestId } = useStore();
  const [activeTab, setActiveTab] = useState<'pretty' | 'raw' | 'headers' | 'timeline'>('pretty');
  const isSelectedRequestConnected =
    connectionStatus === 'connected' && selectedRequestId === connectedRequestId;

  const tabs = ['pretty', 'raw', 'headers', 'timeline'] as const;

  const hasResult = response.result !== null;
  const hasError = response.error !== null;
  const isEmpty = !hasResult && !hasError && !response.isStreaming;

  const latencyMs = response.completedAt && response.startedAt
    ? response.completedAt - response.startedAt
    : null;

  const configuredHeaders =
    isSelectedRequestConnected && connectionConfig?.transport === 'http'
      ? connectionConfig.config.headers
      : null;

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
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
              <JsonView data={response.result} />
            </pre>
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
          configuredHeaders && Object.keys(configuredHeaders).length > 0 ? (
            <div className="flex flex-col gap-1">
              {Object.entries(configuredHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs font-mono">
                  <span className="text-primary/80">{k}:</span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-1">
              <span>No request headers</span>
              <span className="text-xs">
                {connectionConfig?.transport === 'stdio'
                  ? 'STDIO transport — headers not applicable'
                  : 'No headers configured for this HTTP connection'}
              </span>
            </div>
          )
        ) : (
          <TimelinePanel />
        )}
      </div>
    </div>
  );
}
