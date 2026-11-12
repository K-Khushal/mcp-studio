import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { toast } from "sonner";

const { useStore } = await import("../store/index.js");
const { AuthPanel } = await import("../components/auth/auth-panel.js");

const signOut = useStore.getState().signOut;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

beforeEach(() => {
  useStore.setState({
    signOut,
    connectedConnectionId: null,
    connectingConnectionId: null,
    selectedConnectionId: "conn-1",
    httpAuth: { type: "none" },
    collections: [{ id: "col-1", name: "Remote", createdAt: 0, updatedAt: 0, connections: [{ id: "conn-1", name: "MCP", createdAt: 0, updatedAt: 0 }] }],
  });
});

describe("AuthPanel", () => {
  it("offers none, bearer, API key and OAuth", () => {
    render(<AuthPanel />);
    expect(screen.getAllByRole("radio").map((button) => button.textContent)).toEqual(["None", "Bearer Token", "API Key", "OAuth"]);
  });

  const status = (body: object) => vi.fn(async (_url: string, init?: RequestInit) => init?.method === "DELETE" ? new Response("{}") : new Response(JSON.stringify(body)));

  it("switches the Connection to OAuth and shows the signed-in account, then signs it out", async () => {
    const success = vi.spyOn(toast, "success");
    const signOut = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", status({ signedIn: true, serverUrl: "https://mcp.example/mcp", account: { email: "dev@example.com", name: "Dev" }, scope: "read" }));
    useStore.setState({ signOut });
    render(<AuthPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "OAuth" }));
    expect(useStore.getState().httpAuth).toEqual({ type: "oauth" });

    expect(await screen.findByText("Signed in")).toBeTruthy();
    expect(screen.getByText("dev@example.com")).toBeTruthy();
    expect(screen.getByText(/mcp\.example/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith("col-1", "conn-1");
    await waitFor(() => expect(success).toHaveBeenCalledWith("Signed out", expect.any(Object)));
  });

  it("offers Sign in, not Sign out, when no tokens are stored", async () => {
    vi.stubGlobal("fetch", status({ signedIn: false }));
    useStore.setState({ httpAuth: { type: "oauth" }, connectionUrl: "https://mcp.example/mcp", transport: "http" });
    render(<AuthPanel />);
    expect(await screen.findByText("Not signed in")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("does not report successful sign-out when the Studio Server returns 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "DELETE" ? new Response("private diagnostic", { status: 500 }) : new Response(JSON.stringify({ signedIn: true }))));
    const error = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    useStore.setState({ httpAuth: { type: "oauth" } });
    render(<AuthPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("Failed to sign out", { duration: 10_000 }));
    expect(success).not.toHaveBeenCalled();
  });
});
