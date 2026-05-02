import { useState } from "react";
import { useStore } from '@/store';
import { ChevronUp, ChevronDown, Search, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

const levelColors: Record<string, string> = {
  INFO: "text-foreground",
  DEBUG: "text-muted-foreground",
  WARN: "text-warning",
  ERROR: "text-destructive",
};

export function LogsPanel() {
  const { logs } = useStore();
  const [logsOpen, setLogsOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = logs.filter(
    (l) =>
      (!filter || l.level === filter) &&
      (!search || l.message.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div
      className={cn(
        "border-t border-border bg-card transition-all",
        logsOpen ? "h-52" : "h-8",
      )}
    >
      <button
        onClick={() => setLogsOpen(!logsOpen)}
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
                    .map((l) => `[${l.timestamp}] ${l.level} ${l.message}`)
                    .join("\n"),
                )
              }
              title="Copy logs"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Copy size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px] leading-5">
            {filtered.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  [{log.timestamp}]
                </span>
                <span
                  className={cn(
                    "shrink-0 w-11 font-semibold",
                    levelColors[log.level],
                  )}
                >
                  {log.level}
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
