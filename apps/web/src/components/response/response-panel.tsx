import { useStore } from '@/store';
import { useState } from 'react';
import { TimelinePanel } from './timeline-panel';
import { ResponseHeader, type ResponseTab } from './response-header';
import { HeadersTab, buildEffectiveRequestHeaders } from './headers-tab';
import { PrettyTab, hasToolError } from './pretty-tab';
import { RawTab } from './raw-tab';
import { EmptyState } from './empty-state';
import { LoadingState } from './loading-state';
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
  const isEmpty = !hasResult && !hasError && !response.isStreaming;
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
        isStreaming={response.isStreaming}
        latencyMs={latencyMs}
        sizeBytes={getResponseSize(response.result, response.error)}
        copyText={copyText}
      />

      <div className="flex-1 overflow-auto p-4">
        {response.isStreaming ? (
          <LoadingState />
        ) : isEmpty ? (
          <EmptyState />
        ) : activeTab === 'pretty' ? (
          <PrettyTab
            key={response.startedAt ?? 0}
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
