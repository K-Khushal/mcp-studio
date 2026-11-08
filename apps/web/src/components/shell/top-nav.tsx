import { Zap } from "lucide-react";
import { ConfigurationPanel } from "@/components/configuration/configuration-panel";
import { SessionInfo } from "./session-info";
import { ThemeToggle } from "./theme-toggle";

export function TopNav() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
      <div className="flex shrink-0 items-center gap-2">
        <Zap size={18} className="text-primary" />
        <span className="text-sm font-bold tracking-tight text-foreground">MCP Studio</span>
      </div>
      <div className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <SessionInfo />
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-1">
        <a
          href="https://github.com/K-Khushal/mcp-studio"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
        <ThemeToggle />
        <ConfigurationPanel />
      </div>
    </header>
  );
}
