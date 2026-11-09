import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders the app only for a browser holding the Launch token cookie (ADR-0007). The packaged
 * Studio Server already answers token-less page loads with its help page; this covers the Vite dev
 * server and a tab left open across a Studio Server restart (new token).
 */
export function LaunchGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "locked">("checking");

  useEffect(() => {
    fetch("/api/health").then(
      response => setState(response.status === 401 ? "locked" : "allowed"),
      () => setState("allowed"),
    );
  }, []);

  if (state === "checking") return null;
  if (state === "allowed") return children;
  return (
    <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
      <div className="max-w-md space-y-2 text-sm leading-relaxed">
        <h1 className="text-lg font-semibold">Open MCP Studio from your terminal</h1>
        <p className="text-muted-foreground">
          This Studio Server only accepts the browser it opened. Open the link printed in the terminal where you
          started MCP Studio; it looks like <code className="font-mono">http://localhost:3000/?token=…</code>
        </p>
        <p className="text-muted-foreground">Restarted MCP Studio? Each launch prints a new link.</p>
      </div>
    </main>
  );
}
