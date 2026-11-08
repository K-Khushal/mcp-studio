import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { MCPTool } from "@mcp-studio/types";
import ToolPanel from "../components/tools/tool-panel";
import { useStore } from "../store/index.js";

const tool: MCPTool = {
  name: "search",
  description: "Search things",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
      level: { type: "string", enum: ["debug", "info"] },
      tags: { type: "array", items: { type: "string" } },
    },
  },
};

const invokeTool = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  invokeTool.mockClear();
  useStore.setState({
    connectionStatus: "connected",
    selectedConnectionId: "c1",
    connectedConnectionId: "c1",
    tools: [tool],
    selectedTool: tool,
    toolFormValues: {},
    pendingParams: null,
    response: { ...useStore.getState().response, isStreaming: false },
    invokeTool,
  });
});

describe("ToolPanel Run", () => {
  it("sends the form's arguments", async () => {
    render(<ToolPanel />);

    await userEvent.type(screen.getByRole("textbox", { name: "query" }), "cats");
    await userEvent.click(screen.getByRole("button", { name: /add tags item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "tags item 1" }), "pets");
    await userEvent.click(screen.getByRole("button", { name: /run tool/i }));

    expect(invokeTool).toHaveBeenCalledWith("search", { query: "cats", tags: ["pets"] });
  });

  it("is disabled while the JSON is invalid and sends the JSON's arguments once fixed", async () => {
    render(<ToolPanel />);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });
    const run = screen.getByRole("button", { name: /run tool/i });

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query": ');
    expect(run).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid json/i);

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query":"dogs","level":"debug"}');
    expect(run).toBeEnabled();
    await userEvent.click(run);

    expect(invokeTool).toHaveBeenCalledWith("search", { query: "dogs", level: "debug" });
  });

  it("starts a fresh editor when another tool is selected", async () => {
    render(<ToolPanel />);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });
    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste("{");
    expect(screen.getByRole("button", { name: /run tool/i })).toBeDisabled();

    const other: MCPTool = { name: "ping", description: "", inputSchema: { type: "object", properties: {} } };
    useStore.setState({ selectedTool: other, tools: [tool, other], toolFormValues: {} });

    expect(await screen.findByRole("button", { name: /run tool/i })).toBeEnabled();
  });
});
