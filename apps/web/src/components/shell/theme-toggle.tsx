import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@mcp-studio/types";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ORDER: ThemePreference[] = ["dark", "light", "system"];
const ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
const LABELS = { dark: "Dark", light: "Light", system: "System" } as const;

/** Cycles dark → light → system. Icons cross-fade; reduced motion keeps the opacity fade only. */
export function ThemeToggle() {
  const theme = useStore((s) => s.config.theme);
  const setConfig = useStore((s) => s.setConfig);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setConfig({ theme: next })}
          aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next]}`}
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
        >
          {ORDER.map((t) => {
            const Icon = ICONS[t];
            return (
              <Icon
                key={t}
                size={16}
                aria-hidden
                className={cn(
                  "absolute transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  t === theme
                    ? "opacity-100 scale-100 blur-0"
                    : "opacity-0 scale-[0.25] blur-[4px] motion-reduce:scale-100 motion-reduce:blur-0",
                )}
              />
            );
          })}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        Theme: {LABELS[theme]}
      </TooltipContent>
    </Tooltip>
  );
}
