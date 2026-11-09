import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable.js";

afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

describe("ResizableHandle", () => {
  it("is a focusable separator with a visible focus ring", () => {
    render(
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel defaultSize={50}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>b</ResizablePanel>
      </ResizablePanelGroup>,
    );
    const handle = screen.getByRole("separator");
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.className).toContain("focus-visible:ring-2");
    expect(handle.className).not.toMatch(/focus-visible:ring-0/);
  });
});
