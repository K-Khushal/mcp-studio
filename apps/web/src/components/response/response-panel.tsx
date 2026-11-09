import { useStore } from '@/store';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useState } from 'react';
import { TimelinePanel } from './timeline-panel';
import { ResponseHeader, RESPONSE_TABS, type ResponseTab } from './response-header';
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
  const [selectedTab, setActiveTab] = useState<ResponseTab>('pretty');
  const isHttp = connectionConfig?.transport === 'http';
  const activeTab = selectedTab === 'headers' && !isHttp ? 'pretty' : selectedTab;

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

  const effectiveRequestHeaders = isHttp
    ? buildEffectiveRequestHeaders(httpHeaders, httpAuth)
    : null;

  return (
    <Tabs data-testid="response" value={activeTab} onValueChange={value => setActiveTab(value as ResponseTab)} className="flex flex-col bg-card h-full min-h-0">
      <ResponseHeader
        isHttp={isHttp}
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
      {RESPONSE_TABS.filter(tab => tab !== 'headers' || isHttp).map(tab => (
        <TabsContent key={tab} value={tab} className="overflow-auto p-4">
          {tab === 'timeline' ? (
            <TimelinePanel />
          ) : response.isRunning ? (
            <LoadingState />
          ) : response.outcome === "cancelled" ? (
            <p className="text-sm text-muted-foreground">Call cancelled.</p>
          ) : isEmpty ? (
            <EmptyState />
          ) : tab === 'pretty' ? (
            <PrettyTab
              key={response.startedAt ?? 0}
              outputSchema={response.outputSchema}
              result={response.result}
              error={response.error}
            />
          ) : tab === 'raw' ? (
            <RawTab result={response.result} error={response.error} />
          ) : tab === 'headers' ? (
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
        </TabsContent>
      ))}
    </Tabs>
  );
}
