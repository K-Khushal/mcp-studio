import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import type { HttpAuth } from '@mcp-studio/types';

function HeaderTable({
  entries,
  maskKeys = [],
}: {
  entries: [string, string][];
  maskKeys?: string[];
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const toggleReveal = (idx: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
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
          {entries.map(([key, value], i) => {
            const isSensitive = maskKeys.some((k) => key.toLowerCase() === k.toLowerCase());
            const isRevealed = revealed.has(i);
            const display = isSensitive && !isRevealed ? '••••••••' : value;
            return (
              <tr key={`${key}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-1.5 text-primary/80 align-top">{key}</td>
                <td className="px-3 py-1.5 text-foreground break-all">
                  <span className="flex items-center gap-2">
                    <span>{display}</span>
                    {isSensitive && (
                      <button
                        onClick={() => toggleReveal(i)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isRevealed ? 'Hide value' : 'Reveal value'}
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

export function buildEffectiveRequestHeaders(
  headers: Record<string, string>,
  auth: HttpAuth | undefined,
): Record<string, string> {
  const result = { ...headers };
  if (auth?.type === 'bearer' && auth.token) {
    result['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth?.type === 'apikey' && auth.key && auth.value && auth.in === 'header') {
    result[auth.key] = auth.value;
  }
  return result;
}

function buildRequestMaskKeys(auth: HttpAuth | undefined): string[] {
  const keys = ['authorization'];
  if (auth?.type === 'apikey' && auth.in === 'header' && auth.key) {
    keys.push(auth.key.toLowerCase());
  }
  return keys;
}

interface HeadersTabProps {
  isHttp: boolean;
  httpStatus: number | null;
  httpResponseHeaders: Record<string, string> | null;
  effectiveRequestHeaders: Record<string, string> | null;
  httpAuth: HttpAuth | undefined;
  hasResult: boolean;
}

export function HeadersTab({
  isHttp,
  httpStatus,
  httpResponseHeaders,
  effectiveRequestHeaders,
  httpAuth,
  hasResult,
}: HeadersTabProps) {
  if (!isHttp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-1">
        <span>STDIO transport</span>
        <span className="text-xs">HTTP headers are not applicable for STDIO connections</span>
      </div>
    );
  }

  const requestMaskKeys = buildRequestMaskKeys(httpAuth);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Response Headers
          </span>
          {httpStatus !== null && (
            <span
              className={cn(
                'text-xs font-mono font-medium px-1.5 py-0.5 rounded',
                httpStatus >= 200 && httpStatus < 300
                  ? 'bg-success/15 text-success'
                  : httpStatus >= 400
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-warning/15 text-warning',
              )}
            >
              {httpStatus}
            </span>
          )}
        </div>
        {httpResponseHeaders && Object.keys(httpResponseHeaders).length > 0 ? (
          <HeaderTable entries={Object.entries(httpResponseHeaders)} />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            {!hasResult ? 'Send a request to see response headers' : 'No response headers received'}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Request Headers
          </span>
        </div>
        {effectiveRequestHeaders && Object.keys(effectiveRequestHeaders).length > 0 ? (
          <HeaderTable
            entries={Object.entries(effectiveRequestHeaders)}
            maskKeys={requestMaskKeys}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">No request headers configured</p>
        )}
      </div>
    </div>
  );
}
