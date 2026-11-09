import type { LogLevel, LogPayload } from "@mcp-studio/types";

const LEVELS: Record<string, LogLevel> = {
  debug: "DEBUG",
  info: "INFO",
  notice: "INFO",
  warning: "WARN",
  error: "ERROR",
  critical: "ERROR",
  alert: "ERROR",
  emergency: "ERROR",
};

/** Maps an MCP `notifications/message` severity (RFC 5424 names) onto Studio's four levels. */
export function mapMcpLogLevel(level: string): LogLevel {
  return LEVELS[level] ?? "INFO";
}

/** Renders a `notifications/message` payload as one log line: `[logger] data`. */
export function formatMcpLogMessage(params: { logger?: string; data?: unknown }): string {
  const data = typeof params.data === "string" ? params.data : JSON.stringify(params.data);
  return params.logger ? `[${params.logger}] ${data}` : data;
}

/** One-line summary of a frame: `→ tools/call #3`. Responses show the method of the request they answer. */
export function formatFrame(payload: LogPayload, isResponse: boolean): string {
  const arrow = payload.direction === "out" ? "→" : "←";
  const label = payload.method ?? (isResponse ? "response" : "message");
  const suffix = isResponse && payload.method ? " response" : "";
  return `${arrow} ${label}${suffix}${payload.id !== undefined ? ` #${payload.id}` : ""}`;
}
