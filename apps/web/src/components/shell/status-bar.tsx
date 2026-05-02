import { useStore } from '@/store/index';
import { cn } from '@/lib/utils';
import { Activity, AlertCircle, Clock, Timer, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function StatusBar() {
  const { connectionStatus, latency, requestCount, errorCount, connectedAt } = useStore();
  const isConnected = connectionStatus === 'connected';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isConnected]);

  return (
    <div className="flex items-center h-7 px-4 border-t border-border bg-background text-[11px] text-muted-foreground gap-4 shrink-0">
      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-success' : 'bg-destructive')} />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {isConnected && connectedAt && (
        <div className="flex items-center gap-1">
          <Timer size={11} />
          <span>{formatUptime(now - connectedAt)}</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <Clock size={11} />
        <span>{latency}ms</span>
      </div>
      <div className="flex items-center gap-1">
        <Activity size={11} />
        <span>{requestCount} requests</span>
      </div>
      {errorCount > 0 && (
        <div className="flex items-center gap-1 text-destructive">
          <AlertCircle size={11} />
          <span>{errorCount} errors</span>
        </div>
      )}
      <div className="flex-1" />
      <span className="font-mono">MCP Studio v1.0</span>
    </div>
  );
}
