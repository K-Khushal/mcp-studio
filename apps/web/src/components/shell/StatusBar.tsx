import { useStore } from "@/store";
import { formatDuration } from "@/lib/utils";

export function StatusBar() {
  const { history, logs, response } = useStore();

  const errorCount = logs.filter((l) => l.level === "error").length;
  const lastDuration = history[0]?.duration;

  return (
    <footer className="flex h-6 items-center justify-end gap-4 border-t border-border bg-panel px-4 text-xs text-muted-foreground">
      {response.isStreaming && (
        <span className="text-yellow-500 animate-pulse">● Streaming…</span>
      )}
      <span>{history.length} requests</span>
      {errorCount > 0 && (
        <span className="text-destructive">{errorCount} errors</span>
      )}
      {lastDuration !== undefined && (
        <span>Last: {formatDuration(lastDuration)}</span>
      )}
    </footer>
  );
}
