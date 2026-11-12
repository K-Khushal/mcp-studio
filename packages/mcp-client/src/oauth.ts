import { isSafeOAuthUrl } from "@mcp-studio/types";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { auth, discoverOAuthServerInfo, extractWWWAuthenticateParams, selectClientAuthMethod, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

/** Only errors originating in OAuth discovery, approval or token exchange. */
export class OAuthFlowError extends Error {
  constructor(message = "OAuth authentication failed") { super(message); }
}

/** Fixed messages only: never expose an untrusted endpoint or SDK error. */
export class OAuthPolicyError extends OAuthFlowError {
  constructor(reason: "authorization" | "endpoint") {
    super(reason === "authorization"
      ? "OAuth sign-in requires HTTPS (HTTP is allowed only for loopback hosts)"
      : "OAuth endpoint refused: private or invalid destination for a public MCP Server");
  }
}

/** Applied before any browser approval callback. */
function validateAuthorizationUrl(url: URL): void {
  if (!isSafeOAuthUrl(url.href)) throw new OAuthPolicyError("authorization");
}

/** Normalize IPv6 and unwrap IPv4-mapped and well-known NAT64 destinations. */
function unwrapAddress(address: string): string {
  if (isIP(address) !== 6) return address;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (/^(?:::ffff:|64:ff9b::)(?:[0-9a-f]{1,4}:)?[0-9a-f]{1,4}$/.test(normalized)) {
    const suffix = normalized.split(":");
    const low = parseInt(suffix.pop() || "0", 16);
    const high = parseInt(suffix.pop() || "0", 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return normalized;
}

// Only globally routable unicast addresses are public.
function isPublicAddress(address: string): boolean {
  address = unwrapAddress(address);
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  // ULA, link-local, multicast and unspecified are outside 2000::/3.
  return /^[23][0-9a-f]{3}:/.test(address) &&
    !address.startsWith("2002:") && !/^2001:(?:db8:|0:|:|2:0:|2::|[12][0-9a-f]:)/.test(address) &&
    !/^3fff:(?:[0-9a-f]{1,3}:|:)/.test(address);
}

function isLinkLocalAddress(address: string): boolean {
  address = unwrapAddress(address);
  if (isIP(address) === 4) return address.startsWith("169.254.");
  return isIP(address) === 6 && /^fe[89ab][0-9a-f]:/i.test(address);
}

async function addresses(hostname: string): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return [host];
  if (host === "localhost" || host.endsWith(".localhost")) return ["127.0.0.1"];
  return (await lookup(host, { all: true, verbatim: true })).map(result => result.address);
}

/** Guard every auth request, including each redirect hop made by the SDK. */
export function createOAuthFetch(serverUrl: URL, fetchFn: FetchLike = fetch): FetchLike {
  // User-entered literal hosts alone confer private-network trust. DNS must
  // never upgrade a public Connection after discovery or browser approval.
  const host = serverUrl.hostname.replace(/^\[|\]$/g, "");
  const privateServer = host === "localhost" || host.endsWith(".localhost") ||
    (isIP(host) !== 0 && !isPublicAddress(host));
  return async (input, init) => {
    let destination: URL;
    try {
      destination = new URL(input instanceof Request ? input.url : String(input));
      if (!["http:", "https:"].includes(destination.protocol) || destination.username || destination.password) {
        throw new OAuthPolicyError("endpoint");
      }
      if (destination.origin !== serverUrl.origin) {
        const resolved = await addresses(destination.hostname);
        if (!resolved.length || !resolved.every(isPublicAddress)) {
          if (!privateServer || (!isLinkLocalAddress(host) && resolved.some(isLinkLocalAddress))) throw new OAuthPolicyError("endpoint");
        }
      }
    } catch {
      throw new OAuthPolicyError("endpoint");
    }
    // Never let runtime automatic redirects bypass destination validation. The
    // SDK follows permitted same-origin redirects through this guarded fetch.
    return fetchFn(input, { ...init, redirect: "manual" });
  };
}

type AuthWaiter = { signIn: OAuthSignIn; allowBrowserSignIn: boolean; rejectBrowserSignIn(): void; resume?: () => void };
type AuthorizationFlow = {
  controller: AbortController;
  waiters: Set<AuthWaiter>;
  authorization?: { url: URL; state: string };
  promise: Promise<void>;
};
const authorizations = new WeakMap<object, AuthorizationFlow>();

export { redactDiagnosticValue as redactOAuthValue } from "./diagnostics.js";
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
  /** Delivers the shared approval link to browser-allowed connecting Sessions, including late joiners. Return cleanup to resume after this waiter settles. */
  onAuthorization?(authorizationUrl: URL): void | (() => void);
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
    for (const secret of [credentials.tokens?.access_token, credentials.tokens?.refresh_token, credentials.tokens?.id_token, credentials.clientInformation?.client_secret]) {
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
          for (const waiter of waiters) {
            if (waiter.allowBrowserSignIn) waiter.resume = waiter.signIn.onAuthorization?.(url) || undefined;
            else waiter.rejectBrowserSignIn();
          }
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
      }).catch((error: unknown) => {
        if (error instanceof OAuthPolicyError) throw error;
        // OAuth errors may carry raw response bodies and submitted secrets.
        throw new OAuthFlowError();
      }).finally(() => {
        if (authorizations.get(key) === shared) authorizations.delete(key);
      });
      authorizations.set(key, shared);
      flow = shared;
    }
    let rejectBrowserSignIn: () => void = () => {};
    const browserRequired = new Promise<never>((_, reject) => {
      rejectBrowserSignIn = () => reject(new OAuthFlowError());
    });
    const waiter: AuthWaiter = { signIn: this.signIn, allowBrowserSignIn, rejectBrowserSignIn };
    flow.waiters.add(waiter);
    try {
      if (flow.authorization) {
        if (!allowBrowserSignIn) throw new OAuthFlowError();
        waiter.resume = this.signIn.onAuthorization?.(flow.authorization.url) || undefined;
      }
      await this.waitForFlow(Promise.race([flow.promise, browserRequired]), signal);
      await this.credentials();
    } finally {
      waiter.resume?.();
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
    validateAuthorizationUrl(url);
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

export type OAuthRevocation = "revoked" | "unsupported" | "failed" | "none";

/**
 * RFC 7009: best-effort revocation of a Sign-in's tokens at the authorization server, when it
 * advertises a `revocation_endpoint`. Discovery and revocation share one deadline and the
 * destination policy of the sign-in itself. Never throws, and never reports tokens or responses.
 */
export async function revokeOAuthTokens(serverUrl: string, credentials: OAuthCredentials, options: { timeoutMs?: number; fetchFn?: FetchLike } = {}): Promise<OAuthRevocation> {
  const { tokens, clientInformation } = credentials;
  // Revoking the refresh token also invalidates its access tokens on most servers; send both.
  const revocable = [["refresh_token", tokens?.refresh_token], ["access_token", tokens?.access_token]].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (!revocable.length) return "none";
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 5_000);
  const guarded = createOAuthFetch(new URL(serverUrl), options.fetchFn);
  const fetchFn: FetchLike = (input, init) => guarded(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
  try {
    const { authorizationServerMetadata } = await discoverOAuthServerInfo(serverUrl, { fetchFn });
    // RFC 8414 fields; OpenID discovery documents may carry them too.
    const metadata = authorizationServerMetadata as { revocation_endpoint?: string; revocation_endpoint_auth_methods_supported?: string[] } | undefined;
    const endpoint = metadata?.revocation_endpoint;
    if (!metadata || !endpoint) return "unsupported";
    let revoked = true;
    for (const [hint, token] of revocable) {
      const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
      const body = new URLSearchParams({ token, token_type_hint: hint });
      if (clientInformation) {
        const method = selectClientAuthMethod(clientInformation, metadata.revocation_endpoint_auth_methods_supported ?? []);
        if (method === "client_secret_basic" && clientInformation.client_secret) headers.set("Authorization", `Basic ${btoa(`${clientInformation.client_id}:${clientInformation.client_secret}`)}`);
        else {
          body.set("client_id", clientInformation.client_id);
          if (method === "client_secret_post" && clientInformation.client_secret) body.set("client_secret", clientInformation.client_secret);
        }
      }
      const response = await fetchFn(endpoint, { method: "POST", headers, body });
      await response.body?.cancel();
      // RFC 7009 §2.2: 200 for revoked and for already-invalid tokens.
      if (!response.ok) revoked = false;
    }
    return revoked ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}
