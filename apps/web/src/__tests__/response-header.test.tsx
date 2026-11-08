import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResponseHeader } from "../components/response/response-header";
import { formatBytes, getCopyText, getResponseSize } from "../components/response/response-copy";

afterEach(cleanup);

const baseProps = {
  activeTab: "pretty" as const,
  onTabChange: () => {},
  hasResult: true,
  hasError: false,
  isToolError: false,
  isStreaming: false,
  latencyMs: 12,
  sizeBytes: 2048,
  copyText: "hello",
};

describe("response header", () => {
  it("shows the response size", () => {
    render(<ResponseHeader {...baseProps} />);
    expect(screen.getByText("2.0 KB")).toBeTruthy();
  });

  it("copies the active representation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ResponseHeader {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(await screen.findByRole("button", { name: /copied/i })).toBeTruthy();
  });

  it("disables copy when there is nothing to copy", () => {
    render(<ResponseHeader {...baseProps} copyText={null} sizeBytes={null} />);
    const btn = screen.getByRole("button", { name: /copy/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByText(/KB|\bB\b/)).toBeNull();
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getResponseSize", () => {
  it("measures the serialized result in UTF-8 bytes", () => {
    expect(getResponseSize({ a: "é" }, null)).toBe(new TextEncoder().encode('{"a":"é"}').length);
  });
  it("measures an error string", () => {
    expect(getResponseSize(null, "boom")).toBe(4);
  });
  it("is null with nothing to measure", () => {
    expect(getResponseSize(null, null)).toBeNull();
  });
});

describe("getCopyText", () => {
  const result = { content: [{ type: "text", text: "hi" }, { type: "image", data: "AAAA", mimeType: "image/png" }] };

  it("raw tab copies the pretty-printed JSON", () => {
    expect(getCopyText("raw", result, null, null)).toBe(JSON.stringify(result, null, 2));
  });
  it("pretty tab copies text blocks, leaving binary data out", () => {
    expect(getCopyText("pretty", result, null, null)).toBe("hi\n\n[image: image/png]");
  });
  it("copies the error on both tabs", () => {
    expect(getCopyText("pretty", null, "boom", null)).toBe("boom");
    expect(getCopyText("raw", null, "boom", null)).toBe("boom");
  });
  it("headers tab copies response headers as JSON", () => {
    expect(getCopyText("headers", result, null, { a: "b" })).toBe(JSON.stringify({ a: "b" }, null, 2));
    expect(getCopyText("headers", result, null, null)).toBeNull();
  });
  it("timeline has nothing to copy", () => {
    expect(getCopyText("timeline", result, null, null)).toBeNull();
  });
});
