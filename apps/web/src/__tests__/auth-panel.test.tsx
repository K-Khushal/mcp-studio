import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useStore } = await import("../store/index.js");
const { AuthPanel } = await import("../components/auth/auth-panel.js");

afterEach(cleanup);

beforeEach(() => {
  useStore.setState({
    selectedConnectionId: "conn-1",
    httpAuth: { type: "none" },
    collections: [{ id: "col-1", name: "Remote", createdAt: 0, updatedAt: 0, connections: [{ id: "conn-1", name: "MCP", createdAt: 0, updatedAt: 0 }] }],
  });
});

describe("AuthPanel", () => {
  it("offers none, bearer, API key and OAuth", () => {
    render(<AuthPanel />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["None", "Bearer Token", "API Key", "OAuth"]);
  });

  it("switches the Connection to OAuth and signs it out", () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ signOut });
    render(<AuthPanel />);

    fireEvent.click(screen.getByRole("button", { name: "OAuth" }));
    expect(useStore.getState().httpAuth).toEqual({ type: "oauth" });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith("col-1", "conn-1");
  });
});
