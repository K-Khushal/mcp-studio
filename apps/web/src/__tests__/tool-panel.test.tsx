import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    await userEvent.click(screen.getByRole("button", { name: /add item to tags/i }));
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
    await userEvent.click(screen.getByRole("button", { name: /add item to ids/i }));
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
  await userEvent.click(screen.getByRole('button', { name: /add item to choices/i }));
  await userEvent.click(screen.getByRole('button', { name: /run tool/i }));
  expect(invokeTool).toHaveBeenCalledWith('hostile', { safe: 'hello', choices: ['safe'] });
  // The user can still deliberately enter a Variable reference.
  await userEvent.click(screen.getByRole('textbox', { name: 'token' }));
  await userEvent.paste('{{SECRET}}');
  await userEvent.click(screen.getByRole('button', { name: /run tool/i }));
  expect(invokeTool).toHaveBeenLastCalledWith('hostile', { token: '{{SECRET}}', safe: 'hello', choices: ['safe'] });
});

describe('ToolPanel required arguments and run shortcut', () => {
  it('blocks Run until required arguments are filled and says which are missing', async () => {
    render(<ToolPanel />);
    const run = screen.getByRole('button', { name: 'Run Tool' });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription('Required: query');
    await userEvent.type(screen.getByRole('textbox', { name: 'query' }), 'cats');
    expect(run).toBeEnabled();
    expect(run).not.toHaveAccessibleDescription();
  });

  it('puts Run in the header row beside the tool title', () => {
    render(<ToolPanel />);
    expect(screen.getByRole('heading', { name: 'search' }).parentElement).toContainElement(screen.getByRole('button', { name: 'Run Tool' }));
  });

  it('runs on Ctrl+Enter and Cmd+Enter from a field', async () => {
    render(<ToolPanel />);
    const query = screen.getByRole('textbox', { name: 'query' });
    await userEvent.type(query, 'cats');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(invokeTool).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(invokeTool).toHaveBeenCalledTimes(2);
    await userEvent.keyboard('{Enter}');
    expect(invokeTool).toHaveBeenCalledTimes(2);
  });

  it('shows an inline error and focuses the field when the shortcut is blocked', async () => {
    render(<ToolPanel />);
    const query = screen.getByRole('textbox', { name: 'query' });
    expect(query).not.toBeInvalid();
    await userEvent.click(screen.getByRole('textbox', { name: 'query' }));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(invokeTool).not.toHaveBeenCalled();
    expect(query).toBeInvalid();
    expect(query).toHaveFocus();
    expect(query).toHaveAccessibleDescription(/Required/);
  });

  it('links field descriptions and shows the default as a labelled placeholder', () => {
    const described: MCPTool = { name: 'dated', description: '', inputSchema: { type: 'object', required: ['day'], properties: { day: { type: 'string', description: 'ISO date', default: '2026-01-01' } } } };
    useStore.setState({ selectedTool: described, tools: [described] });
    render(<ToolPanel />);
    const day = screen.getByRole('textbox', { name: 'day' });
    expect(day).toHaveAccessibleDescription('ISO date');
    expect(day).toHaveAttribute('aria-required', 'true');
    expect(day).toHaveAttribute('placeholder', 'default: 2026-01-01');
    expect(screen.queryByLabelText('required')).not.toBeInTheDocument();
  });

  it('keeps the selected tool and typed arguments after visiting another tool', async () => {
    const other: MCPTool = { name: 'ping', description: '', inputSchema: { type: 'object', properties: { host: { type: 'string' } } } };
    useStore.setState({ tools: [tool, other], toolArgsByName: {} });
    render(<ToolPanel />);
    await userEvent.type(screen.getByRole('textbox', { name: 'query' }), 'cats');
    await userEvent.click(screen.getByRole('button', { name: /^ping/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'host' }), 'example.com');
    await userEvent.click(screen.getByRole('button', { name: /^search/ }));
    expect(screen.getByRole('textbox', { name: 'query' })).toHaveValue('cats');
    await userEvent.click(screen.getByRole('button', { name: /^ping/ }));
    expect(screen.getByRole('textbox', { name: 'host' })).toHaveValue('example.com');
  });
});

describe('ToolList density and selection', () => {
  const annotated: MCPTool = {
    name: 'wipe', description: 'Delete everything', inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  };

  it('marks the selected tool and lists only the Destructive badge', () => {
    useStore.setState({ tools: [annotated, tool], selectedTool: annotated, toolFormValues: {} });
    render(<ToolPanel />);
    const item = screen.getByRole('button', { name: /^wipe/ });
    expect(item).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /^search/ })).not.toHaveAttribute('aria-current');
    expect(within(item).getByText('Destructive')).toBeInTheDocument();
    expect(within(item).queryByText('Idempotent')).not.toBeInTheDocument();
    expect(within(item).queryByText('Closed-world')).not.toBeInTheDocument();
    // The detail header keeps every hint.
    expect(screen.getAllByText('Idempotent')).toHaveLength(1);
    expect(screen.getAllByText('Closed-world')).toHaveLength(1);
  });
});

describe('required composite arguments', () => {
  for (const [name, prop, targetRole, targetName] of [
    ['labels', { type: 'array', items: { type: 'string' }, description: 'Labels help' }, 'button', 'Add item to labels'],
    ['options', { type: 'object', properties: { city: { type: 'string' } }, description: 'Options help' }, 'textbox', 'city'],
    ['payload', { anyOf: [{ type: 'string' }, { type: 'number' }], description: 'Payload help' }, 'textbox', 'payload'],
  ] as const) {
    it(`announces and focuses missing ${name} on repeated blocked shortcuts`, async () => {
      const composite: MCPTool = { name: 'composite', description: '', inputSchema: { type: 'object', required: [name], properties: { [name]: prop, other: { type: 'string' } } } };
      useStore.setState({ selectedTool: composite, tools: [composite], toolFormValues: {} });
      render(<ToolPanel />);
      const target = screen.getByRole(targetRole, { name: targetName });
      const other = screen.getByRole('textbox', { name: 'other' });
      if (name === 'labels') expect(target).toHaveAccessibleDescription('Labels help Required');
      for (let i = 0; i < 2; i++) {
        await userEvent.click(other);
        await userEvent.keyboard('{Control>}{Enter}{/Control}');
        expect(target).toHaveFocus();
      }
      expect(invokeTool).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Run Tool' })).toBeDisabled();
      if (name === 'payload') {
        expect(target).toHaveAttribute('aria-required', 'true');
        expect(target).toBeInvalid();
        expect(target).toHaveAccessibleDescription('Payload help Required');
      } else {
        const group = screen.getByRole('group', { name: new RegExp(name) });
        expect(group).toHaveAttribute('aria-invalid', 'true');
        expect(group).toHaveAccessibleDescription(`${name === 'labels' ? 'Labels' : 'Options'} help Required`);
      }
    });
  }
});

it('announces all missing JSON arguments and focuses the editor on a blocked shortcut', async () => {
  render(<ToolPanel />);
  await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
  const editor = screen.getByRole('textbox', { name: 'Arguments JSON' });
  await userEvent.click(editor);
  await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
  expect(editor).toBeInvalid();
  expect(editor).toHaveAccessibleDescription('Required: query');
  expect(editor).toHaveFocus();
  expect(invokeTool).not.toHaveBeenCalled();
  await userEvent.clear(editor);
  await userEvent.paste('{"query":"cats"}');
  expect(editor).not.toBeInvalid();
  expect(editor).not.toHaveAccessibleDescription();
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  expect(invokeTool).toHaveBeenCalledWith('search', { query: 'cats' });
});
