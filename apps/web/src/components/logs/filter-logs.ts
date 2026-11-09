import type { LogLevel, LogSource, LogPayload } from "@mcp-studio/types";
import type { LogEntry } from "@/store";

export const LOG_LEVELS: LogLevel[] = ["INFO", "WARN", "ERROR", "DEBUG"];

export const LOG_SOURCES: { value: LogSource; label: string }[] = [
  { value: "protocol", label: "Protocol" },
  { value: "server", label: "Server" },
  { value: "studio", label: "Studio" },
];

export interface LogFilter {
  level: LogLevel | null;
  source: LogSource | null;
  search: string;
}

/** Level, source and search combine with AND; search also covers a structured payload's method, id and body. */
export function filterLogs(logs: LogEntry[], { level, source, search }: LogFilter): LogEntry[] {
  const needle = search.trim().toLowerCase();
  return logs.filter(
    (l) =>
      (!level || l.level === level) &&
      (!source || l.source === source) &&
      (!needle || (l.searchText ?? searchableText(l)).includes(needle)),
  );
}

function searchableText(l: LogEntry): string {
  const text = l.payload
    ? `${l.message} ${l.payload.method ?? ""} ${l.payload.id ?? ""} ${JSON.stringify(l.payload.body)}`
    : l.message;
  return text.toLowerCase();
}

/** Plain-text form of an entry for copy-to-clipboard. */
export function formatLogLine(l: LogEntry, time: string): string {
  const line = `[${time}] ${l.level} [${l.source}] ${l.message}`;
  return l.payload ? `${line}\n${JSON.stringify(l.payload.body, null, 2)}` : line;
}

/** Bound retained frame bodies and build the search index once, at ingestion. */
export function prepareLog(message: string, payload?: LogPayload): { payload?: LogPayload; searchText: string } {
  const maxBodyLength = 64 * 1024;
  let storedPayload = payload;
  if (payload) {
    const body = JSON.stringify(payload.body) ?? "";
    if (body.length > maxBodyLength) {
      const marker = "… [truncated]";
      storedPayload = { ...payload, body: body.slice(0, maxBodyLength - marker.length) + marker };
    }
  }
  const searchText = storedPayload
    ? `${message} ${storedPayload.method ?? ""} ${storedPayload.id ?? ""} ${JSON.stringify(storedPayload.body)}`.toLowerCase()
    : message.toLowerCase();
  return { ...(storedPayload ? { payload: storedPayload } : {}), searchText };
}
