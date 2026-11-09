import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startStudioServer, TEST_TOKEN, type StudioServer } from "./helpers/studio-server.js";

let studio: StudioServer;
beforeAll(async () => { studio = await startStudioServer({ STUDIO_PRODUCTION: "1" }); });
afterAll(() => studio.stop());

const cookie = () => `mcp_studio_${studio.port}=${TEST_TOKEN}`;

describe("requests without the Launch token are rejected", () => {
  for (const [method, path] of [
    ["GET", "/health"], ["GET", "/api/health"],
    ["GET", "/collections"], ["GET", "/api/collections"], ["POST", "/collections"],
    ["PATCH", "/collections/x"], ["DELETE", "/collections/x"],
    ["POST", "/collections/x/connections"], ["PATCH", "/collections/x/connections/y"], ["DELETE", "/collections/x/connections/y"],
    ["DELETE", "/collections/x/connections/y/oauth"],
    ["GET", "/environments"], ["GET", "/api/environments"], ["POST", "/environments"], ["PATCH", "/environments/x"], ["DELETE", "/environments/x"],
  ] as const) {
    test(`${method} ${path} → 401`, async () => {
      const response = await studio.request(path, { method, auth: false, ...(method === "GET" ? {} : { body: "{}" }) });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("STUDIO_APP_SHELL");
    });
  }

  test("a wrong bearer token or cookie is rejected", async () => {
    expect((await studio.request("/collections", { auth: false, headers: { Authorization: "Bearer nope" } })).status).toBe(401);
    expect((await studio.request("/collections", { auth: false, headers: { Cookie: `mcp_studio_${studio.port}=nope` } })).status).toBe(401);
    // A token cookie for another Studio port does not unlock this one.
    expect((await studio.request("/collections", { auth: false, headers: { Cookie: `mcp_studio_1=${TEST_TOKEN}` } })).status).toBe(401);
  });

  test("another local process (curl, no Origin) cannot read Environments", () => {
    const denied = Bun.spawnSync(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", `${studio.base}/environments`]);
    expect(denied.stdout.toString()).toBe("401");
    const allowed = Bun.spawnSync(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-H", `Authorization: Bearer ${TEST_TOKEN}`, `${studio.base}/environments`]);
    expect(allowed.stdout.toString()).toBe("200");
  });

  test("the /ws upgrade is rejected without the token, with or without an allowed Origin", async () => {
    for (const origin of [undefined, studio.base]) {
      const response = await studio.request("/ws", {
        auth: false,
        headers: {
          Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          ...(origin ? { Origin: origin } : {}),
        },
      });
      expect(response.status).toBe(401);
    }
    const opened = await new Promise<boolean>(resolve => {
      const ws = new WebSocket(`ws://localhost:${studio.port}/ws`);
      ws.onopen = () => { ws.close(); resolve(true); };
      ws.onerror = () => resolve(false);
    });
    expect(opened).toBe(false);
  });
});

describe("requests with the Launch token are served", () => {
  test("only bearer tokens unlock REST, including the /api alias", async () => {
    expect((await studio.request("/collections")).status).toBe(200);
    expect((await studio.request("/api/collections")).status).toBe(200);
    expect((await studio.request("/collections", { auth: false, headers: { Cookie: `other=1; ${cookie()}` } })).status).toBe(401);
  });

  test("the /ws upgrade authenticates Bearer scripts and browser subprotocols, never cookies", async () => {
    for (const [credential, allowed] of [
      [{ headers: { Authorization: `Bearer ${TEST_TOKEN}` } }, true],
      [["mcp-studio", `token.${TEST_TOKEN}`], true],
      [["mcp-studio", "token.wrong"], false],
      [[`token.${TEST_TOKEN}`], false],
      [{ headers: { Cookie: cookie() } }, false],
    ] as const) {
      const opened = await new Promise<boolean>(resolve => {
        const ws = new WebSocket(`ws://localhost:${studio.port}/ws`, credential as unknown as string[]);
        ws.onopen = () => { expect(ws.protocol).toBe(Array.isArray(credential) ? "mcp-studio" : ""); ws.close(); resolve(true); };
        ws.onerror = () => resolve(false);
      });
      expect(opened).toBe(allowed);
    }
  });

  test("the IPv6 loopback serves the same Studio", async () => {
    const response = await fetch(`http://[::1]:${studio.port}/collections`, { headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    expect(response.status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${studio.port}/collections`)).status).toBe(401);
  });
});

describe("the printed link", () => {
  test("HTML and assets are public, never exchange a query token for a cookie", async () => {
    for (const path of ["/", "/index.html", `/?token=${TEST_TOKEN}`, "/?token=wrong", "/assets/app.js"]) {
      const response = await studio.request(path, { auth: false });
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("Set-Cookie")).not.toContain(TEST_TOKEN);
    }
  });

  test("old launch cookies are expired on page load", async () => {
    const response = await studio.request("/", { auth: false, headers: { Cookie: cookie() } });
    expect(response.headers.get("Set-Cookie")).toBe(`mcp_studio_${studio.port}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/`);
  });

  test("a token in the query never authorizes a REST call", async () => {
    expect((await studio.request(`/collections?token=${TEST_TOKEN}`, { auth: false })).status).toBe(401);
  });

  test("the OAuth callback is authenticated by its state, not the cookie", async () => {
    const response = await studio.request("/oauth/callback?state=unknown&code=x", { auth: false });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("no longer pending");
  });
});

describe("security headers", () => {
  const expectHeaders = (response: Response) => {
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "img-src 'self' data: https:", "connect-src 'self' ws://localhost:*", "object-src 'none'", "base-uri 'none'"]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  };

  test("on the app HTML, static assets, API JSON, help page, 401s and the OAuth callback", async () => {
    expectHeaders(await studio.request("/"));
    expectHeaders(await studio.request("/assets/app.js"));
    expectHeaders(await studio.request("/collections"));
    expectHeaders(await studio.request("/missing"));
    expectHeaders(await studio.request("/", { auth: false }));
    expectHeaders(await studio.request("/collections", { auth: false }));
    expectHeaders(await studio.request(`/?token=${TEST_TOKEN}`, { auth: false }));
    expectHeaders(await studio.request("/oauth/callback?state=x", { auth: false }));
  });
});

describe("production errors", () => {
  test("a thrown route error returns a generic 500, never Bun's development error page", async () => {
    const response = await studio.request("/collections/missing/connections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", connectionConfig: { transport: "http", config: { url: "http://x" } } }),
    });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe("Internal error");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("an invalid JSON body is a 400", async () => {
    for (const body of ["{", "null", "[]"]) {
      const response = await studio.request("/collections", { method: "POST", body });
      expect(response.status).toBe(400);
    }
    expect(studio.alive()).toBe(true);
  });
});
