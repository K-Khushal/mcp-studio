import { useStore } from '@/store/index';
import { cn } from '@/lib/utils';
import { Activity, AlertCircle, Clock, Wifi } from 'lucide-react';

export function StatusBar() {
  const { connectionStatus, latency, requestCount, errorCount, environments } = useStore();
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex items-center h-7 px-4 border-t border-border bg-background text-[11px] text-muted-foreground gap-4 shrink-0">
      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-success' : 'bg-destructive')} />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
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
