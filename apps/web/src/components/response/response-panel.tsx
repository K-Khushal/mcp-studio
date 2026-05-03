import { useStore } from '@/store';
import { Inbox, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { TimelinePanel } from './timeline-panel';
import { ResponseHeader, type ResponseTab } from './response-header';
import { HeadersTab, buildEffectiveRequestHeaders } from './headers-tab';
import { PrettyTab, hasToolError } from './pretty-tab';

export function ResponsePanel() {
  const {
    response,
    connectionConfig,
    httpAuth,
    httpHeaders,
  } = useStore();
  const [activeTab, setActiveTab] = useState<ResponseTab>('pretty');

  const hasResult = response.result !== null;
  const hasError = response.error !== null;
  const isEmpty = !hasResult && !hasError && !response.isStreaming;
  const isToolError = hasResult && hasToolError(response.result);

  const latencyMs =
    response.completedAt && response.startedAt
      ? response.completedAt - response.startedAt
      : null;

  const isHttp = connectionConfig?.transport === 'http';

  const effectiveRequestHeaders = isHttp
    ? buildEffectiveRequestHeaders(httpHeaders, httpAuth)
    : null;

  return (
    <div className="flex flex-col bg-card h-full min-h-0">
      <ResponseHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasResult={hasResult}
        hasError={hasError}
        isToolError={isToolError}
        isStreaming={response.isStreaming}
        latencyMs={latencyMs}
      />

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
          <PrettyTab
            key={response.startedAt ?? 0}
            result={response.result}
            error={response.error}
          />
        ) : activeTab === 'raw' ? (
          hasError ? (
            <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">
              {response.error}
            </pre>
          ) : (
            <pre className="text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {JSON.stringify(response.result, null, 2)}
            </pre>
          )
        ) : activeTab === 'headers' ? (
          <HeadersTab
            isHttp={isHttp}
            httpStatus={response.httpStatus}
            httpResponseHeaders={response.httpResponseHeaders}
            effectiveRequestHeaders={effectiveRequestHeaders}
            httpAuth={httpAuth}
            hasResult={hasResult}
          />
        ) : (
          <TimelinePanel />
        )}
      </div>
    </div>
  );
}
