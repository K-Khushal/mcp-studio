import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from '@/store';
import { ChevronUp, ChevronDown, Search, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const levelColors: Record<string, string> = {
  INFO: "text-foreground",
  DEBUG: "text-muted-foreground",
  WARN: "text-warning",
  ERROR: "text-destructive",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function LogsPanel() {
  const { logs, isLogsCollapsed, toggleLogs, logsHeight, setLogsHeight } = useStore();
  const autoScroll = useStore((s) => s.config.autoScrollLogs);
  const logsOpen = !isLogsCollapsed;
  const [isDragging, setIsDragging] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = logs.filter(
    (l) =>
      (!filter || l.level === filter) &&
      (!search || l.message.toLowerCase().includes(search.toLowerCase())),
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    if (autoScroll && list) list.scrollTop = list.scrollHeight;
  }, [autoScroll, logsOpen, logs, filter, search]);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const startHeight = logsHeight;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const onMove = (ev: PointerEvent) => setLogsHeight(startHeight + (startY - ev.clientY));
    const onUp = () => {
      setIsDragging(false);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const resizeWithKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    setLogsHeight(logsHeight + (e.key === "ArrowUp" ? 24 : -24));
  };

  return (
    <div
      className="relative shrink-0 border-t border-border bg-card"
      style={{ height: logsOpen ? logsHeight : 32 }}
    >
      {logsOpen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize logs panel"
          aria-valuenow={logsHeight}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeWithKeys}
          className={cn(
            "absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none outline-hidden transition-colors duration-150",
            "hover:bg-primary/40 focus-visible:bg-primary/40",
            isDragging && "bg-primary/60",
          )}
        />
      )}
      <button
        onClick={toggleLogs}
        className="w-full flex items-center justify-between px-4 h-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Console ({logs.length})</span>
        {logsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {logsOpen && (
        <div className="flex flex-col h-[calc(100%-2rem)]">
          <div className="flex items-center gap-2 px-3 py-1 border-b border-border">
            {["INFO", "WARN", "ERROR", "DEBUG"].map((l) => (
              <button
                key={l}
                onClick={() => setFilter(filter === l ? null : l)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-medium transition-colors",
                  filter === l
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l}
              </button>
            ))}
            <div className="flex-1" />
            <div className="relative group pb-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                <Search
                  size={12}
                  className="text-muted-foreground group-focus-within:text-foreground transition-colors"
                />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter logs..."
                className={cn(
                  "bg-muted rounded w-36 text-[10px] text-foreground transition-all",
                  "pl-7 pr-2 py-0.5",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none"
                )}
              />
            </div>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  filtered
                    .map((l) => `[${formatTimestamp(l.timestamp)}] ${l.level} [${l.source}] ${l.message}`)
                    .join("\n"),
                )
              }
              title="Copy logs"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Copy size={12} />
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-1 font-mono text-[11px] leading-5">
            {filtered.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  [{formatTimestamp(log.timestamp)}]
                </span>
                <span
                  className={cn(
                    "shrink-0 w-11 font-semibold",
                    levelColors[log.level] ?? "text-foreground",
                  )}
                >
                  {log.level}
                </span>
                <span className="shrink-0 text-muted-foreground w-14 text-[10px] leading-5 italic">
                  {log.source}
                </span>
                <span className="text-foreground">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
