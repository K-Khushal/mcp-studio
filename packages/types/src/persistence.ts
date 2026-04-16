import type { ConnectionConfig } from "./transport.js";

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface SavedRequest {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  connectionConfig?: ConnectionConfig;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  error?: string;
  duration: number; // ms
  timestamp: number;
  connectionConfig?: ConnectionConfig;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
}
