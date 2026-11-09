import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("tools");
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList aria-label="Workspace">
        <TabsTrigger value="tools">Tools</TabsTrigger>
        <TabsTrigger value="prompts">Prompts</TabsTrigger>
      </TabsList>
      <TabsContent value="tools">tools panel</TabsContent>
      <TabsContent value="prompts">prompts panel</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes tablist/tab roles with aria-selected on the active tab", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Workspace" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Tools" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Prompts" }).getAttribute("aria-selected")).toBe("false");
  });

  it("links the active tab to its tabpanel", () => {
    render(<Harness />);
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toBe("tools panel");
    expect(screen.getByRole("tab", { name: "Tools" }).getAttribute("aria-controls")).toBe(panel.id);
  });

  it("switches on click and with arrow keys", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Prompts" }));
    expect(screen.getByRole("tab", { name: "Prompts" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("prompts panel");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Tools" }).getAttribute("aria-selected")).toBe("true");
  });
});
