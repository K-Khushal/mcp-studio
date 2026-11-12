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

/** A truncated body is already JSON text; quoting it again would hide the frame. */
export function formatLogBody(payload: LogPayload, space?: number): string {
  return payload.truncated ? String(payload.body) : JSON.stringify(payload.body, null, space) ?? "";
}

function searchableText(l: LogEntry): string {
  const text = l.payload
    ? `${l.message} ${l.payload.method ?? ""} ${l.payload.id ?? ""} ${formatLogBody(l.payload)}`
    : l.message;
  return text.toLowerCase();
}

/** Plain-text form of an entry for copy-to-clipboard. */
export function formatLogLine(l: LogEntry, time: string): string {
  const line = `[${time}] ${l.level} [${l.source}] ${l.message}`;
  return l.payload ? `${line}\n${formatLogBody(l.payload, 2)}` : line;
}

/** Bound retained frame bodies and build the search index once, at ingestion. */
export function prepareLog(message: string, payload?: LogPayload): { message: string; payload?: LogPayload; searchText: string } {
  const originalBytes = new TextEncoder().encode(message);
  if (originalBytes.length > 16 * 1024) message = new TextDecoder().decode(originalBytes.subarray(0, 16 * 1024)) + ` [truncated, ${originalBytes.length} bytes]`;
  const maxBodyLength = 64 * 1024;
  let storedPayload = payload;
  if (payload) {
    const body = formatLogBody(payload);
    if (body.length > maxBodyLength) {
      const marker = "… [truncated]";
      storedPayload = { ...payload, body: body.slice(0, maxBodyLength - marker.length) + marker, truncated: true };
    }
  }
  if (storedPayload) storedPayload = {
    ...storedPayload,
    method: storedPayload.method?.slice(0, 1024),
    id: typeof storedPayload.id === 'string' ? storedPayload.id.slice(0, 1024) : storedPayload.id,
  };
  const searchText = storedPayload
    ? `${message} ${storedPayload.method ?? ""} ${storedPayload.id ?? ""} ${formatLogBody(storedPayload)}`.toLowerCase()
    : message.toLowerCase();
  return { message, ...(storedPayload ? { payload: storedPayload } : {}), searchText };
}

const MAX_LOGS = 500;
const MAX_LOG_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const entryBytes = new WeakMap<LogEntry, number>();
const retainedBytes = new WeakMap<LogEntry[], number>();

function logBytes(entry: LogEntry): number {
  let bytes = entryBytes.get(entry);
  if (bytes === undefined) {
    bytes = encoder.encode(JSON.stringify(entry)).length;
    entryBytes.set(entry, bytes);
  }
  return bytes;
}

/** Append with incremental byte accounting. Each entry is measured once and evicted once.
 * Immutable snapshots copy at most 500 references for Zustand subscribers.
 * Weak maps let cleared workspaces and their accounting be garbage collected together.
 */
export function appendLog(logs: LogEntry[], entry: LogEntry): LogEntry[] {
  const bytes = retainedBytes.get(logs) ?? logs.reduce((total, log) => total + logBytes(log), 0);
  let total = bytes + logBytes(entry);
  let start = 0;
  while (start < logs.length && (logs.length + 1 - start > MAX_LOGS || total > MAX_LOG_BYTES)) {
    total -= logBytes(logs[start++]!);
  }
  const next = logs.slice(start);
  if (total <= MAX_LOG_BYTES) next.push(entry);
  else total = 0; // An individually oversized entry cannot fit the budget.
  retainedBytes.set(next, total);
  return next;
}
