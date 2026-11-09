import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { SegmentedControl } from "../components/ui/segmented-control.js";

afterEach(cleanup);

const OPTIONS = [
  { value: "stdio", label: "STDIO" },
  { value: "http", label: "HTTP" },
  { value: "sse", label: "SSE" },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("stdio");
  return (
    <SegmentedControl
      aria-label="Transport"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      options={OPTIONS}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radiogroup whose selected option is exposed as aria-checked", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Transport" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "STDIO" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "HTTP" }).getAttribute("aria-checked")).toBe("false");
  });

  it("selects on click", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "HTTP" }));
    expect(onChange).toHaveBeenCalledWith("http");
    expect(screen.getByRole("radio", { name: "HTTP" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "STDIO" }).getAttribute("aria-checked")).toBe("false");
  });

  it("moves selection with Left/Right arrows and wraps", async () => {
    render(<Harness />);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "STDIO" }));
    const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");
    // Radix moves focus on a zero-delay timeout and selects only while the arrow is still held,
    // so hold the key until the move settles, as a real keypress does.
    const press = async (key: string, expected: string) => {
      await userEvent.keyboard(`{${key}>}`);
      await waitFor(() => expect(checked(expected)).toBe("true"));
      await userEvent.keyboard(`{/${key}}`);
    };
    await press("ArrowRight", "HTTP");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "HTTP" }));
    await press("ArrowLeft", "STDIO");
    await press("ArrowLeft", "SSE");
  });

  it("is a single tab stop (roving tabindex)", async () => {
    render(
      <>
        <Harness />
        <button type="button">after</button>
      </>,
    );
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "after" }));
  });

  it("does not select disabled options", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Auth"
        value="a"
        onValueChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
