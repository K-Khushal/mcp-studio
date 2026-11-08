import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContentBlockRenderer } from "../components/response/content-blocks/content-block-renderer";

afterEach(cleanup);

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const WAV_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

describe("image block", () => {
  it("renders an inline preview from base64 data", () => {
    render(<ContentBlockRenderer block={{ type: "image", data: PNG_B64, mimeType: "image/png" }} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG_B64}`);
  });

  it("offers a download of the decoded image", () => {
    render(<ContentBlockRenderer block={{ type: "image", data: PNG_B64, mimeType: "image/png" }} />);
    const link = screen.getByRole("link", { name: /download/i });
    expect(link.getAttribute("href")).toBe(`data:image/png;base64,${PNG_B64}`);
    expect(link.getAttribute("download")).toBe("image.png");
  });

  it("shows the mime type and is no longer 'unsupported'", () => {
    render(<ContentBlockRenderer block={{ type: "image", data: PNG_B64, mimeType: "image/png" }} />);
    expect(screen.getByText("image/png")).toBeTruthy();
    expect(screen.queryByText(/not yet supported/i)).toBeNull();
  });
});

describe("audio block", () => {
  it("renders a player from base64 data", () => {
    const { container } = render(
      <ContentBlockRenderer block={{ type: "audio", data: WAV_B64, mimeType: "audio/wav" }} />,
    );
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio!.hasAttribute("controls")).toBe(true);
    expect(audio!.getAttribute("src")).toBe(`data:audio/wav;base64,${WAV_B64}`);
  });

  it("offers a download of the decoded audio", () => {
    render(<ContentBlockRenderer block={{ type: "audio", data: WAV_B64, mimeType: "audio/wav" }} />);
    const link = screen.getByRole("link", { name: /download/i });
    expect(link.getAttribute("href")).toBe(`data:audio/wav;base64,${WAV_B64}`);
    expect(link.getAttribute("download")).toBe("audio.wav");
  });

  it("derives the file extension from the mime subtype", () => {
    render(<ContentBlockRenderer block={{ type: "audio", data: WAV_B64, mimeType: "audio/mpeg" }} />);
    expect(screen.getByRole("link", { name: /download/i }).getAttribute("download")).toBe("audio.mp3");
  });
});
