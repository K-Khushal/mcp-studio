import { useStore } from '@/store/index';
import { cn } from '@/lib/utils';
import { STATUS } from './session-info';
import { Activity, AlertCircle, Clock, FileText, Timer } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/**
 * UptimeTimer — intentionally isolated.
 *
 * Only this component re-renders on every 1s tick. StatusBar itself is
 * unaffected by the interval. `tabular-nums` + `min-w` prevent layout
 * shifts when the formatted string changes length ("9s" → "10s", etc.).
 */
const UptimeTimer = memo(({ connectedAt }: { connectedAt: number }) => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]); // restart cleanly on reconnect

  return (
    <div className="flex items-center gap-1" title="Session uptime">
      <Timer size={11} />
      <span className="tabular-nums min-w-9">{formatUptime(now - connectedAt)}</span>
    </div>
  );
});
UptimeTimer.displayName = 'UptimeTimer';

/**
 * StatusBar — each field uses its own narrow selector so only the field
 * that actually changed causes a re-render. The uptime ticker is fully
 * isolated in UptimeTimer and never re-renders this component.
 */
export function StatusBar() {
  // Narrow per-field selectors — primitives, so reference-equal on no change
  const connectionStatus = useStore((s) => s.connectionStatus);
  const httpVariant = useStore((s) => s.httpVariant);
  const latency          = useStore((s) => s.latency);
  const requestCount     = useStore((s) => s.requestCount);
  const errorCount       = useStore((s) => s.errorCount);
  const connectedAt      = useStore((s) => s.connectedAt);

  // Derive Connection name in a single selector — returns a string (primitive)
  // so Zustand only re-renders if the name itself changes.
  const connectedConnectionName = useStore((s) => {
    if (!s.connectedConnectionId) return null;
    for (const c of s.collections) {
      const r = c.connections.find((r) => r.id === s.connectedConnectionId);
      if (r) return r.name;
    }
    return null;
  });

  const { label: statusLabel, dot: statusDot } = STATUS[connectionStatus];

  return (
    <div className="flex items-center h-7 px-4 border-t border-border bg-background text-xs text-muted-foreground gap-4 shrink-0 overflow-hidden whitespace-nowrap">
      {/* Active Connection name */}
      {connectedConnectionName && (
        <div className="flex items-center gap-1 min-w-0">
          <FileText size={11} className="shrink-0" />
          <span className="font-mono truncate max-w-[40ch]" title={connectedConnectionName}>{connectedConnectionName}</span>
        </div>
      )}

      {/* Connection status dot + label */}
      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDot)} aria-hidden />
        <span>{statusLabel}</span>
      </div>

      {connectionStatus === 'connected' && (
        <span className="font-mono">{httpVariant ? `HTTP · ${httpVariant === 'streamable' ? 'Streamable HTTP' : 'SSE'}` : 'STDIO'}</span>
      )}

      {/* Uptime — isolated component, never re-renders StatusBar */}
      {connectionStatus === 'connected' && connectedAt && <UptimeTimer connectedAt={connectedAt} />}

      {/* Last Call latency */}
      <div className="flex items-center gap-1" title="Last Call latency">
        <Clock size={11} />
        <span className="tabular-nums">{requestCount > 0 ? `${latency}ms` : '—'}</span>
      </div>

      {/* Total Calls */}
      <div className="flex items-center gap-1" title="Calls this Session">
        <Activity size={11} />
        <span className="tabular-nums">{requestCount} {requestCount === 1 ? 'call' : 'calls'}</span>
      </div>

      {/* Error count — only shown when non-zero */}
      {errorCount > 0 && (
        <div className="flex items-center gap-1 text-destructive-text">
          <AlertCircle size={11} />
          <span className="tabular-nums">{errorCount} err</span>
        </div>
      )}

      <div className="flex-1" />
      <span className="hidden font-mono sm:inline">MCP Studio v{__APP_VERSION__}</span>
    </div>
  );
}
