/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: Vitest strips CSS from `?raw` imports.
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `missing ${selector} block`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start));
}

const light = block(":root");
const dark = block(".dark");

function token(scope: string, name: string): string {
  const m = scope.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(m, `missing --${name}`).not.toBeNull();
  return m![1]!.trim();
}

type Rgb = [number, number, number];

function oklchToRgb(value: string): Rgb {
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  expect(m, `unsupported colour ${value}`).not.toBeNull();
  const [L, C, h] = [Number(m![1]), Number(m![2]), Number(m![3])];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: Rgb = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  // sRGB-encoded (browsers blend alpha in this space), clamped to gamut.
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return lin.map((v) => Math.min(1, Math.max(0, enc(v)))) as Rgb;
}

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const mixSrgb = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as Rgb;

function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Tints the app actually paints behind these text colours (bg-primary/15, bg-destructive/15 light and /20 dark, bg-success/15).
const TINT: Record<string, Record<string, number>> = {
  light: { primary: 0.15, success: 0.15, destructive: 0.15 },
  dark: { primary: 0.15, success: 0.15, destructive: 0.2 },
};

const themes = { light, dark } as const;

describe.each(Object.entries(themes))("%s theme tokens", (theme, scope) => {
  const c = (n: string) => oklchToRgb(token(scope, n));
  const bg = c("background");

  it("focus ring meets 3:1 non-text contrast (WCAG 1.4.11)", () => {
    expect(contrast(c("ring"), bg)).toBeGreaterThanOrEqual(3);
  });

  it("form-field border meets 3:1 non-text contrast", () => {
    expect(contrast(c("input"), bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(["primary-text", "success-text", "destructive-text"])("--%s meets 4.5:1 on the page and on tinted rows", (name) => {
    const fg = c(name);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, c("muted"))).toBeGreaterThanOrEqual(4.5);
    const base = name.replace("-text", "");
    expect(contrast(fg, mixSrgb(c(base), bg, TINT[theme]![base]!))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["syntax-key", "syntax-string", "syntax-number", "syntax-boolean"])("--%s meets 4.5:1 on the page and muted surface", (name) => {
    expect(contrast(c(name), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c(name), c("muted"))).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text meets 4.5:1 on the muted surface", () => {
    expect(contrast(c("muted-foreground"), c("muted"))).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text meets 4.5:1 on a selected (primary-tinted) row", () => {
    expect(contrast(c("muted-foreground"), mixSrgb(c("primary"), bg, TINT[theme]!.primary!))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("index.css", () => {
  it("does not wrap oklch tokens in hsl() (invalid scrollbar colour, F1)", () => {
    expect(css).not.toMatch(/hsl\(var\(--/);
  });

  it("paints the scrollbar thumb with valid theme colours (resting and hover)", () => {
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*{[^}]*background:\s*color-mix\(in oklab, var\(--muted-foreground\)/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover\s*{\s*background:\s*var\(--muted-foreground\)/);
  });

  it("neutralises enter/exit zoom and slide under prefers-reduced-motion, keeping the fade (F5)", () => {
    const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/);
    expect(m, "missing reduced-motion block").not.toBeNull();
    for (const v of [
      "--tw-enter-scale",
      "--tw-exit-scale",
      "--tw-enter-translate-x",
      "--tw-enter-translate-y",
      "--tw-exit-translate-x",
      "--tw-exit-translate-y",
    ]) {
      expect(m![1]).toMatch(new RegExp(`${v}:\\s*(1|0)\\b`));
    }
    expect(m![1]).not.toMatch(/--tw-enter-opacity/);
  });
});

describe("components", () => {
  const sources = import.meta.glob<string>("../components/**/*.tsx", { query: "?raw", import: "default", eager: true });
  const files = Object.entries(sources).map(([path, src]) => [path.replace("../", ""), src] as const);

  it("scans the real component sources", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.every(([, src]) => src.length > 0)).toBe(true);
  });

  it("gates looping animations behind motion-safe", () => {
    const offenders = files.filter(([, src]) => /(?<![:\w-])animate-(spin|pulse)\b/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("uses a full-opacity focus ring", () => {
    const offenders = files.filter(([, src]) => /ring-ring\/\d+/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("does not animate every property with transition-all", () => {
    const offenders = files.filter(([, src]) => /transition-all/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("uses contrast-safe text tokens instead of raw primary/success/destructive text colours", () => {
    const offenders = files
      .filter(([, src]) => /(?<![\w-])(?:[\w:-]+:)?text-(?:primary|success|destructive)(?![\w-])/.test(src))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("takes JSON syntax colours from theme tokens, not dark-only palette classes", () => {
    const offenders = files.filter(([, src]) => /text-(?:emerald|amber|sky|rose|green)-\d{3}/.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe("production sources", () => {
  const sources = import.meta.glob<string>(
    ["../**/*.{ts,tsx}", "!../**/__tests__/**", "!../**/*.{test,spec}.{ts,tsx}"],
    { query: "?raw", import: "default", eager: true },
  );
  const files = Object.entries(sources).map(([path, src]) => [path.replace("../", ""), src] as const);

  it("scans production sources across the app", () => {
    expect(files.map(([path]) => path)).toEqual(expect.arrayContaining([
      "App.tsx",
      "pages/home.tsx",
      "views/studio-view.tsx",
      "lib/utils.ts",
      "components/ui/button.tsx",
    ]));
    expect(files.every(([path, src]) => !/(?:__tests__\/|\.(?:test|spec)\.)/.test(path) && src.length > 0)).toBe(true);
  });

  it("keeps all UI text at 12px or larger, including monospace metadata", () => {
    const offenders = files.flatMap(([p, src]) =>
      src
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) =>
          [...line.matchAll(/text-\[(?:length:)?(\d*\.?\d+)(px|rem|em)\]/g)]
            .some((m) => Number(m[1]) * (m[2] === "px" ? 1 : 16) < 12),
        )
        .map(([n]) => `${p}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
