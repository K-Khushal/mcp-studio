import { beforeEach, expect, test, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { createOAuthFetch } from "../oauth.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
beforeEach(() => {
  vi.mocked(lookup).mockImplementation(async (host: string) => (
    [{ address: host === "internal.example" ? "10.0.0.8" : "93.184.216.34", family: 4 }]
  ) as never);
});

const privateHosts = ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "[::1]", "[fc00::1]", "[fe80::1]", "[::ffff:127.0.0.1]", "internal.example", "localhost"];
for (const path of ["/.well-known/oauth-authorization-server", "/token", "/register"]) {
  test.each(privateHosts)(`public MCP Server cannot fetch %s${path}`, async (host) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    const authFetch = createOAuthFetch(new URL("https://mcp.example/mcp"), fetch);
    await expect(authFetch(`https://${host}${path}`, { method: path === "/register" ? "POST" : "GET" })).rejects.toThrow("OAuth endpoint refused");
    expect(fetch).not.toHaveBeenCalled();
  });
}

test.each(["https://auth.example/token", "https://mcp.example/.well-known/oauth-protected-resource"])("public MCP Server can use %s", async (url) => {
  const fetch = vi.fn().mockResolvedValue(new Response("ok"));
  expect(await (await createOAuthFetch(new URL("https://mcp.example/mcp"), fetch)(url)).text()).toBe("ok");
});

test.each(["http://127.0.0.1/mcp", "https://internal.example/mcp", "http://[::1]/mcp"])("private MCP Server %s can use private OAuth endpoints", async (url) => {
  const fetch = vi.fn().mockResolvedValue(new Response("ok"));
  expect(await (await createOAuthFetch(new URL(url), fetch)("http://localhost/token")).text()).toBe("ok");
});

test.each(["file:///etc/passwd", "ftp://auth.example/token", "https://user:pass@auth.example/token"])("invalid endpoint %s never reaches fetch", async (url) => {
  const fetch = vi.fn();
  await expect(createOAuthFetch(new URL("https://mcp.example"), fetch)(url)).rejects.toThrow("OAuth endpoint refused");
  expect(fetch).not.toHaveBeenCalled();
});

test("mixed public/private DNS answers are refused for a public MCP Server", async () => {
  vi.mocked(lookup).mockImplementation(async (host: string) => (host === "mixed.example"
    ? [{ address: "93.184.216.34", family: 4 }, { address: "192.168.1.2", family: 4 }]
    : [{ address: "93.184.216.34", family: 4 }]) as never);
  const fetch = vi.fn();
  await expect(createOAuthFetch(new URL("https://mcp.example"), fetch)("https://mixed.example/token")).rejects.toThrow("OAuth endpoint refused");
  expect(fetch).not.toHaveBeenCalled();
});

test("OAuth fetch leaves redirects manual so no unchecked destination is contacted", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/token" } }));
  const response = await createOAuthFetch(new URL("https://mcp.example"), fetch)("https://auth.example/token", { redirect: "follow" });
  expect(response.status).toBe(302);
  expect(fetch).toHaveBeenCalledWith("https://auth.example/token", { redirect: "manual" });
});

test.each(["discovery", "registration", "token"])("HTTP Session refuses private %s destinations supplied by public MCP metadata", async (stage) => {
  const { StreamableHTTPClient } = await import("../streamable-http-client.js");
  const contacted: string[] = [];
  const network = vi.fn(async (input: string | Request | URL) => {
    const url = String(input);
    contacted.push(url);
    if (url === "https://mcp.example/mcp") return new Response(null, { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"' } });
    if (url.includes("oauth-protected-resource")) return Response.json({ resource: "https://mcp.example/mcp", authorization_servers: [stage === "discovery" ? "https://internal.example" : "https://mcp.example"] });
    if (url.includes("oauth-authorization-server")) return Response.json({
      issuer: "https://mcp.example", authorization_endpoint: "https://mcp.example/authorize",
      registration_endpoint: stage === "registration" ? "https://internal.example/register" : "https://mcp.example/register",
      token_endpoint: stage === "token" ? "https://internal.example/token" : "https://mcp.example/token",
      response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
    });
    if (url.endsWith("/register")) return Response.json({ client_id: "client", redirect_uris: ["http://localhost/callback"] });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", network);
  let credentials = {};
  const client = new StreamableHTTPClient({ url: "https://mcp.example/mcp", headers: {}, auth: { type: "oauth" } }, {
    oauth: { redirectUrl: "http://localhost/callback", storage: { load: async () => credentials, save: async (value) => { credentials = value; } }, authorize: async () => "code" },
  });
  try {
    await expect(client.connect()).rejects.toThrow(stage === "discovery" ? "OAuth" : "OAuth endpoint refused");
    expect(contacted.some(url => url.includes("internal.example"))).toBe(false);
  } finally {
    await client.disconnect();
    vi.unstubAllGlobals();
  }
});
