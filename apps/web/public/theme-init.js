// Apply the saved theme before first paint so reloads never flash the wrong one.
// A file, not an inline script, so the Content-Security-Policy can forbid inline scripts (ADR-0007).
// Mirrors applyTheme() in src/lib/theme.ts; default is dark.
(function () {
  var theme = "dark";
  try {
    var saved = JSON.parse(localStorage.getItem("mcp-studio-config") || "{}").theme;
    if (saved === "light" || saved === "dark" || saved === "system") theme = saved;
  } catch (e) {}
  var dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();
