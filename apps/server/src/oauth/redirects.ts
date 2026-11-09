const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

type Waiter = { resolve: (code: string) => void; reject: (error: Error) => void };

/** Pairs OAuth redirects arriving at the Studio Server with the sign-ins waiting on them. */
export class OAuthRedirects {
  private waiters = new Map<string, Waiter>();

  /** Resolves with the authorization code delivered for `state`; rejects on error, abort or timeout. */
  wait(state: string, signal?: AbortSignal, timeoutMs = SIGN_IN_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.waiters.delete(state);
      };
      const abort = () => { settle(); reject(new Error("OAuth sign-in cancelled")); };
      const timer = setTimeout(() => { settle(); reject(new Error("OAuth sign-in timed out")); }, timeoutMs);
      this.waiters.set(state, {
        resolve: code => { settle(); resolve(code); },
        reject: error => { settle(); reject(error); },
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  /** Delivers a redirect's query; false when no sign-in is waiting on its state. */
  complete(params: URLSearchParams): boolean {
    const waiter = this.waiters.get(params.get("state") ?? "");
    if (!waiter) return false;
    const code = params.get("code");
    if (code) waiter.resolve(code);
    else waiter.reject(new Error(`OAuth sign-in failed: ${params.get("error_description") ?? params.get("error") ?? "no authorization code"}`));
    return true;
  }
}

/** The page the browser lands on after the authorization server redirects back. */
export function oauthCallbackResponse(url: URL, redirects: OAuthRedirects): Response {
  const page = (status: number, text: string) =>
    new Response(`${text}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!redirects.complete(url.searchParams)) return page(400, "This sign-in is no longer pending in MCP Studio.");
  return url.searchParams.has("code")
    ? page(200, "Signed in. You can close this tab and return to MCP Studio.")
    : page(400, "Sign-in was not completed. Return to MCP Studio for details.");
}
