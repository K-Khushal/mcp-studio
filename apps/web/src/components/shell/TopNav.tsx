import { useStore } from "@/store";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  disconnected: "bg-muted-foreground",
  connecting: "bg-yellow-500 animate-pulse",
  connected: "bg-green-500",
  error: "bg-destructive",
};

export function TopNav() {
  const { connectionStatus, connectionConfig, serverInfo } = useStore();
  const serverName =
    (serverInfo as { name?: string } | null)?.name ??
    (connectionConfig?.transport === "stdio"
      ? connectionConfig.config.command
      : connectionConfig?.config.url) ??
    "—";

  return (
    <header className="flex h-10 items-center justify-between border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">MCP Studio</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn("h-2 w-2 rounded-full", STATUS_COLOR[connectionStatus])}
        />
        <span className="max-w-xs truncate font-mono">{serverName}</span>
        <span className="capitalize">{connectionStatus}</span>
      </div>
    </header>
  );
}
