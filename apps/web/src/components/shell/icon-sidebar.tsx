import {
  Zap,
  BookOpen,
  ScrollText,
  Settings,
} from "lucide-react";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import type { AppState } from "@/store";

type View = AppState["activeView"];

const NAV_ITEMS: Array<{ view: View; icon: React.ElementType; label: string }> = [
  { view: "studio", icon: Zap, label: "Studio" },
  { view: "collections", icon: BookOpen, label: "Collections" },
  { view: "logs", icon: ScrollText, label: "Logs" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export function IconSidebar() {
  const { activeView, setActiveView } = useStore();

  return (
    <nav className="flex w-12 flex-col items-center gap-1 border-r border-border bg-sidebar py-3">
      {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          title={label}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            activeView === view && "bg-accent text-accent-foreground"
          )}
        >
          <Icon size={18} />
        </button>
      ))}
    </nav>
  );
}
