import type { LucideIcon } from 'lucide-react';

/** Centered icon + message + optional hint, shared by empty panels. */
export function PanelEmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string | undefined }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon size={20} aria-hidden className="text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
