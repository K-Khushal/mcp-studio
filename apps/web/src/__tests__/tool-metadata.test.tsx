import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { ToolIcon } from "../components/tools/tool-metadata";
import ToolPanel from "../components/tools/tool-panel";
import { useStore } from "../store";
import type { MCPTool } from "@mcp-studio/types";

afterEach(cleanup);
const tool: MCPTool = {
  name: "structured", title: "Structured answer", description: "Returns an answer",
  icons: [{ src: "https://example.com/tool.png" }],
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: { type: "object" },
  outputSchema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"] },
};
it("shows the tool title, icon, explicit annotation hints and output schema", async () => {
  useStore.setState({ connectionStatus: "connected", selectedConnectionId: "c", connectedConnectionId: "c", tools: [tool], selectedTool: tool, toolFormValues: {}, toolSearch: "", pendingParams: null });
  render(<ToolPanel />);
  const row = screen.getByRole("button", { name: /Structured answer/ });
  // List rows stay compact: only Destructive hints show; the detail header lists them all.
  expect(within(row).queryByText("Read-only")).not.toBeInTheDocument();
  expect(screen.getAllByText("Read-only")).toHaveLength(1);
  expect(within(row).getByRole("img", { name: "Structured answer icon" })).toHaveAttribute("src", "https://example.com/tool.png");
  expect(screen.getByRole("heading", { name: "Structured answer" })).toBeVisible();
  for (const label of ["Non-destructive", "Idempotent", "Closed-world"]) expect(screen.getAllByText(label)).toHaveLength(1);
  await userEvent.click(screen.getByText("Output schema"));
  expect(screen.getByText(/"answer":/)).toBeVisible();
  await userEvent.type(screen.getByPlaceholderText("Filter tools..."), "Structured answer");
  expect(screen.getByRole("button", { name: /Structured answer/ })).toBeVisible();
});
it("falls back to the name and omits unspecified hints", () => {
  const plain: MCPTool = { name: "ping", description: "", inputSchema: {} };
  useStore.setState({ connectionStatus: "connected", selectedConnectionId: "c", connectedConnectionId: "c", tools: [plain], selectedTool: plain, toolFormValues: {}, toolSearch: "", pendingParams: null });
  render(<ToolPanel />);
  expect(screen.getByRole("heading", { name: "ping" })).toBeVisible();
  expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
});

it("rejects insecure HTTP icon sources", () => {
  render(<ToolIcon tool={{ ...tool, icons: [{ src: "http://example.com/tool.png" }] }} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
