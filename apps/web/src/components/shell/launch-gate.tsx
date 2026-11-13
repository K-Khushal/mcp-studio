import { useEffect, useState, type ReactNode } from "react";

import { consumeLaunchToken, onAccessDenied, studioFetch } from "../../lib/studio-access";
import { LogoMark } from "./logo-mark";

/** Mount the app only after checking the origin's Launch token (ADR-0007). */
export function LaunchGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "locked">("checking");

  useEffect(() => {
    const consumed = consumeLaunchToken();
    let active = true;
    let locked = false;
    const unsubscribe = onAccessDenied(() => {
      locked = true;
      if (active) setState("locked");
    });
    const check = () => {
      studioFetch("/api/health").then(
        response => {
          if (!active) return;
          if (response.ok) locked = false;
          if (!locked) setState("allowed");
        },
        () => { if (active && !locked) setState("allowed"); },
      );
    };
    void consumed.then(check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === "mcp-studio.launch-token" || event.key === null) check();
    };
    window.addEventListener("storage", storageChanged);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  if (state === "checking") return null;
  if (state === "allowed") return children;
  return (
    <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
      <div className="max-w-md space-y-2 text-sm leading-relaxed">
        <LogoMark size={32} className="mb-4" />
        <h1 className="text-lg font-semibold">Open MCP Studio from your terminal</h1>
        <p className="text-muted-foreground">
          This Studio Server requires its launch link. Open the link printed in the terminal where you
          started MCP Studio; it looks like <code className="font-mono">http://localhost:3000/?token=…</code>
        </p>
        <p className="text-muted-foreground">Restarted MCP Studio? Each launch prints a new link.</p>
      </div>
    </main>
  );
}
