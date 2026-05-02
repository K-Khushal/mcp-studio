import { useStore } from '@/store/index';
import { cn } from '@/lib/utils';
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
    <div className="flex items-center gap-1">
      <Timer size={11} />
      <span className="tabular-nums min-w-14">{formatUptime(now - connectedAt)}</span>
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
  const latency          = useStore((s) => s.latency);
  const requestCount     = useStore((s) => s.requestCount);
  const errorCount       = useStore((s) => s.errorCount);
  const connectedAt      = useStore((s) => s.connectedAt);

  // Derive request name in a single selector — returns a string (primitive)
  // so Zustand only re-renders if the name itself changes.
  const selectedRequestName = useStore((s) => {
    if (!s.selectedRequestId) return null;
    for (const c of s.collections) {
      const r = c.requests.find((r) => r.id === s.selectedRequestId);
      if (r) return r.name;
    }
    return null;
  });

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex items-center h-7 px-4 border-t border-border bg-background text-[11px] text-muted-foreground gap-4 shrink-0">
      {/* Active request name */}
      {selectedRequestName && (
        <div className="flex items-center gap-1 min-w-0">
          <FileText size={11} className="shrink-0" />
          <span className="font-mono truncate max-w-35">{selectedRequestName}</span>
        </div>
      )}

      {/* Connection status dot + label */}
      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', isConnected ? 'bg-success' : 'bg-destructive')} />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Uptime — isolated component, never re-renders StatusBar */}
      {isConnected && connectedAt && <UptimeTimer connectedAt={connectedAt} />}

      {/* Last request latency */}
      <div className="flex items-center gap-1">
        <Clock size={11} />
        <span className="tabular-nums">{latency}ms</span>
      </div>

      {/* Total requests */}
      <div className="flex items-center gap-1">
        <Activity size={11} />
        <span className="tabular-nums">{requestCount} req</span>
      </div>

      {/* Error count — only shown when non-zero */}
      {errorCount > 0 && (
        <div className="flex items-center gap-1 text-destructive">
          <AlertCircle size={11} />
          <span className="tabular-nums">{errorCount} err</span>
        </div>
      )}

      <div className="flex-1" />
      <span className="font-mono">MCP Studio v1.0</span>
    </div>
  );
}
