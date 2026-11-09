import type { ConnectionConfig, HttpAuth, StdioConfig } from "@mcp-studio/types";

export interface EnvRow {
  key: string;
  value: string;
}

/** Editable shape of a STDIO config: list/table rows survive blank and duplicate entries while typing. */
export interface StdioDraft {
  command: string;
  args: string[];
  cwd: string;
  env: EnvRow[];
  inheritSystemEnv: boolean;
}

export const DEFAULT_STDIO_DRAFT: StdioDraft = {
  command: "",
  args: [],
  cwd: "",
  env: [],
  inheritSystemEnv: true,
};

export function stdioDraftFromConfig(config: StdioConfig): StdioDraft {
  return {
    command: config.command,
    args: [...config.args],
    cwd: config.cwd ?? "",
    env: Object.entries(config.env).map(([key, value]) => ({ key, value })),
    inheritSystemEnv: config.inheritSystemEnv,
  };
}

/** Blank args, blank env names and a blank cwd are dropped; later duplicate env names win. */
export function stdioConfigFromDraft(draft: StdioDraft): StdioConfig {
  const env: Record<string, string> = {};
  for (const { key, value } of draft.env) {
    const name = key.trim();
    if (name) env[name] = value;
  }
  const cwd = draft.cwd.trim();
  return {
    command: draft.command.trim(),
    args: draft.args.filter((arg) => arg.trim() !== ""),
    ...(cwd ? { cwd } : {}),
    env,
    inheritSystemEnv: draft.inheritSystemEnv,
  };
}

/** Legacy drafts stored STDIO as one "command arg arg" string. */
export function stdioDraftFromCommandLine(line: string): StdioDraft {
  const [command = "", ...args] = line.trim().split(/\s+/).filter(Boolean);
  return { ...DEFAULT_STDIO_DRAFT, command, args };
}

// Omit auth when it's "none" so stored JSON stays clean and comparison is stable
function normalizeAuth(auth: HttpAuth): HttpAuth | undefined {
  return auth.type === "none" ? undefined : auth;
}

export function buildConnectionConfig(form: {
  transport: "stdio" | "http";
  stdio: StdioDraft;
  connectionUrl: string;
  httpHeaders: Record<string, string>;
  httpAuth: HttpAuth;
}): ConnectionConfig {
  return form.transport === "http"
    ? { transport: "http", config: { url: form.connectionUrl, headers: form.httpHeaders, auth: normalizeAuth(form.httpAuth) } }
    : { transport: "stdio", config: stdioConfigFromDraft(form.stdio) };
}

/** True when the form holds enough to attempt a Session (a command or a URL). */
export function isConnectable(config: ConnectionConfig): boolean {
  return config.transport === "http" ? config.config.url.trim() !== "" : config.config.command !== "";
}

export interface HeaderRow extends EnvRow { id: string }

/** Keep duplicate rows editable; never silently merge case-insensitive HTTP names. */
export function headersFromRows(rows: HeaderRow[]): Record<string, string> | null {
  const names = rows.map(row => row.key.trim().toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) return null;
  return Object.fromEntries(rows.filter(row => row.key.trim()).map(row => [row.key.trim(), row.value]));
}
