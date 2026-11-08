import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
