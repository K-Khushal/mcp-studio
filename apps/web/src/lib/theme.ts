import type { ThemePreference } from "@mcp-studio/types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEMES: readonly ThemePreference[] = ["dark", "light", "system"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference): "dark" | "light" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/**
 * Sets the `dark` class and `color-scheme` on <html>. Transitions are disabled for one frame so
 * every themed colour flips together instead of smearing through their individual transitions.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  const resolved = resolveTheme(preference);

  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;

  void getComputedStyle(root).opacity; // flush styles while transitions are off
  requestAnimationFrame(() => freeze.remove());
}

/** Re-applies the theme whenever the OS preference flips while the preference is "system". */
export function watchSystemTheme(getPreference: () => ThemePreference): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mql = matchMedia(DARK_QUERY);
  const onChange = () => {
    const preference = getPreference();
    if (preference === "system") applyTheme(preference);
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
