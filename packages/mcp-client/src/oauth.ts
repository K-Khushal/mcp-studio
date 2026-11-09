import { auth, extractWWWAuthenticateParams, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

/** Only errors originating in OAuth discovery, approval or token exchange. */
export class OAuthFlowError extends Error {
  constructor() { super("OAuth authentication failed"); }
}

type AuthWaiter = { signIn: OAuthSignIn; allowBrowserSignIn: boolean };
type AuthorizationFlow = {
  controller: AbortController;
  waiters: Set<AuthWaiter>;
  authorization?: { url: URL; state: string };
  promise: Promise<void>;
};
const authorizations = new WeakMap<object, AuthorizationFlow>();

/** Clone log data while redacting secrets; wire frames and Call results stay intact. */
export function redactOAuthValue<T>(value: T, secrets: ReadonlySet<string>): T {
  const redact = (item: unknown): unknown => {
    if (typeof item === "string") {
      for (const secret of secrets) if (secret) item = (item as string).replaceAll(secret, "[REDACTED]");
      return item;
    }
    if (item instanceof Error) {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      for (const descriptor of Object.values(descriptors)) {
        if ("value" in descriptor) descriptor.value = redact(descriptor.value);
      }
      return Object.create(Object.getPrototypeOf(item), descriptors);
    }
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, child]) => [redact(key), redact(child)]));
    return item;
  };
  return redact(value) as T;
}

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
  authorize(authorizationUrl: URL, state: string, signal: AbortSignal): Promise<string>;
  /** Delivers the shared approval link to each waiting Session, including late joiners. */
  onAuthorization?(authorizationUrl: URL): void;
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

  constructor(private readonly signIn: OAuthSignIn, private readonly secrets = new Set<string>()) {}

  private async credentials(): Promise<OAuthCredentials> {
    const credentials = await this.signIn.storage.load();
    this.remember(credentials);
    return credentials;
  }

  private remember(credentials: OAuthCredentials): void {
    for (const secret of [credentials.tokens?.access_token, credentials.tokens?.refresh_token, credentials.clientInformation?.client_secret]) {
      if (secret) this.secrets.add(secret);
    }
  }

  /** Coalesce the SDK's entire auth flow, including registration and browser approval. */
  async authenticate(serverUrl: URL, rejectedAuthorization: string | null, response: Response, fetchFn: FetchLike, allowBrowserSignIn: boolean): Promise<void> {
    const key = this.signIn.storage.coordination ?? this.signIn.storage;
    const signal = this.signIn.signal;
    signal?.throwIfAborted();
    let flow = authorizations.get(key);
    // A cancelled browser flow may still be settling; a token response must finish
    // persisting before another flow can use its rotating refresh token.
    if (flow?.controller.signal.aborted) {
      await this.waitForFlow(flow.promise.catch(() => {}), signal);
      return this.authenticate(serverUrl, rejectedAuthorization, response, fetchFn, allowBrowserSignIn);
    }
    if (!flow) {
      const controller = new AbortController();
      const waiters = new Set<AuthWaiter>();
      const shared: AuthorizationFlow = { controller, waiters, promise: Promise.resolve() };
      const provider = new StudioOAuthProvider({
        ...this.signIn,
        signal: controller.signal,
        authorize: (url, state, flowSignal) => {
          shared.authorization = { url, state };
          // Register the redirect before sending the link to any browser.
          const approval = this.signIn.authorize(url, state, flowSignal);
          for (const waiter of waiters) waiter.signIn.onAuthorization?.(url);
          return approval;
        },
      }, this.secrets);
      shared.promise = Promise.resolve().then(async () => {
        controller.signal.throwIfAborted();
        const current = await provider.tokens();
        // Another request may already have refreshed the token rejected by this response.
        if (current && `Bearer ${current.access_token}` !== rejectedAuthorization) return;
        const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
        const options = { serverUrl, resourceMetadataUrl, scope, fetchFn };
        if (await auth(provider, options) === "REDIRECT") {
          // Re-authorization mid-Call is a follow-up; reconnect may open the browser.
          if (![...waiters].some(waiter => waiter.allowBrowserSignIn)) throw new OAuthFlowError();
          const code = await provider.authorizePending();
          controller.signal.throwIfAborted();
          if (!code || await auth(provider, { ...options, authorizationCode: code }) !== "AUTHORIZED") {
            throw new OAuthFlowError();
          }
        }
      }).catch(() => {
        // OAuth errors may carry raw response bodies and submitted secrets.
        throw new OAuthFlowError();
      }).finally(() => {
        if (authorizations.get(key) === shared) authorizations.delete(key);
      });
      authorizations.set(key, shared);
      flow = shared;
    }
    const waiter = { signIn: this.signIn, allowBrowserSignIn };
    flow.waiters.add(waiter);
    try {
      if (flow.authorization) this.signIn.onAuthorization?.(flow.authorization.url);
      await this.waitForFlow(flow.promise, signal);
      await this.credentials();
    } finally {
      flow.waiters.delete(waiter);
      if (flow.waiters.size === 0) flow.controller.abort();
    }
  }

  private async waitForFlow(pending: Promise<void>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    let abort: (() => void) | undefined;
    try {
      await Promise.race([pending, new Promise<never>((_, reject) => {
        abort = () => reject(new OAuthFlowError());
        signal?.addEventListener("abort", abort, { once: true });
      })]);
      signal?.throwIfAborted();
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
    const info = (await this.credentials()).clientInformation;
    // Registered for another redirect URL (the Studio Server port changed): register again.
    if (info && "redirect_uris" in info && !info.redirect_uris.includes(this.signIn.redirectUrl)) return undefined;
    return info;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    await this.update({ clientInformation });
  }

  async tokens() {
    return (await this.credentials()).tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    await this.update({ tokens });
  }

  redirectToAuthorization(url: URL) {
    if (!this.lastState) throw new Error("OAuth authorization requested without state");
    this.pending = { url, state: this.lastState };
  }

  saveCodeVerifier(codeVerifier: string) {
    this.secrets.add(codeVerifier);
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
    if (!pending) return undefined;
    const code = await this.signIn.authorize(pending.url, pending.state, this.signIn.signal ?? new AbortController().signal);
    this.secrets.add(code);
    return code;
  }

  private async update(patch: OAuthCredentials) {
    // Finish persisting token responses even if the last Session left mid-request.
    // Storage still rejects a retired credential generation (sign-out / URL edit).
    const credentials = await this.signIn.storage.load();
    this.remember(patch);
    await this.signIn.storage.save({ ...credentials, ...patch });
  }
}
