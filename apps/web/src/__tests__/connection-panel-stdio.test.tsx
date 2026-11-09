import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Collection, ConnectionConfig, ServerMessage } from "@mcp-studio/types";

vi.mock("../components/environments/environment-panel", () => ({ default: () => null }));
vi.mock("../transport/websocket-transport", () => ({
  transport: {
    isConnected: false,
    onMessage: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const { useStore } = await import("../store/index.js");
const { transport } = await import("../transport/websocket-transport.js");
const { ConnectionPanel } = await import("../components/connection/connection-panel.js");

const savedConfig: ConnectionConfig = {
  transport: "stdio",
  config: {
    command: "node",
    args: ["server.js", "--port", "4000"],
    cwd: "/srv/mcp",
    env: { API_KEY: "{{KEY}}", MODE: "dev" },
    inheritSystemEnv: false,
  },
};

const makeCollection = (): Collection => ({
  id: "col-1", name: "Collection", createdAt: 1, updatedAt: 1,
  connections: [{ id: "conn-1", collectionId: "col-1", name: "Local", connectionConfig: savedConfig, createdAt: 1, updatedAt: 1 }],
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
  useStore.setState({
    collections: [makeCollection()],
    selectedConnectionId: null,
    connectedConnectionId: null,
    connectingConnectionId: null,
    connectionStatus: "disconnected",
    connectionDrafts: {},
  });
  useStore.getState().loadConnection(makeCollection().connections[0]!);
});

afterEach(() => { vi.useRealTimers(); });

const lastPatchedConfig = () => {
  const patches = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
  return JSON.parse((patches.at(-1)![1] as RequestInit).body as string).connectionConfig as ConnectionConfig;
};

describe("STDIO form", () => {
  it("sends no PATCH for a Connection deleted during its autosave debounce", async () => {
    render(<ConnectionPanel />);
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "bun" } });
    await act(async () => { await useStore.getState().deleteConnection("col-1", "conn-1"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit | undefined)?.method);
    expect(methods).toContain("DELETE");
    expect(methods).not.toContain("PATCH");
  });

  it("shows every saved field of the selected Connection", () => {
    render(<ConnectionPanel />);
    expect(screen.getByLabelText("Command")).toHaveProperty("value", "node");
    expect(screen.getAllByLabelText(/^Argument \d+$/).map((el) => (el as HTMLInputElement).value)).toEqual(["server.js", "--port", "4000"]);
    expect(screen.getByLabelText("Working directory")).toHaveProperty("value", "/srv/mcp");
    expect(screen.getAllByLabelText(/^Environment variable name \d+$/).map((el) => (el as HTMLInputElement).value)).toEqual(["API_KEY", "MODE"]);
    expect(screen.getAllByLabelText(/^Environment variable value \d+$/).map((el) => (el as HTMLInputElement).value)).toEqual(["{{KEY}}", "dev"]);
    expect(screen.getByRole("switch", { name: "Inherit system environment" }).getAttribute("aria-checked")).toBe("false");
  });

  it("persists edits to command, args, cwd, env and inherit flag through the Connection REST route", async () => {
    render(<ConnectionPanel />);
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "bun" } });
    fireEvent.change(screen.getByLabelText("Argument 1"), { target: { value: "run.ts" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove argument 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Add argument" }));
    fireEvent.change(screen.getByLabelText("Argument 3"), { target: { value: "--verbose" } });
    fireEvent.change(screen.getByLabelText("Working directory"), { target: { value: "/tmp/work" } });
    fireEvent.change(screen.getByLabelText("Environment variable value 2"), { target: { value: "prod" } });
    fireEvent.click(screen.getByRole("button", { name: "Add environment variable" }));
    fireEvent.change(screen.getByLabelText("Environment variable name 3"), { target: { value: "EXTRA" } });
    fireEvent.change(screen.getByLabelText("Environment variable value 3"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("switch", { name: "Inherit system environment" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/collections/col-1/connections/conn-1");
    expect(lastPatchedConfig()).toEqual({
      transport: "stdio",
      config: {
        command: "bun",
        args: ["run.ts", "--port", "--verbose"],
        cwd: "/tmp/work",
        env: { API_KEY: "{{KEY}}", MODE: "prod", EXTRA: "1" },
        inheritSystemEnv: true,
      },
    });
  });

  it("round-trips: a saved config reloads into an identical form and an unchanged form does not PATCH", async () => {
    render(<ConnectionPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    const reloaded = useStore.getState().collections[0]!.connections[0]!;
    useStore.setState({ selectedConnectionId: null });
    useStore.getState().loadConnection(reloaded);
    expect(useStore.getState().stdio).toMatchObject({ command: "node", args: ["server.js", "--port", "4000"], cwd: "/srv/mcp", inheritSystemEnv: false });
    expect(useStore.getState().stdio.env).toEqual([{ key: "API_KEY", value: "{{KEY}}" }, { key: "MODE", value: "dev" }]);
  });

  it("omits cwd and blank env rows from the saved config", async () => {
    render(<ConnectionPanel />);
    fireEvent.change(screen.getByLabelText("Working directory"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add environment variable" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const saved = lastPatchedConfig();
    expect(saved.transport === "stdio" && saved.config.cwd).toBeUndefined();
    expect(saved.transport === "stdio" && saved.config.env).toEqual({ API_KEY: "{{KEY}}", MODE: "dev" });
  });

  it("Connect sends the form's command, args, cwd, env and inherit flag", async () => {
    render(<ConnectionPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(transport.connect).toHaveBeenCalledWith(savedConfig, false, "conn-1");
  });

  it("switching Connections inside the debounce window still saves the outgoing edit once", async () => {
    const second = { id: "conn-2", collectionId: "col-1", name: "Other", connectionConfig: { ...savedConfig, config: { ...savedConfig.config, command: "other" } } as ConnectionConfig, createdAt: 1, updatedAt: 1 };
    useStore.setState({ collections: [{ ...makeCollection(), connections: [...makeCollection().connections, second] }] });
    render(<ConnectionPanel />);
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "edited" } });
    act(() => useStore.getState().loadConnection(second));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const patches = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]![0]).toBe("/api/collections/col-1/connections/conn-1");
    expect(JSON.parse((patches[0]![1] as RequestInit).body as string).connectionConfig.config.command).toBe("edited");
  });

  it("is hidden for HTTP Connections", () => {
    act(() => useStore.getState().setTransport("http"));
    render(<ConnectionPanel />);
    expect(within(document.body).queryByLabelText("Working directory")).toBeNull();
  });
});

it("keeps the connection failure inline until the next Connect attempt", async () => {
  let receive!: (message: ServerMessage) => void;
  vi.mocked(transport.onMessage).mockImplementation(handler => { receive = handler; });
  render(<ConnectionPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  act(() => receive({ type: "error", code: "CONNECTION_FAILED", message: "ENOENT: /missing-mcp-command" }));
  expect(screen.getByRole("alert").textContent).toContain("ENOENT: /missing-mcp-command");
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.getByRole("alert").textContent).toContain("ENOENT");
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
});

describe("STDIO settings collapse", () => {
  const connectSelected = () => act(() => useStore.setState({ connectionStatus: "connected", connectedConnectionId: "conn-1" }));
  const summary = () => screen.getByRole("button", { name: /STDIO settings/ });

  it("is collapsed with a summary once the selected Connection is connected", () => {
    connectSelected();
    render(<ConnectionPanel />);
    expect(screen.queryByLabelText("Working directory")).toBeNull();
    expect(summary().getAttribute("aria-expanded")).toBe("false");
    expect(summary().textContent).toContain("node");
    expect(summary().textContent).toContain("3 args");
    expect(summary().textContent).toContain("2 env");
  });

  it("stays fully expanded while disconnected", () => {
    render(<ConnectionPanel />);
    expect(screen.getByLabelText("Working directory")).toBeTruthy();
    expect(summary().getAttribute("aria-expanded")).toBe("true");
  });

  it("expands from the keyboard and still autosaves edits", async () => {
    connectSelected();
    render(<ConnectionPanel />);
    summary().focus();
    expect(document.activeElement).toBe(summary());
    fireEvent.click(summary());
    expect(summary().getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByLabelText("Working directory"), { target: { value: "/tmp/x" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const saved = lastPatchedConfig();
    expect(saved.transport === "stdio" && saved.config.cwd).toBe("/tmp/x");
    fireEvent.click(summary());
    expect(screen.queryByLabelText("Working directory")).toBeNull();
  });

  it("remembers the open state per Connection", () => {
    const second = { id: "conn-2", collectionId: "col-1", name: "Other", connectionConfig: savedConfig, createdAt: 1, updatedAt: 1 };
    useStore.setState({ collections: [{ ...makeCollection(), connections: [...makeCollection().connections, second] }] });
    connectSelected();
    render(<ConnectionPanel />);
    fireEvent.click(summary());
    act(() => useStore.getState().loadConnection(second));
    expect(summary().getAttribute("aria-expanded")).toBe("true"); // conn-2 not connected: expanded by default
    act(() => useStore.getState().loadConnection(makeCollection().connections[0]!));
    expect(summary().getAttribute("aria-expanded")).toBe("true"); // conn-1 override kept
  });
});
