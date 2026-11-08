import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONFIG_KEY = "mcp-studio-config";

type MediaListener = (e: { matches: boolean }) => void;

function stubSystemTheme(prefersDark: boolean) {
  const listeners = new Set<MediaListener>();
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, l: MediaListener) => listeners.add(l),
    removeEventListener: (_: string, l: MediaListener) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    flip(next: boolean) {
      mql.matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
  };
}

async function freshStore() {
  vi.resetModules();
  return (await import("../store/index.js")).useStore;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  stubSystemTheme(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings persistence", () => {
  it("defaults to dark theme, 30s timeout, auto-scroll on, verbose off", async () => {
    const store = await freshStore();
    expect(store.getState().config).toEqual({
      requestTimeout: 30,
      autoScrollLogs: true,
      verboseLogging: false,
      theme: "dark",
    });
  });

  it("restores saved settings after reload", async () => {
    const first = await freshStore();
    first.getState().setConfig({ theme: "light", requestTimeout: 90, autoScrollLogs: false, verboseLogging: true });

    const reloaded = await freshStore();
    expect(reloaded.getState().config).toEqual({
      requestTimeout: 90,
      autoScrollLogs: false,
      verboseLogging: true,
      theme: "light",
    });
  });

  it("drops retired fields from a legacy saved config", async () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ requestTimeout: 45, streamResponses: false, showReasoning: false, showTimeline: false, theme: "system" }),
    );
    const store = await freshStore();
    expect(store.getState().config).toEqual({
      requestTimeout: 45,
      autoScrollLogs: true,
      verboseLogging: false,
      theme: "system",
    });
  });

  it("falls back to defaults for corrupt or invalid saved values", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ theme: "neon", requestTimeout: "soon" }));
    const store = await freshStore();
    expect(store.getState().config.theme).toBe("dark");
    expect(store.getState().config.requestTimeout).toBe(30);

    localStorage.setItem(CONFIG_KEY, JSON.stringify({ requestTimeout: 1.5 }));
    const fractional = await freshStore();
    expect(fractional.getState().config.requestTimeout).toBe(30);

    localStorage.setItem(CONFIG_KEY, "{not json");
    const again = await freshStore();
    expect(again.getState().config.theme).toBe("dark");
  });
});

describe("theme", () => {
  it("applies the saved theme on load", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ theme: "light" }));
    await freshStore();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    localStorage.setItem(CONFIG_KEY, JSON.stringify({ theme: "dark" }));
    await freshStore();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("switches the root class when the theme setting changes", async () => {
    const store = await freshStore();
    store.getState().setConfig({ theme: "light" });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    store.getState().setConfig({ theme: "dark" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("follows the OS preference in system mode, live", async () => {
    const os = stubSystemTheme(true);
    const store = await freshStore();
    store.getState().setConfig({ theme: "system" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    os.flip(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    os.flip(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores OS changes when a fixed theme is chosen", async () => {
    const os = stubSystemTheme(true);
    const store = await freshStore();
    store.getState().setConfig({ theme: "light" });
    os.flip(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
