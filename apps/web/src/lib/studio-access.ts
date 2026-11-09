/** The browser origin (including the port) owns this Launch token; cookies cannot provide that isolation. */
const deniedListeners = new Set<() => void>();

export function onAccessDenied(listener: () => void): () => void {
  deniedListeners.add(listener);
  return () => { deniedListeners.delete(listener); };
}

const TOKEN_KEY = "mcp-studio.launch-token";

let tokenConsumption: Promise<void> | undefined;

export function consumeLaunchToken(): Promise<void> {
  // StrictMode may repeat the mount effect while the candidate is still being checked.
  if (tokenConsumption) return tokenConsumption;
  const url = new URL(location.href);
  const token = url.searchParams.get("token");
  if (token === null) return Promise.resolve();
  // Clean even an invalid link; never leave a credential in the address bar or this history entry.
  url.searchParams.delete("token");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return Promise.resolve();
  // A navigation from another site is only a candidate, not permission to replace our credential.
  tokenConsumption = fetch("/api/health", { headers: { authorization: `Bearer ${token}` } })
    .then(response => { if (response.ok) localStorage.setItem(TOKEN_KEY, token); })
    .catch(() => { /* Keep the stored credential when the Studio Server is unreachable. */ })
    .finally(() => { tokenConsumption = undefined; });
  return tokenConsumption;
}

export function launchToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Only relative Studio API paths may carry the launch credential. */
export async function studioFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith("/api/")) throw new Error("Expected a relative Studio API path");
  const token = launchToken();
  let options = init;
  if (token) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    options = { ...init, headers: Object.fromEntries(headers) };
  }
  const response = await (options === undefined ? fetch(path) : fetch(path, options));
  if (response.status === 401) for (const listener of deniedListeners) listener();
  return response;
}
