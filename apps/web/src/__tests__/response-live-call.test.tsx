import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "../store";
import { ResponsePanel } from "../components/response/response-panel";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("shows advancing elapsed time, progress and Cancel; timeline is available during the Call", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const cancel = vi.spyOn(useStore.getState(), "cancelCall");
  useStore.setState({
    response: { ...useStore.getState().response, requestId: "running", isRunning: true, startedAt: 1000, completedAt: null, result: null, error: null, progress: { progress: 2, total: 5, message: "Checking files" }, outcome: null },
    timeline: [{ label: "Session: initialize", detail: "MCP initialize handshake", timestamp: "00:00:00", durationMs: 12, scope: "session", status: "completed" }, { label: "Call sent", detail: "Tool: slow", timestamp: "00:00:01", durationMs: 0, status: "completed" }],
  });
  render(<ResponsePanel />);
  expect(screen.getByText("Checking files")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  expect(screen.getByText("2 / 5")).toBeTruthy();
  act(() => { vi.advanceTimersByTime(1200); });
  expect(screen.getByText("1.2s elapsed")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel Call" }));
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Timeline" }), { button: 0, ctrlKey: false });
  expect(screen.getByText("Session: initialize")).toBeTruthy();
  expect(screen.getByText("12ms")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel Call" })).toBeTruthy();
  act(() => { useStore.setState(s => ({ response: { ...s.response, isRunning: false, outcome: "cancelled", completedAt: 2200 } })); });
  expect(screen.queryByRole("button", { name: "Cancel Call" })).toBeNull();
  expect(screen.getByText("Cancelled")).toBeTruthy();
});

it("renders progress without a total and keeps cancellation available", () => {
  useStore.setState(s => ({ response: { ...s.response, isRunning: true, progress: { progress: 4 }, outcome: null } }));
  render(<ResponsePanel />);
  expect(screen.getByText("Progress: 4")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel Call" })).toBeTruthy();
});
