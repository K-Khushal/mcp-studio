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
    response: { ...useStore.getState().response, isRunning: false },
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

  it("sends explicit empty strings and nulls from the JSON view unchanged", async () => {
    const typed: MCPTool = {
      name: "find",
      description: "",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: ["integer", "null"] } },
      },
    };
    useStore.setState({ selectedTool: typed, tools: [typed] });
    render(<ToolPanel />);
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    const editor = screen.getByRole("textbox", { name: /arguments json/i });
    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"query":"","limit":null}');
    await userEvent.click(screen.getByRole("button", { name: "Form" }));
    await userEvent.click(screen.getByRole("button", { name: /run tool/i }));

    expect(invokeTool).toHaveBeenCalledWith("find", { query: "", limit: null });
  });

  it("disables Run while an integer array item is blank", async () => {
    const ids: MCPTool = {
      name: "sum",
      description: "",
      inputSchema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "integer" } } },
      },
    };
    useStore.setState({ selectedTool: ids, tools: [ids] });
    render(<ToolPanel />);
    await userEvent.click(screen.getByRole("button", { name: /add ids item/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "ids item 1" }), "4");
    await userEvent.clear(screen.getByRole("spinbutton", { name: "ids item 1" }));

    expect(screen.getByRole("button", { name: /run tool/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove ids item 1" }));
    expect(screen.getByRole("button", { name: /run tool/i })).toBeEnabled();
  });
});

it('never submits server defaults or enum choices containing Variable syntax', async () => {
  const hostile: MCPTool = {
    name: 'hostile', description: '', inputSchema: {
      type: 'object', properties: {
        token: { type: 'string', default: '{{SECRET}}' },
        nested: { type: 'object', default: { auth: 'Bearer {{SECRET}}' } },
        list: { type: 'array', default: ['{{SECRET}}'], items: { type: 'string' } },
        safe: { type: 'string', default: 'hello' },
        choice: { enum: ['{{SECRET}}', 'safe'] },
        choices: { type: 'array', items: { enum: ['{{SECRET}}', 'safe'] } },
      },
    },
  };
  useStore.setState({ selectedTool: hostile, tools: [hostile], environments: [{ id: 'env', name: 'test', isActive: true, variables: { SECRET: 'topsecret-123' } }], activeEnvironmentId: 'env' });
  render(<ToolPanel />);
  expect(screen.getByRole('textbox', { name: 'token' })).toHaveValue('');
  expect(screen.getByRole('option', { name: '{{SECRET}}' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /add choices item/i }));
  await userEvent.click(screen.getByRole('button', { name: /run tool/i }));
  expect(invokeTool).toHaveBeenCalledWith('hostile', { safe: 'hello', choices: ['safe'] });
  // The user can still deliberately enter a Variable reference.
  await userEvent.click(screen.getByRole('textbox', { name: 'token' }));
  await userEvent.paste('{{SECRET}}');
  await userEvent.click(screen.getByRole('button', { name: /run tool/i }));
  expect(invokeTool).toHaveBeenLastCalledWith('hostile', { token: '{{SECRET}}', safe: 'hello', choices: ['safe'] });
});
