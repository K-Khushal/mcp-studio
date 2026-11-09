import { auth, extractWWWAuthenticateParams, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

const authorizations = new WeakMap<object, Promise<void>>();

/** What Studio keeps between Sessions for one Connection's OAuth sign-in. */
export interface OAuthCredentials {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformationMixed;
}

/** Durable home for one Connection's credentials. */
export interface OAuthStorage {
  /** Shared identity for adapters for the same credential generation. */
  coordination?: object;
  load(): Promise<OAuthCredentials>;
  save(credentials: OAuthCredentials): Promise<void>;
}

export interface OAuthSignIn {
  signal?: AbortSignal;
  /** Where the authorization server sends the browser back to the Studio Server. */
  redirectUrl: string;
  storage: OAuthStorage;
  /**
   * Show `authorizationUrl` to the user and resolve with the authorization code
   * the redirect carrying `state` delivers. Rejecting aborts the connect.
   */
  authorize(authorizationUrl: URL, state: string): Promise<string>;
}

/**
 * SDK OAuthClientProvider over Studio storage. Discovery, dynamic client registration,
 * PKCE and refresh are driven by the SDK; this adapter only persists their results and
 * holds the authorization request the SDK asks to redirect to.
 */
export class StudioOAuthProvider implements OAuthClientProvider {
  private verifier: string | undefined;
  private discovery: OAuthDiscoveryState | undefined;
  private lastState: string | undefined;
  private pending: { url: URL; state: string } | undefined;

  constructor(private readonly signIn: OAuthSignIn) {}

  /** Coalesce the SDK's entire auth flow, including registration and browser approval. */
  async authenticate(serverUrl: URL, rejectedAuthorization: string | null, response: Response, fetchFn: FetchLike): Promise<void> {
    const key = this.signIn.storage.coordination ?? this.signIn.storage;
    let pending = authorizations.get(key);
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        const current = await this.tokens();
        // Another request may already have refreshed the token rejected by this response.
        if (current && `Bearer ${current.access_token}` !== rejectedAuthorization) return;
        const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
        const options = { serverUrl, resourceMetadataUrl, scope, fetchFn };
        if (await auth(this, options) === "REDIRECT") {
          const code = await this.authorizePending();
          this.signIn.signal?.throwIfAborted();
          if (!code || await auth(this, { ...options, authorizationCode: code }) !== "AUTHORIZED") {
            throw new Error("OAuth authentication failed");
          }
        }
      }).catch(() => {
        // OAuth errors may carry raw response bodies and submitted secrets.
        throw new Error("OAuth authentication failed");
      }).finally(() => {
        if (authorizations.get(key) === pending) authorizations.delete(key);
      });
      authorizations.set(key, pending);
    }
    const signal = this.signIn.signal;
    signal?.throwIfAborted();
    let abort: (() => void) | undefined;
    try {
      await Promise.race([pending, new Promise<never>((_, reject) => {
        abort = () => reject(new Error("OAuth sign-in cancelled"));
        signal?.addEventListener("abort", abort, { once: true });
      })]);
      signal?.throwIfAborted();
      await this.signIn.storage.load();
    } finally {
      if (abort) signal?.removeEventListener("abort", abort);
    }
  }

  get redirectUrl(): string {
    return this.signIn.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "MCP Studio",
      redirect_uris: [this.signIn.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    this.lastState = crypto.randomUUID();
    return this.lastState;
  }

  async clientInformation() {
    const info = (await this.signIn.storage.load()).clientInformation;
    // Registered for another redirect URL (the Studio Server port changed): register again.
    if (info && "redirect_uris" in info && !info.redirect_uris.includes(this.signIn.redirectUrl)) return undefined;
    return info;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    await this.update({ clientInformation });
  }

  async tokens() {
    return (await this.signIn.storage.load()).tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    await this.update({ tokens });
  }

  redirectToAuthorization(url: URL) {
    if (!this.lastState) throw new Error("OAuth authorization requested without state");
    this.pending = { url, state: this.lastState };
  }

  saveCodeVerifier(codeVerifier: string) {
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error("No PKCE code verifier for this sign-in");
    return this.verifier;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "verifier") this.verifier = undefined;
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
    if (scope === "all") await this.update({ tokens: undefined, clientInformation: undefined });
    if (scope === "client") await this.update({ clientInformation: undefined });
    if (scope === "tokens") await this.update({ tokens: undefined });
  }

  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.discovery = state;
  }

  discoveryState() {
    return this.discovery;
  }

  /** Lets the user approve the authorization the SDK requested; resolves with its code. */
  async authorizePending(): Promise<string | undefined> {
    this.signIn.signal?.throwIfAborted();
    await this.signIn.storage.load();
    this.signIn.signal?.throwIfAborted();
    const pending = this.pending;
    this.pending = undefined;
    return pending && this.signIn.authorize(pending.url, pending.state);
  }

  private async update(patch: OAuthCredentials) {
    this.signIn.signal?.throwIfAborted();
    const credentials = await this.signIn.storage.load();
    this.signIn.signal?.throwIfAborted();
    await this.signIn.storage.save({ ...credentials, ...patch });
  }
}
