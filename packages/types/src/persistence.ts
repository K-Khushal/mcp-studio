import type { ConnectionConfig } from "./transport.js";

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface Connection {
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
  connections: Connection[];
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

/** `GET /collections/:id/connections/:connId/oauth`: what the browser may know about a sign-in. Never carries tokens or client secrets. */
export interface OAuthStatus {
  signedIn: boolean;
  serverUrl?: string;
  /** Display claims from the ID token (or a JWT access token); unverified, display only. */
  account?: { email?: string; name?: string; username?: string; subject?: string };
  scope?: string;
  /** Access-token expiry (epoch ms) when the server reported one; refresh renews it on the next connect. */
  expiresAt?: number;
  refreshable?: boolean;
  updatedAt?: number;
}
