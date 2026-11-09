import { useStore } from '@/store';
import { useState } from 'react';
import { TimelinePanel } from './timeline-panel';
import { ResponseHeader, type ResponseTab } from './response-header';
import { HeadersTab, buildEffectiveRequestHeaders } from './headers-tab';
import { PrettyTab, hasToolError } from './pretty-tab';
import { RawTab } from './raw-tab';
import { EmptyState } from './empty-state';
import { LoadingState, LiveCallStatus } from './loading-state';
import { getCopyText, getResponseSize } from './response-copy';

export function ResponsePanel() {
  const {
    response,
    connectionConfig,
    httpAuth,
    httpHeaders,
    timeline,
  } = useStore();
  const [activeTab, setActiveTab] = useState<ResponseTab>('pretty');

  const hasResult = response.result !== null;
  const hasError = response.error !== null;
  const isEmpty = !hasResult && !hasError && !response.isRunning;
  const isToolError = hasResult && hasToolError(response.result);

  const latencyMs =
    response.completedAt && response.startedAt
      ? response.completedAt - response.startedAt
      : null;

  const copyText = getCopyText(
    activeTab,
    response.result,
    response.error,
    response.httpResponseHeaders,
    timeline,
  );

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
        isRunning={response.isRunning}
        isCancelled={response.outcome === "cancelled"}
        latencyMs={latencyMs}
        sizeBytes={getResponseSize(response.result, response.error)}
        copyText={copyText}
      />

      {response.isRunning && <LiveCallStatus />}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'timeline' ? (
          <TimelinePanel />
        ) : response.isRunning ? (
          <LoadingState />
        ) : response.outcome === "cancelled" ? (
          <p className="text-sm text-muted-foreground">Call cancelled.</p>
        ) : isEmpty ? (
          <EmptyState />
        ) : activeTab === 'pretty' ? (
          <PrettyTab
            key={response.startedAt ?? 0}
            outputSchema={response.outputSchema}
            result={response.result}
            error={response.error}
          />
        ) : activeTab === 'raw' ? (
          <RawTab result={response.result} error={response.error} />
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
