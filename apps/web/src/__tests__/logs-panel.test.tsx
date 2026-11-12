import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useStore } = await import("../store/index.js");
const { LogsPanel } = await import("../components/logs/logs-panel.js");

const logs = Array.from({ length: 40 }, (_, i) => ({
  id: `log_${i}`,
  level: "INFO" as const,
  source: "protocol" as const,
  message: `line ${i}`,
  timestamp: i,
}));

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
  useStore.setState({ logs, isLogsCollapsed: false, logsHeight: 208 });
  useStore.getState().setConfig({ autoScrollLogs: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const list = () => screen.getByText("line 0").closest(".overflow-y-auto") as HTMLElement;

describe("LogsPanel", () => {
  it("follows new lines when auto-scroll is on", () => {
    render(<LogsPanel />);
    expect(list().scrollTop).toBe(900);
  });

  it("keeps following once the buffer is full and length stops changing", () => {
    render(<LogsPanel />);
    const el = list();
    el.scrollTop = 0;
    const shifted = [...logs.slice(1), { ...logs[0]!, id: "log_40", message: "line 40" }];
    act(() => useStore.setState({ logs: shifted }));
    expect(el.scrollTop).toBe(900);
  });

  it("stays put when auto-scroll is off", () => {
    useStore.getState().setConfig({ autoScrollLogs: false });
    render(<LogsPanel />);
    expect(list().scrollTop).toBe(0);
  });

  it("resizes from the keyboard", () => {
    vi.stubGlobal("innerHeight", 1000);
    render(<LogsPanel />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize logs panel" }), { key: "ArrowUp" });
    expect(useStore.getState().logsHeight).toBe(232);
    vi.unstubAllGlobals();
  });
});

describe("LogsPanel source, level and search filters", () => {
  const mixed = [
    { id: "a", level: "DEBUG" as const, source: "protocol" as const, message: "→ tools/call #2", timestamp: 1, payload: { direction: "out" as const, method: "tools/call", id: 2, body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo" } } } },
    { id: "b", level: "INFO" as const, source: "server" as const, message: "[db] ready", timestamp: 2 },
    { id: "c", level: "ERROR" as const, source: "server" as const, message: "[db] crashed", timestamp: 3 },
    { id: "d", level: "INFO" as const, source: "studio" as const, message: "Connected", timestamp: 4 },
  ];
  const visible = () => screen.queryAllByText(/tools\/call #2|\[db\]|Connected/).map((n) => n.textContent);

  beforeEach(() => useStore.setState({ logs: mixed }));

  it("filters by source", () => {
    render(<LogsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    expect(visible()).toEqual(["[db] ready", "[db] crashed"]);
    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    expect(visible()).toHaveLength(4);
  });

  it("combines source with level and search", () => {
    render(<LogsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    fireEvent.click(screen.getByRole("button", { name: "ERROR" }));
    expect(visible()).toEqual(["[db] crashed"]);
    fireEvent.click(screen.getByRole("button", { name: "ERROR" }));
    fireEvent.change(screen.getByPlaceholderText("Filter logs..."), { target: { value: "ready" } });
    expect(visible()).toEqual(["[db] ready"]);
    fireEvent.click(screen.getByRole("button", { name: "Studio" }));
    expect(visible()).toEqual([]);
  });

  it("searches inside a structured payload", () => {
    render(<LogsPanel />);
    fireEvent.change(screen.getByPlaceholderText("Filter logs..."), { target: { value: "echo" } });
    expect(visible()).toEqual(["→ tools/call #2"]);
  });

  it("expands a JSON-RPC entry to show its body, and collapses it again", () => {
    render(<LogsPanel />);
    const row = screen.getByRole("button", { name: /tools\/call #2/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/"jsonrpc": "2.0"/)).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(row.getAttribute("aria-controls")!)!.textContent).toContain('"name": "echo"');
    fireEvent.click(row);
    expect(screen.queryByText(/"jsonrpc": "2.0"/)).toBeNull();
  });

  it("shows a truncated body as its raw JSON text, not a quoted string", () => {
    useStore.setState({ logs: [{ id: "t", level: "DEBUG", source: "protocol", message: "← tools/call #3", timestamp: 0,
      payload: { direction: "in", method: "tools/call", id: 3, body: '{"jsonrpc":"2.0","id":3,"result":{"text":"aa [truncated, 20000 bytes]', truncated: true } }] });
    render(<LogsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /tools\/call #3/ }));
    expect(document.getElementById("log-detail-t")?.textContent).toBe('{"jsonrpc":"2.0","id":3,"result":{"text":"aa [truncated, 20000 bytes]');
  });

  it("renders plain entries without an expander", () => {
    render(<LogsPanel />);
    expect(screen.queryByRole("button", { name: /Connected/ })).toBeNull();
  });
});


describe("LogsPanel long messages", () => {
  it("collapses a multiline stderr object to its first line and expands it pretty-printed", () => {
    useStore.setState({ logs: [{ id: "m", level: "INFO", source: "server", message: '[1] {\n  "id": 0,\n  "method": "initialize"\n}', timestamp: 0 }] });
    render(<LogsPanel />);
    const row = screen.getByRole("button", { name: /\[1\] \{/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("+3 lines")).toBeTruthy();
    fireEvent.click(row);
    expect(document.getElementById("log-detail-m")?.textContent).toBe('[1] {\n  "id": 0,\n  "method": "initialize"\n}');
  });
});
