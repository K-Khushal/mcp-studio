import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from '@/store';
import { ChevronUp, ChevronDown, ChevronRight, Search, Copy } from "lucide-react";
import type { LogLevel, LogSource } from "@mcp-studio/types";
import { cn } from "@/lib/utils";
import type { LogEntry } from "@/store";
import { LOG_LEVELS, LOG_SOURCES, filterLogs, formatLogLine } from "./filter-logs";

const levelColors: Record<string, string> = {
  INFO: "text-foreground",
  DEBUG: "text-muted-foreground",
  WARN: "text-warning",
  ERROR: "text-destructive-text",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const sourceColors: Record<LogSource, string> = {
  protocol: "text-primary-text",
  server: "text-foreground",
  studio: "text-muted-foreground",
};

const chipClass = (active: boolean) =>
  cn(
    "text-[11px] px-2 py-1 rounded font-medium transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-primary/15 text-primary-text" : "text-muted-foreground hover:text-foreground",
  );

function LogRow({ log, expanded, onToggle }: { log: LogEntry; expanded: boolean; onToggle: () => void }) {
  const { payload } = log;
  const detailId = `log-detail-${log.id}`;
  const summary = (
    <>
      <span className="text-muted-foreground shrink-0 tabular-nums">[{formatTimestamp(log.timestamp)}]</span>
      <span className={cn("shrink-0 w-11 font-semibold", levelColors[log.level] ?? "text-foreground")}>{log.level}</span>
      <span className={cn("shrink-0 w-14 text-[11px] leading-5 italic", sourceColors[log.source])}>{log.source}</span>
      <span className="text-foreground">{log.message}</span>
    </>
  );

  if (!payload) return <div className="flex gap-2 pl-4">{summary}</div>;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="flex w-full gap-2 text-left rounded-sm outline-hidden hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <ChevronRight
          size={12}
          aria-hidden
          className={cn("shrink-0 self-center text-muted-foreground", expanded && "rotate-90")}
        />
        {summary}
      </button>
      {expanded && (
        <pre
          id={detailId}
          className="ml-4 my-1 max-h-64 overflow-auto overscroll-contain rounded-md border border-border bg-muted/50 p-2 text-[11px] leading-4 text-foreground select-text"
        >
          {JSON.stringify(payload.body, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LogsPanel() {
  const { logs, isLogsCollapsed, toggleLogs, logsHeight, setLogsHeight } = useStore();
  const autoScroll = useStore((s) => s.config.autoScrollLogs);
  const logsOpen = !isLogsCollapsed;
  const [isDragging, setIsDragging] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LogLevel | null>(null);
  const [source, setSource] = useState<LogSource | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = filterLogs(logs, { level: filter, source, search });

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (autoScroll && list) list.scrollTop = list.scrollHeight;
  }, [autoScroll, logsOpen, logs, filter, source, search]);

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
          <div className="flex flex-wrap items-center gap-2 px-3 py-1 border-b border-border">
            <div role="group" aria-label="Filter by level" className="flex items-center gap-1">
              {LOG_LEVELS.map((l) => (
                <button
                  key={l}
                  aria-pressed={filter === l}
                  onClick={() => setFilter(filter === l ? null : l)}
                  className={chipClass(filter === l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div aria-hidden className="h-3 w-px bg-border" />
            <div role="group" aria-label="Filter by source" className="flex items-center gap-1">
              {LOG_SOURCES.map(({ value, label }) => (
                <button
                  key={value}
                  aria-pressed={source === value}
                  onClick={() => setSource(source === value ? null : value)}
                  className={chipClass(source === value)}
                >
                  {label}
                </button>
              ))}
            </div>
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
                aria-label="Search logs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter logs..."
                className={cn(
                  "bg-muted rounded w-36 text-xs text-foreground transition-colors duration-150",
                  "pl-7 pr-2 py-0.5",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              />
            </div>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  filtered.map((l) => formatLogLine(l, formatTimestamp(l.timestamp))).join("\n"),
                )
              }
              title="Copy logs"
              aria-label="Copy logs"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Copy size={12} />
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-1 font-mono text-[11px] leading-5">
            {filtered.map((log) => (
              <LogRow key={log.id} log={log} expanded={expanded.has(log.id)} onToggle={() => toggleExpanded(log.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
