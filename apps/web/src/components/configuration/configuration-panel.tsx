import { useState } from "react";
import { Settings } from "lucide-react";
import type { ThemePreference } from "@mcp-studio/types";
import { useStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

/** Settings dialog. Every control applies immediately and persists; there is no save step. */
export function ConfigurationPanel() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const [timeoutDraft, setTimeoutDraft] = useState<string | null>(null);

  return (
    <Dialog onOpenChange={() => setTimeoutDraft(null)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Settings"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
            >
              <Settings size={16} />
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Settings
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md gap-0 bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Settings</DialogTitle>
          <DialogDescription className="text-xs">Changes apply immediately.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 divide-y divide-border">
          <Row label="Call timeout" hint="Seconds to wait for a Call before giving up.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label="Call timeout in seconds"
              value={timeoutDraft ?? String(config.requestTimeout)}
              onChange={(e) => {
                setTimeoutDraft(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n > 0) setConfig({ requestTimeout: n });
              }}
              onBlur={() => setTimeoutDraft(null)}
              className="h-8 w-20 font-mono text-xs tabular-nums"
            />
          </Row>
          <Row label="Auto-scroll logs" hint="Follow new log lines as they arrive.">
            <Switch
              aria-label="Auto-scroll logs"
              checked={config.autoScrollLogs}
              onCheckedChange={(v) => setConfig({ autoScrollLogs: v })}
            />
          </Row>
          <Row label="Verbose logging" hint="Log every JSON-RPC message sent and received.">
            <Switch
              aria-label="Verbose logging"
              checked={config.verboseLogging}
              onCheckedChange={(v) => setConfig({ verboseLogging: v })}
            />
          </Row>
          <Row label="Theme" hint="System follows your OS.">
            <SegmentedControl aria-label="Theme" value={config.theme} onValueChange={(theme) => setConfig({ theme })} options={THEME_OPTIONS} />
          </Row>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}
