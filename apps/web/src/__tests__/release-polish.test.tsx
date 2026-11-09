import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { version } from "../../../../package.json";
import { StatusBar } from "../components/shell/status-bar";
import { useStore } from "../store";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows the package version in the status bar", () => {
  render(<StatusBar />);
  expect(screen.getByText(`MCP Studio v${version}`)).toBeTruthy();
});
it.each([0, 1, 2])("pluralizes %i Calls", (count) => {
  useStore.setState({ requestCount: count });
  render(<StatusBar />);
  expect(screen.getByText(count === 1 ? "1 call" : `${count} calls`)).toBeTruthy();
});
import { StudioView } from "../views/studio-view";
it("opens the Tools tab by default", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  useStore.setState({ transport: "stdio", connectionStatus: "disconnected" });
  render(<StudioView />);
  expect(screen.getByText("Connect to load tools")).toBeTruthy();
  expect(screen.queryByText("Connect to load prompts")).toBeNull();
});
