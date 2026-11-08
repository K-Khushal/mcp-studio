import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ConnectionConfig } from "@mcp-studio/types";

const { useStore } = await import("../store/index.js");
const { SessionInfo } = await import("../components/shell/session-info.js");

const stdio: ConnectionConfig = {
  transport: "stdio",
  config: { command: "npx", args: [], env: {}, inheritSystemEnv: true },
};
const http: ConnectionConfig = { transport: "http", config: { url: "http://localhost:4000", headers: {} } };

beforeEach(() => {
  useStore.setState({
    connectionStatus: "disconnected",
    connectionConfig: null,
    serverInfo: null,
    protocolVersion: null,
  });
});

afterEach(cleanup);

describe("SessionInfo", () => {
  it("shows a neutral state when not connected", () => {
    render(<SessionInfo />);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.queryByText(/STDIO|HTTP/)).toBeNull();
  });

  it("shows server name, version, Transport, protocol version and status when connected", () => {
    useStore.setState({
      connectionStatus: "connected",
      connectionConfig: stdio,
      serverInfo: { name: "everything", version: "2.1.0" },
      protocolVersion: "2025-06-18",
    });
    render(<SessionInfo />);
    expect(screen.getByText("everything")).toBeTruthy();
    expect(screen.getByText("v2.1.0")).toBeTruthy();
    expect(screen.getByText("STDIO")).toBeTruthy();
    expect(screen.getByText("MCP 2025-06-18")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("labels an HTTP Transport", () => {
    useStore.setState({ connectionStatus: "connected", connectionConfig: http, serverInfo: { name: "remote" }, protocolVersion: "2025-03-26" });
    render(<SessionInfo />);
    expect(screen.getByText("HTTP")).toBeTruthy();
    expect(screen.queryByText(/^v\d/)).toBeNull();
  });

  it("shows connecting and failed states without server details", () => {
    useStore.setState({ connectionStatus: "connecting" });
    const { rerender } = render(<SessionInfo />);
    expect(screen.getByText("Connecting…")).toBeTruthy();

    useStore.setState({ connectionStatus: "error" });
    rerender(<SessionInfo />);
    expect(screen.getByText("Connection failed")).toBeTruthy();
  });
});
