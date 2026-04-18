import { Zap } from 'lucide-react';

export function TopNav() {
  return (
    <div className="flex items-center h-11 px-4 border-b border-border bg-background shrink-0">
      <div className="flex items-center gap-2">
        <Zap size={18} className="text-primary" />
        <span className="text-sm font-bold tracking-tight text-foreground">MCP Studio</span>
        <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">v1.0</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="hover:text-foreground cursor-pointer transition-colors">Docs</span>
        <span className="hover:text-foreground cursor-pointer transition-colors">
          <a href="https://github.com/K-Khushal/mcp-studio" target="_blank" rel="noopener noreferrer">GitHub</a>
        </span>
      </div>
    </div>
  );
}
