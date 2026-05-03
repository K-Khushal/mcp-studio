// ---------------------------------------------------------------------------
// Connection configuration types
// ---------------------------------------------------------------------------

export interface StdioConfig {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  /** When true, subprocess inherits process.env before merging `env` */
  inheritSystemEnv: boolean;
}

export type HttpAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

export interface HttpConfig {
  url: string;
  headers: Record<string, string>;
  auth?: HttpAuth;
}

export type ConnectionConfig =
  | { transport: "stdio"; config: StdioConfig }
  | { transport: "http"; config: HttpConfig };
