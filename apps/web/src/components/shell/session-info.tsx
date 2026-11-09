import { useStore } from "@/store";
import { cn } from "@/lib/utils";

const STATUS = {
  connected: { label: "Connected", dot: "bg-success" },
  connecting: { label: "Connecting…", dot: "bg-warning motion-safe:animate-pulse" },
  error: { label: "Connection failed", dot: "bg-destructive" },
  disconnected: { label: "Not connected", dot: "bg-muted-foreground/40" },
} as const;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
      {children}
    </span>
  );
}

/** The live Session at a glance: MCP Server identity, Transport, negotiated protocol version, status. */
export function SessionInfo() {
  const status = useStore((s) => s.connectionStatus);
  const serverInfo = useStore((s) => s.serverInfo);
  const protocolVersion = useStore((s) => s.protocolVersion);
  const httpVariant = useStore((s) => s.httpVariant);
  const transport = useStore((s) => s.connectionConfig?.transport ?? null);

  const { label, dot } = STATUS[status];
  const connected = status === "connected";

  return (
    <div className="flex min-w-0 items-center gap-2.5 text-xs" aria-live="polite">
      <span className="flex shrink-0 items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
        <span className={connected ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      </span>
      {connected && (
        <>
          {serverInfo?.name && (
            <span className="truncate font-semibold text-foreground">{serverInfo.name}</span>
          )}
          {serverInfo?.version && (
            <span className="shrink-0 font-mono text-muted-foreground">v{serverInfo.version}</span>
          )}
          {transport && <Chip>{transport.toUpperCase()}{transport === "http" && httpVariant ? ` · ${httpVariant === "streamable" ? "Streamable HTTP" : "SSE"}` : ""}</Chip>}
          {protocolVersion && <Chip>MCP {protocolVersion}</Chip>}
        </>
      )}
    </div>
  );
}
