import type { MCPConfig } from "@mcp-studio/types";
import { isThemePreference } from "@/lib/theme";

export const CONFIG_STORAGE_KEY = "mcp-studio-config";

export const DEFAULT_CONFIG: MCPConfig = {
  requestTimeout: 30,
  autoScrollLogs: true,
  verboseLogging: false,
  theme: "dark",
};

/** Merges saved settings over the defaults field by field, dropping unknown keys and invalid values. */
export function readPersistedConfig(): MCPConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw) as Record<string, unknown>;
    return {
      requestTimeout:
        typeof saved.requestTimeout === "number" && Number.isInteger(saved.requestTimeout) && saved.requestTimeout > 0
          ? saved.requestTimeout
          : DEFAULT_CONFIG.requestTimeout,
      autoScrollLogs:
        typeof saved.autoScrollLogs === "boolean" ? saved.autoScrollLogs : DEFAULT_CONFIG.autoScrollLogs,
      verboseLogging:
        typeof saved.verboseLogging === "boolean" ? saved.verboseLogging : DEFAULT_CONFIG.verboseLogging,
      theme: isThemePreference(saved.theme) ? saved.theme : DEFAULT_CONFIG.theme,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function persistConfig(config: MCPConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch { /* Best-effort persistence; retain in-memory state. */ }
}
