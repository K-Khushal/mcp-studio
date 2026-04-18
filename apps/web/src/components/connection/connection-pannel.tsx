import { cn } from '@/lib/utils';
import { useStore } from "@/store";
import EnvironmentPannel from '../environments/environment-pannel';
import { ConfigurationPanel } from '../configuration/configuration-pannel';

// const { connectionStatus, connectionConfig, serverInfo } = useStore();

const STATUS_COLOR: Record<string, string> = {
  disconnected: "bg-muted-foreground",
  connecting: "bg-yellow-500 animate-pulse",
  connected: "bg-green-500",
  error: "bg-destructive",
};

// const serverName =
//   (serverInfo as { name?: string } | null)?.name ??
//   (connectionConfig?.transport === "stdio"
//     ? connectionConfig.config.command
//     : connectionConfig?.config.url) ??
//   "—";

export function ConnectionPanel() {
  const { connectionStatus, connect, disconnect } = useStore();

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="border-b border-border bg-card">
      {/* Header row: Status, Environment, Configuration */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground font-mono bg-muted px-2 py-0.5 rounded">untitled</span>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-success' : isConnecting ? 'bg-warning animate-pulse' : 'bg-destructive'
          )} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="flex-1" />
        <EnvironmentPannel />
        <ConfigurationPanel />
      </div>
    </div>
  );
}
