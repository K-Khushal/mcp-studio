import type { ClientMessage } from "@mcp-studio/types";
import { createHash } from "node:crypto";
import { oauthCallbackResponse, OAuthRedirects } from "../../oauth/redirects";
import { createStreamableEndpoint, startHTTPFixture } from "./session-harness";

const random = () => crypto.randomUUID().replaceAll("-", "");
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-fixture-oauth": "private" } });

/**
 * OAuth-protected MCP Server on a loopback port: RFC 9728 protected-resource metadata,
 * RFC 8414 authorization-server metadata, dynamic client registration, PKCE (S256)
 * authorization code grant and refresh tokens. /authorize approves immediately.
 */
export async function startOAuthFixture(mode: "streamable" | "sse" | "sse-auth-first" = "streamable") {
  let tokenGate: { grant: string; phase: "request" | "response"; started: () => void; resume: Promise<void> } | undefined;
  const faults: { refresh?: boolean; exchange?: boolean; registration?: boolean; scope?: boolean } = {};
  const legacy = mode !== "streamable" ? await startHTTPFixture("sse") : undefined;
  const endpoint = legacy ? {
    handle(request: Request) {
      const target = new URL(request.url);
      const upstream = new URL(legacy.connection.config.url);
      target.host = upstream.host;
      if (target.pathname === "/mcp") target.pathname = "/sse";
      return fetch(new Request(target.toString(), request));
    },
    close: () => legacy.close(),
  } : createStreamableEndpoint();
  const clients = new Map<string, string[]>();
  const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string }>();
  const accessTokens = new Map<string, { expired: boolean }>();
  const refreshTokens = new Set<string>();
  const issued: string[] = [];
  const presented = new Set<string>();
  const counts = { registrations: 0, authorizations: 0, refreshes: 0 };

  const issueTokens = () => {
    const access = `at_${random()}`;
    const refresh = `rt_${random()}`;
    accessTokens.set(access, { expired: false });
    refreshTokens.add(refresh);
    issued.push(access, refresh);
    return json({ access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh });
  };

  const waitAtGate = async (grant: string | null, phase: "request" | "response") => {
    if (tokenGate?.grant !== grant || tokenGate.phase !== phase) return;
    const gate = tokenGate;
    tokenGate = undefined;
    gate.started();
    await gate.resume;
  };
  const pause = (grant: "refresh_token" | "authorization_code", phase: "request" | "response") => {
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    tokenGate = { grant, phase, started: () => started.resolve(), resume: resume.promise };
    return { started: started.promise, resume: () => resume.resolve() };
  };

  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url);
    const origin = url.origin;
    const resourceMetadata = `${origin}/.well-known/oauth-protected-resource/mcp`;
    switch (url.pathname) {
      case "/.well-known/oauth-protected-resource/mcp":
        return json({ resource: `${origin}/mcp`, authorization_servers: [origin] });
      case "/.well-known/oauth-authorization-server":
        return json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      case "/register": {
        if (faults.registration) return new Response("DCR diagnostic body with private server data", { status: 500 });
        const metadata = await request.json() as { redirect_uris: string[] };
        const clientId = `client_${random()}`;
        clients.set(clientId, metadata.redirect_uris);
        counts.registrations++;
        return json({ ...metadata, client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
      }
      case "/authorize": {
        const params = url.searchParams;
        const clientId = params.get("client_id") ?? "";
        const redirectUri = params.get("redirect_uri") ?? "";
        if (!clients.get(clientId)?.includes(redirectUri)) return new Response("Unknown client or redirect", { status: 400 });
        if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")) {
          return new Response("PKCE S256 authorization code required", { status: 400 });
        }
        const code = `code_${random()}`;
        codes.set(code, { clientId, redirectUri, challenge: params.get("code_challenge")! });
        counts.authorizations++;
        const location = new URL(redirectUri);
        location.searchParams.set("code", code);
        location.searchParams.set("state", params.get("state") ?? "");
        return new Response(null, { status: 302, headers: { location: location.toString() } });
      }
      case "/token": {
        const form = new URLSearchParams(await request.text());
        await waitAtGate(form.get("grant_type"), "request");
        if (faults.refresh && form.get("grant_type") === "refresh_token") {
          return json({ error: "invalid_request", error_description: `refresh diagnostic: ${form.get("refresh_token")}` }, 400);
        }
        if (faults.exchange && form.get("grant_type") === "authorization_code") {
          return new Response(`exchange diagnostic: ${form.get("code")} ${form.get("code_verifier")}`, { status: 500 });
        }
        if (form.get("grant_type") === "authorization_code") {
          const grant = codes.get(form.get("code") ?? "");
          codes.delete(form.get("code") ?? "");
          const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
          if (!grant || grant.clientId !== form.get("client_id") || grant.redirectUri !== form.get("redirect_uri") || grant.challenge !== challenge) {
            return json({ error: "invalid_grant" }, 400);
          }
          const response = issueTokens();
          await waitAtGate(form.get("grant_type"), "response");
          return response;
        }
        if (form.get("grant_type") === "refresh_token") {
          if (!refreshTokens.delete(form.get("refresh_token") ?? "")) return json({ error: "invalid_grant" }, 400);
          counts.refreshes++;
          const response = issueTokens();
          await waitAtGate(form.get("grant_type"), "response");
          return response;
        }
        return json({ error: "unsupported_grant_type" }, 400);
      }
      case "/messages":
      case "/mcp": {
        if (mode === "sse" && url.pathname === "/mcp" && request.method === "POST") return new Response("Use legacy SSE", { status: 405 });
        const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
        if (token) presented.add(token);
        const state = token ? accessTokens.get(token) : undefined;
        if (state?.expired && faults.scope) {
          return new Response("More scope required", { status: 403, headers: { "www-authenticate": `Bearer error="insufficient_scope", scope="echo", resource_metadata="${resourceMetadata}"` } });
        }
        if (!state || state.expired) {
          return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${resourceMetadata}"` } });
        }
        if (legacy && url.pathname === "/mcp" && request.method === "POST") return new Response("Use legacy SSE", { status: 405 });
        return endpoint.handle(request);
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  } });

  return {
    connection: (connectionId?: string) => ({
      type: "connect", transport: "http", verbose: true, ...(connectionId ? { connectionId } : {}),
      config: { url: new URL("/mcp", server.url).toString(), headers: {}, auth: { type: "oauth" } },
    }) satisfies ClientMessage,
    counts,
    faults,
    pauseTokens(grant: "refresh_token" | "authorization_code") {
      return pause(grant, "request");
    },
    /** Hold the response after the grant was accepted and refresh token rotated. */
    pauseTokenResponses(grant: "refresh_token" | "authorization_code") {
      return pause(grant, "response");
    },
    /** Every access and refresh token the authorization server issued. */
    issued,
    /** Every bearer token the MCP endpoint received. */
    presented,
    /** Revokes every access and refresh token, so only a new sign-in gets through. */
    revokeTokens() { accessTokens.clear(); refreshTokens.clear(); },
    /** Rejects every access token issued so far, as if it had expired. */
    expireAccessTokens() { for (const state of accessTokens.values()) state.expired = true; },
    async close() {
      await endpoint.close();
      await server.stop(true);
    },
  };
}

/** Studio Server OAuth redirect route on its own loopback port. */
export function startOAuthCallback() {
  const redirects = new OAuthRedirects();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => oauthCallbackResponse(new URL(request.url), redirects) });
  return {
    redirects,
    redirectUrl: new URL("/oauth/callback", server.url).toString(),
    close: () => server.stop(true),
  };
}

/** Plays the browser: opens the authorization URL and follows the redirect to Studio. */
export async function approveInBrowser(authorizationUrl: string) {
  const authorization = await fetch(authorizationUrl, { redirect: "manual" });
  const location = authorization.headers.get("location");
  if (authorization.status !== 302 || !location) throw new Error(`Authorization failed: ${authorization.status} ${await authorization.text()}`);
  const callback = await fetch(location);
  return { status: callback.status, body: await callback.text() };
}
