import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useStore } = await import("../store/index.js");
const { ConfigurationPanel } = await import("../components/configuration/configuration-panel.js");
const { TooltipProvider } = await import("../components/ui/tooltip.js");

afterEach(cleanup);

describe("ConfigurationPanel request timeout", () => {
  it("only persists positive integers", () => {
    useStore.getState().setConfig({ requestTimeout: 30 });
    render(
      <TooltipProvider>
        <ConfigurationPanel />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const input = screen.getByLabelText("Request timeout in seconds");

    fireEvent.change(input, { target: { value: "1.5" } });
    expect(useStore.getState().config.requestTimeout).toBe(30);

    fireEvent.change(input, { target: { value: "45" } });
    expect(useStore.getState().config.requestTimeout).toBe(45);
  });
});
