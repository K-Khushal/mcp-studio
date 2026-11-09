/** Browser and Studio Server share the same approval URL policy. */
export function isSafeOAuthUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const loopback = url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      url.hostname === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
    return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && loopback));
  } catch {
    return false;
  }
}
