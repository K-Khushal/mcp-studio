import type { ConnectionConfig } from "./transport.js";

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface SavedRequest {
  id: string;
  collectionId?: string;
  name: string;
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
// Environments
// ---------------------------------------------------------------------------

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
}
