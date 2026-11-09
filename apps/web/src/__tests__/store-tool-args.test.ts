import { beforeEach, expect, it } from "vitest";
import type { MCPPrompt, MCPTool } from "@mcp-studio/types";
import { useStore } from "../store";

const echo: MCPTool = { name: "echo", description: "", inputSchema: { type: "object", properties: { text: { type: "string" } } } };
const ping: MCPTool = { name: "ping", description: "", inputSchema: { type: "object", properties: {} } };
const greet: MCPPrompt = { name: "greet", arguments: [{ name: "city", required: true }] };

beforeEach(() => {
  useStore.setState({
    selectedTool: null, selectedPrompt: null, toolFormValues: {}, promptArgValues: {},
    toolArgsByName: {}, promptArgsByName: {}, connectedConnectionCache: null,
  });
});

it("restores typed tool arguments when a tool is selected again", () => {
  const s = useStore.getState();
  s.selectTool(echo);
  useStore.getState().setToolFormValues({ text: "hi" });
  useStore.getState().selectTool(ping);
  expect(useStore.getState().toolFormValues).toEqual({});
  useStore.getState().selectTool(echo);
  expect(useStore.getState().toolFormValues).toEqual({ text: "hi" });
});

it("keeps the selected tool and its arguments while a prompt is used, and vice versa", () => {
  useStore.getState().selectTool(echo);
  useStore.getState().setToolFormValues({ text: "hi" });
  useStore.getState().selectPrompt(greet);
  useStore.getState().setPromptArgValues({ city: "Oslo" });
  const state = useStore.getState();
  expect(state.selectedTool).toBe(echo);
  expect(state.toolFormValues).toEqual({ text: "hi" });
  expect(state.selectedPrompt).toBe(greet);
  expect(state.promptArgValues).toEqual({ city: "Oslo" });
  useStore.getState().selectPrompt(null);
  useStore.getState().selectPrompt(greet);
  expect(useStore.getState().promptArgValues).toEqual({ city: "Oslo" });
});
